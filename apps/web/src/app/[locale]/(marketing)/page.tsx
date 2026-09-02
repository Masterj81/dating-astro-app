import { useTranslations } from "next-intl";
import { StarField } from "@/components/StarField";
import { GlassCard } from "@/components/GlassCard";
import { DownloadButtons } from "@/components/DownloadButtons";
import { MarketingPricingSection } from "@/components/MarketingPricingSection";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PhoneMockupPlaceholder } from "@/components/PhoneMockupPlaceholder";
import { HeroSynastryTriptych } from "@/components/HeroSynastryTriptych";
import { CompatibilityDotsArc } from "@/components/CompatibilityDotsArc";
import { ValuePillCloud } from "@/components/ValuePillCloud";
import { IntentPill } from "@/components/IntentPill";
import { LifestyleTagsCloud } from "@/components/LifestyleTagsCloud";
import { VoiceIntroDemo } from "@/components/VoiceIntroDemo";
import { IcebreakerBubble } from "@/components/IcebreakerBubble";
import {
  ProfileIcon,
  DiscoverPeopleIcon,
  ConversationIcon,
} from "@/components/MarketingIcons";

const STEPS = [
  { key: "step1", Icon: ProfileIcon },
  { key: "step2", Icon: DiscoverPeopleIcon },
  { key: "step3", Icon: ConversationIcon },
] as const;

// Sample data shown in the feature cards. Hardcoded EN strings for Phase 2 P0;
// values, tags, and intents come from the same vocabulary the mobile profile
// uses (apps/mobile/data/profile-fields.ts) so we never demo a tag the app
// can't actually offer.
const DEMO_VALUES = ["Family", "Growth", "Honesty", "Freedom", "Spirituality", "Adventure"];
const DEMO_LIFESTYLE = ["Outdoor", "Sober-curious", "Yoga", "Plant parent", "Reader"];
const DEMO_LIFESTYLE_SHARED = ["Outdoor", "Yoga"];

const PROOF_KEYS = ["proofRating", "proofTags", "proofEngine"] as const;

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "JUNO",
  "description": "Love, friendship, working chemistry — see the synastry between two charts before the conversation starts. Birth-chart context, guided intros, voice-led profiles.",
  "applicationCategory": "LifestyleApplication",
  "url": "https://www.junosynastry.com",
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
  const proof = useTranslations("marketingProof");
  const intents = useTranslations("intentionsSection");
  const frames = useTranslations("frameSection");
  const work = useTranslations("workingChemistrySection");

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

        {/* Hero — single-column composition. Copy block centered on top,
            then the three-frame triptych below as the visual focal point.
            The triptych sells JUNO's "same chart, different lens" stance
            before the user reads anything; the copy reinforces what they
            just saw. */}
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-10 overflow-hidden px-4 sm:gap-14">
          {/* Copy block — centered for the vertical hero composition */}
          <div className="mx-auto w-full max-w-3xl text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.24em] text-accent sm:text-sm sm:tracking-[0.3em]">
              {hero("badge")}
            </p>
            <h1 className="mb-5 text-3xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {hero("tagline")}
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg">
              {hero("description")}
            </p>
            <div className="mx-auto flex w-full max-w-sm justify-center sm:max-w-none">
              <DownloadButtons />
            </div>

            {/* Trust strip — qualitative proofs only, no invented stats */}
            <ul
              className="mx-auto mt-8 flex max-w-full flex-wrap items-center justify-center gap-2"
              aria-label="What sets JUNO apart"
            >
              {PROOF_KEYS.map((key, i) => (
                <li
                  key={key}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-white/85"
                >
                  {i === 0 ? (
                    <span aria-hidden="true" className="text-accent">★ 4.8</span>
                  ) : null}
                  <span className="truncate">{social(key)}</span>
                </li>
              ))}
            </ul>

            {/* Inline install prompt — auto-shows on iOS / Android Chrome only */}
            <div className="mx-auto mt-6 max-w-md">
              <InstallPrompt />
            </div>
          </div>

          {/* Three-frame triptych — the actual product surface visualized
              under all three reading frames. Mobile collapses to just the
              center (Love) phone; md+ shows all three with perspective. */}
          <HeroSynastryTriptych />
        </div>
      </section>

      {/* Product proof strip — three real screenshots in mini iPhone
          frames, sitting between the hero and the features bento. Mockups
          load lazily; the hero discover.png keeps priority for LCP. */}
      <section className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:pb-20 sm:pt-12">
        <header className="mx-auto mb-8 max-w-2xl text-center sm:mb-12">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            {proof("marketingProofTitle")}
          </h2>
        </header>
        <ul className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6 md:gap-8">
          {[
            { src: "/screenshots/chat.png", label: proof("marketingProofChat") },
            { src: "/screenshots/compatibility.png", label: proof("marketingProofCompatibility") },
            { src: "/screenshots/premium-cosmic.png", label: proof("marketingProofReflection") },
          ].map((item) => (
            <li key={item.src} className="flex flex-col items-center gap-4">
              <PhoneMockupPlaceholder
                src={item.src}
                alt={item.label}
                priority={false}
                maxWidthClassName="max-w-[200px] sm:max-w-[220px]"
                sizes="(max-width: 640px) 200px, 220px"
              />
              <p className="text-sm font-medium text-text-muted">{item.label}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Three intentions — Love / Friendship / Business.
          Sells JUNO positively: same synastry engine, three different
          connection contexts. No outcome promises. */}
      <section id="intentions" className="bg-bg-secondary py-24">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.24em] text-accent sm:text-sm sm:tracking-[0.3em]">
            {intents("badge")}
          </p>
          <h2 className="mb-3 text-center text-3xl font-bold text-white sm:text-4xl">
            {intents("title")}
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-text-muted">
            {intents("subtitle")}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <GlassCard className="p-6">
              <div className="mb-4 flex justify-center">
                <IntentPill label={intents("loveTitle")} tone="longTerm" />
              </div>
              <h3 className="text-center text-lg font-semibold text-white">
                {intents("loveTitle")}
              </h3>
              <p className="mt-2 text-center text-sm leading-relaxed text-text-muted">
                {intents("loveDesc")}
              </p>
            </GlassCard>

            <GlassCard className="p-6">
              <div className="mb-4 flex justify-center">
                <IntentPill label={intents("friendshipTitle")} tone="friendship" />
              </div>
              <h3 className="text-center text-lg font-semibold text-white">
                {intents("friendshipTitle")}
              </h3>
              <p className="mt-2 text-center text-sm leading-relaxed text-text-muted">
                {intents("friendshipDesc")}
              </p>
            </GlassCard>

            <GlassCard className="p-6">
              <div className="mb-4 flex justify-center">
                <IntentPill label={intents("businessTitle")} tone="casual" />
              </div>
              <h3 className="text-center text-lg font-semibold text-white">
                {intents("businessTitle")}
              </h3>
              <p className="mt-2 text-center text-sm leading-relaxed text-text-muted">
                {intents("businessDesc")}
              </p>
            </GlassCard>
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-text-dim sm:text-sm">
            {intents("footnote")}
          </p>
        </div>
      </section>

      {/* Same chart, different lens — explains the reading-frame model:
          one synastry engine, three reading frames. Reinforces the
          intentions section. */}
      <section id="frames" className="bg-bg py-24">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.24em] text-purple sm:text-sm sm:tracking-[0.3em]">
            {frames("badge")}
          </p>
          <h2 className="mb-3 text-center text-3xl font-bold text-white sm:text-4xl">
            {frames("title")}
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-text-muted">
            {frames("subtitle")}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <GlassCard className="p-6">
              <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-accent/85">
                {intents("loveTitle")}
              </p>
              <h3 className="text-lg font-semibold text-white">
                {frames("loveLensTitle")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {frames("loveLensDesc")}
              </p>
            </GlassCard>

            <GlassCard className="p-6">
              <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-purple/85">
                {intents("friendshipTitle")}
              </p>
              <h3 className="text-lg font-semibold text-white">
                {frames("friendshipLensTitle")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {frames("friendshipLensDesc")}
              </p>
            </GlassCard>

            <GlassCard className="p-6">
              <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-gold-muted">
                {intents("businessTitle")}
              </p>
              <h3 className="text-lg font-semibold text-white">
                {frames("businessLensTitle")}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {frames("businessLensDesc")}
              </p>
            </GlassCard>
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-text-dim sm:text-sm">
            {frames("footnote")}
          </p>
        </div>
      </section>

      {/* Working chemistry — what the business frame actually surfaces.
          Carefully framed as "reflection, not advice"; no success promises,
          no legal/financial/hiring claims. */}
      <section id="working-chemistry" className="bg-gradient-to-b from-bg to-bg-secondary py-24">
        <div className="mx-auto max-w-5xl px-4">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.24em] text-accent sm:text-sm sm:tracking-[0.3em]">
            {work("badge")}
          </p>
          <h2 className="mb-3 text-center text-3xl font-bold text-white sm:text-4xl">
            {work("title")}
          </h2>
          <p className="mx-auto mb-12 max-w-2xl text-center text-text-muted">
            {work("subtitle")}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { titleKey: "pillarCommunicationTitle", descKey: "pillarCommunicationDesc" },
              { titleKey: "pillarTrustTitle",         descKey: "pillarTrustDesc" },
              { titleKey: "pillarDecisionTitle",      descKey: "pillarDecisionDesc" },
              { titleKey: "pillarFrictionTitle",      descKey: "pillarFrictionDesc" },
              { titleKey: "pillarStyleTitle",         descKey: "pillarStyleDesc" },
            ].map((p) => (
              <GlassCard key={p.titleKey} className="p-6">
                <h3 className="text-base font-semibold text-white sm:text-lg">
                  {work(p.titleKey)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  {work(p.descKey)}
                </p>
              </GlassCard>
            ))}
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-text-dim sm:text-sm">
            {work("footnote")}
          </p>
        </div>
      </section>

      {/* Features — product-first (Phase 2). The astrology-only feature
          grid (birthChart/synastry/discovery/horoscope/transits) used to
          live here; horoscope and transits remain promoted in the
          MarketingPricingSection where they're tier features. */}
      <section id="features" className="bg-bg py-24">
        <div className="mx-auto max-w-6xl px-4">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.24em] text-accent sm:text-sm sm:tracking-[0.3em]">
            {feat("badge")}
          </p>
          <h2 className="mb-3 text-center text-3xl font-bold text-white sm:text-4xl">
            {feat("title")}
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-text-muted">
            {feat("subtitle")}
          </p>

          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* 1 — Compatibility, decoded */}
            <GlassCard className="p-6">
              <div className="mb-5 flex justify-center">
                <CompatibilityDotsArc percentage={82} size={140} />
              </div>
              <p className="mb-1 text-center text-[11px] uppercase tracking-[0.2em] text-accent/85">
                {feat("compatibilityVerdict")}
              </p>
              <h3 className="text-center text-base font-semibold text-white sm:text-lg">
                {feat("compatibility")}
              </h3>
              <p className="mt-1 text-center text-sm leading-relaxed text-text-muted">
                {feat("compatibilityDesc")}
              </p>
            </GlassCard>

            {/* 2 — Match on values */}
            <GlassCard className="p-6">
              <div className="mb-5 flex min-h-[140px] items-center justify-center">
                <ValuePillCloud values={DEMO_VALUES} className="justify-center" />
              </div>
              <h3 className="text-base font-semibold text-white sm:text-lg">
                {feat("values")}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {feat("valuesDesc")}
              </p>
            </GlassCard>

            {/* 3 — Show your intent */}
            <GlassCard className="p-6">
              <div className="mb-5 flex min-h-[140px] flex-col items-center justify-center gap-2">
                <IntentPill label={feat("intentLongTerm")} tone="longTerm" />
                <IntentPill label={feat("intentCasual")} tone="casual" />
                <IntentPill label={feat("intentFriendship")} tone="friendship" />
              </div>
              <h3 className="text-base font-semibold text-white sm:text-lg">
                {feat("intent")}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {feat("intentDesc")}
              </p>
            </GlassCard>

            {/* 4 — Hear their voice */}
            <GlassCard className="p-6">
              <div className="mb-5 flex min-h-[140px] items-center">
                <VoiceIntroDemo className="w-full" />
              </div>
              <h3 className="text-base font-semibold text-white sm:text-lg">
                {feat("voice")}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {feat("voiceDesc")}
              </p>
            </GlassCard>

            {/* 5 — Start with an icebreaker */}
            <GlassCard className="p-6">
              <div className="mb-5 flex min-h-[140px] items-center">
                <IcebreakerBubble
                  caption={feat("icebreakerCaption")}
                  question={feat("icebreakerExample")}
                  className="w-full"
                />
              </div>
              <h3 className="text-base font-semibold text-white sm:text-lg">
                {feat("icebreaker")}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {feat("icebreakerDesc")}
              </p>
            </GlassCard>

            {/* 6 — See what you share */}
            <GlassCard className="p-6">
              <div className="mb-5 flex min-h-[140px] items-center justify-center">
                <LifestyleTagsCloud
                  tags={DEMO_LIFESTYLE}
                  sharedTags={DEMO_LIFESTYLE_SHARED}
                />
              </div>
              <h3 className="text-base font-semibold text-white sm:text-lg">
                {feat("shared")}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {feat("sharedDesc")}
              </p>
            </GlassCard>
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
