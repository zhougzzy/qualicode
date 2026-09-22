import { jsonOk } from "@/lib/api-utils";
import { getServerConfig } from "@/lib/server-config";

export const runtime = "nodejs";

export function GET() {
  return jsonOk({
    status: "ok",
    service: "qualicode",
    deepSeekConfigured: Boolean(getServerConfig().deepSeekApiKey),
    accessCodeConfigured: Boolean(getServerConfig().accessCode),
    checkedAt: new Date().toISOString(),
  });
}
