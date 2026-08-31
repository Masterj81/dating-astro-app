import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { routing } from "@/i18n/routing";
import { LocaleProviders } from "@/components/LocaleProviders";
import { IOSInstallGuideModal } from "@/components/IOSInstallGuideModal";
import { PreferredLanguageSync } from "@/components/PreferredLanguageSync";
import { WebActivityTracker } from "@/components/WebActivityTracker";
import { EmailLandingTracker } from "@/components/EmailLandingTracker";
import { SITE } from "@/lib/constants";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "hero" });

  const canonicalUrl =
    locale === routing.defaultLocale
      ? SITE.url
      : `${SITE.url}/${locale}`;

  const languages: Record<string, string> = {};
  for (const loc of routing.locales) {
    languages[loc] =
      loc === routing.defaultLocale ? SITE.url : `${SITE.url}/${loc}`;
  }

  return {
    title: {
      default: `${SITE.name} — ${t("tagline")}`,
      template: `%s | ${SITE.name}`,
    },
    description: t("description"),
    metadataBase: new URL(SITE.url),
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    openGraph: {
      title: `${SITE.name} — ${t("tagline")}`,
      description: t("description"),
      url: SITE.url,
      siteName: SITE.name,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${SITE.name} — ${t("tagline")}`,
      description: t("description"),
      images: ["/og-image.png"],
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon.png", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    manifest: "/manifest.json",
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className="dark">
      <head>
        <meta name="theme-color" content="#0f0d17" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen flex flex-col">
        <LocaleProviders locale={locale} messages={messages}>
          {children}
          <IOSInstallGuideModal />
          <PreferredLanguageSync />
          {/* Writes profiles.last_active. Global, not inside AppShell: a
              reader who returns to the localised home page and never opens
              /app is still a D+1 return. iOS reaches JUNO through the PWA,
              so without this every iOS reader is invisible to retention. */}
          <WebActivityTracker />
          {/* Records email_clicked when a landing carries ?template=… from a
              lifecycle CTA. Global, so every current and future CTA target is
              covered without wiring each page. */}
          <EmailLandingTracker />
        </LocaleProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
