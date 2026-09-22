// JUNO-13 phase 1 (2026-09-22) — browser-enforced CSP for the /app subtree
// WITHOUT a Content-Security-Policy response header.
//
// WHY A META: on Vercel, every response CSP header — from next.config
// headers(), from middleware, or from vercel.json route headers — is FOLDED
// into the internal request the Next 15.5.25 render reads, overwriting the
// nonce'd request CSP the middleware sets (proven 2026-09-22 on
// diag/nonce-perpage deployments 9e66d14/079a480/37c9df5/271fa1b: 0 nonce on
// every inline script whenever an enforced response CSP exists, nonces 31/31
// when none does). Next extracts the nonce from the REQUEST's CSP with NO
// fall-through to Report-Only when an enforced policy is present
// (app-render.js: `headers['content-security-policy'] || report-only`).
// Since an enforced nonce'd response header is phase 2 by definition, phase 1
// delivers the enforced policy INSIDE the document: CSP <meta> is enforced
// by the browser (intersected with any header policy — an attacker-injected
// extra meta can only tighten it), while the response keeps only the nonce'd
// Report-Only header. frame-ancestors is omitted (ignored in meta by spec)
// and stays enforced through X-Frame-Options: DENY in next.config.ts.
//
// Placement: rendered by the [locale]/app layout, so every page of the
// subtree carries it. React hoists <meta> into <head>, ahead of the body's
// inline scripts (verified: meta index < first script index in prod HTML).
import { ENFORCEMENT_CSP_META } from "@/lib/csp-static";

export function CspEnforcementMeta() {
  return <meta httpEquiv="Content-Security-Policy" content={ENFORCEMENT_CSP_META} />;
}
