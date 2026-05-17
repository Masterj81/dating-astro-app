// iteration-planner.ts — Next Iteration Planner.
//
// Emits one IterationRecommendation per WeakSignal (winning / weak-hook
// / weak-hold / weak-click / weak-conversion / weak-roas /
// proof-bottleneck). Each recommendation references the current
// strategy concretely: which hooks were used in the first batch, which
// proof assets are missing, which angles are queued. The plan is the
// "what to ship next" companion to the testing matrix.
//
// Deterministic — same inputs always produce the same plan.

import type {
  AdConceptCard,
  CreativeTestingMatrix,
  HookLibrary,
  IterationRecommendation,
  KpiTargetLadder,
  NextIterationPlan,
  ProductInput,
  ProofAssetPlan,
  WeakSignal,
} from "@/types/strategy";

export interface NextIterationPlannerArgs {
  input: ProductInput;
  kpiLadder: KpiTargetLadder;
  creativeTestingMatrix: CreativeTestingMatrix;
  proofAssetPlan: ProofAssetPlan;
  hookLibrary: HookLibrary;
  adConceptCards: AdConceptCard[];
}

const SIGNAL_ORDER: WeakSignal[] = [
  "winning",
  "weak-hook",
  "weak-hold",
  "weak-click",
  "weak-conversion",
  "weak-roas",
  "proof-bottleneck",
];

export function buildNextIterationPlan(
  args: NextIterationPlannerArgs
): NextIterationPlan {
  const recommendations: IterationRecommendation[] = SIGNAL_ORDER.map((s) =>
    buildRecommendation(s, args)
  );

  // Aggregate unique union of next assets / next angles.
  const nextAssetsToProduce = uniqueOrdered(
    recommendations.flatMap((r) => r.nextAssetsToProduce)
  );
  const nextAnglesToTry = uniqueOrdered(
    recommendations.flatMap((r) => r.nextAnglesToTry)
  );

  return {
    recommendations,
    nextAssetsToProduce,
    nextAnglesToTry,
  };
}

function buildRecommendation(
  signal: WeakSignal,
  args: NextIterationPlannerArgs
): IterationRecommendation {
  const { creativeTestingMatrix, proofAssetPlan, hookLibrary, adConceptCards } = args;
  const firstBatch = new Set(creativeTestingMatrix.recommendedFirstBatch);
  const usedHookTexts = creativeTestingMatrix.testCells
    .filter((c) => firstBatch.has(c.id))
    .map((c) => c.hook);

  switch (signal) {
    case "winning":
      return {
        signal,
        diagnosis:
          "A test cell sustained the scaling-tier threshold above breakeven — the concept earned its way out.",
        nextSteps: [
          "Move into the scale rule action: raise budget in 20% steps.",
          "Duplicate the winning cell into the Engaged-60d retargeting tier.",
          "Lock the winning hook + proof + offer as the new control before testing variations.",
        ],
        nextAssetsToProduce: [],
        nextAnglesToTry: [],
      };
    case "weak-hook": {
      const fresh = hookLibrary.items
        .filter((h) => !usedHookTexts.includes(h.text))
        .slice(0, 4)
        .map((h) => h.text);
      return {
        signal,
        diagnosis:
          "Hook rate is below the starter-tier floor — the opener is not earning a watch.",
        nextSteps: [
          "Swap to a different hook pattern from the library; keep the rest of the cell constant.",
          "Re-cut the first 3 seconds with a sharper opener (pain-first or contrarian).",
        ],
        nextAssetsToProduce: [],
        nextAnglesToTry: fresh,
      };
    }
    case "weak-hold":
      return {
        signal,
        diagnosis:
          "Hold rate fades inside the first 6-10 seconds — the mid-roll lost momentum before payoff.",
        nextSteps: [
          "Change pacing or structure: pattern-interrupt at 5-7s.",
          "Cut to product faster in 3-5s instead of building context.",
          "Test a carousel-then-video sequence for the same concept.",
        ],
        nextAssetsToProduce: [],
        nextAnglesToTry: ["carousel-then-video"],
      };
    case "weak-click": {
      // Static formats that haven't been tested in the first batch.
      const missingStatics = ["static-1-1", "static-4-5"].filter(
        (f) =>
          !creativeTestingMatrix.testCells
            .filter((c) => firstBatch.has(c.id))
            .some((c) => c.format === f)
      );
      return {
        signal,
        diagnosis:
          "CTR is below the starter-tier floor — viewers watched but did not click.",
        nextSteps: [
          "Change first-frame static brief: stronger visual hierarchy on the headline overlay.",
          "Test new visual hierarchy where the proof element leads the hero.",
        ],
        nextAssetsToProduce: missingStatics.length > 0 ? missingStatics : ["static-1-1-alt", "static-4-5-alt"],
        nextAnglesToTry: [],
      };
    }
    case "weak-conversion":
      return {
        signal,
        diagnosis:
          "CVR is below the starter-tier floor — clicks land but the page or offer does not close.",
        nextSteps: [
          "Test landing variants: alternate hero, alternate proof placement.",
          "Test offer variants: swap the lead offer for the next-best in the recommendation set.",
        ],
        nextAssetsToProduce: ["demo-video", "case-study"],
        nextAnglesToTry: [],
      };
    case "weak-roas":
      return {
        signal,
        diagnosis:
          "Upper-funnel signals are healthy but ROAS sits below breakeven — the unit economics or attribution are off.",
        nextSteps: [
          "Audit AOV, retention curves, and attribution against post-purchase survey numbers.",
          "Revisit the offer breakeven against current COGS and target margin.",
        ],
        nextAssetsToProduce: [],
        nextAnglesToTry: [],
      };
    case "proof-bottleneck": {
      const missing = proofAssetPlan.missingBeforeSpend.slice();
      const lowReadiness = proofAssetPlan.proofReadinessScore < 60;
      return {
        signal,
        diagnosis: lowReadiness
          ? `Proof readiness score is ${proofAssetPlan.proofReadinessScore} — the cells are running without enough proof.`
          : "Proof readiness is acceptable but the missing must-have assets cap the ceiling on the close.",
        nextSteps: [
          lowReadiness
            ? "Produce missing must-have proof assets before the next test batch."
            : "Add the missing must-have proof assets to the variant queue.",
          "Re-shoot at least one demo or screenshot with the production discipline laid out in the Proof Asset Plan.",
        ],
        nextAssetsToProduce: missing,
        nextAnglesToTry: [],
      };
    }
  }
}

function uniqueOrdered<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}
