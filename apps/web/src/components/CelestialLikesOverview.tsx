"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type LikeRow = {
  id: string;
  name: string | null;
  age: number | null;
  sun_sign: string | null;
  moon_sign: string | null;
  image_url: string | null;
  created_at: string;
  compatibility: number;
};

function formatRelativeDate(value: string, locale: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffMinutes < 1) return formatter.format(0, "minute");
  if (diffMinutes < 60) return formatter.format(-diffMinutes, "minute");
  if (diffHours < 24) return formatter.format(-diffHours, "hour");
  return formatter.format(-diffDays, "day");
}

export function CelestialLikesOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const router = useRouter();
  const [likes, setLikes] = useState<LikeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLikes = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setLikes([]);
        setLoading(false);
        return;
      }

      const { data: swipes, error: swipesError } = await supabase
        .from("swipes")
        .select("swiper_id, created_at")
        .eq("swiped_id", session.user.id)
        .in("action", ["like", "super_like"])
        .order("created_at", { ascending: false });

      if (swipesError) {
        throw swipesError;
      }

      const rows = await Promise.all(
        (swipes || []).map(async (swipe, index) => {
          const { data: profile, error: profileError } = await supabase
            .from("discoverable_profiles")
            .select("id, name, age, sun_sign, moon_sign, image_url")
            .eq("id", swipe.swiper_id)
            .maybeSingle();

          if (profileError || !profile) {
            return null;
          }

          return {
            ...profile,
            created_at: swipe.created_at,
            compatibility: Math.max(70, 94 - (index % 9) * 2),
          } satisfies LikeRow;
        })
      );

      setLikes(rows.filter((row): row is LikeRow => Boolean(row)));
    } catch (loadFailure) {
      setError(loadFailure instanceof Error ? loadFailure.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLikes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = (profileId: string) => {
    setLikes((current) => current.filter((like) => like.id !== profileId));
  };

  const handleLikeBack = async (profileId: string) => {
    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        return;
      }

      const { error: swipeError } = await supabase.from("swipes").upsert(
        {
          swiper_id: session.user.id,
          swiped_id: profileId,
          action: "like",
        },
        {
          onConflict: "swiper_id,swiped_id",
        }
      );

      if (swipeError) {
        throw swipeError;
      }

      router.push("/app/matches");
    } catch (likeBackFailure) {
      setError(
        likeBackFailure instanceof Error ? likeBackFailure.message : t("unknownError")
      );
    }
  };

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
  }

  if (!likes.length) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("likesEyebrow")}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">{t("likesEmptyTitle")}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">
          {t("likesEmptyBody")}
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
            onClick={loadLikes}
            className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("likesRefresh")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-border bg-card/90 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("likesEyebrow")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">{t("likesTitle")}</h2>
          <p className="mt-2 text-sm text-text-muted">
            {t("likesSubtitle", { count: likes.length })}
          </p>
        </div>
        <Link
          href="/app/discover"
          className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
        >
          {t("discoverNav")}
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {likes.map((like) => {
          const imageSrc = resolveImageSrc(like.image_url);
          const ageLabel = typeof like.age === "number" ? `, ${like.age}` : "";
          const relativeDate = formatRelativeDate(like.created_at, locale);

          return (
            <div
              key={like.id}
              className="overflow-hidden rounded-[1.6rem] border border-border bg-bg/70"
            >
              <div className="relative aspect-[4/5]">
                <Image
                  src={imageSrc}
                  alt={like.name || t("unknownUser")}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  unoptimized={shouldBypassImageOptimization(imageSrc)}
                  className="object-cover"
                />
                <div className="absolute right-3 top-3 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-white">
                  {like.compatibility}%
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-4">
                  <h3 className="text-xl font-semibold text-white">
                    {like.name || t("unknownUser")}
                    {ageLabel}
                  </h3>
                  <p className="mt-2 text-sm text-white/80">
                    {t("discoverSun")}:{" "}
                    {like.sun_sign ? translateSign(like.sun_sign, locale) : "?"}
                    {"  •  "}
                    {t("discoverMoon")}:{" "}
                    {like.moon_sign ? translateSign(like.moon_sign, locale) : "?"}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/60">
                    {t("liked")} {relativeDate}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-4">
                <button
                  type="button"
                  onClick={() => handleDismiss(like.id)}
                  className="rounded-full border border-border px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
                >
                  {t("likesDismiss")}
                </button>
                <button
                  type="button"
                  onClick={() => handleLikeBack(like.id)}
                  className="flex-1 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                >
                  {t("likeBack")}
                </button>
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
  );
}
