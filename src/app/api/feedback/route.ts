import { NextRequest } from "next/server";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const { name, liked, suggestion } = await req.json();

  if (!name?.trim() && !suggestion?.trim()) {
    return new Response(JSON.stringify({ error: "Please fill at least one field." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const r = getRedis();
  if (!r) return new Response(JSON.stringify({ error: "Storage unavailable." }), { status: 500, headers: { "Content-Type": "application/json" } });

  const entry = {
    name: name?.trim() || "Anonymous",
    liked: liked?.trim() || "",
    suggestion: suggestion?.trim() || "",
    ts: new Date().toISOString(),
  };

  await r.set(`ichguru:feedback:${Date.now()}`, JSON.stringify(entry));
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}
