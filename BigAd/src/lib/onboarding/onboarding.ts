// onboarding.ts — pure / deterministic derivation for the Onboarding
// & Demo Projects layer.
//
// Sits ABOVE the engine. `buildStrategy(input)` is byte-identical
// regardless of which onboarding goal the user has picked. None of
// the helpers in this file call `Date.now()` — timestamps come from
// stored records (`OnboardingState.updatedAt`, run / project / review
// derivedAt, etc.). Given the same context, the output is byte-
// identical.
//
// User-facing labels say "CampaignOS"; internal identifiers stay
// BigAd-shaped for migration continuity.

import type { PlaybookId } from "@/types/playbook";
import type {
  NextBestAction,
  NextBestActionKind,
  OnboardingGoal,
  OnboardingGoalId,
  OnboardingState,
  OnboardingStep,
  OnboardingStepId,
  ProgressChecklistItem,
} from "@/types/onboarding";
import type {
  InputQuality,
  ProductInput,
  ProofAssetPlan,
  Strategy,
  TrackingReadinessScore,
} from "@/types/strategy";
import type { ReviewBoardSummary } from "@/types/review";
import type { SavedProject, SavedRun } from "@/types/workspace";

// ---- Goals -------------------------------------------------------------

// Frozen list of seven goals — the first-run picker. Each goal maps to
// the playbook archetype CampaignOS recommends and the strategy
// section ids the operator should focus on first.
const ONBOARDING_GOALS: readonly OnboardingGoal[] = Object.freeze([
  Object.freeze({
    id: "launch-app",
    label: "Launch an app",
    description: "Push a consumer subscription app from soft launch to a paid first batch.",
    recommendedPlaybook: "mobile-app-launch",
    primaryModules: ["score", "offer", "audience", "proof", "execution"],
  }),
  Object.freeze({
    id: "launch-saas-trial",
    label: "Launch a SaaS trial",
    description: "Drive trial_start volume for a B2B or prosumer SaaS with a self-serve trial.",
    recommendedPlaybook: "saas-free-trial-launch",
    primaryModules: ["score", "offer", "hooks", "tracking", "execution"],
  }),
  Object.freeze({
    id: "launch-ecom-promo",
    label: "Run an e-com promo",
    description: "Ship a 3-tier seasonal promo with cold + engaged + site retargeting.",
    recommendedPlaybook: "ecommerce-seasonal-promo",
    primaryModules: ["score", "offer", "calendar", "concepts", "static-briefs"],
  }),
  Object.freeze({
    id: "always-on-leadgen",
    label: "Stand up always-on lead-gen",
    description: "Capture qualified leads for a local service or B2B funnel on a steady cadence.",
    recommendedPlaybook: "local-service-leadgen",
    primaryModules: ["score", "offer", "static-briefs", "tracking", "execution"],
  }),
  Object.freeze({
    id: "fix-tracking-or-proof",
    label: "Fix tracking or proof gaps",
    description: "Diagnose why an active funnel is leaking before spending more.",
    recommendedPlaybook: "landing-cro-sprint",
    primaryModules: ["tracking", "proof", "kpi-ladder", "review"],
  }),
  Object.freeze({
    id: "agency-deliverable",
    label: "Package an agency deliverable",
    description: "Bundle strategy + offer + first batch into a sprint deliverable for a client.",
    recommendedPlaybook: "agency-strategy-sprint",
    primaryModules: ["score", "offer", "agency", "review", "report"],
  }),
  Object.freeze({
    id: "just-exploring",
    label: "Just exploring",
    description: "Kick the tires on CampaignOS before committing to a real run.",
    recommendedPlaybook: "agency-strategy-sprint",
    primaryModules: ["score", "offer", "workspace", "report"],
  }),
]);

export function getOnboardingGoals(): OnboardingGoal[] {
  return ONBOARDING_GOALS.slice();
}

export function getOnboardingGoal(id: OnboardingGoalId): OnboardingGoal | undefined {
  return ONBOARDING_GOALS.find((g) => g.id === id);
}

// ---- Steps -------------------------------------------------------------

const ONBOARDING_STEPS: readonly OnboardingStep[] = Object.freeze([
  Object.freeze({
    id: "pick-goal",
    order: 1,
    label: "Pick your goal",
    description: "Tell CampaignOS what you want to ship so it can recommend a playbook.",
    estimatedMinutes: 1,
  }),
  Object.freeze({
    id: "create-or-load-project",
    order: 2,
    label: "Create or load a project",
    description: "Start a project from scratch or load one of the three demo projects.",
    linkTo: "workspace",
    estimatedMinutes: 2,
  }),
  Object.freeze({
    id: "review-strategy",
    order: 3,
    label: "Review the strategy",
    description: "Read the score, positioning, offer, and journey status before anything ships.",
    linkTo: "score",
    estimatedMinutes: 3,
  }),
  Object.freeze({
    id: "capture-proof-or-confirm",
    order: 4,
    label: "Capture or confirm proof",
    description: "Confirm the minimum proof set is in hand — case study, demo, customer quote.",
    linkTo: "proof",
    estimatedMinutes: 2,
  }),
  Object.freeze({
    id: "approve-critical-items",
    order: 5,
    label: "Approve the critical items",
    description: "Walk the six critical review items to approved before spending real budget.",
    linkTo: "review",
    estimatedMinutes: 2,
  }),
  Object.freeze({
    id: "plan-first-test-batch",
    order: 6,
    label: "Plan the first test batch",
    description: "Lock the first 3-6 test cells on the creative testing matrix.",
    linkTo: "execution",
    estimatedMinutes: 2,
  }),
  Object.freeze({
    id: "export-or-handoff",
    order: 7,
    label: "Export or hand off",
    description: "Hand the brief to a stakeholder, an editor, or the media buyer.",
    linkTo: "report",
    estimatedMinutes: 1,
  }),
]);

export function getOnboardingSteps(): OnboardingStep[] {
  return ONBOARDING_STEPS.slice();
}

// ---- Initial state ------------------------------------------------------

export function buildInitialOnboardingState(): OnboardingState {
  // updatedAt is 0 here — the caller stamps it at write time. The
  // memory adapter mirrors the agency / playbook store pattern.
  return {
    completedStepIds: [],
    dismissed: false,
    updatedAt: 0,
  };
}

// ---- Goal → playbook override -------------------------------------------

// Returns goal.recommendedPlaybook by default, but applies a small set
// of deterministic overrides when the input strongly signals a
// different archetype. Keep the override count small (3-4 rules) so the
// behaviour stays predictable.
export function recommendGoalPlaybook(
  goalId: OnboardingGoalId,
  input?: ProductInput
): PlaybookId {
  const goal = getOnboardingGoal(goalId);
  const fallback: PlaybookId = goal
    ? goal.recommendedPlaybook
    : "agency-strategy-sprint";
  if (!input) return fallback;

  const category = (input.category || "").toLowerCase();
  const description = (input.description || "").toLowerCase();
  const haystack = `${category} ${description}`;
  const bm = input.businessModel;
  const ct = input.campaignType;

  // 1) just-exploring + subscription-shaped app input → mobile-app-launch.
  if (
    goalId === "just-exploring" &&
    (bm === "subscription" || bm === "freemium") &&
    (haystack.includes("app") || haystack.includes("mobile") || haystack.includes("dating"))
  ) {
    return "mobile-app-launch";
  }

  // 2) just-exploring + ecommerce signal → ecommerce-seasonal-promo.
  if (
    goalId === "just-exploring" &&
    bm === "one-time" &&
    ct === "seasonal"
  ) {
    return "ecommerce-seasonal-promo";
  }

  // 3) agency-deliverable + clear app signal → mobile-app-launch.
  if (
    goalId === "agency-deliverable" &&
    (bm === "subscription" || bm === "freemium") &&
    (haystack.includes("app") || haystack.includes("dating"))
  ) {
    return "mobile-app-launch";
  }

  // 4) fix-tracking-or-proof + ecommerce → retargeting-rescue.
  if (
    goalId === "fix-tracking-or-proof" &&
    bm === "one-time" &&
    (haystack.includes("shop") || haystack.includes("store") || haystack.includes("retail"))
  ) {
    return "retargeting-rescue";
  }

  return fallback;
}

// ---- Context shape ------------------------------------------------------

export interface OnboardingDerivationContext {
  project?: SavedProject;
  latestRun?: SavedRun;
  strategy?: Strategy;
  reviewSummary?: ReviewBoardSummary;
  proofAssetPlan?: ProofAssetPlan;
  trackingReadiness?: TrackingReadinessScore;
  inputQuality?: InputQuality;
  onboardingState?: OnboardingState;
}

// ---- Progress checklist -------------------------------------------------

// Pure derivation — never reads Date.now(). The seven items mirror the
// seven canonical steps. `detail` is a short status sentence pulled
// from the relevant numbers in context.
export function buildProgressChecklist(
  ctx: OnboardingDerivationContext
): ProgressChecklistItem[] {
  const items: ProgressChecklistItem[] = [];

  // 1. Pick goal — done iff onboardingState.goalId is set.
  {
    const goalId = ctx.onboardingState?.goalId;
    const goal = goalId ? getOnboardingGoal(goalId) : undefined;
    items.push({
      id: "pick-goal",
      label: "Pick your goal",
      done: !!goalId,
      detail: goal
        ? `Goal: ${goal.label}.`
        : "No goal picked yet — choose one to surface a playbook.",
    });
  }

  // 2. Create or load a project — done iff a project is supplied.
  {
    const project = ctx.project;
    items.push({
      id: "create-or-load-project",
      label: "Create or load a project",
      done: !!project,
      detail: project
        ? `Active project: ${project.metadata.name || project.metadata.id}.`
        : "No project loaded — pick a demo or start from scratch.",
    });
  }

  // 3. Review the strategy — done iff a run exists AND strategy is set.
  {
    const hasRun = !!ctx.latestRun;
    const hasStrategy = !!ctx.strategy;
    const done = hasRun && hasStrategy;
    const score = ctx.strategy?.score.overall;
    items.push({
      id: "review-strategy",
      label: "Review the strategy",
      done,
      detail: done
        ? `Strategy score ${score ?? "—"} / 100.`
        : hasRun
        ? "Strategy missing — generate one from the current input."
        : "Save a run before reviewing — strategy is bound to the snapshot.",
    });
  }

  // 4. Capture or confirm proof — done iff proofReadinessScore >= 50
  //    OR missingBeforeSpend is empty.
  {
    const plan = ctx.proofAssetPlan;
    const score = plan?.proofReadinessScore ?? 0;
    const missing = plan?.missingBeforeSpend.length ?? 0;
    const done = !!plan && (score >= 50 || missing === 0);
    items.push({
      id: "capture-proof-or-confirm",
      label: "Capture or confirm proof",
      done,
      detail: plan
        ? `Proof readiness ${score} / 100 — ${missing} must-have${missing === 1 ? "" : "s"} missing before spend.`
        : "Proof plan not derived yet — generate a strategy first.",
    });
  }

  // 5. Approve critical items — done iff approvalReadiness === 'ready'.
  {
    const summary = ctx.reviewSummary;
    const done = summary?.approvalReadiness === "ready";
    items.push({
      id: "approve-critical-items",
      label: "Approve the critical items",
      done,
      detail: summary
        ? `${summary.criticalApproved} / ${summary.criticalTotal} critical approved.`
        : "No review board derived yet — save a run to seed approvals.",
    });
  }

  // 6. Plan first test batch — done iff recommendedFirstBatch has >= 3.
  {
    const batch = ctx.strategy?.creativeTestingMatrix?.recommendedFirstBatch ?? [];
    const done = batch.length >= 3;
    items.push({
      id: "plan-first-test-batch",
      label: "Plan the first test batch",
      done,
      detail: ctx.strategy
        ? `${batch.length} cell${batch.length === 1 ? "" : "s"} in the recommended first batch.`
        : "Strategy not generated yet — fill the input panel first.",
    });
  }

  // 7. Export or handoff — done iff the user marked it complete in
  //    onboardingState. The export / report screens flip this at
  //    click time via the store.
  {
    const completed = ctx.onboardingState?.completedStepIds ?? [];
    const done = completed.includes("export-or-handoff");
    items.push({
      id: "export-or-handoff",
      label: "Export or hand off",
      done,
      detail: done
        ? "Brief exported — stakeholder hand-off recorded."
        : "Hand the brief to the stakeholder or editor when ready.",
    });
  }

  return items;
}

// ---- Next best action ---------------------------------------------------

// Priority-ordered single-action recommender. Each branch returns a
// `NextBestAction` whose rationale references the relevant context
// number so the operator sees WHY this is next.
export function getNextBestAction(
  ctx: OnboardingDerivationContext
): NextBestAction {
  // 1. No goal yet → pick one.
  const state = ctx.onboardingState;
  if (!state || !state.goalId) {
    return action(
      "pick-goal",
      "Pick your CampaignOS goal",
      "Picking a goal anchors which playbook and modules CampaignOS will recommend.",
      undefined,
      "Pick a goal"
    );
  }

  // 2. Goal picked but no project → load a demo (if a matching one
  //    exists) or create a fresh project.
  if (!ctx.project) {
    return action(
      "load-demo",
      "Load a demo project",
      "Load a demo to see CampaignOS end-to-end, then swap in your own inputs.",
      "workspace",
      "Load a demo"
    );
  }

  // 3. Project present but input weak (or no run yet) → fill the
  //    input panel out.
  const quality = ctx.inputQuality ?? ctx.strategy?.inputQuality;
  const noRunYet = !ctx.latestRun;
  if (noRunYet || (quality && quality.status === "weak")) {
    const detail = quality
      ? `Input quality is ${quality.status} (${quality.score} / 100).`
      : "No run saved yet — generate a strategy from the input panel.";
    return action(
      "fill-input",
      "Fill the input panel",
      `${detail} Strong inputs lift every downstream draft.`,
      "score",
      "Open inputs"
    );
  }

  // 4. Tracking readiness below 50 — fix events before spending.
  const trackingScore = ctx.trackingReadiness?.score ?? ctx.strategy?.trackingReadiness?.score ?? 100;
  if (trackingScore < 50) {
    return action(
      "fix-tracking",
      "Fix tracking before spending",
      `Tracking readiness is ${trackingScore} / 100 — patch events before spend leaks.`,
      "execution",
      "Open launch readiness"
    );
  }

  // 5. Proof readiness below 50 + skeptical / mature market → capture proof.
  const plan = ctx.proofAssetPlan ?? ctx.strategy?.proofAssetPlan;
  const proofScore = plan?.proofReadinessScore ?? 100;
  const soph = ctx.project?.input.sophistication ?? ctx.latestRun?.input.sophistication;
  const needsProof = soph === "skeptical-market" || soph === "mature-market";
  if (proofScore < 50 && needsProof) {
    return action(
      "capture-proof",
      "Capture the minimum proof set",
      `Proof readiness is ${proofScore} / 100 in a ${soph} — claims will be doubted without proof.`,
      "proof",
      "Open proof plan"
    );
  }

  // 6. Review board not ready — approve critical items.
  const summary = ctx.reviewSummary;
  if (summary && summary.approvalReadiness !== "ready") {
    return action(
      "approve-critical",
      "Approve the critical review items",
      `${summary.criticalApproved} of ${summary.criticalTotal} critical items approved — keep walking the board.`,
      "review",
      "Open review board"
    );
  }

  // 7. First batch under 3 cells — plan more.
  const batch = ctx.strategy?.creativeTestingMatrix?.recommendedFirstBatch ?? [];
  if (batch.length < 3) {
    return action(
      "plan-first-batch",
      "Plan the first test batch",
      `Only ${batch.length} cell${batch.length === 1 ? "" : "s"} on the recommended first batch — aim for 3-6 with one-variable discipline.`,
      "execution",
      "Open execution"
    );
  }

  // 8. Everything clean — export the report.
  const completed = state.completedStepIds ?? [];
  if (!completed.includes("export-or-handoff")) {
    return action(
      "export-report",
      "Export the brief",
      "Every gate is clear — hand the brief to the stakeholder or editor.",
      "report",
      "Open report"
    );
  }

  // 9. All done.
  return action(
    "all-done",
    "All onboarding steps complete",
    "Onboarding is done — keep iterating with the workspace and review board.",
    "workspace",
    "Open workspace"
  );
}

function action(
  kind: NextBestActionKind,
  title: string,
  rationale: string,
  linkTo: NextBestAction["linkTo"],
  ctaLabel: string
): NextBestAction {
  return { kind, title, rationale, linkTo, ctaLabel };
}
