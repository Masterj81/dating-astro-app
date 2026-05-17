// editor-handoff.ts — Editor Handoff Brief.
//
// For each creator brief, emit a self-contained markdown handoff that
// includes concept thesis, audience, hook, video script, shot list,
// static briefs, CTA picks, offer context, QA findings, variant axis
// info, and a per-brief asset checklist. Deterministic, pure, no API.

import type {
  AppliedAdReview,
  CreativeQA,
  CreatorBrief,
  CtaBank,
  CtaSurface,
  CtaVariant,
  EditorHandoff,
  OfferRecommendation,
  ProductInput,
  QaFinding,
  ShotList,
  StaticAdBrief,
  VariantSet,
  VideoScript,
} from "@/types/strategy";
import type { CopyLabels } from "./copy-normalize";
import { deriveCopyLabels } from "./copy-normalize";

interface HandoffInputs {
  briefs: CreatorBrief[];
  videoScripts: VideoScript[];
  shotLists: ShotList[];
  staticBriefs: StaticAdBrief[];
  ctaBank: CtaBank;
  variantSets: VariantSet[];
  creativeQa: CreativeQA[];
  appliedAdReviews: AppliedAdReview[];
  input: ProductInput;
  offers: OfferRecommendation[];
  labels?: CopyLabels;
}

export function buildEditorHandoffs(args: HandoffInputs): EditorHandoff[] {
  const labels = args.labels ?? deriveCopyLabels(args.input, args.offers);
  const resolved: HandoffInputs = { ...args, labels };
  return args.briefs.map((brief) => buildOne(brief, resolved));
}

function buildOne(brief: CreatorBrief, args: HandoffInputs): EditorHandoff {
  const script = args.videoScripts.find((s) => s.briefId === brief.id);
  const shotList = args.shotLists.find((s) => s.briefId === brief.id);
  const statics = args.staticBriefs.filter((s) => s.briefId === brief.id);
  const qa = args.creativeQa.find((q) => q.scope === brief.id);
  const applied = args.appliedAdReviews.find((r) => r.targetId === brief.id);
  const vset = args.variantSets.find((v) =>
    v.baseConceptId.startsWith(brief.id + "-")
  );

  const lines: string[] = [];

  // Title
  lines.push(`# ${brief.id} — ${brief.forAngle} (~${brief.durationSeconds}s)`);
  lines.push("");

  // Concept thesis
  lines.push("## Concept thesis");
  lines.push(thesisLine(brief, args.input, args.labels));
  lines.push("");

  // Target audience
  lines.push("## Target audience");
  lines.push(audienceLine(args.input, args.labels));
  lines.push("");

  // Hook
  lines.push("## Hook");
  const hookSection = brief.sections[0];
  if (hookSection) {
    lines.push(`**Beat (≈${hookSection.durationSeconds}s).** ${hookSection.beat}`);
    if (hookSection.whatToSay && hookSection.whatToSay.length > 0) {
      lines.push("");
      lines.push("Say:");
      for (const s of hookSection.whatToSay) lines.push(`- ${s}`);
    }
    if (hookSection.whatToShow && hookSection.whatToShow.length > 0) {
      lines.push("");
      lines.push("Show:");
      for (const s of hookSection.whatToShow) lines.push(`- ${s}`);
    }
  }
  if (brief.altHooks.length > 0) {
    lines.push("");
    lines.push("Alternate hook openers:");
    for (const h of brief.altHooks) lines.push(`- ${h}`);
  }
  lines.push("");

  // Video script
  lines.push("## Video script");
  if (script && script.lines.length > 0) {
    lines.push(`Total ~${script.totalDurationSeconds}s.`);
    lines.push("");
    lines.push(`| # | Section | Kind | Start | Dur | Text |`);
    lines.push(`|---|---------|------|-------|-----|------|`);
    for (const ln of script.lines) {
      lines.push(
        `| ${ln.index} | ${sectionIndexLabel(ln.briefSectionIndex)} | ${scriptKindLabel(ln.kind)} | ${ln.startSeconds}s | ${ln.durationSeconds}s | ${cell(ln.text)} |`
      );
    }
  } else {
    lines.push("_No paired video script._");
  }
  lines.push("");

  // Shot list
  lines.push("## Shot list");
  if (shotList && shotList.items.length > 0) {
    lines.push(`Total shots: ${shotList.totalShots}.`);
    lines.push("");
    lines.push(`| # | Kind | Framing | Angle | Duration | Sound |`);
    lines.push(`|---|------|---------|-------|----------|-------|`);
    for (const it of shotList.items) {
      lines.push(
        `| ${it.index} | ${it.kind} | ${cell(it.framing)} | ${it.angle} | ${it.duration} | ${cell(it.sound)} |`
      );
    }
  } else {
    lines.push("_No paired shot list._");
  }
  lines.push("");

  // Static briefs
  lines.push("## Static briefs");
  if (statics.length > 0) {
    for (const s of statics) {
      lines.push(`### ${s.size}`);
      lines.push(`- **Headline overlay:** ${s.headlineOverlay}`);
      if (s.subOverlay) lines.push(`- **Sub overlay:** ${s.subOverlay}`);
      lines.push(`- **Hero element:** ${s.heroElement}`);
      lines.push(`- **Proof element:** ${s.proofElement}`);
      lines.push(`- **CTA badge:** ${s.ctaBadge}`);
      lines.push(`- **Reading order:** ${s.visualHierarchy}`);
      lines.push("");
    }
  } else {
    lines.push("_No static briefs paired with this brief._");
    lines.push("");
  }

  // CTA picks
  lines.push("## CTA picks");
  const picks = pickCtas(args.ctaBank);
  if (picks.length > 0) {
    for (const p of picks) {
      lines.push(`- **${p.style} / ${p.surface}.** "${p.text}" — ${p.rationale}`);
    }
  } else {
    lines.push("_CTA bank empty — re-run buildStrategy with complete inputs._");
  }
  lines.push("");

  // Offer context
  lines.push("## Offer context");
  const topOffer = args.offers[0];
  if (topOffer) {
    const beStr =
      typeof topOffer.breakevenROAS === "number"
        ? `${topOffer.breakevenROAS.toFixed(2)}x breakeven ROAS`
        : "breakeven ROAS not computed";
    lines.push(`- **Top recommended offer:** ${topOffer.label} (${topOffer.kind}).`);
    lines.push(`- **Stickiness risk:** ${topOffer.stickinessRisk}.`);
    lines.push(`- **Breakeven:** ${beStr}.`);
    lines.push(`- **Why:** ${topOffer.rationale}`);
  } else {
    lines.push("_No offer recommendation available._");
  }
  lines.push("");

  // QA findings
  lines.push("## QA findings");
  if (qa && qa.findings.length > 0) {
    lines.push(
      `Blockers: ${qa.blockerCount}. Warnings: ${qa.warningCount}.`
    );
    lines.push("");
    lines.push(`| Rule | Severity | Message | Suggestion |`);
    lines.push(`|------|----------|---------|------------|`);
    for (const f of qa.findings) {
      lines.push(
        `| ${f.rule} | ${f.severity} | ${cell(f.message)} | ${cell(f.suggestion || "—")} |`
      );
    }
  } else {
    lines.push("_No QA report paired with this brief._");
  }
  lines.push("");

  // Applied review snapshot (when present)
  if (applied) {
    lines.push("## Applied review snapshot");
    lines.push(
      `Score: **${applied.totalScore}/${applied.maxScore} (${applied.scorePercent}%)** — verdict: **${applied.verdict}**.`
    );
    lines.push("");
  }

  // Variant axis info
  lines.push("## Variant axis info");
  if (vset) {
    lines.push(
      `Variant set ${vset.baseConceptId} emits ${vset.variants.length} variants — one per axis (hook / hold / proof / cta / offer). Each variant changes exactly one axis from the base.`
    );
  } else {
    lines.push("_No variant set paired with this brief._");
  }
  lines.push("");

  // Asset checklist
  const assetChecklist = buildAssetChecklist(brief, args, statics.length);
  lines.push("## Asset checklist");
  for (const item of assetChecklist) lines.push(`- [ ] ${item}`);

  return {
    briefId: brief.id,
    markdown: lines.join("\n"),
    assetChecklist,
  };
}

// ---- Field synthesisers ---------------------------------------------------

function thesisLine(
  brief: CreatorBrief,
  input: ProductInput,
  labels?: CopyLabels
): string {
  const name = input.name || "the product";
  const L = labels;
  const audience = L?.audienceLabel.toLowerCase() ?? "the viewer";
  const pain = L?.painLabel ?? "the friction we name";
  const mech = L?.mechanismLabel ?? "the mechanism that matters";
  return (
    `For ${audience}, ${name} reframes ${pain} through ${mech}. ` +
    `This brief executes that thesis on the "${brief.forAngle}" angle in ~${brief.durationSeconds} seconds.`
  );
}

function audienceLine(input: ProductInput, labels?: CopyLabels): string {
  // Keep the raw audience description in the editor handoff (it's an
  // internal doc the editor uses; the full sentence is useful here).
  const audience = input.audience || "(audience unspecified)";
  const pain = labels?.painLabel ?? input.audiencePain ?? "(audience pain unspecified)";
  return `**Audience.** ${audience}\n\n**Core pain.** ${pain}`;
}

function pickCtas(bank: CtaBank): CtaVariant[] {
  // Prefer one direct meta-feed, one curious or proof-led short-form,
  // and one landing-primary — picked deterministically.
  const picks: CtaVariant[] = [];
  const pickOne = (
    style: "direct" | "curious" | "proof-led" | "time-boxed" | "low-pressure",
    surface: CtaSurface
  ) => {
    const found = bank.variants.find(
      (v) => v.style === style && v.surface === surface
    );
    if (found) picks.push(found);
  };
  pickOne("direct", "meta-feed");
  pickOne("curious", "meta-reels");
  pickOne("proof-led", "landing-primary");
  return picks;
}

function buildAssetChecklist(
  brief: CreatorBrief,
  args: HandoffInputs,
  staticCount: number
): string[] {
  const out: string[] = [];
  const campaign = args.input.campaignType ?? "always-on";
  // Always include source-file + master-vertical deliverables.
  out.push(`Vertical 9:16 master cut from this brief, watermark-free.`);
  out.push(`Source project file + raw footage handed off after final cut.`);
  // Campaign-type-specific cut-downs.
  if (campaign === "launch") {
    out.push(`Square 1:1 cut-down for feed placements.`);
    out.push(`Horizontal 16:9 cut-down for pre-roll inventory.`);
  } else if (campaign === "seasonal") {
    out.push(`Vertical 9:16 echo variant with fresh hook, same body.`);
  } else {
    out.push(`Second vertical 9:16 variant with a distinct hook opener.`);
    out.push(`Square 1:1 cut-down for feed placements.`);
  }
  // Static deliverables when paired statics exist.
  if (staticCount > 0) {
    out.push(`Static ad set in 1:1, 4:5, and 9:16 — first-frame brief attached.`);
  }
  // Captions + thumbnail are always cheap value-adds for the editor.
  out.push(`Burned-in captions on all vertical variants, brand-safe palette.`);
  out.push(`Thumbnail still pulled from the strongest single frame of the video.`);
  // Clamp to 4-8 by trimming overflow if any branch over-shot.
  return out.slice(0, 8);
}

// ---- Helpers --------------------------------------------------------------

function sectionIndexLabel(i: number): string {
  return ["Hook", "Problem", "Solution", "CTA"][i] ?? `Section ${i + 1}`;
}

function scriptKindLabel(kind: string): string {
  return (
    {
      vo: "VO",
      "on-camera": "On-cam",
      "on-screen-text": "Overlay",
      sfx: "SFX",
    }[kind] ?? kind
  );
}

function cell(s: string): string {
  return (s ?? "").replace(/\|/g, "/").replace(/\n+/g, " ").trim();
}
