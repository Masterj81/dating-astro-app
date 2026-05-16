// tracking-readiness.ts — Tracking Readiness Score.
//
// Deterministic 0-100 readiness score against a fixed checklist of
// measurement pre-flight items. v1 has no live data source, so each
// check's status is derived from the ProductInput fields that imply it.
// "unknown" counts as a warning but not a blocker.
//
// Voice is BigAd's own — generic measurement-discipline phrasing.

import type {
  ProductInput,
  TrackingReadinessCheck,
  TrackingReadinessCheckKind,
  TrackingReadinessScore,
} from "@/types/strategy";

interface CheckSpec {
  kind: TrackingReadinessCheckKind;
  label: string;
  evaluate: (input: ProductInput) => Pick<TrackingReadinessCheck, "status" | "rationale" | "fix">;
}

const CHECK_SPECS: CheckSpec[] = [
  {
    kind: "pixel-installed",
    label: "Pixel / browser-side event source installed",
    evaluate: (input) => {
      // If there is a campaignType, the operator is far enough along to imply
      // the browser source. No campaignType → unknown.
      if (input.campaignType === "launch" || input.campaignType === "seasonal") {
        return {
          status: "passed",
          rationale: `Active campaign type (${input.campaignType}) implies the pixel is live and firing.`,
        };
      }
      if (input.campaignType === "always-on") {
        return {
          status: "passed",
          rationale: `Always-on campaign implies the pixel is already installed and firing.`,
        };
      }
      return {
        status: "unknown",
        rationale: `Campaign type not declared — cannot infer whether the pixel is live yet.`,
        fix: `Pick a campaign type and confirm the pixel fires on the canonical pageview.`,
      };
    },
  },
  {
    kind: "conversion-events",
    label: "Conversion events mapped to the goal",
    evaluate: (input) => {
      const goal = (input.goal || "").trim();
      if (!goal) {
        return {
          status: "blocker",
          rationale: `No goal declared — no event can be mapped to a conversion.`,
          fix: `Declare the optimised goal in the Product panel. Until then, the platform cannot optimise.`,
        };
      }
      const lower = goal.toLowerCase();
      const concrete =
        lower.includes("purchase") ||
        lower.includes("signup") ||
        lower.includes("sign up") ||
        lower.includes("install") ||
        lower.includes("subscribe") ||
        lower.includes("trial") ||
        lower.includes("download") ||
        lower.includes("lead") ||
        lower.includes("contact");
      if (concrete) {
        return {
          status: "passed",
          rationale: `The goal "${goal}" maps cleanly to a standard event.`,
        };
      }
      return {
        status: "warning",
        rationale: `The goal "${goal}" is not a standard conversion event name.`,
        fix: `Map the goal to a canonical event (purchase / signup / install / trial / lead) so attribution is unambiguous.`,
      };
    },
  },
  {
    kind: "exclusion-audiences",
    label: "Exclusion audiences configured",
    evaluate: (input) => {
      // If audience is concretely defined, we can imply an exclusion of
      // existing customers. Without an audience field there is nothing
      // to exclude against.
      if ((input.audience || "").trim().length >= 8) {
        return {
          status: "warning",
          rationale: `Audience is declared, but exclusion sets are unverified — overlap with existing customers is the most common silent leak.`,
          fix: `Build exclusion audiences from purchasers / trialists / lapsed users; attach to each cold ad set.`,
        };
      }
      return {
        status: "unknown",
        rationale: `Audience not declared — cannot infer whether exclusions are set.`,
        fix: `Declare the audience, then configure an exclusion against existing customers and recent buyers.`,
      };
    },
  },
  {
    kind: "permissions-set",
    label: "Account permissions and roles confirmed",
    evaluate: (input) => {
      // Hard to infer from inputs; mark unknown unless campaignType is set.
      if (input.campaignType) {
        return {
          status: "warning",
          rationale: `Campaign type is set but role-permissions are not auditable from the inputs.`,
          fix: `Confirm at least one admin owns the account and at least one read-only role is wired to analytics.`,
        };
      }
      return {
        status: "unknown",
        rationale: `No campaign declared — permissions audit cannot be implied.`,
      };
    },
  },
  {
    kind: "naming-convention",
    label: "Naming convention fixed before launch",
    evaluate: (input) => {
      const name = (input.name || "").trim();
      if (name.length === 0) {
        return {
          status: "blocker",
          rationale: `Product name missing — naming convention cannot anchor on the product slug.`,
          fix: `Set the product name, then derive campaign / ad-set / ad name slugs deterministically from it.`,
        };
      }
      return {
        status: "passed",
        rationale: `Product slug "${name}" anchors a stable naming pattern: PRODUCT-FUNNEL-COUNTRY-CONCEPT-VARIANT.`,
      };
    },
  },
  {
    kind: "utm-template",
    label: "UTM template fixed at platform level",
    evaluate: (input) => {
      // If the platform-level UTM is implied (we have a name + a campaign), pass.
      const hasName = (input.name || "").trim().length > 0;
      if (hasName && input.campaignType) {
        return {
          status: "passed",
          rationale: `Product slug + campaign type lets the platform substitute consistent UTMs at the account level.`,
        };
      }
      if (hasName) {
        return {
          status: "warning",
          rationale: `Product slug is set but no campaign type — UTM template can be drafted but should be re-checked before launch.`,
          fix: `Pick a campaign type, then commit the UTM template at the account level (not per ad).`,
        };
      }
      return {
        status: "unknown",
        rationale: `No product slug — UTM template has nothing to anchor on.`,
      };
    },
  },
  {
    kind: "landing-fast",
    label: "Landing page load fast on mobile",
    evaluate: (input) => {
      // If we have a defined product + price + audience + differentiator,
      // the landing page is likely real enough to assess. We can't measure
      // load time deterministically, so mark warning.
      const ready =
        (input.name || "").trim().length > 0 &&
        (input.price || "").trim().length > 0 &&
        (input.differentiator || "").trim().length > 0;
      if (ready) {
        return {
          status: "warning",
          rationale: `Strategy implies an active landing page — load time is unverified.`,
          fix: `Run a mobile-LCP check; target under 2.5s for the cold pageview.`,
        };
      }
      return {
        status: "unknown",
        rationale: `Landing page status cannot be inferred from the inputs yet.`,
      };
    },
  },
  {
    kind: "consent-banner",
    label: "Consent banner present and not breaking events",
    evaluate: (input) => {
      // Always warning until verified — Europe / iOS audiences depend on it.
      const eu = /(eu|europe|gdpr|uk)/i.test(
        `${input.audience} ${input.competitors} ${input.description}`
      );
      if (eu) {
        return {
          status: "warning",
          rationale: `Audience description references EU / GDPR scope — consent flow must be confirmed not to suppress conversion events.`,
          fix: `Confirm the consent banner returns the user's choice synchronously and that conversion events fire after acceptance.`,
        };
      }
      return {
        status: "warning",
        rationale: `Consent banner status is not inferrable from the inputs; verify it is wired before spend.`,
        fix: `Even outside EU, declare consent state and confirm conversion events fire after the banner resolves.`,
      };
    },
  },
  {
    kind: "post-purchase-survey",
    label: "Post-purchase / post-conversion attribution survey",
    evaluate: (input) => {
      const ctx = input.offerContext;
      if (ctx && typeof ctx.targetROAS === "number") {
        return {
          status: "passed",
          rationale: `Target ROAS is set — a post-purchase survey closes the attribution loop against platform numbers.`,
        };
      }
      return {
        status: "warning",
        rationale: `No target ROAS declared — the post-purchase attribution survey is not anchored to a number yet.`,
        fix: `Pick a target ROAS and a one-question post-purchase survey ("how did you hear about us?") to triangulate platform reporting.`,
      };
    },
  },
  {
    kind: "test-purchase-confirmed",
    label: "Test purchase / test conversion confirmed end-to-end",
    evaluate: (input) => {
      const hasPrice = (input.price || "").trim().length > 0;
      if (hasPrice) {
        return {
          status: "warning",
          rationale: `Price is set, but a real test purchase end-to-end is unverified.`,
          fix: `Run one real transaction at the live price; confirm the event lands in the ad platform within the attribution window.`,
        };
      }
      return {
        status: "unknown",
        rationale: `No price declared — a test purchase cannot be sized yet.`,
      };
    },
  },
];

export function assessTrackingReadiness(
  input: ProductInput
): TrackingReadinessScore {
  const checks: TrackingReadinessCheck[] = CHECK_SPECS.map((spec) => {
    const evaluated = spec.evaluate(input);
    return {
      kind: spec.kind,
      label: spec.label,
      status: evaluated.status,
      rationale: evaluated.rationale,
      fix: evaluated.fix,
    };
  });

  const blockers = checks.filter((c) => c.status === "blocker").length;
  const warnings = checks.filter(
    (c) => c.status === "warning" || c.status === "unknown"
  ).length;
  const passed = checks.filter((c) => c.status === "passed").length;
  const total = checks.length;

  const baseScore = Math.floor((100 * passed) / total);
  const score = clamp(baseScore - 10 * blockers - 5 * warnings, 0, 100);

  let status: TrackingReadinessScore["status"];
  if (blockers > 0 || score < 50) status = "not-ready";
  else if (score < 80) status = "almost";
  else status = "ready";

  return {
    score,
    status,
    blockers,
    warnings,
    checks,
  };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
