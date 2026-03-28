import { redirect } from "next/navigation";

type SettingsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { locale } = await params;
  redirect(`/${locale}/app/profile`);
}
