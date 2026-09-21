import { AppShell } from "@/components/AppShell";
import { DashboardOverview } from "@/components/DashboardOverview";
import { WebAppEntryGate } from "@/components/WebAppEntryGate";
import { getTranslations } from "next-intl/server";

// JUNO-13 — this PAGE renders per request (nonce propagation fix, 2026-09-21).
//
// ROOT CAUSE (measured on the bd61436 deployment): generateStaticParams in
// [locale]/layout.tsx prerenders every locale path INCLUDING /app/**, and
// Vercel serves those prerendered routes WITHOUT re-invoking app-render —
// the middleware still runs (the Report-Only header arrives, nonce fresh per
// response) but Next never extracts that nonce from the request headers, so
// 0 of 16 inline scripts carried it (locally the same build re-rendered and
// carried 34). Next 15.5.25 reads the nonce from the REQUEST headers
// (content-security-policy OR -report-only — server/app-render/app-render.js)
// only during a render; a prerendered route has no per-request render.
//
// The layout-level `headers()`/force-dynamic did NOT demote this segment on
// the deployed build; the segment config belongs to the PAGE actually
// rendered. Both dynamic and revalidate=0 are set deliberately: one forces
// per-request rendering, the other forbids any cached revalidation of it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WebAppHomePage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell subtitle={t("dashboardSubtitle")}>
      <WebAppEntryGate />
      <DashboardOverview />
    </AppShell>
  );
}
