// calendar-dips.ts — deterministic dip-forecast helper for the Campaign
// Calendar. Replaces the legacy boolean `expectedDip` flag with a small
// set of mechanism-typed forecasts.
//
// Heuristics (deterministic — no randomness):
//   - peak window  → post-peak-reset (severity "notable", offset = durationDays - 1)
//   - echo window  → warm-cohort-saturation (severity "soft", offset = floor(durationDays / 2))
//   - tail window  → warm-cohort-exhaustion (severity "soft" if always-on, "notable" otherwise)
//   - ramp window in seasonal, durationDays >= 7 → urgency-collapse (severity "soft", offset = floor(durationDays / 2))
//   - everything else → empty array

import type {
  CampaignType,
  CampaignWindowKind,
  DipForecast,
} from "@/types/strategy";

export function forecastDips(
  campaignType: CampaignType,
  kind: CampaignWindowKind,
  durationDays: number
): DipForecast[] {
  const out: DipForecast[] = [];

  if (kind === "peak") {
    // Always-on quarterly peaks aren't a hard promo cliff, so the
    // post-peak-reset reads as soft rather than notable.
    const severity: DipForecast["severity"] =
      campaignType === "always-on" ? "soft" : "notable";
    out.push({
      mechanism: "post-peak-reset",
      severity,
      expectedAroundDayOffset: Math.max(0, durationDays - 1),
      rationale:
        "Demand compresses around the anchor day; the calm that follows is structural, not a failure signal.",
    });
    return out;
  }

  if (kind === "echo") {
    out.push({
      mechanism: "warm-cohort-saturation",
      severity: "soft",
      expectedAroundDayOffset: Math.floor(durationDays / 2),
      rationale:
        "The warmed cohort has now seen the offer enough times that incremental impressions earn less.",
    });
    return out;
  }

  if (kind === "tail") {
    const severity: DipForecast["severity"] =
      campaignType === "always-on" ? "soft" : "notable";
    out.push({
      mechanism: "warm-cohort-exhaustion",
      severity,
      expectedAroundDayOffset: Math.floor(durationDays / 2),
      rationale:
        "Holdouts who were going to convert on this offer already did; the remaining warm pool is largely tapped.",
    });
    return out;
  }

  if (kind === "ramp" && campaignType === "seasonal" && durationDays >= 7) {
    out.push({
      mechanism: "urgency-collapse",
      severity: "soft",
      expectedAroundDayOffset: Math.floor(durationDays / 2),
      rationale:
        "Long ramp windows leak urgency across the weekend; expect a softer day before the anchor.",
    });
    return out;
  }

  return out;
}
