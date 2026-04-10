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
  if (!value) return null;
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "minute");
  if (diffMinutes < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffMinutes, "minute");
  if (diffHours < 24) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffHours, "hour");
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffDays, "day");
}

function compatColor(score: number) {
  if (score >= 80) return { bg: "bg-emerald-500/15", border: "border-emerald-400/30", text: "text-emerald-300" };
  if (score >= 60) return { bg: "bg-amber-500/15", border: "border-amber-400/30", text: "text-amber-300" };
  return { bg: "bg-red-500/15", border: "border-red-400/30", text: "text-red-300" };
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { setMatches([]); setLoading(false); return; }
      const { data, error: rpcError } = await supabase.rpc("get_user_matches", { p_user_id: session.user.id });
      if (rpcError) throw rpcError;
      setMatches((data as MatchRow[]) || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMatches(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" role="status" aria-label={t("loading")} />
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-accent/10 text-5xl" aria-hidden="true">
          💫
        </div>
        <h2 className="text-2xl font-semibold text-white">{t("matchesEmptyTitle")}</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-text-muted">
          {t("matchesEmptyBody")}
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/app/discover"
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("openDiscover")}
          </Link>
          <button
            type="button"
            onClick={loadMatches}
            className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("refreshMatches")}
          </button>
        </div>
      </div>
    );
  }

  const totalUnread = matches.reduce((sum, m) => sum + (m.unread_count || 0), 0);
  const avgCompat = Math.round(matches.reduce((sum, m) => sum + (m.compatibility_overall || 85), 0) / matches.length);

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-accent/20 bg-accent/8 p-4 text-center">
          <p className="text-3xl font-bold text-white">{matches.length}</p>
          <p className="mt-1 text-xs uppercase tracking-widest text-text-dim">{t("matchesNav")}</p>
        </div>
        <div className="rounded-2xl border border-purple/20 bg-purple/8 p-4 text-center">
          <p className="text-3xl font-bold text-white">{totalUnread}</p>
          <p className="mt-1 text-xs uppercase tracking-widest text-text-dim">{t("chatNav")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white/[0.04] p-4 text-center">
          <p className="text-3xl font-bold text-white">{avgCompat}%</p>
          <p className="mt-1 text-xs uppercase tracking-widest text-text-dim">{t("discoverMatch")}</p>
        </div>
      </div>

      {/* Match cards - grid layout like an app */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {matches.map((match) => {
          const profileImage = resolveImageSrc(match.matched_user_image);
          const relativeDate = formatRelativeDate(match.last_message_at || match.matched_at, locale);
          const compat = match.compatibility_overall || 85;
          const colors = compatColor(compat);

          return (
            <div
              key={match.match_id}
              className="group relative overflow-hidden rounded-2xl border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] transition-all hover:border-white/20 hover:shadow-[0_8px_30px_rgba(232,93,117,0.12)]"
            >
              {/* Image header */}
              <div className="relative h-48 overflow-hidden">
                <Image
                  src={profileImage}
                  alt={match.matched_user_name || t("unknownUser")}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  unoptimized={shouldBypassImageOptimization(profileImage)}
                  className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#090b13] via-transparent to-transparent" />

                {/* Compatibility badge */}
                <div className={`absolute right-3 top-3 rounded-full border ${colors.border} ${colors.bg} px-3 py-1`}>
                  <span className={`text-sm font-bold ${colors.text}`}>{compat}%</span>
                </div>

                {/* Unread badge */}
                {match.unread_count ? (
                  <div className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow-lg" aria-label={t("matchesUnread", { count: match.unread_count })}>
                    {match.unread_count}
                  </div>
                ) : null}

                {/* Name overlay */}
                <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
                  <h3 className="text-lg font-bold text-white drop-shadow-lg">
                    {match.matched_user_name || t("unknownUser")}
                  </h3>
                </div>
              </div>

              {/* Card body */}
              <div className="space-y-3 p-4">
                {/* Sign + time */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">
                    ☀️ {match.matched_user_sun_sign
                      ? translateSign(match.matched_user_sun_sign, locale)
                      : "?"}
                  </span>
                  {relativeDate && (
                    <span className="text-text-dim">{relativeDate}</span>
                  )}
                </div>

                {/* Last message preview */}
                <p className="truncate text-sm text-white/70">
                  {match.last_message || (
                    <span className="italic text-text-dim">{t("matchesNoMessage")}</span>
                  )}
                </p>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Link
                    href={`/app/chat/${match.match_id}`}
                    className="flex-1 rounded-xl bg-accent py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                  >
                    💬 {t("matchesOpenChat")}
                  </Link>
                  <Link
                    href={`/app/profile/${match.matched_user_id}`}
                    className="rounded-xl border border-border px-4 py-2.5 text-sm text-white transition-colors hover:bg-white/[0.06]"
                    title={t("matchesViewProfile")}
                  >
                    👤
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </p>
      )}
    </div>
  );
}
