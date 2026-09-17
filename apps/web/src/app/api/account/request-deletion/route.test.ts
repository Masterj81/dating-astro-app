// @vitest-environment node
/**
 * JUNO-14 — the account-deletion request route must use the DURABLE,
 * per-account rate limiter, not an in-process Map.
 *
 * WHY THIS EXISTS (audit 2026-09-07, JUNO-14)
 * -------------------------------------------
 * The route kept its limiter in a module-level `Map` keyed on the FIRST
 * x-forwarded-for entry. On Vercel serverless that is per-instance (cold
 * starts reset it, parallel instances each keep their own count), never
 * purged, and the key is client-controllable when the XFF chain is forged.
 * The durable replacement is `check_rate_limit(uuid, text, int, interval)` —
 * an atomic, persistent PostgreSQL window — keyed on the VERIFIED caller id
 * (consumed only after the auth check), called through the service-role
 * client. Fail-closed: RPC error → 503.
 *
 * No real email, no real database (both mocked); ids and tokens are synthetic.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendSpy = vi.fn();
vi.mock("@/lib/resend", () => ({
  getResend: () => ({ emails: { send: sendSpy } }),
  EMAIL_FROM: "JUNO <noreply@junosynastry.com>",
}));

const upsertSpy = vi.fn();
const adminMock = {
  auth: {
    getUser: vi.fn(),
    admin: { getUserById: vi.fn() },
  },
  from: vi.fn(() => ({ upsert: upsertSpy })),
  rpc: vi.fn(),
};
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => adminMock,
}));

vi.mock("@/lib/account-deletion-email", () => ({
  deletionCodeEmail: () => ({ html: "<p>code</p>", text: "code" }),
}));

import { POST } from "./route";

const USER_ID = "00000000-0000-4000-8000-0000000000dd";
const OTHER_ID = "00000000-0000-4000-8000-0000000000ee";
const TOKEN = "synthetic-jwt-NOT-REAL";

const makeRequest = (body: unknown, token: string | null = TOKEN) =>
  new Request("http://localhost/api/account/request-deletion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const happyAuth = () => {
  adminMock.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID, email: "reader@example.net" } },
    error: null,
  });
  adminMock.auth.admin.getUserById.mockResolvedValue({
    data: { user: { id: USER_ID, email: "reader@example.net" } },
    error: null,
  });
  upsertSpy.mockResolvedValue({ error: null });
};

beforeEach(() => {
  vi.clearAllMocks();
  happyAuth();
  adminMock.rpc.mockResolvedValue({ data: true, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JUNO-14 · la limite est durable, par compte vérifié", () => {
  it("non authentifié → 401, et la limite n'est PAS consommée (aucun rpc)", async () => {
    const res = await POST(makeRequest({ email: "reader@example.net", userId: USER_ID }, null));
    expect(res.status).toBe(401);
    expect(adminMock.rpc).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("jeton valide pour un AUTRE compte → 401, limite non consommée", async () => {
    const res = await POST(makeRequest({ email: "reader@example.net", userId: OTHER_ID }));
    expect(res.status).toBe(401);
    expect(adminMock.rpc).not.toHaveBeenCalled();
  });

  it("la clé de limitation est l'utilisateur vérifié — jamais l'IP", async () => {
    const res = await POST(makeRequest({ email: "reader@example.net", userId: USER_ID }));
    expect(res.status).toBe(200);
    expect(adminMock.rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_user_id: USER_ID,
      p_action: "web_deletion_request",
      p_max_count: 3,
      p_window: "1 hour",
    });
    expect(JSON.stringify(adminMock.rpc.mock.calls)).not.toContain("x-forwarded");
  });

  it("3 demandes admissibles, la 4e → 429 sans email ni upsert", async () => {
    adminMock.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });

    for (let i = 0; i < 3; i++) {
      const res = await POST(makeRequest({ email: "reader@example.net", userId: USER_ID }));
      expect(res.status).toBe(200);
    }
    expect(sendSpy).toHaveBeenCalledTimes(3);

    upsertSpy.mockClear();
    sendSpy.mockClear();
    const fourth = await POST(makeRequest({ email: "reader@example.net", userId: USER_ID }));
    expect(fourth.status).toBe(429);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("erreur du RPC → 503 fail-closed, aucun email", async () => {
    adminMock.rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    const res = await POST(makeRequest({ email: "reader@example.net", userId: USER_ID }));
    expect(res.status).toBe(503);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("JUNO-14 · garde structurelle : plus AUCUNE Map locale", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/api/account/request-deletion/route.ts"),
    "utf8",
  );

  it("aucun limiter en mémoire (new Map) — la limite vit en base", () => {
    expect(source).not.toMatch(/new Map\s*\(/);
    expect(source).toContain('rpc(\n      "check_rate_limit"');
    expect(source).toContain("p_action: RATE_LIMIT_ACTION");
  });
});
