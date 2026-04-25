import { NextRequest, NextResponse } from "next/server";
import wikiData from "@/lib/wiki-data.json";

const data = wikiData as any;

// Build full context once
const guidelineCtx = Object.values(data.guidelines as Record<string, any>)
  .map(
    (g: any) =>
      `## ${g.guideline} — ${g.title}\n${g.summary}\n${(g.key_requirements || "").slice(0, 1500)}`
  )
  .join("\n\n---\n\n");

const conceptCtx = Object.values(data.concepts as Record<string, any>)
  .map(
    (c: any) =>
      `## Concept: ${c.title}\n${c.summary}\n${(c.key_requirements || "").slice(0, 600)}`
  )
  .join("\n\n---\n\n");

const topicCtx = Object.values(
  (data.topics || {}) as Record<string, any>
)
  .map(
    (t: any) =>
      `## ${t.title}\n${t.summary}\n${(t.key_requirements || "").slice(0, 800)}`
  )
  .join("\n\n---\n\n");

const CONTEXT = [guidelineCtx, conceptCtx, topicCtx]
  .filter(Boolean)
  .join("\n\n===\n\n");

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

// Extract relevant excerpts from wiki for cited guidelines
function getExcerpts(sourceIds: string[]): Record<string, { guideline: string; title: string; excerpt: string }> {
  const result: Record<string, any> = {};
  for (const id of sourceIds) {
    // Try various key formats
    const keys = [id, id.replace(/[()]/g, ''), id.replace('(', '-').replace(')', '')];
    for (const key of keys) {
      const g = data.guidelines[key];
      if (g) {
        result[id] = {
          guideline: g.guideline || id,
          title: g.title,
          excerpt: (g.summary || "").slice(0, 200),
        };
        break;
      }
    }
  }
  return result;
}

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ich-wiki-webapp.vercel.app",
          "X-Title": "ICH LLM Wiki",
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query },
          ],
          max_tokens: 1500,
          temperature: 0.3,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);
    const result = await response.json();

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message || JSON.stringify(result.error) },
        { status: 502 }
      );
    }

    let text = result.choices?.[0]?.message?.content || "";
    if (!text) {
      return NextResponse.json({ error: "Empty response from model" }, { status: 502 });
    }

    // Parse SOURCES line
    let sources: Record<string, any> = {};
    const sourcesMatch = text.match(/SOURCES:\s*(.+?)$/m);
    if (sourcesMatch) {
      const ids = sourcesMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean);
      sources = getExcerpts(ids);
      // Remove SOURCES line from displayed text
      text = text.replace(/\n?SOURCES:.+$/m, "").trim();
    }

    return NextResponse.json({
      answer: text,
      sources,
      model: result.model || "openrouter/free",
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out. Try again." }, { status: 504 });
    }
    return NextResponse.json({ error: err.message || "Failed to query" }, { status: 500 });
  }
}
