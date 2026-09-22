// TEMPORARY diagnostic page (diag/nonce-perpage branch) — never merge.
// Discriminating test for the header journey (no cookies, no tokens):
//  - ts                    : per-request render proof
//  - x-nonce               : middleware request override reached the render
//  - content-security-policy / -report-only : what the render's merged view
//    carries (request overrides + any response headers folded in by Vercel)
//  - x-mw-saw-csp          : CSP the middleware saw on ENTRY (route headers
//    applied before middleware?)
//  - x-mw-res-probe        : response-only marker — visible here ⇒ fold
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CspDiagPage() {
  const h = await headers();
  const keys = ["x-nonce", "x-mw-saw-csp", "x-mw-res-probe", "content-security-policy", "content-security-policy-report-only"];
  const lines: string[] = ["ts=" + Date.now()];
  for (const k of keys) {
    const v = h.get(k);
    lines.push(k + ": " + (v ? v.slice(0, 140) : "(absent)"));
  }
  return (
    <pre id="csp-diag" style={{ padding: 24 }}>
      {lines.join("\n")}
    </pre>
  );
}
