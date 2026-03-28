import { redirect } from "@/i18n/navigation";

export default async function LegacyDailyHoroscopePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  redirect({
    href: "/app/premium/cosmic/daily-horoscope",
    locale,
  });
}
