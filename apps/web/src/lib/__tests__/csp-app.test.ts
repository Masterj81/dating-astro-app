/**
 * JUNO-13 — contrat de la politique CSP du sous-arbre /app (nonce).
 *
 * Ces tests exécutent les VRAIES décisions (buildAppNonceCsp / isAppPath —
 * les fonctions que le middleware utilise par requête). Ils échouent si :
 * un nonce fixe traverse deux builds ; 'unsafe-inline' revient dans
 * script-src ; Turnstile, frame-ancestors, worker-src, object-src, base-uri
 * ou form-action disparaissent ; le périmètre s'élargit aux pages statiques.
 */
import { describe, expect, it } from "vitest";

import { TURNSTILE_ORIGIN, buildAppNonceCsp, isAppPath } from "@/lib/csp-app";

const parse = (csp: string, directive: string) =>
  csp
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(directive + " ")) ??
  csp.split(";").find((s) => s.trim() === directive);

describe("isAppPath · périmètre strict du sous-arbre dynamique", () => {
  it("accepte /app et ses enfants, toutes locales — rien d'autre", () => {
    for (const p of ["/en/app", "/fr/app", "/en/app/chat/abc", "/pt-BR/app/premium/tarot", "/en/app/"]) {
      expect(isAppPath(p), p).toBe(true);
    }
    for (const p of [
      "/en", "/en/contact", "/en/auth/login", "/en/auth/callback",
      "/en/auth/signup", "/en/account/delete", "/en/help", "/en/unsubscribe",
      "/", "/service-worker.js", "/manifest.json",
    ]) {
      expect(isAppPath(p), p).toBe(false);
    }
  });
});

describe("buildAppNonceCsp · politique nonce du sous-arbre app", () => {
  const n1 = buildAppNonceCsp("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==");
  const n2 = buildAppNonceCsp("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB==");

  it("deux nonces produisent deux politiques différentes (jamais de nonce fixe)", () => {
    expect(n1).not.toBe(n2);
  });

  it("PHASE 2 : strict-dynamic ET repli CSP2 (hôtes conservés à côté du nonce)", () => {
    // CSP3 : nonce + strict-dynamic (le allowlist est ignoré).
    // CSP2 (navigateurs sans strict-dynamic) : repli sur 'self' + les hôts
    // explicites — ils doivent rester dans la directive pour ces navigateurs.
    const scriptSrc = n1.split(";").find((d) => d.includes("script-src "))!;
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("https://va.vercel-scripts.com");
    expect(scriptSrc).toContain("https://challenges.cloudflare.com");
  });

  it("le nonce est porté par script-src ET script-src-elem", () => {
    expect(n1).toContain(`script-src 'self' 'nonce-AAAAAAAA`);
    expect(n1).toContain(`script-src-elem 'self' 'nonce-AAAAAAAA`);
  });

  it("AUCUN 'unsafe-inline' dans script-src / script-src-elem (script-src-elem séparé, pas de repli)", () => {
    const scriptSrc = n1.split(";").find((d) => d.includes("script-src "))!;
    const scriptSrcElem = n1.split(";").find((d) => d.includes("script-src-elem"))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrcElem).not.toContain("unsafe-inline");
    // 'unsafe-inline' with a nonce present is IGNORED by modern browsers,
    // but we refuse to ship it at all in the script directives.
  });

  it("'unsafe-inline' demeure UNIQUEMENT dans style-src (justification distincte : non exécutable)", () => {
    const styleSrc = parse(n1, "style-src")!;
    expect(styleSrc).toContain("'unsafe-inline'");
    const others = n1
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d.startsWith("script"));
    for (const d of others) expect(d).not.toContain("unsafe-inline");
  });

  it("Turnstile conservé dans script-src, script-src-elem et frame-src (seule origine cadrée)", () => {
    expect(parse(n1, "script-src")).toContain(TURNSTILE_ORIGIN);
    expect(parse(n1, "script-src-elem")).toContain(TURNSTILE_ORIGIN);
    expect(parse(n1, "frame-src")).toBe(`frame-src ${TURNSTILE_ORIGIN}`);
  });

  it("directives de confinement toutes présentes et strictes", () => {
    expect(parse(n1, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(parse(n1, "worker-src")).toBe("worker-src 'self'");
    expect(parse(n1, "object-src")).toBe("object-src 'none'");
    expect(parse(n1, "base-uri")).toBe("base-uri 'self'");
    expect(parse(n1, "form-action")).toBe("form-action 'self'");
  });

  it("strict-dynamic présent (les chunks framework se chargent via le nonce)", () => {
    expect(parse(n1, "script-src")).toContain("'strict-dynamic'");
  });

  it("fail-closed: un nonce malformé est refusé", () => {
    expect(() => buildAppNonceCsp("short")).toThrow();
    expect(() => buildAppNonceCsp("")).toThrow();
    expect(() => buildAppNonceCsp("avec espace et caractères <> bizarres!!")).toThrow();
  });
});
