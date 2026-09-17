// @vitest-environment node
/**
 * JUNO-07 — `/api/contact` must be a single-delivery form, not a relay.
 *
 * WHY THIS EXISTS (audit 2026-09-07, JUNO-07)
 * -------------------------------------------
 * The route accepted unauthenticated JSON, then sent TWO emails: one to the
 * JUNO inbox, and one auto-acknowledgement TO THE CALLER-PROVIDED ADDRESS.
 * No proof of possession, no durable rate limit, no anti-automation — a
 * scripted caller could push arbitrary content at arbitrary mailboxes from
 * JUNO's domain, in volume.
 *
 * The contract pinned here (TRANCHANT: every "no public send / barrier first"
 * case fails against the pre-fix code, which sent the ack before any check):
 *   - exactly ONE Resend call, to the server-constant JUNO inbox;
 *   - the caller-provided address is never a recipient;
 *   - Turnstile: absent/invalid token → 400, verify unreachable or secret
 *     missing → 503, always BEFORE any Resend call;
 *   - durable limits: origin 5/h and address 3/h via check_edge_rate_limit
 *     (HMAC-keyed buckets — the raw email/IP never reaches the RPC key or a
 *     log), exceeded → 429, RPC error → 503, always BEFORE any Resend call;
 *   - htmlEscape / sanitizeHeader / category whitelist / 5000-char cap kept;
 *   - logs carry codes, never messages, addresses or tokens.
 *
 * No real email is sent (Resend is mocked); the Turnstile endpoint is a
 * mocked fetch; every token below is obviously synthetic.
 */
import { createHmac } from "crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_VALUES,
} from "@/lib/contact-categories";

const sendSpy = vi.fn();
vi.mock("@/lib/resend", () => ({
  getResend: () => ({ emails: { send: sendSpy } }),
  EMAIL_FROM: "JUNO <noreply@junosynastry.com>",
}));

const rpcSpy = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ rpc: rpcSpy }),
}));

import { POST } from "./route";

const SECRET = "test-secret-contact-hmac-0123456789abcdef";
const FAKE_TOKEN = "XXXX.DUMMY.TOKEN.SYNTHETIC-0000";
const INTERNAL_INBOX = "support@junosynastry.com";

const basePayload = (over: Record<string, unknown> = {}) => ({
  name: "Jean Dupont",
  email: "visitor@example.net",
  category: "General Question",
  message: "Bonjour, ceci est un message de test synthetique.",
  "cf-turnstile-response": FAKE_TOKEN,
  ...over,
});

const makeRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const passCaptcha = () => {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  });
};
const allowRates = () => {
  rpcSpy.mockResolvedValue({ data: true, error: null });
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONTACT_HASH_SECRET = SECRET;
  process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  vi.stubGlobal("fetch", vi.fn());
  passCaptcha();
  allowRates();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.CONTACT_HASH_SECRET;
  delete process.env.TURNSTILE_SECRET_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const expectBucket = (namespace: string, value: string) =>
  namespace +
  ":" +
  createHmac("sha256", SECRET).update(value).digest("hex").slice(0, 32);

describe("JUNO-07 · envoi unique, destination interne uniquement", () => {
  it("une requête valide → UN SEUL envoi, vers la boîte JUNO, jamais vers l'adresse fournie", async () => {
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(200);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sendSpy.mock.calls[0][0];
    // Le destinataire (et le seul destinataire) est la boîte interne ;
    // l'adresse du visiteur n'apparaît que comme CONTENU du message
    // (expéditeur de réponse + champ Email affiché) — jamais comme `to`.
    expect(sent.to).toBe(INTERNAL_INBOX);
    expect(sent.replyTo).toBe("visitor@example.net");
    expect(sent.html).toContain("visitor@example.net");
  });

  it("la destination n'est pas contrôlable par le corps (tentative d'injection ignorée)", async () => {
    const res = await POST(
      makeRequest(basePayload({ to: "attacker@evil.example", recipient: "attacker@evil.example" })),
    );
    expect(res.status).toBe(200);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].to).toBe(INTERNAL_INBOX);
  });

  it("le HTML est échappé et le CRLF neutralisé dans l'objet (sanitizeHeader)", async () => {
    await POST(
      makeRequest(
        basePayload({
          name: "Mallory<b>script</b>\r\nBcc: victim@example.net",
          message: "<img src=x onerror=alert(1)> & \"quotes\"",
        }),
      ),
    );
    const sent = sendSpy.mock.calls[0][0];
    // L'injection d'en-tête exige un CRLF : strippé, le mot « Bcc: » restant
    // est du texte inerte DANS la valeur du sujet (les sujets ne sont pas du
    // HTML non plus — les balises y sont sans effet).
    expect(sent.subject).not.toMatch(/[\r\n]/);
    expect(sent.html).not.toContain("<img src=x");
    expect(sent.html).not.toContain("<b>script</b>");
    expect(sent.html).toContain("&lt;img");
  });

  it("catégorie hors liste, message > 5000, champs manquants → 400 sans AUCUN envoi", async () => {
    for (const bad of [
      basePayload({ category: "Free Tiffany Silver" }),
      basePayload({ message: "x".repeat(5001) }),
      basePayload({ message: "" }),
      basePayload({ email: "not-an-email" }),
    ]) {
      const res = await POST(makeRequest(bad));
      expect(res.status).toBe(400);
    }
    expect(sendSpy).not.toHaveBeenCalled();
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});

describe("JUNO-07 · contrat de catégories canoniques (indépendant de la langue)", () => {
  it("chaque valeur canonique est acceptée (200), et la catégorie ne contrôle JAMAIS le destinataire", async () => {
    for (const category of CONTACT_CATEGORY_VALUES) {
      sendSpy.mockClear();
      const res = await POST(makeRequest(basePayload({ category })));
      expect(res.status, `catégorie « ${category} » doit être acceptée`).toBe(200);
      expect(sendSpy, `catégorie « ${category} » → un seul envoi`).toHaveBeenCalledTimes(1);
      // Le destinataire reste la boîte interne quelle que soit la catégorie.
      expect(sendSpy.mock.calls[0][0].to).toBe(INTERNAL_INBOX);
      expect(sendSpy.mock.calls[0][0].replyTo).toBe("visitor@example.net");
    }
  });

  it("TRANCHANT: « Question générale » (valeur localisée FR soumise telle quelle) → 400, aucun envoi", async () => {
    const res = await POST(makeRequest(basePayload({ category: "Question générale" })));
    expect(res.status).toBe(400);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("les étiquettes LOCALISÉES des 8 locales sont rejetées quand elles diffèrent du canonique (et en.json coïncide par construction)", async () => {
    const messagesDir = path.resolve(process.cwd(), "messages");
    const files = fs.readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(8);

    let differingLabels = 0;
    for (const file of files) {
      const dict = JSON.parse(
        fs.readFileSync(path.join(messagesDir, file), "utf8"),
      ) as { contact: Record<string, string> };
      for (const { value, labelKey } of CONTACT_CATEGORIES) {
        const label = dict.contact[labelKey];
        expect(label, `${file}: ${labelKey} doit exister`).toBeTruthy();
        if (label === value) continue; // en.json : l'étiquette EST la valeur
        differingLabels += 1;
        const res = await POST(makeRequest(basePayload({ category: label })));
        expect(
          res.status,
          `${file}: l'étiquette localisée « ${label} » ne doit PAS être acceptée`,
        ).toBe(400);
      }
    }
    // Garde anti-vide : au moins une locale localise réellement ses catégories.
    expect(differingLabels).toBeGreaterThan(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("JUNO-07 · Turnstile avant toute ressource", () => {
  it("jeton absent → 400, aucun rate limit consommé, aucun envoi", async () => {
    const res = await POST(makeRequest(basePayload({ "cf-turnstile-response": "" })));
    expect(res.status).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("siteverify répond success=false (invalide/expiré/déjà utilisé) → 400, aucun envoi", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    });
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(400);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("siteverify injoignable (réseau) → 503 fail-closed, aucun envoi", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(503);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("TURNSTILE_SECRET_KEY absent → 503 (jamais permissif), aucun envoi", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("JUNO-07 · limites durables (origine puis adresse), avant tout envoi", () => {
  it("deux limites indépendantes appelées via check_edge_rate_limit avec des clés HMAC", async () => {
    await POST(makeRequest(basePayload(), { "x-forwarded-for": "203.0.113.9" }));
    expect(rpcSpy).toHaveBeenCalledTimes(2);
    expect(rpcSpy.mock.calls[0][0]).toBe("check_edge_rate_limit");
    expect(rpcSpy.mock.calls[0][1]).toEqual({
      p_key: expectBucket("contact:origin", "203.0.113.9"),
      p_max: 5,
      p_window_seconds: 3600,
    });
    expect(rpcSpy.mock.calls[1][1]).toEqual({
      p_key: expectBucket("contact:addr", "visitor@example.net"),
      p_max: 3,
      p_window_seconds: 3600,
    });
    // Aucune clé ne contient l'adresse ou l'IP en clair.
    expect(rpcSpy.mock.calls[0][1].p_key).not.toContain("203.0.113.9");
    expect(rpcSpy.mock.calls[1][1].p_key).not.toContain("visitor@example.net");
  });

  it("XFF multi-entrées → la DERNIÈRE (proxy le plus proche) est la clé, pas la première", async () => {
    await POST(
      makeRequest(basePayload(), { "x-forwarded-for": "1.2.3.4, 198.51.100.7" }),
    );
    expect(rpcSpy.mock.calls[0][1].p_key).toBe(expectBucket("contact:origin", "198.51.100.7"));
  });

  it("XFF absent → bucket de secours explicite, toujours protégé", async () => {
    await POST(makeRequest(basePayload()));
    expect(rpcSpy.mock.calls[0][1].p_key).toBe(
      expectBucket("contact:origin", "origin:unknown"),
    );
  });

  it("limite d'origine dépassée → 429 Retry-After, aucun envoi", async () => {
    rpcSpy.mockResolvedValueOnce({ data: false, error: null });
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("limite par adresse dépassée → 429, aucun envoi", async () => {
    rpcSpy.mockResolvedValueOnce({ data: true, error: null }); // origin ok
    rpcSpy.mockResolvedValueOnce({ data: false, error: null }); // addr blocked
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(429);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("erreur du RPC → 503 fail-closed, aucun envoi", async () => {
    rpcSpy.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(503);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("CONTACT_HASH_SECRET absent → 503 (jamais d'empreinte non salée), aucun envoi", async () => {
    delete process.env.CONTACT_HASH_SECRET;
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(503);
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("JUNO-07 · aucun secret dans les logs ni la réponse", () => {
  it("les erreurs journalisent des codes — ni message, ni adresse, ni jeton", async () => {
    rpcSpy.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    await POST(makeRequest(basePayload()));
    const logged = JSON.stringify(
      (console.error as ReturnType<typeof vi.fn>).mock.calls,
    );
    expect(logged).not.toContain("visitor@example.net");
    expect(logged).not.toContain(FAKE_TOKEN);
    expect(logged).not.toContain("Bonjour, ceci est un message");

    const missing = await POST(makeRequest(basePayload({ "cf-turnstile-response": "" })));
    const body = await missing.json();
    expect(JSON.stringify(body)).not.toContain(FAKE_TOKEN);
    expect(body.error).toBe("captcha_invalid");
  });

  it("Resend en erreur → réponse contrôlée sans détail interne", async () => {
    sendSpy.mockRejectedValue(new Error("RESEND_API_KEY revoked — internal detail"));
    const res = await POST(makeRequest(basePayload()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("RESEND");
    expect(body.error).toBe("unavailable");
  });
});
