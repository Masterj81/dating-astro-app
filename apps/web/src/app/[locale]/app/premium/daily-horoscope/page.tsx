import { redirect } from "@/i18n/navigation";

// JUNO-13 (diag) : le layout force-dynamic ne se propage pas sur le runtime Vercel ;
// chaque page porte son propre segment config.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

