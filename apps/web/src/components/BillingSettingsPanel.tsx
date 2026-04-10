"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { createPortalSession } from "@/lib/web-subscriptions";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

export function BillingSettingsPanel() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<WebAccountState | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        setState(await getCurrentAccountState(t("unknownUser")));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  const handleOpenPortal = async () => {
    try {
      setPortalLoading(true);
      setError(null);

      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        throw new Error(t("notSignedIn"));
      }

      const url = await createPortalSession(session.user.id);
      window.location.href = url;
    } catch (portalError) {
      setPortalLoading(false);
      setError(portalError instanceof Error ? portalError.message : t("portalError"));
    }
  };

  if (loading) {
    return (
      <section className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
          <p className="text-sm text-text-muted">{t("billingLoading")}</p>
        </div>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <p className="text-sm text-text-muted">{t("notSignedIn")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
        {t("billingSection")}
      </p>
      <h3 className="mt-3 text-xl font-semibold text-white">{t("currentPlan")}</h3>

      <dl className="mt-5 space-y-4 text-sm">
        <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
          <dt className="text-text-dim">{t("subscriptionTier")}</dt>
          <dd className="mt-1 text-white">{t(`tier_${state.tier}`)}</dd>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
          <dt className="text-text-dim">{t("billingSource")}</dt>
          <dd className="mt-1 text-white">
            {state.source ? t(`source_${state.source}`) : t("source_none")}
          </dd>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
          <dt className="text-text-dim">{t("subscriptionStatus")}</dt>
          <dd className="mt-1 text-white">{state.status || t("statusUnknown")}</dd>
        </div>
        {state.expiresAt ? (
          <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
            <dt className="text-text-dim">{t("renewalDate")}</dt>
            <dd className="mt-1 text-white">
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(state.expiresAt))}
            </dd>
          </div>
        ) : null}
        {state.cancelAtPeriodEnd ? (
          <div role="status" className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-amber-100">
            {t("cancelAtPeriodEnd")}
          </div>
        ) : null}
      </dl>

      {state.source === "stripe" ? (
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleOpenPortal}
            disabled={portalLoading}
            className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {portalLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                {t("openingPortal")}
              </span>
            ) : (
              t("manageSubscription")
            )}
          </button>
          <p className="text-center text-xs text-text-dim">
            {t("portalHint")}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* Feature comparison for free users -- conversion nudge */}
          {state.tier === "free" && (
            <div className="rounded-2xl border border-[rgba(232,93,117,0.15)] bg-[linear-gradient(135deg,rgba(232,93,117,0.06),rgba(124,108,255,0.04))] p-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-dim">
                {t("billingFeatureCompareTitle")}
              </p>
              <div className="mt-3 space-y-2">
                {(["likes", "compatibility", "horoscope", "superLikes"] as const).map((feature) => (
                  <div key={feature} className="flex items-center gap-3 text-sm">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-accent/20 bg-accent/8 text-[10px] text-accent" aria-hidden="true">✦</span>
                    <span className="text-text-muted">{t(`billingFeatureCompare_${feature}`)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-text-muted">
                {t("billingFreeValueProp")}
              </p>
            </div>
          )}

          <Link
            href="/app/plans"
            className="block w-full rounded-full bg-accent px-5 py-3 text-center text-sm font-semibold text-white transition-all hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(232,93,117,0.25)]"
          >
            {t("upgradePlan")}
          </Link>
        </div>
      )}

      {error ? (
        <div role="alert" className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3">
          <p className="text-sm text-[#ffd0d7]">{error}</p>
          <p className="mt-1 text-xs text-[#ffd0d7]/70">{t("billingErrorHint")}</p>
        </div>
      ) : null}
    </section>
  );
}
