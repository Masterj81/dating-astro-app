// creative-qa.ts — Creative QA Checklist.
//
// Deterministic rule evaluator. Given the briefs, video scripts, shot
// lists, static briefs, variant sets, and the source input, return one
// CreativeQA per brief plus one aggregate. Each finding is rule-typed
// and carries a severity (ok / warning / blocker), a one-sentence
// message, and a concrete suggestion.

import type {
  CreativeQA,
  CreatorBrief,
  CtaBank,
  ProductInput,
  QaFinding,
  QaRule,
  QaSeverity,
  ShotList,
  StaticAdBrief,
  VariantSet,
  VideoScript,
  Angle,
} from "@/types/strategy";

interface QaInputs {
  briefs: CreatorBrief[];
  videoScripts: VideoScript[];
  shotLists: ShotList[];
  staticBriefs: StaticAdBrief[];
  variantSets: VariantSet[];
  input: ProductInput;
  ctaBank?: CtaBank;
  angles?: Angle[];
}

const RULE_ORDER: QaRule[] = [
  "hook-clarity",
  "proof-visibility",
  "offer-visibility",
  "cta-clarity",
  "first-frame-clarity",
  "format-coverage",
  "runtime-coherence",
  "one-variable-testing",
  "visual-hierarchy",
  "message-angle-alignment",
  "audience-pain-present",
  "differentiation-present",
];

export function runCreativeQA(args: QaInputs): CreativeQA[] {
  const out: CreativeQA[] = [];
  const perBriefSummaries: CreativeQA[] = args.briefs.map((brief) =>
    runForBrief(brief, args)
  );
  out.push(...perBriefSummaries);
  out.push(buildAggregate(perBriefSummaries));
  return out;
}

function runForBrief(brief: CreatorBrief, args: QaInputs): CreativeQA {
  const findings: QaFinding[] = [];
  for (const rule of RULE_ORDER) {
    findings.push(evalRule(rule, brief, args));
  }
  return summarise(brief.id, findings);
}

function evalRule(
  rule: QaRule,
  brief: CreatorBrief,
  args: QaInputs
): QaFinding {
  switch (rule) {
    case "hook-clarity":
      return ruleHookClarity(brief);
    case "proof-visibility":
      return ruleProofVisibility(brief);
    case "offer-visibility":
      return ruleOfferVisibility(brief, args);
    case "cta-clarity":
      return ruleCtaClarity(brief, args);
    case "first-frame-clarity":
      return ruleFirstFrameClarity(brief, args);
    case "format-coverage":
      return ruleFormatCoverage(brief, args);
    case "runtime-coherence":
      return ruleRuntimeCoherence(brief, args);
    case "one-variable-testing":
      return ruleOneVariableTesting(brief, args);
    case "visual-hierarchy":
      return ruleVisualHierarchy(brief);
    case "message-angle-alignment":
      return ruleMessageAngleAlignment(brief, args);
    case "audience-pain-present":
      return ruleAudiencePainPresent(args);
    case "differentiation-present":
      return ruleDifferentiationPresent(args);
  }
}

// ---- Per-rule evaluators --------------------------------------------------

function ruleHookClarity(brief: CreatorBrief): QaFinding {
  const hookSection = brief.sections[0];
  const hasSay = !!(
    hookSection &&
    hookSection.whatToSay &&
    hookSection.whatToSay.length > 0
  );
  const shortEnough =
    !!hookSection && hookSection.durationSeconds <= 5;
  if (hasSay && shortEnough) {
    return ok(
      "hook-clarity",
      `Hook beat has concrete direction and lands inside the first five seconds.`,
      brief.id
    );
  }
  return warning(
    "hook-clarity",
    !hasSay
      ? `Hook section lacks 'say' direction, so the creator has no opener to hit.`
      : `Hook section runs longer than five seconds, which pushes the payoff past the scroll-stop window.`,
    !hasSay
      ? `Add 2-4 concrete say-lines to the hook section so the opener is filmable on a single take.`
      : `Tighten the hook section to 3-5 seconds and move the rest into the problem beat.`,
    brief.id
  );
}

function ruleProofVisibility(brief: CreatorBrief): QaFinding {
  const proofSection = brief.sections[2];
  const haystack = sectionText(proofSection).toLowerCase();
  const proofTokens = [
    "testimonial",
    "demo",
    "before/after",
    "before-after",
    "data",
  ];
  const hit = proofTokens.some((t) => haystack.includes(t));
  if (hit) {
    return ok(
      "proof-visibility",
      `Solution / proof beat names at least one proof type (testimonial / demo / before-after / data).`,
      brief.id
    );
  }
  return warning(
    "proof-visibility",
    `Solution / proof beat does not name a proof type, so the claim is unsupported on camera.`,
    `Add one explicit proof beat to the solution section — testimonial soundbite, live demo, before-after pair, or data callout.`,
    brief.id
  );
}

function ruleOfferVisibility(
  brief: CreatorBrief,
  args: QaInputs
): QaFinding {
  // Look for any offer-kind token in the solution-or-proof or CTA section,
  // or in any static brief associated with the brief.
  const ctaSection = brief.sections[3];
  const solSection = brief.sections[2];
  const offerTokens = [
    "discount",
    "bundle",
    "guarantee",
    "free shipping",
    "free-shipping",
    "free gift",
    "free-gift",
    "payment plan",
    "payment-plan",
    "trial",
    "free-trial",
    "free trial",
  ];
  const haystack = (
    sectionText(solSection) +
    " " +
    sectionText(ctaSection) +
    " " +
    args.staticBriefs
      .filter((s) => s.briefId === brief.id)
      .map((s) => `${s.headlineOverlay} ${s.subOverlay} ${s.ctaBadge}`)
      .join(" ")
  ).toLowerCase();
  const hit = offerTokens.some((t) => haystack.includes(t));
  if (hit) {
    return ok(
      "offer-visibility",
      `Offer kind appears at least once in the solution / CTA beats or the static brief overlays.`,
      brief.id
    );
  }
  return warning(
    "offer-visibility",
    `No offer kind is named in the solution / CTA beats or the static briefs.`,
    `Surface the recommended offer kind once — in the CTA beat or as a small badge on the static brief.`,
    brief.id
  );
}

function ruleCtaClarity(
  brief: CreatorBrief,
  args: QaInputs
): QaFinding {
  // Map brief deliverable hints to the recommended CTA surface. We treat
  // any non-empty CTA bank with at least one meta-feed / reels / tiktok
  // entry as "ok" for this rule, since the brief itself does not commit
  // to a single surface.
  const bank = args.ctaBank;
  if (!bank || bank.variants.length === 0) {
    return warning(
      "cta-clarity",
      `CTA bank is empty, so the editor has no surface-specific CTA copy to drop in.`,
      `Re-run buildStrategy with a populated CTA bank; check that input.name and audience are filled in.`,
      brief.id
    );
  }
  const hasFeedOrReels = bank.variants.some(
    (v) =>
      v.surface === "meta-feed" ||
      v.surface === "meta-reels" ||
      v.surface === "tiktok"
  );
  if (hasFeedOrReels) {
    return ok(
      "cta-clarity",
      `CTA bank covers at least one short-form surface, so the brief can pull a clean CTA into the closing beat.`,
      brief.id
    );
  }
  return warning(
    "cta-clarity",
    `CTA bank has no short-form surface entries, so the brief lacks a ready-made closing line.`,
    `Add one direct or curious variant for meta-feed, meta-reels, or tiktok in the CTA bank.`,
    brief.id
  );
}

function ruleFirstFrameClarity(
  brief: CreatorBrief,
  args: QaInputs
): QaFinding {
  const briefStatics = args.staticBriefs.filter(
    (s) => s.briefId === brief.id
  );
  const usable = briefStatics.find(
    (s) => s.headlineOverlay.length > 0 && s.heroElement.length > 0
  );
  if (usable) {
    return ok(
      "first-frame-clarity",
      `At least one static brief has a non-empty headline overlay and hero element.`,
      brief.id
    );
  }
  return blocker(
    "first-frame-clarity",
    `No static brief for this brief has both a headline overlay and a hero element, so the first frame is unbuildable.`,
    `Re-run static-brief generation after filling in audience pain and differentiator so the headline + hero elements seed cleanly.`,
    brief.id
  );
}

function ruleFormatCoverage(
  brief: CreatorBrief,
  args: QaInputs
): QaFinding {
  const sizes = new Set(
    args.staticBriefs.filter((s) => s.briefId === brief.id).map((s) => s.size)
  );
  const want = new Set(["1:1", "4:5", "9:16"]);
  const missing: string[] = [];
  for (const s of want) if (!sizes.has(s as "1:1" | "4:5" | "9:16")) missing.push(s);
  if (missing.length === 0) {
    return ok(
      "format-coverage",
      `Static briefs cover all three sizes — 1:1, 4:5, and 9:16.`,
      brief.id
    );
  }
  if (missing.length === 1) {
    return warning(
      "format-coverage",
      `Static briefs cover two of three sizes; missing ${missing.join(", ")}.`,
      `Add a static brief variant for ${missing.join(", ")} so the placement plan does not leak coverage.`,
      brief.id
    );
  }
  return blocker(
    "format-coverage",
    `Static briefs cover fewer than two sizes; missing ${missing.join(", ")}.`,
    `Re-run the static-brief generator; the brief currently cannot be placed across feed, reels, and stories without rework.`,
    brief.id
  );
}

function ruleRuntimeCoherence(
  brief: CreatorBrief,
  args: QaInputs
): QaFinding {
  const script = args.videoScripts.find((s) => s.briefId === brief.id);
  if (!script) {
    return warning(
      "runtime-coherence",
      `No video script is paired with this brief, so the runtime envelope can't be validated.`,
      `Generate a line-level script for ${brief.id} before handing off to the editor.`,
      brief.id
    );
  }
  const delta = Math.abs(script.totalDurationSeconds - brief.durationSeconds);
  if (delta <= 2) {
    return ok(
      "runtime-coherence",
      `Video script total duration is within ±2s of the brief envelope.`,
      brief.id
    );
  }
  return warning(
    "runtime-coherence",
    `Video script total duration is off by ${delta.toFixed(1)}s vs the brief envelope.`,
    `Rebalance line durations in the script so the section sums stay inside the brief envelope.`,
    brief.id
  );
}

function ruleOneVariableTesting(
  brief: CreatorBrief,
  args: QaInputs
): QaFinding {
  const vset = args.variantSets.find((v) =>
    v.baseConceptId.startsWith(brief.id + "-")
  );
  if (!vset) {
    return blocker(
      "one-variable-testing",
      `No variant set is paired with this brief, so the test plan has nothing to ship.`,
      `Run generateVariantSets after the brief so each base concept gets a 5-axis variant set.`,
      brief.id
    );
  }
  if (vset.variants.length !== 5) {
    return blocker(
      "one-variable-testing",
      `Variant set has ${vset.variants.length} variants — should be exactly five (one per axis).`,
      `Recompute the variant set; the engine emits hook / hold / proof / cta / offer.`,
      brief.id
    );
  }
  return ok(
    "one-variable-testing",
    `Variant set has exactly five variants, one per axis — clean test plan.`,
    brief.id
  );
}

function ruleVisualHierarchy(brief: CreatorBrief): QaFinding {
  const everyHasShow = brief.sections.every(
    (s) => Array.isArray(s.whatToShow) && (s.whatToShow?.length ?? 0) > 0
  );
  if (everyHasShow) {
    return ok(
      "visual-hierarchy",
      `Every brief section carries visual direction, so the editor never has to invent a frame.`,
      brief.id
    );
  }
  return warning(
    "visual-hierarchy",
    `At least one brief section is missing visual direction.`,
    `Add 1-3 'show' lines to every section so the visual hierarchy stays intentional.`,
    brief.id
  );
}

function ruleMessageAngleAlignment(
  brief: CreatorBrief,
  args: QaInputs
): QaFinding {
  const angleNames = (args.angles ?? []).map((a) => a.name);
  if (angleNames.length === 0) {
    // Without an angles list to validate against, treat as ok.
    return ok(
      "message-angle-alignment",
      `Angle list not supplied to QA — alignment check skipped.`,
      brief.id
    );
  }
  if (angleNames.includes(brief.forAngle)) {
    return ok(
      "message-angle-alignment",
      `Brief forAngle matches one of the strategy's angles.`,
      brief.id
    );
  }
  return blocker(
    "message-angle-alignment",
    `Brief forAngle does not match any angle in the strategy.`,
    `Regenerate creator briefs from the ranked angles so each brief.forAngle is one of the known angle names.`,
    brief.id
  );
}

function ruleAudiencePainPresent(args: QaInputs): QaFinding {
  if (args.input.audiencePain && args.input.audiencePain.trim().length > 0) {
    return ok(
      "audience-pain-present",
      `Audience pain is filled in — the creative has a stake to name.`
    );
  }
  return warning(
    "audience-pain-present",
    `Audience pain is empty; creative direction will default to generic friction language.`,
    `Fill in audience pain in the input panel before regenerating creative.`
  );
}

function ruleDifferentiationPresent(args: QaInputs): QaFinding {
  const diff = args.input.differentiator?.trim() ?? "";
  if (diff.length > 0) {
    return ok(
      "differentiation-present",
      `Differentiator is filled in — claims have something specific to anchor on.`
    );
  }
  // Check for contrarian wording in any angle.
  const contrarianTokens = [
    "backwards",
    "not what you think",
    "everyone gets wrong",
    "wrong about",
    "contrarian",
  ];
  const angleHaystack = (args.angles ?? [])
    .map((a) => `${a.name} ${a.hook}`)
    .join(" ")
    .toLowerCase();
  const hasContrarian = contrarianTokens.some((t) =>
    angleHaystack.includes(t)
  );
  if (hasContrarian) {
    return ok(
      "differentiation-present",
      `Differentiator field is empty but at least one angle uses contrarian framing as a stand-in.`
    );
  }
  return warning(
    "differentiation-present",
    `Differentiator is empty and no angle uses contrarian framing.`,
    `Fill in a concrete differentiator mechanism — adjectives won't carry the strategy.`
  );
}

// ---- Aggregate ------------------------------------------------------------

function buildAggregate(perBrief: CreativeQA[]): CreativeQA {
  // Pull cross-cutting findings (audience-pain / differentiation) once
  // each, then sum blocker / warning counts across the per-brief sets.
  const findings: QaFinding[] = [];
  const aggregateRules: QaRule[] = [
    "audience-pain-present",
    "differentiation-present",
  ];
  const seen = new Set<QaRule>();
  for (const cq of perBrief) {
    for (const f of cq.findings) {
      if (aggregateRules.includes(f.rule) && !seen.has(f.rule)) {
        findings.push({ ...f, source: "aggregate" });
        seen.add(f.rule);
      }
    }
  }
  // Add an aggregate summary finding rolling up format coverage across
  // briefs. Treat any blocker on format-coverage in any brief as a
  // blocker at the aggregate.
  const fcStatuses = perBrief
    .map((cq) => cq.findings.find((f) => f.rule === "format-coverage"))
    .filter(Boolean) as QaFinding[];
  if (fcStatuses.length > 0) {
    const hasBlocker = fcStatuses.some((f) => f.severity === "blocker");
    const hasWarning = fcStatuses.some((f) => f.severity === "warning");
    if (hasBlocker) {
      findings.push(
        blocker(
          "format-coverage",
          `Across all briefs, at least one brief is missing two or more static sizes.`,
          `Regenerate static briefs after filling in any missing input fields, then re-run QA.`,
          "aggregate"
        )
      );
    } else if (hasWarning) {
      findings.push(
        warning(
          "format-coverage",
          `Across all briefs, at least one brief is missing a single static size.`,
          `Add the missing 1:1, 4:5, or 9:16 variant in the static brief output.`,
          "aggregate"
        )
      );
    } else {
      findings.push(
        ok(
          "format-coverage",
          `Across all briefs, every brief covers all three static sizes.`,
          "aggregate"
        )
      );
    }
  }

  return summarise("all", findings);
}

// ---- Helpers --------------------------------------------------------------

function summarise(scope: string, findings: QaFinding[]): CreativeQA {
  const blockerCount = findings.filter((f) => f.severity === "blocker").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  return {
    scope,
    findings,
    blockerCount,
    warningCount,
  };
}

function ok(rule: QaRule, message: string, source?: string): QaFinding {
  return { rule, severity: "ok", message, suggestion: "", source };
}

function warning(
  rule: QaRule,
  message: string,
  suggestion: string = "",
  source?: string
): QaFinding {
  return { rule, severity: "warning", message, suggestion, source };
}

function blocker(
  rule: QaRule,
  message: string,
  suggestion: string,
  source?: string
): QaFinding {
  return { rule, severity: "blocker", message, suggestion, source };
}

function sectionText(
  section: { whatToSay?: string[]; whatToShow?: string[]; beat: string } | undefined
): string {
  if (!section) return "";
  const say = section.whatToSay ?? [];
  const show = section.whatToShow ?? [];
  return [section.beat, ...say, ...show].join(" ");
}
