"use client";

// Read-only counterpart to AccountProfileMvpSections — renders a viewer's
// MVP profile fields on /app/profile/[id] and inside the discover card.
// Pure display: no save logic, no internal mutation.
//
// Shared-tag highlight: the parent passes the viewer's own interests so the
// component can mark tags both profiles share. Pass [] when unknown.
//
// onSendIcebreaker is the conversation-spark CTA — when the viewer taps the
// icebreaker question, the parent decides what to do (open chat, prefill
// the message, etc.). Optional; if absent the icebreaker is shown but
// non-interactive.

import { useTranslations } from "next-intl";
import {
  findIntent,
  findLifestyleTag,
  findPrompt,
  findValue,
  sanitizeLifestyleTags,
  sanitizePersonalValues,
  sanitizePromptResponses,
  type PromptResponse,
} from "@astro/shared/profile";

type Props = {
  // Raw data from get_discoverable_profiles or the discoverable_profiles
  // view (snake_case, possibly null). Sanitization happens internally so
  // the parent doesn't have to.
  relationshipIntent: string | null | undefined;
  personalValues: unknown;
  interests: unknown;
  lookingForText: string | null | undefined;
  prompts: unknown;
  icebreakerQuestion: string | null | undefined;

  // Viewer's own tags for shared-tag highlighting. Pass [] if unknown.
  viewerInterests: string[];

  // Optional CTA — tap on icebreaker question.
  onSendIcebreaker?: (question: string) => void;
};

export function ProfilePublicMvpDisplay(props: Props) {
  const t = useTranslations("webApp");

  const intent = findIntent(props.relationshipIntent);
  const values = sanitizePersonalValues(props.personalValues);
  const tags = sanitizeLifestyleTags(props.interests);
  const lookingFor = (props.lookingForText || "").trim();
  const prompts: PromptResponse[] = sanitizePromptResponses(props.prompts).filter(
    (p) => p.response.trim().length > 0
  );
  const icebreaker = (props.icebreakerQuestion || "").trim();
  const viewerSet = new Set(props.viewerInterests);
  const sharedCount = tags.filter((k) => viewerSet.has(k)).length;

  // Render nothing if every MVP field is empty — keeps the page lean for
  // legacy profiles that haven't filled in any of the new sections.
  if (
    !intent &&
    !values.length &&
    !tags.length &&
    !lookingFor &&
    !prompts.length &&
    !icebreaker
  ) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Intent badge */}
      {intent && (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">
          <span>{intent.emoji}</span>
          <span>{t(intent.labelKey)}</span>
        </div>
      )}

      {/* Looking-for text */}
      {!!lookingFor && (
        <div className="rounded-[1.25rem] border border-border bg-bg/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            {t("publicLookingFor")}
          </p>
          <p className="mt-2 text-sm leading-7 text-white/90">{lookingFor}</p>
        </div>
      )}

      {/* Personal values */}
      {values.length > 0 && (
        <div className="rounded-[1.25rem] border border-border bg-bg/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            {t("publicValues")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {values.map((key) => {
              const v = findValue(key);
              if (!v) return null;
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg/80 px-3 py-1 text-xs text-white"
                >
                  <span>{v.emoji}</span>
                  <span>{t(v.labelKey)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Lifestyle tags with shared-tag highlight */}
      {tags.length > 0 && (
        <div className="rounded-[1.25rem] border border-border bg-bg/70 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              {t("publicLifestyle")}
            </p>
            {sharedCount > 0 ? (
              <span className="text-xs font-semibold text-gold">
                {t("tagsInCommon", { count: sharedCount })}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((key) => {
              const tag = findLifestyleTag(key);
              if (!tag) return null;
              const shared = viewerSet.has(key);
              return (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
                    shared
                      ? "border border-gold/60 bg-gold/15 text-gold"
                      : "border border-border bg-bg/80 text-white"
                  }`}
                >
                  <span>{tag.emoji}</span>
                  <span>{t(tag.labelKey)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Prompts */}
      {prompts.length > 0 && (
        <div className="space-y-3">
          {prompts.map((p, idx) => {
            const def = findPrompt(p.key);
            if (!def) return null;
            return (
              <div
                key={`${p.key}-${idx}`}
                className="rounded-[1.25rem] border border-border bg-bg/70 p-4"
              >
                <p className="text-xs font-semibold text-text-muted">
                  {t(def.labelKey)}
                </p>
                <p className="mt-2 text-sm leading-7 text-white/90">{p.response}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Icebreaker CTA */}
      {!!icebreaker && (
        <button
          type="button"
          onClick={() => props.onSendIcebreaker?.(icebreaker)}
          disabled={!props.onSendIcebreaker}
          className={`block w-full rounded-[1.25rem] border border-purple/40 bg-purple/10 p-4 text-left transition-colors ${
            props.onSendIcebreaker ? "hover:bg-purple/15" : "cursor-default"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-light">
            {t("publicIcebreakerLabel")}
          </p>
          <p className="mt-2 text-base italic leading-7 text-white">
            “{icebreaker}”
          </p>
          {props.onSendIcebreaker ? (
            <p className="mt-2 text-xs font-semibold text-purple-light">
              {t("publicIcebreakerCta")}
            </p>
          ) : null}
        </button>
      )}
    </div>
  );
}
