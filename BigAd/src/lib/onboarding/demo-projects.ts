// demo-projects.ts — three fully-populated demo projects for the
// Onboarding & Demo Projects layer.
//
// Each demo carries a complete `ProductInput`, a set of sample test
// results, a set of sample review statuses (covering every critical
// kind plus a few non-critical), and a few short learning notes. The
// loader (`buildDemoLoadPlan`) is a pure function: given the same
// projectId / runId / nowMs triple, it returns a byte-identical plan
// the UI can write through the existing project / review / playbook /
// agency stores.
//
// `buildDemoLoadPlan` itself does NOT call `Date.now()` — the caller
// supplies `nowMs` so determinism holds. The engine still runs
// deterministically on the demo input, so two builds with the same
// inputs produce the same plan.

import { buildStrategy } from "@/lib/engine";
import type {
  DemoProject,
  DemoProjectMetadata,
  SampleReviewStatus,
  SampleTestResult,
} from "@/types/onboarding";
import type { PlaybookId } from "@/types/playbook";
import type {
  AgencyRoleId,
  AgencySelection,
  PackagePresetId,
  ProjectTemplateId,
} from "@/types/agency";
import type {
  ReviewComment,
  ReviewItem,
} from "@/types/review";
import { initialItemsForRun } from "@/lib/review/review-board";
import type {
  SavedProject,
  SavedRun,
  TestResult,
  TestResultMetric,
} from "@/types/workspace";
import type { KpiName, ProductInput } from "@/types/strategy";

// ---- Demo inputs --------------------------------------------------------

// Demo 1 input mirrors the AstroDating fixture (psychographic audience
// label kept — "astrology-curious singles 22-38" — per the BigAd
// audienceLabel preference).
const DEMO_INPUT_ASTRO_DATING: ProductInput = {
  name: "AstroDating",
  category: "dating app",
  description:
    "A dating app that uses astrology as a shared language, plus values, voice intros, and prompts — not a fortune-telling gimmick. Designed for people who want real conversations, not another inbox of small talk.",
  price: "Free with $9/month premium",
  businessModel: "freemium",
  audience: "astrology-curious singles 22-38 tired of swipe fatigue",
  audiencePain:
    "swipe apps feel transactional and disconnected from values — matches never become real conversations",
  competitors: "Tinder, Hinge, Bumble",
  differentiator:
    "astrology + values-based matching with depth — voice intros and prompts that surface who someone actually is",
  goal: "launch the iOS PWA with 1,000 weekly active matchers and a 25% reply rate",
  awareness: "problem-aware",
  sophistication: "skeptical-market",
  campaignType: "launch",
  offerContext: {
    // Subscription-app economics — 16 months of $9 retention yields a
    // $144 lifetime AOV, 15% payment-processor / hosting COGS, 30%
    // target margin. The demo intentionally leaves COGS / margin filled
    // in so the Economics tab reads "viable" or "tight" and the founder
    // can point at concrete numbers during the walkthrough.
    cogsPercent: 15,
    targetMarginPercent: 30,
    currentAOV: 144,
    targetROAS: 2.0,
  },
};

// Demo 2 input — fictional B2B SaaS for creative agencies.
const DEMO_INPUT_SAAS_TRIAL: ProductInput = {
  name: "Loopwork",
  category: "project management tool",
  description:
    "A project-management tool for creative agencies that ties approvals to scope. Every revision request lives next to the original brief so margin doesn't bleed from rewriting the same deliverable.",
  price: "$49 per seat per month",
  businessModel: "subscription",
  audience: "creative agency owners running teams of 5-30",
  audiencePain:
    "client revisions kill margins — agencies spend hours rewriting the same deliverable and lose track of scope",
  competitors: "Asana, ClickUp, Notion projects",
  differentiator:
    "approval workflows + scope tracking baked into the brief — every revision is logged against the original deliverable",
  goal: "drive 250 qualified trial_starts a month with a 35% activation rate by week two",
  awareness: "solution-aware",
  sophistication: "amplified-claims",
  campaignType: "launch",
  offerContext: {
    cogsPercent: 18,
    targetMarginPercent: 60,
    currentAOV: 588,
    targetROAS: 2.0,
  },
};

// Demo 3 input — fictional ecommerce skincare seasonal promo.
const DEMO_INPUT_ECOM_PROMO: ProductInput = {
  name: "Clearmark",
  category: "skincare brand",
  description:
    "A skincare brand selling clinical-grade serums at non-dermatologist prices. Fall promo on the hero serum with free shipping at the bundle threshold.",
  price: "$89 hero serum, 20% off through the fall promo",
  businessModel: "one-time",
  audience: "women 30-50 skincare-curious and brand-fatigued",
  audiencePain:
    "premium serums feel inaccessible — clinical actives are priced behind a dermatologist visit even when the ingredient lists overlap",
  competitors: "SkinCeuticals, Drunk Elephant, Paula's Choice",
  differentiator:
    "clinical-grade actives at non-dermatologist prices — ingredient lists rival the $200 bottles at a third of the cost",
  goal: "hit $180k in fall promo revenue at a 3.2x blended ROAS across September and October",
  awareness: "product-aware",
  sophistication: "mature-market",
  campaignType: "seasonal",
  offerContext: {
    cogsPercent: 30,
    targetMarginPercent: 40,
    currentAOV: 112,
    targetROAS: 3.2,
  },
};

// ---- Sample results / reviews / notes ----------------------------------

// Demo 1 — AstroDating sample test results. References cells from
// the deterministic creativeTestingMatrix (test-1 .. test-6).
const SAMPLE_RESULTS_ASTRO_DATING: SampleTestResult[] = [
  {
    cellId: "test-1",
    status: "winning",
    spendUsd: 420,
    daysRun: 5,
    metrics: [
      { name: "cpa", value: 14.2 },
      { name: "ctr", value: 1.9 },
      { name: "cvr", value: 6.4 },
    ],
    notes: "Belief-system-mismatch hook on 9:16 reads cleanly — install cost holds under target.",
  },
  {
    cellId: "test-2",
    status: "winning",
    spendUsd: 360,
    daysRun: 5,
    metrics: [
      { name: "cpa", value: 16.8 },
      { name: "ctr", value: 1.7 },
    ],
    notes: "Founder-story variant lifts hold-rate — keep the 1-second pain restate in frame one.",
  },
  {
    cellId: "test-3",
    status: "losing",
    spendUsd: 280,
    daysRun: 4,
    metrics: [
      { name: "cpa", value: 38.5 },
      { name: "ctr", value: 0.6 },
    ],
    notes: "Static before-after profile shot does not earn the click — kill and reallocate.",
  },
  {
    cellId: "test-4",
    status: "killed-early",
    spendUsd: 165,
    daysRun: 2,
    metrics: [
      { name: "cpa", value: 51.2 },
      { name: "ctr", value: 0.4 },
    ],
    notes: "Generic-dating hook variant burned through kill-rule threshold inside 48h.",
  },
  {
    cellId: "test-5",
    status: "inconclusive",
    spendUsd: 240,
    daysRun: 4,
    metrics: [
      { name: "cpa", value: 22.4 },
      { name: "ctr", value: 1.2 },
    ],
    notes: "Values-led 4:5 variant sitting at the breakeven line — needs another 48h before a call.",
  },
  {
    cellId: "test-6",
    status: "winning",
    spendUsd: 510,
    daysRun: 6,
    metrics: [
      { name: "cpa", value: 13.5 },
      { name: "cvr", value: 7.1 },
    ],
    notes: "Voice-intro demo clip is the strongest hold so far — duplicate for scale next batch.",
  },
];

const SAMPLE_REVIEWS_ASTRO_DATING: SampleReviewStatus[] = [
  { kind: "positioning", status: "approved", approvedBy: "owner" },
  { kind: "offer", status: "approved", approvedBy: "owner" },
  {
    kind: "proof-assets",
    status: "needs-changes",
    sampleComment: {
      author: "client",
      body: "Need a quote from a 32+ woman in the proof set — the current set skews under 25.",
      resolved: false,
    },
  },
  { kind: "first-test-batch", status: "approved", approvedBy: "media-buyer" },
  { kind: "campaign-setup", status: "approved", approvedBy: "media-buyer" },
  {
    kind: "client-report",
    status: "approved",
    approvedBy: "owner",
    sampleComment: {
      author: "owner",
      body: "Report draft circulated — readout slot confirmed for Friday.",
      resolved: true,
    },
  },
  { kind: "tracking-readiness", status: "approved", approvedBy: "media-buyer" },
  { kind: "creative-qa", status: "approved", approvedBy: "creator" },
];

const SAMPLE_NOTES_ASTRO_DATING = [
  "Belief-system-mismatch hook pattern is outperforming generic dating-app framing by ~40% on CPA.",
  "Before-after profile static is the weakest format — the comparison reads as gimmick, not depth.",
  "Skeptical-market audience needs the founder story early; ads that lead with product features stall on hold-rate.",
];

// Demo 2 — SaaS trial.
const SAMPLE_RESULTS_SAAS_TRIAL: SampleTestResult[] = [
  {
    cellId: "test-1",
    status: "winning",
    spendUsd: 720,
    daysRun: 5,
    metrics: [
      { name: "cpa", value: 34.5 },
      { name: "ctr", value: 1.4 },
      { name: "cvr", value: 4.2 },
    ],
    notes: "Case-study-led 1:1 static drives qualified trial_start at target.",
  },
  {
    cellId: "test-2",
    status: "inconclusive",
    spendUsd: 560,
    daysRun: 4,
    metrics: [
      { name: "cpa", value: 48.9 },
      { name: "ctr", value: 1.1 },
    ],
    notes: "Founder talking-head 9:16 holds attention but trial_start lags — needs a cleaner CTA.",
  },
  {
    cellId: "test-3",
    status: "winning",
    spendUsd: 640,
    daysRun: 5,
    metrics: [
      { name: "cpa", value: 32.1 },
      { name: "cvr", value: 5.0 },
    ],
    notes: "Dashboard-screenshot 4:5 with a named-customer quote is the cleanest variant.",
  },
  {
    cellId: "test-4",
    status: "losing",
    spendUsd: 410,
    daysRun: 5,
    metrics: [
      { name: "cpa", value: 92.4 },
      { name: "ctr", value: 0.7 },
    ],
    notes: "Feature-list hook variant — buyers ignore feature framing without proof.",
  },
  {
    cellId: "test-5",
    status: "killed-early",
    spendUsd: 220,
    daysRun: 3,
    metrics: [
      { name: "cpa", value: 145.0 },
      { name: "ctr", value: 0.4 },
    ],
    notes: "Generic agency-stock B-roll burned through threshold within three days.",
  },
];

const SAMPLE_REVIEWS_SAAS_TRIAL: SampleReviewStatus[] = [
  { kind: "positioning", status: "approved", approvedBy: "owner" },
  {
    kind: "offer",
    status: "needs-changes",
    sampleComment: {
      author: "client",
      body: "14-day trial may be tight — operations team wants to validate against support load first.",
      resolved: false,
    },
  },
  { kind: "proof-assets", status: "approved", approvedBy: "owner" },
  { kind: "first-test-batch", status: "approved", approvedBy: "media-buyer" },
  {
    kind: "campaign-setup",
    status: "pending",
    sampleComment: {
      author: "media-buyer",
      body: "Pixel + trial_start event confirmed; waiting on subscribe event from the eng team.",
      resolved: false,
    },
  },
  { kind: "client-report", status: "pending" },
  { kind: "tracking-readiness", status: "approved", approvedBy: "media-buyer" },
];

const SAMPLE_NOTES_SAAS_TRIAL = [
  "Case-study-led hooks beat feature-list hooks on every measurable axis in the first batch.",
  "Founder-on-camera variants hold attention but need a sharper CTA to convert hold into trial_start.",
  "Static-with-quote is winning on cost-per-trial — keep it as the baseline format for batch two.",
];

// Demo 3 — Ecommerce seasonal promo.
const SAMPLE_RESULTS_ECOM_PROMO: SampleTestResult[] = [
  {
    cellId: "test-1",
    status: "winning",
    spendUsd: 940,
    daysRun: 4,
    metrics: [
      { name: "roas", value: 4.2 },
      { name: "ctr", value: 1.6 },
      { name: "cvr", value: 3.8 },
    ],
    notes: "Hero-serum 4:5 with the $89 anchor and free-shipping badge is the cleanest ROAS line.",
  },
  {
    cellId: "test-2",
    status: "winning",
    spendUsd: 820,
    daysRun: 4,
    metrics: [
      { name: "roas", value: 3.6 },
      { name: "cvr", value: 3.1 },
    ],
    notes: "Carousel walking ingredient comparison wins on AOV — bundle picks up 28%.",
  },
  {
    cellId: "test-3",
    status: "losing",
    spendUsd: 380,
    daysRun: 3,
    metrics: [
      { name: "roas", value: 1.2 },
      { name: "ctr", value: 0.8 },
    ],
    notes: "Lifestyle-only 1:1 without price anchor — buyers scroll past without commiting.",
  },
  {
    cellId: "test-4",
    status: "inconclusive",
    spendUsd: 600,
    daysRun: 4,
    metrics: [
      { name: "roas", value: 2.4 },
      { name: "ctr", value: 1.2 },
    ],
    notes: "UGC 9:16 holds at breakeven — sits between killer and scaler so far.",
  },
  {
    cellId: "test-5",
    status: "killed-early",
    spendUsd: 280,
    daysRun: 2,
    metrics: [
      { name: "roas", value: 0.7 },
      { name: "ctr", value: 0.5 },
    ],
    notes: "Founder-talking-head variant — audience does not want a founder story for a serum SKU.",
  },
  {
    cellId: "test-6",
    status: "winning",
    spendUsd: 1120,
    daysRun: 5,
    metrics: [
      { name: "roas", value: 4.8 },
      { name: "cvr", value: 4.5 },
    ],
    notes: "Site-retargeting carousel with the discount anchor is the highest-ROAS cell so far.",
  },
];

const SAMPLE_REVIEWS_ECOM_PROMO: SampleReviewStatus[] = [
  { kind: "positioning", status: "approved", approvedBy: "owner" },
  { kind: "offer", status: "approved", approvedBy: "owner" },
  { kind: "proof-assets", status: "approved", approvedBy: "creator" },
  { kind: "first-test-batch", status: "approved", approvedBy: "media-buyer" },
  {
    kind: "campaign-setup",
    status: "approved",
    approvedBy: "media-buyer",
    sampleComment: {
      author: "media-buyer",
      body: "Three-tier setup confirmed — exclusions wired so retargeting does not double-spend on converters.",
      resolved: true,
    },
  },
  { kind: "client-report", status: "approved", approvedBy: "owner" },
  { kind: "tracking-readiness", status: "approved", approvedBy: "media-buyer" },
  {
    kind: "creative-qa",
    status: "needs-changes",
    sampleComment: {
      author: "creator",
      body: "Ingredient comparison carousel needs the 4.7-star aggregate visible on the first card.",
      resolved: false,
    },
  },
];

const SAMPLE_NOTES_ECOM_PROMO = [
  "Price-anchor formats (hero + 20% off badge) are outperforming lifestyle-only formats on ROAS.",
  "Site-retargeting carousel is the strongest scaling lever — keep frequency under 2.5 to avoid fatigue.",
  "Founder talking-head is the wrong shape for a single-SKU serum — drop it from batch two.",
];

// ---- Registry ----------------------------------------------------------

export const DEMO_PROJECTS: Record<DemoProjectMetadata["id"], DemoProject> = {
  "astro-dating-launch": {
    id: "astro-dating-launch",
    label: "AstroDating — values-first dating app launch",
    blurb:
      "Skeptical-market dating app launch with founder-story hooks and the proof gap a client just flagged.",
    goalId: "launch-app",
    recommendedPlaybook: "mobile-app-launch",
    input: DEMO_INPUT_ASTRO_DATING,
    sampleTestResults: SAMPLE_RESULTS_ASTRO_DATING,
    sampleReviewStatuses: SAMPLE_REVIEWS_ASTRO_DATING,
    sampleNotes: SAMPLE_NOTES_ASTRO_DATING,
    // Founder demo — seed agency selection so the Agency tab is
    // already populated when the buyer clicks through after loading
    // the demo. Template / role / package match the mobile-app-launch
    // playbook so the cross-references on the Agency tab line up.
    seededAgencySelection: {
      templateId: "app-launch",
      roleId: "owner",
      packageId: "launch-sprint",
    },
  },
  "saas-free-trial-launch": {
    id: "saas-free-trial-launch",
    label: "Loopwork — B2B SaaS trial launch",
    blurb:
      "Solution-aware B2B SaaS launch with a 14-day trial, case-study-led hooks, and a tracking handoff in progress.",
    goalId: "launch-saas-trial",
    recommendedPlaybook: "saas-free-trial-launch",
    input: DEMO_INPUT_SAAS_TRIAL,
    sampleTestResults: SAMPLE_RESULTS_SAAS_TRIAL,
    sampleReviewStatuses: SAMPLE_REVIEWS_SAAS_TRIAL,
    sampleNotes: SAMPLE_NOTES_SAAS_TRIAL,
  },
  "ecom-seasonal-promo": {
    id: "ecom-seasonal-promo",
    label: "Clearmark — fall skincare promo",
    blurb:
      "Mature-market skincare seasonal promo with a 3-tier audience architecture and a near-clean review board.",
    goalId: "launch-ecom-promo",
    recommendedPlaybook: "ecommerce-seasonal-promo",
    input: DEMO_INPUT_ECOM_PROMO,
    sampleTestResults: SAMPLE_RESULTS_ECOM_PROMO,
    sampleReviewStatuses: SAMPLE_REVIEWS_ECOM_PROMO,
    sampleNotes: SAMPLE_NOTES_ECOM_PROMO,
  },
};

export function getDemoProject(id: DemoProjectMetadata["id"]): DemoProject {
  return DEMO_PROJECTS[id];
}

export function listDemoProjects(): DemoProjectMetadata[] {
  return [
    DEMO_PROJECTS["astro-dating-launch"],
    DEMO_PROJECTS["saas-free-trial-launch"],
    DEMO_PROJECTS["ecom-seasonal-promo"],
  ].map((d) => ({
    id: d.id,
    label: d.label,
    blurb: d.blurb,
    goalId: d.goalId,
    recommendedPlaybook: d.recommendedPlaybook,
  }));
}

// ---- Demo load plan -----------------------------------------------------

// A `DemoLoadPlan` is the serialized state the UI writes through the
// existing project / review / playbook / agency stores to "load" a
// demo. Building the plan is a pure function of (demo, projectId,
// runId, nowMs) — same triple in → byte-identical plan out.

export interface DemoLoadPlan {
  project: SavedProject;
  run: SavedRun;
  testResults: TestResult[];
  reviewItems: ReviewItem[];
  reviewComments: ReviewComment[];
  appliedPlaybookId: PlaybookId;
  agencySelection?: AgencySelection;
}

export interface BuildDemoLoadPlanOptions {
  projectId: string;
  runId: string;
  nowMs: number;
}

// Cell-id → metric KPI / unit defaults. The TestResult.metric requires
// a typed `kpi: KpiName` + `unit`; the demo's sample metrics use
// loose names, so we coerce them to the KpiName set deterministically.
const KPI_NAME_SET = new Set<KpiName>([
  "ctr",
  "cpc",
  "cpm",
  "cpa",
  "cvr",
  "roas",
  "hookRate",
  "holdRate",
]);

function coerceKpi(name: string): { kpi: KpiName; unit: TestResultMetric["unit"] } {
  if (KPI_NAME_SET.has(name as KpiName)) {
    const kpi = name as KpiName;
    if (kpi === "ctr" || kpi === "cvr") {
      return { kpi, unit: "percent" };
    }
    if (kpi === "roas" || kpi === "hookRate" || kpi === "holdRate") {
      return { kpi, unit: "ratio" };
    }
    return { kpi, unit: "currency" };
  }
  // Fallback: cpa with currency unit. Keeps every sample metric typed.
  return { kpi: "cpa", unit: "currency" };
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function buildDemoLoadPlan(
  demo: DemoProject,
  options: BuildDemoLoadPlanOptions
): DemoLoadPlan {
  const { projectId, runId, nowMs } = options;
  const nowIso = isoFromMs(nowMs);

  // Strategy is deterministic per input — buildStrategy is pure.
  const strategy = buildStrategy(demo.input);

  const project: SavedProject = {
    metadata: {
      id: projectId,
      name: demo.label,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastRunAt: nowIso,
      runCount: 1,
    },
    input: demo.input,
  };

  const run: SavedRun = {
    id: runId,
    projectId,
    runAt: nowIso,
    input: demo.input,
    strategy,
    notes: demo.sampleNotes.join(" • "),
  };

  // Only emit test results whose cellId actually exists on the run's
  // creativeTestingMatrix — keeps the workspace free of orphan rows.
  const validCellIds = new Set(
    strategy.creativeTestingMatrix.testCells.map((c) => c.id)
  );

  const testResults: TestResult[] = [];
  let i = 1;
  for (const sample of demo.sampleTestResults) {
    if (!validCellIds.has(sample.cellId)) continue;
    const status = sample.status;
    const metrics: TestResultMetric[] = sample.metrics.map((m) => {
      const coerced = coerceKpi(String(m.name));
      return {
        kpi: coerced.kpi,
        value: m.value,
        unit: coerced.unit,
        measuredAt: nowIso,
      };
    });
    testResults.push({
      id: `${runId}-result-${i}`,
      projectId,
      runId,
      testCellId: sample.cellId,
      status,
      metrics,
      spend: sample.spendUsd,
      daysRun: sample.daysRun,
      notes: sample.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    i += 1;
  }

  // Build review items off the canonical 10-item seed for this run,
  // then layer the sample statuses on top deterministically.
  const seeded = initialItemsForRun(projectId, runId, strategy, nowMs);
  const statusByKind = new Map(
    demo.sampleReviewStatuses.map((s) => [s.kind, s] as const)
  );
  const reviewItems: ReviewItem[] = seeded.map((it) => {
    const sample = statusByKind.get(it.kind);
    if (!sample) return it;
    return {
      ...it,
      status: sample.status,
      approvedBy: sample.approvedBy,
      approvedAt: sample.status === "approved" ? nowMs : undefined,
      updatedAt: nowMs,
    };
  });

  // Comments are deterministic — ids derive from the run id + kind so
  // the same plan twice produces byte-identical comment ids.
  const reviewComments: ReviewComment[] = [];
  let cIdx = 1;
  for (const sample of demo.sampleReviewStatuses) {
    if (!sample.sampleComment) continue;
    const itemId = `${runId}:${sample.kind}`;
    reviewComments.push({
      id: `${runId}-comment-${cIdx}`,
      itemId,
      author: sample.sampleComment.author,
      body: sample.sampleComment.body,
      resolved: sample.sampleComment.resolved,
      createdAt: nowMs,
      resolvedAt: sample.sampleComment.resolved ? nowMs : undefined,
    });
    cIdx += 1;
  }

  // Agency selection — emitted when the demo carries a
  // `seededAgencySelection` triple. `updatedAt` derives from the
  // caller-supplied `nowMs` so the same demo + same opts → byte-
  // identical agencySelection.
  const agencySelection: AgencySelection | undefined = demo.seededAgencySelection
    ? {
        projectId,
        templateId: demo.seededAgencySelection.templateId,
        roleId: demo.seededAgencySelection.roleId,
        packageId: demo.seededAgencySelection.packageId,
        updatedAt: nowMs,
      }
    : undefined;

  return {
    project,
    run,
    testResults,
    reviewItems,
    reviewComments,
    appliedPlaybookId: demo.recommendedPlaybook,
    agencySelection,
  };
}
