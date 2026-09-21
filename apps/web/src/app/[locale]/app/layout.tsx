import { headers } from "next/headers";

// JUNO-13 — the /app subtree renders per request (nonce CSP gate outcome).
//
// WHY here and nowhere else: a nonce must be fresh per request, so every
// page whose inline scripts carry one must be server-rendered (prerendered
// HTML cannot embed a per-request nonce — proven on our exact Next 15.5.25,
// docs/runbooks/web-session-csp-2026-09.md). The gate rejected a GLOBAL
// nonce (would convert all 352 static pages to SSR); the split keeps
// marketing static. This subtree is the authenticated app: no SEO surface,
// client-guarded today already, and per-request rendering is what lets the
// middleware session refresh and the request-CSP nonce reach every render.
//
// Mechanism note (measured, 2026-09-21): `export const dynamic =
// "force-dynamic"` alone did NOT demote the subtree on Next 15.5.25 — the
// build kept 352 static pages. Reading `headers()` here does (PoC-verified:
// any request-data access opts the route into dynamic rendering), and it is
// the official way to propagate x-nonce to the tree should a <Script> ever
// need it. Both are kept deliberately: the read forces the behavior, the
// export documents the intent.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Touching request data is what opts this subtree into per-request
  // rendering; the nonce itself is applied by Next to its scripts from the
  // request CSP header (see src/lib/csp-app.ts).
  await headers();
  return children;
}
