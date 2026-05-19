// results-store.ts — persistence adapter for the Results Import /
// Forecast Accuracy Loop.
//
// Holds the per-cell `CampaignActualResult` rows the operator captures
// in the Results tab. State lives in localStorage under a versioned
// `:v1` key so future schema bumps can migrate without silent loss.
// The browser adapter is SSR-safe: when `window` is undefined, reads
// return [] and writes are no-ops. A second `createMemoryResultsStore()`
// adapter shares the same interface for tests and SSR fallbacks.
//
// The store is the ONLY layer allowed to stamp `createdAt` /
// `updatedAt` from `Date.now()`. The analysis module
// (results-analysis.ts) stays pure and never reads either field — they
// exist for UI sorting only.

import type { CampaignActualResult, ResultStatus } from "@/types/results";

// Versioned localStorage key. Bump the suffix when the shape changes.
export const STORAGE_KEY_CAMPAIGN_ACTUALS = "bigad:campaign-actuals:v1";

export interface UpsertResultInput {
  projectId: string;
  runId: string;
  cellId: string;
  spendUsd: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueUsd?: number;
  status: ResultStatus;
  notes?: string;
  daysRun?: number;
}

export interface ResultsStore {
  listResults(projectId: string, runId: string): CampaignActualResult[];
  getResult(id: string): CampaignActualResult | undefined;
  upsertResult(input: UpsertResultInput): CampaignActualResult;
  deleteResult(id: string): void;
  clearForRun(projectId: string, runId: string): void;
}

// ---- Shape validation -------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validateUpsertInput(input: UpsertResultInput): void {
  if (!input || typeof input !== "object") {
    throw new Error("ResultsStore: upsertResult requires an input object");
  }
  if (!isNonEmptyString(input.projectId)) {
    throw new Error("ResultsStore: projectId is required");
  }
  if (!isNonEmptyString(input.runId)) {
    throw new Error("ResultsStore: runId is required");
  }
  if (!isNonEmptyString(input.cellId)) {
    throw new Error("ResultsStore: cellId is required");
  }
  const numericFields: Array<keyof UpsertResultInput> = [
    "spendUsd",
    "impressions",
    "clicks",
    "conversions",
  ];
  for (const field of numericFields) {
    const v = input[field];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new Error(
        `ResultsStore: ${field} must be a non-negative finite number`
      );
    }
  }
  if (
    typeof input.revenueUsd === "number" &&
    (!Number.isFinite(input.revenueUsd) || input.revenueUsd < 0)
  ) {
    throw new Error("ResultsStore: revenueUsd must be a non-negative number");
  }
}

function deriveResultId(
  projectId: string,
  runId: string,
  cellId: string
): string {
  return `${projectId}:${runId}:${cellId}`;
}

// ---- Browser adapter --------------------------------------------------

function hasWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readArray(): CampaignActualResult[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CAMPAIGN_ACTUALS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CampaignActualResult[];
  } catch {
    return [];
  }
}

function writeArray(items: CampaignActualResult[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_CAMPAIGN_ACTUALS,
      JSON.stringify(items)
    );
  } catch {
    // localStorage may throw (quota, private mode). Silent fallback.
  }
}

export function createBrowserResultsStore(): ResultsStore {
  return {
    listResults(projectId: string, runId: string): CampaignActualResult[] {
      return readArray().filter(
        (r) => r.projectId === projectId && r.runId === runId
      );
    },
    getResult(id: string): CampaignActualResult | undefined {
      return readArray().find((r) => r.id === id);
    },
    upsertResult(input: UpsertResultInput): CampaignActualResult {
      validateUpsertInput(input);
      const now = Date.now();
      const id = deriveResultId(input.projectId, input.runId, input.cellId);
      const all = readArray();
      const idx = all.findIndex((r) => r.id === id);
      const previous = idx >= 0 ? all[idx] : undefined;
      const next: CampaignActualResult = {
        id,
        projectId: input.projectId,
        runId: input.runId,
        cellId: input.cellId,
        spendUsd: input.spendUsd,
        impressions: input.impressions,
        clicks: input.clicks,
        conversions: input.conversions,
        revenueUsd: input.revenueUsd,
        status: input.status,
        notes: input.notes,
        daysRun: input.daysRun,
        createdAt:
          previous && previous.createdAt > 0 ? previous.createdAt : now,
        updatedAt: now,
      };
      if (idx >= 0) {
        all[idx] = next;
      } else {
        all.push(next);
      }
      writeArray(all);
      return next;
    },
    deleteResult(id: string): void {
      const all = readArray().filter((r) => r.id !== id);
      writeArray(all);
    },
    clearForRun(projectId: string, runId: string): void {
      const all = readArray().filter(
        (r) => !(r.projectId === projectId && r.runId === runId)
      );
      writeArray(all);
    },
  };
}

// ---- Memory adapter ---------------------------------------------------

export function createMemoryResultsStore(): ResultsStore {
  let items: CampaignActualResult[] = [];
  // Memory adapter still stamps timestamps via Date.now() for parity
  // with the browser store. Pure analysis never reads them — they exist
  // for UI sorting only — so determinism of the analysis layer is
  // preserved.
  return {
    listResults(projectId: string, runId: string): CampaignActualResult[] {
      return items.filter(
        (r) => r.projectId === projectId && r.runId === runId
      );
    },
    getResult(id: string): CampaignActualResult | undefined {
      return items.find((r) => r.id === id);
    },
    upsertResult(input: UpsertResultInput): CampaignActualResult {
      validateUpsertInput(input);
      const now = Date.now();
      const id = deriveResultId(input.projectId, input.runId, input.cellId);
      const idx = items.findIndex((r) => r.id === id);
      const previous = idx >= 0 ? items[idx] : undefined;
      const next: CampaignActualResult = {
        id,
        projectId: input.projectId,
        runId: input.runId,
        cellId: input.cellId,
        spendUsd: input.spendUsd,
        impressions: input.impressions,
        clicks: input.clicks,
        conversions: input.conversions,
        revenueUsd: input.revenueUsd,
        status: input.status,
        notes: input.notes,
        daysRun: input.daysRun,
        createdAt:
          previous && previous.createdAt > 0 ? previous.createdAt : now,
        updatedAt: now,
      };
      if (idx >= 0) {
        items[idx] = next;
      } else {
        items.push(next);
      }
      return next;
    },
    deleteResult(id: string): void {
      items = items.filter((r) => r.id !== id);
    },
    clearForRun(projectId: string, runId: string): void {
      items = items.filter(
        (r) => !(r.projectId === projectId && r.runId === runId)
      );
    },
  };
}
