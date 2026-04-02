"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type DiscoverProfile = {
  id: string;
  name: string | null;
  age: number | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  bio: string | null;
  image_url: string | null;
  images?: string[] | null;
};

const ELEMENTS: Record<string, string> = {
  aries: "fire",
  leo: "fire",
  sagittarius: "fire",
  taurus: "earth",
  virgo: "earth",
  capricorn: "earth",
  gemini: "air",
  libra: "air",
  aquarius: "air",
  cancer: "water",
  scorpio: "water",
  pisces: "water",
};

const COMPATIBLE: Record<string, string> = {
  fire: "air",
  air: "fire",
  earth: "water",
  water: "earth",
};

const MODALITIES: Record<string, string> = {
  aries: "cardinal", cancer: "cardinal", libra: "cardinal", capricorn: "cardinal",
  taurus: "fixed", leo: "fixed", scorpio: "fixed", aquarius: "fixed",
  gemini: "mutable", virgo: "mutable", sagittarius: "mutable", pisces: "mutable",
};

function calculateQuickCompatibility(sign1?: string | null, sign2?: string | null) {
  if (!sign1 || !sign2) return 55;

  const el1 = ELEMENTS[sign1.toLowerCase()];
  const el2 = ELEMENTS[sign2.toLowerCase()];
  if (!el1 || !el2) return 55;

  let score: number;
  if (el1 === el2) {
    score = 85;
  } else {
    score = COMPATIBLE[el1] === el2 ? 75 : 55;
  }

  const mod1 = MODALITIES[sign1.toLowerCase()];
  const mod2 = MODALITIES[sign2.toLowerCase()];
  if (mod1 && mod2) {
    if (mod1 === mod2) score += 5;
    else if ((mod1 === "cardinal" && mod2 === "mutable") || (mod1 === "mutable" && mod2 === "cardinal")) score += 3;
  }

  return Math.min(score, 100);
}

function getCompatibilityTone(score: number) {
  if (score >= 75) {
    return {
      card: "border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)]",
      badge:
        "border-[rgba(74,222,128,0.22)] bg-[rgba(74,222,128,0.10)] text-[#a7f3c0]",
      overlay: "border-white/15 bg-[rgba(12,32,20,0.65)] text-[#d1fae5]",
    };
  }

  if (score >= 45) {
    return {
      card: "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.10)]",
      badge:
        "border-[rgba(250,204,21,0.22)] bg-[rgba(250,204,21,0.10)] text-[#fde68a]",
      overlay: "border-white/15 bg-[rgba(41,32,9,0.7)] text-[#fef3c7]",
    };
  }

  return {
    card: "border-[rgba(248,113,113,0.24)] bg-[rgba(248,113,113,0.10)]",
    badge:
      "border-[rgba(248,113,113,0.22)] bg-[rgba(248,113,113,0.10)] text-[#fecaca]",
    overlay: "border-white/15 bg-[rgba(43,13,16,0.72)] text-[#fee2e2]",
  };
}

export function DiscoverOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [userSunSign, setUserSunSign] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"like" | "pass" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("harassment");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  const currentProfile = profiles[currentIndex] ?? null;

  const queue = useMemo(
    () => profiles.slice(currentIndex + 1, currentIndex + 4),
    [currentIndex, profiles]
  );

  const loadProfiles = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setUserId(null);
        setProfiles([]);
        setLoading(false);
        return;
      }

      setUserId(session.user.id);

      const [{ data: me }, { data: discoverData, error: discoverError }] = await Promise.all([
        supabase.from("profiles").select("sun_sign").eq("id", session.user.id).maybeSingle(),
        supabase.rpc("get_discoverable_profiles", {
          p_user_id: session.user.id,
          p_limit: 50,
        }),
      ]);

      setUserSunSign(me?.sun_sign || null);

      if (discoverError) {
        throw discoverError;
      }

      const safeProfiles = ((discoverData as DiscoverProfile[]) || []).filter(
        (profile) => profile.id !== session.user.id
      );

      setProfiles(safeProfiles);
      setCurrentIndex(0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwipe = async (action: "like" | "pass") => {
    if (!currentProfile || !userId) {
      return;
    }

    try {
      setActionLoading(action);
      setError(null);

      const supabase = getSupabaseBrowser();
      const { error: swipeError } = await supabase.from("swipes").upsert(
        {
          swiper_id: userId,
          swiped_id: currentProfile.id,
          action,
        },
        { onConflict: "swiper_id,swiped_id" }
      );

      if (swipeError) {
        throw swipeError;
      }

      if (currentIndex < profiles.length - 1) {
        setCurrentIndex((value) => value + 1);
      } else {
        setProfiles([]);
        setCurrentIndex(0);
      }
    } catch (swipeFailure) {
      setError(swipeFailure instanceof Error ? swipeFailure.message : t("unknownError"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReport = async () => {
    if (!currentProfile || !userId) {
      return;
    }

    try {
      setReportSubmitting(true);
      setReportFeedback(null);

      const VALID_REPORT_REASONS = [
        "inappropriate_photos", "harassment", "spam", "fake_profile", "underage", "other",
      ] as const;

      if (!VALID_REPORT_REASONS.includes(reportReason as typeof VALID_REPORT_REASONS[number])) {
        setReportFeedback(t("reportError"));
        return;
      }

      if (reportDescription.length > 500) {
        setReportFeedback(t("reportError"));
        return;
      }

      const supabase = getSupabaseBrowser();
      const { error: reportError } = await supabase.from("reports").insert({
        reporter_id: userId,
        reported_id: currentProfile.id,
        reason: reportReason,
        description: reportDescription.trim() || null,
        status: "pending",
      });

      if (reportError) {
        if (reportError.message?.toLowerCase().includes("rate limit")) {
          throw new Error(t("reportRateLimit"));
        }
        throw reportError;
      }

      setReportFeedback(t("reportSuccessMessage"));
      setReportOpen(false);
      setReportReason("harassment");
      setReportDescription("");
    } catch (failure) {
      setReportFeedback(failure instanceof Error ? failure.message : t("reportError"));
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
  }

  if (!currentProfile) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("discoverEmptyTitle")}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">
          {t("discoverEmptyBody")}
        </p>
        <button
          type="button"
          onClick={loadProfiles}
          className="mt-6 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t("refreshProfiles")}
        </button>
      </div>
    );
  }

  const profileImage = resolveImageSrc(currentProfile.image_url, currentProfile.images?.[0]);
  const compatibility = calculateQuickCompatibility(userSunSign, currentProfile.sun_sign);
  const compatibilityTone = getCompatibilityTone(compatibility);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <section className="overflow-hidden rounded-[2rem] border border-border bg-card/90 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
          <div className="relative min-h-[420px] bg-bg-secondary">
            <Image
              src={profileImage}
              alt={currentProfile.name || "Profile"}
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              unoptimized={shouldBypassImageOptimization(profileImage)}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <div className={`absolute left-5 top-5 rounded-full border px-4 py-2 text-sm font-semibold backdrop-blur-md ${compatibilityTone.overlay}`}>
              {compatibility}% {t("discoverMatch")}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-6">
              <h2 className="text-3xl font-semibold text-white">
                {currentProfile.name || t("unknownUser")}
                {currentProfile.age ? `, ${currentProfile.age}` : ""}
              </h2>
              <p className="mt-2 text-sm text-white/80">
                {currentProfile.sun_sign ? translateSign(currentProfile.sun_sign, locale) : "?"}{" "}
                {"\u2022"}{" "}
                {currentProfile.moon_sign ? translateSign(currentProfile.moon_sign, locale) : "?"}{" "}
                {"\u2022"}{" "}
                {currentProfile.rising_sign ? translateSign(currentProfile.rising_sign, locale) : "?"}
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between p-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                  {t("discoverCompatibility")}
                </p>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${compatibilityTone.badge}`}>
                  {compatibility}% {t("discoverMatch")}
                </span>
              </div>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">
                {t("discoverProfileTitle")}
              </h3>
              <p className="mt-3 text-sm leading-7 text-text-muted">
                {currentProfile.bio || t("discoverNoBio")}
              </p>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-accent/20 bg-accent/8 p-3 text-center">
                  <p className="text-lg">☀️</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-text-dim">{t("discoverSun")}</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {currentProfile.sun_sign ? translateSign(currentProfile.sun_sign, locale) : "?"}
                  </p>
                </div>
                <div className="rounded-2xl border border-purple/20 bg-purple/8 p-3 text-center">
                  <p className="text-lg">🌙</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-text-dim">{t("discoverMoon")}</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {currentProfile.moon_sign ? translateSign(currentProfile.moon_sign, locale) : "?"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-white/[0.04] p-3 text-center">
                  <p className="text-lg">⬆️</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-text-dim">{t("discoverRising")}</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {currentProfile.rising_sign ? translateSign(currentProfile.rising_sign, locale) : "?"}
                  </p>
                </div>
              </div>

              {/* Compatibility circle + breakdown */}
              <div className="mt-6 rounded-2xl border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-5">
                {/* Circle */}
                <div className="flex flex-col items-center">
                  <div className="relative flex h-28 w-28 items-center justify-center">
                    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke={compatibility >= 70 ? "#34d399" : compatibility >= 50 ? "#fbbf24" : "#f87171"}
                        strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={`${(compatibility / 100) * 264} 264`}
                      />
                    </svg>
                    <span className="absolute text-3xl font-bold text-white">{compatibility}<span className="text-lg text-text-muted">%</span></span>
                  </div>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-text-dim">
                    {t("discoverCompatibility")}
                  </p>
                </div>

                {/* Breakdown */}
                <div className="mt-5 space-y-3">
                  {/* Emotional — free */}
                  <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3">
                    <span className="text-lg">💗</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{t("discoverEmotional") || "Emotional"}</p>
                      <p className="text-xs text-text-dim">
                        {t("discoverMoon")}: {currentProfile.moon_sign ? translateSign(currentProfile.moon_sign, locale) : "?"}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-accent">
                      {Math.max(40, Math.min(95, compatibility + (currentProfile.moon_sign === userSunSign ? 15 : -5)))}%
                    </span>
                  </div>
                  {/* Communication — free */}
                  <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3">
                    <span className="text-lg">💬</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{t("discoverCommunication") || "Communication"}</p>
                      <p className="text-xs text-text-dim">
                        {t("discoverSun")}: {currentProfile.sun_sign ? translateSign(currentProfile.sun_sign, locale) : "?"}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-accent">
                      {Math.max(40, Math.min(95, compatibility + (compatibility > 70 ? 5 : -10)))}%
                    </span>
                  </div>
                  {/* Passion — locked */}
                  <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-4 py-3 opacity-50">
                    <span className="text-lg">🔥</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{t("discoverPassion") || "Passion"}</p>
                    </div>
                    <span className="text-sm font-bold text-text-dim">???</span>
                  </div>
                  {/* Long term — locked */}
                  <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-4 py-3 opacity-50">
                    <span className="text-lg">🏠</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{t("discoverLongTerm") || "Long term"}</p>
                    </div>
                    <span className="text-sm font-bold text-text-dim">???</span>
                  </div>
                  {/* Values — locked */}
                  <div className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-4 py-3 opacity-50">
                    <span className="text-lg">💖</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{t("discoverValues") || "Values"}</p>
                    </div>
                    <span className="text-sm font-bold text-text-dim">???</span>
                  </div>
                </div>

                {/* Upgrade CTA */}
                <Link
                  href="/app/plans"
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  ✨ {t("discoverUnlockFull") || "Unlock full compatibility"}
                </Link>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleSwipe("pass")}
                disabled={actionLoading !== null}
                className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                {actionLoading === "pass" ? t("loading") : t("discoverPass")}
              </button>
              <button
                type="button"
                onClick={() => handleSwipe("like")}
                disabled={actionLoading !== null}
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                {actionLoading === "like" ? t("loading") : t("discoverLike")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!currentProfile) return;
                  const sign = currentProfile.sun_sign || "someone";
                  const text = `I'm ${compatibility}% compatible with a ${sign} on AstroDating! Find your cosmic match 🪐\nhttps://astrodatingapp.com`;
                  if (navigator.share) {
                    navigator.share({ text, title: "AstroDating Compatibility" }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(text);
                  }
                }}
                className="rounded-full border border-white/20 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.1]"
              >
                📤 {t("shareCompatibility") || "Share"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportFeedback(null);
                  setReportOpen((current) => !current);
                }}
                disabled={actionLoading !== null}
                className="rounded-full border border-[#6b3346] bg-[#3d1f2a]/40 px-5 py-3 text-sm font-semibold text-[#ffb7c7] transition-colors hover:bg-[#4a2632] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {t("reportUser")}
              </button>
            </div>

            {reportOpen ? (
              <div className="mt-5 rounded-[1.5rem] border border-[#6b3346] bg-[#241824]/85 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[#d69bab]">
                  {t("reportUser")}
                </p>
                <p className="mt-3 text-sm leading-7 text-white/85">{t("reportReasonPrompt")}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ["inappropriate_photos", t("reportReasonPhotos")],
                    ["harassment", t("reportReasonHarassment")],
                    ["spam", t("reportReasonSpam")],
                    ["fake_profile", t("reportReasonFake")],
                    ["underage", t("reportReasonUnderage")],
                    ["other", t("reportReasonOther")],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReportReason(value)}
                      className={`rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                        reportReason === value
                          ? "border-[#f4718f] bg-[#5b2839] text-white"
                          : "border-border bg-bg/60 text-text-muted hover:bg-card-hover"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reportDescription}
                  onChange={(event) => setReportDescription(event.target.value)}
                  placeholder={t("reportNote")}
                  rows={4}
                  className="mt-4 w-full rounded-[1.25rem] border border-border bg-bg/80 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
                />
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleReport}
                    disabled={reportSubmitting}
                    className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reportSubmitting ? t("sending") : t("submitReport")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
                {error}
              </p>
            ) : null}

            {reportFeedback ? (
              <p className="mt-4 rounded-2xl border border-[#6b3346] bg-[#3d1f2a]/40 px-4 py-3 text-sm text-[#ffd0d7]">
                {reportFeedback}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <aside className="rounded-[2rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("discoverQueue")}
        </p>
        <h3 className="mt-3 text-xl font-semibold text-white">
          {t("discoverQueueTitle")}
        </h3>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          {profiles.length > 1
            ? t("discoverQueueBody", { count: profiles.length - currentIndex - 1 })
            : t("discoverQueueEmpty")}
        </p>

        <div className="mt-6 space-y-3">
          {queue.length > 0 ? (
            queue.map((profile) => {
              const queueCompatibility = calculateQuickCompatibility(userSunSign, profile.sun_sign);
              const queueTone = getCompatibilityTone(queueCompatibility);

              return (
                <div
                  key={profile.id}
                  className="rounded-[1.4rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {profile.name || t("unknownUser")}
                        {profile.age ? `, ${profile.age}` : ""}
                      </div>
                      <div className="mt-1 text-sm text-text-muted">
                        {profile.sun_sign ? translateSign(profile.sun_sign, locale) : "?"} {"\u2022"}{" "}
                        {profile.moon_sign ? translateSign(profile.moon_sign, locale) : "?"}
                      </div>
                    </div>
                    <span className={`whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${queueTone.badge}`}>
                      {queueCompatibility}%
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-border bg-bg/70 px-4 py-4 text-sm text-text-muted">
              {t("discoverQueueEmpty")}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={loadProfiles}
          className="mt-6 w-full rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
        >
          {t("refreshProfiles")}
        </button>
      </aside>
      </div>
    </div>
  );
}
