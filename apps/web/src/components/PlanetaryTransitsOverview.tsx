"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

type Transit = {
  key: "sun" | "moon" | "mercury" | "venus" | "mars" | "jupiter" | "saturn";
  sign: string;
  enterOffsetDays: number;
  durationDays: number;
  influence: "positive" | "neutral" | "challenging";
  areaKeys: string[];
};

const PLANET_SYMBOLS: Record<Transit["key"], string> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
};

const INFLUENCE_CLASSES: Record<Transit["influence"], string> = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  neutral: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  challenging: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildTransits(seed: number): Transit[] {
  const signs = ["Aquarius", "Cancer", "Capricorn", "Pisces", "Gemini", "Taurus", "Pisces"];

  return [
    {
      key: "sun",
      sign: signs[0],
      enterOffsetDays: -Math.max(1, seed % 10),
      durationDays: 28,
      influence: "positive",
      areaKeys: ["identity", "vitality", "selfExpression"],
    },
    {
      key: "moon",
      sign: signs[1],
      enterOffsetDays: 0,
      durationDays: 2,
      influence: "positive",
      areaKeys: ["emotions", "intuition", "homeLife"],
    },
    {
      key: "mercury",
      sign: signs[2],
      enterOffsetDays: -((seed % 7) + 2),
      durationDays: 24,
      influence: "neutral",
      areaKeys: ["communication", "thinking", "travel"],
    },
    {
      key: "venus",
      sign: signs[3],
      enterOffsetDays: -((seed % 5) + 3),
      durationDays: 22,
      influence: "positive",
      areaKeys: ["loveRomance", "beauty", "finances"],
    },
    {
      key: "mars",
      sign: signs[4],
      enterOffsetDays: -((seed % 9) + 6),
      durationDays: 40,
      influence: "challenging",
      areaKeys: ["energy", "action", "ambition"],
    },
    {
      key: "jupiter",
      sign: signs[5],
      enterOffsetDays: -((seed % 14) + 15),
      durationDays: 365,
      influence: "positive",
      areaKeys: ["expansion", "luck", "wisdom"],
    },
    {
      key: "saturn",
      sign: signs[6],
      enterOffsetDays: -((seed % 20) + 30),
      durationDays: 400,
      influence: "neutral",
      areaKeys: ["discipline", "responsibility", "structure"],
    },
  ];
}

export function PlanetaryTransitsOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        setState(account);

        if (!account?.userId) {
          setSunSign(null);
          return;
        }

        const supabase = getSupabaseBrowser();
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("sun_sign")
          .eq("id", account.userId)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        setSunSign(data?.sun_sign || null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  const today = useMemo(() => new Date(), []);
  const seed = (sunSign?.length || 3) * (today.getDate() + 7);
  const transits = useMemo(() => buildTransits(seed), [seed]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
      }),
    [locale]
  );

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
          {t("planetaryTransitsSignIn")}
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
            {t("planetaryTransitsLockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("planetaryTransitsLockedBody")}
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
              {t("cosmicHubOpenDaily")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("planetaryTransitsPersonalLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {t("planetaryTransitsFor", {
              sign: sunSign ? translateSign(sunSign, locale) : t("statusUnknown"),
            })}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("planetaryTransitsOverviewBody")}
          </p>
        </div>

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("planetaryTransitsCurrentTitle")}
          </p>
          <div className="mt-5 space-y-4">
            {transits.map((transit) => {
              const enterDate = addDays(today, transit.enterOffsetDays);
              const exitDate = addDays(enterDate, transit.durationDays);

              return (
                <article
                  key={transit.key}
                  className="rounded-[1.5rem] border border-border bg-bg/70 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] text-2xl text-white">
                        {PLANET_SYMBOLS[transit.key]}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {t(`natalPlanet_${transit.key}`)}
                        </h3>
                        <p className="mt-1 text-sm text-text-muted">
                          {t("planetaryTransitsInSign", {
                            sign: translateSign(transit.sign, locale),
                          })}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${INFLUENCE_CLASSES[transit.influence]}`}
                    >
                      {t(`planetaryInfluence_${transit.influence}`)}
                    </span>
                  </div>

                  <div className="mt-4 inline-flex rounded-full border border-border bg-card px-4 py-2 text-xs text-text-muted">
                    {formatter.format(enterDate)} - {formatter.format(exitDate)}
                  </div>

                  <p className="mt-4 text-sm leading-7 text-text-muted">
                    {t(`planetaryTransitBody_${transit.key}`)}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {transit.areaKeys.map((areaKey) => (
                      <span
                        key={areaKey}
                        className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-white/90"
                      >
                        {t(areaKey)}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("planetaryTransitsUpcomingTitle")}
          </p>
          <div className="mt-5 space-y-3">
            {transits.slice(0, 4).map((transit, index) => {
              const startDate = addDays(today, index * 4 + 3);

              return (
                <div
                  key={`${transit.key}-upcoming`}
                  className="rounded-[1.4rem] border border-border bg-bg/70 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-white">
                      {formatter.format(startDate)}
                    </div>
                    <p className="text-sm font-semibold text-white">
                      {t("planetaryTransitsUpcomingEvent", {
                        planet: t(`natalPlanet_${transit.key}`),
                        sign: translateSign(transit.sign, locale),
                      })}
                    </p>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-text-muted">
                    {t(`planetaryTransitUpcomingBody_${transit.key}`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[2rem] border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("planetaryTransitsTipsTitle")}
          </p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-text-muted">
            <p>{t("planetaryTransitsTip_1")}</p>
            <p>{t("planetaryTransitsTip_2")}</p>
            <p>{t("planetaryTransitsTip_3")}</p>
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
