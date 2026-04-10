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

function getAnnualSavings(
  prices: PriceMap,
  monthlyKey: string,
  yearlyKey: string
): number | null {
  const monthly = prices[monthlyKey]?.unitAmount;
  const yearly = prices[yearlyKey]?.unitAmount;
  if (monthly == null || yearly == null || monthly <= 0) return null;
  const annualized = monthly * 12;
  if (annualized <= yearly) return null;
  return Math.round(((annualized - yearly) / annualized) * 100);
}

export function MarketingPricingSection() {
  const prem = useTranslations("premium");
  const locale = useLocale();
  const router = useRouter();
  const [prices, setPrices] = useState<PriceMap>({});
  const [loaded, setLoaded] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly"
  );

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

  const celestialPriceKey =
    billingPeriod === "yearly" ? "celestial_yearly" : "celestial_monthly";
  const cosmicPriceKey =
    billingPeriod === "yearly" ? "cosmic_yearly" : "cosmic_monthly";

  const celestialPrice = formatPrice(
    prices[celestialPriceKey] ?? null,
    locale,
    periodLabels,
    fallback
  );

  const cosmicPrice = formatPrice(
    prices[cosmicPriceKey] ?? null,
    locale,
    periodLabels,
    fallback
  );

  const celestialSavings = getAnnualSavings(
    prices,
    "celestial_monthly",
    "celestial_yearly"
  );
  const cosmicSavings = getAnnualSavings(
    prices,
    "cosmic_monthly",
    "cosmic_yearly"
  );

  return (
    <section id="premium" className="bg-bg-secondary py-24">
      <div className="mx-auto max-w-5xl px-4">
        <p className="mb-3 text-center text-sm font-medium uppercase tracking-[0.3em] text-accent">
          {prem("badge")}
        </p>
        <h2 className="mb-3 text-center text-3xl font-bold text-white sm:text-4xl">
          {prem("title")}
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-center text-text-muted">
          {prem("subtitle")}
        </p>

        {/* Billing period toggle */}
        <div className="mb-10 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setBillingPeriod("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
              billingPeriod === "monthly"
                ? "bg-white/10 text-white"
                : "text-text-dim hover:text-white"
            }`}
          >
            {prem("toggleMonthly")}
          </button>
          <button
            type="button"
            onClick={() => setBillingPeriod("yearly")}
            className={`relative rounded-full px-5 py-2 text-sm font-medium transition-all ${
              billingPeriod === "yearly"
                ? "bg-white/10 text-white"
                : "text-text-dim hover:text-white"
            }`}
          >
            {prem("toggleYearly")}
            {celestialSavings ? (
              <span className="absolute -right-2 -top-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                -{celestialSavings}%
              </span>
            ) : null}
          </button>
        </div>

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
            cta={prem("startFreeTrialCelestial")}
            highlighted
            badge={prem("mostPopular")}
            loading={!loaded}
            onCtaClick={() => router.push(`/${locale}/app/plans`)}
            trialNote={prem("trialNote")}
            savingsBadge={
              billingPeriod === "yearly" && celestialSavings
                ? prem("savePercent", { percent: celestialSavings })
                : undefined
            }
          />
          <PricingCard
            name={prem("cosmic")}
            price={cosmicPrice}
            period=""
            features={COSMIC_FEATURES.map((k) => prem(k))}
            cta={prem("startFreeTrialCosmic")}
            highlighted={false}
            loading={!loaded}
            onCtaClick={() => router.push(`/${locale}/app/plans`)}
            trialNote={prem("trialNote")}
            savingsBadge={
              billingPeriod === "yearly" && cosmicSavings
                ? prem("savePercent", { percent: cosmicSavings })
                : undefined
            }
          />
        </div>

        {/* Trust signals */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-text-dim">
          <span className="flex items-center gap-1.5">
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-4 w-4 text-emerald-400"
              aria-hidden="true"
            >
              <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1.5V4.5A3.5 3.5 0 0 0 8 1Zm2 6H6V4.5a2 2 0 1 1 4 0V7Z" />
            </svg>
            {prem("trustSecure")}
          </span>
          <span className="flex items-center gap-1.5">
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-4 w-4 text-emerald-400"
              aria-hidden="true"
            >
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm-.75-4.5v1.5h1.5v-1.5h-1.5Zm.75-7a2.5 2.5 0 0 0-2.5 2.5h1.5a1 1 0 1 1 2 0c0 .53-.2.78-.75 1.25C7.6 7.8 7.25 8.4 7.25 9.5h1.5c0-.6.2-.85.75-1.31C10.15 7.65 10.5 7 10.5 6A2.5 2.5 0 0 0 8 3.5Z" />
            </svg>
            {prem("trustCancel")}
          </span>
          <span className="flex items-center gap-1.5">
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-4 w-4 text-emerald-400"
              aria-hidden="true"
            >
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm11.28-1.72-4.5 4.5a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06L6.25 9.19l3.97-3.97a.75.75 0 1 1 1.06 1.06Z" />
            </svg>
            {prem("trustTrial")}
          </span>
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
  savingsBadge,
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
  savingsBadge?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-7 transition-all duration-300 ${
        highlighted
          ? "scale-[1.02] border-accent/40 bg-accent/5 shadow-[0_0_40px_rgba(232,93,117,0.12)]"
          : "border-border bg-card hover:border-white/15"
      }`}
    >
      {highlighted && (
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/8" />
      )}
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div>
            {badge && (
              <span className="mb-3 inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                {badge}
              </span>
            )}
          </div>
          {savingsBadge && (
            <span className="inline-block rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-200">
              {savingsBadge}
            </span>
          )}
        </div>
        <h3 className="text-xl font-bold text-white">{name}</h3>
        <div className="mt-3 mb-5">
          {loading ? (
            <span className="inline-block h-8 w-24 animate-pulse rounded bg-white/10" role="status" aria-label="Loading price" />
          ) : (
            <>
              <span className="text-3xl font-bold text-white">{price}</span>
              {period && <span className="ml-1 text-text-dim">{period}</span>}
            </>
          )}
        </div>
        <ul className="mb-7 space-y-2.5">
          {features.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2.5 text-sm text-text-muted"
            >
              <span className="mt-0.5 text-purple" aria-hidden="true">&#10003;</span>
              {f}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onCtaClick}
          className={`w-full rounded-full py-3 text-sm font-semibold transition-all ${
            highlighted
              ? "bg-accent text-white hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(232,93,117,0.3)]"
              : "border border-border text-white hover:bg-card-hover"
          }`}
        >
          {cta}
        </button>
        {trialNote && (
          <p className="mt-3 text-center text-xs text-text-dim">{trialNote}</p>
        )}
      </div>
    </div>
  );
}
