// Workspace types — saved projects, run history, test results log, and
// derived learning memory. These types describe the persistence shell
// that wraps the deterministic engine; they do NOT influence the engine
// itself except through the optional learningMemory hand-off to the
// iteration planner.

import type { KpiName, ProductInput, Strategy } from "./strategy";

// ---- Project + run history --------------------------------------------

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
  lastRunAt?: string;
  runCount: number;
}

export interface SavedProject {
  metadata: ProjectMetadata;
  input: ProductInput;
}

export interface SavedRun {
  id: string;
  projectId: string;
  runAt: string; // ISO-8601
  input: ProductInput; // snapshot
  strategy: Strategy; // snapshot
  notes?: string;
}

// ---- Test results log -------------------------------------------------

export type TestResultStatus =
  | "winning"
  | "losing"
  | "inconclusive"
  | "killed-early"
  | "paused"
  | "not-yet-launched";

export interface TestResultMetric {
  kpi: KpiName;
  value: number;
  unit: "ratio" | "percent" | "currency" | "dimensionless";
  measuredAt: string; // ISO-8601
}

export interface TestResult {
  id: string;
  projectId: string;
  runId: string; // the run that generated the matrix
  testCellId: string; // matches CreativeTestingMatrix.testCells[*].id
  status: TestResultStatus;
  metrics: TestResultMetric[];
  spend: number;
  daysRun: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Derived learning memory ------------------------------------------

export type LearningSignal =
  | "hook-pattern-winning"
  | "hook-pattern-losing"
  | "offer-kind-winning"
  | "offer-kind-losing"
  | "format-winning"
  | "format-losing"
  | "avatar-winning"
  | "avatar-losing"
  | "audience-tier-winning"
  | "audience-tier-losing"
  | "proof-asset-required-validated"
  | "killrule-triggered-pattern";

export interface Learning {
  signal: LearningSignal;
  subject: string; // e.g. hook pattern name, offer kind, format
  evidence: string; // 1 sentence, BigAd voice
  confidence: "low" | "medium" | "high";
  supportingResultIds: string[];
}

export interface LearningMemory {
  derivedAt: string;
  fromResultCount: number;
  learnings: Learning[];
}

// ---- Run comparison ---------------------------------------------------

export interface RunComparison {
  current: { runId: string; runAt: string };
  previous: { runId: string; runAt: string } | null;
  changedFields: string[];
  noteworthy: string[];
}
