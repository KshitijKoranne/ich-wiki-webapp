import { NextRequest, NextResponse } from "next/server";
import wikiData from "@/lib/wiki-data.json";

const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-235b-a22b:free",
  "openrouter/free",
];

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured" },
      { status: 500 }
    );
  }

  const data = wikiData as any;

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

  const context = [guidelineCtx, conceptCtx, topicCtx]
    .filter(Boolean)
    .join("\n\n===\n\n");

  const systemPrompt = `You are an ICH Q-series guidelines expert with complete knowledge of all ICH Q-series guidelines.

RULES:
1. Answer directly and authoritatively. No hedging, no disclaimers, no "I should note", no "I'd recommend consulting the full text".
2. Cite the specific guideline (e.g., "Per ICH Q1A(R2)...").
3. Synthesize across multiple guidelines when needed.
4. You ARE the reference. Do not suggest consulting other sources.
5. If not covered in the knowledge base, say "This is not covered in the ICH Q-series guidelines."
6. Concise and factual. No preamble, no closing suggestions.

KNOWLEDGE BASE:
${context}`;

  let lastError = "";

  for (const model of MODELS) {
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer":
              process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : "http://localhost:3000",
            "X-Title": "ICH LLM Wiki",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: query },
            ],
            max_tokens: 1500,
            temperature: 0.3,
          }),
        }
      );

      const result = await response.json();

      if (result.error) {
        lastError = `${model}: ${result.error.message || JSON.stringify(result.error)}`;
        continue;
      }

      const text =
        result.choices?.[0]?.message?.content || "";

      if (!text) {
        lastError = `${model}: Empty response`;
        continue;
      }

      return NextResponse.json({ answer: text, model });
    } catch (err: any) {
      lastError = `${model}: ${err.message}`;
      continue;
    }
  }

  return NextResponse.json(
    { error: `All models failed. Last error: ${lastError}` },
    { status: 502 }
  );
}
