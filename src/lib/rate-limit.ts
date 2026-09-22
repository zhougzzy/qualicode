import type { NextRequest } from "next/server";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 6;

function getClientKey(request: Request | NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local-client";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function consumeRateLimit(
  request: Request | NextRequest,
  scope: string,
  maxRequests = Number(process.env.QUALICODE_MAX_REQUESTS_PER_WINDOW ?? DEFAULT_MAX_REQUESTS),
  windowMs = Number(process.env.QUALICODE_RATE_WINDOW_MS ?? DEFAULT_WINDOW_MS),
): RateLimitResult {
  const now = Date.now();
  const key = `${scope}:${getClientKey(request)}`;
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : existing;

  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return {
    allowed: bucket.count <= maxRequests,
    remaining: Math.max(0, maxRequests - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function resetRateLimitBuckets(): void {
  buckets.clear();
}
