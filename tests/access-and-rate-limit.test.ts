import { afterEach, describe, expect, it } from "vitest";
import { POST as verifyAccess } from "@/app/api/access/verify/route";
import { GET as accessStatus } from "@/app/api/access/status/route";
import { enforceRateLimit } from "@/lib/api-utils";
import { resetRateLimitBuckets } from "@/lib/rate-limit";

const originalAccessCode = process.env.QUALICODE_ACCESS_CODE;

afterEach(() => {
  resetRateLimitBuckets();
  if (originalAccessCode === undefined) delete process.env.QUALICODE_ACCESS_CODE;
  else process.env.QUALICODE_ACCESS_CODE = originalAccessCode;
});

describe("Sprint 7 access and resource protection", () => {
  it("reports whether a shared access code is configured", async () => {
    delete process.env.QUALICODE_ACCESS_CODE;
    const response = await accessStatus(new Request("http://localhost/api/access/status"));
    expect((await response.json()).data).toMatchObject({ configured: false, authorized: true });

    process.env.QUALICODE_ACCESS_CODE = "demo-code";
    const protectedResponse = await accessStatus(new Request("http://localhost/api/access/status"));
    expect((await protectedResponse.json()).data).toMatchObject({ configured: true, authorized: false });
  });

  it("sets an HttpOnly cookie after a correct access code", async () => {
    process.env.QUALICODE_ACCESS_CODE = "demo-code";
    const response = await verifyAccess(new Request("http://localhost/api/access/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "demo-code" }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("qualicode_access=granted");
  });

  it("rate limits repeated access-code attempts", async () => {
    process.env.QUALICODE_ACCESS_CODE = "demo-code";
    const request = () => new Request("http://localhost/api/access/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "127.0.0.12" },
      body: JSON.stringify({ code: "wrong-code" }),
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await verifyAccess(request())).status).toBe(403);
    }
    const blocked = await verifyAccess(request());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 429 after the configured request budget is exhausted", async () => {
    const request = new Request("http://localhost/api/test", { headers: { "x-real-ip": "127.0.0.9" } });
    expect(enforceRateLimit(request, "test", 1)).toBeNull();

    const response = enforceRateLimit(request, "test", 1);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
  });
});
