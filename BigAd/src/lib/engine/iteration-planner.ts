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
import type { Learning, LearningMemory } from "@/types/workspace";

export interface NextIterationPlannerArgs {
  input: ProductInput;
  kpiLadder: KpiTargetLadder;
  creativeTestingMatrix: CreativeTestingMatrix;
  proofAssetPlan: ProofAssetPlan;
  hookLibrary: HookLibrary;
  adConceptCards: AdConceptCard[];
  // Optional client-layer hand-off from the Project Workspace. When
  // present, the planner appends memory-derived recommendations AFTER
  // the existing seven weak-signal recommendations. The engine stays
  // deterministic: same memory → same plan.
  learningMemory?: LearningMemory;
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

  // Memory-derived recommendations are APPENDED at the end so the
  // existing seven weak-signal recommendations remain stable and at
  // their fixed indices. Same memory → same appended block.
  if (args.learningMemory) {
    recommendations.push(...buildMemoryRecommendations(args.learningMemory));
  }

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

// buildMemoryRecommendations — appends high-confidence wins (as
// "double down") and any losses (as "retire from next batch"). Capped
// so the appended block never overwhelms the seven fixed signals: at
// most 2 per signal-direction (4 total memory recommendations).
function buildMemoryRecommendations(
  memory: LearningMemory
): IterationRecommendation[] {
  const out: IterationRecommendation[] = [];

  const highWins: Learning[] = memory.learnings
    .filter(
      (l) => l.confidence === "high" && l.signal.endsWith("-winning")
    )
    .slice(0, 2);
  const losses: Learning[] = memory.learnings
    .filter((l) => l.signal.endsWith("-losing"))
    .slice(0, 2);

  for (const learning of highWins) {
    out.push({
      signal: "winning",
      diagnosis: `Memory: ${learning.subject} is a repeated winner across ${learning.supportingResultIds.length} test${
        learning.supportingResultIds.length === 1 ? "" : "s"
      }.`,
      nextSteps: [
        `Double down on ${learning.subject} in the next batch — keep it as the control.`,
        `Allocate the largest budget share to cells that carry ${learning.subject}.`,
      ],
      nextAssetsToProduce: [],
      nextAnglesToTry: [],
    });
  }

  for (const learning of losses) {
    out.push({
      signal: "winning", // existing WeakSignal union; use "winning" placeholder
      diagnosis: `Memory: ${learning.subject} has lost across ${learning.supportingResultIds.length} test${
        learning.supportingResultIds.length === 1 ? "" : "s"
      }.`,
      nextSteps: [
        `Retire ${learning.subject} from the next test batch.`,
        `Replace it with a different ${signalKindLabel(learning.signal)} from the queue.`,
      ],
      nextAssetsToProduce: [],
      nextAnglesToTry: [],
    });
  }

  return out;
}

function signalKindLabel(signal: string): string {
  if (signal.startsWith("hook-pattern")) return "hook pattern";
  if (signal.startsWith("offer-kind")) return "offer kind";
  if (signal.startsWith("format")) return "format";
  if (signal.startsWith("avatar")) return "avatar";
  if (signal.startsWith("audience-tier")) return "audience tier";
  return "test variable";
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
