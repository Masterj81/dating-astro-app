"use client";

import { useState } from "react";
import type {
  Angle,
  AwarenessVariant,
  CampaignCalendar,
  CampaignWindow,
  GenericFlag,
  OfferKind,
  OfferDiagnosis,
  OfferRecommendation,
  ScoreDimension,
  Strategy,
  StrategyScore,
} from "@/types/strategy";
import { awarenessLabel } from "@/lib/engine/awareness";
import { sophisticationLabel } from "@/lib/engine/sophistication";
import { scoreLabel } from "@/lib/engine/score";
import { windowKindLabel } from "@/lib/engine/calendar";
import { CopyableCard } from "./CopyableCard";
import type { ProductInput } from "@/types/strategy";

type Tab =
  | "score"
  | "positioning"
  | "awareness"
  | "diagnosis"
  | "offer"
  | "ads"
  | "landing"
  | "store"
  | "experiments"
  | "offers"
  | "calendar"
  | "export";

const TABS: { id: Tab; label: string }[] = [
  { id: "score", label: "Score" },
  { id: "positioning", label: "Positioning" },
  { id: "awareness", label: "Awareness" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "offer", label: "Offer" },
  { id: "ads", label: "Ads" },
  { id: "landing", label: "Landing" },
  { id: "store", label: "App Store" },
  { id: "experiments", label: "Experiments" },
  { id: "offers", label: "Offers" },
  { id: "calendar", label: "Calendar" },
  { id: "export", label: "Export brief" },
];

interface Props {
  input: ProductInput;
  strategy: Strategy;
  hasMeaningfulInput: boolean;
}

export function StrategyView({ input, strategy, hasMeaningfulInput }: Props) {
  const [tab, setTab] = useState<Tab>("score");

  if (!hasMeaningfulInput) {
    return <EmptyState />;
  }

  return (
    <section className="flex h-full w-full flex-col bg-ink-950">
      <header className="flex flex-col gap-3 border-b border-ink-700 bg-ink-900/70 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-ink-50">
            {input.name || "Untitled product"}
          </h2>
          <Badge>{input.category || "category?"}</Badge>
          <Badge>{awarenessLabel(input.awareness)}</Badge>
          <Badge>{sophisticationLabel(input.sophistication)}</Badge>
          <ScorePill score={strategy.score.overall} />
          {strategy.genericFlags.length > 0 ? (
            <FlagPill count={strategy.genericFlags.length} />
          ) : null}
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

      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        {tab === "score" && <ScoreTab score={strategy.score} flags={strategy.genericFlags} />}
        {tab === "positioning" && <PositioningTab strategy={strategy} />}
        {tab === "awareness" && (
          <AwarenessTab strategy={strategy} input={input} />
        )}
        {tab === "diagnosis" && <DiagnosisTab diagnosis={strategy.diagnosis} />}
        {tab === "offer" && <OfferTab strategy={strategy} />}
        {tab === "ads" && <AdsTab strategy={strategy} />}
        {tab === "landing" && <LandingTab strategy={strategy} />}
        {tab === "store" && <StoreTab strategy={strategy} />}
        {tab === "experiments" && <ExperimentsTab strategy={strategy} />}
        {tab === "offers" && <OffersTab strategy={strategy} />}
        {tab === "calendar" && <CalendarTab calendar={strategy.campaignCalendar} />}
        {tab === "export" && <ExportTab brief={strategy.exportBrief} />}
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
        <ul className="mx-auto mt-6 max-w-sm space-y-1.5 text-left text-xxs text-ink-400">
          <li>— Quality score across clarity, differentiation, specificity, proof, channel</li>
          <li>— Ranked ad angles with best-fit channel and the objection each addresses</li>
          <li>— Awareness-stage copy variants you can plug into a funnel</li>
          <li>— Generic-copy guard that flags hollow phrases and proposes specific rewrites</li>
          <li>— Single-screen export brief, ready to paste</li>
        </ul>
        <p className="mt-6 text-xxs text-ink-500">
          BigAd uses general direct-response principles (awareness,
          sophistication, central promise, unique mechanism). No API call,
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

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "border-emerald-500/40 text-emerald-300"
      : score >= 55
      ? "border-amber-500/40 text-amber-300"
      : "border-rose-500/40 text-rose-300";
  return (
    <span
      className={`rounded-sm border bg-ink-900 px-2 py-0.5 text-xxs ${tone}`}
      title="Overall strategy quality score"
    >
      {score}/100 · {scoreLabel(score)}
    </span>
  );
}

function FlagPill({ count }: { count: number }) {
  return (
    <span
      className="rounded-sm border border-rose-500/40 bg-rose-950/30 px-2 py-0.5 text-xxs text-rose-300"
      title="Generic phrases detected"
    >
      {count} generic flag{count === 1 ? "" : "s"}
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

// ---------------- Score tab ----------------

function ScoreTab({ score, flags }: { score: StrategyScore; flags: GenericFlag[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="hairline rounded-lg bg-ink-900 p-5">
        <p className="text-xxs uppercase tracking-wide text-ink-400">Overall</p>
        <p className="mt-1 text-3xl font-semibold text-ink-50">
          {score.overall}
          <span className="ml-1 text-base text-ink-400">/ 100</span>
        </p>
        <p className="mt-1 text-sm text-ink-300">{scoreLabel(score.overall)}</p>
        <p className="mt-3 text-xs text-ink-400">
          Computed from your inputs — not from the generated copy. Tighten the
          inputs and the score moves immediately.
        </p>
      </div>

      <SectionTitle>Dimensions</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {score.dimensions.map((d) => (
          <DimensionCard key={d.key} dim={d} />
        ))}
      </div>

      {flags.length > 0 ? (
        <>
          <SectionTitle>Generic-copy flags</SectionTitle>
          <p className="text-xs text-ink-400">
            These phrases were detected in the generated strategy and tend to
            blur a brand's voice. Use the suggested rewrite or your own.
          </p>
          <div className="flex flex-col gap-3">
            {flags.map((f, i) => (
              <FlagCard key={`gf-${i}`} flag={f} />
            ))}
          </div>
        </>
      ) : (
        <div className="hairline rounded-lg bg-ink-900 p-4 text-xs text-emerald-300">
          No generic phrases detected in the generated strategy. The guard
          checks for boost / next-level / revolutionary / game-changing /
          unlock your potential / seamless / world-class / synergy /
          best-in-class / cutting-edge / leverage / next-generation /
          one-stop shop.
        </div>
      )}
    </div>
  );
}

function DimensionCard({ dim }: { dim: ScoreDimension }) {
  const tone =
    dim.score >= 75
      ? "bg-emerald-500"
      : dim.score >= 55
      ? "bg-amber-500"
      : "bg-rose-500";
  return (
    <div className="hairline rounded-lg bg-ink-900 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink-50">{dim.label}</p>
        <p className="text-xs text-ink-300">{dim.score}/100</p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-ink-800">
        <div
          className={`h-full ${tone}`}
          style={{ width: `${Math.max(0, Math.min(100, dim.score))}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-ink-200">{dim.explanation}</p>
      <p className="mt-2 text-xs text-ink-400">
        <span className="text-ink-300">Suggestion: </span>
        {dim.suggestion}
      </p>
    </div>
  );
}

function FlagCard({ flag }: { flag: GenericFlag }) {
  return (
    <div className="hairline rounded-lg border border-rose-500/20 bg-ink-900 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-xs font-medium text-rose-300">{flag.field}</p>
        <p className="text-xxs text-ink-400">flagged: "{flag.phrase}"</p>
      </div>
      <p className="mt-2 text-sm text-ink-100">{flag.text}</p>
      <p className="mt-2 text-xs text-ink-300">
        <span className="text-ink-400">Suggestion: </span>
        {flag.suggestion}
      </p>
    </div>
  );
}

// ---------------- Positioning tab ----------------

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

// ---------------- Awareness tab ----------------

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

      <SectionTitle>Copy variants by awareness stage</SectionTitle>
      <p className="text-xs text-ink-400">
        One headline, one short ad hook, and one landing-section angle per
        stage — for funnel planning across cold, warm, and hot traffic.
      </p>
      <div className="flex flex-col gap-3">
        {strategy.awarenessVariants.map((v) => (
          <AwarenessVariantCard key={v.stage} v={v} active={v.stage === input.awareness} />
        ))}
      </div>
    </div>
  );
}

function AwarenessVariantCard({
  v,
  active,
}: {
  v: AwarenessVariant;
  active: boolean;
}) {
  const exportText = `Stage: ${v.stage}\nHeadline: ${v.headline}\nAd hook: ${v.adHook}\nLanding angle: ${v.landingAngle}`;
  return (
    <div
      className={`hairline rounded-lg bg-ink-900 p-4 ${
        active ? "ring-1 ring-accent" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          {labelFor(v.stage)} {active ? "· current" : ""}
        </p>
        <CopyMini text={exportText} />
      </div>
      <p className="text-sm text-ink-50">{v.headline}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
        <div>
          <p className="text-ink-400">Ad hook</p>
          <p className="mt-1 text-ink-100">{v.adHook}</p>
        </div>
        <div>
          <p className="text-ink-400">Landing section angle</p>
          <p className="mt-1 text-ink-100">{v.landingAngle}</p>
        </div>
      </div>
    </div>
  );
}

function labelFor(stage: string) {
  return {
    "unaware": "Unaware",
    "problem-aware": "Problem-aware",
    "solution-aware": "Solution-aware",
    "product-aware": "Product-aware",
    "most-aware": "Most-aware",
  }[stage] ?? stage;
}

// ---------------- Diagnosis tab ----------------

function DiagnosisTab({ diagnosis }: { diagnosis: OfferDiagnosis }) {
  return (
    <div className="flex flex-col gap-5">
      <CopyableCard
        label="Strongest promise"
        text={diagnosis.strongestPromise}
      >
        <p className="text-ink-50">{diagnosis.strongestPromise}</p>
      </CopyableCard>
      <CopyableCard label="Weakest claim" text={diagnosis.weakestClaim}>
        <p>{diagnosis.weakestClaim}</p>
      </CopyableCard>
      <CopyableCard label="Missing proof" text={diagnosis.missingProof}>
        <p>{diagnosis.missingProof}</p>
      </CopyableCard>
      <CopyableCard
        label="Biggest objection"
        text={diagnosis.biggestObjection}
      >
        <p>{diagnosis.biggestObjection}</p>
      </CopyableCard>
      <div className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Recommended proof asset
        </p>
        <p className="mt-1 text-base font-medium text-ink-50">
          {diagnosis.recommendedAsset}
        </p>
        <p className="mt-2 text-sm text-ink-200">
          {diagnosis.recommendedAssetReason}
        </p>
      </div>
    </div>
  );
}

// ---------------- Offer tab ----------------

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

      <SectionTitle>Angles (ranked)</SectionTitle>
      <p className="text-xs text-ink-400">
        Each angle is scored against your awareness + sophistication, then
        sorted. The first one is the safest bet to test first.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {strategy.rankedAngles.map((a, i) => (
          <AngleCard key={`g-${i}`} angle={a} rank={i + 1} />
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

function AngleCard({ angle, rank }: { angle: Angle; rank: number }) {
  const exportText =
    `Angle ${rank}: ${angle.name} (score ${angle.score ?? 0}/100, ${angle.channelFit ?? "—"}, ${angle.awarenessStage ?? "—"})\n` +
    `Hook: ${angle.hook}\n` +
    `Objection addressed: ${angle.objectionAddressed ?? "—"}\n` +
    `Why it could work: ${angle.whyItCouldWork ?? "—"}\n` +
    `When to use: ${angle.rationale}`;
  return (
    <div className="hairline relative rounded-lg bg-ink-900 p-4">
      <div className="absolute right-3 top-3">
        <CopyMini text={exportText} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-16">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          #{rank}
        </span>
        <p className="text-sm font-medium text-ink-50">{angle.name}</p>
        <span className="rounded-sm border border-emerald-500/30 bg-emerald-950/30 px-1.5 py-0.5 text-xxs text-emerald-300">
          {angle.score ?? 0}/100
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Tag>Channel: {angle.channelFit ?? "—"}</Tag>
        <Tag>Stage: {labelFor(angle.awarenessStage ?? "")}</Tag>
      </div>
      <p className="mt-3 text-sm text-ink-50">{angle.hook}</p>
      <div className="mt-3 space-y-1 text-xs text-ink-300">
        {angle.objectionAddressed ? (
          <p>
            <span className="text-ink-400">Objection addressed: </span>
            {angle.objectionAddressed}
          </p>
        ) : null}
        {angle.whyItCouldWork ? (
          <p>
            <span className="text-ink-400">Why it could work: </span>
            {angle.whyItCouldWork}
          </p>
        ) : null}
        <p>
          <span className="text-ink-400">When to use: </span>
          {angle.rationale}
        </p>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
      {children}
    </span>
  );
}

// ---------------- Ads tab ----------------

function AdsTab({ strategy }: { strategy: Strategy }) {
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle>Top angle to test first</SectionTitle>
      {strategy.rankedAngles[0] ? (
        <AngleCard angle={strategy.rankedAngles[0]} rank={1} />
      ) : null}

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

// ---------------- Landing / Store / Experiments tabs ----------------

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

// ---------------- Offers tab ----------------

function OffersTab({ strategy }: { strategy: Strategy }) {
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle>Offer Architecture</SectionTitle>
      <p className="text-xs text-ink-400">
        Ranked offer recommendations drawn from seven canonical levers.
        Ordering is deterministic and reflects your business model, price
        tier, and awareness. Fill in COGS % and target margin % under
        Commercial on the left to see the breakeven ROAS each offer
        implies.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {strategy.offers.map((o, i) => (
          <OfferCard key={`offer-${i}`} offer={o} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function OfferCard({ offer, rank }: { offer: OfferRecommendation; rank: number }) {
  const riskTone =
    offer.stickinessRisk === "low"
      ? "border-emerald-500/40 text-emerald-300"
      : offer.stickinessRisk === "medium"
      ? "border-amber-500/40 text-amber-300"
      : "border-rose-500/40 text-rose-300";
  const exportText =
    `Offer ${rank}: ${offerKindLabel(offer.kind)} — ${offer.label}\n` +
    `Breakeven ROAS: ${offer.breakevenROAS === null ? "—" : offer.breakevenROAS.toFixed(2) + "x"}\n` +
    `Stickiness risk: ${offer.stickinessRisk}\n` +
    `Awareness fit: ${offer.awarenessFit.join(", ") || "—"}\n` +
    `Why: ${offer.rationale}` +
    (offer.notes ? `\nNote: ${offer.notes}` : "");
  return (
    <div className="hairline relative rounded-lg bg-ink-900 p-4">
      <div className="absolute right-3 top-3">
        <CopyMini text={exportText} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-16">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          #{rank}
        </span>
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-100">
          {offerKindLabel(offer.kind)}
        </span>
        <p className="text-sm font-medium text-ink-50">{offer.label}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span
          className="rounded-sm border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-xxs text-ink-200"
          title="Required ROAS to break even at this offer's give-away"
        >
          Breakeven ROAS:{" "}
          {offer.breakevenROAS === null ? "—" : `${offer.breakevenROAS.toFixed(2)}x`}
        </span>
        <span className={`rounded-sm border bg-ink-900 px-1.5 py-0.5 text-xxs ${riskTone}`}>
          Stickiness risk: {offer.stickinessRisk}
        </span>
        {typeof offer.discountPercent === "number" ? (
          <span className="rounded-sm border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-xxs text-ink-200">
            Assumed: {offer.discountPercent}% off
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {offer.awarenessFit.map((a) => (
          <span
            key={a}
            className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200"
          >
            {labelFor(a)}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-100">{offer.rationale}</p>
      {offer.notes ? (
        <p className="mt-2 text-xs text-ink-400">{offer.notes}</p>
      ) : null}
    </div>
  );
}

function offerKindLabel(kind: OfferKind): string {
  return (
    {
      discount: "Discount",
      bundle: "Bundle",
      guarantee: "Guarantee",
      "free-shipping": "Free shipping",
      "free-gift": "Free gift",
      "payment-plan": "Payment plan",
      "free-trial": "Free trial",
    }[kind] ?? kind
  );
}

// ---------------- Calendar tab ----------------

function CalendarTab({ calendar }: { calendar: CampaignCalendar }) {
  const typeLabel =
    {
      launch: "Launch",
      seasonal: "Seasonal",
      "always-on": "Always-on",
    }[calendar.campaignType] ?? calendar.campaignType;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle>Campaign Calendar</SectionTitle>
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-100">
          {typeLabel}
        </span>
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-200">
          Anchor: {calendar.anchorLabel}
        </span>
      </div>
      <p className="text-xs text-ink-400">
        Each window names the KPI to watch, the readiness gate that must
        pass before it opens, and the offer kind that fits. Windows with
        a forecast soft window are marked.
      </p>
      <ol className="flex flex-col gap-3">
        {calendar.windows.map((w, i) => (
          <li key={`win-${i}`}>
            <CalendarWindowCard window={w} index={i + 1} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function CalendarWindowCard({ window: w, index }: { window: CampaignWindow; index: number }) {
  const startLabel =
    w.startOffsetDays === 0
      ? "Day 0"
      : w.startOffsetDays > 0
      ? `Day +${w.startOffsetDays}`
      : `Day ${w.startOffsetDays}`;
  const dipBorder = w.expectedDip
    ? "border-amber-500/40"
    : "border-transparent";
  const exportText =
    `Window ${index}: ${windowKindLabel(w.kind)} — ${w.label}\n` +
    `When: ${startLabel} for ${w.durationDays} ${w.durationDays === 1 ? "day" : "days"}\n` +
    `KPI: ${w.primaryKPI}\n` +
    `Readiness gate: ${w.readinessGate}\n` +
    `Recommended offer: ${w.recommendedOfferKind ? offerKindLabel(w.recommendedOfferKind) : "—"}\n` +
    `Forecast dip: ${w.expectedDip ? "yes" : "no"}\n` +
    `Notes: ${w.notes}`;
  return (
    <div className={`hairline relative rounded-lg border bg-ink-900 p-4 ${dipBorder}`}>
      <div className="absolute right-3 top-3">
        <CopyMini text={exportText} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-16">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          #{index}
        </span>
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-100">
          {windowKindLabel(w.kind)}
        </span>
        <p className="text-sm font-medium text-ink-50">{w.label}</p>
        {w.expectedDip ? (
          <span className="rounded-sm border border-amber-500/40 bg-amber-950/30 px-1.5 py-0.5 text-xxs text-amber-300">
            Forecast dip
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Tag>
          {startLabel} · {w.durationDays} {w.durationDays === 1 ? "day" : "days"}
        </Tag>
        <Tag>KPI: {w.primaryKPI}</Tag>
        {w.recommendedOfferKind ? (
          <Tag>Offer: {offerKindLabel(w.recommendedOfferKind)}</Tag>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-ink-300">
        <span className="text-ink-400">Readiness gate: </span>
        {w.readinessGate}
      </p>
      <p className="mt-2 text-sm text-ink-100">{w.notes}</p>
    </div>
  );
}

// ---------------- Export brief tab ----------------

function ExportTab({ brief }: { brief: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-ink-100">Strategy brief — markdown</p>
          <p className="text-xxs text-ink-400">
            Paste into Notion, Linear, or a doc. No formatting is lost.
          </p>
        </div>
        <CopyBig text={brief} />
      </div>
      <textarea
        readOnly
        value={brief}
        className="hairline h-[min(70vh,720px)] w-full resize-y rounded-md border border-ink-700 bg-ink-900 px-4 py-3 font-mono text-xs leading-relaxed text-ink-100"
        spellCheck={false}
      />
    </div>
  );
}

// ---------------- shared mini copy buttons ----------------

function CopyMini({ text }: { text: string }) {
  return <CopyButton text={text} small />;
}

function CopyBig({ text }: { text: string }) {
  return <CopyButton text={text} />;
}

function CopyButton({ text, small }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            await navigator.clipboard.writeText(text);
          }
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          setCopied(false);
        }
      }}
      className={`rounded-sm border border-ink-700 bg-ink-800 text-ink-200 transition hover:border-accent hover:text-white ${
        small ? "px-2 py-0.5 text-xxs" : "px-3 py-1.5 text-xs"
      }`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
