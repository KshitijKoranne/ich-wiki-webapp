import { NextRequest, NextResponse } from "next/server";
import wikiData from "@/lib/wiki-data.json";

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

  // Build context from wiki data
  const data = wikiData as any;

  const guidelineCtx = Object.values(data.guidelines as Record<string, any>)
    .map(
      (g: any) =>
        `## ${g.guideline} — ${g.title}\n${g.summary}\n${(g.key_requirements || "").slice(0, 2000)}\n${(g.definitions || "").slice(0, 500)}`
    )
    .join("\n\n---\n\n");

  const conceptCtx = Object.values(data.concepts as Record<string, any>)
    .map(
      (c: any) =>
        `## Concept: ${c.title}\n${c.summary}\n${(c.key_requirements || "").slice(0, 800)}`
    )
    .join("\n\n---\n\n");

  const topicCtx = Object.values(
    (data.topics || {}) as Record<string, any>
  )
    .map(
      (t: any) =>
        `## ${t.title}\n${t.summary}\n${(t.key_requirements || "").slice(0, 1000)}`
    )
    .join("\n\n---\n\n");

  const context = [guidelineCtx, conceptCtx, topicCtx]
    .filter(Boolean)
    .join("\n\n===\n\n");

  const systemPrompt = `You are an ICH Q-series guidelines expert. You have complete knowledge of all ICH Q-series guidelines from the knowledge base below.

RULES:
1. Answer directly and authoritatively. Do NOT hedge, qualify, or add disclaimers like "I should note", "I'd recommend consulting", "there may be additional detail", "the knowledge base only contains partial".
2. Always cite the specific guideline (e.g., "Per ICH Q1A(R2)...").
3. If the answer requires information from multiple guidelines, synthesize them clearly.
4. Do NOT suggest the user consult the full guideline text — you ARE the guideline reference.
5. Do NOT say "this is just a summary" or "there may be more". Answer the question completely from what you have.
6. If the specific information is genuinely not covered in any of the guidelines below, say "This specific topic is not covered in the ICH Q-series guidelines" — nothing more.
7. Keep answers concise and factual. No preamble, no closing suggestions.

KNOWLEDGE BASE:
${context}`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ich-wiki.vercel.app",
          "X-Title": "ICH LLM Wiki",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct:free",
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
      return NextResponse.json(
        { error: result.error.message || "API error" },
        { status: 502 }
      );
    }

    const text =
      result.choices?.[0]?.message?.content || "No response received.";

    return NextResponse.json({ answer: text });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to query" },
      { status: 500 }
    );
  }
}
