"use client";

// Conversation Guide — "Ways to say it, by sign." Web / PWA.
//
// WHY THIS FILE IS SHAPED UNLIKE EVERY OTHER PREMIUM COMPONENT HERE
// -----------------------------------------------------------------
// Every other premium surface on web — NatalChartOverview, TarotReadingOverview,
// DatePlannerOverview, RetrogradeAlertsOverview, PlanetaryTransitsOverview —
// calls `enforce_premium_feature` inside its mount effect, next to the data
// load. That is correct for them: they have nothing to show without the data,
// so deciding at mount costs nothing.
//
// It would be wrong here, and expensively so. This feature ships ONE free
// situation ("Start a conversation", all twelve signs) that must be readable
// with no server call, no quota and no account state. Calling the RPC at mount
// would spend the reader's single daily free preview before they had read a
// word — and would then hide the free situation for the rest of the day, for
// exactly the accounts the feature exists to convert.
//
// So:
//   1. NO mount-time gate call. The load effect fetches account state only.
//   2. `enforce_premium_feature` is called from a `useCallback`, on the first
//      click of a LOCKED situation, at most once per mount (`gateRequested`).
//   3. There is no <PremiumGate>-equivalent wrapper, and this file must never
//      grow one.
// `scripts/validate-coach-content.mjs` asserts all three structurally, against
// this source, for the same reason it does on mobile: they are one-line
// regressions that no type and no test would catch.
//
// SAME-DAY REPLAY
// ---------------
// The server's replay window is 15 minutes. A reader who spends their preview
// and comes back two hours later would otherwise be refused something they
// already used. `coach:preview-date:<userId>` in localStorage replays a grant
// the server ALREADY recorded today. It can never grant a first unlock.
// Per-account on purpose: a shared browser must not let account A's spent
// preview open content for account B.
//
// TELEMETRY
// ---------
// Deliberately none of its own. `enforce_premium_feature` writes a
// `premium_usage` row when it is called, and that row is the feature's whole
// analytics story on both platforms (docs/conversation-guide-telemetry.md).
// `record_product_event` whitelists event names server-side, so new events
// would need a migration; adding one for a port is scope the port does not
// need. The web calls the same RPC as mobile, so web opens land in the same
// table and the existing SQL keeps working with no change.
//
// CONTENT LANGUAGE
// ----------------
// The corpus is English-only in P0, by product decision (§7 of the feature
// plan). The chrome is localised; the guidance is not. Every corpus string
// rendered here carries `lang="en"` so a screen reader does not pronounce
// English prose with a French voice, and `conversationGuideEnglishNote` says
// so on screen rather than pretending otherwise.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  COACH_SIGNS,
  COACH_SITUATIONS,
  buildCoachCard,
  resolveCoachSign,
  resolveCoachSituation,
  type CoachSign,
  type CoachSituationKey,
} from "@astro/shared/coach";
import { Link } from "@/i18n/navigation";
import { ZodiacGlyph } from "@/components/ZodiacGlyph";
import { translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

/** Matches `premium_feature_policy.feature_key`, and the mobile screen. */
const SERVER_FEATURE_KEY = "conversation_guide";

const PREVIEW_REPLAY_KEY = "coach:preview-date";
const previewKeyFor = (userId: string) => `${PREVIEW_REPLAY_KEY}:${userId}`;

/** Local date in the reader's own timezone — `usage_date` is a server DATE,
 *  and toISOString() would roll the day over early for anyone west of UTC. */
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Same reasons as mobile's `PremiumGateReason`, kept as strings because the
 *  RPC returns them as text and web has no shared enum for them. */
type GateReason =
  | "free_preview_exhausted"
  | "quota_exceeded"
  | "insufficient_tier"
  | "error"
  | string;

type UnlockState =
  | { status: "locked" }
  | { status: "checking" }
  | { status: "unlocked"; viaPreview: boolean }
  | { status: "refused"; reason: GateReason };

function readReplayMarker(userId: string): boolean {
  try {
    return window.localStorage.getItem(previewKeyFor(userId)) === localDateKey(new Date());
  } catch {
    // Private mode, blocked storage: costs one extra RPC, never access.
    return false;
  }
}

function writeReplayMarker(userId: string): void {
  try {
    window.localStorage.setItem(previewKeyFor(userId), localDateKey(new Date()));
  } catch {
    // Same: a missing marker is a re-ask, not a lockout.
  }
}

export function ConversationGuideOverview() {
  const t = useTranslations("webApp");
  // Sign names come from `translateSign`, the web app's existing sign table,
  // rather than 12 new keys per locale. Mobile uses flat `t(sign)` keys it
  // already had; duplicating those on web would add 96 strings for nothing.
  const locale = useLocale();
  const searchParams = useSearchParams();

  // Deep links, push landing pages and the chat chip are untrusted input.
  // `resolveCoachSign` returns null rather than guessing, so a bad param opens
  // the picker instead of rendering someone else's advice under a name the
  // reader trusts.
  const paramSign = resolveCoachSign(searchParams.get("sign"));
  const paramSituation = resolveCoachSituation(searchParams.get("situation"));

  const [state, setState] = useState<WebAccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sign, setSign] = useState<CoachSign | null>(paramSign);
  const [situation, setSituation] = useState<CoachSituationKey>(paramSituation ?? "start");
  const [unlock, setUnlock] = useState<UnlockState>({ status: "locked" });
  const [copied, setCopied] = useState(false);

  // A ref, not state: it has to be true even if two clicks land in the same
  // render pass. This is what makes "one server call per mount" literal.
  const gateRequested = useRef(false);

  // Account state only. No gate call — see the file header. This effect is the
  // one place a mount-time RPC would be tempting, so it is the one place the
  // validator reads most carefully.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        if (!active) return;
        setState(account);
        if (account?.userId && readReplayMarker(account.userId)) {
          setUnlock({ status: "unlocked", viaPreview: true });
        }
      } catch {
        // A failed account read must not blank the page: the free situation
        // does not need an account at all, and `entitled` simply stays false.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [t]);

  // Re-navigating with new params (the chat chip clicked while the guide is
  // already open) updates the query without remounting, so the initial
  // useState values would go stale. This moves the SELECTION only — it never
  // touches `unlock` and never asks the server. A link must not be able to
  // spend someone's preview.
  const appliedParams = useRef<string | null>(null);
  useEffect(() => {
    const signature = `${paramSign ?? ""}|${paramSituation ?? ""}`;
    if (appliedParams.current === signature) return;
    appliedParams.current = signature;
    if (paramSign) setSign(paramSign);
    if (paramSituation) setSituation(paramSituation);
    setCopied(false);
  }, [paramSign, paramSituation]);

  // Conversation Guide is a Celestial-tier feature; premium_plus reaches it by
  // downward inclusion, the same rule the hubs use. The server decides for
  // real — this only decides whether to bother asking.
  const entitled = state != null && state.tier !== "free";

  const situationMeta = useMemo(
    () => COACH_SITUATIONS.find((s) => s.key === situation) ?? COACH_SITUATIONS[0],
    [situation],
  );

  const card = useMemo(
    () => (sign ? buildCoachCard({ sign, situation }) : null),
    [sign, situation],
  );

  const canRead =
    situationMeta.access === "free" || entitled || unlock.status === "unlocked";

  // GATE: fires on the first click of a locked situation, and only then.
  //
  // Never called on mount, never from an effect, never for the free situation,
  // and at most once per mount. Moving this call anywhere near mount would
  // spend the reader's daily preview before they read a word — the single
  // failure mode this whole component is shaped around.
  const requestUnlock = useCallback(async () => {
    if (gateRequested.current) return;
    gateRequested.current = true;
    setUnlock({ status: "checking" });

    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .rpc("enforce_premium_feature", { p_feature_key: SERVER_FEATURE_KEY })
        .maybeSingle<{ allowed: boolean; reason: string | null; is_free_preview?: boolean }>();

      if (error || !data) {
        // A refusal consumed nothing, so a transport error stays retryable.
        gateRequested.current = false;
        // Never paywall someone who is actually paying: a network blip on an
        // entitled account reads through, the same optimistic policy mobile
        // applies.
        if (entitled) {
          setUnlock({ status: "unlocked", viaPreview: false });
          return;
        }
        setUnlock({ status: "refused", reason: "error" });
        return;
      }

      if (data.allowed === true) {
        const viaPreview = data.reason === "free_preview" || data.is_free_preview === true;
        setUnlock({ status: "unlocked", viaPreview });
        if (viaPreview && state?.userId) writeReplayMarker(state.userId);
        return;
      }

      const reason = data.reason ?? "insufficient_tier";
      if (reason === "insufficient_tier" && entitled) {
        // Entitlement the billing webhook has not caught up with yet.
        setUnlock({ status: "unlocked", viaPreview: false });
        return;
      }

      // A real refusal is final for this mount: asking again would be a second
      // RPC for an answer that will not have changed.
      setUnlock({ status: "refused", reason });
    } catch {
      gateRequested.current = false;
      if (entitled) {
        setUnlock({ status: "unlocked", viaPreview: false });
        return;
      }
      setUnlock({ status: "refused", reason: "error" });
    }
  }, [entitled, state?.userId]);

  const handleSituationClick = useCallback(
    (key: CoachSituationKey) => {
      setCopied(false);
      setSituation(key);

      const meta = COACH_SITUATIONS.find((s) => s.key === key);
      // Entitled accounts are NOT skipped, deliberately. `premium_usage` is
      // this feature's only telemetry, and every other web premium surface
      // records for subscribers too — skipping them would undercount the Guide
      // against natal_chart and make the comparison that decides P1 dishonest.
      // They never wait for it: `canRead` already includes `entitled`.
      if (meta?.access !== "locked" || unlock.status === "unlocked") return;
      void requestUnlock();
    },
    [requestUnlock, unlock.status],
  );

  const handleCopy = useCallback(async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.copyText);
      setCopied(true);
    } catch {
      // Clipboard permission denied. The text stays selectable, which is the
      // fallback that always works.
    }
  }, [card]);

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <p className="text-sm text-text-muted">{t("loading")}</p>
      </div>
    );
  }

  const renderSignPicker = () => (
    <div className="rounded-[2rem] border border-border bg-card/90 p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
        {t("conversationGuideChooseSign")}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {COACH_SIGNS.map((option) => {
          const selected = option === sign;
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                setCopied(false);
                setSign(option);
              }}
              aria-pressed={selected}
              data-testid={`coach-sign-${option}`}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm transition-colors ${
                selected
                  ? "border-accent/50 bg-accent/12 text-white"
                  : "border-border bg-bg/70 text-text-muted hover:border-white/20 hover:text-white"
              }`}
            >
              <ZodiacGlyph sign={option} className="text-base leading-none text-accent" />
              <span className="truncate">{translateSign(option, locale)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderSituationPicker = () => (
    <div className="rounded-[2rem] border border-border bg-card/90 p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
        {t("conversationGuideChooseSituation")}
      </p>
      <div className="mt-4 space-y-2">
        {COACH_SITUATIONS.map((option) => {
          const selected = option.key === situation;
          const isFree = option.access === "free";
          const openToReader = isFree || entitled || unlock.status === "unlocked";
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => handleSituationClick(option.key)}
              aria-pressed={selected}
              data-testid={`coach-situation-${option.key}`}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                selected
                  ? "border-accent/50 bg-accent/10"
                  : "border-border bg-bg/70 hover:border-white/20"
              }`}
            >
              <span className={`text-sm ${selected ? "text-white" : "text-text-muted"}`}>
                {t(option.labelKey)}
              </span>
              <span
                className={`shrink-0 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                  openToReader
                    ? "border-[rgba(124,200,160,0.3)] bg-[rgba(124,200,160,0.12)] text-[#a9e0c4]"
                    : "border-white/12 bg-black/20 text-white/70"
                }`}
              >
                {openToReader
                  ? t("conversationGuideFreeBadge")
                  : t("conversationGuideLockedBadge")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderLocked = () => {
    if (unlock.status === "checking") {
      return (
        <div className="rounded-[2rem] border border-border bg-card/90 p-8">
          <p className="text-sm text-text-muted">{t("conversationGuideChecking")}</p>
        </div>
      );
    }

    if (unlock.status === "refused") {
      const exhausted =
        unlock.reason === "free_preview_exhausted" || unlock.reason === "quota_exceeded";
      const errored = unlock.reason === "error";

      // Say what actually happened. Telling someone they used a preview they
      // were never offered is how a paywall loses trust.
      return (
        <div
          className="rounded-[2rem] border border-[rgba(232,93,117,0.28)] bg-[rgba(232,93,117,0.08)] p-8"
          data-testid="coach-locked-card"
        >
          <h2 className="text-xl font-semibold text-white">
            {errored
              ? t("conversationGuideErrorTitle")
              : exhausted
                ? t("conversationGuideExhaustedTitle")
                : t("conversationGuideLockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-white/90">
            {errored
              ? t("conversationGuideErrorBody")
              : exhausted
                ? t("conversationGuideExhaustedBody")
                : t("conversationGuideLockedBody")}
          </p>
          {errored ? (
            <button
              type="button"
              onClick={() => {
                gateRequested.current = false;
                void requestUnlock();
              }}
              data-testid="coach-retry"
              className="mt-5 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("conversationGuideRetry")}
            </button>
          ) : (
            <Link
              href="/app/plans"
              data-testid="coach-upgrade-cta"
              className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("conversationGuideUpgradeCta")}
            </Link>
          )}
        </div>
      );
    }

    // Not yet asked. Nothing has been spent — the click is what asks.
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8" data-testid="coach-locked-card">
        <h2 className="text-xl font-semibold text-white">
          {t("conversationGuideLockedTitle")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("conversationGuideLockedBody")}
        </p>
        <button
          type="button"
          onClick={() => void requestUnlock()}
          data-testid="coach-unlock-cta"
          className="mt-5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t("conversationGuideUnlockCta")}
        </button>
      </div>
    );
  };

  const renderCard = () => {
    if (!card) {
      return (
        <div className="rounded-[2rem] border border-border bg-card/90 p-8">
          <p className="text-sm text-text-muted">{t("conversationGuideChooseSign")}</p>
        </div>
      );
    }

    if (!canRead) return renderLocked();

    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6" data-testid="coach-card">
        {/* `lang="en"` on every corpus string: the guidance is English in P0
            and a screen reader must not read it with the page's voice. */}
        <p lang="en" className="text-base leading-7 text-white/90">
          {card.intent}
        </p>

        <div className="mt-6 space-y-5">
          {card.sections.map((section) => (
            <div key={section.id}>
              <p className="text-[11px] uppercase tracking-[0.22em] text-text-dim">
                {t(section.labelKey)}
              </p>
              {section.copyable ? (
                <>
                  <p
                    lang="en"
                    className="mt-2 rounded-2xl border border-accent/25 bg-accent/[0.07] p-4 text-sm leading-7 text-white"
                  >
                    “{section.body}”
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleCopy()}
                      data-testid="coach-copy"
                      className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-card-hover"
                    >
                      {copied ? t("conversationGuideCopied") : t("conversationGuideCopy")}
                    </button>
                    <span className="text-xs text-text-dim">
                      {t("conversationGuideEditHint")}
                    </span>
                  </div>
                </>
              ) : (
                <p lang="en" className="mt-2 text-sm leading-7 text-text-muted">
                  {section.body}
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-6 border-t border-white/8 pt-4 text-xs leading-6 text-text-dim">
          {t("conversationGuideDisclaimer")}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderSignPicker()}
      {renderSituationPicker()}
      {renderCard()}

      {unlock.status === "unlocked" && unlock.viaPreview && state?.tier === "free" ? (
        <p
          data-testid="coach-preview-banner"
          className="rounded-2xl border border-[rgba(124,200,160,0.25)] bg-[rgba(124,200,160,0.08)] px-5 py-3 text-sm text-[#a9e0c4]"
        >
          {t("conversationGuidePreviewBanner")}
        </p>
      ) : null}

      {/* Not buried in a tooltip: a reader in French who gets English guidance
          should be told, not left to work it out. */}
      <p className="text-xs leading-6 text-text-dim">
        {t("conversationGuideEnglishNote")}
      </p>
    </div>
  );
}
