"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { ProfilePublicMvpDisplay } from "@/components/ProfilePublicMvpDisplay";
import { LuminaryGlyph } from "@/components/ZodiacGlyph";
import { sanitizeLifestyleTags } from "@astro/shared/profile";

type ProfileOverviewProps = {
  profileId: string;
};

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
  // MVP fields surfaced via the discoverable_profiles view (extended in
  // 20260502000001). All optional / nullable for legacy profiles.
  relationship_intent?: string | null;
  personal_values?: string[] | null;
  interests?: string[] | null;
  looking_for_text?: string | null;
  prompts?: unknown;
  icebreaker_question?: string | null;
};

export function ProfileOverview({ profileId }: ProfileOverviewProps) {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const router = useRouter();
  const [profile, setProfile] = useState<DiscoverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("harassment");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [startingChat, setStartingChat] = useState(false);
  const [viewerInterests, setViewerInterests] = useState<string[]>([]);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();
      const [{ data, error: profileError }, { data: viewerRows }] =
        await Promise.all([
          supabase
            .from("discoverable_profiles")
            .select(
              "id, name, age, sun_sign, moon_sign, rising_sign, bio, image_url, images, relationship_intent, personal_values, interests, looking_for_text, prompts, icebreaker_question"
            )
            .eq("id", profileId)
            .maybeSingle(),
          supabase.rpc("get_my_full_profile"),
        ]);

      if (profileError) {
        throw profileError;
      }

      setProfile((data as DiscoverProfile | null) || null);
      const viewerRow = Array.isArray(viewerRows) ? viewerRows[0] : null;
      setViewerInterests(sanitizeLifestyleTags(viewerRow?.interests));
    } catch (loadFailure) {
      setError(loadFailure instanceof Error ? loadFailure.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  const handleStartConversation = async (prefill?: string) => {
    if (!profile || startingChat) return;
    try {
      setStartingChat(true);
      const supabase = getSupabaseBrowser();
      const { data, error: rpcError } = await supabase.rpc(
        "get_or_create_conversation",
        { target_user_id: profile.id }
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
      setStartingChat(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReport = async () => {
    if (!profile) {
      return;
    }

    try {
      setReportSubmitting(true);
      setReportFeedback(null);

      const supabase = getSupabaseBrowser();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error(t("reportError"));
      }

      const { error: reportError } = await supabase.from("reports").insert({
        reporter_id: user.id,
        reported_id: profile.id,
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
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("profileUnavailableTitle")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("profileUnavailableBody")}
        </p>
        <Link
          href="/app/discover"
          className="mt-6 inline-flex rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t("backToDiscover")}
        </Link>
      </div>
    );
  }

  const profileImage = resolveImageSrc(profile.image_url, profile.images?.[0]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="overflow-hidden rounded-[2rem] border border-border bg-card/90">
        <div className="relative min-h-[420px] bg-bg-secondary">
          <Image
            src={profileImage}
            alt={profile.name || t("unknownUser")}
            fill
            sizes="(max-width: 1280px) 100vw, 35vw"
            unoptimized={shouldBypassImageOptimization(profileImage)}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6">
            <h2 className="text-3xl font-semibold text-white">
              {profile.name || t("unknownUser")}
              {profile.age ? `, ${profile.age}` : ""}
            </h2>
            <p className="mt-2 text-sm text-white/80">
              {profile.sun_sign ? translateSign(profile.sun_sign, locale) : "?"} {"\u2022"}{" "}
              {profile.moon_sign ? translateSign(profile.moon_sign, locale) : "?"} {"\u2022"}{" "}
              {profile.rising_sign ? translateSign(profile.rising_sign, locale) : "?"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("profileSummaryLabel")}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">
          {t("profileSummaryTitle")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {profile.bio || t("discoverNoBio")}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-accent/20 bg-accent/8 p-3 text-center">
            <div className="flex justify-center">
              <LuminaryGlyph kind="sun" size="sm" />
            </div>
            <p className="mt-1 text-xs uppercase tracking-widest text-text-dim">{t("discoverSun")}</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {profile.sun_sign ? translateSign(profile.sun_sign, locale) : "?"}
            </p>
          </div>
          <div className="rounded-2xl border border-purple/20 bg-purple/8 p-3 text-center">
            <div className="flex justify-center">
              <LuminaryGlyph kind="moon" size="sm" />
            </div>
            <p className="mt-1 text-xs uppercase tracking-widest text-text-dim">{t("discoverMoon")}</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {profile.moon_sign ? translateSign(profile.moon_sign, locale) : "?"}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-white/[0.04] p-3 text-center">
            <div className="flex justify-center">
              <LuminaryGlyph kind="rising" size="sm" />
            </div>
            <p className="mt-1 text-xs uppercase tracking-widest text-text-dim">{t("discoverRising")}</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {profile.rising_sign ? translateSign(profile.rising_sign, locale) : "?"}
            </p>
          </div>
        </div>

        {/* MVP profile sections — sanitization happens inside the component
            so we pass the raw view payload. The icebreaker CTA reuses the
            conversation-start flow with a prefill query param. */}
        <div className="mt-6">
          <ProfilePublicMvpDisplay
            relationshipIntent={profile.relationship_intent}
            personalValues={profile.personal_values}
            interests={profile.interests}
            lookingForText={profile.looking_for_text}
            prompts={profile.prompts}
            icebreakerQuestion={profile.icebreaker_question}
            viewerInterests={viewerInterests}
            onSendIcebreaker={(question) => handleStartConversation(question)}
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleStartConversation()}
            disabled={startingChat}
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {startingChat ? t("sending") : t("publicStartConversation")}
          </button>
          <Link
            href={`/app/premium/celestial/synastry?profileId=${encodeURIComponent(profile.id)}`}
            className="rounded-full border border-purple/40 bg-purple/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple/15"
          >
            {t("publicCompareCharts")}
          </Link>
          <Link
            href="/app/discover"
            className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("backToDiscover")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setReportFeedback(null);
              setReportOpen((current) => !current);
            }}
            className="rounded-full border border-[#6b3346] bg-[#3d1f2a]/40 px-5 py-3 text-sm font-semibold text-[#ffb7c7] transition-colors hover:bg-[#4a2632]"
          >
            {t("reportUser")}
          </button>
        </div>

        {reportOpen ? (
          <div className="mt-6 rounded-[1.5rem] border border-[#6b3346] bg-[#241824]/85 p-5">
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
      </section>
    </div>
  );
}
