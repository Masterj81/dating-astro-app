"use client";

import { useMemo, useState } from "react";
import type {
  AdConceptCard,
  AdReviewChecklist,
  AdVariant,
  Angle,
  AudienceAvatar,
  AvatarObjection,
  AwarenessVariant,
  CampaignArchitecture,
  CampaignCalendar,
  CampaignWindow,
  CreativeQA,
  CreatorBrief,
  CreatorBriefSection,
  CtaBank,
  DipForecast,
  RetrospectiveGate,
  CtaStyle,
  CtaSurface,
  CtaVariant,
  EditorHandoff,
  GenericFlag,
  HookCritique,
  HookFlag,
  HookLibrary,
  HookLibraryItem,
  HookPattern,
  JourneyStage,
  JourneyStatus,
  KpiDiagnosis,
  KpiName,
  KpiSnapshot,
  KpiTarget,
  KpiTargetLadder,
  LadderTier,
  OfferKind,
  OfferDiagnosis,
  OfferRecommendation,
  QaFinding,
  QaSeverity,
  StaticAdBrief,
  StaticAdSize,
  TrackingReadinessCheck,
  AppliedAdReview,
  AdReviewFinding,
  ScoreDimension,
  ScriptLine,
  ShotList,
  ShotListItem,
  Strategy,
  StrategyScore,
  TrackingReadinessScore,
  VariantSet,
  VideoScript,
} from "@/types/strategy";
import { awarenessLabel } from "@/lib/engine/awareness";
import { sophisticationLabel } from "@/lib/engine/sophistication";
import { scoreLabel } from "@/lib/engine/score";
import { windowKindLabel } from "@/lib/engine/calendar";
import { critiqueHook } from "@/lib/engine/hook-critic";
import { diagnoseKpi } from "@/lib/engine/kpi-diagnosis";
import { CopyableCard } from "./CopyableCard";
import type { ProductInput } from "@/types/strategy";

type Tab =
  | "score"
  | "positioning"
  | "awareness"
  | "audience"
  | "diagnosis"
  | "offers"
  | "calendar"
  | "angles"
  | "concepts"
  | "briefs"
  | "shots"
  | "launch"
  | "landing"
  | "store"
  | "experiments"
  | "export";

// Tab order follows the stakeholder reading flow:
// Score → Positioning → Awareness → Audience → Diagnosis → Offer
// architecture → Calendar → Angles → Concepts → Briefs → Shots →
// Launch readiness → Landing → App store → Experiments → Export.
const TABS: { id: Tab; label: string }[] = [
  { id: "score", label: "Score" },
  { id: "positioning", label: "Positioning" },
  { id: "awareness", label: "Awareness" },
  { id: "audience", label: "Audience avatars" },
  { id: "diagnosis", label: "Diagnosis" },
  { id: "offers", label: "Offer architecture" },
  { id: "calendar", label: "Calendar" },
  { id: "angles", label: "Angles" },
  { id: "concepts", label: "Concepts" },
  { id: "briefs", label: "Briefs" },
  { id: "shots", label: "Shots" },
  { id: "launch", label: "Launch readiness" },
  { id: "landing", label: "Landing" },
  { id: "store", label: "App store" },
  { id: "experiments", label: "Experiments" },
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
        <JourneyStatusBlock status={strategy.journeyStatus} />
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
        {tab === "audience" && <AudienceTab avatars={strategy.audienceAvatars} />}
        {tab === "diagnosis" && <DiagnosisTab diagnosis={strategy.diagnosis} />}
        {tab === "offers" && <OffersTab strategy={strategy} />}
        {tab === "calendar" && <CalendarTab calendar={strategy.campaignCalendar} />}
        {tab === "angles" && <AnglesTab strategy={strategy} />}
        {tab === "concepts" && <ConceptsTab strategy={strategy} input={input} />}
        {tab === "briefs" && <BriefsTab strategy={strategy} />}
        {tab === "shots" && <ShotsTab strategy={strategy} />}
        {tab === "launch" && <LaunchTab strategy={strategy} input={input} />}
        {tab === "landing" && <LandingTab strategy={strategy} />}
        {tab === "store" && <StoreTab strategy={strategy} />}
        {tab === "experiments" && <ExperimentsTab strategy={strategy} />}
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

// ---------------- Audience tab ----------------

function AudienceTab({ avatars }: { avatars: AudienceAvatar[] }) {
  if (avatars.length === 0) {
    return (
      <div className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        No avatars generated for this input. Add an audience and a core
        pain to materialise concrete personas.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle>Audience avatars</SectionTitle>
      <p className="text-xs text-ink-400">
        Two or three concrete personas, parameterised on the inputs. Read
        these before the offer — every downstream concept and hook ties
        back to one of them.
      </p>
      <div className="flex flex-col gap-4">
        {avatars.map((av) => (
          <AvatarCard key={av.id} avatar={av} />
        ))}
      </div>
    </div>
  );
}

function AvatarCard({ avatar }: { avatar: AudienceAvatar }) {
  const exportText = avatarToText(avatar);
  return (
    <div className="hairline relative rounded-lg bg-ink-900 p-4">
      <div className="absolute right-3 top-3">
        <CopyMini text={exportText} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-16">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          {avatar.id}
        </span>
        <p className="text-sm font-medium text-ink-50">{avatar.label}</p>
      </div>
      <div className="mt-3 rounded-md border border-ink-800 bg-ink-950/40 p-3">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Buying trigger
        </p>
        <p className="mt-1 text-sm text-ink-50">{avatar.buyingTrigger}</p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-ink-800 bg-ink-950/40 p-3">
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Core pain
          </p>
          <p className="mt-1 text-xs text-ink-100">{avatar.corePain}</p>
        </div>
        <div className="rounded-md border border-ink-800 bg-ink-950/40 p-3">
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Desired outcome
          </p>
          <p className="mt-1 text-xs text-ink-100">{avatar.desiredOutcome}</p>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Objections
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {avatar.objections.map((o, i) => (
            <ObjectionChip key={i} obj={o} />
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Failed alternatives
          </p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-100">
            {avatar.failedAlternatives.map((fa, i) => (
              <li key={i}>{fa}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Proof needed
          </p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-100">
            {avatar.proofNeeded.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Emotional language
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {avatar.emotionalLanguage.map((phrase, i) => (
            <span
              key={i}
              className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200"
            >
              "{phrase}"
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 text-xxs text-ink-300">
        <span className="text-ink-400">Best channel angle: </span>
        {avatar.bestChannelAngle}
      </p>
    </div>
  );
}

function ObjectionChip({ obj }: { obj: AvatarObjection }) {
  return (
    <div className="rounded-md border border-ink-800 bg-ink-950/40 p-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded-sm border border-amber-500/30 bg-amber-950/30 px-1.5 py-0.5 text-xxs text-amber-200">
          {obj.kind}
        </span>
        <p className="text-xs text-ink-100">{obj.statement}</p>
      </div>
      <p className="mt-1 text-xxs text-ink-300">
        <span className="text-ink-400">Reframe: </span>
        {obj.reframe}
      </p>
    </div>
  );
}

function avatarToText(av: AudienceAvatar): string {
  const lines: string[] = [];
  lines.push(`${av.label} (${av.id})`);
  lines.push(`Trigger: ${av.buyingTrigger}`);
  lines.push(`Core pain: ${av.corePain}`);
  lines.push(`Desired outcome: ${av.desiredOutcome}`);
  lines.push("");
  lines.push(`Objections:`);
  for (const o of av.objections) {
    lines.push(`  [${o.kind}] ${o.statement}`);
    lines.push(`    Reframe: ${o.reframe}`);
  }
  lines.push("");
  lines.push(`Failed alternatives:`);
  for (const fa of av.failedAlternatives) lines.push(`  - ${fa}`);
  lines.push("");
  lines.push(`Emotional language: ${av.emotionalLanguage.map((p) => `"${p}"`).join(" · ")}`);
  lines.push("");
  lines.push(`Proof needed: ${av.proofNeeded.join(", ")}`);
  lines.push(`Best channel angle: ${av.bestChannelAngle}`);
  return lines.join("\n");
}

// ---------------- Angles tab (ranked angles + headlines + objections) ----------------

function AnglesTab({ strategy }: { strategy: Strategy }) {
  return (
    <div className="flex flex-col gap-5">
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

      <SectionTitle>Headlines</SectionTitle>
      <div className="flex flex-col gap-2">
        {strategy.headlines.map((h, i) => (
          <CopyableCard key={`h-${i}`} text={h} dense>
            <p>{h}</p>
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

// ---------------- Concepts tab (concept cards + hook bench + variants + CTA + statics + shorts) ----------------

function ConceptsTab({ strategy, input }: { strategy: Strategy; input: ProductInput }) {
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle>Top angle to test first</SectionTitle>
      {strategy.rankedAngles[0] ? (
        <AngleCard angle={strategy.rankedAngles[0]} rank={1} />
      ) : null}

      <SectionTitle>Ad Concept Cards</SectionTitle>
      <p className="text-xs text-ink-400">
        Each card pairs an avatar with a hook pattern, a promise, a proof
        angle, an offer tie-in, a visual idea, and a next-variant
        suggestion. Use these as starter concepts before opening the
        Variant Spinner.
      </p>
      <div className="flex flex-col gap-3">
        {strategy.adConceptCards.map((c) => (
          <ConceptCard
            key={c.id}
            card={c}
            avatars={strategy.audienceAvatars}
          />
        ))}
      </div>

      <SectionTitle>Hook Library</SectionTitle>
      <HookLibraryBlock library={strategy.hookLibrary} />

      <SectionTitle>Hook Critic</SectionTitle>
      <p className="text-xs text-ink-400">
        Paste a draft hook line. The critic scores it deterministically
        against eight axes — length, opener, stakes, specificity, payoff
        placement, voice, category bland, tone-vs-awareness — and
        proposes a rewrite seeded from your input. No API call.
      </p>
      <HookCriticBlock input={input} />

      <SectionTitle>Variant Spinner</SectionTitle>
      <p className="text-xs text-ink-400">
        For each top brief, the engine emits five variants — one per axis
        (hook / hold / proof / CTA / offer). Each variant changes exactly
        one axis from the base concept so the test plan stays clean.
      </p>
      <div className="flex flex-col gap-3">
        {strategy.variantSets.map((vset, i) => {
          const brief = strategy.creatorBriefs.find(
            (b) => vset.baseConceptId.startsWith(b.id + "-")
          );
          return (
            <VariantSetCard
              key={vset.baseConceptId}
              vset={vset}
              briefLabel={brief?.forAngle ?? `Base ${i + 1}`}
            />
          );
        })}
      </div>

      <SectionTitle>CTA Bank</SectionTitle>
      <p className="text-xs text-ink-400">
        Concise CTA copy across five styles (direct / curious / time-boxed /
        proof-led / low-pressure) and five surfaces (Meta feed / Meta reels /
        TikTok / landing primary / email). Each variant is parameterised on
        the product, audience, and top offer kind. Copy a single variant or
        a whole surface row.
      </p>
      <CtaBankBlock bank={strategy.ctaBank} />

      <SectionTitle>Static Briefs</SectionTitle>
      <p className="text-xs text-ink-400">
        First-frame designer briefs per top brief. Each brief is shown in
        all three sizes (1:1, 4:5, 9:16) with headline overlay, sub
        overlay, hero element, proof element, CTA badge, and a layout
        plan. Designer-actionable on its own — no extra context required.
      </p>
      <StaticBriefsBlock strategy={strategy} />

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

function ConceptCard({
  card,
  avatars,
}: {
  card: AdConceptCard;
  avatars: AudienceAvatar[];
}) {
  const avatar = avatars.find((a) => a.id === card.targetAvatarId);
  const exportText = conceptCardToText(card, avatar);
  return (
    <div className="hairline relative rounded-lg bg-ink-900 p-4">
      <div className="absolute right-3 top-3">
        <CopyMini text={exportText} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-16">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          {card.id}
        </span>
        <p className="text-sm font-medium text-ink-50">{card.name}</p>
        {avatar ? (
          <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-xxs text-ink-100">
            {avatar.label}
          </span>
        ) : null}
        <span className="rounded-sm border border-emerald-500/30 bg-emerald-950/30 px-1.5 py-0.5 text-xxs text-emerald-200">
          {hookPatternUiLabel(card.hook.pattern)}
        </span>
      </div>
      <div className="mt-3 rounded-md border border-ink-800 bg-ink-950/40 p-3">
        <p className="text-xxs uppercase tracking-wide text-ink-400">Hook</p>
        <p className="mt-1 text-sm text-ink-50">{card.hook.text}</p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
        <div>
          <p className="text-ink-400">Promise</p>
          <p className="mt-1 text-ink-100">{card.promise}</p>
        </div>
        <div>
          <p className="text-ink-400">Proof angle</p>
          <p className="mt-1 text-ink-100">{card.proofAngle}</p>
        </div>
        <div>
          <p className="text-ink-400">Offer tie-in</p>
          <p className="mt-1 text-ink-100">{card.offerTieIn}</p>
        </div>
        <div>
          <p className="text-ink-400">Visual idea</p>
          <p className="mt-1 text-ink-100">{card.visualIdea}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {card.formatFit.map((f) => (
          <span
            key={f}
            className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200"
          >
            {f}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xxs text-ink-300">
        <span className="text-ink-400">Test hypothesis: </span>
        {card.testHypothesis}
      </p>
      <p className="mt-1 text-xxs text-ink-300">
        <span className="text-ink-400">Next variant: </span>
        {card.nextVariantSuggestion}
      </p>
    </div>
  );
}

function conceptCardToText(
  c: AdConceptCard,
  avatar: AudienceAvatar | undefined
): string {
  const lines: string[] = [];
  lines.push(`${c.name} (${c.id})`);
  lines.push(`Target: ${avatar ? `${avatar.label} (${avatar.id})` : c.targetAvatarId}`);
  lines.push(`Hook (${c.hook.pattern}): ${c.hook.text}`);
  lines.push(`Promise: ${c.promise}`);
  lines.push(`Proof angle: ${c.proofAngle}`);
  lines.push(`Offer tie-in: ${c.offerTieIn}`);
  lines.push(`Visual idea: ${c.visualIdea}`);
  lines.push(`Format fit: ${c.formatFit.join(", ")}`);
  lines.push(`Test hypothesis: ${c.testHypothesis}`);
  lines.push(`Next variant: ${c.nextVariantSuggestion}`);
  return lines.join("\n");
}

function HookLibraryBlock({ library }: { library: HookLibrary }) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const order: HookPattern[] = [
      "pain-first",
      "outcome-first",
      "contrarian",
      "proof-led",
      "curiosity",
      "comparison",
      "mistake",
      "before-after",
    ];
    return order.map((pattern) => ({
      pattern,
      items: library.items.filter((it) => it.pattern === pattern),
    }));
  }, [library]);

  return (
    <div className="hairline rounded-lg bg-ink-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-300">
          {library.items.length} hooks across 8 patterns — reference bank,
          not a primary surface.
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-200 hover:border-accent hover:text-white"
        >
          {open ? "Collapse" : "Expand library"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          {grouped.map(({ pattern, items }) =>
            items.length === 0 ? null : (
              <div key={pattern} className="rounded-md border border-ink-800 bg-ink-950/40 p-3">
                <p className="text-xxs uppercase tracking-wide text-ink-300">
                  {hookPatternUiLabel(pattern)}
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {items.map((it, i) => (
                    <HookLibraryItemRow key={`${pattern}-${i}`} item={it} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

function HookLibraryItemRow({ item }: { item: HookLibraryItem }) {
  return (
    <div className="rounded-sm border border-ink-800 bg-ink-900 p-2">
      <p className="text-sm text-ink-50">{item.text}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.awarenessFit.map((a) => (
          <span
            key={`aw-${a}`}
            className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200"
          >
            {a}
          </span>
        ))}
        {item.avatarFit.map((id) => (
          <span
            key={`av-${id}`}
            className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-xxs text-ink-100"
          >
            {id}
          </span>
        ))}
      </div>
      <p className="mt-1 text-xxs text-ink-400">
        <span className="text-ink-500">Risk: </span>
        {item.riskNote}
      </p>
    </div>
  );
}

function hookPatternUiLabel(p: HookPattern): string {
  return (
    {
      "pain-first": "Pain-first",
      "outcome-first": "Outcome-first",
      contrarian: "Contrarian",
      "proof-led": "Proof-led",
      curiosity: "Curiosity",
      comparison: "Comparison",
      mistake: "Mistake",
      "before-after": "Before-after",
    }[p] ?? p
  );
}

function HookCriticBlock({ input }: { input: ProductInput }) {
  const [draft, setDraft] = useState("");
  const critique: HookCritique | null = useMemo(() => {
    if (!draft.trim()) return null;
    return critiqueHook(draft, input);
  }, [draft, input]);

  return (
    <div className="hairline rounded-lg bg-ink-900 p-4">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Type or paste a draft hook line…"
        className="hairline w-full resize-y rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500"
        rows={2}
        spellCheck
      />
      {critique ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <HookScorePill score={critique.score} />
            <span className="text-xxs text-ink-400">
              {critique.flags.length}{" "}
              flag{critique.flags.length === 1 ? "" : "s"}
            </span>
          </div>
          {critique.flags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {critique.flags.map((f, i) => (
                <HookFlagChip key={i} flag={f} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-300">
              No flags. The draft already opens cleanly.
            </p>
          )}
          <div className="rounded-md border border-ink-800 bg-ink-950/40 p-3">
            <p className="text-xxs uppercase tracking-wide text-ink-400">
              Suggested rewrite
            </p>
            <p className="mt-1 text-sm text-ink-50">{critique.rewrite}</p>
            <p className="mt-2 text-xs text-ink-300">
              <span className="text-ink-400">Rationale: </span>
              {critique.rationale}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-500">
          Critique renders here as soon as you type.
        </p>
      )}
    </div>
  );
}

function HookScorePill({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "border-emerald-500/40 text-emerald-300"
      : score >= 55
      ? "border-amber-500/40 text-amber-300"
      : "border-rose-500/40 text-rose-300";
  return (
    <span
      className={`rounded-sm border bg-ink-900 px-2 py-0.5 text-xs ${tone}`}
    >
      {score}/100
    </span>
  );
}

function HookFlagChip({ flag }: { flag: HookFlag }) {
  const tone =
    flag.severity === "high"
      ? "border-rose-500/40 text-rose-200"
      : flag.severity === "medium"
      ? "border-amber-500/40 text-amber-200"
      : "border-ink-700 text-ink-200";
  return (
    <span
      className={`rounded-sm border bg-ink-950 px-1.5 py-0.5 text-xxs ${tone}`}
      title={`${flag.message} Fix: ${flag.fix}`}
    >
      {flag.kind} · {flag.severity}
    </span>
  );
}

function VariantSetCard({
  vset,
  briefLabel,
}: {
  vset: VariantSet;
  briefLabel: string;
}) {
  const exportText = variantSetToText(vset, briefLabel);
  return (
    <div className="hairline relative rounded-lg bg-ink-900 p-4">
      <div className="absolute right-3 top-3">
        <CopyMini text={exportText} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-16">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          {vset.baseConceptId}
        </span>
        <p className="text-sm font-medium text-ink-50">{briefLabel}</p>
        <Tag>{vset.variants.length} variants</Tag>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {vset.variants.map((v) => (
          <VariantCard key={v.id} variant={v} />
        ))}
      </div>
    </div>
  );
}

function VariantCard({ variant }: { variant: AdVariant }) {
  return (
    <div className="rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-xxs text-ink-100">
          axis: {variant.changedAxis}
        </span>
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          {variant.id}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
        <Field axis="hook" highlight={variant.changedAxis === "hook"} value={variant.hook} />
        <Field axis="hold" highlight={variant.changedAxis === "hold"} value={variant.hold} />
        <Field axis="proof" highlight={variant.changedAxis === "proof"} value={variant.proof} />
        <Field axis="cta" highlight={variant.changedAxis === "cta"} value={variant.cta} />
        <Field axis="offer" highlight={variant.changedAxis === "offer"} value={variant.offer} />
      </div>
      <p className="mt-2 text-xxs text-ink-300">
        <span className="text-ink-400">Why: </span>
        {variant.rationale}
      </p>
    </div>
  );
}

function Field({
  axis,
  value,
  highlight,
}: {
  axis: string;
  value: string;
  highlight: boolean;
}) {
  return (
    <div
      className={`rounded-sm px-2 py-1 ${
        highlight ? "bg-ink-900 ring-1 ring-accent/40" : "bg-transparent"
      }`}
    >
      <span className="text-xxs uppercase tracking-wide text-ink-400">{axis}: </span>
      <span className="text-ink-100">{value}</span>
    </div>
  );
}

function variantSetToText(vset: VariantSet, briefLabel: string): string {
  const lines: string[] = [];
  lines.push(`Variant set ${vset.baseConceptId} — ${briefLabel}`);
  lines.push("");
  for (const v of vset.variants) {
    lines.push(`${v.id} — axis: ${v.changedAxis}`);
    lines.push(`  Hook:  ${v.hook}`);
    lines.push(`  Hold:  ${v.hold}`);
    lines.push(`  Proof: ${v.proof}`);
    lines.push(`  CTA:   ${v.cta}`);
    lines.push(`  Offer: ${v.offer}`);
    lines.push(`  Why:   ${v.rationale}`);
    lines.push("");
  }
  return lines.join("\n");
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
        pass before it opens, and the offer kind that fits. Forecast soft
        windows render as mechanism chips, and the recommended audience
        architecture (single-tier outside a promo, three-tier inside one)
        sits under each card. Pre-peak windows in seasonal campaigns also
        carry an eight-question retrospective gate.
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
  const hasDip = w.dipForecasts.length > 0;
  const dipBorder = hasDip ? "border-amber-500/40" : "border-transparent";
  const dipLines =
    w.dipForecasts.length === 0
      ? "Forecast dips: none"
      : `Forecast dips:\n${w.dipForecasts
          .map(
            (d) =>
              `  - ${dipMechanismLabel(d.mechanism)} (${d.severity}, ~day +${d.expectedAroundDayOffset}): ${d.rationale}`
          )
          .join("\n")}`;
  const archLines =
    `Architecture: ${w.recommendedArchitecture.kind === "promo-3-tier" ? "Promo 3-tier" : "Single-tier"}\n` +
    `  Tiers: ${w.recommendedArchitecture.tiers.map((t) => `${t.name} (${audienceIntentLabel(t.intent)})`).join("; ")}` +
    (w.recommendedArchitecture.budgetSplitHint
      ? `\n  Budget split: ${w.recommendedArchitecture.budgetSplitHint}`
      : "") +
    `\n  Rationale: ${w.recommendedArchitecture.rationale}`;
  const retroLines = w.retrospectiveGate
    ? `\nRetrospective gate (${w.retrospectiveGate.questions.length} questions):\n${w.retrospectiveGate.questions
        .map((q) => `  - [${q.topic}] ${q.question}`)
        .join("\n")}`
    : "";
  const exportText =
    `Window ${index}: ${windowKindLabel(w.kind)} — ${w.label}\n` +
    `When: ${startLabel} for ${w.durationDays} ${w.durationDays === 1 ? "day" : "days"}\n` +
    `KPI: ${w.primaryKPI}\n` +
    `Readiness gate: ${w.readinessGate}\n` +
    `Recommended offer: ${w.recommendedOfferKind ? offerKindLabel(w.recommendedOfferKind) : "—"}\n` +
    `${dipLines}\n` +
    `${archLines}` +
    retroLines +
    `\nNotes: ${w.notes}`;
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
      {hasDip ? (
        <div className="mt-3">
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Dip forecasts
          </p>
          <div className="mt-1 flex flex-col gap-1.5">
            {w.dipForecasts.map((d, i) => (
              <DipForecastChip key={`dip-${i}`} dip={d} />
            ))}
          </div>
        </div>
      ) : null}
      <ArchitectureBlock arch={w.recommendedArchitecture} />
      {w.retrospectiveGate ? (
        <RetrospectiveGateBlock gate={w.retrospectiveGate} />
      ) : null}
      <p className="mt-3 text-xs text-ink-300">
        <span className="text-ink-400">Readiness gate: </span>
        {w.readinessGate}
      </p>
      <p className="mt-2 text-sm text-ink-100">{w.notes}</p>
    </div>
  );
}

function DipForecastChip({ dip }: { dip: DipForecast }) {
  // Severity → colour. Soft = amber/yellow, notable = orange, hard = red.
  const palette =
    dip.severity === "hard"
      ? "border-red-500/50 bg-red-950/30 text-red-300"
      : dip.severity === "notable"
      ? "border-orange-500/50 bg-orange-950/30 text-orange-300"
      : "border-amber-500/40 bg-amber-950/30 text-amber-300";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`rounded-sm border px-1.5 py-0.5 text-xxs ${palette}`}
        title={dip.rationale}
      >
        {dipMechanismLabel(dip.mechanism)} · {dip.severity} · ~day +
        {dip.expectedAroundDayOffset}
      </span>
      <span className="text-xxs text-ink-400">{dip.rationale}</span>
    </div>
  );
}

function ArchitectureBlock({ arch }: { arch: CampaignArchitecture }) {
  const badge =
    arch.kind === "promo-3-tier"
      ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300"
      : "border-ink-700 bg-ink-800 text-ink-200";
  const badgeText = arch.kind === "promo-3-tier" ? "Promo 3-tier" : "Single-tier";
  return (
    <div className="mt-3 rounded-md border border-ink-800 bg-ink-950/40 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Architecture
        </p>
        <span className={`rounded-sm border px-1.5 py-0.5 text-xxs ${badge}`}>
          {badgeText}
        </span>
        {arch.budgetSplitHint ? (
          <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
            Split: {arch.budgetSplitHint}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {arch.tiers.map((t, i) => (
          <span
            key={`tier-${i}`}
            className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-100"
            title={t.notes ?? ""}
          >
            {t.name} · {audienceIntentLabel(t.intent)}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-xxs text-ink-400">{arch.rationale}</p>
    </div>
  );
}

function RetrospectiveGateBlock({ gate }: { gate: RetrospectiveGate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-md border border-indigo-500/30 bg-indigo-950/20 p-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xxs uppercase tracking-wide text-indigo-300">
          Pre-peak retrospective gate ({gate.questions.length} questions)
        </span>
        <span className="text-xxs text-indigo-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <ol className="mt-2 flex list-inside list-decimal flex-col gap-2 text-xs text-ink-100">
          {gate.questions.map((q, i) => (
            <li key={`retro-${i}`}>
              <span className="font-medium">{q.question}</span>
              <p className="mt-0.5 text-xxs text-ink-400">
                Why it matters: {q.whyItMatters}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function dipMechanismLabel(m: DipForecast["mechanism"]): string {
  return (
    {
      "warm-cohort-saturation": "Warm-cohort saturation",
      "warm-cohort-exhaustion": "Warm-cohort exhaustion",
      "urgency-collapse": "Urgency collapse",
      "post-peak-reset": "Post-peak reset",
    }[m] ?? m
  );
}

function audienceIntentLabel(intent: string): string {
  return (
    {
      prospecting: "Prospecting",
      "engagement-retargeting": "Engagement retargeting",
      "site-retargeting": "Site retargeting",
    }[intent] ?? intent
  );
}

// ---------------- Briefs tab ----------------

function BriefsTab({ strategy }: { strategy: Strategy }) {
  const aggregateQa = strategy.creativeQa.find((q) => q.scope === "all");
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle>Creator Briefs</SectionTitle>
      <p className="text-xs text-ink-400">
        One production brief per top-ranked angle. Each brief carries a
        framing rule, alternate hook openers, a four-section spine
        (hook / problem / solution / CTA), the deliverable list, a
        line-level video script, an applied Ad Review evaluation, a
        Creative QA strip, and a copy-paste editor handoff. Briefs are
        deterministic — the same inputs always produce the same briefs.
      </p>
      {aggregateQa ? <AggregateQaSummary qa={aggregateQa} /> : null}
      <div className="flex flex-col gap-3">
        {strategy.creatorBriefs.map((brief) => {
          const script = strategy.videoScripts.find(
            (s) => s.briefId === brief.id
          );
          const applied = strategy.appliedAdReviews.find(
            (r) => r.targetId === brief.id
          );
          const qa = strategy.creativeQa.find((q) => q.scope === brief.id);
          const handoff = strategy.editorHandoffs.find(
            (h) => h.briefId === brief.id
          );
          return (
            <BriefCard
              key={brief.id}
              brief={brief}
              script={script}
              applied={applied}
              qa={qa}
              handoff={handoff}
            />
          );
        })}
      </div>
    </div>
  );
}

function BriefCard({
  brief,
  script,
  applied,
  qa,
  handoff,
}: {
  brief: CreatorBrief;
  script?: VideoScript;
  applied?: AppliedAdReview;
  qa?: CreativeQA;
  handoff?: EditorHandoff;
}) {
  const exportText = briefToText(brief);
  return (
    <div className="hairline relative rounded-lg bg-ink-900 p-4">
      <div className="absolute right-3 top-3">
        <CopyMini text={exportText} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-16">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          {brief.id}
        </span>
        <p className="text-sm font-medium text-ink-50">{brief.forAngle}</p>
        <Tag>~{brief.durationSeconds}s</Tag>
      </div>
      <p className="mt-3 text-xs text-ink-300">
        <span className="text-ink-400">Framing: </span>
        {brief.framing}
      </p>
      {brief.notes ? (
        <p className="mt-2 text-xs text-ink-400">{brief.notes}</p>
      ) : null}

      <div className="mt-4">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Alt hooks
        </p>
        <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-100">
          {brief.altHooks.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {brief.sections.map((s) => (
          <BriefSectionBlock key={s.kind} section={s} />
        ))}
      </div>

      <div className="mt-4">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Deliverables
        </p>
        <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-100">
          {brief.deliverables.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>

      {script ? <VideoScriptBlock script={script} /> : null}
      {applied ? <AppliedReviewBlock applied={applied} /> : null}
      {qa ? <CreativeQaBlock qa={qa} /> : null}
      {handoff ? <EditorHandoffBlock handoff={handoff} /> : null}
    </div>
  );
}

function AppliedReviewBlock({ applied }: { applied: AppliedAdReview }) {
  const verdictTone =
    applied.verdict === "ready"
      ? "border-emerald-500/40 text-emerald-300 bg-emerald-950/30"
      : applied.verdict === "almost"
      ? "border-amber-500/40 text-amber-300 bg-amber-950/30"
      : "border-rose-500/40 text-rose-300 bg-rose-950/30";
  return (
    <div className="mt-4 rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Applied review
          </p>
          <Tag>
            {applied.totalScore}/{applied.maxScore}
          </Tag>
          <Tag>{applied.scorePercent}%</Tag>
          <span
            className={`rounded-sm border px-2 py-0.5 text-xxs ${verdictTone}`}
          >
            {appliedVerdictUiLabel(applied.verdict)}
          </span>
        </div>
      </div>
      <div className="mt-3 hidden md:block">
        <table className="w-full table-auto border-collapse text-xs">
          <thead>
            <tr className="border-b border-ink-800 text-ink-400">
              <th className="py-2 pr-3 text-left font-medium">Axis</th>
              <th className="py-2 pr-3 text-left font-medium">Verdict</th>
              <th className="py-2 pr-3 text-left font-medium">Score</th>
              <th className="py-2 pr-3 text-left font-medium">Evidence</th>
              <th className="py-2 pr-3 text-left font-medium">Fix</th>
            </tr>
          </thead>
          <tbody>
            {applied.findings.map((f) => (
              <tr
                key={f.axis}
                className="border-b border-ink-900/60 align-top"
              >
                <td className="py-2 pr-3 text-ink-200">
                  {reviewAxisLabelUi(f.axis)}
                </td>
                <td className="py-2 pr-3">
                  <FindingVerdictPill verdict={f.verdict} />
                </td>
                <td className="py-2 pr-3 text-ink-200">
                  {f.scoreContribution}/{f.weight}
                </td>
                <td className="py-2 pr-3 text-ink-100">{f.evidence}</td>
                <td className="py-2 pr-3 text-ink-300">{f.fix ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col gap-2 md:hidden">
        {applied.findings.map((f) => (
          <FindingRow key={f.axis} finding={f} />
        ))}
      </div>
    </div>
  );
}

function FindingRow({ finding: f }: { finding: AdReviewFinding }) {
  return (
    <div className="rounded-sm border border-ink-800 bg-ink-950/40 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          {reviewAxisLabelUi(f.axis)}
        </span>
        <FindingVerdictPill verdict={f.verdict} />
        <Tag>
          {f.scoreContribution}/{f.weight}
        </Tag>
      </div>
      <p className="mt-1 text-xs text-ink-100">{f.evidence}</p>
      {f.fix ? (
        <p className="mt-1 text-xxs text-ink-400">
          <span className="text-ink-500">Fix: </span>
          {f.fix}
        </p>
      ) : null}
    </div>
  );
}

function FindingVerdictPill({ verdict }: { verdict: string }) {
  const tone =
    verdict === "passed"
      ? "border-emerald-500/40 text-emerald-300"
      : verdict === "partial"
      ? "border-amber-500/40 text-amber-300"
      : verdict === "missing"
      ? "border-rose-500/40 text-rose-300"
      : "border-ink-700 text-ink-300";
  return (
    <span
      className={`rounded-sm border bg-ink-900 px-1.5 py-0.5 text-xxs ${tone}`}
    >
      {verdict}
    </span>
  );
}

function appliedVerdictUiLabel(verdict: string): string {
  return (
    {
      ready: "Ready",
      almost: "Almost",
      "not-ready": "Not ready",
    }[verdict] ?? verdict
  );
}

function reviewAxisLabelUi(axis: string): string {
  return (
    {
      "hook-clarity": "Hook clarity",
      "first-3s-payoff": "First-3s payoff",
      "claim-specificity": "Claim specificity",
      "proof-strength": "Proof strength",
      "offer-visibility": "Offer visibility",
      "cta-clarity": "CTA clarity",
      "platform-fit": "Platform fit",
      "tone-match": "Tone match",
      "awareness-fit": "Awareness fit",
      pacing: "Pacing",
      "visual-hierarchy": "Visual hierarchy",
      "captions-overlay": "Captions / overlay",
      "audio-quality": "Audio quality",
      "brand-presence": "Brand presence",
      "tracking-readiness-ref": "Tracking ref",
    }[axis] ?? axis
  );
}

function VideoScriptBlock({ script }: { script: VideoScript }) {
  const exportText = scriptToText(script);
  return (
    <div className="mt-4 rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Video script
          </p>
          <Tag>{script.lines.length} lines</Tag>
          <Tag>~{script.totalDurationSeconds}s</Tag>
        </div>
        <CopyMini text={exportText} />
      </div>
      <div className="mt-3 hidden md:block">
        <table className="w-full table-auto border-collapse text-xs">
          <thead>
            <tr className="border-b border-ink-800 text-ink-400">
              <th className="py-2 pr-3 text-left font-medium">#</th>
              <th className="py-2 pr-3 text-left font-medium">Section</th>
              <th className="py-2 pr-3 text-left font-medium">Kind</th>
              <th className="py-2 pr-3 text-left font-medium">Start</th>
              <th className="py-2 pr-3 text-left font-medium">Dur</th>
              <th className="py-2 pr-3 text-left font-medium">Text</th>
            </tr>
          </thead>
          <tbody>
            {script.lines.map((ln) => (
              <tr key={ln.index} className="border-b border-ink-900/60 align-top">
                <td className="py-2 pr-3 text-ink-300">{ln.index}</td>
                <td className="py-2 pr-3 text-ink-200">
                  {briefSectionIndexLabelShort(ln.briefSectionIndex)}
                </td>
                <td className="py-2 pr-3">
                  <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
                    {scriptKindLabel(ln.kind)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-ink-200">{ln.startSeconds}s</td>
                <td className="py-2 pr-3 text-ink-200">{ln.durationSeconds}s</td>
                <td className="py-2 pr-3 text-ink-100">{ln.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col gap-2 md:hidden">
        {script.lines.map((ln) => (
          <div
            key={ln.index}
            className="rounded-sm border border-ink-800 bg-ink-950/40 p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
                #{ln.index}
              </span>
              <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
                {scriptKindLabel(ln.kind)}
              </span>
              <Tag>
                {briefSectionIndexLabelShort(ln.briefSectionIndex)} · {ln.startSeconds}s · {ln.durationSeconds}s
              </Tag>
            </div>
            <p className="mt-1 text-xs text-ink-100">{ln.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function scriptToText(script: VideoScript): string {
  const lines: string[] = [];
  lines.push(`Video script ${script.briefId} — ${script.totalDurationSeconds}s total`);
  lines.push("");
  for (const ln of script.lines) {
    lines.push(
      `${ln.index}. [${briefSectionIndexLabelShort(ln.briefSectionIndex)}] ${scriptKindLabel(ln.kind)} @ ${ln.startSeconds}s for ${ln.durationSeconds}s`
    );
    lines.push(`   ${ln.text}`);
  }
  return lines.join("\n");
}

function briefSectionIndexLabelShort(i: number): string {
  return ["Hook", "Problem", "Sol.", "CTA"][i] ?? `S${i + 1}`;
}

function scriptKindLabel(kind: string): string {
  return (
    {
      vo: "VO",
      "on-camera": "On-cam",
      "on-screen-text": "Overlay",
      sfx: "SFX",
    }[kind] ?? kind
  );
}

function BriefSectionBlock({ section: s }: { section: CreatorBriefSection }) {
  return (
    <div className="rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          {briefSectionLabel(s.kind)}
        </span>
        <p className="text-sm font-medium text-ink-50">{s.label}</p>
        <Tag>~{s.durationSeconds}s</Tag>
      </div>
      <p className="mt-2 text-xs text-ink-200">{s.beat}</p>
      {s.whatToSay && s.whatToSay.length > 0 ? (
        <div className="mt-3">
          <p className="text-xxs uppercase tracking-wide text-ink-400">Say</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-100">
            {s.whatToSay.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.whatToShow && s.whatToShow.length > 0 ? (
        <div className="mt-3">
          <p className="text-xxs uppercase tracking-wide text-ink-400">Show</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-100">
            {s.whatToShow.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {s.doNot && s.doNot.length > 0 ? (
        <div className="mt-3">
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Do not
          </p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-100">
            {s.doNot.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function briefToText(brief: CreatorBrief): string {
  const lines: string[] = [];
  lines.push(`Brief ${brief.id} — ${brief.forAngle}`);
  lines.push(`Total ~${brief.durationSeconds}s`);
  lines.push(`Framing: ${brief.framing}`);
  if (brief.notes) lines.push(`Note: ${brief.notes}`);
  lines.push("");
  lines.push("Alt hooks:");
  for (const h of brief.altHooks) lines.push(`- ${h}`);
  lines.push("");
  for (const s of brief.sections) {
    lines.push(`${briefSectionLabel(s.kind)} — ${s.label} (~${s.durationSeconds}s)`);
    lines.push(s.beat);
    if (s.whatToSay && s.whatToSay.length > 0) {
      lines.push("  Say:");
      for (const x of s.whatToSay) lines.push(`    - ${x}`);
    }
    if (s.whatToShow && s.whatToShow.length > 0) {
      lines.push("  Show:");
      for (const x of s.whatToShow) lines.push(`    - ${x}`);
    }
    if (s.doNot && s.doNot.length > 0) {
      lines.push("  Do not:");
      for (const x of s.doNot) lines.push(`    - ${x}`);
    }
    lines.push("");
  }
  lines.push("Deliverables:");
  for (const d of brief.deliverables) lines.push(`- ${d}`);
  return lines.join("\n");
}

function briefSectionLabel(kind: string): string {
  return (
    {
      hook: "Hook",
      problem: "Problem",
      "solution-or-proof": "Solution / proof",
      cta: "CTA",
    }[kind] ?? kind
  );
}

// ---------------- Shots tab ----------------

function ShotsTab({ strategy }: { strategy: Strategy }) {
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle>Shot Lists</SectionTitle>
      <p className="text-xs text-ink-400">
        One numbered shot list per brief. Shots cover all four section
        beats — hook, problem, solution, CTA — with kind, framing,
        camera angle, duration envelope, props, and sound direction.
        The total midpoint duration tracks the brief's envelope.
      </p>
      <div className="flex flex-col gap-3">
        {strategy.shotLists.map((list) => {
          const matched = strategy.creatorBriefs.find(
            (b) => b.id === list.briefId
          );
          return (
            <ShotListCard
              key={list.briefId}
              list={list}
              angleRef={matched?.forAngle ?? list.briefId}
            />
          );
        })}
      </div>
    </div>
  );
}

function ShotListCard({
  list,
  angleRef,
}: {
  list: ShotList;
  angleRef: string;
}) {
  const exportText = shotListToText(list, angleRef);
  return (
    <div className="hairline relative rounded-lg bg-ink-900 p-4">
      <div className="absolute right-3 top-3">
        <CopyMini text={exportText} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-16">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          {list.briefId}
        </span>
        <p className="text-sm font-medium text-ink-50">{angleRef}</p>
        <Tag>{list.totalShots} shots</Tag>
      </div>

      {/* Desktop / wide: table-like layout. Mobile: stacked cards. */}
      <div className="mt-4 hidden md:block">
        <table className="w-full table-auto border-collapse text-xs">
          <thead>
            <tr className="border-b border-ink-800 text-ink-400">
              <th className="py-2 pr-3 text-left font-medium">#</th>
              <th className="py-2 pr-3 text-left font-medium">Kind</th>
              <th className="py-2 pr-3 text-left font-medium">Framing</th>
              <th className="py-2 pr-3 text-left font-medium">Angle</th>
              <th className="py-2 pr-3 text-left font-medium">Duration</th>
              <th className="py-2 pr-3 text-left font-medium">Props</th>
              <th className="py-2 pr-3 text-left font-medium">Sound</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((it) => (
              <tr key={it.index} className="border-b border-ink-900/60 align-top">
                <td className="py-2 pr-3 text-ink-300">{it.index}</td>
                <td className="py-2 pr-3">
                  <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
                    {shotKindLabel(it.kind)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-ink-100">{it.framing}</td>
                <td className="py-2 pr-3 text-ink-200">{cameraAngleLabel(it.angle)}</td>
                <td className="py-2 pr-3 text-ink-200">{it.duration}</td>
                <td className="py-2 pr-3 text-ink-100">
                  <ul className="list-inside list-disc space-y-0.5">
                    {it.props.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </td>
                <td className="py-2 pr-3 text-ink-100">
                  {it.sound}
                  {it.bRollNotes ? (
                    <span className="mt-1 block text-xxs text-ink-400">
                      Note: {it.bRollNotes}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-2 md:hidden">
        {list.items.map((it) => (
          <div
            key={it.index}
            className="rounded-md border border-ink-800 bg-ink-950/40 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
                #{it.index}
              </span>
              <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
                {shotKindLabel(it.kind)}
              </span>
              <Tag>{it.duration}</Tag>
              <Tag>{cameraAngleLabel(it.angle)}</Tag>
            </div>
            <p className="mt-2 text-xs text-ink-100">{it.framing}</p>
            <p className="mt-1 text-xxs text-ink-400">Props</p>
            <ul className="list-inside list-disc text-xs text-ink-100">
              {it.props.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
            <p className="mt-2 text-xxs text-ink-400">Sound</p>
            <p className="text-xs text-ink-100">{it.sound}</p>
            {it.bRollNotes ? (
              <p className="mt-1 text-xxs text-ink-400">Note: {it.bRollNotes}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function shotListToText(list: ShotList, angleRef: string): string {
  const lines: string[] = [];
  lines.push(`Shot list ${list.briefId} — ${angleRef}`);
  lines.push(`Total shots: ${list.totalShots}`);
  lines.push("");
  for (const it of list.items) {
    lines.push(
      `${it.index}. ${shotKindLabel(it.kind)} — ${it.framing} (${cameraAngleLabel(it.angle)}, ${it.duration})`
    );
    lines.push(`   Props: ${it.props.join("; ")}`);
    lines.push(`   Sound: ${it.sound}`);
    if (it.bRollNotes) lines.push(`   Note: ${it.bRollNotes}`);
  }
  return lines.join("\n");
}

function shotKindLabel(kind: string): string {
  return (
    {
      "talking-head": "Talking head",
      "product-shot": "Product shot",
      "b-roll": "B-roll",
      screenshot: "Screenshot",
      "ugc-selfie": "UGC selfie",
      lifestyle: "Lifestyle",
    }[kind] ?? kind
  );
}

function cameraAngleLabel(angle: string): string {
  return (
    {
      "eye-level": "Eye-level",
      high: "High",
      low: "Low",
      "over-shoulder": "Over-shoulder",
      pov: "POV",
    }[angle] ?? angle
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

// ---------------- Journey Status block ----------------

const JOURNEY_STAGES: { stage: JourneyStage; label: string }[] = [
  { stage: "strategy-drafted", label: "Strategy" },
  { stage: "creative-planned", label: "Creative" },
  { stage: "tracking-ready", label: "Tracking" },
  { stage: "kpi-aligned", label: "KPIs" },
  { stage: "review-passed", label: "Review" },
  { stage: "ready-to-spend", label: "Spend" },
];

function JourneyStatusBlock({ status }: { status: JourneyStatus }) {
  const currentIdx = JOURNEY_STAGES.findIndex(
    (s) => s.stage === status.currentStage
  );
  const badgeTone = status.readyToSpend
    ? "border-emerald-500/40 text-emerald-300 bg-emerald-950/30"
    : status.blockers.length > 0
    ? "border-rose-500/40 text-rose-200 bg-rose-950/30"
    : "border-amber-500/40 text-amber-200 bg-amber-950/30";

  return (
    <div className="hairline rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {JOURNEY_STAGES.map((s, i) => {
            const isCurrent = i === currentIdx;
            const isPast = i < currentIdx;
            const tone = isCurrent
              ? "border-accent/60 bg-ink-900 text-ink-50"
              : isPast
              ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-200"
              : "border-ink-700 bg-ink-900 text-ink-400";
            return (
              <span
                key={s.stage}
                className={`rounded-sm border px-2 py-0.5 text-xxs ${tone}`}
                title={s.stage}
              >
                {i + 1}. {s.label}
              </span>
            );
          })}
        </div>
        <span className={`rounded-sm border px-2 py-0.5 text-xxs ${badgeTone}`}>
          {status.readyToSpend
            ? "Ready to spend"
            : status.blockers.length > 0
            ? `${status.blockers.length} blocker${status.blockers.length === 1 ? "" : "s"}`
            : "Pre-flight"}
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-200">
        <span className="text-ink-400">Next step: </span>
        {status.nextStep}
      </p>
      {status.blockers.length > 0 || status.warnings.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {status.blockers.slice(0, 4).map((b, i) => (
            <span
              key={`bk-${i}`}
              className="rounded-sm border border-rose-500/40 bg-rose-950/30 px-1.5 py-0.5 text-xxs text-rose-200"
              title={b.message}
            >
              <span className="mr-1 opacity-70">{journeyBlockerKindLabel(b.kind)}</span>
              {truncateChip(b.message)}
            </span>
          ))}
          {status.warnings.slice(0, 4).map((w, i) => (
            <span
              key={`wn-${i}`}
              className="rounded-sm border border-amber-500/30 bg-amber-950/20 px-1.5 py-0.5 text-xxs text-amber-200"
              title={w.message}
            >
              <span className="mr-1 opacity-70">{journeyBlockerKindLabel(w.kind)}</span>
              {truncateChip(w.message)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function journeyBlockerKindLabel(kind: string): string {
  return (
    {
      tracking: "tracking",
      kpi: "kpi",
      review: "review",
      creative: "creative",
      scope: "scope",
    }[kind] ?? kind
  );
}

function truncateChip(s: string): string {
  if (s.length <= 50) return s;
  return s.slice(0, 47).trimEnd() + "…";
}

// ---------------- Launch tab ----------------

function LaunchTab({
  strategy,
  input,
}: {
  strategy: Strategy;
  input: ProductInput;
}) {
  return (
    <div className="flex flex-col gap-6">
      <TrackingReadinessBlock readiness={strategy.trackingReadiness} />
      <KpiLadderBlock ladder={strategy.kpiLadder} />
      <KpiDiagnosisBlock
        ladder={strategy.kpiLadder}
        diagnosis={strategy.kpiDiagnosis}
        input={input}
      />
      <AdReviewBlock checklist={strategy.adReview} />
    </div>
  );
}

function TrackingReadinessBlock({ readiness }: { readiness: TrackingReadinessScore }) {
  const tone =
    readiness.status === "ready"
      ? "border-emerald-500/40 text-emerald-300"
      : readiness.status === "almost"
      ? "border-amber-500/40 text-amber-300"
      : "border-rose-500/40 text-rose-300";
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>Tracking Readiness</SectionTitle>
      <p className="text-xs text-ink-400">
        Ten pre-flight checks against the measurement layer. Each check
        resolves from the inputs to passed / warning / blocker /
        unknown. The score drops 10 per blocker and 5 per warning.
      </p>
      <div className="hairline rounded-lg bg-ink-900 p-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-3xl font-semibold text-ink-50">
            {readiness.score}
            <span className="ml-1 text-base text-ink-400">/100</span>
          </p>
          <span
            className={`rounded-sm border bg-ink-900 px-2 py-0.5 text-xs ${tone}`}
          >
            {readiness.status}
          </span>
          <Tag>{readiness.blockers} blocker{readiness.blockers === 1 ? "" : "s"}</Tag>
          <Tag>{readiness.warnings} warning{readiness.warnings === 1 ? "" : "s"}</Tag>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {readiness.checks.map((c) => (
            <ReadinessRow key={c.kind} check={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReadinessRow({ check }: { check: TrackingReadinessCheck }) {
  const tone =
    check.status === "passed"
      ? "border-emerald-500/40 text-emerald-300"
      : check.status === "warning"
      ? "border-amber-500/40 text-amber-300"
      : check.status === "blocker"
      ? "border-rose-500/40 text-rose-300"
      : "border-ink-700 text-ink-300";
  return (
    <div className="rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-sm border bg-ink-900 px-1.5 py-0.5 text-xxs ${tone}`}>
          {check.status}
        </span>
        <p className="text-sm font-medium text-ink-100">{check.label}</p>
      </div>
      <p className="mt-1 text-xs text-ink-300">{check.rationale}</p>
      {check.fix ? (
        <p className="mt-1 text-xxs text-ink-400">
          <span className="text-ink-500">Fix: </span>
          {check.fix}
        </p>
      ) : null}
    </div>
  );
}

const KPI_DISPLAY_ORDER: KpiName[] = [
  "ctr",
  "cpc",
  "cpm",
  "cpa",
  "cvr",
  "roas",
  "hookRate",
  "holdRate",
];

const TIER_DISPLAY_ORDER: LadderTier[] = ["starter", "healthy", "scaling"];

function KpiLadderBlock({ ladder }: { ladder: KpiTargetLadder }) {
  // Index lookup.
  const byKey = new Map<string, KpiTarget>();
  for (const t of ladder.targets) {
    byKey.set(`${t.kpi}|${t.tier}`, t);
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>KPI Target Ladder</SectionTitle>
      <p className="text-xs text-ink-400">
        Eight KPIs × three tiers. Each cell carries a breakeven and a
        scaling threshold. Sit between them, do not increase budget.
        Cross the scaling threshold sustained, scale.
      </p>
      <div className="hairline overflow-x-auto rounded-lg bg-ink-900 p-3">
        <table className="w-full table-auto border-collapse text-xs">
          <thead>
            <tr className="border-b border-ink-800 text-ink-400">
              <th className="py-2 pr-3 text-left font-medium">KPI</th>
              {TIER_DISPLAY_ORDER.map((tier) => (
                <th
                  key={tier}
                  className="py-2 pr-3 text-left font-medium"
                  colSpan={2}
                >
                  {kpiTierLabel(tier)} (break / scale)
                </th>
              ))}
              <th className="py-2 pr-3 text-left font-medium">Direction</th>
            </tr>
          </thead>
          <tbody>
            {KPI_DISPLAY_ORDER.map((kpi) => (
              <tr key={kpi} className="border-b border-ink-900/60 align-top">
                <td className="py-2 pr-3 font-medium text-ink-100">
                  {kpiNameLabelUi(kpi)}
                </td>
                {TIER_DISPLAY_ORDER.map((tier) => {
                  const t = byKey.get(`${kpi}|${tier}`);
                  return (
                    <>
                      <td key={`${kpi}-${tier}-be`} className="py-2 pr-2 text-ink-200">
                        {t ? t.breakeven : "—"}
                      </td>
                      <td key={`${kpi}-${tier}-sc`} className="py-2 pr-3 text-ink-300">
                        {t ? t.scaling : "—"}
                      </td>
                    </>
                  );
                })}
                <td className="py-2 pr-3 text-xxs text-ink-400">
                  {ladder.targets.find((t) => t.kpi === kpi)?.direction ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiDiagnosisBlock({
  ladder,
  diagnosis,
  input,
}: {
  ladder: KpiTargetLadder;
  diagnosis: KpiDiagnosis;
  input: ProductInput;
}) {
  const [snap, setSnap] = useState<KpiSnapshot>(diagnosis.snapshot);

  const liveDiag = useMemo(
    () => diagnoseKpi(snap, ladder, input),
    [snap, ladder, input]
  );

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>KPI Diagnosis</SectionTitle>
      <p className="text-xs text-ink-400">
        Enter a live snapshot below. The deterministic decision tree
        infers the most likely bottleneck and a concrete next action. No
        data leaves the browser.
      </p>
      <div className="hairline rounded-lg bg-ink-900 p-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {KPI_DISPLAY_ORDER.map((kpi) => (
            <SnapshotField
              key={kpi}
              kpi={kpi}
              value={snap[kpi]}
              onChange={(v) => setSnap({ ...snap, [kpi]: v })}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-sm border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-ink-100">
            Primary: {kpiCategoryLabel(liveDiag.primaryCategory)}
          </span>
          <Tag>{liveDiag.findings.length} finding{liveDiag.findings.length === 1 ? "" : "s"}</Tag>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {liveDiag.findings.map((f, i) => (
            <div
              key={i}
              className="rounded-md border border-ink-800 bg-ink-950/40 p-3"
            >
              <p className="text-xs font-medium text-ink-100">
                {kpiCategoryLabel(f.category)} — {f.signal}
              </p>
              <p className="mt-1 text-xs text-ink-300">{f.inference}</p>
              <p className="mt-1 text-xxs text-ink-400">
                <span className="text-ink-500">Action: </span>
                {f.recommendedAction}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SnapshotField({
  kpi,
  value,
  onChange,
}: {
  kpi: KpiName;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xxs uppercase tracking-wide text-ink-400">
        {kpiNameLabelUi(kpi)}
      </span>
      <input
        type="number"
        step="0.01"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const t = e.target.value.trim();
          if (t === "") onChange(undefined);
          else {
            const n = Number(t);
            if (Number.isFinite(n)) onChange(n);
          }
        }}
        className="hairline rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-100"
      />
    </label>
  );
}

function AdReviewBlock({ checklist }: { checklist: AdReviewChecklist }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>Ad Review Checklist</SectionTitle>
      <p className="text-xs text-ink-400">
        A 15-axis pre-handoff checklist. Weights vary by campaign type
        and price tier so attention lands where it matters for the run.
        Walk through this before any spend.
      </p>
      <div className="hairline rounded-lg bg-ink-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{checklist.axes.length} axes</Tag>
            <Tag>Total weight: {checklist.totalWeight}</Tag>
            <span className="text-xxs text-ink-400">
              {open
                ? "Reference checklist — collapse to hide"
                : "Reference checklist — click to expand"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-200 hover:border-accent hover:text-white"
          >
            {open ? "Collapse" : "Expand checklist"}
          </button>
        </div>
        {open ? (
          <ul className="mt-3 flex flex-col gap-2">
            {checklist.axes.map((ax) => (
              <li
                key={ax.kind}
                className="rounded-md border border-ink-800 bg-ink-950/40 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
                    w{ax.weight}
                  </span>
                  <p className="text-sm font-medium text-ink-100">{ax.label}</p>
                </div>
                <p className="mt-1 text-xs text-ink-300">{ax.question}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function kpiNameLabelUi(name: KpiName): string {
  return (
    {
      ctr: "CTR (%)",
      cpc: "CPC",
      cpm: "CPM",
      cpa: "CPA",
      cvr: "CVR (%)",
      roas: "ROAS",
      hookRate: "Hook %",
      holdRate: "Hold %",
    }[name] ?? name
  );
}

function kpiTierLabel(tier: LadderTier): string {
  return (
    {
      starter: "Starter",
      healthy: "Healthy",
      scaling: "Scaling",
    }[tier] ?? tier
  );
}

function kpiCategoryLabel(cat: string): string {
  return (
    {
      creative: "Creative",
      "landing-page": "Landing page",
      offer: "Offer",
      audience: "Audience",
      tracking: "Tracking",
      fatigue: "Fatigue",
      healthy: "Healthy",
    }[cat] ?? cat
  );
}

// ---------------- CTA Bank ----------------

function CtaBankBlock({ bank }: { bank: CtaBank }) {
  if (bank.variants.length === 0) {
    return (
      <div className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-400">
        CTA bank is empty. Fill in audience, name, and category in the input
        panel to seed the bank.
      </div>
    );
  }
  const surfaces: CtaSurface[] = [
    "meta-feed",
    "meta-reels",
    "tiktok",
    "landing-primary",
    "email",
  ];
  return (
    <div className="flex flex-col gap-3">
      {surfaces.map((surface) => {
        const inSurface = bank.variants.filter((v) => v.surface === surface);
        if (inSurface.length === 0) return null;
        const surfaceCopy = inSurface
          .map((v) => `${ctaStyleLabelUi(v.style)}: ${v.text}`)
          .join("\n");
        return (
          <div
            key={surface}
            className="hairline relative rounded-lg bg-ink-900 p-4"
          >
            <div className="absolute right-3 top-3">
              <CopyMini text={surfaceCopy} />
            </div>
            <div className="flex flex-wrap items-center gap-2 pr-16">
              <span className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs uppercase tracking-wide text-ink-200">
                {ctaSurfaceLabelUi(surface)}
              </span>
              <Tag>{inSurface.length} variants</Tag>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {inSurface.map((v) => (
                <CtaVariantRow key={`${v.surface}-${v.style}`} variant={v} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CtaVariantRow({ variant }: { variant: CtaVariant }) {
  return (
    <div className="relative rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="absolute right-2 top-2">
        <CopyMini text={variant.text} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-12">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
          {ctaStyleLabelUi(variant.style)}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-50">{variant.text}</p>
      <p className="mt-1 text-xxs text-ink-400">{variant.rationale}</p>
    </div>
  );
}

function ctaStyleLabelUi(style: CtaStyle): string {
  return (
    {
      direct: "Direct",
      curious: "Curious",
      "time-boxed": "Time-boxed",
      "proof-led": "Proof-led",
      "low-pressure": "Low-pressure",
    }[style] ?? style
  );
}

function ctaSurfaceLabelUi(surface: CtaSurface): string {
  return (
    {
      "meta-feed": "Meta feed",
      "meta-reels": "Meta reels",
      tiktok: "TikTok",
      "landing-primary": "Landing primary",
      email: "Email",
    }[surface] ?? surface
  );
}

// ---------------- Static Briefs ----------------

function StaticBriefsBlock({ strategy }: { strategy: Strategy }) {
  if (strategy.staticBriefs.length === 0) {
    return (
      <div className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-400">
        No static briefs generated. Fill in audience pain and differentiator
        to seed the first-frame copy.
      </div>
    );
  }
  // Group by briefId.
  const grouped = new Map<string, StaticAdBrief[]>();
  for (const s of strategy.staticBriefs) {
    const list = grouped.get(s.briefId) ?? [];
    list.push(s);
    grouped.set(s.briefId, list);
  }
  return (
    <div className="flex flex-col gap-3">
      {Array.from(grouped.entries()).map(([briefId, statics]) => {
        const matched = strategy.creatorBriefs.find((b) => b.id === briefId);
        const angleRef = matched?.forAngle ?? briefId;
        return (
          <div
            key={briefId}
            className="hairline rounded-lg bg-ink-900 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs text-ink-200">
                {briefId}
              </span>
              <p className="text-sm font-medium text-ink-50">{angleRef}</p>
              <Tag>{statics.length} sizes</Tag>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {statics.map((s) => (
                <StaticSizeCard key={s.size} brief={s} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StaticSizeCard({ brief }: { brief: StaticAdBrief }) {
  const exportText = staticBriefToText(brief);
  return (
    <div className="relative rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="absolute right-2 top-2">
        <CopyMini text={exportText} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-12">
        <span className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-xxs uppercase tracking-wide text-ink-200">
          {brief.size}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-ink-50">
        {brief.headlineOverlay}
      </p>
      {brief.subOverlay ? (
        <p className="mt-1 text-xs text-ink-300">{brief.subOverlay}</p>
      ) : null}
      <div className="mt-3 space-y-2 text-xs">
        <KeyVal label="Hero" value={brief.heroElement} />
        <KeyVal label="Proof" value={brief.proofElement} />
        <KeyVal label="CTA" value={brief.ctaBadge} />
        <KeyVal label="Reading order" value={brief.visualHierarchy} />
      </div>
      <div className="mt-3">
        <p className="text-xxs uppercase tracking-wide text-ink-400">Layout</p>
        <ul className="mt-1 space-y-1 text-xs text-ink-100">
          {brief.layout.map((piece, i) => (
            <li key={i}>
              <span className="text-ink-400">[{piece.zone}]</span>{" "}
              {piece.copy}{" "}
              <span className="text-ink-500">— {piece.visualNote}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function KeyVal({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-ink-200">
      <span className="text-ink-400">{label}: </span>
      {value}
    </div>
  );
}

function staticBriefToText(brief: StaticAdBrief): string {
  const lines: string[] = [];
  lines.push(`Static brief ${brief.briefId} — ${brief.size}`);
  lines.push(`Angle: ${brief.forAngle}`);
  lines.push("");
  lines.push(`Headline: ${brief.headlineOverlay}`);
  if (brief.subOverlay) lines.push(`Sub: ${brief.subOverlay}`);
  lines.push(`Hero: ${brief.heroElement}`);
  lines.push(`Proof: ${brief.proofElement}`);
  lines.push(`CTA: ${brief.ctaBadge}`);
  lines.push(`Reading order: ${brief.visualHierarchy}`);
  lines.push("");
  lines.push("Layout:");
  for (const piece of brief.layout) {
    lines.push(`- [${piece.zone}] ${piece.copy} — ${piece.visualNote}`);
  }
  return lines.join("\n");
}

// ---------------- Creative QA ----------------

function AggregateQaSummary({ qa }: { qa: CreativeQA }) {
  if (qa.blockerCount === 0 && qa.warningCount === 0) {
    return (
      <div className="hairline rounded-lg border border-emerald-500/20 bg-ink-900 p-3 text-xs text-emerald-300">
        Aggregate Creative QA: all checks pass across briefs.
      </div>
    );
  }
  return (
    <div className="hairline rounded-lg bg-ink-900 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Aggregate QA
        </p>
        <span className="rounded-sm border border-rose-500/40 bg-rose-950/30 px-1.5 py-0.5 text-xxs text-rose-300">
          {qa.blockerCount} blocker{qa.blockerCount === 1 ? "" : "s"}
        </span>
        <span className="rounded-sm border border-amber-500/40 bg-amber-950/30 px-1.5 py-0.5 text-xxs text-amber-300">
          {qa.warningCount} warning{qa.warningCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function CreativeQaBlock({ qa }: { qa: CreativeQA }) {
  return (
    <div className="mt-4 rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Creative QA
        </p>
        <Tag>
          {qa.blockerCount} blocker{qa.blockerCount === 1 ? "" : "s"}
        </Tag>
        <Tag>
          {qa.warningCount} warning{qa.warningCount === 1 ? "" : "s"}
        </Tag>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {qa.findings.map((f) => (
          <QaChip key={f.rule} finding={f} />
        ))}
      </div>
    </div>
  );
}

function QaChip({ finding }: { finding: QaFinding }) {
  const [open, setOpen] = useState(false);
  const tone =
    finding.severity === "blocker"
      ? "border-rose-500/40 text-rose-200 bg-rose-950/30"
      : finding.severity === "warning"
      ? "border-amber-500/40 text-amber-200 bg-amber-950/30"
      : "border-emerald-500/40 text-emerald-200 bg-emerald-950/20";
  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-sm border px-1.5 py-0.5 text-xxs ${tone}`}
        title={`${finding.message} ${finding.suggestion ? "— " + finding.suggestion : ""}`}
      >
        {qaRuleLabel(finding.rule)} · {finding.severity}
      </button>
      {open ? (
        <div className="mt-1 max-w-sm rounded-sm border border-ink-800 bg-ink-950/80 p-2 text-xxs text-ink-200">
          <p>{finding.message}</p>
          {finding.suggestion ? (
            <p className="mt-1 text-ink-400">
              <span className="text-ink-500">Suggestion: </span>
              {finding.suggestion}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function qaRuleLabel(rule: string): string {
  return (
    {
      "hook-clarity": "Hook clarity",
      "proof-visibility": "Proof visibility",
      "offer-visibility": "Offer visibility",
      "cta-clarity": "CTA clarity",
      "first-frame-clarity": "First-frame clarity",
      "format-coverage": "Format coverage",
      "runtime-coherence": "Runtime coherence",
      "one-variable-testing": "One-variable testing",
      "visual-hierarchy": "Visual hierarchy",
      "message-angle-alignment": "Message-angle alignment",
      "audience-pain-present": "Audience pain present",
      "differentiation-present": "Differentiation present",
    }[rule] ?? rule
  );
}

// ---------------- Editor Handoff ----------------

function EditorHandoffBlock({ handoff }: { handoff: EditorHandoff }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 rounded-md border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Editor handoff
          </p>
          <Tag>
            {handoff.assetChecklist.length} deliverable{handoff.assetChecklist.length === 1 ? "" : "s"}
          </Tag>
        </div>
        <div className="flex items-center gap-2">
          <CopyMini text={handoff.markdown} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-200 hover:border-accent hover:text-white"
          >
            {open ? "Hide handoff" : "Copy editor handoff"}
          </button>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Asset checklist
        </p>
        <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-100">
          {handoff.assetChecklist.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
      {open ? (
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-sm border border-ink-800 bg-ink-950 p-3 text-xxs text-ink-200">
          {handoff.markdown}
        </pre>
      ) : null}
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
