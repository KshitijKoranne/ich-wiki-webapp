import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import wikiData from "@/lib/wiki-data.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ── Lazy Redis ──────────────────────────────────────────────────── */
let redis: Redis | null = null;
let redisInitTried = false;

function getRedis(): Redis | null {
  if (redis) return redis;
  if (redisInitTried) return null;
  redisInitTried = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url?.startsWith("https://") || !token) return null;

  try {
    redis = new Redis({ url, token });
    return redis;
  } catch (e) {
    console.warn("Redis init failed:", (e as Error).message);
    return null;
  }
}

/* ── Normalize query for cache key ───────────────────────────────── */
function normalizeQuery(q: string): string {
  const stopWords = new Set([
    "what", "is", "the", "a", "an", "are", "for", "of", "in", "to",
    "and", "or", "per", "by", "on", "at", "do", "does", "how", "which",
    "can", "you", "me", "tell", "about", "please", "explain", "describe",
    "give", "show", "list", "ich", "guideline", "guidelines", "according",
  ]);
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w))
    .sort()
    .join(" ");
}

/* ── Wiki context (precomputed) ──────────────────────────────────── */
const data = wikiData as any;

const guidelineCtx = Object.values(data.guidelines as Record<string, any>)
  .map((g: any) => `## ${g.guideline} — ${g.title}\n${g.summary}\n${(g.key_requirements || "").slice(0, 1500)}`)
  .join("\n\n---\n\n");

const conceptCtx = Object.values(data.concepts as Record<string, any>)
  .map((c: any) => `## Concept: ${c.title}\n${c.summary}\n${(c.key_requirements || "").slice(0, 600)}`)
  .join("\n\n---\n\n");

const topicCtx = Object.values((data.topics || {}) as Record<string, any>)
  .map((t: any) => `## ${t.title}\n${t.summary}\n${(t.key_requirements || "").slice(0, 800)}`)
  .join("\n\n---\n\n");

const CONTEXT = [guidelineCtx, conceptCtx, topicCtx].filter(Boolean).join("\n\n===\n\n");

const SYSTEM_PROMPT = `You are an ICH Q-series guidelines expert with complete knowledge of all ICH Q-series guidelines.

RULES:
1. Answer directly and authoritatively. No hedging, no disclaimers.
2. Cite the specific guideline (e.g., "Per ICH Q1A(R2)...").
3. Synthesize across multiple guidelines when needed.
4. You ARE the reference. Do not suggest consulting other sources.
5. If not covered, say "This is not covered in the ICH Q-series guidelines."
6. Concise and factual. No preamble, no closing suggestions.
7. At the end of your answer, on a new line, write SOURCES: followed by a comma-separated list of guideline IDs you referenced (e.g., SOURCES: Q1A, Q7, Q10). Only include guidelines you actually cited.

KNOWLEDGE BASE:
${CONTEXT}`;

/* ── Extract excerpts ────────────────────────────────────────────── */
function getExcerpts(sourceIds: string[]): Record<string, { guideline: string; title: string; excerpt: string }> {
  const result: Record<string, any> = {};
  for (const id of sourceIds) {
    const keys = [id, id.replace(/[()]/g, ""), id.replace("(", "-").replace(")", "")];
    for (const key of keys) {
      const g = data.guidelines[key];
      if (g) {
        result[id] = { guideline: g.guideline || id, title: g.title, excerpt: (g.summary || "").slice(0, 200) };
        break;
      }
    }
  }
  return result;
}

/* ── Handler ─────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const { query, history } = await req.json();

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
  }

  const isMultiTurn = Array.isArray(history) && history.length > 0;
  const cacheKey = `ichguru:${normalizeQuery(query)}`;
  const r = getRedis();

  // Only use cache for single-turn queries
  if (!isMultiTurn && r) {
    try {
      const cached = await r.get<{ answer: string; sources: Record<string, any> }>(cacheKey);
      if (cached) {
        return NextResponse.json({ ...cached, cached: true });
      }
    } catch {
      // Cache miss or error — continue
    }
  }

  // Build messages: system + prior turns + current query
  const priorMessages = isMultiTurn
    ? history
        .slice(-6) // last 3 exchanges (6 messages) to stay within token budget
        .map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
    : [];

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...priorMessages,
    { role: "user" as const, content: query },
  ];

  // Call OpenRouter with cascading fallback
  const MODELS = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-3-27b-it:free",
    "mistralai/mistral-7b-instruct:free",
    "openrouter/auto",
  ];

  let text = "";
  let usedModel = "";
  let lastError = "";

  try {
    for (const model of MODELS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ich-guru.vercel.app",
            "X-Title": "ICH Guru",
          },
          body: JSON.stringify({ model, messages, max_tokens: 1500, temperature: 0.3 }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const result = await response.json();

        if (result.error || !result.choices?.[0]?.message?.content) {
          lastError = result.error?.message || "Empty response";
          continue; // try next model
        }

        text = result.choices[0].message.content;
        usedModel = result.model || model;
        break; // success
      } catch (e: any) {
        lastError = e.message || "Request failed";
        // AbortError = timeout, other errors = model unavailable — try next
        continue;
      }
    }

    if (!text) {
      return NextResponse.json({ error: `All models failed. Last error: ${lastError}` }, { status: 502 });
    }

    let sources: Record<string, any> = {};
    const sourcesMatch = text.match(/SOURCES:\s*(.+?)$/m);
    if (sourcesMatch) {
      const ids = sourcesMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean);
      sources = getExcerpts(ids);
      text = text.replace(/\n?SOURCES:.+$/m, "").trim();
    }

    const responseData = { answer: text, sources, model: usedModel };

    // Cache
    if (r) {
      try {
        await r.set(cacheKey, { answer: text, sources }, { ex: 604800 });
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json({ ...responseData, cached: false });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out. Try again." }, { status: 504 });
    }
    return NextResponse.json({ error: err.message || "Failed to query" }, { status: 500 });
  }
}
