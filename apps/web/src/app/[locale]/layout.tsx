import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { LocaleProviders } from "@/components/LocaleProviders";
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
    icons: { icon: "/favicon.png", apple: "/icon-192.png" },
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
        <meta name="theme-color" content="#e94560" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen flex flex-col">
        <LocaleProviders locale={locale} messages={messages}>
          {children}
        </LocaleProviders>
      </body>
    </html>
  );
}
