// report-builder.ts — deterministic builder for the Client-Ready Report.
//
// Pure function. No `Date.now()`, no I/O, no LLM. Same inputs → byte-
// identical ClientReport.
//
// `generatedAt` is derived from max(updatedAt) across the included runs
// and results. When the caller has no timestamps (e.g. in tests) they
// can override it via the `generatedAt` arg.
//
// The builder draws every section from a primary run's `Strategy`. Other
// runs (up to 2 prior) are included only when a comparison is enabled.
// Test results, learning memory, decision log and next actions all come
// from workspace state that the caller passes in.

import type {
  AudienceAvatar,
  CampaignWindow,
  OfferRecommendation,
  Strategy,
} from "@/types/strategy";
import type {
  Learning,
  LearningMemory,
  SavedProject,
  SavedRun,
  TestResult,
} from "@/types/workspace";
import { buildRunComparison } from "@/lib/workspace/learning";
import { windowKindLabel } from "@/lib/engine/calendar";
import type {
  ClientReport,
  DecisionLogEntry,
  ExecutiveSummary,
  NextActionCategory,
  NextActionItem,
  NextActionOwner,
  ReportSectionKind,
  ReportSectionToggle,
  StrategySnapshot,
  StrategySnapshotItem,
} from "@/types/report";

export const REPORT_SECTION_ORDER: ReportSectionKind[] = [
  "executive-summary",
  "strategy-snapshot",
  "input-quality",
  "proof-plan",
  "execution-plan",
  "campaign-setup",
  "test-results",
  "learning-memory",
  "decision-log",
  "next-actions",
];

export interface BuildReportArgs {
  project: SavedProject;
  runs: SavedRun[]; // ordered newest-first; primary = runs[0]
  testResults: TestResult[]; // for the runs included
  learningMemory: LearningMemory;
  toggles?: Partial<Record<ReportSectionKind, boolean>>; // default: all enabled
  generatedAt?: string; // override for tests; otherwise derived
}

// ---- Helpers --------------------------------------------------------------

function resolveToggles(
  toggles: Partial<Record<ReportSectionKind, boolean>> | undefined
): ReportSectionToggle[] {
  return REPORT_SECTION_ORDER.map((kind) => ({
    kind,
    enabled: toggles && toggles[kind] === false ? false : true,
  }));
}

function isEnabled(toggles: ReportSectionToggle[], kind: ReportSectionKind): boolean {
  const t = toggles.find((x) => x.kind === kind);
  return t ? t.enabled : true;
}

function clampBullet(text: string): string {
  // <= 24 words. Hard cap by word count, joined back; never split a
  // sentence mid-token. Trailing punctuation preserved when possible.
  const words = text.trim().split(/\s+/);
  if (words.length <= 24) return text.trim();
  return words.slice(0, 24).join(" ");
}

function pickPrimaryAvatar(
  avatars: AudienceAvatar[]
): AudienceAvatar | null {
  if (!avatars || avatars.length === 0) return null;
  // The avatar with the most proof items is the most demanding —
  // surfacing it first sets reader expectations for budget.
  const sorted = avatars.slice().sort((a, b) => {
    const aN = (a.proofNeeded?.length ?? 0) - (b.proofNeeded?.length ?? 0);
    return aN === 0 ? a.id.localeCompare(b.id) : aN < 0 ? 1 : -1;
  });
  return sorted[0] ?? null;
}

function formatTopOffer(offer: OfferRecommendation | undefined): string {
  if (!offer) return "—";
  const br =
    offer.breakevenROAS == null
      ? ""
      : ` · breakeven ${offer.breakevenROAS.toFixed(1)}x`;
  return `${offer.kind}: ${offer.label}${br}`;
}

function formatCampaignWindow(window: CampaignWindow | undefined): string {
  if (!window) return "—";
  return `${window.label} (day +${window.startOffsetDays}, ${window.durationDays}d)`;
}

function maxUpdatedAt(runs: SavedRun[], results: TestResult[]): string {
  // Walk both arrays for the freshest ISO-8601 string. ISO-8601 strings
  // sort lexicographically, so a plain string compare is enough.
  let best = "1970-01-01T00:00:00.000Z";
  for (const r of runs) {
    if (r.runAt && r.runAt > best) best = r.runAt;
  }
  for (const r of results) {
    const ts = r.updatedAt || r.createdAt;
    if (ts && ts > best) best = ts;
  }
  return best;
}

// ---- Executive Summary ----------------------------------------------------

function buildExecutiveSummary(
  primary: SavedRun,
  results: TestResult[],
  learning: LearningMemory,
  comparison: ReturnType<typeof buildRunComparison> | null,
  hasBlocker: boolean
): ExecutiveSummary {
  const s: Strategy = primary.strategy;
  const bullets: string[] = [];

  // 1. Quality score.
  const ovr = s.score?.overall;
  if (typeof ovr === "number") {
    const status = ovr >= 75 ? "strong" : ovr >= 55 ? "okay" : "weak";
    bullets.push(clampBullet(`Quality score ${ovr}/100 — ${status} inputs.`));
  }

  // 2. Top angle.
  const topAngle = s.angles?.[0]?.name;
  if (topAngle) bullets.push(clampBullet(`Leading with: ${topAngle}.`));

  // 3. Top offer.
  const topOffer = s.offers?.[0];
  if (topOffer) {
    const br =
      topOffer.breakevenROAS == null
        ? "no breakeven set"
        : `breakeven ${topOffer.breakevenROAS.toFixed(1)}x`;
    bullets.push(
      clampBullet(`Recommended offer: ${topOffer.kind} — ${br}.`)
    );
  }

  // 4. Current/next campaign window.
  const win = s.campaignCalendar?.windows?.[0];
  if (win) {
    bullets.push(
      clampBullet(
        `Next window: ${win.kind} for ${win.durationDays} days starting day +${win.startOffsetDays}.`
      )
    );
  }

  // 5. Audience avatar with the most must-have proofs.
  const avatar = pickPrimaryAvatar(s.audienceAvatars ?? []);
  if (avatar) {
    bullets.push(clampBullet(`Audience focus: ${avatar.label}.`));
  }

  // 6. Tracking readiness.
  const tr = s.trackingReadiness;
  if (tr) {
    bullets.push(
      clampBullet(`Tracking: ${tr.status} (${tr.score}/100).`)
    );
  }

  // 7. Proof readiness.
  const proof = s.proofAssetPlan;
  if (proof) {
    const score = proof.proofReadinessScore;
    const status =
      score >= 70 ? "ready" : score >= 50 ? "partial" : "thin";
    bullets.push(
      clampBullet(`Proof readiness: ${status} (${score}/100).`)
    );
  }

  // 8. KPI diagnosis primary category.
  const kpi = s.kpiDiagnosis;
  if (kpi) {
    bullets.push(
      clampBullet(`Performance gate: ${kpi.primaryCategory}.`)
    );
  }

  // 9. Test results summary.
  if (results.length > 0) {
    let wins = 0;
    let losses = 0;
    let inconc = 0;
    for (const r of results) {
      if (r.status === "winning") wins++;
      else if (r.status === "losing" || r.status === "killed-early") losses++;
      else if (r.status === "inconclusive") inconc++;
    }
    bullets.push(
      clampBullet(
        `Tests: ${wins} winning, ${losses} losing, ${inconc} inconclusive.`
      )
    );
  }

  // 10. Top learning.
  if (learning.learnings.length > 0) {
    const top = learning.learnings[0];
    bullets.push(
      clampBullet(
        `Strongest pattern: ${top.subject} (${top.confidence}).`
      )
    );
  }

  // 11. Journey stage.
  const js = s.journeyStatus;
  if (js) {
    const tail = hasBlocker
      ? "paused — blocker present"
      : js.readyToSpend
      ? "ready"
      : "not ready";
    bullets.push(clampBullet(`Stage: ${js.currentStage} — ${tail}.`));
  }

  // 12. Comparison delta.
  if (comparison && comparison.previous) {
    bullets.push(
      clampBullet(
        `Run delta: ${comparison.changedFields.length} fields changed since previous.`
      )
    );
  }

  return { bullets: bullets.slice(0, 12) };
}

// ---- Strategy Snapshot ----------------------------------------------------

function buildStrategySnapshot(primary: SavedRun): StrategySnapshot {
  const s: Strategy = primary.strategy;
  const positioning = s.positioning?.statement || "—";
  const topAngleName = s.angles?.[0]?.name || s.angles?.[0]?.hook || "—";
  const topOffer = formatTopOffer(s.offers?.[0]);
  const window = formatCampaignWindow(s.campaignCalendar?.windows?.[0]);
  const audience = s.audienceAvatars?.[0]?.label || "—";

  const items: StrategySnapshotItem[] = [];
  const input = primary.input;
  items.push({ label: "Business model", value: input.businessModel });
  items.push({ label: "Price", value: input.price || "—" });
  items.push({
    label: "Campaign type",
    value: input.campaignType || "always-on",
  });
  items.push({ label: "Awareness", value: input.awareness });
  items.push({ label: "Sophistication", value: input.sophistication });
  if (input.name) {
    items.push({ label: "Business name", value: input.name });
  }
  const topConcept = s.adConceptCards?.[0];
  if (topConcept) {
    items.push({ label: "Top concept", value: topConcept.name });
  }
  const topHook = s.hookLibrary?.items?.[0];
  if (topHook) {
    items.push({ label: "Top hook pattern", value: topHook.pattern });
  }
  const arch = s.campaignCalendar?.windows?.[0]?.recommendedArchitecture;
  if (arch) {
    items.push({ label: "Architecture", value: arch.kind });
  }
  if (s.kpiDiagnosis) {
    items.push({
      label: "KPI primary",
      value: s.kpiDiagnosis.primaryCategory,
    });
  }
  // Cap at 10.
  const trimmed = items.slice(0, 10);

  return {
    positioning,
    topAngle: topAngleName,
    topOffer,
    campaignWindow: window,
    audience,
    items: trimmed,
  };
}

// ---- Decision Log ---------------------------------------------------------

const SEVERITY_RANK: Record<DecisionLogEntry["severity"], number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

const SOURCE_RANK: Record<DecisionLogEntry["source"], number> = {
  tracking: 0,
  proof: 1,
  "kpi-diagnosis": 2,
  "test-result": 3,
  "learning-memory": 4,
};

function buildDecisionLog(
  primary: SavedRun,
  results: TestResult[],
  learning: LearningMemory
): DecisionLogEntry[] {
  const s: Strategy = primary.strategy;
  const log: DecisionLogEntry[] = [];
  let counter = 0;
  const nextId = () => {
    counter++;
    return `dec-${counter}`;
  };

  // 1. Tracking — score < 70 → blocker.
  if (s.trackingReadiness && s.trackingReadiness.score < 70) {
    const failed = s.trackingReadiness.checks
      .filter((c) => c.status === "blocker" || c.status === "warning")
      .map((c) => c.kind);
    log.push({
      id: nextId(),
      source: "tracking",
      decision: "Pause spend until tracking gates pass.",
      rationale: `Tracking readiness is ${s.trackingReadiness.score}/100 — ${s.trackingReadiness.blockers} blocker(s), ${s.trackingReadiness.warnings} warning(s).`,
      severity: "blocker",
      relatedIds: failed.length > 0 ? failed : undefined,
    });
  }

  // 2. Proof readiness < 50 with must-have missing → warning.
  if (s.proofAssetPlan) {
    const score = s.proofAssetPlan.proofReadinessScore;
    const missing = s.proofAssetPlan.missingBeforeSpend ?? [];
    if (score < 50 && missing.length > 0) {
      log.push({
        id: nextId(),
        source: "proof",
        decision: "Capture missing proof assets before next test batch.",
        rationale: `Proof readiness is ${score}/100 with ${missing.length} must-have(s) missing.`,
        severity: "warning",
        relatedIds: missing,
      });
    }
  }

  // 3. KPI diagnosis primaryCategory !== healthy → warning.
  if (s.kpiDiagnosis && s.kpiDiagnosis.primaryCategory !== "healthy") {
    log.push({
      id: nextId(),
      source: "kpi-diagnosis",
      decision: `Address ${s.kpiDiagnosis.primaryCategory} bottleneck before scaling spend.`,
      rationale: `KPI diagnosis points to ${s.kpiDiagnosis.primaryCategory} as the binding constraint.`,
      severity: "warning",
    });
  }

  // 4. Per-result decisions. Sort by id so output is stable.
  const recommended = new Set<string>(
    s.creativeTestingMatrix?.recommendedFirstBatch ?? []
  );
  const sortedResults = results.slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const r of sortedResults) {
    if (r.status === "winning" && recommended.has(r.testCellId)) {
      log.push({
        id: nextId(),
        source: "test-result",
        decision: `Promote winning cell ${r.testCellId} to engaged-60d retargeting.`,
        rationale: "Cell sits in the recommended first batch and is logged as winning.",
        severity: "info",
        relatedIds: [r.testCellId],
      });
    } else if (r.status === "losing" || r.status === "killed-early") {
      log.push({
        id: nextId(),
        source: "test-result",
        decision: `Retire cell ${r.testCellId} from rotation.`,
        rationale: `Cell logged as ${r.status}.`,
        severity: "info",
        relatedIds: [r.testCellId],
      });
    }
  }

  // 5. High-confidence learnings.
  for (const l of learning.learnings) {
    if (l.confidence !== "high") continue;
    if (l.signal.endsWith("-winning")) {
      log.push({
        id: nextId(),
        source: "learning-memory",
        decision: `Double down on ${l.subject} (${l.signal}).`,
        rationale: l.evidence,
        severity: "info",
        relatedIds: l.supportingResultIds,
      });
    } else if (l.signal.endsWith("-losing")) {
      log.push({
        id: nextId(),
        source: "learning-memory",
        decision: `Avoid ${l.subject} (${l.signal}) in next batch.`,
        rationale: l.evidence,
        severity: "warning",
        relatedIds: l.supportingResultIds,
      });
    }
  }

  // Stable sort: severity (blocker → warning → info) then source rank.
  log.sort((a, b) => {
    const s1 = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s1 !== 0) return s1;
    return SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
  });

  return log;
}

// ---- Next Actions ---------------------------------------------------------

const CATEGORY_RANK: Record<NextActionCategory, number> = {
  produce: 0,
  test: 1,
  decide: 2,
  measure: 3,
  operate: 4,
};

function ownerFor(category: NextActionCategory): NextActionOwner | undefined {
  if (category === "produce") return "creator";
  if (category === "test") return "media-buyer";
  if (category === "decide") return "founder";
  if (category === "measure") return "media-buyer";
  return undefined;
}

function buildNextActions(
  primary: SavedRun,
  results: TestResult[],
  learning: LearningMemory,
  decisionLog: DecisionLogEntry[]
): NextActionItem[] {
  const s: Strategy = primary.strategy;
  // Bucket by category. Blockers ride above produce in the final ordering
  // even though they technically map to "operate".
  const blockerActions: NextActionItem[] = [];
  const buckets: Record<NextActionCategory, NextActionItem[]> = {
    produce: [],
    test: [],
    decide: [],
    measure: [],
    operate: [],
  };

  let counter = 0;
  const mkId = (): string => {
    counter++;
    return `act-${counter}`;
  };

  // 1. One action per blocker in decisionLog → operate, S.
  for (const d of decisionLog) {
    if (d.severity !== "blocker") continue;
    blockerActions.push({
      id: mkId(),
      title: d.decision,
      category: "operate",
      effort: "S",
      owner: ownerFor("operate"),
      why: d.rationale,
    });
  }

  // 2. Missing must-have proof assets → produce, M, creator.
  const missing = s.proofAssetPlan?.missingBeforeSpend ?? [];
  for (const id of missing) {
    const asset = s.proofAssetPlan?.priorityAssets.find((a) => a.id === id);
    if (!asset) continue;
    buckets.produce.push({
      id: mkId(),
      title: `Capture ${asset.type}: ${asset.title}`,
      category: "produce",
      effort: "M",
      owner: ownerFor("produce"),
      why: asset.whyItMatters,
    });
  }

  // 3. Weak-hook iteration recommendation → test, S.
  const iter = s.nextIterationPlan?.recommendations ?? [];
  for (const rec of iter) {
    if (rec.signal !== "weak-hook") continue;
    buckets.test.push({
      id: mkId(),
      title: "Test fresh hook angles for the weak-hook signal.",
      category: "test",
      effort: "S",
      owner: ownerFor("test"),
      why: rec.diagnosis,
    });
  }

  // 4. recommendedFirstBatch cells without test results yet → test, S.
  const have = new Set<string>(results.map((r) => r.testCellId));
  const firstBatch = s.creativeTestingMatrix?.recommendedFirstBatch ?? [];
  for (const cellId of firstBatch) {
    if (have.has(cellId)) continue;
    buckets.test.push({
      id: mkId(),
      title: `Launch test cell ${cellId} from the first batch.`,
      category: "test",
      effort: "S",
      owner: ownerFor("test"),
      why: "Cell is in the recommended first batch and has no logged result yet.",
    });
  }

  // 5. High-confidence winning learning → decide, S.
  for (const l of learning.learnings) {
    if (l.confidence !== "high") continue;
    if (!l.signal.endsWith("-winning")) continue;
    buckets.decide.push({
      id: mkId(),
      title: `Increase budget allocation to ${l.subject}.`,
      category: "decide",
      effort: "S",
      owner: ownerFor("decide"),
      why: l.evidence,
    });
  }

  // Deterministic ordering: blockers → produce → test → decide → measure → operate.
  const ordered: NextActionItem[] = [];
  ordered.push(...blockerActions);
  const order: NextActionCategory[] = [
    "produce",
    "test",
    "decide",
    "measure",
    "operate",
  ];
  for (const cat of order) {
    // Bucket entries are pushed in source order — keep that for determinism.
    ordered.push(...buckets[cat]);
  }

  // Cap at 10. Re-assign ids so the final list reads act-1..act-N.
  const capped = ordered.slice(0, 10).map((item, i) => ({
    ...item,
    id: `act-${i + 1}`,
  }));

  // Silence unused-bucket lint when ordering is reshuffled.
  void CATEGORY_RANK;

  return capped;
}

// ---- Builder --------------------------------------------------------------

export function buildClientReport(args: BuildReportArgs): ClientReport {
  const { project, runs, testResults, learningMemory } = args;
  if (!runs || runs.length === 0) {
    throw new Error("buildClientReport: requires at least one run");
  }

  const toggles = resolveToggles(args.toggles);

  // Cap included runs at 3, primary = runs[0].
  const includedRuns = runs.slice(0, 3);
  const primary = includedRuns[0];

  // Filter results down to the runs we're including so the report is
  // self-consistent. Without this a deleted run could still show results.
  const includedRunIds = new Set(includedRuns.map((r) => r.id));
  const filteredResults = testResults.filter((r) => includedRunIds.has(r.runId));

  // Comparison: only when 2+ runs are included AND the test-results
  // toggle isn't the controlling toggle. Comparison itself is gated by
  // the executive-summary toggle implicitly (it shows up in the summary
  // bullets), but the structural data is always available to callers.
  const comparison =
    includedRuns.length > 1
      ? buildRunComparison(includedRuns[0], includedRuns[1])
      : null;

  const hasBlocker =
    (primary.strategy.trackingReadiness?.score ?? 100) < 70;

  const decisionLog = isEnabled(toggles, "decision-log")
    ? buildDecisionLog(primary, filteredResults, learningMemory)
    : [];

  const nextActions = isEnabled(toggles, "next-actions")
    ? buildNextActions(primary, filteredResults, learningMemory, decisionLog)
    : [];

  const executiveSummary = isEnabled(toggles, "executive-summary")
    ? buildExecutiveSummary(
        primary,
        filteredResults,
        learningMemory,
        comparison,
        hasBlocker
      )
    : { bullets: [] };

  const strategySnapshot = isEnabled(toggles, "strategy-snapshot")
    ? buildStrategySnapshot(primary)
    : {
        positioning: "",
        topAngle: "",
        topOffer: "",
        campaignWindow: "",
        audience: "",
        items: [],
      };

  const inputQuality = primary.strategy.inputQuality;
  const proofPlan = primary.strategy.proofAssetPlan;
  const matrix = primary.strategy.creativeTestingMatrix;
  const campaignSetup = primary.strategy.campaignSetup;
  const iterationPlan = primary.strategy.nextIterationPlan;

  const generatedAt =
    args.generatedAt ?? maxUpdatedAt(includedRuns, filteredResults);

  // Filter test results when the toggle is off — caller-visible rendering
  // helpers also short-circuit, but emitting an empty array keeps the
  // shape deterministic and the markdown export simpler.
  const reportTestResults = isEnabled(toggles, "test-results")
    ? filteredResults.slice().sort((a, b) => a.id.localeCompare(b.id))
    : [];

  // Silence unused vars when learning-memory toggle is off — the field
  // is always present but its consumers gate by toggle.
  const _learning: Learning[] = learningMemory.learnings;
  void _learning;

  return {
    generatedAt,
    project,
    runs: includedRuns,
    primaryRunId: primary.id,
    comparison,
    toggles,
    executiveSummary,
    strategySnapshot,
    inputQuality,
    proofPlan,
    executionPlan: {
      matrix,
      campaign: campaignSetup,
      iteration: iterationPlan,
    },
    testResults: reportTestResults,
    learningMemory,
    decisionLog,
    nextActions,
  };
}
