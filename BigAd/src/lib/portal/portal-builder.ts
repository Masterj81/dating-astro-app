// portal-builder.ts — deterministic builder for the Shareable Client
// Portal.
//
// Pure function. No `Date.now()`, no I/O, no LLM, no mutation of any
// input. Same inputs → byte-identical `ClientPortalSnapshot`.
//
// `generatedAt` is the maximum of every stored timestamp the caller
// hands us (project.metadata.updatedAt, latest run.runAt,
// learningMemory.derivedAt, agency.selection.updatedAt). Each is
// normalized to epoch ms via `toEpochMs`. When nothing is available we
// fall back to 0 so the snapshot stays deterministic across SSR /
// memory-store fixtures.
//
// The portal SITS ABOVE the engine — `buildStrategy(input)` is
// byte-identical regardless of which fields the builder pulls. Section
// content is derived from the latest run's strategy plus the workspace
// state passed in.

import type { Strategy } from "@/types/strategy";
import type {
  LearningMemory,
  SavedProject,
  SavedRun,
} from "@/types/workspace";
import type {
  ReviewBoardSummary,
  ReviewComment,
  ReviewItem,
  ReviewItemKind,
} from "@/types/review";
import type { AgencySelection } from "@/types/agency";
import type {
  CampaignActualResult,
  ForecastAccuracyReport,
} from "@/types/results";
import {
  getPackage,
  getRole,
  getTemplate,
} from "@/lib/agency/catalog";
import type {
  ClientPortalSnapshot,
  PortalSection,
  PortalSectionId,
  PortalSharePack,
  PortalVisibilitySettings,
} from "@/types/portal";

// Canonical emission order — also the only iteration order the
// renderer trusts.
export const PORTAL_SECTION_ORDER: PortalSectionId[] = [
  "overview",
  "strategy-snapshot",
  "offer",
  "audience",
  "proof",
  "execution",
  "forecast",
  "simulator",
  "benchmarks",
  "review-status",
  "results",
  "next-actions",
];

const SECTION_TITLES: Record<PortalSectionId, string> = {
  overview: "Overview",
  "strategy-snapshot": "Strategy snapshot",
  offer: "Offer",
  audience: "Audience",
  proof: "Proof",
  execution: "Execution",
  forecast: "Forecast",
  simulator: "Simulator",
  benchmarks: "Benchmarks",
  "review-status": "Approval status",
  results: "Results",
  "next-actions": "Next actions",
};

// ---- Visibility helpers --------------------------------------------------

export function defaultPortalVisibility(): PortalVisibilitySettings {
  const sections = {} as Record<PortalSectionId, boolean>;
  for (const id of PORTAL_SECTION_ORDER) sections[id] = true;
  return {
    sections,
    hidePricing: false,
    // Internal references (project ids etc.) default to hidden — the
    // portal is a client-facing surface.
    hideInternalNotes: true,
    hideAssumptions: false,
  };
}

function isSectionVisible(
  visibility: PortalVisibilitySettings,
  id: PortalSectionId
): boolean {
  return visibility.sections[id] !== false;
}

// ---- generatedAt derivation ---------------------------------------------

function toEpochMs(value: string | number | undefined | null): number {
  if (value == null) return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  if (typeof value === "string" && value.length > 0) {
    const t = Date.parse(value);
    return Number.isFinite(t) && t > 0 ? t : 0;
  }
  return 0;
}

function maxStamp(values: Array<string | number | undefined | null>): number {
  let best = 0;
  for (const v of values) {
    const ms = toEpochMs(v);
    if (ms > best) best = ms;
  }
  return best;
}

// ---- Section builders ----------------------------------------------------

interface BuildContext {
  project: SavedProject;
  latestRun: SavedRun;
  runCount: number;
  strategy: Strategy;
  visibility: PortalVisibilitySettings;
  reviewSummary?: ReviewBoardSummary;
  reviewItems?: ReviewItem[];
  reviewComments?: ReviewComment[];
  agencyLabels: {
    template?: string;
    role?: string;
    pkg?: string;
    priceRangeUsd?: { min: number; max: number };
  };
  learningMemory?: LearningMemory;
  results?: CampaignActualResult[];
  accuracyReport?: ForecastAccuracyReport;
  generatedAtMs: number;
}

function isoFromEpoch(ms: number): string {
  if (ms <= 0) return "n/a";
  try {
    return new Date(ms).toISOString();
  } catch {
    return "n/a";
  }
}

function makeSection(
  id: PortalSectionId,
  summary: string,
  bullets: string[],
  highlight?: string
): PortalSection {
  return {
    id,
    title: SECTION_TITLES[id],
    summary,
    bullets: bullets.filter((b) => b && b.length > 0),
    highlight,
  };
}

function buildOverviewSection(ctx: BuildContext): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "overview")) return null;
  const bullets: string[] = [];
  bullets.push(`Project: ${ctx.project.metadata.name}`);
  bullets.push(`Runs captured: ${ctx.runCount}`);
  bullets.push(`Latest run: ${isoFromEpoch(ctx.generatedAtMs)}`);
  if (ctx.agencyLabels.pkg) {
    bullets.push(`Package: ${ctx.agencyLabels.pkg}`);
  } else if (ctx.agencyLabels.template) {
    bullets.push(`Template: ${ctx.agencyLabels.template}`);
  }
  return makeSection(
    "overview",
    "Engagement summary and where the campaign stands today.",
    bullets,
    ctx.agencyLabels.pkg ?? ctx.agencyLabels.template
  );
}

function buildStrategySnapshotSection(
  ctx: BuildContext
): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "strategy-snapshot")) return null;
  const s = ctx.strategy;
  const bullets: string[] = [];
  const audience = s.audienceAvatars?.[0]?.label || ctx.latestRun.input.audience;
  if (audience) bullets.push(`Audience: ${audience}`);
  const pain = s.audienceAvatars?.[0]?.corePain || ctx.latestRun.input.audiencePain;
  if (pain) bullets.push(`Core pain: ${pain}`);
  if (ctx.latestRun.input.differentiator) {
    bullets.push(`Differentiator: ${ctx.latestRun.input.differentiator}`);
  }
  const angle = s.angles?.[0]?.name;
  if (angle) bullets.push(`Leading angle: ${angle}`);
  if (s.kpiDiagnosis?.primaryCategory) {
    bullets.push(`Primary KPI gate: ${s.kpiDiagnosis.primaryCategory}`);
  }
  if (s.positioning?.statement) {
    bullets.push(`Positioning: ${s.positioning.statement}`);
  }
  return makeSection(
    "strategy-snapshot",
    "Strategy at a glance — audience, pain, differentiator, leading angle.",
    bullets.slice(0, 6)
  );
}

function buildOfferSection(ctx: BuildContext): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "offer")) return null;
  const s = ctx.strategy;
  const topOffer = s.offers?.[0];
  if (!topOffer) return null;
  const bullets: string[] = [];
  bullets.push(`Offer: ${topOffer.label}`);
  bullets.push(`Kind: ${topOffer.kind}`);
  // Pricing is scrubbed when hidePricing is set.
  if (!ctx.visibility.hidePricing) {
    if (ctx.latestRun.input.price) {
      bullets.push(`Price: ${ctx.latestRun.input.price}`);
    }
    if (typeof topOffer.breakevenROAS === "number") {
      bullets.push(`Breakeven ROAS: ${topOffer.breakevenROAS.toFixed(1)}x`);
    }
  }
  if (topOffer.rationale) {
    bullets.push(`Why: ${topOffer.rationale}`);
  }
  return makeSection(
    "offer",
    "Recommended offer and the economics behind it.",
    bullets.slice(0, 5)
  );
}

function buildAudienceSection(ctx: BuildContext): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "audience")) return null;
  const avatars = ctx.strategy.audienceAvatars ?? [];
  if (avatars.length === 0) return null;
  const bullets: string[] = [];
  for (const a of avatars.slice(0, 3)) {
    const pain = a.corePain ? ` — ${a.corePain}` : "";
    bullets.push(`${a.label}${pain}`);
  }
  // Surface top buying trigger from the lead avatar.
  const trigger = avatars[0]?.buyingTrigger;
  if (trigger) bullets.push(`Buying trigger: ${trigger}`);
  return makeSection(
    "audience",
    "Avatars the campaign is built for.",
    bullets.slice(0, 5)
  );
}

function buildProofSection(ctx: BuildContext): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "proof")) return null;
  const proof = ctx.strategy.proofAssetPlan;
  if (!proof) return null;
  const bullets: string[] = [];
  bullets.push(`Readiness: ${proof.proofReadinessScore}/100`);
  const mustHaves = proof.priorityAssets.filter(
    (a) => a.priority === "must-have"
  );
  for (const a of mustHaves.slice(0, 3)) {
    bullets.push(`Must-have: ${a.title}`);
  }
  if (proof.missingBeforeSpend.length > 0) {
    bullets.push(
      `Missing before spend: ${proof.missingBeforeSpend.length} asset(s)`
    );
  }
  return makeSection(
    "proof",
    "Proof assets the campaign depends on.",
    bullets.slice(0, 5),
    `Proof readiness ${proof.proofReadinessScore}/100`
  );
}

function buildExecutionSection(ctx: BuildContext): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "execution")) return null;
  const matrix = ctx.strategy.creativeTestingMatrix;
  if (!matrix) return null;
  const bullets: string[] = [];
  const firstBatch = matrix.recommendedFirstBatch ?? [];
  bullets.push(`First batch: ${firstBatch.length} cell(s)`);
  bullets.push(`Max concurrent tests: ${matrix.maxConcurrentTests}`);
  // Format roll-up.
  const formats = new Map<string, number>();
  for (const id of firstBatch) {
    const cell = matrix.testCells.find((c) => c.id === id);
    if (!cell) continue;
    formats.set(cell.format, (formats.get(cell.format) ?? 0) + 1);
  }
  const formatList = Array.from(formats.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([f, n]) => `${f} x${n}`)
    .join(", ");
  if (formatList) bullets.push(`Formats: ${formatList}`);
  const win = ctx.strategy.campaignCalendar?.windows?.[0];
  if (win) {
    bullets.push(
      `Window: ${win.label} (${win.durationDays}d, +${win.startOffsetDays})`
    );
  }
  if (ctx.strategy.campaignSetup?.namingConvention) {
    bullets.push(
      `Naming: ${ctx.strategy.campaignSetup.namingConvention}`
    );
  }
  return makeSection(
    "execution",
    "What ships first, where, and how it's organized.",
    bullets.slice(0, 6)
  );
}

function buildForecastSection(ctx: BuildContext): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "forecast")) return null;
  if (ctx.visibility.hideAssumptions) return null;
  const fc = ctx.strategy.forecast;
  if (!fc) return null;
  const bullets: string[] = [];
  bullets.push(
    `Total test budget: $${fc.budget.totalTestBudget.toLocaleString("en-US")}`
  );
  bullets.push(
    `Recommended daily: $${fc.budget.recommendedDailyBudget.toLocaleString(
      "en-US"
    )}`
  );
  bullets.push(
    `Duration: ${fc.budget.recommendedTestDurationDays} day(s)`
  );
  const base =
    fc.scenarios.find((s) => s.kind === "base") ?? fc.scenarios[0];
  if (base) {
    if (typeof base.outcome.expectedConversions === "number") {
      bullets.push(
        `Expected conversions (base): ${base.outcome.expectedConversions}`
      );
    }
    if (typeof base.outcome.expectedCpa === "number") {
      bullets.push(
        `Expected CPA (base): $${base.outcome.expectedCpa.toFixed(2)}`
      );
    }
    if (typeof base.outcome.expectedRoas === "number") {
      bullets.push(
        `Expected ROAS (base): ${base.outcome.expectedRoas.toFixed(2)}x`
      );
    }
  }
  return makeSection(
    "forecast",
    "What we're planning to spend and what we expect to see.",
    bullets.slice(0, 6)
  );
}

function buildSimulatorSection(ctx: BuildContext): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "simulator")) return null;
  if (ctx.visibility.hideAssumptions) return null;
  const sim = ctx.strategy.scenarioSimulator;
  if (!sim) return null;
  const bullets: string[] = [];
  bullets.push(`Base viability: ${sim.status}`);
  // Top 2 sensitivities by sensitivityScore desc, then lever alpha.
  const ranked = sim.sensitivities
    .slice()
    .sort((a, b) => {
      const s = b.sensitivityScore - a.sensitivityScore;
      return s === 0 ? a.lever.localeCompare(b.lever) : s;
    })
    .slice(0, 2);
  for (const s of ranked) {
    bullets.push(`Sensitive lever: ${s.lever} (${s.sensitivityScore}/100)`);
  }
  return makeSection(
    "simulator",
    "Where the plan is most exposed if assumptions break.",
    bullets.slice(0, 4)
  );
}

function buildBenchmarksSection(ctx: BuildContext): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "benchmarks")) return null;
  const bc = ctx.strategy.benchmarkCalibration;
  if (!bc) return null;
  const bullets: string[] = [];
  bullets.push(`Calibration status: ${bc.status}`);
  const top = bc.selectedProfiles?.[0];
  if (top) {
    bullets.push(
      `Top profile: ${top.profile.label} (fit ${top.fitScore}/100)`
    );
  }
  // 1-2 outlier metrics: status not "within-range" and not "no-benchmark".
  const outliers = bc.comparisons
    .filter(
      (c) => c.status !== "within-range" && c.status !== "no-benchmark"
    )
    .slice(0, 2);
  for (const o of outliers) {
    bullets.push(`Outlier metric: ${o.metric} — ${o.status}`);
  }
  return makeSection(
    "benchmarks",
    "How the plan compares to industry planning benchmarks.",
    bullets.slice(0, 4)
  );
}

function buildReviewStatusSection(
  ctx: BuildContext
): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "review-status")) return null;
  if (!ctx.reviewSummary) return null;
  const s = ctx.reviewSummary;
  const bullets: string[] = [];
  bullets.push(`Readiness: ${s.approvalReadiness}`);
  bullets.push(
    `Critical approved: ${s.criticalApproved} / ${s.criticalTotal}`
  );
  if (s.pendingCriticalKinds.length > 0) {
    bullets.push(
      `Pending: ${s.pendingCriticalKinds.slice(0, 3).join(", ")}`
    );
  }
  if (s.unresolvedComments > 0) {
    bullets.push(`Unresolved comments: ${s.unresolvedComments}`);
  }
  if (s.blockedItems > 0 || s.needsChangesItems > 0) {
    bullets.push(
      `Flagged items: ${s.blockedItems} blocked / ${s.needsChangesItems} needs-changes`
    );
  }
  return makeSection(
    "review-status",
    "Where the campaign sits in the approval cycle.",
    bullets.slice(0, 5),
    `Readiness: ${s.approvalReadiness}`
  );
}

function buildResultsSection(ctx: BuildContext): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "results")) return null;
  const r = ctx.accuracyReport;
  if (!r || r.perCell.length === 0) return null;
  const bullets: string[] = [];
  bullets.push(`Overall accuracy: ${r.overallAccuracy}`);
  bullets.push(
    `Total spend: $${r.totals.totalSpendUsd.toLocaleString("en-US")}`
  );
  bullets.push(`Total conversions: ${r.totals.totalConversions}`);
  if (typeof r.totals.weightedRoas === "number") {
    bullets.push(`Weighted ROAS: ${r.totals.weightedRoas.toFixed(2)}x`);
  }
  if (typeof r.totals.forecastWeightedRoas === "number") {
    bullets.push(
      `Forecast ROAS: ${r.totals.forecastWeightedRoas.toFixed(2)}x`
    );
  }
  const winners = r.recommendations.filter(
    (rec) => rec.decision === "scale"
  );
  if (winners.length > 0) {
    bullets.push(`Cells to scale: ${winners.length}`);
  }
  return makeSection(
    "results",
    "Actual campaign results versus the forecast.",
    bullets.slice(0, 6),
    `Accuracy: ${r.overallAccuracy}`
  );
}

function buildNextActionsSection(
  ctx: BuildContext,
  nextActions: string[]
): PortalSection | null {
  if (!isSectionVisible(ctx.visibility, "next-actions")) return null;
  if (nextActions.length === 0) return null;
  return makeSection(
    "next-actions",
    "What to do next, ordered by priority.",
    nextActions.slice(0, 6)
  );
}

// ---- Next actions derivation --------------------------------------------

function deriveNextActions(ctx: BuildContext): string[] {
  const out: string[] = [];

  // 1. Critical review approvals pending (top 3).
  if (ctx.reviewSummary && ctx.reviewSummary.pendingCriticalKinds.length > 0) {
    const pending = ctx.reviewSummary.pendingCriticalKinds.slice(0, 3);
    for (const kind of pending) {
      out.push(`Approve critical item: ${kind}`);
    }
  }

  // 2. Missing must-have proof assets (top 2).
  const proof = ctx.strategy.proofAssetPlan;
  if (proof && proof.missingBeforeSpend.length > 0) {
    const missingIds = proof.missingBeforeSpend.slice(0, 2);
    for (const id of missingIds) {
      const asset = proof.priorityAssets.find((a) => a.id === id);
      if (asset) {
        out.push(`Capture proof asset: ${asset.title}`);
      } else {
        out.push(`Capture proof asset: ${id}`);
      }
    }
  }

  // 3. Forecast budget gate issues (top 1).
  const fc = ctx.strategy.forecast;
  if (fc) {
    const issue = fc.warnings.find(
      (w) => w.severity === "blocker" || w.severity === "warning"
    );
    if (issue) {
      out.push(`Forecast: ${issue.fix}`);
    }
  }

  // 4. Result decisions of priority 'must-do' (top 3).
  if (ctx.accuracyReport) {
    const mustDo = ctx.accuracyReport.recommendations
      .filter((r) => r.priority === "must-do")
      .slice(0, 3);
    for (const rec of mustDo) {
      out.push(`${rec.decision.toUpperCase()} ${rec.cellId}: ${rec.rationale}`);
    }
  }

  return out;
}

// ---- Decision log derivation --------------------------------------------

function deriveDecisionLog(
  ctx: BuildContext
): Array<{ title: string; detail: string }> {
  const out: Array<{ title: string; detail: string }> = [];
  const s = ctx.strategy;

  if (s.positioning?.statement) {
    out.push({
      title: "Positioning chosen",
      detail: s.positioning.statement,
    });
  }
  const topAngle = s.angles?.[0];
  if (topAngle) {
    out.push({
      title: "Leading angle",
      detail: `${topAngle.name} — ${topAngle.hook}`,
    });
  }
  const topOffer = s.offers?.[0];
  if (topOffer) {
    out.push({
      title: "Offer recommendation",
      detail: `${topOffer.kind}: ${topOffer.label}`,
    });
  }
  const win = s.campaignCalendar?.windows?.[0];
  if (win) {
    out.push({
      title: "Campaign window",
      detail: `${win.label} — ${win.durationDays} day(s) starting day +${win.startOffsetDays}`,
    });
  }
  if (s.journeyStatus) {
    out.push({
      title: `Stage: ${s.journeyStatus.currentStage}`,
      detail: s.journeyStatus.nextStep,
    });
  }
  if (s.trackingReadiness) {
    out.push({
      title: `Tracking: ${s.trackingReadiness.status}`,
      detail: `Score ${s.trackingReadiness.score}/100 — ${s.trackingReadiness.blockers} blocker(s), ${s.trackingReadiness.warnings} warning(s).`,
    });
  }
  if (s.kpiDiagnosis) {
    const finding = s.kpiDiagnosis.findings?.[0];
    out.push({
      title: `KPI gate: ${s.kpiDiagnosis.primaryCategory}`,
      detail: finding
        ? finding.inference
        : "Primary performance gate.",
    });
  }
  return out.slice(0, 8);
}

// ---- Learning roll-up ---------------------------------------------------

function buildLearningRollup(
  learningMemory: LearningMemory | undefined
): ClientPortalSnapshot["learning"] {
  if (!learningMemory || learningMemory.learnings.length === 0) return undefined;
  // Top 3 high-confidence learnings — ordering already deterministic in
  // the memory derivation (signal order).
  const top = learningMemory.learnings
    .filter((l) => l.confidence === "high")
    .slice(0, 3)
    .map((l) => l.evidence);
  return {
    fromResultCount: learningMemory.fromResultCount,
    headlineLearnings: top,
  };
}

// ---- Approvals roll-up --------------------------------------------------

function buildApprovalsRollup(
  reviewSummary: ReviewBoardSummary | undefined
): ClientPortalSnapshot["approvals"] {
  if (!reviewSummary) {
    return {
      readiness: "not-ready",
      criticalApproved: 0,
      criticalTotal: 6,
      pendingKinds: [],
      unresolvedComments: 0,
    };
  }
  return {
    readiness: reviewSummary.approvalReadiness,
    criticalApproved: reviewSummary.criticalApproved,
    criticalTotal: reviewSummary.criticalTotal,
    pendingKinds: reviewSummary.pendingCriticalKinds.slice() as ReviewItemKind[],
    unresolvedComments: reviewSummary.unresolvedComments,
  };
}

// ---- Results roll-up ----------------------------------------------------

function buildResultsRollup(
  accuracyReport: ForecastAccuracyReport | undefined
): ClientPortalSnapshot["results"] {
  if (!accuracyReport || accuracyReport.perCell.length === 0) return undefined;
  return {
    overallAccuracy: accuracyReport.overallAccuracy,
    totalSpendUsd: accuracyReport.totals.totalSpendUsd,
    totalConversions: accuracyReport.totals.totalConversions,
    weightedRoas: accuracyReport.totals.weightedRoas,
    forecastWeightedRoas: accuracyReport.totals.forecastWeightedRoas,
    perCellCount: accuracyReport.perCell.length,
  };
}

// ---- Agency labels lookup -----------------------------------------------

function resolveAgencyLabels(
  selection: AgencySelection | undefined
): BuildContext["agencyLabels"] {
  if (!selection) return {};
  const out: BuildContext["agencyLabels"] = {};
  if (selection.templateId) {
    try {
      out.template = getTemplate(selection.templateId).label;
    } catch {
      // unknown template id — leave unset
    }
  }
  if (selection.roleId) {
    try {
      out.role = getRole(selection.roleId).label;
    } catch {
      // unknown role id — leave unset
    }
  }
  if (selection.packageId) {
    try {
      const pkg = getPackage(selection.packageId);
      out.pkg = pkg.label;
      out.priceRangeUsd = pkg.priceRangeUsd;
    } catch {
      // unknown package id — leave unset
    }
  }
  return out;
}

// ---- Overview headline --------------------------------------------------

function buildOverviewHeadline(ctx: BuildContext): string {
  const projectName = ctx.project.metadata.name;
  const template =
    ctx.agencyLabels.template ??
    ctx.latestRun.input.campaignType ??
    "campaign";
  const audience =
    ctx.strategy.audienceAvatars?.[0]?.label ||
    ctx.latestRun.input.audience ||
    "the target audience";
  return `${projectName} — ${template} for ${audience}.`;
}

// ---- Builder ------------------------------------------------------------

export interface BuildClientPortalSnapshotInput {
  project: SavedProject;
  runs: SavedRun[]; // sorted newest-first; runs[0] is the latest
  strategy?: Strategy; // optional override; defaults to runs[0].strategy
  reviewSummary?: ReviewBoardSummary;
  reviewItems?: ReviewItem[];
  reviewComments?: ReviewComment[];
  agencySelection?: AgencySelection;
  learningMemory?: LearningMemory;
  results?: CampaignActualResult[];
  accuracyReport?: ForecastAccuracyReport;
  visibility?: PortalVisibilitySettings;
}

export function buildClientPortalSnapshot(
  input: BuildClientPortalSnapshotInput
): ClientPortalSnapshot {
  const { project, runs } = input;
  if (!project) {
    throw new Error("buildClientPortalSnapshot: project is required");
  }
  // Empty-state path — when no runs are passed in, return a placeholder
  // snapshot with no sections rather than throwing. The renderer walks
  // `sections` and emits a graceful headline-only document so the
  // surface never crashes the browser tab.
  if (!runs || runs.length === 0) {
    const visibility = input.visibility ?? defaultPortalVisibility();
    return {
      projectId: project.metadata.id,
      projectName: project.metadata.name,
      generatedAt: maxStamp([
        project.metadata.updatedAt,
        project.metadata.createdAt,
        project.metadata.lastRunAt,
      ]),
      overviewHeadline:
        `${project.metadata.name} — No CampaignOS project run yet.`,
      sections: [],
      visibility,
      nextActions: [],
      decisionLog: [],
      approvals: {
        readiness: "not-ready",
        criticalApproved: 0,
        criticalTotal: 0,
        pendingKinds: [],
        unresolvedComments: 0,
      },
    };
  }

  const latestRun = runs[0];
  const strategy = input.strategy ?? latestRun.strategy;
  const visibility = input.visibility ?? defaultPortalVisibility();
  const agencyLabels = resolveAgencyLabels(input.agencySelection);

  // generatedAt — max across every stored timestamp surfaced to us.
  const generatedAtMs = maxStamp([
    project.metadata.updatedAt,
    project.metadata.createdAt,
    project.metadata.lastRunAt,
    latestRun.runAt,
    input.learningMemory?.derivedAt,
    input.agencySelection?.updatedAt,
    input.reviewSummary?.derivedAt,
  ]);

  const ctx: BuildContext = {
    project,
    latestRun,
    runCount: runs.length,
    strategy,
    visibility,
    reviewSummary: input.reviewSummary,
    reviewItems: input.reviewItems,
    reviewComments: input.reviewComments,
    agencyLabels,
    learningMemory: input.learningMemory,
    results: input.results,
    accuracyReport: input.accuracyReport,
    generatedAtMs,
  };

  // Build sections in canonical order. Drop nulls (gated by visibility
  // or content).
  const nextActions = deriveNextActions(ctx);
  const candidates: Array<PortalSection | null> = [
    buildOverviewSection(ctx),
    buildStrategySnapshotSection(ctx),
    buildOfferSection(ctx),
    buildAudienceSection(ctx),
    buildProofSection(ctx),
    buildExecutionSection(ctx),
    buildForecastSection(ctx),
    buildSimulatorSection(ctx),
    buildBenchmarksSection(ctx),
    buildReviewStatusSection(ctx),
    buildResultsSection(ctx),
    buildNextActionsSection(ctx, nextActions),
  ];

  // Drop sections without bullets (empty content → section absent).
  const sections: PortalSection[] = [];
  for (const c of candidates) {
    if (!c) continue;
    if (c.bullets.length === 0) continue;
    sections.push(c);
  }

  const overviewHeadline = buildOverviewHeadline(ctx);
  const decisionLog = deriveDecisionLog(ctx);
  const approvals = buildApprovalsRollup(ctx.reviewSummary);
  const resultsRollup = buildResultsRollup(ctx.accuracyReport);
  const learning = buildLearningRollup(ctx.learningMemory);

  const snapshot: ClientPortalSnapshot = {
    projectId: project.metadata.id,
    projectName: project.metadata.name,
    generatedAt: generatedAtMs,
    overviewHeadline,
    sections,
    visibility,
    nextActions,
    decisionLog,
    approvals,
    results: resultsRollup,
    agency:
      agencyLabels.template || agencyLabels.role || agencyLabels.pkg
        ? {
            templateLabel: agencyLabels.template,
            roleLabel: agencyLabels.role,
            packageLabel: agencyLabels.pkg,
            priceRangeUsd: agencyLabels.priceRangeUsd,
          }
        : undefined,
    learning,
  };

  return snapshot;
}

// ---- Share pack convenience --------------------------------------------

export function buildPortalSharePack(
  snapshot: ClientPortalSnapshot,
  markdown: string
): PortalSharePack {
  const lead = snapshot.overviewHeadline;
  const top = snapshot.nextActions.slice(0, 3);
  const oneLiner =
    top.length > 0 ? `${lead} Next: ${top.join(" · ")}` : lead;
  return {
    snapshot,
    markdown,
    oneLiner,
  };
}
