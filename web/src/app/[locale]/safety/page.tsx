import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "safety" });
  return {
    title: t("title"),
    description: t("intro").slice(0, 160),
  };
}

export default function SafetyPage() {
  const t = useTranslations("safety");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-1 text-3xl font-bold text-white">{t("title")}</h1>
      <p className="mb-8 text-sm text-text-dim">{t("effectiveDate")}</p>
      <p className="mb-6 text-text-muted">{t("intro")}</p>

      {/* Child Safety Policy */}
      <Section title={t("s1")}>
        <p className="mb-4 text-sm text-text-muted">{t("s1_intro")}</p>
        <div className="rounded-lg bg-red-900/20 border border-red-800 p-4 mb-4">
          <p className="text-sm text-red-300 font-medium">{t("s1_zeroTolerance")}</p>
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-muted">
          <li>{t("s1_csam")}</li>
          <li>{t("s1_exploitation")}</li>
          <li>{t("s1_minors")}</li>
          <li>{t("s1_grooming")}</li>
        </ul>
      </Section>

      {/* Age Verification */}
      <Section title={t("s2")}>
        <p className="mb-4 text-sm text-text-muted">{t("s2_intro")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-muted">
          <li>{t("s2_age18")}</li>
          <li>{t("s2_verification")}</li>
          <li>{t("s2_termination")}</li>
        </ul>
      </Section>

      {/* Safety Measures */}
      <Section title={t("s3")}>
        <p className="mb-4 text-sm text-text-muted">{t("s3_intro")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-muted">
          <li>{t("s3_ageVerification")}</li>
          <li>{t("s3_reporting")}</li>
          <li>{t("s3_moderation")}</li>
          <li>{t("s3_termination")}</li>
          <li>{t("s3_lawEnforcement")}</li>
          <li>{t("s3_ncmec")}</li>
        </ul>
      </Section>

      {/* Reporting */}
      <Section title={t("s4")}>
        <p className="mb-4 text-sm text-text-muted">{t("s4_intro")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-muted">
          <li>{t("s4_inApp")}</li>
          <li>{t("s4_email")}</li>
        </ul>
        <div className="mt-4 rounded-lg bg-bg-secondary p-4">
          <p className="text-sm text-text-muted">
            <strong>{t("s4_contactLabel")}</strong>{" "}
            <a href="mailto:safety@astrodatingapp.com" className="text-purple-light hover:underline">
              safety@astrodatingapp.com
            </a>
          </p>
        </div>
      </Section>

      {/* Community Guidelines */}
      <Section title={t("s5")}>
        <p className="mb-4 text-sm text-text-muted">{t("s5_intro")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-muted">
          <li>{t("s5_respect")}</li>
          <li>{t("s5_authentic")}</li>
          <li>{t("s5_noHarassment")}</li>
          <li>{t("s5_noHate")}</li>
          <li>{t("s5_noScams")}</li>
          <li>{t("s5_noExplicit")}</li>
        </ul>
      </Section>

      {/* Compliance */}
      <Section title={t("s6")}>
        <p className="mb-4 text-sm text-text-muted">{t("s6_intro")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-muted">
          <li>{t("s6_laws")}</li>
          <li>{t("s6_ncmec")}</li>
          <li>{t("s6_cooperation")}</li>
        </ul>
      </Section>

      {/* Contact */}
      <Section title={t("s7")}>
        <div className="rounded-lg bg-bg-secondary p-4">
          <p className="mb-2 text-sm text-text-muted">{t("s7_text")}</p>
          <p className="text-sm text-text-muted">
            <strong>Safety Team:</strong>{" "}
            <a href="mailto:safety@astrodatingapp.com" className="text-purple-light hover:underline">
              safety@astrodatingapp.com
            </a>
          </p>
          <p className="text-sm text-text-muted mt-1">
            <strong>General Support:</strong>{" "}
            <a href="mailto:support@astrodatingapp.com" className="text-purple-light hover:underline">
              support@astrodatingapp.com
            </a>
          </p>
          <p className="mt-3 text-sm text-text-muted">{t("s7_response")}</p>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 border-b border-border pb-2 text-xl font-semibold text-purple">{title}</h2>
      {children}
    </section>
  );
}
