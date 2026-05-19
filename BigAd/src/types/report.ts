// Client-Ready Report types.
//
// These types describe a printable, client-facing deliverable that turns
// a saved project + selected run(s) + workspace memory into a concise
// document a marketer hands to a founder or stakeholder.
//
// The builder is pure / deterministic — no API calls, no LLM, no
// persistence. Same inputs → byte-identical report.

import type {
  CreativeTestingMatrix,
  InputQuality,
  ProofAssetPlan,
  CampaignSetup,
  NextIterationPlan,
} from "./strategy";
import type {
  SavedProject,
  SavedRun,
  TestResult,
  LearningMemory,
  RunComparison,
} from "./workspace";

// Stable kind ordering for the section toggle strip — also drives the
// markdown emit order. Adding a new section means appending to this
// union and to SECTION_KIND_ORDER in the markdown renderer.
export type ReportSectionKind =
  | "executive-summary"
  | "strategy-snapshot"
  | "input-quality"
  | "proof-plan"
  | "execution-plan"
  | "campaign-setup"
  | "test-results"
  | "learning-memory"
  | "decision-log"
  | "next-actions";

export interface ReportSectionToggle {
  kind: ReportSectionKind;
  enabled: boolean;
}

export interface ExecutiveSummary {
  // <= 12 bullets, each <= 24 words, BigAd voice. Bullets are deterministic
  // — the builder skips sources that have no data instead of padding.
  bullets: string[];
}

export interface StrategySnapshotItem {
  label: string;
  value: string;
}

export interface StrategySnapshot {
  positioning: string; // statement
  topAngle: string; // angle name or hook
  topOffer: string; // "kind: label"
  campaignWindow: string; // "<label> (day +X, Yd)"
  audience: string; // top avatar label
  items: StrategySnapshotItem[]; // 6-10 KV at-a-glance items
}

export interface DecisionLogEntry {
  id: string;
  source:
    | "tracking"
    | "proof"
    | "kpi-diagnosis"
    | "test-result"
    | "learning-memory";
  decision: string; // "Pause spend until X" / "Capture proof asset Y" / "Retire hook Z"
  rationale: string; // 1 sentence
  severity: "info" | "warning" | "blocker";
  relatedIds?: string[]; // e.g. test cell ids, proof asset ids
}

export type NextActionCategory =
  | "produce"
  | "test"
  | "measure"
  | "decide"
  | "operate";

export type NextActionEffort = "S" | "M" | "L";

export type NextActionOwner =
  | "creator"
  | "designer"
  | "media-buyer"
  | "founder";

export interface NextActionItem {
  id: string;
  title: string;
  category: NextActionCategory;
  effort: NextActionEffort;
  owner?: NextActionOwner;
  why: string;
}

export interface ClientReport {
  generatedAt: string; // ISO-8601 — deterministic, from max(updatedAt)
  project: SavedProject;
  runs: SavedRun[]; // 1-3 runs included (primary + up to 2 prior)
  primaryRunId: string; // which run is the "current"
  comparison: RunComparison | null;
  toggles: ReportSectionToggle[];
  executiveSummary: ExecutiveSummary;
  strategySnapshot: StrategySnapshot;
  inputQuality: InputQuality; // snapshotted from primary run
  proofPlan: ProofAssetPlan;
  executionPlan: {
    matrix: CreativeTestingMatrix;
    campaign: CampaignSetup;
    iteration: NextIterationPlan;
  };
  testResults: TestResult[];
  learningMemory: LearningMemory;
  decisionLog: DecisionLogEntry[];
  nextActions: NextActionItem[];
  // When true, the builder received zero runs and emitted a placeholder.
  // The renderer short-circuits to a "No CampaignOS project found"
  // sentinel without touching the (necessarily-stubbed) interior fields.
  // Optional + defaults to undefined so existing callers stay
  // shape-compatible.
  isEmpty?: boolean;
}
