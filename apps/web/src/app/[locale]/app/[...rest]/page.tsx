// JUNO-13 phase 2 (2026-09-22): unmatched /app URLs used to fall through to
// Next's built-in _not-found, whose render pipeline does NOT apply the
// request CSP nonce (measured: 0/13 scripts nonced under an enforced nonce'd
// policy — every script blocked, dead page). This optional-catch-all matches
// ONLY paths no real /app route claims (specific segments win over it), and
// throws notFound() so the segment boundary (./not-found.tsx) renders through
// the normal app pipeline — scripts nonced, HTTP status stays 404.
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppCatchAllPage() {
  notFound();
}
