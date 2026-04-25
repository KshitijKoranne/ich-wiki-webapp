# ICH Wiki

Structured knowledge base of ICH Q-series guidelines with AI-powered query interface.

Built using Karpathy's LLM Wiki pattern.

## Features

- **Knowledge Graph** — interactive visualization of 40 nodes (28 guidelines + 8 concepts + 4 topics) with 235 cross-reference connections
- **Browse** — all guidelines organized by category with full-text search
- **Ask AI** — query the wiki using natural language, powered by Llama 3.3 70B via OpenRouter (free)

## Deploy to Vercel

1. Fork this repo
2. Go to [vercel.com](https://vercel.com), import the repo
3. Add environment variable: `OPENROUTER_API_KEY` = your key from [openrouter.ai](https://openrouter.ai)
4. Deploy

## Local Development

```bash
npm install
cp .env.example .env.local
# Add your OpenRouter API key to .env.local
npm run dev
```

## Stack

- Next.js 15 + TypeScript
- OpenRouter API (Llama 3.3 70B free tier)
- Canvas-based knowledge graph
- No database — wiki data is compiled JSON

## Data Source

Wiki pages are compiled from the [ICH-LLM-Wiki](https://github.com/KshitijKoranne/ICH-LLM-Wiki-) repository containing 60+ ICH Q-series guideline PDFs.

---

KJR Labs
