import { useTranslations } from "next-intl";
import { StarField } from "@/components/StarField";
import { FeatureCard } from "@/components/FeatureCard";
import { DownloadButtons } from "@/components/DownloadButtons";
import { MarketingPricingSection } from "@/components/MarketingPricingSection";

const FEATURE_KEYS = [
  { key: "birthChart", icon: "🪐" },
  { key: "synastry", icon: "💫" },
  { key: "discovery", icon: "🔮" },
  { key: "horoscope", icon: "⭐" },
  { key: "transits", icon: "🌙" },
  { key: "superLikes", icon: "✨" },
] as const;

const STEP_KEYS = ["step1", "step2", "step3"] as const;

export default function LandingPage({
  params: _params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Need to unwrap params for setRequestLocale but useTranslations works without it in server components
  const hero = useTranslations("hero");
  const feat = useTranslations("features");
  const how = useTranslations("howItWorks");
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
      <MarketingPricingSection />

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
