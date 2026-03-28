"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";
import { useEffect } from "react";

type RetrogradeStatus = "retrograde" | "upcoming" | "direct";

type RetrogradeEvent = {
  key: "mercury" | "venus" | "mars" | "saturn";
  status: RetrogradeStatus;
  startOffsetDays: number;
  durationDays: number;
  effects: string[];
  doKeys: string[];
  avoidKeys: string[];
};

type AlertKey =
  | "mercury"
  | "venus"
  | "mars"
  | "saturn"
  | "preShadow"
  | "postShadow";

const PLANET_SYMBOLS: Record<RetrogradeEvent["key"], string> = {
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  saturn: "♄",
};

const STATUS_STYLES: Record<RetrogradeStatus, string> = {
  retrograde: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  upcoming: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  direct: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildRetrogrades(seed: number): RetrogradeEvent[] {
  return [
    {
      key: "mercury",
      status: "upcoming",
      startOffsetDays: (seed % 18) + 10,
      durationDays: 22,
      effects: [
        "retrogradeEffect_mercury_1",
        "retrogradeEffect_mercury_2",
        "retrogradeEffect_mercury_3",
      ],
      doKeys: ["retrogradeDo_mercury_1", "retrogradeDo_mercury_2"],
      avoidKeys: ["retrogradeAvoid_mercury_1", "retrogradeAvoid_mercury_2"],
    },
    {
      key: "venus",
      status: "direct",
      startOffsetDays: -42,
      durationDays: 30,
      effects: [
        "retrogradeEffect_venus_1",
        "retrogradeEffect_venus_2",
        "retrogradeEffect_venus_3",
      ],
      doKeys: ["retrogradeDo_venus_1", "retrogradeDo_venus_2"],
      avoidKeys: ["retrogradeAvoid_venus_1", "retrogradeAvoid_venus_2"],
    },
    {
      key: "mars",
      status: "direct",
      startOffsetDays: -68,
      durationDays: 55,
      effects: [
        "retrogradeEffect_mars_1",
        "retrogradeEffect_mars_2",
        "retrogradeEffect_mars_3",
      ],
      doKeys: ["retrogradeDo_mars_1", "retrogradeDo_mars_2"],
      avoidKeys: ["retrogradeAvoid_mars_1", "retrogradeAvoid_mars_2"],
    },
    {
      key: "saturn",
      status: "retrograde",
      startOffsetDays: -8,
      durationDays: 110,
      effects: [
        "retrogradeEffect_saturn_1",
        "retrogradeEffect_saturn_2",
        "retrogradeEffect_saturn_3",
      ],
      doKeys: ["retrogradeDo_saturn_1", "retrogradeDo_saturn_2"],
      avoidKeys: ["retrogradeAvoid_saturn_1", "retrogradeAvoid_saturn_2"],
    },
  ];
}

export function RetrogradeAlertsOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<RetrogradeEvent["key"]>("mercury");
  const [alerts, setAlerts] = useState<Record<AlertKey, boolean>>({
    mercury: true,
    venus: true,
    mars: true,
    saturn: false,
    preShadow: true,
    postShadow: true,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        setState(account);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  const today = useMemo(() => new Date(), []);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
      }),
    [locale]
  );

  const retrogrades = useMemo(() => buildRetrogrades(today.getDate() + 9), [today]);

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("notSignedIn")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("retrogradeSignIn")}
        </p>
      </div>
    );
  }

  if (state.tier !== "premium_plus") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("premiumNav")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {t("retrogradeLockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("retrogradeLockedBody")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/app/plans"
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("viewPlans")}
            </Link>
            <Link
              href="/app/premium/cosmic"
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("premiumNav")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("retrogradeStatusLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {t("retrogradeWebTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("retrogradeOverviewBody")}
          </p>
        </div>

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("retrogradeCurrentTitle")}
          </p>
          <div className="mt-5 space-y-4">
            {retrogrades.map((event) => {
              const startDate = addDays(today, event.startOffsetDays);
              const endDate = addDays(startDate, event.durationDays);
              const expanded = expandedKey === event.key;

              return (
                <article
                  key={event.key}
                  className="rounded-[1.5rem] border border-border bg-bg/70 p-5"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? "mercury" : event.key)}
                    className="flex w-full flex-wrap items-start justify-between gap-4 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] text-2xl text-white">
                        {PLANET_SYMBOLS[event.key]}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {t(`natalPlanet_${event.key}`)}
                        </h3>
                        <p className="mt-1 text-sm text-text-muted">
                          {formatter.format(startDate)} - {formatter.format(endDate)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[event.status]}`}
                    >
                      {t(`retrogradeStatus_${event.status}`)}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="mt-5 space-y-5">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                          {t("retrogradeEffectsTitle")}
                        </p>
                        <div className="mt-3 space-y-2 text-sm leading-7 text-text-muted">
                          {event.effects.map((key) => (
                            <p key={key}>{t(key)}</p>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-[1.25rem] border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)] p-4">
                          <p className="text-sm font-semibold text-emerald-200">
                            {t("retrogradeDoTitle")}
                          </p>
                          <div className="mt-3 space-y-2 text-sm leading-7 text-text-muted">
                            {event.doKeys.map((key) => (
                              <p key={key}>{t(key)}</p>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[1.25rem] border border-[rgba(251,191,36,0.24)] bg-[rgba(251,191,36,0.10)] p-4">
                          <p className="text-sm font-semibold text-amber-200">
                            {t("retrogradeAvoidTitle")}
                          </p>
                          <div className="mt-3 space-y-2 text-sm leading-7 text-text-muted">
                            {event.avoidKeys.map((key) => (
                              <p key={key}>{t(key)}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("retrogradeAlertSettings")}
          </p>
          <div className="mt-5 space-y-3">
            {(
              [
                ["mercury", "natalPlanet_mercury"],
                ["venus", "natalPlanet_venus"],
                ["mars", "natalPlanet_mars"],
                ["saturn", "natalPlanet_saturn"],
                ["preShadow", "retrogradeAlert_preShadow"],
                ["postShadow", "retrogradeAlert_postShadow"],
              ] as const
            ).map(([key, labelKey]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-4 rounded-[1.25rem] border border-border bg-bg/70 px-4 py-4"
              >
                <span className="text-sm font-semibold text-white">{t(labelKey)}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={alerts[key]}
                  onClick={() => setAlerts((current) => ({ ...current, [key]: !current[key] }))}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    alerts[key] ? "bg-accent" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                      alerts[key] ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>
            ))}
          </div>
          <p className="mt-4 text-sm leading-7 text-text-muted">
            {t("retrogradeAlertHint")}
          </p>
        </div>

        <div className="rounded-[2rem] border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("retrogradeTipsTitle")}
          </p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-text-muted">
            <p>{t("retrogradeTip_1")}</p>
            <p>{t("retrogradeTip_2")}</p>
            <p>{t("retrogradeTip_3")}</p>
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
