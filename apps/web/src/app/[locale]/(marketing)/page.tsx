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
const STEP_ICONS = ["🌟", "🔮", "💬"] as const;

const SOCIAL_PROOF = [
  { stat: "50K+", labelKey: "proofDownloads" },
  { stat: "2M+", labelKey: "proofCharts" },
  { stat: "4.8", labelKey: "proofRating" },
] as const;

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
  const social = useTranslations("socialProof");

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-bg via-bg-secondary to-bg-tertiary py-28 sm:py-36">
        <StarField />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(232,93,117,0.12),transparent)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full border border-accent/40 bg-accent/8 text-5xl shadow-[0_0_60px_rgba(232,93,117,0.2)]" aria-hidden="true">
            ✦
          </div>
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.3em] text-accent">
            {hero("badge")}
          </p>
          <h1 className="mb-5 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {hero("tagline")}
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-text-muted">
            {hero("description")}
          </p>
          <div className="flex justify-center">
            <DownloadButtons />
          </div>

          {/* Social proof */}
          <div className="mx-auto mt-14 flex max-w-lg flex-wrap items-center justify-center gap-8 border-t border-border/50 pt-8">
            {SOCIAL_PROOF.map(({ stat, labelKey }) => (
              <div key={labelKey} className="text-center">
                <p className="text-2xl font-bold text-white">{stat}</p>
                <p className="mt-1 text-xs uppercase tracking-widest text-text-dim">
                  {social(labelKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-bg py-24">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-3 text-center text-sm font-medium uppercase tracking-[0.3em] text-accent">
            {feat("badge")}
          </p>
          <h2 className="mb-3 text-center text-3xl font-bold text-white sm:text-4xl">
            {feat("title")}
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-text-muted">
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
        className="bg-gradient-to-b from-bg to-bg-secondary py-24"
      >
        <div className="mx-auto max-w-4xl px-4">
          <p className="mb-3 text-center text-sm font-medium uppercase tracking-[0.3em] text-purple">
            {how("badge")}
          </p>
          <h2 className="mb-3 text-center text-3xl font-bold text-white sm:text-4xl">
            {how("title")}
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-text-muted">
            {how("subtitle")}
          </p>
          <div className="grid gap-8 sm:grid-cols-3">
            {STEP_KEYS.map((key, i) => (
              <div key={key} className="group text-center">
                <div className="relative mx-auto mb-5">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/8 text-2xl shadow-[0_0_30px_rgba(232,93,117,0.1)] transition-transform group-hover:scale-105" aria-hidden="true">
                    {STEP_ICONS[i]}
                  </div>
                  <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  {how(`${key}Title`)}
                </h3>
                <p className="text-sm leading-relaxed text-text-muted">{how(`${key}Desc`)}</p>
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
        className="relative overflow-hidden bg-gradient-to-b from-bg-secondary to-bg py-24"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_50%,rgba(118,129,255,0.1),transparent)]" />
        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <p className="mb-3 text-3xl" aria-hidden="true">✨</p>
          <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
            {cta("title")}
          </h2>
          <p className="mx-auto mb-10 max-w-lg text-text-muted">{cta("subtitle")}</p>
          <div className="flex justify-center">
            <DownloadButtons />
          </div>
        </div>
      </section>
    </>
  );
}
