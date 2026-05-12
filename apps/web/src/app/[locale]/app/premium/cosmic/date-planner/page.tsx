import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function DatePlannerPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("datePlannerComingSoonTitle")}
      subtitle={t("datePlannerComingSoonBody")}
    >
      <EmptyState
        icon="🌒"
        title={t("datePlannerComingSoonTitle")}
        body={t("datePlannerComingSoonBody")}
        action={
          <Link
            href="/app/premium/cosmic"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("backToCosmicHub")}
          </Link>
        }
      />
    </AppShell>
  );
}
