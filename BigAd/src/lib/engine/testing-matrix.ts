// testing-matrix.ts — Creative Testing Matrix.
//
// Walks the (avatar x concept x hook x format x offer) space to emit
// 3-12 concrete test cells, each with a clear primary KPI, a kill rule
// keyed off the KPI ladder's starter tier, and a scale rule keyed off
// the scaling tier. The first batch is 3-6 cells chosen so each cell
// varies on exactly ONE axis from a baseline — that is the discipline
// the matrix enforces. Cells beyond the first batch sit in the queue
// so the UI/export can show what comes next.
//
// Deterministic — same inputs always produce the same matrix.

import type {
  AdConceptCard,
  AudienceAvatar,
  CampaignCalendar,
  CreativeTestingMatrix,
  CtaBank,
  HookLibrary,
  HookLibraryItem,
  KillRule,
  KpiName,
  KpiTargetLadder,
  OfferKind,
  OfferRecommendation,
  PlannedProofAsset,
  ProductInput,
  ProofAssetPlan,
  ScaleRule,
  TestCell,
  TestFormat,
  TestFunnelStage,
  TestingWarning,
  VariantSet,
} from "@/types/strategy";

export interface CreativeTestingMatrixArgs {
  input: ProductInput;
  adConceptCards: AdConceptCard[];
  hookLibrary: HookLibrary;
  variantSets: VariantSet[];
  ctaBank: CtaBank;
  proofAssetPlan: ProofAssetPlan;
  campaignCalendar: CampaignCalendar;
  kpiLadder: KpiTargetLadder;
  audienceAvatars: AudienceAvatar[];
  offers: OfferRecommendation[];
}

// First-batch formats prefer 9-16 video and 4-5 static. The matrix
// queues other formats for the "next" lane.
const FIRST_BATCH_FORMATS: TestFormat[] = ["video-9-16", "static-4-5"];
const QUEUE_FORMATS: TestFormat[] = ["video-1-1", "static-1-1", "static-9-16", "carousel"];

const VARIATION_AXES = [
  "hook",
  "offer",
  "format",
  "audience-tier",
  "proof",
] as const;
type VariationAxis = (typeof VARIATION_AXES)[number];

export function buildCreativeTestingMatrix(
  args: CreativeTestingMatrixArgs
): CreativeTestingMatrix {
  const {
    input,
    adConceptCards,
    hookLibrary,
    proofAssetPlan,
    kpiLadder,
    audienceAvatars,
    offers,
  } = args;

  const warnings: TestingWarning[] = [];

  // Tracking-readiness blocker → still emit cells, just flag.
  // (We don't read TrackingReadiness directly here; the index wiring
  // raises that as a JourneyBlocker — but we can also surface the
  // "missing must-have proof" signal locally.)
  if (proofAssetPlan.missingBeforeSpend.length > 0) {
    warnings.push({
      kind: "missing-proof",
      message: `${proofAssetPlan.missingBeforeSpend.length} must-have proof asset${
        proofAssetPlan.missingBeforeSpend.length === 1 ? " is" : "s are"
      } missing before spend: ${proofAssetPlan.missingBeforeSpend.join(", ")}.`,
    });
  }

  // Skeptical / mature mix — every test cell must carry a proof asset.
  const skepticalMix =
    input.sophistication === "skeptical-market" ||
    input.sophistication === "mature-market";

  // First-batch size: 1 per avatar x dominant format, capped at 6.
  // For AstroDating (3 avatars), aim 3-5.
  const firstBatchTarget = clamp(
    audienceAvatars.length === 0 ? 3 : Math.min(audienceAvatars.length * 2, 6),
    3,
    6
  );

  // maxConcurrentTests: ceil(N avatars + 2), clamp 4-8.
  const maxConcurrentTests = clamp(
    Math.ceil(Math.max(audienceAvatars.length, 1) + 2),
    4,
    8
  );

  // Collect must-have proof assets (sorted by readinessImpact desc) so
  // we can deterministically pair them with cells.
  const mustHaveProofs = proofAssetPlan.priorityAssets
    .filter((p) => p.priority === "must-have")
    .slice();

  // If skeptical AND no must-have proofs exist at all, surface a warning.
  if (skepticalMix && mustHaveProofs.length === 0) {
    warnings.push({
      kind: "missing-proof",
      message: `Skeptical / mature market with no must-have proof assets — every cell will run without a proof anchor.`,
    });
  }

  const testCells: TestCell[] = [];
  const baseline = pickBaseline({
    adConceptCards,
    audienceAvatars,
    offers,
    hookLibrary,
    proofs: mustHaveProofs,
    skepticalMix,
  });

  // ---- First batch: one variation per axis from the baseline -----------
  // Axes used: hook / offer / format / audience-tier / proof.
  const firstBatchIds: string[] = [];

  // 1) The baseline itself is cell #1.
  let idx = 1;
  if (baseline) {
    const baselineCell = buildBaselineCell({
      id: `test-${idx}`,
      baseline,
      kpiLadder,
      skepticalMix,
      proofs: mustHaveProofs,
      offers,
      hookLibrary,
    });
    testCells.push(baselineCell);
    firstBatchIds.push(baselineCell.id);
    idx += 1;
  }

  // 2) Up to firstBatchTarget - 1 variations, one axis at a time.
  const axisOrder: VariationAxis[] = ["hook", "offer", "format", "audience-tier", "proof"];
  for (const axis of axisOrder) {
    if (firstBatchIds.length >= firstBatchTarget) break;
    if (!baseline) break;
    const variant = buildVariationCell({
      id: `test-${idx}`,
      baseline,
      axis,
      kpiLadder,
      skepticalMix,
      proofs: mustHaveProofs,
      offers,
      hookLibrary,
      adConceptCards,
      audienceAvatars,
    });
    if (variant) {
      testCells.push(variant);
      firstBatchIds.push(variant.id);
      idx += 1;
    }
  }

  // ---- Queue beyond first batch: a few more concept-axis combos --------
  // Add at most maxConcurrentTests + 6 total so the queue stays useful.
  const queueCap = Math.min(testCells.length + 4, 12);
  const queueFormats = QUEUE_FORMATS.slice();
  let queueIdx = 0;
  while (testCells.length < queueCap && baseline) {
    const queuedFormat = queueFormats[queueIdx % queueFormats.length];
    // Rotate through remaining concepts (different from baseline) when possible.
    const altConcept =
      adConceptCards[(idx - 1) % Math.max(adConceptCards.length, 1)];
    if (!altConcept) break;
    const altAvatar =
      audienceAvatars[(idx - 1) % Math.max(audienceAvatars.length, 1)] ??
      baseline.avatar;
    const altOffer = offers[(idx - 1) % Math.max(offers.length, 1)] ?? baseline.offer;
    const altHookItem = pickHookFor(hookLibrary, altAvatar.id, [
      baseline.hook.text,
    ]);
    const proof = pickProofAsset(mustHaveProofs, skepticalMix, idx);

    const cell = composeCell({
      id: `test-${idx}`,
      concept: altConcept,
      avatar: altAvatar,
      hookText: altHookItem ? altHookItem.text : baseline.hook.text,
      format: queuedFormat,
      funnelStage: queueFormats[queueIdx % queueFormats.length] === "carousel"
        ? "engagement-retargeting"
        : "prospecting",
      audienceTier:
        queuedFormat === "carousel"
          ? "Engaged (last 60 days)"
          : `Cold broad (${altAvatar.label})`,
      offer: altOffer.kind,
      proofAssetRequired: proof ? proof.id : null,
      kpiLadder,
      learningGoal: `Queued: probe ${queuedFormat} for ${altAvatar.label.toLowerCase()} once the first batch reads.`,
      skepticalMix,
    });
    testCells.push(cell);
    idx += 1;
    queueIdx += 1;
  }

  // If the queue could not even produce any cells, also flag.
  if (testCells.length === 0) {
    warnings.push({
      kind: "too-many-variables",
      message:
        "No baseline could be assembled — the upstream avatar/concept/offer modules emitted empty sets.",
    });
  }

  // Recommended first batch — guaranteed to be 3-6 cells when baseline exists.
  const recommendedFirstBatch = firstBatchIds.slice(0, firstBatchTarget);

  // Re-check: every cell in the first batch must have proofAssetRequired
  // when skeptical/mature. If a baseline slipped through without one
  // because mustHaveProofs is empty, the warning above already fires;
  // here we also strengthen any cell that has access to a proof.
  if (skepticalMix && mustHaveProofs.length > 0) {
    for (const cell of testCells) {
      if (recommendedFirstBatch.includes(cell.id) && !cell.proofAssetRequired) {
        cell.proofAssetRequired = mustHaveProofs[0].id;
      }
    }
  }

  return {
    testCells,
    recommendedFirstBatch,
    maxConcurrentTests,
    testingWarnings: warnings,
  };
}

// ---- Baseline picking ----------------------------------------------------

interface Baseline {
  concept: AdConceptCard;
  avatar: AudienceAvatar;
  hook: HookLibraryItem;
  offer: OfferRecommendation;
  format: TestFormat;
  funnelStage: TestFunnelStage;
  audienceTier: string;
  proof: PlannedProofAsset | null;
}

interface PickBaselineArgs {
  adConceptCards: AdConceptCard[];
  audienceAvatars: AudienceAvatar[];
  offers: OfferRecommendation[];
  hookLibrary: HookLibrary;
  proofs: PlannedProofAsset[];
  skepticalMix: boolean;
}

function pickBaseline(args: PickBaselineArgs): Baseline | null {
  const { adConceptCards, audienceAvatars, offers, hookLibrary, proofs, skepticalMix } =
    args;
  const concept = adConceptCards[0];
  const avatar =
    audienceAvatars.find((a) => a.id === concept?.targetAvatarId) ??
    audienceAvatars[0];
  const offer = offers[0];
  if (!concept || !avatar || !offer) return null;

  const hookCandidate = pickHookFor(hookLibrary, avatar.id, []);
  const hook = hookCandidate ?? concept.hook;

  return {
    concept,
    avatar,
    hook,
    offer,
    format: FIRST_BATCH_FORMATS[0],
    funnelStage: "prospecting",
    audienceTier: `Cold broad (${avatar.label})`,
    proof: pickProofAsset(proofs, skepticalMix, 1),
  };
}

function pickHookFor(
  library: HookLibrary,
  avatarId: string,
  excludeTexts: string[]
): HookLibraryItem | null {
  const candidates = library.items.filter(
    (h) => h.avatarFit.includes(avatarId) && !excludeTexts.includes(h.text)
  );
  return candidates[0] ?? library.items[0] ?? null;
}

function pickProofAsset(
  proofs: PlannedProofAsset[],
  skepticalMix: boolean,
  index: number
): PlannedProofAsset | null {
  if (proofs.length === 0) return null;
  if (!skepticalMix && index > 1) return null;
  return proofs[(index - 1) % proofs.length] ?? null;
}

// ---- Cell builders -------------------------------------------------------

interface BuildBaselineCellArgs {
  id: string;
  baseline: Baseline;
  kpiLadder: KpiTargetLadder;
  skepticalMix: boolean;
  proofs: PlannedProofAsset[];
  offers: OfferRecommendation[];
  hookLibrary: HookLibrary;
}

function buildBaselineCell(args: BuildBaselineCellArgs): TestCell {
  const { id, baseline, kpiLadder, skepticalMix } = args;
  return composeCell({
    id,
    concept: baseline.concept,
    avatar: baseline.avatar,
    hookText: baseline.hook.text,
    format: baseline.format,
    funnelStage: baseline.funnelStage,
    audienceTier: baseline.audienceTier,
    offer: baseline.offer.kind,
    proofAssetRequired: baseline.proof ? baseline.proof.id : null,
    kpiLadder,
    learningGoal: `Baseline: prove the ${baseline.concept.name} concept on cold prospecting before any variation.`,
    skepticalMix,
  });
}

interface BuildVariationCellArgs {
  id: string;
  baseline: Baseline;
  axis: VariationAxis;
  kpiLadder: KpiTargetLadder;
  skepticalMix: boolean;
  proofs: PlannedProofAsset[];
  offers: OfferRecommendation[];
  hookLibrary: HookLibrary;
  adConceptCards: AdConceptCard[];
  audienceAvatars: AudienceAvatar[];
}

function buildVariationCell(args: BuildVariationCellArgs): TestCell | null {
  const {
    id,
    baseline,
    axis,
    kpiLadder,
    skepticalMix,
    proofs,
    offers,
    hookLibrary,
    audienceAvatars,
  } = args;

  // Default — keep everything constant, then swap exactly one axis.
  let hookText = baseline.hook.text;
  let offerKind = baseline.offer.kind;
  let format = baseline.format;
  let audienceTier = baseline.audienceTier;
  let funnelStage = baseline.funnelStage;
  let proofId = baseline.proof ? baseline.proof.id : null;
  let learningGoal = `Vary the ${axis} axis: hold everything else constant from baseline.`;

  switch (axis) {
    case "hook": {
      const alt = pickHookFor(hookLibrary, baseline.avatar.id, [baseline.hook.text]);
      if (!alt || alt.text === baseline.hook.text) return null;
      hookText = alt.text;
      learningGoal = `Swap only the hook (${alt.pattern}) to test whether opener archetype moves hook-rate.`;
      break;
    }
    case "offer": {
      const alt = offers.find((o) => o.kind !== baseline.offer.kind);
      if (!alt) return null;
      offerKind = alt.kind;
      learningGoal = `Swap only the offer to ${alt.kind} to test offer lift against baseline CPA.`;
      break;
    }
    case "format": {
      const alt = FIRST_BATCH_FORMATS.find((f) => f !== baseline.format);
      if (!alt) return null;
      format = alt;
      learningGoal = `Swap only the format to ${alt} to test which surface the concept lands on.`;
      break;
    }
    case "audience-tier": {
      audienceTier = "Engaged (last 60 days)";
      funnelStage = "engagement-retargeting";
      learningGoal = `Swap only the audience tier to engaged-60d retargeting to test the warm pool.`;
      break;
    }
    case "proof": {
      // Swap to a different proof asset (if available).
      const otherProof = proofs.find((p) => p.id !== (baseline.proof?.id ?? ""));
      if (!otherProof && !baseline.proof) return null;
      proofId = otherProof ? otherProof.id : baseline.proof ? baseline.proof.id : null;
      if (skepticalMix && otherProof) {
        learningGoal = `Swap only the proof asset to ${otherProof.id} to test which proof moves the close.`;
      } else if (skepticalMix && baseline.proof) {
        // Emphasise proof more prominently rather than swap (single proof case).
        learningGoal = `Re-emphasise the proof asset to test which placement moves the close.`;
      } else {
        learningGoal = `Test the cell with no explicit proof anchor versus the baseline.`;
        proofId = null;
      }
      break;
    }
  }

  return composeCell({
    id,
    concept: baseline.concept,
    avatar: baseline.avatar,
    hookText,
    format,
    funnelStage,
    audienceTier,
    offer: offerKind,
    proofAssetRequired: proofId,
    kpiLadder,
    learningGoal,
    skepticalMix,
  });
}

// ---- Compose a single test cell ------------------------------------------

interface ComposeCellArgs {
  id: string;
  concept: AdConceptCard;
  avatar: AudienceAvatar;
  hookText: string;
  format: TestFormat;
  funnelStage: TestFunnelStage;
  audienceTier: string;
  offer: OfferKind;
  proofAssetRequired: string | null;
  kpiLadder: KpiTargetLadder;
  learningGoal: string;
  skepticalMix: boolean;
}

function composeCell(args: ComposeCellArgs): TestCell {
  const {
    id,
    concept,
    avatar,
    hookText,
    format,
    funnelStage,
    audienceTier,
    offer,
    proofAssetRequired,
    kpiLadder,
    learningGoal,
    skepticalMix,
  } = args;

  const primaryKpi = pickPrimaryKpi(funnelStage, format);
  const secondaryKpi = pickSecondaryKpi(primaryKpi);

  const tierBudgets = pickSpendBudgets(kpiLadder);

  const killRule = buildKillRule(primaryKpi, kpiLadder, tierBudgets.kill);
  const scaleRule = buildScaleRule(primaryKpi, kpiLadder, tierBudgets.scale);

  const estimatedRunDays = pickRunDays(kpiLadder, primaryKpi);

  // Angle = the concept's name (already short) for traceability.
  const angle = concept.name;

  return {
    id,
    conceptId: concept.id,
    angle,
    avatarId: avatar.id,
    hook: hookText,
    proofAssetRequired,
    format,
    funnelStage,
    audienceTier,
    offer,
    primaryKpi,
    secondaryKpi,
    killRule,
    scaleRule,
    learningGoal,
    estimatedRunDays,
  };
}

function pickPrimaryKpi(stage: TestFunnelStage, format: TestFormat): KpiName {
  // Video formats lean on hook-rate first; statics lean on CTR.
  if (stage === "site-retargeting") return "roas";
  if (stage === "engagement-retargeting") return "cvr";
  if (format.startsWith("video")) return "hookRate";
  return "ctr";
}

function pickSecondaryKpi(primary: KpiName): KpiName {
  switch (primary) {
    case "hookRate":
      return "ctr";
    case "ctr":
      return "cvr";
    case "cvr":
      return "cpa";
    case "roas":
      return "cpa";
    default:
      return "cpa";
  }
}

interface SpendBudgets {
  kill: number;
  scale: number;
}

function pickSpendBudgets(ladder: KpiTargetLadder): SpendBudgets {
  // Look at ROAS starter breakeven — if it's >= 3, treat as high tier
  // ($200 kill / $500 scale). Otherwise low tier ($50 kill / $200 scale).
  const roasStarter = ladder.targets.find(
    (t) => t.kpi === "roas" && t.tier === "starter"
  );
  const cpaStarter = ladder.targets.find(
    (t) => t.kpi === "cpa" && t.tier === "starter"
  );

  const highTier =
    (roasStarter && roasStarter.breakeven >= 3) ||
    (cpaStarter && cpaStarter.breakeven >= 60);

  if (highTier) return { kill: 200, scale: 500 };
  return { kill: 50, scale: 200 };
}

function buildKillRule(
  primaryKpi: KpiName,
  ladder: KpiTargetLadder,
  afterSpend: number
): KillRule {
  const starter = ladder.targets.find(
    (t) => t.kpi === primaryKpi && t.tier === "starter"
  );
  const direction = starter?.direction ?? "higher-better";
  const threshold = starter?.breakeven ?? 1;
  const comparator: "below" | "above" =
    direction === "higher-better" ? "below" : "above";
  return {
    metric: primaryKpi,
    threshold,
    comparator,
    afterSpend,
    rationale: `Below the starter-tier ${primaryKpi} floor after $${afterSpend} spent — the cell will not earn its way out.`,
  };
}

function buildScaleRule(
  primaryKpi: KpiName,
  ladder: KpiTargetLadder,
  afterSpend: number
): ScaleRule {
  const scaling = ladder.targets.find(
    (t) => t.kpi === primaryKpi && t.tier === "scaling"
  );
  const direction = scaling?.direction ?? "higher-better";
  const threshold = scaling?.scaling ?? scaling?.breakeven ?? 1;
  const comparator: "above" | "below" =
    direction === "higher-better" ? "above" : "below";
  return {
    metric: primaryKpi,
    threshold,
    comparator,
    afterSpend,
    action: "raise-budget",
    rationale: `Above the scaling-tier ${primaryKpi} threshold after $${afterSpend} spent — raise budget in 20% steps.`,
  };
}

function pickRunDays(ladder: KpiTargetLadder, primaryKpi: KpiName): number {
  const starter = ladder.targets.find(
    (t) => t.kpi === primaryKpi && t.tier === "starter"
  );
  // Heuristic: high-tier products (CPA breakeven >= $60) need longer runs.
  const cpaStarter = ladder.targets.find(
    (t) => t.kpi === "cpa" && t.tier === "starter"
  );
  if (cpaStarter && cpaStarter.breakeven >= 60) return 10;
  if (starter && starter.unit === "ratio") return 7;
  return 5;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
