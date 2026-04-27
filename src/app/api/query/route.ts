import { NextRequest } from "next/server";
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
    return new Response(JSON.stringify({ error: "Query is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;

  if (!apiKey && !nvidiaKey) {
    return new Response(JSON.stringify({ error: "No API key configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const isMultiTurn = Array.isArray(history) && history.length > 0;
  const cacheKey = `ichguru:${normalizeQuery(query)}`;
  const r = getRedis();

  // Cache hit: return as plain JSON (not streamed)
  if (!isMultiTurn && r) {
    try {
      const cached = await r.get<{ answer: string; sources: Record<string, any> }>(cacheKey);
      if (cached) {
        return new Response(JSON.stringify({ ...cached, cached: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch { /* continue */ }
  }

  // Build messages
  const priorMessages = isMultiTurn
    ? history.slice(-6).map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
    : [];

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...priorMessages,
    { role: "user" as const, content: query },
  ];

  const PROVIDERS = [
    ...(nvidiaKey ? [{ url: "https://integrate.api.nvidia.com/v1/chat/completions", auth: nvidiaKey, model: "meta/llama-3.3-70b-instruct" }] : []),
    ...(apiKey ? [{ url: "https://openrouter.ai/api/v1/chat/completions", auth: apiKey, model: "openrouter/auto" }] : []),
  ];

  // Try providers until one responds
  let upstreamResponse: Response | null = null;
  let usedModel = "";

  for (const provider of PROVIDERS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.auth}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ich-guru.vercel.app",
          "X-Title": "ICH Guru",
        },
        body: JSON.stringify({ model: provider.model, messages, max_tokens: 1000, temperature: 0.3, stream: true }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok || !res.body) continue;
      upstreamResponse = res;
      usedModel = provider.model;
      break;
    } catch {
      continue;
    }
  }

  if (!upstreamResponse || !upstreamResponse.body) {
    return new Response(JSON.stringify({ error: "Service temporarily unavailable. Please try again." }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = upstreamResponse.body;

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      const encode = (s: string) => new TextEncoder().encode(s);
      let fullText = "";
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                fullText += token;
                controller.enqueue(encode(`data: ${JSON.stringify({ token })}\n\n`));
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Parse and strip SOURCES line
      let sources: Record<string, any> = {};
      const sourcesMatch = fullText.match(/SOURCES:\s*(.+?)$/m);
      if (sourcesMatch) {
        const ids = sourcesMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean);
        sources = getExcerpts(ids);
        fullText = fullText.replace(/\n?SOURCES:.+$/m, "").trim();
      }

      // Send done signal with sources
      controller.enqueue(encode(`data: ${JSON.stringify({ done: true, sources, model: usedModel })}\n\n`));

      // Cache in background
      if (r && !isMultiTurn && fullText) {
        r.set(cacheKey, { answer: fullText, sources }, { ex: 604800 }).catch(() => {});
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
