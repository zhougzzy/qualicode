import { hasAccessCookie, jsonOk } from "@/lib/api-utils";
import { getServerConfig } from "@/lib/server-config";

export const runtime = "nodejs";

export function GET(request: Request) {
  const configured = Boolean(getServerConfig().accessCode);
  return jsonOk({ configured, authorized: !configured || hasAccessCookie(request) });
}
