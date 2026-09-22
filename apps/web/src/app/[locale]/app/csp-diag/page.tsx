// TEMPORARY diagnostic page (diag/nonce-perpage branch) — never merge.
// Answers two questions on the Vercel runtime:
//  (a) does this route render per request? (ts must change between two GETs)
//  (b) do the middleware's request-header overrides reach the render?
//      (x-nonce / content-security-policy must appear below)
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CspDiagPage() {
  const h = await headers();
  const lines: string[] = [];
  h.forEach((value, key) => {
    if (/nonce|security-policy/i.test(key)) {
      lines.push(key + ": " + value.slice(0, 160));
    }
  });
  return (
    <pre id="csp-diag" style={{ padding: 24 }}>
      {"ts=" + Date.now() + "\n" + (lines.length ? lines.join("\n") : "NO x-nonce / CSP request header visible to the render")}
    </pre>
  );
}
