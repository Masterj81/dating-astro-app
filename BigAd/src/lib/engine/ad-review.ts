// ad-review.ts — Ad Review Checklist.
//
// 15-axis pre-handoff checklist. Static-ish questions; weights vary
// with campaignType and priceTier so the operator's attention is
// steered where it matters most for the run. Deterministic, pure.
//
// Also exports applyAdReview(): a deterministic evaluator that scores a
// target (CreatorBrief or BaseConcept) against the checklist and emits
// per-axis findings plus an overall score percent and a verdict.

import type {
  AdReviewChecklist,
  AdReviewFinding,
  AppliedAdReview,
  BaseConcept,
  CampaignType,
  CreatorBrief,
  CreatorBriefSection,
  FindingVerdict,
  ProductInput,
  ReviewAxis,
  ReviewAxisKind,
  VideoScript,
} from "@/types/strategy";

type PriceTier = "low" | "mid" | "high" | "unknown";

function parsePriceTier(price: string): PriceTier {
  if (!price) return "unknown";
  const lower = price.toLowerCase();
  if (lower.includes("free")) return "low";
  const match = price.match(/\d+(?:[.,]\d+)?/);
  if (!match) return "unknown";
  const value = Number(match[0].replace(",", "."));
  if (!Number.isFinite(value)) return "unknown";
  if (value < 30) return "low";
  if (value < 200) return "mid";
  return "high";
}

interface AxisSpec {
  kind: ReviewAxisKind;
  label: string;
  question: string;
  baseWeight: 1 | 2 | 3;
}

const SPECS: AxisSpec[] = [
  {
    kind: "hook-clarity",
    label: "Hook clarity",
    question: `Does the first 3 seconds name a stake the viewer recognises in their own words?`,
    baseWeight: 3,
  },
  {
    kind: "first-3s-payoff",
    label: "First-3s payoff",
    question: `Is there a concrete payoff — a number, a name, or a visual — inside the first three seconds?`,
    baseWeight: 3,
  },
  {
    kind: "claim-specificity",
    label: "Claim specificity",
    question: `Is at least one claim concrete enough that a competitor in the category could not also say it?`,
    baseWeight: 2,
  },
  {
    kind: "proof-strength",
    label: "Proof strength",
    question: `Is every claim paired with a proof type (testimonial / demo / before-after / data) in the same beat?`,
    baseWeight: 3,
  },
  {
    kind: "offer-visibility",
    label: "Offer visibility",
    question: `Is the offer surfaced once — clearly — without becoming the whole ad?`,
    baseWeight: 2,
  },
  {
    kind: "cta-clarity",
    label: "CTA clarity",
    question: `Is there exactly one ask, on camera, with the product name and the action in the same sentence?`,
    baseWeight: 3,
  },
  {
    kind: "platform-fit",
    label: "Platform fit",
    question: `Does the ad feel native to its placement (vertical-first, captions baked in, no platform watermarks)?`,
    baseWeight: 2,
  },
  {
    kind: "tone-match",
    label: "Tone match",
    question: `Does the spoken register match the audience's own — not too formal, not too jokey?`,
    baseWeight: 1,
  },
  {
    kind: "awareness-fit",
    label: "Awareness fit",
    question: `Does the opener match the audience's awareness stage — pain-first for cold, mechanism-first for warm?`,
    baseWeight: 2,
  },
  {
    kind: "pacing",
    label: "Pacing",
    question: `Are cuts dense enough in the first 10 seconds (one every 2-3 seconds) without becoming chaotic?`,
    baseWeight: 2,
  },
  {
    kind: "visual-hierarchy",
    label: "Visual hierarchy",
    question: `Is the eye guided to one focal point per beat — no competing overlays or split attention?`,
    baseWeight: 2,
  },
  {
    kind: "captions-overlay",
    label: "Captions and overlay",
    question: `Are captions burned in, legible, and matching the audio? Are overlays under 8 words per frame?`,
    baseWeight: 2,
  },
  {
    kind: "audio-quality",
    label: "Audio quality",
    question: `Is the on-camera voice clean of room reverb, with music bed sitting under the VO by at least 6 dB?`,
    baseWeight: 1,
  },
  {
    kind: "brand-presence",
    label: "Brand presence",
    question: `Does the product appear visually within the first half so the viewer recovers the brand on a mute scroll?`,
    baseWeight: 2,
  },
  {
    kind: "tracking-readiness-ref",
    label: "Tracking readiness reference",
    question: `Have the conversion events, naming convention, and UTM template been confirmed before this ad spends?`,
    baseWeight: 2,
  },
];

export function buildAdReviewChecklist(input: ProductInput): AdReviewChecklist {
  const tier = parsePriceTier(input.price);
  const campaign: CampaignType = input.campaignType ?? "always-on";

  const axes: ReviewAxis[] = SPECS.map((spec) => {
    const weight = adjustWeight(spec, tier, campaign);
    return {
      kind: spec.kind,
      label: spec.label,
      question: spec.question,
      weight,
    };
  });

  const totalWeight = axes.reduce((acc, a) => acc + a.weight, 0);
  return { axes, totalWeight };
}

function adjustWeight(
  spec: AxisSpec,
  tier: PriceTier,
  campaign: CampaignType
): 1 | 2 | 3 {
  let w: 1 | 2 | 3 = spec.baseWeight;

  // High-ticket products: proof-strength and claim-specificity matter more.
  if (tier === "high") {
    if (spec.kind === "proof-strength" || spec.kind === "claim-specificity") {
      w = 3;
    }
  }

  // Low-ticket products: pacing and first-3s-payoff carry the run.
  if (tier === "low") {
    if (spec.kind === "first-3s-payoff" || spec.kind === "pacing") {
      w = 3;
    }
  }

  // Launch campaigns: offer-visibility climbs.
  if (campaign === "launch") {
    if (spec.kind === "offer-visibility") {
      w = 3;
    }
  }
  // Seasonal: tracking-readiness-ref climbs because the window is finite.
  if (campaign === "seasonal") {
    if (spec.kind === "tracking-readiness-ref") {
      w = 3;
    }
  }
  // Always-on: brand-presence climbs.
  if (campaign === "always-on") {
    if (spec.kind === "brand-presence") {
      w = 3;
    }
  }

  return w;
}

// ---------------- Applied Ad Review ----------------

type ApplyTarget =
  | { kind: "brief"; brief: CreatorBrief; videoScript?: VideoScript }
  | { kind: "concept"; concept: BaseConcept };

const IMPERATIVE_VERBS = [
  "tap",
  "try",
  "get",
  "join",
  "start",
  "buy",
  "download",
  "install",
  "subscribe",
  "sign",
  "claim",
  "book",
  "open",
  "see",
  "watch",
  "shop",
  "save",
  "grab",
  "discover",
  "learn",
  "find",
  "tell",
  "ship",
  "use",
];

const PROOF_TOKENS = [
  "testimonial",
  "demo",
  "before",
  "after",
  "before-after",
  "data",
  "screenshot",
  "screen",
  "case",
  "result",
  "review",
];

const OFFER_TOKENS = [
  "free",
  "discount",
  "off",
  "bundle",
  "guarantee",
  "trial",
  "shipping",
  "gift",
  "payment",
  "save",
  "%",
];

export function applyAdReview(
  target: ApplyTarget,
  input: ProductInput,
  checklist: AdReviewChecklist
): AppliedAdReview {
  const findings: AdReviewFinding[] = checklist.axes.map((axis) =>
    evaluateAxis(axis, target, input)
  );

  const totalScore = findings.reduce(
    (acc, f) => acc + f.scoreContribution,
    0
  );
  const maxScore = checklist.axes.reduce((acc, a) => acc + a.weight, 0);
  const scorePercent =
    maxScore <= 0 ? 0 : Math.round((100 * totalScore) / maxScore);

  let verdict: AppliedAdReview["verdict"];
  if (scorePercent >= 80) verdict = "ready";
  else if (scorePercent >= 50) verdict = "almost";
  else verdict = "not-ready";

  const targetId =
    target.kind === "brief" ? target.brief.id : target.concept.id;

  return {
    targetId,
    targetKind: target.kind,
    axes: checklist.axes.map((a) => ({ ...a })),
    findings,
    totalScore,
    maxScore,
    scorePercent,
    verdict,
  };
}

function evaluateAxis(
  axis: ReviewAxis,
  target: ApplyTarget,
  input: ProductInput
): AdReviewFinding {
  const partial = deriveVerdict(axis.kind, target, input);
  const verdict = partial.verdict;
  const scoreContribution = scoreFromVerdict(verdict, axis.weight);
  return {
    axis: axis.kind,
    verdict,
    evidence: partial.evidence,
    fix: verdict === "passed" ? undefined : partial.fix ?? defaultFix(axis.kind),
    weight: axis.weight,
    scoreContribution,
  };
}

function scoreFromVerdict(
  verdict: FindingVerdict,
  weight: 1 | 2 | 3
): number {
  if (verdict === "passed") return weight;
  if (verdict === "partial") return Math.ceil(weight / 2);
  return 0;
}

interface AxisCall {
  verdict: FindingVerdict;
  evidence: string;
  fix?: string;
}

function deriveVerdict(
  kind: ReviewAxisKind,
  target: ApplyTarget,
  input: ProductInput
): AxisCall {
  if (target.kind === "concept") {
    return deriveVerdictForConcept(kind, target.concept, input);
  }
  return deriveVerdictForBrief(kind, target.brief, target.videoScript, input);
}

function deriveVerdictForBrief(
  kind: ReviewAxisKind,
  brief: CreatorBrief,
  videoScript: VideoScript | undefined,
  input: ProductInput
): AxisCall {
  const hookSection = brief.sections[0];
  const problemSection = brief.sections[1];
  const proofSection = brief.sections[2];
  const ctaSection = brief.sections[3];

  switch (kind) {
    case "hook-clarity": {
      const sayPopulated =
        !!hookSection?.whatToSay && hookSection.whatToSay.length > 0;
      const dur = hookSection?.durationSeconds ?? 99;
      if (sayPopulated && dur <= 5) {
        return {
          verdict: "passed",
          evidence: `Hook section has ${hookSection?.whatToSay?.length ?? 0} say bullets and is ~${dur}s.`,
        };
      }
      return {
        verdict: "partial",
        evidence: `Hook section ${sayPopulated ? "has copy direction" : "lacks copy direction"}, duration ~${dur}s.`,
        fix: `Make sure the hook section names what to say in 1–3 bullets and the duration sits under 5 seconds.`,
      };
    }
    case "first-3s-payoff": {
      const dur = hookSection?.durationSeconds ?? 99;
      const hasShow =
        !!hookSection?.whatToShow && hookSection.whatToShow.length > 0;
      if (dur <= 3 && hasShow) {
        return {
          verdict: "passed",
          evidence: `Hook section is ~${dur}s with ${hookSection?.whatToShow?.length ?? 0} visual cues.`,
        };
      }
      if (hasShow || dur <= 3) {
        return {
          verdict: "partial",
          evidence: `Hook section duration ~${dur}s; visual cues ${hasShow ? "present" : "missing"}.`,
          fix: `Add a concrete visual payoff inside the first 3 seconds.`,
        };
      }
      return {
        verdict: "missing",
        evidence: `Hook section has no visual cues and runs ~${dur}s.`,
        fix: `Drop a visual payoff into the first 3 seconds of the hook.`,
      };
    }
    case "claim-specificity": {
      const blob = collectBriefText(brief);
      if (hasSpecificityToken(blob)) {
        return {
          verdict: "passed",
          evidence: `Brief copy contains a number, named entity, or unit marker.`,
        };
      }
      return {
        verdict: "partial",
        evidence: `Brief copy is qualitative — no digit, named entity, or unit ($, %, x).`,
        fix: `Add at least one digit, a named entity, or a unit ($/%/x) inside a section beat or say bullet.`,
      };
    }
    case "proof-strength": {
      const proofBlob = collectSectionText(proofSection);
      if (PROOF_TOKENS.some((t) => proofBlob.toLowerCase().includes(t))) {
        return {
          verdict: "passed",
          evidence: `Solution/proof section references a proof modality.`,
        };
      }
      return {
        verdict: "missing",
        evidence: `Solution/proof section does not reference testimonial / demo / before-after / data / screenshot.`,
        fix: `Name a proof modality (testimonial / demo / before-after / data) inside the solution-or-proof section.`,
      };
    }
    case "offer-visibility": {
      const ctaBlob = collectSectionText(ctaSection).toLowerCase();
      const offerLabels = (input.offerContext ? OFFER_TOKENS : OFFER_TOKENS).map(
        (t) => t
      );
      const hit = offerLabels.some((t) => ctaBlob.includes(t));
      if (hit) {
        return {
          verdict: "passed",
          evidence: `CTA section copy references an offer-shaped token.`,
        };
      }
      return {
        verdict: "partial",
        evidence: `CTA section does not surface an offer kind from the offer set.`,
        fix: `Make the offer visible inside the CTA beat (free trial, bundle, guarantee, etc.).`,
      };
    }
    case "cta-clarity": {
      const sayLines = ctaSection?.whatToSay ?? [];
      const hasSay = sayLines.length > 0;
      const blob = sayLines.join(" ").toLowerCase();
      const hasVerb = IMPERATIVE_VERBS.some((v) =>
        new RegExp(`\\b${v}\\b`).test(blob)
      );
      if (hasSay && hasVerb) {
        return {
          verdict: "passed",
          evidence: `CTA section has copy lines and at least one imperative verb.`,
        };
      }
      return {
        verdict: hasSay ? "partial" : "missing",
        evidence: hasSay
          ? `CTA section has copy but no imperative verb.`
          : `CTA section has no copy lines.`,
        fix: `Add one imperative ask to the CTA section (try / start / get / join / download …).`,
      };
    }
    case "platform-fit": {
      const dur = brief.durationSeconds;
      if (dur > 60) {
        return {
          verdict: "partial",
          evidence: `Brief duration ${dur}s is long for short-form placements.`,
          fix: `Cut the brief under 60 seconds or version a short cut alongside it.`,
        };
      }
      return {
        verdict: "passed",
        evidence: `Brief duration ${dur}s sits inside short-form envelope.`,
      };
    }
    case "tone-match": {
      const audiencePresent = (input.audience || "").trim().length > 0;
      const framingMentionsAudience =
        audiencePresent &&
        brief.framing
          .toLowerCase()
          .includes((input.audience || "").trim().split(/\s+/)[0].toLowerCase());
      if (audiencePresent && framingMentionsAudience) {
        return {
          verdict: "passed",
          evidence: `Framing line references the declared audience.`,
        };
      }
      if (audiencePresent) {
        return {
          verdict: "partial",
          evidence: `Audience is declared but framing does not echo it.`,
          fix: `Echo the audience term inside the framing rule so tone is anchored.`,
        };
      }
      return {
        verdict: "missing",
        evidence: `No audience declared — tone has nothing to match against.`,
        fix: `Declare the audience in the product panel.`,
      };
    }
    case "awareness-fit": {
      const altHooks = brief.altHooks ?? [];
      const awarenessKnown = !!input.awareness;
      if (awarenessKnown && altHooks.length >= 2) {
        return {
          verdict: "passed",
          evidence: `Awareness stage declared and ${altHooks.length} alt hooks present.`,
        };
      }
      return {
        verdict: "partial",
        evidence: `Awareness ${awarenessKnown ? "declared" : "missing"}; alt hooks count ${altHooks.length}.`,
        fix: `Provide at least two alt hooks tuned to the awareness stage.`,
      };
    }
    case "pacing": {
      if (!videoScript) {
        return {
          verdict: "unknown",
          evidence: `No video script attached — pacing cannot be inferred.`,
          fix: `Generate a video script for this brief.`,
        };
      }
      const sectionCounts = new Map<number, number>();
      for (const ln of videoScript.lines) {
        sectionCounts.set(
          ln.briefSectionIndex,
          (sectionCounts.get(ln.briefSectionIndex) ?? 0) + 1
        );
      }
      const sections = brief.sections.map((_, i) => sectionCounts.get(i) ?? 0);
      const allInRange = sections.every((c) => c >= 1 && c <= 3);
      if (allInRange) {
        return {
          verdict: "passed",
          evidence: `Every brief section has 1–3 script lines.`,
        };
      }
      return {
        verdict: "partial",
        evidence: `Some sections fall outside the 1–3 line envelope: ${sections.join(", ")}.`,
        fix: `Re-balance script lines so every section sits between 1 and 3 lines.`,
      };
    }
    case "visual-hierarchy": {
      const showCovered = brief.sections.every(
        (s) => !!s.whatToShow && s.whatToShow.length > 0
      );
      if (showCovered) {
        return {
          verdict: "passed",
          evidence: `All four brief sections name a visual cue.`,
        };
      }
      return {
        verdict: "partial",
        evidence: `Not every section has visual cues — eye direction is unclear.`,
        fix: `Add at least one whatToShow cue to every section.`,
      };
    }
    case "captions-overlay": {
      if (!videoScript) {
        return {
          verdict: "unknown",
          evidence: `No video script attached — overlay coverage cannot be checked.`,
          fix: `Generate a video script and confirm at least one overlay line is present.`,
        };
      }
      const hasOverlay = videoScript.lines.some(
        (l) => l.kind === "on-screen-text"
      );
      if (hasOverlay) {
        return {
          verdict: "passed",
          evidence: `Script contains at least one on-screen-text line.`,
        };
      }
      return {
        verdict: "missing",
        evidence: `Script has no on-screen-text lines — overlay is missing.`,
        fix: `Add at least one on-screen-text line so captions / overlays are baked in.`,
      };
    }
    case "audio-quality": {
      if (!videoScript) {
        return {
          verdict: "partial",
          evidence: `No script — assuming default audio quality without proof.`,
          fix: `Confirm a clean VO / room tone before handoff.`,
        };
      }
      const hasSfx = videoScript.lines.some((l) => l.kind === "sfx");
      const hasVo = videoScript.lines.some((l) => l.kind === "vo");
      if (hasSfx || hasVo) {
        return {
          verdict: "passed",
          evidence: `Script names ${hasVo ? "VO" : ""}${hasVo && hasSfx ? " and " : ""}${hasSfx ? "SFX" : ""} lines.`,
        };
      }
      return {
        verdict: "partial",
        evidence: `Script has no VO or SFX lines — audio direction is implicit.`,
        fix: `Add explicit VO or SFX lines so the audio bed is intentional.`,
      };
    }
    case "brand-presence": {
      const businessName = (input.name || "").trim().toLowerCase();
      if (!businessName) {
        return {
          verdict: "missing",
          evidence: `No business name declared — brand presence cannot be checked.`,
          fix: `Set the product name so the brand can recur on a mute scroll.`,
        };
      }
      const blob = collectBriefText(brief).toLowerCase();
      if (blob.includes(businessName)) {
        return {
          verdict: "passed",
          evidence: `Brief copy mentions the product name "${input.name}".`,
        };
      }
      return {
        verdict: "partial",
        evidence: `Brief copy does not mention the product name "${input.name}".`,
        fix: `Surface the product name in framing or in a section beat.`,
      };
    }
    case "tracking-readiness-ref": {
      if (input.offerContext) {
        return {
          verdict: "passed",
          evidence: `Offer context is set — measurement layer has anchors to attach to.`,
        };
      }
      return {
        verdict: "partial",
        evidence: `No offer context set — measurement anchors are weaker.`,
        fix: `Fill in COGS %, target margin %, AOV, or target ROAS so tracking has a number to anchor on.`,
      };
    }
  }
}

function deriveVerdictForConcept(
  kind: ReviewAxisKind,
  concept: BaseConcept,
  input: ProductInput
): AxisCall {
  // Concepts have far less shape than briefs — we score the five named
  // surfaces against the same axes where it makes sense, and emit
  // "unknown" elsewhere with a fix that points back at the brief.
  const blob = [
    concept.hook,
    concept.hold,
    concept.proof,
    concept.cta,
    concept.offer,
  ]
    .join(" ")
    .toLowerCase();

  switch (kind) {
    case "hook-clarity":
      return concept.hook.length > 0
        ? {
            verdict: "passed",
            evidence: `Concept hook is non-empty.`,
          }
        : {
            verdict: "missing",
            evidence: `Concept hook is empty.`,
            fix: `Write a non-empty hook for this concept.`,
          };
    case "first-3s-payoff":
      return concept.hook.length > 0 && /\d|[A-Z][a-z]+/.test(concept.hook)
        ? {
            verdict: "passed",
            evidence: `Concept hook carries a number or named entity.`,
          }
        : {
            verdict: "partial",
            evidence: `Concept hook is generic — no digit or named entity.`,
            fix: `Add a number or named entity to the concept hook.`,
          };
    case "claim-specificity":
      return hasSpecificityToken(blob)
        ? {
            verdict: "passed",
            evidence: `Concept copy contains a digit, named entity, or unit.`,
          }
        : {
            verdict: "partial",
            evidence: `Concept copy is qualitative.`,
            fix: `Tighten one surface (proof / hold) with a number or named entity.`,
          };
    case "proof-strength":
      return PROOF_TOKENS.some((t) => concept.proof.toLowerCase().includes(t))
        ? {
            verdict: "passed",
            evidence: `Concept proof references a proof modality.`,
          }
        : {
            verdict: "partial",
            evidence: `Concept proof does not name testimonial / demo / before-after / data.`,
            fix: `Name a proof modality in the proof surface.`,
          };
    case "offer-visibility":
      return OFFER_TOKENS.some((t) => concept.offer.toLowerCase().includes(t))
        ? {
            verdict: "passed",
            evidence: `Concept offer surface references an offer-shaped token.`,
          }
        : {
            verdict: "partial",
            evidence: `Concept offer surface does not name an offer kind.`,
            fix: `Make the offer kind explicit on the offer surface.`,
          };
    case "cta-clarity": {
      const hasVerb = IMPERATIVE_VERBS.some((v) =>
        new RegExp(`\\b${v}\\b`).test(concept.cta.toLowerCase())
      );
      return hasVerb
        ? {
            verdict: "passed",
            evidence: `Concept CTA uses an imperative verb.`,
          }
        : {
            verdict: "partial",
            evidence: `Concept CTA does not use a clear imperative verb.`,
            fix: `Rewrite the CTA with one imperative verb.`,
          };
    }
    case "brand-presence": {
      const businessName = (input.name || "").trim().toLowerCase();
      if (!businessName) {
        return {
          verdict: "missing",
          evidence: `No business name declared.`,
          fix: `Set the product name.`,
        };
      }
      return blob.includes(businessName)
        ? {
            verdict: "passed",
            evidence: `Concept copy mentions the product name.`,
          }
        : {
            verdict: "partial",
            evidence: `Concept copy does not mention the product name.`,
            fix: `Surface the product name in one of the concept fields.`,
          };
    }
    case "tracking-readiness-ref":
      return input.offerContext
        ? {
            verdict: "passed",
            evidence: `Offer context is set on the input.`,
          }
        : {
            verdict: "partial",
            evidence: `No offer context set on the input.`,
            fix: `Fill in COGS / margin / AOV / ROAS in the offer context.`,
          };
    default:
      return {
        verdict: "unknown",
        evidence: `Axis "${kind}" cannot be evaluated from a concept alone — needs a full brief.`,
        fix: `Score this axis against the brief, not the concept.`,
      };
  }
}

function collectBriefText(brief: CreatorBrief): string {
  const parts: string[] = [brief.framing, ...brief.altHooks];
  for (const s of brief.sections) {
    parts.push(s.label, s.beat);
    if (s.whatToSay) parts.push(...s.whatToSay);
    if (s.whatToShow) parts.push(...s.whatToShow);
  }
  return parts.join(" \n ");
}

function collectSectionText(section: CreatorBriefSection | undefined): string {
  if (!section) return "";
  const parts: string[] = [section.beat, section.label];
  if (section.whatToSay) parts.push(...section.whatToSay);
  if (section.whatToShow) parts.push(...section.whatToShow);
  return parts.join(" \n ");
}

function hasSpecificityToken(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (/[$%]|\b\d+x\b/i.test(text)) return true;
  // Named entity proxy: an uppercase token longer than 1 char that is not
  // a sentence opener. We deliberately ignore the very first word.
  const words = text.split(/\s+/).slice(1);
  for (const w of words) {
    const stripped = w.replace(/[^A-Za-z]/g, "");
    if (stripped.length > 1 && /^[A-Z]/.test(stripped)) return true;
  }
  return false;
}

function defaultFix(kind: ReviewAxisKind): string {
  return `Tighten the ${kind} axis before handoff.`;
}
