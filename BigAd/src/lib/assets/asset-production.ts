// asset-production.ts — Asset Production Manager planner.
//
// Derives a per-run production plan from the engine's outputs (proof
// asset planner, creator briefs, static briefs, video scripts, testing
// matrix, campaign setup) plus optional review / playbook context.
//
// Pure and deterministic — no `Date.now()`. The plan's `derivedAt` is
// the max of every asset's `updatedAt`, which only the store mutates.
// Two calls with identical input → byte-identical output.

import type { Strategy, TestCell } from "@/types/strategy";
import type { Playbook } from "@/types/playbook";
import type { ReviewBoardSummary } from "@/types/review";
import type {
  AssetFormat,
  AssetOwnerRole,
  AssetPriority,
  AssetProductionPlan,
  AssetProductionSummary,
  AssetQualityCheck,
  AssetQualityCheckKind,
  AssetStatus,
  AssetWhereUsed,
  ProductionAsset,
} from "@/types/assets";
import type { PlannedProofAsset, ProofAssetPlan, CreatorBrief, StaticAdBrief, VideoScript, CreativeTestingMatrix } from "@/types/strategy";

// ---- Public API -----------------------------------------------------------

export interface AssetProductionPlannerArgs {
  runId: string;
  strategy: Strategy;
  proofAssetPlan?: ProofAssetPlan;
  creativeTestingMatrix?: CreativeTestingMatrix;
  selectedPlaybook?: Playbook;
  reviewSummary?: ReviewBoardSummary;
  // Caller-supplied state from the store. Merged by id: existing keeps
  // status, fileLink, notes, qualityChecks, updatedAt; non-state metadata
  // (title, dependencies, whereUsed) refresh from the new strategy.
  existingAssetState?: ProductionAsset[];
  // For deterministic dueWindow math — caller can offset all windows.
  // Defaults to 0 so tests can pin the windows without touching the clock.
  nowOffsetDays?: number;
}

export function buildAssetProductionPlan(
  args: AssetProductionPlannerArgs
): AssetProductionPlan {
  const {
    runId,
    strategy,
    proofAssetPlan,
    creativeTestingMatrix,
    selectedPlaybook,
    reviewSummary,
    existingAssetState,
    nowOffsetDays = 0,
  } = args;

  const sprintLength = selectedPlaybook?.estimatedTimelineDays.min ?? 14;
  const existingById = new Map<string, ProductionAsset>();
  for (const e of existingAssetState ?? []) {
    existingById.set(e.id, e);
  }

  const fresh: ProductionAsset[] = [];

  // 1) Proof assets → ProductionAsset per priorityAsset.
  const proofPlan = proofAssetPlan ?? strategy.proofAssetPlan;
  const proofIdToAssetId = new Map<string, string>();
  if (proofPlan && Array.isArray(proofPlan.priorityAssets)) {
    for (const proof of proofPlan.priorityAssets) {
      const asset = composeProofAsset(proof, sprintLength, nowOffsetDays);
      proofIdToAssetId.set(proof.id, asset.id);
      fresh.push(asset);
    }
  }

  // 2) Creator briefs → ProductionAsset per brief (vertical video focus).
  for (const brief of strategy.creatorBriefs ?? []) {
    fresh.push(
      composeCreatorBriefAsset(brief, sprintLength, nowOffsetDays, creativeTestingMatrix)
    );
  }

  // 3) Static briefs → ProductionAsset per static.
  for (const s of strategy.staticBriefs ?? []) {
    fresh.push(
      composeStaticBriefAsset(s, sprintLength, nowOffsetDays)
    );
  }

  // 4) Video scripts → ProductionAsset for the script + paired creator
  //    production with a dependency link from production → script.
  for (const v of strategy.videoScripts ?? []) {
    const scriptAsset = composeVideoScriptAsset(v, sprintLength, nowOffsetDays);
    fresh.push(scriptAsset);
    const productionAsset = composeVideoProductionAsset(
      v,
      scriptAsset.id,
      sprintLength,
      nowOffsetDays,
      creativeTestingMatrix
    );
    fresh.push(productionAsset);
  }

  // 5) Test cells → ProductionAsset per first-batch cell. Dependencies
  //    onto matching proof-asset assets when proofAssetRequired is set.
  const matrix = creativeTestingMatrix ?? strategy.creativeTestingMatrix;
  if (matrix && Array.isArray(matrix.testCells)) {
    for (const cell of matrix.testCells) {
      const cellAsset = composeTestCellAsset(
        cell,
        sprintLength,
        nowOffsetDays,
        matrix,
        proofIdToAssetId
      );
      fresh.push(cellAsset);
    }
  }

  // 6) Campaign-ad references not already covered by a test-cell asset.
  const cellAdIds = new Set<string>();
  if (matrix) {
    for (const cell of matrix.testCells) {
      cellAdIds.add(cell.id);
    }
  }
  if (strategy.campaignSetup && Array.isArray(strategy.campaignSetup.campaigns)) {
    let campaignAdIdx = 0;
    for (const campaign of strategy.campaignSetup.campaigns) {
      for (const adSet of campaign.adSets ?? []) {
        for (const adRef of adSet.ads ?? []) {
          // Engine emits ad strings like "ad-1", "ad-2". If a test cell
          // already has the same id we skip — but in practice these are
          // disjoint namespaces.
          if (cellAdIds.has(adRef)) continue;
          campaignAdIdx += 1;
          fresh.push(
            composeCampaignAdAsset(
              adRef,
              campaign.name,
              adSet.name,
              campaignAdIdx,
              sprintLength,
              nowOffsetDays
            )
          );
        }
      }
    }
  }

  // 7) Report-asset — always one per plan.
  fresh.push(composeReportAsset(runId, sprintLength, nowOffsetDays));

  // Merge with existingAssetState: keep status / fileLink / notes /
  // updatedAt / quality-check `done` flags from existing.
  const merged: ProductionAsset[] = fresh.map((next) => {
    const prev = existingById.get(next.id);
    if (!prev) return next;
    // Re-apply done flags by check kind from prev where the kind matches.
    const prevCheckByKind = new Map<AssetQualityCheckKind, AssetQualityCheck>();
    for (const c of prev.qualityChecks) {
      prevCheckByKind.set(c.kind, c);
    }
    const checks: AssetQualityCheck[] = next.qualityChecks.map((c) => {
      const prevCheck = prevCheckByKind.get(c.kind);
      if (!prevCheck) return c;
      return {
        kind: c.kind,
        required: c.required,
        done: prevCheck.done,
        notedAt: prevCheck.notedAt,
      };
    });
    return {
      ...next,
      status: prev.status,
      ownerRole: prev.ownerRole,
      fileLink: prev.fileLink,
      notes: prev.notes,
      qualityChecks: checks,
      updatedAt: prev.updatedAt,
    };
  });

  // Stable sort: priority → sourceKind → id.
  const PRIORITY_ORDER: Record<AssetPriority, number> = {
    "must-have": 0,
    "should-have": 1,
    "nice-to-have": 2,
  };
  merged.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority];
    const pb = PRIORITY_ORDER[b.priority];
    if (pa !== pb) return pa - pb;
    if (a.sourceKind !== b.sourceKind) {
      return a.sourceKind < b.sourceKind ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Aggregates.
  const mustHaveCount = merged.filter((a) => a.priority === "must-have").length;
  const shouldHaveCount = merged.filter(
    (a) => a.priority === "should-have"
  ).length;
  const niceToHaveCount = merged.filter(
    (a) => a.priority === "nice-to-have"
  ).length;

  const byOwner: Partial<Record<AssetOwnerRole, number>> = {};
  const byStatus: Partial<Record<AssetStatus, number>> = {};
  for (const a of merged) {
    byOwner[a.ownerRole] = (byOwner[a.ownerRole] ?? 0) + 1;
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  }

  const blockedCount = merged.filter((a) => isBlocked(a)).length;

  const readinessScore = computeReadinessScore(merged);

  const missingBlockers = computeMissingBlockers(merged);

  // derivedAt = max(asset.updatedAt). Pure: only reads persisted timestamps.
  let derivedAt = 0;
  for (const a of merged) {
    if (a.updatedAt > derivedAt) derivedAt = a.updatedAt;
  }

  // Note: reviewSummary is accepted for future cross-layer signalling,
  // but no field is currently emitted from it. Keep it on the interface
  // so callers can pass through without refactor when integration grows.
  void reviewSummary;

  return {
    runId,
    assets: merged,
    mustHaveCount,
    shouldHaveCount,
    niceToHaveCount,
    blockedCount,
    readinessScore,
    missingBlockers,
    byOwner,
    byStatus,
    derivedAt,
  };
}

export function summarizeAssetProductionPlan(
  plan: AssetProductionPlan
): AssetProductionSummary {
  const mustHaveAssets = plan.assets.filter((a) => a.priority === "must-have");
  const mustHaveReady = mustHaveAssets.filter((a) =>
    isReady(a)
  ).length;
  const pendingMustHaveIds = mustHaveAssets
    .filter((a) => !isReady(a))
    .map((a) => a.id);
  const shippedCount = plan.assets.filter((a) => a.status === "shipped").length;

  return {
    readinessScore: plan.readinessScore,
    mustHaveTotal: mustHaveAssets.length,
    mustHaveReady,
    pendingMustHaveIds,
    shippedCount,
    derivedAt: plan.derivedAt,
  };
}

export function criticalBlockingAssetMessages(
  plan: AssetProductionPlan
): string[] {
  const summary = summarizeAssetProductionPlan(plan);
  if (summary.pendingMustHaveIds.length === 0) return [];
  const head = `Asset production: ${summary.pendingMustHaveIds.length} must-have asset(s) not ready`;
  return [head, ...summary.pendingMustHaveIds.slice(0, 2)];
}

// ---- Internal helpers -----------------------------------------------------

function isReady(asset: ProductionAsset): boolean {
  if (asset.status === "approved") return true;
  if (asset.status === "shipped") {
    // Shipped only counts when every required check is done.
    return asset.qualityChecks
      .filter((c) => c.required)
      .every((c) => c.done);
  }
  return false;
}

function isBlocked(asset: ProductionAsset): boolean {
  if (asset.status === "rejected") return true;
  if (asset.status === "shipped") {
    const requiredAllDone = asset.qualityChecks
      .filter((c) => c.required)
      .every((c) => c.done);
    return !requiredAllDone;
  }
  return false;
}

function computeReadinessScore(assets: ProductionAsset[]): number {
  const STATUS_POINTS: Record<AssetStatus, number> = {
    requested: 0,
    scripted: 2,
    "in-production": 4,
    "in-review": 7,
    approved: 9,
    shipped: 10,
    rejected: 0,
  };

  // Only must-have + should-have count toward the denominator.
  // Nice-to-have is bonus; we still score it but it doesn't gate
  // readiness. The denominator follows the brief's formula:
  //   (mustHave + shouldHave) * 10 + sum(required check count) * 0.5
  // and the numerator is the sum of status points + 0.5 per done required
  // check across ALL assets.

  const counted = assets.filter(
    (a) => a.priority === "must-have" || a.priority === "should-have"
  );
  if (counted.length === 0) return 0;

  let numerator = 0;
  let denominator = 0;

  for (const a of counted) {
    numerator += STATUS_POINTS[a.status];
    denominator += 10;
    const requiredChecks = a.qualityChecks.filter((c) => c.required);
    denominator += requiredChecks.length * 0.5;
    const doneRequired = requiredChecks.filter((c) => c.done);
    numerator += doneRequired.length * 0.5;
  }

  if (denominator === 0) return 0;
  let score = (numerator / denominator) * 100;
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  // Round to integer for deterministic stability.
  return Math.round(score);
}

function computeMissingBlockers(
  assets: ProductionAsset[]
): Array<{ assetId: string; reason: string }> {
  const out: Array<{ assetId: string; reason: string }> = [];

  // Must-have not approved/shipped.
  for (const a of assets) {
    if (a.priority !== "must-have") continue;
    if (a.status !== "approved" && a.status !== "shipped") {
      out.push({
        assetId: a.id,
        reason: `Must-have asset '${a.title}' is ${a.status}`,
      });
    }
  }

  // Shipped but missing required quality checks.
  for (const a of assets) {
    if (a.status !== "shipped") continue;
    const missing = a.qualityChecks
      .filter((c) => c.required && !c.done)
      .map((c) => c.kind);
    if (missing.length === 0) continue;
    for (const kind of missing) {
      out.push({
        assetId: a.id,
        reason: `Shipped asset '${a.title}' missing required check: ${kind}`,
      });
    }
  }

  // Test-cell dependency on proof asset not approved/shipped.
  const byId = new Map<string, ProductionAsset>();
  for (const a of assets) byId.set(a.id, a);
  for (const a of assets) {
    if (a.sourceKind !== "test-cell") continue;
    for (const dep of a.dependencies) {
      const target = byId.get(dep.dependsOnAssetId);
      if (!target) continue;
      if (target.sourceKind !== "proof-asset") continue;
      if (target.status === "approved" || target.status === "shipped") continue;
      out.push({
        assetId: a.id,
        reason: `Test cell asset '${a.title}' blocked by proof asset dependency`,
      });
    }
  }

  return out;
}

// ---- Composers ------------------------------------------------------------

function dueWindowFor(
  priority: AssetPriority,
  sprintLength: number,
  nowOffsetDays: number
): { startOffsetDays: number; endOffsetDays: number } {
  switch (priority) {
    case "must-have":
      return {
        startOffsetDays: 0 + nowOffsetDays,
        endOffsetDays: Math.round(sprintLength * 0.4) + nowOffsetDays,
      };
    case "should-have":
      return {
        startOffsetDays: Math.round(sprintLength * 0.3) + nowOffsetDays,
        endOffsetDays: Math.round(sprintLength * 0.7) + nowOffsetDays,
      };
    case "nice-to-have":
      return {
        startOffsetDays: Math.round(sprintLength * 0.5) + nowOffsetDays,
        endOffsetDays: sprintLength + nowOffsetDays,
      };
  }
}

function formatForProofType(
  type: PlannedProofAsset["type"]
): AssetFormat {
  switch (type) {
    case "screenshot":
      return "screenshot";
    case "demo-video":
      return "video-9-16";
    case "customer-quote":
      return "quote";
    case "before-after":
      return "video-9-16";
    case "case-study":
      return "case-study";
    case "app-store-review":
      return "quote";
    case "founder-story":
      return "video-9-16";
  }
}

function ownerForProofType(
  type: PlannedProofAsset["type"]
): AssetOwnerRole {
  switch (type) {
    case "screenshot":
      return "designer";
    case "demo-video":
    case "before-after":
    case "founder-story":
      return "creator";
    case "customer-quote":
    case "case-study":
    case "app-store-review":
      return "client";
  }
}

function qualityChecksFor(args: {
  format: AssetFormat;
  sourceKind: ProductionAsset["sourceKind"];
  coldAcquisition?: boolean;
  isQuoteOrCaseStudy?: boolean;
}): AssetQualityCheck[] {
  const checks: AssetQualityCheck[] = [];
  const push = (kind: AssetQualityCheckKind, required: boolean) => {
    checks.push({ kind, required, done: false });
  };

  // Universal (applies to every asset).
  push("format-matches-placement", true);
  push("file-link-present", true);
  push("brand-present", true);
  push("no-unsupported-claim", true);

  const isVideo = args.format.startsWith("video-");
  const isStatic =
    args.format.startsWith("static-") ||
    args.format === "screenshot";

  if (isVideo) {
    push("captions-included", true);
    push("export-size-noted", true);
    push("aspect-ratio-noted", true);
  } else if (isStatic) {
    push("export-size-noted", true);
    push("aspect-ratio-noted", true);
  }

  if (args.coldAcquisition) {
    push("proof-visible", true);
    push("cta-visible", true);
  }

  if (args.isQuoteOrCaseStudy) {
    // proof-visible may already be present from coldAcquisition; only
    // add when not already in the checklist.
    if (!checks.some((c) => c.kind === "proof-visible")) {
      push("proof-visible", true);
    }
    // no-unsupported-claim is universal; nothing to add here.
  }

  return checks;
}

function whereUsedForProof(proof: PlannedProofAsset): AssetWhereUsed[] {
  return proof.whereToUse.map((p, i) => ({
    context: classifyPlacementContext(p),
    refId: `${proof.id}-placement-${i + 1}`,
    label: p,
  }));
}

function classifyPlacementContext(
  placement: string
): AssetWhereUsed["context"] {
  if (placement.includes("landing")) return "landing-page";
  if (placement.includes("store")) return "landing-page";
  if (placement.includes("email")) return "report";
  return "proof-block";
}

function composeProofAsset(
  proof: PlannedProofAsset,
  sprintLength: number,
  nowOffsetDays: number
): ProductionAsset {
  const format = formatForProofType(proof.type);
  const sourceKind = "proof-asset" as const;
  const id = `${sourceKind}:${proof.id}:${format}`;
  const isQuoteLike =
    proof.type === "customer-quote" ||
    proof.type === "case-study" ||
    proof.type === "app-store-review";
  return {
    id,
    title: proof.title,
    sourceKind,
    sourceRefId: proof.id,
    format,
    priority: proof.priority,
    status: "requested",
    ownerRole: ownerForProofType(proof.type),
    dueWindow: dueWindowFor(proof.priority, sprintLength, nowOffsetDays),
    linkedTestCellIds: [],
    linkedProofAssetIds: [proof.id],
    qualityChecks: qualityChecksFor({
      format,
      sourceKind,
      coldAcquisition: false,
      isQuoteOrCaseStudy: isQuoteLike,
    }),
    dependencies: [],
    whereUsed: whereUsedForProof(proof),
    riskIfMissing: `Without this asset, the ${proof.type} angle in the cold-prospecting batch runs without proof anchor.`,
    updatedAt: 0,
  };
}

function composeCreatorBriefAsset(
  brief: CreatorBrief,
  sprintLength: number,
  nowOffsetDays: number,
  matrix: CreativeTestingMatrix | undefined
): ProductionAsset {
  const format: AssetFormat = "video-9-16";
  const sourceKind = "creator-brief" as const;
  const id = `${sourceKind}:${brief.id}:${format}`;
  // Default brief priority is should-have; the top-pick brief (rank 1)
  // gets must-have because the rest of the strategy leans on it.
  const priority: AssetPriority =
    brief.id === "brief-1" ? "must-have" : "should-have";
  const linkedTestCellIds = collectCellIdsReferencingBrief(brief.id, matrix);
  return {
    id,
    title: `Production: ${truncate(brief.forAngle, 60)}`,
    sourceKind,
    sourceRefId: brief.id,
    format,
    priority,
    status: "requested",
    ownerRole: "creator",
    dueWindow: dueWindowFor(priority, sprintLength, nowOffsetDays),
    linkedTestCellIds,
    linkedProofAssetIds: [],
    qualityChecks: qualityChecksFor({ format, sourceKind, coldAcquisition: true }),
    dependencies: [],
    whereUsed: linkedTestCellIds.map((cellId) => ({
      context: "test-cell" as const,
      refId: cellId,
      label: `Test cell ${cellId}`,
    })),
    riskIfMissing: `Without the production from brief ${brief.id}, the top-pick angle never goes live.`,
    updatedAt: 0,
  };
}

function composeStaticBriefAsset(
  staticBrief: StaticAdBrief,
  sprintLength: number,
  nowOffsetDays: number
): ProductionAsset {
  const format: AssetFormat = formatForStaticSize(staticBrief.size);
  const sourceKind = "static-brief" as const;
  const id = `${sourceKind}:${staticBrief.briefId}:${format}`;
  const priority: AssetPriority = "should-have";
  return {
    id,
    title: `Static (${staticBrief.size}): ${truncate(staticBrief.forAngle, 50)}`,
    sourceKind,
    sourceRefId: staticBrief.briefId,
    format,
    priority,
    status: "requested",
    ownerRole: "designer",
    dueWindow: dueWindowFor(priority, sprintLength, nowOffsetDays),
    linkedTestCellIds: [],
    linkedProofAssetIds: [],
    qualityChecks: qualityChecksFor({ format, sourceKind, coldAcquisition: false }),
    dependencies: [],
    whereUsed: [],
    riskIfMissing: `Without the ${staticBrief.size} static, the test cell loses its still-image surface.`,
    updatedAt: 0,
  };
}

function formatForStaticSize(size: string): AssetFormat {
  switch (size) {
    case "1:1":
      return "static-1-1";
    case "4:5":
      return "static-4-5";
    case "9:16":
      return "static-9-16";
    default:
      return "static-1-1";
  }
}

function composeVideoScriptAsset(
  v: VideoScript,
  sprintLength: number,
  nowOffsetDays: number
): ProductionAsset {
  const format: AssetFormat = "video-9-16";
  const sourceKind = "video-script" as const;
  // Use the briefId so callers can correlate; the format suffix
  // disambiguates the script from the paired production asset.
  const id = `${sourceKind}:${v.briefId}:${format}`;
  const priority: AssetPriority = "should-have";
  return {
    id,
    title: `Script for ${v.briefId}`,
    sourceKind,
    sourceRefId: v.briefId,
    format,
    priority,
    status: "requested",
    ownerRole: "copywriter",
    dueWindow: dueWindowFor(priority, sprintLength, nowOffsetDays),
    linkedTestCellIds: [],
    linkedProofAssetIds: [],
    qualityChecks: qualityChecksFor({ format, sourceKind, coldAcquisition: false }),
    dependencies: [],
    whereUsed: [],
    riskIfMissing: `Without the line-level script, the creator has no shot-by-shot direction for ${v.briefId}.`,
    updatedAt: 0,
  };
}

function composeVideoProductionAsset(
  v: VideoScript,
  scriptAssetId: string,
  sprintLength: number,
  nowOffsetDays: number,
  matrix: CreativeTestingMatrix | undefined
): ProductionAsset {
  // Paired production asset — same brief, but creator owns the build.
  // Use 'creator-brief' alternative format suffix so the id remains
  // distinct from the brief-asset id. We mark it as video-1-1 since
  // creator briefs default to video-9-16; the alt-format slot is a
  // realistic deliverable. (Brief mandates a 1:1 cut-down too.)
  const format: AssetFormat = "video-1-1";
  const sourceKind = "video-script" as const;
  const id = `${sourceKind}:${v.briefId}-production:${format}`;
  const priority: AssetPriority = "should-have";
  const linkedTestCellIds = collectCellIdsReferencingBrief(v.briefId, matrix);
  return {
    id,
    title: `Production cut for ${v.briefId}`,
    sourceKind,
    sourceRefId: `${v.briefId}-production`,
    format,
    priority,
    status: "requested",
    ownerRole: "creator",
    dueWindow: dueWindowFor(priority, sprintLength, nowOffsetDays),
    linkedTestCellIds,
    linkedProofAssetIds: [],
    qualityChecks: qualityChecksFor({ format, sourceKind, coldAcquisition: false }),
    dependencies: [
      {
        dependsOnAssetId: scriptAssetId,
        reason: `Production needs the line-level script for ${v.briefId} before shoot day.`,
      },
    ],
    whereUsed: linkedTestCellIds.map((cellId) => ({
      context: "test-cell" as const,
      refId: cellId,
      label: `Test cell ${cellId}`,
    })),
    riskIfMissing: `Without the production cut, the script never ships into a cell.`,
    updatedAt: 0,
  };
}

function composeTestCellAsset(
  cell: TestCell,
  sprintLength: number,
  nowOffsetDays: number,
  matrix: CreativeTestingMatrix,
  proofIdToAssetId: Map<string, string>
): ProductionAsset {
  const format: AssetFormat = mapTestFormat(cell.format);
  const sourceKind = "test-cell" as const;
  const id = `${sourceKind}:${cell.id}:${format}`;
  const isFirstBatch = matrix.recommendedFirstBatch.includes(cell.id);
  // First-batch cells anchor the launch — must-have. Queue cells are
  // should-have.
  const isColdAcquisition =
    cell.audienceTier.toLowerCase().includes("cold") ||
    cell.funnelStage === "prospecting";
  const priority: AssetPriority = isFirstBatch
    ? isColdAcquisition
      ? "must-have"
      : "should-have"
    : "nice-to-have";
  const ownerRole: AssetOwnerRole = format.startsWith("video-")
    ? "creator"
    : "designer";
  const linkedProofAssetIds = cell.proofAssetRequired
    ? [cell.proofAssetRequired]
    : [];
  const proofAssetId = cell.proofAssetRequired
    ? proofIdToAssetId.get(cell.proofAssetRequired)
    : undefined;
  const dependencies = proofAssetId
    ? [
        {
          dependsOnAssetId: proofAssetId,
          reason: `Test cell ${cell.id} requires proof asset ${cell.proofAssetRequired}.`,
        },
      ]
    : [];
  return {
    id,
    title: `Cell ${cell.id}: ${truncate(cell.angle, 50)}`,
    sourceKind,
    sourceRefId: cell.id,
    format,
    priority,
    status: "requested",
    ownerRole,
    dueWindow: dueWindowFor(priority, sprintLength, nowOffsetDays),
    linkedTestCellIds: [cell.id],
    linkedProofAssetIds,
    qualityChecks: qualityChecksFor({
      format,
      sourceKind,
      coldAcquisition: isColdAcquisition,
    }),
    dependencies,
    whereUsed: [
      {
        context: "test-cell",
        refId: cell.id,
        label: `Test cell ${cell.id} — ${cell.audienceTier}`,
      },
    ],
    riskIfMissing: `Without this cell's creative, the testing matrix loses the ${cell.angle} angle.`,
    updatedAt: 0,
  };
}

function mapTestFormat(f: TestCell["format"]): AssetFormat {
  switch (f) {
    case "video-9-16":
      return "video-9-16";
    case "video-1-1":
      return "video-1-1";
    case "static-1-1":
      return "static-1-1";
    case "static-4-5":
      return "static-4-5";
    case "static-9-16":
      return "static-9-16";
    case "carousel":
      return "static-1-1";
  }
}

function composeCampaignAdAsset(
  adRef: string,
  campaignName: string,
  adSetName: string,
  idx: number,
  sprintLength: number,
  nowOffsetDays: number
): ProductionAsset {
  const format: AssetFormat = "video-9-16";
  const sourceKind = "campaign-ad" as const;
  const id = `${sourceKind}:${campaignName}-${adSetName}-${adRef}-${idx}:${format}`;
  const priority: AssetPriority = "should-have";
  return {
    id,
    title: `Campaign ad: ${campaignName} / ${adSetName} / ${adRef}`,
    sourceKind,
    sourceRefId: `${campaignName}-${adSetName}-${adRef}`,
    format,
    priority,
    status: "requested",
    ownerRole: "creator",
    dueWindow: dueWindowFor(priority, sprintLength, nowOffsetDays),
    linkedTestCellIds: [],
    linkedProofAssetIds: [],
    qualityChecks: qualityChecksFor({ format, sourceKind, coldAcquisition: true }),
    dependencies: [],
    whereUsed: [
      {
        context: "campaign-ad",
        refId: `${campaignName}-${adSetName}`,
        label: `${campaignName} → ${adSetName}`,
      },
    ],
    riskIfMissing: `Without this ad slot filled, the ad set ${adSetName} ships short.`,
    updatedAt: 0,
  };
}

function composeReportAsset(
  runId: string,
  sprintLength: number,
  nowOffsetDays: number
): ProductionAsset {
  const format: AssetFormat = "report";
  const sourceKind = "report-asset" as const;
  const id = `${sourceKind}:${runId}:${format}`;
  const priority: AssetPriority = "should-have";
  return {
    id,
    title: "Client report finalization",
    sourceKind,
    sourceRefId: runId,
    format,
    priority,
    status: "requested",
    ownerRole: "owner",
    dueWindow: dueWindowFor(priority, sprintLength, nowOffsetDays),
    linkedTestCellIds: [],
    linkedProofAssetIds: [],
    qualityChecks: qualityChecksFor({ format, sourceKind, coldAcquisition: false }),
    dependencies: [],
    whereUsed: [
      {
        context: "report",
        refId: runId,
        label: "Client-ready report",
      },
    ],
    riskIfMissing: `Without the report, the engagement has no client-facing deliverable.`,
    updatedAt: 0,
  };
}

function collectCellIdsReferencingBrief(
  briefId: string,
  matrix: CreativeTestingMatrix | undefined
): string[] {
  if (!matrix) return [];
  const out: string[] = [];
  for (const cell of matrix.testCells) {
    // The engine doesn't carry briefId on TestCell directly, but the
    // angle is the concept name. We use the conceptId / angle as the
    // weakest signal; in practice the brief id and cell id share an
    // index (brief-1 ↔ test-1 for the AstroDating fixture). Match by
    // brief number suffix when possible.
    const briefNum = briefId.replace(/^brief-/, "");
    const cellNum = cell.id.replace(/^test-/, "");
    if (briefNum && cellNum && briefNum === cellNum) {
      out.push(cell.id);
    }
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const words = s.slice(0, max).split(/\s+/);
  if (words.length > 1) words.pop();
  return words.join(" ").trim();
}
