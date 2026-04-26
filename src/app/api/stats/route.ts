import { NextRequest, NextResponse } from "next/server";
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
  } catch {
    return null;
  }
}

const ONLINE_KEY = "ichguru:online";
const VISITS_KEY = "ichguru:visits";
const PEAK_KEY = "ichguru:peak";
const ONLINE_TTL_MS = 90_000; // session considered online if heartbeat within 90s

/* POST: heartbeat + first-visit tracking
   body: { sid: string, firstVisit?: boolean } */
export async function POST(req: NextRequest) {
  const r = getRedis();
  if (!r) return NextResponse.json({ online: 0, total: 0, peak: 0 });

  try {
    const { sid, firstVisit } = await req.json();
    if (!sid || typeof sid !== "string") {
      return NextResponse.json({ error: "sid required" }, { status: 400 });
    }

    const now = Date.now();

    // Add/refresh session in sorted set with current timestamp
    await r.zadd(ONLINE_KEY, { score: now, member: sid });

    // Clean up expired sessions
    await r.zremrangebyscore(ONLINE_KEY, 0, now - ONLINE_TTL_MS);

    // Increment total visits only on first visit of session
    if (firstVisit) {
      await r.incr(VISITS_KEY);
    }

    // Get current online count
    const online = await r.zcard(ONLINE_KEY);

    // Update peak if needed
    const currentPeak = (await r.get<number>(PEAK_KEY)) || 0;
    if (online > currentPeak) {
      await r.set(PEAK_KEY, online);
    }

    const total = (await r.get<number>(VISITS_KEY)) || 0;
    const peak = Math.max(online, currentPeak);

    return NextResponse.json({ online, total, peak });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "failed" }, { status: 500 });
  }
}

/* GET: read-only stats */
export async function GET() {
  const r = getRedis();
  if (!r) return NextResponse.json({ online: 0, total: 0, peak: 0 });

  try {
    const now = Date.now();
    await r.zremrangebyscore(ONLINE_KEY, 0, now - ONLINE_TTL_MS);

    const [online, total, peak] = await Promise.all([
      r.zcard(ONLINE_KEY),
      r.get<number>(VISITS_KEY),
      r.get<number>(PEAK_KEY),
    ]);

    return NextResponse.json({
      online: online || 0,
      total: total || 0,
      peak: Math.max(online || 0, peak || 0),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "failed" }, { status: 500 });
  }
}
