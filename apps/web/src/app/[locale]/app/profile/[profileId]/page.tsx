import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/AppShell";
import { ProfileOverview } from "@/components/ProfileOverview";

// JUNO-13 (diag) : le layout force-dynamic ne se propage pas sur le runtime Vercel ;
// chaque page porte son propre segment config.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type WebProfilePageProps = {
  params: Promise<{ locale: string; profileId: string }>;
};

export default async function WebProfilePage({ params }: WebProfilePageProps) {
  const [{ profileId }, t] = await Promise.all([
    params,
    getTranslations("webApp"),
  ]);

  return (
    <AppShell
      title={t("profilePageTitle")}
      subtitle={t("profilePageSubtitle")}
    >
      <ProfileOverview profileId={profileId} />
    </AppShell>
  );
}

