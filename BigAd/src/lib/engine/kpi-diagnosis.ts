// kpi-diagnosis.ts — KPI Diagnosis Engine.
//
// Deterministic decision tree over a KpiSnapshot, the KpiTargetLadder,
// and the ProductInput. Identifies findings and a single primary
// category. When the snapshot is empty, returns a "healthy"-shaped
// placeholder so the UI/export has content. Pure, no API.

import type {
  DiagnosisCategory,
  DiagnosisFinding,
  KpiDiagnosis,
  KpiName,
  KpiSnapshot,
  KpiTarget,
  KpiTargetLadder,
  LadderTier,
  ProductInput,
} from "@/types/strategy";

const HEALTHY_TIER: LadderTier = "healthy";

export function diagnoseKpi(
  snapshot: KpiSnapshot,
  ladder: KpiTargetLadder,
  input: ProductInput
): KpiDiagnosis {
  const targets = healthyTargets(ladder);
  const findings: DiagnosisFinding[] = [];

  const ctrStatus = compareKpi("ctr", snapshot.ctr, targets);
  const cpmStatus = compareKpi("cpm", snapshot.cpm, targets);
  const cvrStatus = compareKpi("cvr", snapshot.cvr, targets);
  const roasStatus = compareKpi("roas", snapshot.roas, targets);
  const cpaStatus = compareKpi("cpa", snapshot.cpa, targets);
  const hookStatus = compareKpi("hookRate", snapshot.hookRate, targets);
  const holdStatus = compareKpi("holdRate", snapshot.holdRate, targets);

  // Rule 1: high CPM + low CTR → creative.
  if (cpmStatus === "below-breakeven" && ctrStatus === "below-breakeven") {
    findings.push({
      category: "creative",
      signal: "high CPM + low CTR",
      inference: `Auction is punishing the creative — the platform sees low engagement and prices impressions up. The fault sits in the hook or the first-3-seconds beat.`,
      recommendedAction: `Re-shoot the hook with a different archetype (question / contrarian / stat). Keep the audience and the offer constant.`,
    });
  }

  // Rule 2: normal CPM + high CTR + low CVR → landing-page or offer.
  if (
    (cpmStatus === "ok" || cpmStatus === "above-breakeven") &&
    ctrStatus === "above-breakeven" &&
    cvrStatus === "below-breakeven"
  ) {
    findings.push({
      category: "landing-page",
      signal: "CTR healthy, CVR below floor",
      inference: `The ad is earning the click but the landing page is leaking. Either the page does not match the ad's promise, or the offer floor is too high.`,
      recommendedAction: `Audit the headline-to-hero parity. Test a softer entry offer before changing creative.`,
    });
    findings.push({
      category: "offer",
      signal: "CVR below floor while CTR is healthy",
      inference: `The funnel earns attention but the offer's perceived cost is over the floor.`,
      recommendedAction: `Test a guarantee, a trial, or a payment-plan variant before re-shooting.`,
    });
  }

  // Rule 3: high CTR + healthy CVR + low ROAS → offer (margin) or audience (CPA).
  if (
    ctrStatus === "above-breakeven" &&
    cvrStatus !== "below-breakeven" &&
    roasStatus === "below-breakeven"
  ) {
    if (cpaStatus === "below-breakeven") {
      findings.push({
        category: "audience",
        signal: "CPA above floor despite healthy CTR/CVR",
        inference: `The audience is converting at acceptable rates but the unit cost is wrong for the basket — broaden the audience or shift to a lower-cost segment.`,
        recommendedAction: `Open the audience by one degree (one less interest layer); compare CPA over a 3-day floor.`,
      });
    } else {
      findings.push({
        category: "offer",
        signal: "ROAS below floor with healthy upper funnel",
        inference: `Top of funnel is fine but margin is too thin to clear the platform's tax. Offer-side levers, not creative-side.`,
        recommendedAction: `Tighten the bundle or remove the headline discount. Re-check breakeven ROAS.`,
      });
    }
  }

  // Rule 4: hookRate below floor and CTR below floor → creative (hook).
  if (hookStatus === "below-breakeven" && ctrStatus === "below-breakeven") {
    findings.push({
      category: "creative",
      signal: "hook rate below floor",
      inference: `Viewers leave in the first 1-3 seconds. The opener is the problem.`,
      recommendedAction: `Re-cut the first 3 seconds with a different opener archetype.`,
    });
  }

  // Rule 5: hookRate healthy but holdRate below → fatigue / mid-roll.
  if (
    hookStatus === "above-breakeven" &&
    holdStatus === "below-breakeven"
  ) {
    findings.push({
      category: "fatigue",
      signal: "hook OK, hold collapses",
      inference: `Viewers click in but the mid-roll cannot hold them. Either the message is exhausted, or the pacing flattens after the hook.`,
      recommendedAction: `Pattern-interrupt at 5-7 seconds. If the spend has been on this creative > 5 days, treat as fatigue and rotate.`,
    });
  }

  // Rule 6: tracking signal — if CTR is set but cvr/roas are not, attribution may be broken.
  if (
    typeof snapshot.ctr === "number" &&
    typeof snapshot.cvr !== "number" &&
    typeof snapshot.roas !== "number"
  ) {
    findings.push({
      category: "tracking",
      signal: "front-funnel metrics present, back-funnel missing",
      inference: `CTR is reporting but downstream conversion / ROAS are not — attribution is the suspect before creative.`,
      recommendedAction: `Verify the conversion event maps to the optimised goal and that the post-purchase event is firing.`,
    });
  }

  // Default: nothing tripped → healthy.
  if (findings.length === 0) {
    findings.push({
      category: "healthy",
      signal: "all sampled KPIs within healthy bounds",
      inference: `The sampled metrics sit inside the healthy-tier envelope. No single axis is the bottleneck — keep the test running and add budget incrementally.`,
      recommendedAction: `Add budget in 20% steps once metrics stay above breakeven for a 3-day floor.`,
    });
  }

  const primaryCategory = findings[0].category;

  return {
    snapshot,
    ladder,
    findings,
    primaryCategory,
  };
}

// A default snapshot used to seed buildStrategy with a synthetic
// diagnosis. Values land near the healthy-tier breakeven so the UI has
// readable content out of the box.
export function defaultSnapshotFromInput(
  input: ProductInput,
  ladder: KpiTargetLadder
): KpiSnapshot {
  const targets = healthyTargets(ladder);
  const snap: KpiSnapshot = {};
  for (const t of targets) {
    // Sit one step above breakeven for higher-better, one step below
    // breakeven for lower-better — i.e. neither failing nor scaling.
    const stepHi = (t.scaling - t.breakeven) / 4;
    const stepLo = (t.breakeven - t.scaling) / 4;
    if (t.direction === "higher-better") {
      snap[t.kpi] = roundTo(t.breakeven + stepHi, 2);
    } else {
      snap[t.kpi] = roundTo(t.breakeven - stepLo, 2);
    }
  }
  return snap;
}

function healthyTargets(ladder: KpiTargetLadder): KpiTarget[] {
  return ladder.targets.filter((t) => t.tier === HEALTHY_TIER);
}

type Comparison = "below-breakeven" | "ok" | "above-breakeven";

function compareKpi(
  name: KpiName,
  value: number | undefined,
  targets: KpiTarget[]
): Comparison | "unknown" {
  if (typeof value !== "number") return "unknown";
  const t = targets.find((x) => x.kpi === name);
  if (!t) return "unknown";
  if (t.direction === "higher-better") {
    if (value < t.breakeven) return "below-breakeven";
    if (value > t.scaling) return "above-breakeven";
    return "ok";
  }
  // lower-better
  if (value > t.breakeven) return "below-breakeven";
  if (value < t.scaling) return "above-breakeven";
  return "ok";
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
