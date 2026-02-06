import { useTranslations } from "next-intl";
import { StarField } from "@/components/StarField";
import { FeatureCard } from "@/components/FeatureCard";
import { DownloadButtons } from "@/components/DownloadButtons";

const FEATURE_KEYS = [
  { key: "birthChart", icon: "🪐" },
  { key: "synastry", icon: "💫" },
  { key: "discovery", icon: "🔮" },
  { key: "horoscope", icon: "⭐" },
  { key: "transits", icon: "🌙" },
  { key: "superLikes", icon: "✨" },
] as const;

const STEP_KEYS = ["step1", "step2", "step3"] as const;

const FREE_FEATURES = [
  "featureBasicChart",
  "feature10Likes",
  "featureBasicCompat",
  "featureDailyHoroscope",
] as const;

const CELESTIAL_FEATURES = [
  "featureFullChart",
  "featureUnlimitedLikes",
  "featureSynastry",
  "featureAdvancedFilters",
  "featureSeeWhoLiked",
  "feature5SuperLikes",
  "featureWeeklyHoroscopes",
] as const;

const COSMIC_FEATURES = [
  "featureEverythingCelestial",
  "featureMonthlyYearlyHoroscopes",
  "featureUnlimitedSuperLikes",
  "featureTransitAlerts",
  "featurePriority",
  "featureReadReceipts",
  "featureBoost",
] as const;

export default function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Need to unwrap params for setRequestLocale but useTranslations works without it in server components
  const hero = useTranslations("hero");
  const feat = useTranslations("features");
  const how = useTranslations("howItWorks");
  const prem = useTranslations("premium");
  const cta = useTranslations("cta");

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-bg via-bg-secondary to-bg-tertiary py-24 sm:py-32">
        <StarField count={100} />
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full border border-accent bg-bg-secondary/50 text-6xl text-accent">
            ✦
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {hero("tagline")}
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-text-muted">
            {hero("description")}
          </p>
          <div className="flex justify-center">
            <DownloadButtons />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-bg py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold text-white">
            {feat("title")}
          </h2>
          <p className="mb-12 text-center text-text-muted">
            {feat("subtitle")}
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_KEYS.map(({ key, icon }) => (
              <FeatureCard
                key={key}
                icon={icon}
                title={feat(key)}
                description={feat(`${key}Desc`)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        className="bg-gradient-to-b from-bg to-bg-secondary py-20"
      >
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold text-white">
            {how("title")}
          </h2>
          <p className="mb-12 text-center text-text-muted">
            {how("subtitle")}
          </p>
          <div className="grid gap-8 sm:grid-cols-3">
            {STEP_KEYS.map((key, i) => (
              <div key={key} className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-xl font-bold text-white">
                  {i + 1}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  {how(`${key}Title`)}
                </h3>
                <p className="text-sm text-text-muted">{how(`${key}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Premium */}
      <section id="premium" className="bg-bg-secondary py-20">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold text-white">
            {prem("title")}
          </h2>
          <p className="mb-12 text-center text-text-muted">
            {prem("subtitle")}
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {/* Free */}
            <PricingCard
              name={prem("free")}
              price={prem("freePrice")}
              period=""
              features={FREE_FEATURES.map((k) => prem(k))}
              cta={prem("getStarted")}
              highlighted={false}
            />
            {/* Celestial */}
            <PricingCard
              name={prem("celestial")}
              price={prem("celestialPrice")}
              period={prem("celestialPeriod")}
              features={CELESTIAL_FEATURES.map((k) => prem(k))}
              cta={prem("upgrade")}
              highlighted
              badge={prem("mostPopular")}
            />
            {/* Cosmic */}
            <PricingCard
              name={prem("cosmic")}
              price={prem("cosmicPrice")}
              period={prem("cosmicPeriod")}
              features={COSMIC_FEATURES.map((k) => prem(k))}
              cta={prem("goCosmic")}
              highlighted={false}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        id="download"
        className="bg-gradient-to-b from-bg-secondary to-bg py-20"
      >
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white">
            {cta("title")}
          </h2>
          <p className="mb-8 text-text-muted">{cta("subtitle")}</p>
          <div className="flex justify-center">
            <DownloadButtons />
          </div>
        </div>
      </section>
    </>
  );
}

function PricingCard({
  name,
  price,
  period,
  features,
  cta,
  highlighted,
  badge,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  highlighted: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-6 ${
        highlighted
          ? "border-accent bg-accent/5"
          : "border-border bg-card"
      }`}
    >
      {badge && (
        <span className="mb-3 inline-block rounded-full bg-accent px-3 py-0.5 text-xs font-medium text-white">
          {badge}
        </span>
      )}
      <h3 className="text-xl font-bold text-white">{name}</h3>
      <div className="mt-2 mb-4">
        <span className="text-3xl font-bold text-white">{price}</span>
        {period && <span className="text-text-dim">{period}</span>}
      </div>
      <ul className="mb-6 space-y-2">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-sm text-text-muted"
          >
            <span className="mt-0.5 text-purple">✓</span>
            {f}
          </li>
        ))}
      </ul>
      <button
        className={`w-full rounded-full py-2.5 text-sm font-medium transition-colors ${
          highlighted
            ? "bg-accent text-white hover:bg-accent-hover"
            : "border border-border text-white hover:bg-card-hover"
        }`}
      >
        {cta}
      </button>
    </div>
  );
}
