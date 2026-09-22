import type { NextResponse } from "next/server";
import { NextResponse as Response } from "next/server";
import type { ApiError, ApiResponse } from "@/lib/api-contract";
import { getServerConfig } from "@/lib/server-config";
import { consumeRateLimit } from "@/lib/rate-limit";

export function createRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function jsonOk<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return Response.json({ ok: true, data, error: null }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  requestId = createRequestId(),
  headers?: HeadersInit,
): NextResponse<ApiResponse<null>> {
  const error: ApiError = { code, message, requestId };
  return Response.json({ ok: false, data: null, error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

const ACCESS_COOKIE = "qualicode_access";

export function hasAccessCookie(request: Request): boolean {
  return request.headers.get("cookie")?.split(";").some((item) => item.trim() === `${ACCESS_COOKIE}=granted`) ?? false;
}

export function requireAccess(request: Request): NextResponse<ApiResponse<null>> | null {
  if (!getServerConfig().accessCode || hasAccessCookie(request)) return null;
  return jsonError("ACCESS_CODE_REQUIRED", "当前站点需要共享访问码。", 401);
}

export function enforceRateLimit(request: Request, scope: string, maxRequests?: number): NextResponse<ApiResponse<null>> | null {
  const defaultLimit = scope.startsWith("ai-")
    ? 6
    : scope === "convert"
      ? 20
      : scope === "evidence" || scope === "codes-edit"
        ? 30
        : 6;
  const configuredLimit = Number(process.env.QUALICODE_MAX_REQUESTS_PER_WINDOW ?? defaultLimit);
  const result = consumeRateLimit(request, scope, maxRequests ?? (Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : defaultLimit));
  if (result.allowed) return null;
  return jsonError("RATE_LIMITED", "请求次数已达到当前窗口上限，请稍后再试。", 429, undefined, {
    "Retry-After": String(result.retryAfterSeconds),
  });
}

export function getAccessCookieName(): string {
  return ACCESS_COOKIE;
}
