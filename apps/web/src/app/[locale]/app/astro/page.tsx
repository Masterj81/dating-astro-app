import { AppShell } from "@/components/AppShell";
import { AstroPortal } from "@/components/AstroPortal";
import { getTranslations } from "next-intl/server";

/**
 * /app/astro — the portal that reunites both reading tiers.
 *
 * Route choice (mission step 2): a FIRST-LEVEL /app/astro path rather than
 * a third /app/premium/* entry, because the premium segment is the TIER
 * namespace (celestial/, cosmic/) and Astro is not a tier — it is the door
 * to both. Keeping it out of premium/ also keeps the mobile tab's target
 * honest: one neutral URL, no implied tier.
 *
 * The hubs it links to are untouched and remain directly reachable
 * (step 7 — legacy deep links keep working; nothing redirects here).
 */
export default async function AstroPortalPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("astroNav")} subtitle={t("astroPortalSubtitle")}>
      <AstroPortal />
    </AppShell>
  );
}
