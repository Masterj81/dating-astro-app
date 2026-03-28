import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return {
    title: t("title"),
    description: t("intro").slice(0, 160),
  };
}

export default function PrivacyPage() {
  const t = useTranslations("privacy");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-1 text-3xl font-bold text-white">{t("title")}</h1>
      <p className="mb-8 text-sm text-text-dim">{t("effectiveDate")}</p>
      <p className="mb-6 text-text-muted">{t("intro")}</p>

      {/* 1 */}
      <Section title={t("s1")}>
        <h3 className="mt-4 mb-2 font-medium text-gray-300">{t("s1_1")}</h3>
        <Table
          headers={[t("tableCategory"), t("tableExamples")]}
          rows={[
            [t("s1_1_cat1"), t("s1_1_ex1")],
            [t("s1_1_cat2"), t("s1_1_ex2")],
            [t("s1_1_cat3"), t("s1_1_ex3")],
            [t("s1_1_cat4"), t("s1_1_ex4")],
            [t("s1_1_cat5"), t("s1_1_ex5")],
            [t("s1_1_cat6"), t("s1_1_ex6")],
          ]}
        />
        <h3 className="mt-6 mb-2 font-medium text-gray-300">{t("s1_2")}</h3>
        <Table
          headers={[t("tableCategory"), t("tableExamples")]}
          rows={[
            [t("s1_2_cat1"), t("s1_2_ex1")],
            [t("s1_2_cat2"), t("s1_2_ex2")],
            [t("s1_2_cat3"), t("s1_2_ex3")],
            [t("s1_2_cat4"), t("s1_2_ex4")],
            [t("s1_2_cat5"), t("s1_2_ex5")],
          ]}
        />
        <h3 className="mt-6 mb-2 font-medium text-gray-300">{t("s1_3")}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>{t("s1_3_social")}</li>
          <li>{t("s1_3_geo")}</li>
        </ul>
      </Section>

      {/* 2 */}
      <Section title={t("s2")}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>{t("s2_provide")}</li>
          <li>{t("s2_personalize")}</li>
          <li>{t("s2_safety")}</li>
          <li>{t("s2_comm")}</li>
          <li>{t("s2_subs")}</li>
          <li>{t("s2_improve")}</li>
          <li>{t("s2_legal")}</li>
        </ul>
      </Section>

      {/* 3 */}
      <Section title={t("s3")}>
        <p className="mb-2 text-sm text-text-muted">{t("s3_intro")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>{t("s3_item1")}</li>
          <li>{t("s3_item2")}</li>
          <li>{t("s3_item3")}</li>
        </ul>
        <p className="mt-2 text-sm text-text-muted">{t("s3_note")}</p>
      </Section>

      {/* 4 */}
      <Section title={t("s4")}>
        <h3 className="mt-4 mb-2 font-medium text-gray-300">{t("s4_1")}</h3>
        <p className="text-sm text-text-muted">{t("s4_1_text")}</p>
        <h3 className="mt-4 mb-2 font-medium text-gray-300">{t("s4_2")}</h3>
        <Table
          headers={[t("s4_2_provider"), t("s4_2_purpose"), t("s4_2_data")]}
          rows={[
            ["Supabase", "Database hosting, authentication, file storage", "All account, profile, match, and message data"],
            ["Sentry", "Crash reporting & performance monitoring", "Error traces, device info, user ID"],
            ["RevenueCat", "Subscription & in-app purchase management", "User ID, entitlement status, subscription tier"],
            ["Expo", "Push notification delivery", "Push token, device type"],
            ["OpenStreetMap / Nominatim", "Geocoding", "City name only"],
          ]}
        />
        <p className="mt-2 text-sm text-text-muted">{t("s4_2_note")}</p>
        <h3 className="mt-4 mb-2 font-medium text-gray-300">{t("s4_3")}</h3>
        <p className="text-sm text-text-muted">{t("s4_3_text")}</p>
        <h3 className="mt-4 mb-2 font-medium text-gray-300">{t("s4_4")}</h3>
        <p className="text-sm text-text-muted">{t("s4_4_text")}</p>
      </Section>

      {/* 5 */}
      <Section title={t("s5")}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>{t("s5_active")}</li>
          <li>{t("s5_deleted")}</li>
          <li>{t("s5_messages")}</li>
          <li>{t("s5_crash")}</li>
          <li>{t("s5_legal")}</li>
        </ul>
      </Section>

      {/* 6 */}
      <Section title={t("s6")}>
        <p className="mb-2 text-sm text-text-muted">{t("s6_intro")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>{t("s6_tls")}</li>
          <li>{t("s6_rest")}</li>
          <li>{t("s6_rls")}</li>
          <li>{t("s6_tokens")}</li>
          <li>{t("s6_hash")}</li>
        </ul>
        <p className="mt-2 text-sm text-text-muted">{t("s6_note")}</p>
      </Section>

      {/* 7 */}
      <Section title={t("s7")}>
        <p className="mb-2 text-sm text-text-muted">{t("s7_intro")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>{t("s7_access")}</li>
          <li>{t("s7_correction")}</li>
          <li>{t("s7_deletion")}</li>
          <li>{t("s7_portability")}</li>
          <li>{t("s7_objection")}</li>
          <li>{t("s7_withdraw")}</li>
        </ul>
        <h3 className="mt-4 mb-2 font-medium text-gray-300">{t("s7_controls")}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>{t("s7_ctrl1")}</li>
          <li>{t("s7_ctrl2")}</li>
          <li>{t("s7_ctrl3")}</li>
          <li>{t("s7_ctrl4")}</li>
          <li>{t("s7_ctrl5")}</li>
        </ul>
        <h3 className="mt-4 mb-2 font-medium text-gray-300">{t("s7_ccpa")}</h3>
        <p className="mb-2 text-sm text-text-muted">{t("s7_ccpa_intro")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>{t("s7_ccpa1")}</li>
          <li>{t("s7_ccpa2")}</li>
          <li>{t("s7_ccpa3")}</li>
          <li>{t("s7_ccpa4")}</li>
        </ul>
        <h3 className="mt-4 mb-2 font-medium text-gray-300">{t("s7_gdpr")}</h3>
        <p className="mb-2 text-sm text-text-muted">{t("s7_gdpr_intro")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>{t("s7_gdpr1")}</li>
          <li>{t("s7_gdpr2")}</li>
          <li>{t("s7_gdpr3")}</li>
          <li>{t("s7_gdpr4")}</li>
        </ul>
        <p className="mt-2 text-sm text-text-muted">{t("s7_gdpr_note")}</p>
      </Section>

      {/* 8-12 */}
      <Section title={t("s8")}>
        <p className="text-sm text-text-muted">{t("s8_text")}</p>
      </Section>
      <Section title={t("s9")}>
        <p className="text-sm text-text-muted">{t("s9_text")}</p>
      </Section>
      <Section title={t("s10")}>
        <p className="text-sm text-text-muted">{t("s10_text")}</p>
      </Section>
      <Section title={t("s11")}>
        <p className="text-sm text-text-muted">{t("s11_text")}</p>
      </Section>
      <Section title={t("s12")}>
        <div className="rounded-lg bg-bg-secondary p-4">
          <p className="mb-2 text-sm text-text-muted">{t("s12_text")}</p>
          <p className="text-sm text-text-muted">
            <strong>Email:</strong>{" "}
            <a href="mailto:privacy@astrodatingapp.com" className="text-purple-light hover:underline">
              privacy@astrodatingapp.com
            </a>
          </p>
          <p className="mt-2 text-sm text-text-muted">{t("s12_response")}</p>
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

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className="border border-border bg-bg-secondary px-3 py-2 text-left text-purple">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border border-border px-3 py-2 text-text-muted">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
