import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { FaqAccordion } from "@/components/FaqAccordion";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "help" });
  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

const CATEGORIES = [
  {
    nameKey: "catAccount",
    questions: ["createAccount", "changeBirthTime", "deleteAccount"],
  },
  {
    nameKey: "catMatching",
    questions: ["compatibility", "fewMatches", "superLike"],
  },
  {
    nameKey: "catBilling",
    questions: ["manageSub", "refund", "autoRenew"],
  },
  {
    nameKey: "catSafety",
    questions: ["report", "block", "locationShared"],
  },
  {
    nameKey: "catAstrology",
    questions: ["birthTime", "sunVsFull", "personalizedHoroscopes"],
  },
] as const;

export default function HelpPage() {
  const t = useTranslations("help");
  const c = useTranslations("common");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold text-white">{t("title")}</h1>
      <p className="mb-10 text-text-muted">{t("subtitle")}</p>

      {CATEGORIES.map((cat) => (
        <section key={cat.nameKey} className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-purple">
            {t(cat.nameKey)}
          </h2>
          <div>
            {cat.questions.map((qKey) => (
              <FaqAccordion
                key={qKey}
                question={t(`q_${qKey}`)}
                answer={t(`a_${qKey}`)}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="mt-12 rounded-xl border border-border bg-card p-6 text-center">
        <h3 className="mb-2 text-lg font-semibold text-white">
          {t("stillNeedHelp")}
        </h3>
        <p className="mb-4 text-sm text-text-muted">
          {t("stillNeedHelpDesc")}
        </p>
        <Link
          href="/contact"
          className="inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {c("contactSupport")}
        </Link>
      </div>
    </div>
  );
}
