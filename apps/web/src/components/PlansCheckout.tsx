"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { createCheckoutSession, type WebCheckoutPlan } from "@/lib/web-checkout";
import { formatPrice as formatBillingPrice, type PriceMap } from "@/lib/billingPriceFormat";

type SessionState = {
  userId: string;
  currentTier: string;
};

const TIERS = ["premium", "premium_plus"] as const;

const TIER_PLANS: Record<string, { monthly: WebCheckoutPlan; yearly: WebCheckoutPlan }> = {
  premium: { monthly: "celestial_monthly", yearly: "celestial_yearly" },
  premium_plus: { monthly: "cosmic_monthly", yearly: "cosmic_yearly" },
};

const CELESTIAL_FEATURES = [
  "planFeatureFullChart",
  "planFeatureUnlimitedLikes",
  "planFeatureSynastry",
  "planFeatureAdvancedFilters",
  "planFeatureSeeWhoLiked",
  "planFeature5SuperLikes",
  "planFeatureWeeklyHoroscopes",
] as const;

const COSMIC_FEATURES = [
  "planFeatureEverythingCelestial",
  "planFeatureMonthlyYearlyHoroscopes",
  "planFeatureUnlimitedSuperLikes",
  "planFeatureTransitAlerts",
  "planFeaturePriority",
  "planFeatureReadReceipts",
  "planFeatureBoost",
] as const;

const TIER_FEATURES: Record<string, readonly string[]> = {
  premium: CELESTIAL_FEATURES,
  premium_plus: COSMIC_FEATURES,
};

export function PlansCheckout() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [submittingPlan, setSubmittingPlan] = useState<WebCheckoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseBrowser();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          setSessionState(null);
          setLoading(false);
          return;
        }

        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("tier")
          .eq("user_id", session.user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const [priceResponse, nextSessionState] = await Promise.all([
          fetch("/api/billing/prices", { cache: "no-store" }),
          Promise.resolve({
            userId: session.user.id,
            currentTier: subscription?.tier || "free",
          }),
        ]);

        if (priceResponse.ok) {
          const priceData = (await priceResponse.json()) as PriceMap;
          setPrices(priceData);
        }

        setSessionState(nextSessionState);
      } catch (loadError) {
        setError(t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  const handleCheckout = async (plan: WebCheckoutPlan) => {
    if (!sessionState?.userId) {
      setError(t("notSignedIn"));
      return;
    }

    const selectedPrice = prices[plan];

    try {
      setSubmittingPlan(plan);
      setError(null);
      const url = await createCheckoutSession(
        plan,
        sessionState.userId,
        promoCode,
        selectedPrice?.priceId
      );
      window.location.href = url;
    } catch (checkoutError) {
      setSubmittingPlan(null);
      if (checkoutError instanceof Error && checkoutError.message === "Invalid or inactive promo code") {
        setError(t("invalidPromoCode"));
        return;
      }

      if (checkoutError instanceof Error && checkoutError.message.includes("Missing Stripe price")) {
        setError(t("checkoutErrorConfig"));
        return;
      }

      setError(t("checkoutError"));
    }
  };

  const cancelled = searchParams.get("checkout") === "cancelled";
  const expired = searchParams.get("checkout") === "expired";

  const getAnnualDiscountPercent = (tier: string) => {
    const plans = TIER_PLANS[tier];
    if (!plans) return null;
    const monthlyPrice = prices[plans.monthly]?.unitAmount;
    const yearlyPrice = prices[plans.yearly]?.unitAmount;

    if (monthlyPrice == null || yearlyPrice == null || monthlyPrice <= 0) {
      return null;
    }

    const annualizedMonthly = monthlyPrice * 12;
    if (annualizedMonthly <= yearlyPrice) {
      return null;
    }

    return Math.round(((annualizedMonthly - yearlyPrice) / annualizedMonthly) * 100);
  };

  const getMonthlyEquivalent = (tier: string) => {
    const plans = TIER_PLANS[tier];
    if (!plans) return null;
    const yearlyPrice = prices[plans.yearly]?.unitAmount;
    const currency = prices[plans.yearly]?.currency;
    if (yearlyPrice == null || !currency) return null;

    const monthlyEquiv = yearlyPrice / 12 / 100;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(monthlyEquiv);
  };

  const periodLabels = {
    monthly: t("period_monthly"),
    yearly: t("period_yearly"),
  };

  const formatPlanPrice = (planKey: WebCheckoutPlan) =>
    formatBillingPrice(prices[planKey] ?? null, locale, periodLabels, t("priceUnavailable"));

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-[2rem] border border-border bg-card/90 p-8">
          <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
            <p className="text-sm text-text-muted">{t("plansLoading")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Billing period toggle */}
      <div
        role="radiogroup"
        aria-label={t("toggleMonthly") + " / " + t("toggleYearly")}
        className="flex items-center justify-center gap-1 rounded-full border border-border bg-card/90 p-1 sm:mx-auto sm:w-fit"
      >
        <button
          type="button"
          role="radio"
          aria-checked={billingPeriod === "monthly"}
          onClick={() => setBillingPeriod("monthly")}
          className={`rounded-full px-6 py-2.5 text-sm font-medium transition-all ${
            billingPeriod === "monthly"
              ? "bg-accent text-white shadow-sm"
              : "text-text-dim hover:text-white"
          }`}
        >
          {t("toggleMonthly")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={billingPeriod === "yearly"}
          onClick={() => setBillingPeriod("yearly")}
          className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all ${
            billingPeriod === "yearly"
              ? "bg-accent text-white shadow-sm"
              : "text-text-dim hover:text-white"
          }`}
        >
          {t("toggleYearly")}
          {getAnnualDiscountPercent("premium") ? (
            <span aria-hidden="true" className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              -{getAnnualDiscountPercent("premium")}%
            </span>
          ) : null}
        </button>
      </div>

      {/* Promo code section */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label htmlFor="promo-code" className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("promoCodeLabel")}
            </label>
            <input
              id="promo-code"
              type="text"
              value={promoCode}
              onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
              placeholder={t("promoCodePlaceholder")}
              className="mt-3 w-full rounded-2xl border border-border bg-bg/70 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <p className="max-w-xl text-sm leading-6 text-text-muted">
            {t("promoCodeHelp")}
          </p>
        </div>
      </section>

      {/* Status banners */}
      {cancelled ? (
        <div role="status" className="rounded-[2rem] border border-amber-400/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
          {t("checkoutCancelled")}
        </div>
      ) : null}

      {expired ? (
        <div role="status" className="rounded-[2rem] border border-amber-400/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
          {t("checkoutExpired")}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-[2rem] border border-accent/30 bg-accent/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-[#ffd0d7]">{error}</p>
              <p className="mt-1 text-xs text-[#ffd0d7]/70">{t("checkoutErrorHint")}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Plan cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {TIERS.map((tier) => {
          const plans = TIER_PLANS[tier];
          const planKey = plans[billingPeriod];
          const isCurrentTier = sessionState?.currentTier === tier;
          const isRecommended = tier === "premium_plus" && billingPeriod === "monthly";
          const annualDiscountPercent =
            billingPeriod === "yearly" ? getAnnualDiscountPercent(tier) : null;
          const monthlyEquiv =
            billingPeriod === "yearly" ? getMonthlyEquivalent(tier) : null;
          const features = TIER_FEATURES[tier] || [];
          const isSubmitting = submittingPlan === planKey;

          return (
            <section
              key={planKey}
              className={`relative rounded-[2rem] border p-6 transition-all ${
                isRecommended
                  ? "border-accent bg-accent/8 shadow-[0_0_40px_rgba(232,93,117,0.06)]"
                  : "border-border bg-card/90"
              }`}
            >
              {isRecommended && (
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/8" aria-hidden="true" />
              )}
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                      {t(`tier_${tier}`)}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      {t(`plan_${planKey}`)}
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isRecommended ? (
                      <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                        {t("recommended")}
                      </span>
                    ) : null}
                    {annualDiscountPercent ? (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {t("savePercent", { percent: annualDiscountPercent })}
                      </span>
                    ) : null}
                    {isCurrentTier ? (
                      <span className="rounded-full border border-purple/30 bg-purple/15 px-3 py-1 text-xs font-semibold text-purple-200">
                        {t("currentPlanBadge")}
                      </span>
                    ) : null}
                  </div>
                </div>

                <p className="mt-4 text-sm leading-7 text-text-muted">
                  {t(`plan_${planKey}_description`)}
                </p>

                {/* Price display */}
                <div className="mt-6 rounded-2xl border border-border bg-bg/70 px-4 py-4" aria-live="polite" aria-atomic="true">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-2xl font-bold text-white">{formatPlanPrice(planKey)}</div>
                      {monthlyEquiv ? (
                        <div className="mt-1 text-xs text-emerald-300">
                          {t("monthlyEquivalent", { price: monthlyEquiv })}
                        </div>
                      ) : null}
                    </div>
                    {billingPeriod === "monthly" && (
                      <div className="text-right text-xs text-text-dim">
                        {t("billedMonthly")}
                      </div>
                    )}
                    {billingPeriod === "yearly" && (
                      <div className="text-right text-xs text-text-dim">
                        {t("billedYearly")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Features list */}
                <ul className="mt-5 space-y-2.5">
                  {features.map((featureKey) => (
                    <li
                      key={featureKey}
                      className="flex items-start gap-2.5 text-sm text-text-muted"
                    >
                      <span className="mt-0.5 text-purple" aria-hidden="true">&#10003;</span>
                      {t(featureKey)}
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                <button
                  type="button"
                  onClick={() => handleCheckout(planKey)}
                  disabled={submittingPlan !== null}
                  className={`mt-6 w-full rounded-full px-5 py-3.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-70 ${
                    isRecommended
                      ? "bg-accent text-white hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(232,93,117,0.3)]"
                      : "bg-accent text-white hover:bg-accent-hover"
                  }`}
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                      {t("redirectingToCheckout")}
                    </span>
                  ) : isCurrentTier ? (
                    t("chooseAgain")
                  ) : (
                    t("startTrialCta")
                  )}
                </button>

                {/* Trust signals beneath CTA */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[11px] text-text-dim">
                  <span className="flex items-center gap-1">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true">
                      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1.5V4.5A3.5 3.5 0 0 0 8 1Zm2 6H6V4.5a2 2 0 1 1 4 0V7Z" />
                    </svg>
                    {t("trustSecureCheckout")}
                  </span>
                  <span>{t("trustCancelAnytime")}</span>
                  <span>{t("trustTrialReminder")}</span>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* FAQ-style reassurance */}
      <div className="rounded-[2rem] border border-border bg-card/90 p-5">
        <p className="text-center text-sm text-text-muted">
          {t("plansFaqNote")}
        </p>
      </div>
    </div>
  );
}
