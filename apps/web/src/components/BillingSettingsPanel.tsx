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
        <p className="text-sm text-text-muted">{t("loading")}</p>
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

      <div className="mt-5 space-y-4 text-sm">
        <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
          <div className="text-text-dim">{t("subscriptionTier")}</div>
          <div className="mt-1 text-white">{t(`tier_${state.tier}`)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
          <div className="text-text-dim">{t("billingSource")}</div>
          <div className="mt-1 text-white">
            {state.source ? t(`source_${state.source}`) : t("source_none")}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
          <div className="text-text-dim">{t("subscriptionStatus")}</div>
          <div className="mt-1 text-white">{state.status || t("statusUnknown")}</div>
        </div>
        {state.expiresAt ? (
          <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
            <div className="text-text-dim">{t("renewalDate")}</div>
            <div className="mt-1 text-white">
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(state.expiresAt))}
            </div>
          </div>
        ) : null}
        {state.cancelAtPeriodEnd ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-amber-100">
            {t("cancelAtPeriodEnd")}
          </div>
        ) : null}
      </div>

      {state.source === "stripe" ? (
        <button
          type="button"
          onClick={handleOpenPortal}
          disabled={portalLoading}
          className="mt-6 w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          {portalLoading ? t("loading") : t("manageSubscription")}
        </button>
      ) : (
        <Link
          href="/app/plans"
          className="mt-6 block w-full rounded-full bg-accent px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t("viewPlans")}
        </Link>
      )}

      {error ? (
        <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
