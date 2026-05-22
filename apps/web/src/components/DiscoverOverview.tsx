"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentTier, type WebTier } from "@/lib/web-subscriptions";
import { FullCardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { LuminaryGlyph } from "@/components/ZodiacGlyph";
import {
  findIntent,
  findLifestyleTag,
  sanitizeLifestyleTags,
} from "@astro/shared/profile";

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
  // MVP profile fields (returned by get_discoverable_profiles since
  // 20260430000002). All optional / nullable for legacy profiles.
  relationship_intent?: string | null;
  personal_values?: string[] | null;
  interests?: string[] | null;
  looking_for_text?: string | null;
  prompts?: unknown;
  icebreaker_question?: string | null;
};

export function DiscoverOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const router = useRouter();
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  // Subscription tier drives whether the "Find your compatibility" CTAs
  // pitch /app/plans (paywall) or open the actual synastry view. Celestial
  // === "premium", Cosmic === "premium_plus" — see the price-key map in
  // lib/web-checkout.ts. Defaulting to "free" before the RPC resolves
  // keeps the current pre-load paywall behavior; once the tier loads, the
  // CTAs swap destinations.
  const [tier, setTier] = useState<WebTier>("free");
  const [viewerInterests, setViewerInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Conversation-first: the only mutating action from this screen is
  // starting a conversation. Skip is purely client-side navigation.
  const [actionLoading, setActionLoading] = useState<"message" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("harassment");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  const currentProfile = profiles[currentIndex] ?? null;

  // All profiles except the one currently shown in the main card. Was
  // previously a sliced "next up to 3" preview that drained as you clicked
  // through, which made selecting a profile feel like a skip. Now it's a
  // stable browse list — clicking just jumps to that profile, the total
  // never shrinks unless we refresh.
  const queue = useMemo(
    () => profiles.filter((_, idx) => idx !== currentIndex),
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

      // Discover deck + viewer's own lifestyle tags + viewer's tier in
      // parallel. The viewer tags power the shared-tag highlight on each
      // card; on failure the highlight is silently absent. The tier
      // drives whether the in-card compatibility CTAs pitch the paywall
      // or open synastry directly.
      const [
        { data: discoverData, error: discoverError },
        { data: viewerRows },
        viewerTier,
      ] = await Promise.all([
        supabase.rpc("get_discoverable_profiles", {
          p_user_id: session.user.id,
          p_limit: 50,
        }),
        supabase.rpc("get_my_full_profile"),
        getCurrentTier(session.user.id),
      ]);

      setTier(viewerTier);

      if (discoverError) {
        throw discoverError;
      }

      const safeProfiles = ((discoverData as DiscoverProfile[]) || []).filter(
        (profile) => profile.id !== session.user.id
      );

      // Fisher-Yates shuffle so the deck order varies between sessions and
      // refreshes — without this, get_discoverable_profiles always returns
      // the same ordering and the user keeps seeing the same first profiles.
      for (let i = safeProfiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [safeProfiles[i], safeProfiles[j]] = [safeProfiles[j], safeProfiles[i]];
      }

      const viewerRow = Array.isArray(viewerRows) ? viewerRows[0] : null;
      setViewerInterests(sanitizeLifestyleTags(viewerRow?.interests));

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

  // Skip: pure client-side navigation. Nothing is persisted; no signal is
  // sent to the backend. The user simply moves to the next card.
  const handleSkip = () => {
    if (!currentProfile) return;
    if (currentIndex < profiles.length - 1) {
      setCurrentIndex((value) => value + 1);
    } else {
      setProfiles([]);
      setCurrentIndex(0);
    }
  };

  // Free conversation start: SECURITY DEFINER RPC enforces auth.uid() and
  // block guards server-side. The compatibility paywall is unrelated to
  // entering a conversation. When `prefill` is provided (icebreaker CTA),
  // append it as a query param so ChatThread can prefill the composer
  // without auto-sending.
  const handleStartConversation = async (prefill?: string) => {
    if (!currentProfile || !userId) return;

    try {
      setActionLoading("message");
      setError(null);

      const supabase = getSupabaseBrowser();
      const { data, error: rpcError } = await supabase.rpc(
        "get_or_create_conversation",
        { target_user_id: currentProfile.id }
      );

      if (rpcError || !data) {
        throw rpcError || new Error(t("unknownError"));
      }

      const conversationId = String(data);
      const trimmedPrefill = prefill?.trim();
      const target = trimmedPrefill
        ? `/${locale}/app/chat/${conversationId}?prefill=${encodeURIComponent(trimmedPrefill)}`
        : `/${locale}/app/chat/${conversationId}`;
      router.push(target);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("unknownError"));
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

  // Keyboard shortcut: arrows navigate; M opens a conversation (free).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentProfile || actionLoading || reportOpen) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        handleSkip();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        handleStartConversation();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentProfile, actionLoading, reportOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <FullCardSkeleton ariaLabel={t("discoverLoadingTitle")} />;
  }

  if (!currentProfile) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon="🌌"
          title={t("discoverEmptyTitle")}
          body={t("discoverEmptyBody")}
          action={
            <button
              type="button"
              onClick={loadProfiles}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(232,93,117,0.3)]"
            >
              {t("refreshProfiles")}
            </button>
          }
        />

        {/* Profile improvement nudge -- activation booster */}
        <Link
          href="/app/profile"
          className="group flex items-center gap-4 rounded-2xl border border-[rgba(74,222,128,0.18)] bg-[linear-gradient(135deg,rgba(74,222,128,0.06),rgba(74,222,128,0.02))] px-6 py-5 transition-all hover:-translate-y-0.5 hover:border-[rgba(74,222,128,0.3)]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(74,222,128,0.12)] text-xl">
            📸
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">{t("discoverEmptyImproveTitle")}</p>
            <p className="mt-1 text-xs text-text-muted">{t("discoverEmptyImproveBody")}</p>
          </div>
          <span className="hidden shrink-0 text-xs font-semibold text-[#a7f3c0] group-hover:text-white sm:inline">
            {t("discoverEmptyImproveCta")} →
          </span>
        </Link>
      </div>
    );
  }

  const profileImage = resolveImageSrc(currentProfile.image_url, currentProfile.images?.[0]);
  // Paid users (Celestial = "premium", Cosmic = "premium_plus") already
  // own the synastry feature — route them straight to it. Free users
  // still see the paywall.
  const isFreeTier = tier === "free";
  const compatibilityHref = isFreeTier
    ? "/app/plans"
    : `/app/premium/celestial/synastry?profileId=${encodeURIComponent(currentProfile.id)}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <section className="overflow-hidden rounded-[2rem] border border-border bg-card/90 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
        <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
          <div className="relative min-h-[420px] bg-bg-secondary">
            <Image
              src={profileImage}
              alt={` — `}
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              unoptimized={shouldBypassImageOptimization(profileImage)}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            {/* Compatibility % is intentionally hidden everywhere now.
                The premium-gated "Find your compatibility" CTA is the
                single surface for the score breakdown. */}
            <Link
              href={compatibilityHref}
              className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-purple/30 bg-[rgba(124,108,255,0.30)] px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-[rgba(124,108,255,0.40)]"
            >
              {t("findYourCompatibility")}
            </Link>
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
              <h3 className="text-2xl font-semibold tracking-[-0.03em] text-white">
                {t("discoverProfileTitle")}
              </h3>
              <p className="mt-3 text-sm leading-7 text-text-muted">
                {currentProfile.bio || t("discoverNoBio")}
              </p>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-accent/20 bg-accent/8 p-3 text-center">
                  <div className="flex justify-center">
                    <LuminaryGlyph kind="sun" size="sm" />
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-text-dim">{t("discoverSun")}</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {currentProfile.sun_sign ? translateSign(currentProfile.sun_sign, locale) : "?"}
                  </p>
                </div>
                <div className="rounded-2xl border border-purple/20 bg-purple/8 p-3 text-center">
                  <div className="flex justify-center">
                    <LuminaryGlyph kind="moon" size="sm" />
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-text-dim">{t("discoverMoon")}</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {currentProfile.moon_sign ? translateSign(currentProfile.moon_sign, locale) : "?"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-white/[0.04] p-3 text-center">
                  <div className="flex justify-center">
                    <LuminaryGlyph kind="rising" size="sm" />
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-text-dim">{t("discoverRising")}</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {currentProfile.rising_sign ? translateSign(currentProfile.rising_sign, locale) : "?"}
                  </p>
                </div>
              </div>

              {/* MVP teasers — compact preview of the new profile fields.
                  Full version lives on /app/profile/[id] (ProfileOverview). */}
              {(() => {
                const cardIntent = findIntent(currentProfile.relationship_intent);
                const cardTags = sanitizeLifestyleTags(currentProfile.interests);
                const cardIcebreaker = (currentProfile.icebreaker_question || "").trim();
                const viewerSet = new Set(viewerInterests);
                const visibleTags = cardTags.slice(0, 5);
                const hiddenCount = cardTags.length - visibleTags.length;
                const sharedCount = cardTags.filter((k) => viewerSet.has(k)).length;
                if (!cardIntent && !cardTags.length && !cardIcebreaker) return null;
                return (
                  <div className="mt-5 space-y-3">
                    {cardIntent ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
                        <span>{cardIntent.emoji}</span>
                        <span>{t(cardIntent.labelKey)}</span>
                      </span>
                    ) : null}
                    {visibleTags.length > 0 ? (
                      <div>
                        {sharedCount > 0 ? (
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-gold">
                            {t("tagsInCommon", { count: sharedCount })}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5">
                          {visibleTags.map((key) => {
                            const tag = findLifestyleTag(key);
                            if (!tag) return null;
                            const shared = viewerSet.has(key);
                            return (
                              <span
                                key={key}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${
                                  shared
                                    ? "border border-gold/60 bg-gold/15 text-gold"
                                    : "border border-border bg-bg/70 text-white"
                                }`}
                              >
                                <span>{tag.emoji}</span>
                                <span>{t(tag.labelKey)}</span>
                              </span>
                            );
                          })}
                          {hiddenCount > 0 ? (
                            <span className="inline-flex items-center rounded-full border border-border bg-bg/70 px-2.5 py-1 text-[11px] text-text-muted">
                              +{hiddenCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {cardIcebreaker ? (
                      <button
                        type="button"
                        onClick={() => handleStartConversation(cardIcebreaker)}
                        disabled={actionLoading !== null}
                        className="block w-full rounded-2xl border border-purple/40 bg-purple/10 p-3 text-left transition-colors hover:bg-purple/15 disabled:cursor-not-allowed"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-purple-light">
                          {t("publicIcebreakerLabel")}
                        </p>
                        <p className="mt-1 text-sm italic text-white">“{cardIcebreaker}”</p>
                        <p className="mt-1 text-[11px] font-semibold text-purple-light">
                          {t("publicIcebreakerCta")}
                        </p>
                      </button>
                    ) : null}
                  </div>
                );
              })()}

              {/* Premium-gated compatibility CTA — replaces the visible
                  % score + breakdown that used to live here. Compatibility
                  detail is now a paid feature, so this teaser only renders
                  for free users; paid tiers already own the synastry view
                  and the in-card pitch would be noise for them. */}
              {isFreeTier ? (
                <div className="mt-6 rounded-2xl border border-purple/25 bg-[linear-gradient(135deg,rgba(124,108,255,0.10),rgba(232,93,117,0.06))] p-5">
                  <h4 className="text-base font-semibold text-white">
                    {t("findYourCompatibility")}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {t("findYourCompatibilitySubtitle")}
                  </p>
                  <Link
                    href="/app/plans"
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-purple/90 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-purple hover:shadow-[0_0_18px_rgba(124,108,255,0.30)]"
                  >
                    {t("viewAllPlans")}
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {/* Skip is purely client-side navigation. Nothing is
                  persisted; the legacy 'pass' swipe is gone. */}
              <button
                type="button"
                onClick={handleSkip}
                className="group flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-all hover:border-white/30 hover:bg-card-hover"
                title="Keyboard: Arrow Left or Arrow Right"
              >
                <span className="text-base" aria-hidden="true">&#10005;</span>
                {t("discoverSkip")}
                <kbd className="ml-1 hidden rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-text-dim lg:inline">&#8592;</kbd>
              </button>
              {/* Free messaging: SECURITY DEFINER RPC handles auth, block
                  guards, and rate limit server-side. */}
              <button
                type="button"
                onClick={() => handleStartConversation()}
                disabled={actionLoading !== null}
                className="group flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(232,93,117,0.3)] disabled:cursor-not-allowed disabled:opacity-70"
                title="Keyboard: M"
              >
                {actionLoading === "message" ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                ) : (
                  <span className="text-base" aria-hidden="true">💬</span>
                )}
                {t("sendMessage")}
                <kbd className="ml-1 hidden rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60 lg:inline">M</kbd>
              </button>
              <Link
                href={`/app/profile/${currentProfile.id}`}
                className="group flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
              >
                👤 {t("matchesViewProfile")}
              </Link>
              <Link
                href={compatibilityHref}
                className="group flex items-center gap-2 rounded-full border border-purple/30 bg-purple/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple/20"
              >
                {t("findYourCompatibility")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (!currentProfile) return;
                  const text = `Discovering real connections on JUNO\nhttps://www.junosynastry.com`;
                  if (navigator.share) {
                    navigator.share({ text, title: t("shareTitle") }).catch(() => {});
                  } else if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).catch(() => {});
                  }
                }}
                className="rounded-full border border-white/20 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.1]"
              >
                📤 {t("share")}
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
              <div role="region" aria-label={t("reportUser")} className="mt-5 rounded-[1.5rem] border border-[#6b3346] bg-[#241824]/85 p-5">
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
                      aria-pressed={reportReason === value}
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
                <label className="mt-4 block">
                  <span className="sr-only">{t("reportNote")}</span>
                  <textarea
                    value={reportDescription}
                    onChange={(event) => setReportDescription(event.target.value)}
                    placeholder={t("reportNote")}
                    rows={4}
                    className="w-full rounded-[1.25rem] border border-border bg-bg/80 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
                  />
                </label>
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
              <p role="alert" className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
                {error}
              </p>
            ) : null}

            {reportFeedback ? (
              <p role="status" className="mt-4 rounded-2xl border border-[#6b3346] bg-[#3d1f2a]/40 px-4 py-3 text-sm text-[#ffd0d7]">
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
            ? t("discoverQueueBody", { count: profiles.length - 1 })
            : t("discoverQueueEmpty")}
        </p>

        {/* Constrain the queue to a fixed height so the page doesn't grow
            indefinitely with deck size. The 6px custom scrollbar in
            globals.css picks this up automatically; pr-2 keeps the thumb
            clear of the rounded queue buttons. */}
        <div className="mt-6 max-h-[28rem] space-y-3 overflow-y-auto pr-2">
          {queue.length > 0 ? (
            queue.map((profile) => {
              const targetIndex = profiles.findIndex((p) => p.id === profile.id);
              const queueIntent = findIntent(profile.relationship_intent);
              const queueTags = sanitizeLifestyleTags(profile.interests).slice(0, 2);
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    if (targetIndex >= 0) setCurrentIndex(targetIndex);
                  }}
                  className="block w-full rounded-[1.4rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-4 text-left transition-colors hover:border-accent/40 hover:bg-card-hover"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">
                        {profile.name || t("unknownUser")}
                        {profile.age ? `, ${profile.age}` : ""}
                      </div>
                      <div className="mt-1 text-sm text-text-muted">
                        {profile.sun_sign ? translateSign(profile.sun_sign, locale) : "?"}
                      </div>
                      {(queueIntent || queueTags.length > 0) ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {queueIntent ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                              <span>{queueIntent.emoji}</span>
                              <span>{t(queueIntent.labelKey)}</span>
                            </span>
                          ) : null}
                          {queueTags.map((key) => {
                            const tag = findLifestyleTag(key);
                            if (!tag) return null;
                            return (
                              <span
                                key={key}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-bg/70 px-2 py-0.5 text-[11px] text-white"
                              >
                                <span>{tag.emoji}</span>
                                <span>{t(tag.labelKey)}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
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
