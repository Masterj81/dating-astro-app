import { redirect } from "@/i18n/navigation";

export default async function LegacyNatalChartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  redirect({
    href: "/app/premium/celestial/natal-chart",
    locale,
  });
}
