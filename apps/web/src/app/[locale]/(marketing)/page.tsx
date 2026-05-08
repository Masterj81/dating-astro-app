import { useTranslations } from "next-intl";
import { StarField } from "@/components/StarField";
import { FeatureCard } from "@/components/FeatureCard";
import { DownloadButtons } from "@/components/DownloadButtons";
import { MarketingPricingSection } from "@/components/MarketingPricingSection";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PhoneMockupPlaceholder } from "@/components/PhoneMockupPlaceholder";
import {
  BirthChartIcon,
  SynastryIcon,
  DiscoveryIcon,
  HoroscopeIcon,
  TransitsIcon,
  ProfileIcon,
  DiscoverPeopleIcon,
  ConversationIcon,
} from "@/components/MarketingIcons";

const FEATURE_KEYS = [
  { key: "birthChart", Icon: BirthChartIcon },
  { key: "synastry", Icon: SynastryIcon },
  { key: "discovery", Icon: DiscoveryIcon },
  { key: "horoscope", Icon: HoroscopeIcon },
  { key: "transits", Icon: TransitsIcon },
] as const;

const STEPS = [
  { key: "step1", Icon: ProfileIcon },
  { key: "step2", Icon: DiscoverPeopleIcon },
  { key: "step3", Icon: ConversationIcon },
] as const;

const PROOF_KEYS = ["proofRating", "proofTags", "proofEngine"] as const;

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "AstroDating",
  "description": "Astrology-based dating app",
  "applicationCategory": "DatingApplication",
  "url": "https://astrodatingapp.com",
  "operatingSystem": "iOS, Android",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
  },
};

export default function LandingPage({
  params: _params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const hero = useTranslations("hero");
  const feat = useTranslations("features");
  const how = useTranslations("howItWorks");
  const cta = useTranslations("cta");
  const social = useTranslations("socialProof");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-bg via-bg-secondary to-bg-tertiary py-20 sm:py-28">
        <StarField />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(232,93,117,0.12),transparent)]" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
          {/* Left column: copy + CTAs */}
          <div className="text-center lg:text-left">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.3em] text-accent">
              {hero("badge")}
            </p>
            <h1 className="mb-5 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {hero("tagline")}
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-text-muted lg:mx-0">
              {hero("description")}
            </p>
            <div className="flex justify-center lg:justify-start">
              <DownloadButtons />
            </div>

            {/* Trust strip — qualitative proofs only, no invented stats */}
            <ul
              className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-2 lg:mx-0 lg:justify-start"
              aria-label="What sets AstroDating apart"
            >
              {PROOF_KEYS.map((key, i) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-white/85"
                >
                  {i === 0 ? (
                    <span aria-hidden="true" className="text-accent">★ 4.8</span>
                  ) : null}
                  <span>{social(key)}</span>
                </li>
              ))}
            </ul>

            {/* Inline install prompt — auto-shows on iOS / Android Chrome only */}
            <div className="mx-auto mt-6 max-w-md lg:mx-0">
              <InstallPrompt />
            </div>
          </div>

          {/* Right column: phone mockup */}
          <div className="flex justify-center lg:justify-end">
            <PhoneMockupPlaceholder />
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
            {FEATURE_KEYS.map(({ key, Icon }) => (
              <FeatureCard
                key={key}
                icon={<Icon size={28} />}
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
            {STEPS.map(({ key, Icon }, i) => (
              <div key={key} className="group text-center">
                <div className="relative mx-auto mb-5">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/8 text-accent shadow-[0_0_30px_rgba(232,93,117,0.1)] transition-transform group-hover:scale-105" aria-hidden="true">
                    <Icon size={28} />
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
