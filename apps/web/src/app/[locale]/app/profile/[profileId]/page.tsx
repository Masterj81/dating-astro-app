import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/AppShell";
import { ProfileOverview } from "@/components/ProfileOverview";

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
