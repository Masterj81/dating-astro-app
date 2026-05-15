"use client";

import type {
  AwarenessLevel,
  BusinessModel,
  CampaignType,
  OfferContext,
  ProductInput,
  SophisticationLevel,
} from "@/types/strategy";

interface Props {
  value: ProductInput;
  onChange: (next: ProductInput) => void;
  onLoadExample: () => void;
  onReset: () => void;
}

const AWARENESS_OPTIONS: { value: AwarenessLevel; label: string }[] = [
  { value: "unaware", label: "Unaware" },
  { value: "problem-aware", label: "Problem-aware" },
  { value: "solution-aware", label: "Solution-aware" },
  { value: "product-aware", label: "Product-aware" },
  { value: "most-aware", label: "Most-aware" },
];

const SOPHISTICATION_OPTIONS: { value: SophisticationLevel; label: string }[] = [
  { value: "fresh-market", label: "Fresh — first to make this promise" },
  { value: "simple-claims", label: "Simple claims still work" },
  { value: "amplified-claims", label: "Promises got loud — need a mechanism" },
  { value: "skeptical-market", label: "Market is skeptical — needs proof" },
  { value: "mature-market", label: "Mature — must niche or change identity" },
];

const BUSINESS_MODEL_OPTIONS: { value: BusinessModel; label: string }[] = [
  { value: "subscription", label: "Subscription" },
  { value: "one-time", label: "One-time purchase" },
  { value: "freemium", label: "Freemium" },
  { value: "marketplace", label: "Marketplace" },
  { value: "ads", label: "Ad-supported" },
  { value: "services", label: "Services" },
  { value: "other", label: "Other" },
];

const CAMPAIGN_TYPE_OPTIONS: { value: CampaignType; label: string }[] = [
  { value: "launch", label: "Launch" },
  { value: "seasonal", label: "Seasonal" },
  { value: "always-on", label: "Always-on" },
];

export function InputPanel({ value, onChange, onLoadExample, onReset }: Props) {
  function set<K extends keyof ProductInput>(key: K, v: ProductInput[K]) {
    onChange({ ...value, [key]: v });
  }

  function setOfferCtx<K extends keyof OfferContext>(
    key: K,
    v: OfferContext[K]
  ) {
    const next: OfferContext = { ...(value.offerContext ?? {}) };
    if (v === undefined || v === null || (typeof v === "number" && !Number.isFinite(v))) {
      delete next[key];
    } else {
      next[key] = v;
    }
    onChange({ ...value, offerContext: next });
  }

  function parseNumber(raw: string): number | undefined {
    if (raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  const ctx = value.offerContext ?? {};

  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto border-r border-ink-700 bg-ink-950 p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-ink-50">BigAd</h1>
          <p className="text-xxs text-ink-400">Marketing strategy workspace</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLoadExample}
            className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-100 transition hover:border-accent hover:text-white"
          >
            Load example
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-300 transition hover:border-ink-500 hover:text-white"
          >
            Reset
          </button>
        </div>
      </div>

      <Section title="Product">
        <Field label="Name">
          <input
            className={inputClass}
            value={value.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="What is it called?"
          />
        </Field>
        <Field label="Category">
          <input
            className={inputClass}
            value={value.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="dating app, writing tool, B2B CRM, …"
          />
        </Field>
        <Field label="Short description">
          <textarea
            className={textareaClass}
            value={value.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            placeholder="One paragraph. What it does, who it's for."
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price">
            <input
              className={inputClass}
              value={value.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="$12/mo, free, …"
            />
          </Field>
          <Field label="Business model">
            <select
              className={inputClass}
              value={value.businessModel}
              onChange={(e) =>
                set("businessModel", e.target.value as BusinessModel)
              }
            >
              {BUSINESS_MODEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Audience">
        <Field label="Who is it for?">
          <input
            className={inputClass}
            value={value.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="founders shipping their first product, …"
          />
        </Field>
        <Field label="What is their core frustration?">
          <textarea
            className={textareaClass}
            value={value.audiencePain}
            onChange={(e) => set("audiencePain", e.target.value)}
            rows={2}
            placeholder="The specific thing they hate right now."
          />
        </Field>
      </Section>

      <Section title="Market">
        <Field label="Awareness level">
          <select
            className={inputClass}
            value={value.awareness}
            onChange={(e) =>
              set("awareness", e.target.value as AwarenessLevel)
            }
          >
            {AWARENESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sophistication level">
          <select
            className={inputClass}
            value={value.sophistication}
            onChange={(e) =>
              set("sophistication", e.target.value as SophisticationLevel)
            }
          >
            {SOPHISTICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Competitors">
        <Field label="Who else is in the space?">
          <textarea
            className={textareaClass}
            value={value.competitors}
            onChange={(e) => set("competitors", e.target.value)}
            rows={2}
            placeholder="Comma-separated — Tinder, Hinge, Bumble"
          />
        </Field>
        <Field label="What makes you genuinely different?">
          <textarea
            className={textareaClass}
            value={value.differentiator}
            onChange={(e) => set("differentiator", e.target.value)}
            rows={2}
            placeholder="The unique mechanism — what only you do."
          />
        </Field>
      </Section>

      <Section title="Goal">
        <Field label="What outcome are you optimizing for?">
          <input
            className={inputClass}
            value={value.goal}
            onChange={(e) => set("goal", e.target.value)}
            placeholder="get 1,000 paying users, find a thesis, …"
          />
        </Field>
        <Field label="Campaign type">
          <select
            className={inputClass}
            value={value.campaignType ?? "always-on"}
            onChange={(e) => set("campaignType", e.target.value as CampaignType)}
          >
            {CAMPAIGN_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Commercial (optional)">
        <p className="-mt-1 text-xxs leading-relaxed text-ink-400">
          Fill in any of these to unlock breakeven ROAS on the Offers tab.
          All optional.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="COGS %">
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              value={ctx.cogsPercent ?? ""}
              onChange={(e) => setOfferCtx("cogsPercent", parseNumber(e.target.value))}
              placeholder="30"
            />
          </Field>
          <Field label="Target margin %">
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              value={ctx.targetMarginPercent ?? ""}
              onChange={(e) => setOfferCtx("targetMarginPercent", parseNumber(e.target.value))}
              placeholder="20"
            />
          </Field>
          <Field label="Current AOV">
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={ctx.currentAOV ?? ""}
              onChange={(e) => setOfferCtx("currentAOV", parseNumber(e.target.value))}
              placeholder="60"
            />
          </Field>
          <Field label="Target ROAS">
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={ctx.targetROAS ?? ""}
              onChange={(e) => setOfferCtx("targetROAS", parseNumber(e.target.value))}
              placeholder="2.5"
            />
          </Field>
        </div>
      </Section>

      <div className="mt-2 rounded-md border border-ink-700 bg-ink-900 p-3 text-xxs leading-relaxed text-ink-400">
        Strategy regenerates as you type. Everything stays local in your browser — no API calls in MVP.
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xxs font-medium uppercase tracking-wide text-ink-400">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-ink-200">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 focus:border-accent focus:outline-none";
const textareaClass =
  "w-full resize-y rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-500 focus:border-accent focus:outline-none";
