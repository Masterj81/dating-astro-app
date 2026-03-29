"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatPrice, type PriceMap } from "@/lib/billingPriceFormat";

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

export function MarketingPricingSection() {
  const prem = useTranslations("premium");
  const locale = useLocale();
  const router = useRouter();
  const [prices, setPrices] = useState<PriceMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/billing/prices", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.error) setPrices(data);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const periodLabels = {
    monthly: prem("periodMonth"),
    yearly: prem("periodYear"),
  };

  const fallback = prem("seePlans");

  const celestialPrice = formatPrice(
    prices.celestial_monthly ?? null,
    locale,
    periodLabels,
    fallback
  );

  const cosmicPrice = formatPrice(
    prices.cosmic_monthly ?? null,
    locale,
    periodLabels,
    fallback
  );

  return (
    <section id="premium" className="bg-bg-secondary py-20">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="mb-2 text-center text-3xl font-bold text-white">
          {prem("title")}
        </h2>
        <p className="mb-12 text-center text-text-muted">
          {prem("subtitle")}
        </p>
        <div className="grid gap-6 sm:grid-cols-3">
          <PricingCard
            name={prem("free")}
            price={prem("freePrice")}
            period=""
            features={FREE_FEATURES.map((k) => prem(k))}
            cta={prem("getStarted")}
            highlighted={false}
            loading={false}
            onCtaClick={() => router.push(`/${locale}/auth/signup`)}
          />
          <PricingCard
            name={prem("celestial")}
            price={celestialPrice}
            period=""
            features={CELESTIAL_FEATURES.map((k) => prem(k))}
            cta={prem("startFreeTrial")}
            highlighted
            badge={prem("mostPopular")}
            loading={!loaded}
            onCtaClick={() => router.push(`/${locale}/app/plans`)}
            trialNote={prem("trialNote")}
          />
          <PricingCard
            name={prem("cosmic")}
            price={cosmicPrice}
            period=""
            features={COSMIC_FEATURES.map((k) => prem(k))}
            cta={prem("startFreeTrial")}
            highlighted={false}
            loading={!loaded}
            onCtaClick={() => router.push(`/${locale}/app/plans`)}
            trialNote={prem("trialNote")}
          />
        </div>
      </div>
    </section>
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
  loading,
  onCtaClick,
  trialNote,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  highlighted: boolean;
  badge?: string;
  loading: boolean;
  onCtaClick: () => void;
  trialNote?: string;
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
        {loading ? (
          <span className="inline-block h-8 w-24 animate-pulse rounded bg-white/10" />
        ) : (
          <>
            <span className="text-3xl font-bold text-white">{price}</span>
            {period && <span className="text-text-dim">{period}</span>}
          </>
        )}
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
        type="button"
        onClick={onCtaClick}
        className={`w-full rounded-full py-2.5 text-sm font-medium transition-colors ${
          highlighted
            ? "bg-accent text-white hover:bg-accent-hover"
            : "border border-border text-white hover:bg-card-hover"
        }`}
      >
        {cta}
      </button>
      {trialNote && (
        <p className="mt-2 text-center text-xs text-text-dim">{trialNote}</p>
      )}
    </div>
  );
}
