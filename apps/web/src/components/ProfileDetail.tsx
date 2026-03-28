"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type ProfileDetailProps = {
  profileId: string;
};

type ReportReason =
  | "inappropriate_photos"
  | "harassment"
  | "spam"
  | "fake_profile"
  | "underage"
  | "other";

type Profile = {
  id: string;
  name: string | null;
  age: number | null;
  bio: string | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  image_url: string | null;
  images?: string[] | null;
  current_city?: string | null;
};

export function ProfileDetail({ profileId }: ProfileDetailProps) {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("harassment");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  const reportReasons: { value: ReportReason; label: string }[] = [
    { value: "inappropriate_photos", label: t("reportReasonPhotos") },
    { value: "harassment", label: t("reportReasonHarassment") },
    { value: "spam", label: t("reportReasonSpam") },
    { value: "fake_profile", label: t("reportReasonFake") },
    { value: "underage", label: t("reportReasonUnderage") },
    { value: "other", label: t("reportReasonOther") },
  ];

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseBrowser();
        const { data, error: loadError } = await supabase
          .from("discoverable_profiles")
          .select("id, name, age, bio, sun_sign, moon_sign, rising_sign, image_url, images, current_city")
          .eq("id", profileId)
          .maybeSingle();

        if (loadError) {
          throw loadError;
        }

        setProfile((data as Profile) || null);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [profileId, t]);

  const handleReportSubmit = async () => {
    if (!profile) {
      return;
    }

    setReportSubmitting(true);
    setReportFeedback(null);

    try {
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
      setReportDescription("");
      setReportReason("harassment");
      setReportOpen(false);
    } catch (failure) {
      setReportFeedback(
        failure instanceof Error && failure.message ? failure.message : t("reportError"),
      );
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

  if (!profile) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("profileUnavailableTitle")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("profileUnavailableBody")}
        </p>
        <Link
          href="/app/matches"
          className="mt-6 inline-flex rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t("matchesNav")}
        </Link>
      </div>
    );
  }

  const imageSrc = resolveImageSrc(profile.image_url, profile.images?.[0]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="overflow-hidden rounded-[2rem] border border-border bg-card/90">
        <div className="relative min-h-[520px] bg-bg-secondary">
          <Image
            src={imageSrc}
            alt={profile.name || t("unknownUser")}
            fill
            sizes="(max-width: 1280px) 100vw, 45vw"
            unoptimized={shouldBypassImageOptimization(imageSrc)}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6">
            <h2 className="text-3xl font-semibold text-white">
              {profile.name || t("unknownUser")}
              {profile.age ? `, ${profile.age}` : ""}
            </h2>
            {profile.current_city ? (
              <p className="mt-2 text-sm text-white/80">{profile.current_city}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("profileDetails")}
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-white">{t("profileCosmicSnapshot")}</h3>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <div className="rounded-full border border-border bg-bg/70 px-4 py-2 text-white">
            {t("discoverSun")}:{" "}
            {profile.sun_sign ? translateSign(profile.sun_sign, locale) : "?"}
          </div>
          <div className="rounded-full border border-border bg-bg/70 px-4 py-2 text-white">
            {t("discoverMoon")}:{" "}
            {profile.moon_sign ? translateSign(profile.moon_sign, locale) : "?"}
          </div>
          <div className="rounded-full border border-border bg-bg/70 px-4 py-2 text-white">
            {t("discoverRising")}:{" "}
            {profile.rising_sign ? translateSign(profile.rising_sign, locale) : "?"}
          </div>
        </div>

        <div className="mt-6 rounded-[1.5rem] border border-border bg-bg/70 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("profileBio")}
          </p>
          <p className="mt-3 text-sm leading-7 text-white/85">
            {profile.bio || t("discoverNoBio")}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/matches"
            className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("backToMatches")}
          </Link>
          <Link
            href="/app/discover"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("discoverNav")}
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
              {reportReasons.map((reason) => (
                <button
                  key={reason.value}
                  type="button"
                  onClick={() => setReportReason(reason.value)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                    reportReason === reason.value
                      ? "border-[#f4718f] bg-[#5b2839] text-white"
                      : "border-border bg-bg/60 text-text-muted hover:bg-card-hover"
                  }`}
                >
                  {reason.label}
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
                onClick={handleReportSubmit}
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
