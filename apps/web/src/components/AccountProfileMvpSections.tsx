"use client";

// MVP profile sections — relationship intent, looking-for text, personal
// values, lifestyle tags, prompts, icebreaker. Controlled component: the
// parent (AccountProfileWorkspace) owns state, passes it in, and receives
// change callbacks. The parent is also responsible for persisting on save.
//
// Styling matches the existing AccountProfileWorkspace section pattern
// (rounded-[1.5rem] panels, accent-color borders, etc.) so the new sections
// blend in with the rest of the edit page.

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  CONNECTION_INTENTIONS,
  LIFESTYLE_CATEGORIES,
  LIFESTYLE_TAGS,
  MAX_CONNECTION_INTENTIONS,
  MAX_ICEBREAKER_LENGTH,
  MAX_LIFESTYLE_TAGS,
  MAX_LOOKING_FOR_TEXT_LENGTH,
  MAX_PROMPT_RESPONSE_LENGTH,
  MAX_PROMPTS,
  MAX_VALUES,
  PERSONAL_VALUES,
  PROMPTS,
  PROMPT_CATEGORIES,
  // RELATIONSHIP_INTENTS — legacy macro hidden from this edit surface (see
  // "Legacy 'What I'm here for'" comment below). Sanitizer + shared catalog
  // still export it so legacy data round-trips cleanly through the workspace.
  findPrompt,
  type ConnectionIntention,
  type PromptDef,
  type PromptResponse,
  type RelationshipIntent,
} from "@astro/shared/profile";

type Props = {
  values: string[];
  onValuesChange: (next: string[]) => void;
  lifestyleTags: string[];
  onLifestyleTagsChange: (next: string[]) => void;
  intent: RelationshipIntent | null;
  onIntentChange: (next: RelationshipIntent) => void;
  // Macro connection intentions (love / friendship / business). At least
  // one must remain selected; the parent (AccountProfileWorkspace) enforces
  // this on save and the empty-state warning surfaces inline.
  connectionIntentions: ConnectionIntention[];
  onConnectionIntentionsChange: (next: ConnectionIntention[]) => void;
  lookingForText: string;
  onLookingForTextChange: (next: string) => void;
  prompts: PromptResponse[];
  onPromptsChange: (next: PromptResponse[]) => void;
  icebreaker: string;
  onIcebreakerChange: (next: string) => void;
};

export function AccountProfileMvpSections(props: Props) {
  const t = useTranslations("webApp");
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Values ──
  const toggleValue = (key: string) => {
    if (props.values.includes(key)) {
      props.onValuesChange(props.values.filter((v) => v !== key));
    } else if (props.values.length < MAX_VALUES) {
      props.onValuesChange([...props.values, key]);
    }
  };

  // ── Lifestyle ──
  const toggleLifestyleTag = (key: string) => {
    if (props.lifestyleTags.includes(key)) {
      props.onLifestyleTagsChange(props.lifestyleTags.filter((v) => v !== key));
    } else if (props.lifestyleTags.length < MAX_LIFESTYLE_TAGS) {
      props.onLifestyleTagsChange([...props.lifestyleTags, key]);
    }
  };

  // ── Prompts ──
  const usedPromptKeys = new Set(props.prompts.map((p) => p.key));
  const availablePromptsByCategory = PROMPT_CATEGORIES.map((cat) => ({
    cat,
    items: PROMPTS.filter((p) => p.category === cat.id && !usedPromptKeys.has(p.key)),
  })).filter((g) => g.items.length > 0);

  const addPrompt = (key: string) => {
    if (props.prompts.length >= MAX_PROMPTS) return;
    props.onPromptsChange([...props.prompts, { key, response: "" }]);
    setPickerOpen(false);
  };

  const updatePromptResponse = (idx: number, text: string) => {
    const next = [...props.prompts];
    next[idx] = {
      ...next[idx],
      response: text.slice(0, MAX_PROMPT_RESPONSE_LENGTH),
    };
    props.onPromptsChange(next);
  };

  const removePrompt = (idx: number) => {
    props.onPromptsChange(props.prompts.filter((_, i) => i !== idx));
  };

  // ── Connection intentions ──
  const toggleConnectionIntention = (key: ConnectionIntention) => {
    const has = props.connectionIntentions.includes(key);
    if (has) {
      props.onConnectionIntentionsChange(props.connectionIntentions.filter((k) => k !== key));
    } else if (props.connectionIntentions.length < MAX_CONNECTION_INTENTIONS) {
      props.onConnectionIntentionsChange([...props.connectionIntentions, key]);
    }
  };
  const intentionsEmpty = props.connectionIntentions.length === 0;

  return (
    <div className="space-y-6">
      {/* ── Connection intentions (macro) ─────────────────────────────── */}
      <section className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-semibold text-white">
            {t("profileIntentionsTitle")} <span className="text-accent">*</span>
          </h3>
        </div>
        <p className="mt-2 text-sm leading-7 text-text-muted">
          {t("profileIntentionsHelper")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {CONNECTION_INTENTIONS.map((intent) => {
            const active = props.connectionIntentions.includes(intent.key);
            const disabled = !active && props.connectionIntentions.length >= MAX_CONNECTION_INTENTIONS;
            return (
              <button
                key={intent.key}
                type="button"
                onClick={() => toggleConnectionIntention(intent.key)}
                disabled={disabled}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-bg/70 text-white hover:bg-card-hover"
                }`}
                aria-pressed={active}
              >
                {t(intent.labelKey)}
              </button>
            );
          })}
        </div>
        {intentionsEmpty ? (
          <p className="mt-3 text-sm italic text-accent">
            {t("profileIntentionsEmptyWarning")}
          </p>
        ) : null}
      </section>

      {/* ── Legacy "What I'm here for" (relationship_intent) ──────────
          Hidden from the edit surface as of the Three Intentions cleanup.
          The macro `Open to` chips above are now the single source of UX
          truth. The field is still loaded into mvpForm.intent and written
          back unchanged on save (see AccountProfileWorkspace.handleMvpSave),
          so legacy profiles keep their stored value. Intentionally NOT
          deleted — preserves back-compat and keeps RELATIONSHIP_INTENTS
          available for downstream legacy reads / sanitizers. */}

      {/* ── Looking-for text ───────────────────────────────────────────── */}
      <section className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-semibold text-white">{t("lookingForText")}</h3>
          <span className="text-xs text-text-muted">
            {props.lookingForText.length}/{MAX_LOOKING_FOR_TEXT_LENGTH}
          </span>
        </div>
        <textarea
          value={props.lookingForText}
          onChange={(event) =>
            props.onLookingForTextChange(
              event.target.value.slice(0, MAX_LOOKING_FOR_TEXT_LENGTH)
            )
          }
          placeholder={t("lookingForTextPlaceholder")}
          maxLength={MAX_LOOKING_FOR_TEXT_LENGTH}
          rows={3}
          className="mt-4 w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
        />
      </section>

      {/* ── Personal values ────────────────────────────────────────────── */}
      <section className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-semibold text-white">{t("myValues")}</h3>
          <span className="text-xs text-text-muted">
            {props.values.length}/{MAX_VALUES}
          </span>
        </div>
        <p className="mt-2 text-sm leading-7 text-text-muted">{t("myValuesHint")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {PERSONAL_VALUES.map((value) => {
            const active = props.values.includes(value.key);
            const disabled = !active && props.values.length >= MAX_VALUES;
            return (
              <button
                key={value.key}
                type="button"
                disabled={disabled}
                onClick={() => toggleValue(value.key)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-white hover:bg-card-hover"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                <span>{value.emoji}</span>
                <span>{t(value.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Lifestyle tags ─────────────────────────────────────────────── */}
      <section className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-semibold text-white">{t("lifestyle")}</h3>
          <span className="text-xs text-text-muted">
            {props.lifestyleTags.length}/{MAX_LIFESTYLE_TAGS}
          </span>
        </div>
        <p className="mt-2 text-sm leading-7 text-text-muted">{t("lifestyleHint")}</p>

        {LIFESTYLE_CATEGORIES.map((cat) => (
          <div key={cat.id} className="mt-4">
            <p className="mb-2 text-sm font-medium text-text-muted">
              {cat.emoji} {t(cat.labelKey)}
            </p>
            <div className="flex flex-wrap gap-2">
              {LIFESTYLE_TAGS.filter((tag) => tag.category === cat.id).map((tag) => {
                const active = props.lifestyleTags.includes(tag.key);
                const disabled =
                  !active && props.lifestyleTags.length >= MAX_LIFESTYLE_TAGS;
                return (
                  <button
                    key={tag.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleLifestyleTag(tag.key)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border text-white hover:bg-card-hover"
                    } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <span>{tag.emoji}</span>
                    <span>{t(tag.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* ── Prompts ────────────────────────────────────────────────────── */}
      <section className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <h3 className="text-xl font-semibold text-white">{t("myPrompts")}</h3>
        <p className="mt-2 text-sm leading-7 text-text-muted">{t("myPromptsHint")}</p>

        <div className="mt-4 space-y-3">
          {props.prompts.map((p, idx) => {
            const def: PromptDef | undefined = findPrompt(p.key);
            if (!def) return null;
            return (
              <div
                key={`${p.key}-${idx}`}
                className="rounded-[1.25rem] border border-border bg-bg p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {t(def.labelKey)}
                  </p>
                  <button
                    type="button"
                    onClick={() => removePrompt(idx)}
                    className="text-xs text-accent hover:underline"
                  >
                    {t("removePrompt")}
                  </button>
                </div>
                <textarea
                  value={p.response}
                  onChange={(event) => updatePromptResponse(idx, event.target.value)}
                  placeholder={t("promptResponsePlaceholder")}
                  maxLength={MAX_PROMPT_RESPONSE_LENGTH}
                  rows={2}
                  className="mt-3 w-full rounded-xl border border-border bg-bg/80 px-3 py-2 text-white outline-none transition-colors focus:border-accent"
                />
                <p className="mt-1 text-right text-xs text-text-muted">
                  {p.response.length}/{MAX_PROMPT_RESPONSE_LENGTH}
                </p>
              </div>
            );
          })}

          {props.prompts.length < MAX_PROMPTS && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-[1.25rem] border-2 border-dashed border-border py-3 text-sm font-semibold text-accent transition-colors hover:bg-card-hover"
            >
              + {t("addPrompt")}
            </button>
          )}
        </div>
      </section>

      {/* ── Icebreaker ─────────────────────────────────────────────────── */}
      <section className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xl font-semibold text-white">{t("icebreakerSection")}</h3>
          <span className="text-xs text-text-muted">
            {props.icebreaker.length}/{MAX_ICEBREAKER_LENGTH}
          </span>
        </div>
        <p className="mt-2 text-sm leading-7 text-text-muted">{t("icebreakerHint")}</p>
        <input
          type="text"
          value={props.icebreaker}
          onChange={(event) =>
            props.onIcebreakerChange(event.target.value.slice(0, MAX_ICEBREAKER_LENGTH))
          }
          placeholder={t("icebreakerPlaceholder")}
          maxLength={MAX_ICEBREAKER_LENGTH}
          className="mt-4 w-full rounded-[1.25rem] border border-border bg-bg px-4 py-3 text-white outline-none transition-colors focus:border-accent"
        />
      </section>

      {/* ── Prompt picker (modal-ish overlay) ──────────────────────────── */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-t-3xl bg-card p-6 sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-white">{t("choosePrompt")}</h4>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-text-muted hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 max-h-[70vh] space-y-5 overflow-y-auto pr-2">
              {availablePromptsByCategory.map((group) => (
                <div key={group.cat.id}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {t(group.cat.labelKey)}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => addPrompt(item.key)}
                        className="block w-full rounded-xl px-3 py-3 text-left text-sm text-white transition-colors hover:bg-card-hover"
                      >
                        {t(item.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
