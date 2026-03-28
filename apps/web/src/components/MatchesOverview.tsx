"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type MatchRow = {
  match_id: string;
  matched_user_id: string;
  matched_user_name: string | null;
  matched_user_image: string | null;
  matched_user_sun_sign: string | null;
  compatibility_overall: number | null;
  last_message: string | null;
  last_message_at: string | null;
  matched_at: string | null;
  unread_count: number | null;
};

function formatRelativeDate(value: string | null, locale: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "minute");
  }
  if (diffMinutes < 60) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffMinutes, "minute");
  }
  if (diffHours < 24) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffHours, "hour");
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffDays, "day");
}

export function MatchesOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMatches = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("get_user_matches", {
        p_user_id: session.user.id,
      });

      if (rpcError) {
        throw rpcError;
      }

      setMatches((data as MatchRow[]) || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatches();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("matchesEmptyTitle")}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">
          {t("matchesEmptyBody")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/discover"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("openDiscover")}
          </Link>
          <button
            type="button"
            onClick={loadMatches}
            className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("refreshMatches")}
          </button>
        </div>
      </div>
    );
  }

  const totalUnread = matches.reduce((sum, match) => sum + (match.unread_count || 0), 0);

  return (
    <div className="space-y-6">
      <section className="rounded-[2.2rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("matchesLabel")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              {t("matchesTitle")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted sm:text-base">
              {t("matchesSubtitle", { count: matches.length })}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.6rem] border border-[rgba(232,93,117,0.24)] bg-[rgba(232,93,117,0.10)] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-dim">
                {t("matchesNav")}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                {matches.length}
              </p>
            </div>
            <div className="rounded-[1.6rem] border border-border bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-dim">
                {t("chatNav")}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                {totalUnread}
              </p>
            </div>
            <div className="rounded-[1.6rem] border border-border bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-dim">
                {t("discoverMatch")}
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                {Math.round(matches.reduce((sum, match) => sum + (match.compatibility_overall || 85), 0) / matches.length)}%
              </p>
            </div>
          </div>
        </div>
      </section>

    <div className="rounded-[2rem] border border-border bg-card/90 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("matchesLabel")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">{t("matchesTitle")}</h2>
          <p className="mt-2 text-sm text-text-muted">
            {t("matchesSubtitle", { count: matches.length })}
          </p>
        </div>
        <Link
          href="/app/discover"
          className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
        >
          {t("discoverNav")}
        </Link>
      </div>

      <div className="mt-6 space-y-4">
        {matches.map((match) => {
          const profileImage = resolveImageSrc(match.matched_user_image);
          const relativeDate = formatRelativeDate(
            match.last_message_at || match.matched_at,
            locale
          );

          return (
            <div
              key={match.match_id}
              className="grid gap-4 rounded-[1.65rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 transition-colors hover:bg-white/[0.06] lg:grid-cols-[auto_1fr_auto]"
            >
              <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-bg-secondary">
                <Image
                  src={profileImage}
                  alt={match.matched_user_name || t("unknownUser")}
                  fill
                  sizes="80px"
                  unoptimized={shouldBypassImageOptimization(profileImage)}
                  className="object-cover"
                />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-semibold text-white">
                    {match.matched_user_name || t("unknownUser")}
                  </h3>
                  <span className="rounded-full border border-border px-3 py-1 text-sm text-white">
                    {match.compatibility_overall || 85}% {t("discoverMatch")}
                  </span>
                  {match.unread_count ? (
                    <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-white">
                      {t("matchesUnread", { count: match.unread_count })}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-sm text-text-muted">
                  {t("discoverSun")}:{" "}
                  {match.matched_user_sun_sign
                    ? translateSign(match.matched_user_sun_sign, locale)
                    : "?"}
                  {relativeDate ? ` \u2022 ${relativeDate}` : ""}
                </p>

                <p className="mt-3 truncate text-sm text-white/85">
                  {match.last_message || t("matchesNoMessage")}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href={`/app/chat/${match.match_id}`}
                  className="rounded-full bg-accent px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                >
                  {t("matchesOpenChat")}
                </Link>
                <Link
                  href={`/app/profile/${match.matched_user_id}`}
                  className="rounded-full border border-border px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-card-hover"
                >
                  {t("matchesViewProfile")}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </p>
      ) : null}
    </div>
    </div>
  );
}
