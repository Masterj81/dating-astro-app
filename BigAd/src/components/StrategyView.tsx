"use client";

import { useState } from "react";
import type { Strategy } from "@/types/strategy";
import { awarenessLabel } from "@/lib/engine/awareness";
import { sophisticationLabel } from "@/lib/engine/sophistication";
import { CopyableCard } from "./CopyableCard";
import type { ProductInput } from "@/types/strategy";

type Tab =
  | "positioning"
  | "awareness"
  | "offer"
  | "ads"
  | "landing"
  | "store"
  | "experiments";

const TABS: { id: Tab; label: string }[] = [
  { id: "positioning", label: "Positioning" },
  { id: "awareness", label: "Awareness" },
  { id: "offer", label: "Offer" },
  { id: "ads", label: "Ads" },
  { id: "landing", label: "Landing" },
  { id: "store", label: "App Store" },
  { id: "experiments", label: "Experiments" },
];

interface Props {
  input: ProductInput;
  strategy: Strategy;
  hasMeaningfulInput: boolean;
}

export function StrategyView({ input, strategy, hasMeaningfulInput }: Props) {
  const [tab, setTab] = useState<Tab>("positioning");

  if (!hasMeaningfulInput) {
    return <EmptyState />;
  }

  return (
    <section className="flex h-full w-full flex-col bg-ink-950">
      <header className="flex flex-col gap-3 border-b border-ink-700 bg-ink-900/70 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-ink-50">
            {input.name || "Untitled product"}
          </h2>
          <Badge>{input.category || "category?"}</Badge>
          <Badge>{awarenessLabel(input.awareness)}</Badge>
          <Badge>{sophisticationLabel(input.sophistication)}</Badge>
        </div>
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-sm px-3 py-1.5 text-xs transition ${
                tab === t.id
                  ? "bg-ink-800 text-ink-50 ring-1 ring-accent"
                  : "text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {tab === "positioning" && <PositioningTab strategy={strategy} />}
        {tab === "awareness" && (
          <AwarenessTab strategy={strategy} input={input} />
        )}
        {tab === "offer" && <OfferTab strategy={strategy} />}
        {tab === "ads" && <AdsTab strategy={strategy} />}
        {tab === "landing" && <LandingTab strategy={strategy} />}
        {tab === "store" && <StoreTab strategy={strategy} />}
        {tab === "experiments" && <ExperimentsTab strategy={strategy} />}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="flex h-full w-full items-center justify-center bg-ink-950 px-6 py-12">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-semibold text-ink-50">
          Describe your product to start.
        </h2>
        <p className="mt-2 text-sm text-ink-300">
          Fill in at least a name and an audience on the left, or click
          <span className="mx-1 rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-100">
            Load example
          </span>
          to see what a full strategy looks like.
        </p>
        <p className="mt-6 text-xxs text-ink-400">
          BigAd uses general direct-response principles (awareness,
          sophistication, central promise, unique mechanism) — no API call,
          no data leaves your browser.
        </p>
      </div>
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-200">
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-300">
      {children}
    </h3>
  );
}

function PositioningTab({ strategy }: { strategy: Strategy }) {
  const { positioning, centralPromise, uniqueMechanism } = strategy;
  return (
    <div className="flex flex-col gap-5">
      <CopyableCard label="Positioning statement" text={positioning.statement}>
        <p>{positioning.statement}</p>
      </CopyableCard>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CopyableCard label="For whom" text={positioning.forWhom} />
        <CopyableCard label="Category" text={positioning.category} />
        <CopyableCard label="Unlike" text={positioning.unlike} />
        <CopyableCard label="Unique mechanism (short)" text={positioning.unique} />
      </div>

      <SectionTitle>Central promise</SectionTitle>
      <CopyableCard label="Central promise" text={centralPromise}>
        <p>{centralPromise}</p>
      </CopyableCard>

      <SectionTitle>Unique mechanism</SectionTitle>
      <CopyableCard label="Mechanism explanation" text={uniqueMechanism}>
        <p>{uniqueMechanism}</p>
      </CopyableCard>
    </div>
  );
}

function AwarenessTab({
  strategy,
  input,
}: {
  strategy: Strategy;
  input: ProductInput;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SectionTitle>Awareness — {awarenessLabel(input.awareness)}</SectionTitle>
        <div className="flex flex-col gap-3">
          {strategy.awarenessNotes.map((n, i) => (
            <CopyableCard key={`a-${i}`} text={n} dense>
              <p>{n}</p>
            </CopyableCard>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <SectionTitle>
          Sophistication — {sophisticationLabel(input.sophistication)}
        </SectionTitle>
        <div className="flex flex-col gap-3">
          {strategy.sophisticationNotes.map((n, i) => (
            <CopyableCard key={`s-${i}`} text={n} dense>
              <p>{n}</p>
            </CopyableCard>
          ))}
        </div>
      </div>
    </div>
  );
}

function OfferTab({ strategy }: { strategy: Strategy }) {
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle>Headlines</SectionTitle>
      <div className="flex flex-col gap-2">
        {strategy.headlines.map((h, i) => (
          <CopyableCard key={`h-${i}`} text={h} dense>
            <p>{h}</p>
          </CopyableCard>
        ))}
      </div>

      <SectionTitle>Angles</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {strategy.angles.map((a, i) => (
          <CopyableCard
            key={`g-${i}`}
            label={a.name}
            text={`${a.hook}\n\nWhen to use: ${a.rationale}`}
          >
            <p className="text-ink-50">{a.hook}</p>
            <p className="mt-2 text-xs text-ink-300">
              <span className="text-ink-400">When to use: </span>
              {a.rationale}
            </p>
          </CopyableCard>
        ))}
      </div>

      <SectionTitle>Objections</SectionTitle>
      <div className="flex flex-col gap-3">
        {strategy.objections.map((o, i) => (
          <CopyableCard
            key={`o-${i}`}
            text={`${o.objection}\n${o.reply}`}
            label="Objection / reply"
          >
            <p className="text-ink-200">{o.objection}</p>
            <p className="mt-1 text-ink-50">{o.reply}</p>
          </CopyableCard>
        ))}
      </div>
    </div>
  );
}

function AdsTab({ strategy }: { strategy: Strategy }) {
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle>TikTok / Reels scripts</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {strategy.tiktokScripts.map((s, i) => (
          <CopyableCard
            key={`ts-${i}`}
            label={`Script ${i + 1}`}
            text={`HOOK: ${s.hook}\n\n${s.beats.join("\n")}\n\nCTA: ${s.cta}`}
          >
            <p className="text-xs text-ink-400">Hook</p>
            <p className="mt-1 text-ink-50">{s.hook}</p>
            <p className="mt-3 text-xs text-ink-400">Beats</p>
            <ul className="mt-1 list-inside list-disc text-ink-100">
              {s.beats.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-400">CTA</p>
            <p className="mt-1 text-ink-50">{s.cta}</p>
          </CopyableCard>
        ))}
      </div>

      <SectionTitle>Facebook / Meta ad concepts</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {strategy.facebookAds.map((a, i) => (
          <CopyableCard
            key={`fb-${i}`}
            label={a.angle}
            text={`${a.primaryText}\n\nHeadline: ${a.headline}\nDescription: ${a.description}\nCTA: ${a.cta}`}
          >
            <p className="text-xs text-ink-400">Primary text</p>
            <p className="mt-1 text-ink-50">{a.primaryText}</p>
            <p className="mt-3 text-xs text-ink-400">Headline</p>
            <p className="mt-1 text-ink-50">{a.headline}</p>
            <p className="mt-3 text-xs text-ink-400">Description</p>
            <p className="mt-1 text-ink-100">{a.description}</p>
            <p className="mt-3 text-xs text-ink-400">CTA</p>
            <p className="mt-1 text-ink-100">{a.cta}</p>
          </CopyableCard>
        ))}
      </div>
    </div>
  );
}

function LandingTab({ strategy }: { strategy: Strategy }) {
  const l = strategy.landing;
  return (
    <div className="flex flex-col gap-5">
      <CopyableCard label="Hero" text={l.hero}>
        <p className="text-lg text-ink-50">{l.hero}</p>
      </CopyableCard>
      <CopyableCard label="Sub-hero" text={l.subhead}>
        <p>{l.subhead}</p>
      </CopyableCard>
      <CopyableCard
        label="Value bullets"
        text={l.bullets.map((b) => `• ${b}`).join("\n")}
      >
        <ul className="list-inside list-disc">
          {l.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </CopyableCard>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CopyableCard label="CTA" text={l.cta} />
        <CopyableCard label="Social proof line" text={l.socialProofLine} />
      </div>
      <SectionTitle>Objection handlers (on-page)</SectionTitle>
      {l.objectionsHandled.map((o, i) => (
        <CopyableCard
          key={i}
          label="Objection / reply"
          text={`${o.objection}\n${o.reply}`}
        >
          <p className="text-ink-200">{o.objection}</p>
          <p className="mt-1 text-ink-50">{o.reply}</p>
        </CopyableCard>
      ))}
    </div>
  );
}

function StoreTab({ strategy }: { strategy: Strategy }) {
  const s = strategy.store;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CopyableCard label="App name" text={s.appName} />
        <CopyableCard label="Subtitle" text={s.subtitle} />
      </div>
      <CopyableCard label="Promotional text" text={s.promoText}>
        <p>{s.promoText}</p>
      </CopyableCard>
      <CopyableCard label="Long description" text={s.description}>
        <p className="whitespace-pre-wrap">{s.description}</p>
      </CopyableCard>
      <CopyableCard label="Keywords" text={s.keywords.join(", ")}>
        <div className="flex flex-wrap gap-1.5">
          {s.keywords.map((k, i) => (
            <span
              key={i}
              className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-100"
            >
              {k}
            </span>
          ))}
        </div>
      </CopyableCard>
    </div>
  );
}

function ExperimentsTab({ strategy }: { strategy: Strategy }) {
  return (
    <div className="flex flex-col gap-3">
      {strategy.experiments.map((e, i) => (
        <CopyableCard
          key={i}
          label={`Experiment ${i + 1}`}
          text={`Hypothesis: ${e.hypothesis}\nA: ${e.variantA}\nB: ${e.variantB}\nMetric: ${e.metric}`}
        >
          <p className="text-xs text-ink-400">Hypothesis</p>
          <p className="mt-1 text-ink-50">{e.hypothesis}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-ink-400">Variant A</p>
              <p className="mt-1 text-ink-100">{e.variantA}</p>
            </div>
            <div>
              <p className="text-xs text-ink-400">Variant B</p>
              <p className="mt-1 text-ink-100">{e.variantB}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-400">Metric</p>
          <p className="mt-1 text-ink-100">{e.metric}</p>
        </CopyableCard>
      ))}
    </div>
  );
}

