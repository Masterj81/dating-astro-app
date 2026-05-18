// delivery-summary.ts — pure / deterministic derivation for the
// Agency Packaging Layer.
//
// `buildDeliverySummary(input)` reads the active strategy plus any
// selected template / role / package plus the live review board /
// learning memory and emits a single object with six grouped fields
// for the AgencyPanel's "Delivery summary" section AND for the
// markdown export.
//
// None of these functions call `Date.now()`. `derivedAt` is the max of
// every caller-supplied timestamp across the board + memory + strategy.
// Same input twice → byte-identical output.

import type { Strategy } from "@/types/strategy";
import type { LearningMemory } from "@/types/workspace";
import type {
  ReviewBoardSummary,
  ReviewComment,
  ReviewItem,
} from "@/types/review";
import { reviewItemKindLabel } from "@/lib/review/review-board";
import { ROLE_PRESETS } from "./catalog";
import type {
  DeliverySummary,
  PackagePreset,
  ProjectTemplate,
  RolePreset,
} from "@/types/agency";

export interface DeliverySummaryInput {
  strategy: Strategy;
  template?: ProjectTemplate;
  role?: RolePreset;
  pkg?: PackagePreset;
  reviewBoard?: {
    items: ReviewItem[];
    comments: ReviewComment[];
    summary: ReviewBoardSummary;
  };
  learningMemory?: LearningMemory;
}

// ---- helpers ----------------------------------------------------------

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const key = v.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function isoToEpoch(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

// ---- whatWasDecided ---------------------------------------------------

function buildWhatWasDecided(s: Strategy): string[] {
  const out: string[] = [];
  const positioning = s.positioning;
  if (positioning && positioning.forWhom) {
    out.push(
      `Positioning: for ${positioning.forWhom} — ${positioning.category || "the category"}, unique on ${positioning.unique || "the named differentiator"}.`
    );
  }
  const topOffer = s.offers && s.offers[0];
  if (topOffer) {
    out.push(`Top offer: ${topOffer.label} (${topOffer.kind}).`);
  }
  const avatar = s.audienceAvatars && s.audienceAvatars[0];
  if (avatar) {
    out.push(
      `Primary avatar: ${avatar.label} — buying trigger: ${avatar.buyingTrigger}`
    );
  }
  const ladder = s.kpiLadder;
  if (ladder && Array.isArray(ladder.targets) && ladder.targets.length > 0) {
    const primary = ladder.targets.filter((t) => t.tier === "healthy");
    const top = primary.slice(0, 3).map((t) => t.kpi);
    if (top.length > 0) {
      out.push(`Primary KPIs: ${top.join(", ")}.`);
    }
  }
  const cal = s.campaignCalendar;
  if (cal && Array.isArray(cal.windows) && cal.windows.length > 0) {
    out.push(`Campaign shape: ${cal.windows.length}-window calendar.`);
  }
  const cm = s.creativeTestingMatrix;
  if (cm && Array.isArray(cm.recommendedFirstBatch)) {
    out.push(
      `First batch: ${cm.recommendedFirstBatch.length} test cells, max ${cm.maxConcurrentTests} concurrent.`
    );
  }
  return out;
}

// ---- whatNeedsApproval -----------------------------------------------

function buildWhatNeedsApproval(
  reviewBoard: DeliverySummaryInput["reviewBoard"]
): string[] {
  if (!reviewBoard) {
    return ["No active review board — start one from the Review tab to surface pending approvals."];
  }
  const summary = reviewBoard.summary;
  const out: string[] = [];
  const pending = summary.pendingCriticalKinds;
  if (pending.length === 0) {
    out.push("All critical review items are approved.");
  } else {
    for (const kind of pending) {
      out.push(`Pending critical approval: ${reviewItemKindLabel(kind)}.`);
    }
  }
  if (summary.unresolvedComments > 0) {
    out.push(
      `${summary.unresolvedComments} unresolved comment${summary.unresolvedComments === 1 ? "" : "s"} on the review board.`
    );
  }
  if (summary.blockedItems > 0) {
    out.push(
      `${summary.blockedItems} item${summary.blockedItems === 1 ? "" : "s"} currently blocked.`
    );
  }
  return out;
}

// ---- whatWillLaunchFirst ---------------------------------------------

function buildWhatWillLaunchFirst(s: Strategy): string[] {
  const cm = s.creativeTestingMatrix;
  if (!cm || !Array.isArray(cm.testCells)) return [];
  const byId = new Map<string, (typeof cm.testCells)[number]>();
  for (const c of cm.testCells) byId.set(c.id, c);
  const out: string[] = [];
  const batch = (cm.recommendedFirstBatch ?? []).slice(0, 6);
  for (const id of batch) {
    const cell = byId.get(id);
    if (!cell) continue;
    out.push(
      `${cell.angle} — hook "${cell.hook}" on ${cell.format} (${cell.funnelStage}).`
    );
  }
  return out;
}

// ---- missingAssets ----------------------------------------------------

function buildMissingAssets(s: Strategy): string[] {
  const out: string[] = [];
  const plan = s.proofAssetPlan;
  if (plan && Array.isArray(plan.missingBeforeSpend)) {
    for (const id of plan.missingBeforeSpend) {
      const asset =
        plan.priorityAssets.find((a) => a.id === id) ?? null;
      if (asset) {
        out.push(`Missing proof: ${asset.title}.`);
      } else {
        out.push(`Missing proof asset id ${id}.`);
      }
    }
  }
  // Critical Creative QA findings — treat blockers across the briefs as
  // missing assets that block the launch.
  if (Array.isArray(s.creativeQa)) {
    for (const qa of s.creativeQa) {
      for (const f of qa.findings) {
        if (f.severity === "blocker") {
          out.push(`Creative QA blocker (${qa.scope}): ${f.message}`);
        }
      }
    }
  }
  return dedupe(out);
}

// ---- clientNeedsToProvide --------------------------------------------

function buildClientNeedsToProvide(
  template: ProjectTemplate | undefined,
  role: RolePreset | undefined,
  reviewBoard: DeliverySummaryInput["reviewBoard"]
): string[] {
  const out: string[] = [];

  if (template) {
    // Approximate "not captured" — there is no client-side capture log
    // yet, so until that exists we surface the full template requirement
    // list as items the client owns. Once a capture log lands, intersect
    // with !captured.
    for (const req of template.defaultProofRequirements) {
      out.push(req);
    }
  }

  // Always include the client role's defaultQuestions as conversation
  // starters the client owns the answer to. This matches the spec:
  // "role==='client'.defaultQuestions".
  const clientRole = ROLE_PRESETS["client"];
  for (const q of clientRole.defaultQuestions) {
    out.push(q);
  }

  // If the caller passed a different role, append that role's
  // questions too — small additive signal so the picker remains useful.
  if (role && role.id !== "client") {
    for (const q of role.defaultQuestions) {
      out.push(q);
    }
  }

  // If the review board has open client-authored comments, surface
  // them so the client sees what's already open against them.
  if (reviewBoard) {
    for (const c of reviewBoard.comments) {
      if (c.author === "client" && !c.resolved) {
        out.push(`Open client comment: ${c.body}`);
      }
    }
  }

  return dedupe(out);
}

// ---- nextMeetingAgenda -----------------------------------------------

function buildNextMeetingAgenda(
  s: Strategy,
  reviewBoard: DeliverySummaryInput["reviewBoard"]
): string[] {
  const agenda: string[] = [];

  // 1. Top 3 pending critical approvals (priority).
  if (reviewBoard) {
    const pending = reviewBoard.summary.pendingCriticalKinds.slice(0, 3);
    for (const kind of pending) {
      agenda.push(`Walk through ${reviewItemKindLabel(kind)} for approval.`);
    }
  }

  // 2. Top 2 missing must-have proof assets.
  const plan = s.proofAssetPlan;
  if (plan && Array.isArray(plan.missingBeforeSpend)) {
    const top = plan.missingBeforeSpend.slice(0, 2);
    for (const id of top) {
      const asset = plan.priorityAssets.find((a) => a.id === id);
      if (asset) {
        agenda.push(`Plan capture for proof asset: ${asset.title}.`);
      } else {
        agenda.push(`Plan capture for proof asset ${id}.`);
      }
    }
  }

  // 3. Top 1 next-iteration recommendation.
  const ip = s.nextIterationPlan;
  if (ip && Array.isArray(ip.recommendations) && ip.recommendations.length > 0) {
    const rec = ip.recommendations[0];
    agenda.push(`Next iteration: ${rec.signal} — ${rec.diagnosis}`);
  }

  return agenda;
}

// ---- derivedAt --------------------------------------------------------

function buildDerivedAt(input: DeliverySummaryInput): number {
  let derivedAt = 0;
  if (input.reviewBoard) {
    const s = input.reviewBoard.summary;
    if (typeof s.derivedAt === "number" && s.derivedAt > derivedAt) {
      derivedAt = s.derivedAt;
    }
    for (const it of input.reviewBoard.items) {
      if (typeof it.updatedAt === "number" && it.updatedAt > derivedAt) {
        derivedAt = it.updatedAt;
      }
      if (typeof it.approvedAt === "number" && it.approvedAt > derivedAt) {
        derivedAt = it.approvedAt;
      }
    }
    for (const c of input.reviewBoard.comments) {
      if (typeof c.createdAt === "number" && c.createdAt > derivedAt) {
        derivedAt = c.createdAt;
      }
      if (typeof c.resolvedAt === "number" && c.resolvedAt > derivedAt) {
        derivedAt = c.resolvedAt;
      }
    }
  }
  if (input.learningMemory) {
    const ms = isoToEpoch(input.learningMemory.derivedAt);
    if (ms > derivedAt) derivedAt = ms;
  }
  // Strategy has no generatedAt today; if a future field appears here,
  // fold it in via `(input.strategy as { generatedAt?: number })`.
  const sgen = (input.strategy as { generatedAt?: number }).generatedAt;
  if (typeof sgen === "number" && sgen > derivedAt) {
    derivedAt = sgen;
  }
  return derivedAt;
}

// ---- public entry -----------------------------------------------------

export function buildDeliverySummary(
  input: DeliverySummaryInput
): DeliverySummary {
  return {
    whatWasDecided: buildWhatWasDecided(input.strategy),
    whatNeedsApproval: buildWhatNeedsApproval(input.reviewBoard),
    whatWillLaunchFirst: buildWhatWillLaunchFirst(input.strategy),
    missingAssets: buildMissingAssets(input.strategy),
    clientNeedsToProvide: buildClientNeedsToProvide(
      input.template,
      input.role,
      input.reviewBoard
    ),
    nextMeetingAgenda: buildNextMeetingAgenda(input.strategy, input.reviewBoard),
    derivedAt: buildDerivedAt(input),
  };
}
