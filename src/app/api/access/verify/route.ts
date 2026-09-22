import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { enforceRateLimit, jsonError, getAccessCookieName } from "@/lib/api-utils";
import { getServerConfig } from "@/lib/server-config";

export const runtime = "nodejs";

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: Request) {
  const { accessCode } = getServerConfig();
  if (!accessCode) return NextResponse.json({ ok: true, data: { configured: false }, error: null });

  const rateLimitError = enforceRateLimit(request, "access-verify", 5);
  if (rateLimitError) return rateLimitError;

  let code: unknown;
  try {
    code = (await request.json()).code;
  } catch {
    return jsonError("INVALID_ACCESS_CODE", "访问码格式不正确。", 400);
  }

  if (typeof code !== "string" || !constantTimeEqual(code.trim(), accessCode.trim())) {
    return jsonError("INVALID_ACCESS_CODE", "访问码不正确。", 403);
  }

  const response = NextResponse.json({ ok: true, data: { configured: true }, error: null }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({
    name: getAccessCookieName(),
    value: "granted",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
