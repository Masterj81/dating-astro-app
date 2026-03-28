import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "terms" });
  return {
    title: t("title"),
    description: t("intro").slice(0, 160),
  };
}

const SECTION_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"] as const;

export default function TermsPage() {
  const t = useTranslations("terms");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-1 text-3xl font-bold text-white">{t("title")}</h1>
      <p className="mb-4 text-sm text-text-dim">{t("effectiveDate")}</p>
      <p className="mb-8 text-text-muted">{t("intro")}</p>

      {SECTION_KEYS.map((key) => (
        <section key={key} className="mb-8">
          <h2 className="mb-3 border-b border-border pb-2 text-xl font-semibold text-accent">
            {t(key)}
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-text-muted">
            {t(`${key}_text`)}
          </p>
        </section>
      ))}
    </div>
  );
}
