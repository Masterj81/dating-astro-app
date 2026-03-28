"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { createCheckoutSession, type WebCheckoutPlan } from "@/lib/web-checkout";

type SessionState = {
  userId: string;
  currentTier: string;
};

type PriceMap = Partial<
  Record<
    WebCheckoutPlan,
    {
      priceId: string;
      unitAmount: number | null;
      currency: string;
      interval: string | null;
    } | null
  >
>;

const PLANS: Array<{
  key: WebCheckoutPlan;
  tier: "premium" | "premium_plus";
  period: "monthly" | "yearly";
  recommended?: boolean;
}> = [
  { key: "celestial_monthly", tier: "premium", period: "monthly" },
  { key: "celestial_yearly", tier: "premium", period: "yearly" },
  { key: "cosmic_monthly", tier: "premium_plus", period: "monthly", recommended: true },
  { key: "cosmic_yearly", tier: "premium_plus", period: "yearly" },
];

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
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
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

      setError(checkoutError instanceof Error ? checkoutError.message : t("checkoutError"));
    }
  };

  const cancelled = searchParams.get("checkout") === "cancelled";

  const getAnnualDiscountPercent = (tier: "premium" | "premium_plus") => {
    const monthlyKey = tier === "premium" ? "celestial_monthly" : "cosmic_monthly";
    const yearlyKey = tier === "premium" ? "celestial_yearly" : "cosmic_yearly";
    const monthlyPrice = prices[monthlyKey]?.unitAmount;
    const yearlyPrice = prices[yearlyKey]?.unitAmount;

    if (monthlyPrice == null || yearlyPrice == null || monthlyPrice <= 0) {
      return null;
    }

    const annualizedMonthly = monthlyPrice * 12;
    if (annualizedMonthly <= yearlyPrice) {
      return null;
    }

    return Math.round(((annualizedMonthly - yearlyPrice) / annualizedMonthly) * 100);
  };

  const formatPrice = (planKey: WebCheckoutPlan) => {
    const price = prices[planKey];
    if (!price?.currency || price.unitAmount == null) {
      return t("priceUnavailable");
    }

    const amount = price.unitAmount / 100;
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: price.currency.toUpperCase(),
    }).format(amount);
    const intervalLabel =
      price.interval === "month"
        ? t("period_monthly")
        : price.interval === "year"
          ? t("period_yearly")
          : null;

    return `${formatted}${intervalLabel ? ` / ${intervalLabel}` : ""}`;
  };

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {cancelled ? (
        <div className="rounded-[2rem] border border-amber-400/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
          {t("checkoutCancelled")}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[2rem] border border-accent/30 bg-accent/10 px-5 py-4 text-sm text-[#ffd0d7]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {PLANS.map((plan) => {
          const isCurrentTier = sessionState?.currentTier === plan.tier;
          const annualDiscountPercent =
            plan.period === "yearly" ? getAnnualDiscountPercent(plan.tier) : null;
          return (
            <section
              key={plan.key}
              className={`rounded-[2rem] border p-6 ${
                plan.recommended
                  ? "border-accent bg-accent/8"
                  : "border-border bg-card/90"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                    {t(`tier_${plan.tier}`)}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    {t(`plan_${plan.key}`)}
                  </h2>
                </div>
                {plan.recommended ? (
                  <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                    {t("recommended")}
                  </span>
                ) : null}
                {annualDiscountPercent ? (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                    {t("savePercent", { percent: annualDiscountPercent })}
                  </span>
                ) : null}
              </div>

              <p className="mt-4 text-sm leading-7 text-text-muted">
                {t(`plan_${plan.key}_description`)}
              </p>

              <div className="mt-6 rounded-2xl border border-border bg-bg/70 px-4 py-4">
                <div className="text-sm text-text-dim">{t("billingCadence")}</div>
                <div className="mt-1 text-lg font-medium text-white">{formatPrice(plan.key)}</div>
              </div>

              <button
                type="button"
                onClick={() => handleCheckout(plan.key)}
                disabled={submittingPlan !== null}
                className="mt-6 w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submittingPlan === plan.key
                  ? t("loading")
                  : isCurrentTier
                    ? t("chooseAgain")
                    : t("continueToCheckout")}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
