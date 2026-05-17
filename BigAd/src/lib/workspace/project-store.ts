// project-store.ts — persistence adapter for the BigAd Project Workspace.
//
// All state lives in localStorage under versioned keys (`:v1` suffix) so
// future schema migrations can detect and migrate old data without
// silent loss. The browser adapter is SSR-safe: when `window` is
// undefined the reads return empty arrays and writes are no-ops.
//
// A second adapter (`createMemoryProjectStore`) uses an in-memory Map
// and shares the same interface so test-logic.ts and SSR fallbacks can
// exercise the store deterministically.
//
// No external dependencies. No backend. No telemetry.

import type {
  SavedProject,
  SavedRun,
  TestResult,
} from "@/types/workspace";

// Versioned localStorage keys. Bump the suffix when the shape changes.
export const STORAGE_KEY_PROJECTS = "bigad:projects:v1";
export const STORAGE_KEY_RUNS = "bigad:runs:v1";
export const STORAGE_KEY_RESULTS = "bigad:test-results:v1";
export const STORAGE_KEY_ACTIVE = "bigad:active-project-id:v1";

export interface ProjectStore {
  listProjects(): SavedProject[];
  getProject(id: string): SavedProject | null;
  saveProject(project: SavedProject): SavedProject;
  deleteProject(id: string): void;
  setActiveProject(id: string | null): void;
  getActiveProjectId(): string | null;

  listRuns(projectId: string): SavedRun[];
  appendRun(run: SavedRun): SavedRun;
  deleteRun(runId: string): void;

  listResults(projectId: string): TestResult[];
  upsertResult(result: TestResult): TestResult;
  deleteResult(resultId: string): void;
}

// ---- Shape validation helpers (defence-in-depth, not type coverage) ---

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validateProject(p: SavedProject): void {
  if (!p || typeof p !== "object") {
    throw new Error("ProjectStore: saveProject requires a SavedProject object");
  }
  if (!p.metadata || !isNonEmptyString(p.metadata.id)) {
    throw new Error("ProjectStore: project.metadata.id is required");
  }
  if (!p.input || typeof p.input !== "object") {
    throw new Error("ProjectStore: project.input is required");
  }
}

function validateRun(r: SavedRun): void {
  if (!r || typeof r !== "object") {
    throw new Error("ProjectStore: appendRun requires a SavedRun object");
  }
  if (!isNonEmptyString(r.id)) {
    throw new Error("ProjectStore: run.id is required");
  }
  if (!isNonEmptyString(r.projectId)) {
    throw new Error("ProjectStore: run.projectId is required");
  }
  if (!r.strategy || !r.input) {
    throw new Error("ProjectStore: run.strategy and run.input are required");
  }
}

function validateResult(r: TestResult): void {
  if (!r || typeof r !== "object") {
    throw new Error("ProjectStore: upsertResult requires a TestResult");
  }
  if (!isNonEmptyString(r.id)) {
    throw new Error("ProjectStore: result.id is required");
  }
  if (!isNonEmptyString(r.projectId)) {
    throw new Error("ProjectStore: result.projectId is required");
  }
  if (!isNonEmptyString(r.testCellId)) {
    throw new Error("ProjectStore: result.testCellId is required");
  }
}

// ---- Browser adapter --------------------------------------------------

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readArray<T>(key: string): T[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, items: T[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // localStorage may throw (quota, private mode). Silent fallback —
    // the caller already has the in-memory value.
  }
}

export function createBrowserProjectStore(): ProjectStore {
  return {
    listProjects(): SavedProject[] {
      return readArray<SavedProject>(STORAGE_KEY_PROJECTS);
    },
    getProject(id: string): SavedProject | null {
      return this.listProjects().find((p) => p.metadata.id === id) ?? null;
    },
    saveProject(project: SavedProject): SavedProject {
      validateProject(project);
      const now = new Date().toISOString();
      const all = readArray<SavedProject>(STORAGE_KEY_PROJECTS);
      const idx = all.findIndex((p) => p.metadata.id === project.metadata.id);
      const next: SavedProject = {
        ...project,
        metadata: {
          ...project.metadata,
          updatedAt: now,
          createdAt: project.metadata.createdAt || now,
        },
      };
      if (idx >= 0) {
        all[idx] = next;
      } else {
        all.push(next);
      }
      writeArray(STORAGE_KEY_PROJECTS, all);
      return next;
    },
    deleteProject(id: string): void {
      const all = readArray<SavedProject>(STORAGE_KEY_PROJECTS).filter(
        (p) => p.metadata.id !== id
      );
      writeArray(STORAGE_KEY_PROJECTS, all);

      const runs = readArray<SavedRun>(STORAGE_KEY_RUNS).filter(
        (r) => r.projectId !== id
      );
      writeArray(STORAGE_KEY_RUNS, runs);

      const results = readArray<TestResult>(STORAGE_KEY_RESULTS).filter(
        (r) => r.projectId !== id
      );
      writeArray(STORAGE_KEY_RESULTS, results);

      if (this.getActiveProjectId() === id) {
        this.setActiveProject(null);
      }
    },
    setActiveProject(id: string | null): void {
      if (!hasWindow()) return;
      try {
        if (id === null) {
          window.localStorage.removeItem(STORAGE_KEY_ACTIVE);
        } else {
          window.localStorage.setItem(STORAGE_KEY_ACTIVE, id);
        }
      } catch {
        // ignore
      }
    },
    getActiveProjectId(): string | null {
      if (!hasWindow()) return null;
      try {
        return window.localStorage.getItem(STORAGE_KEY_ACTIVE);
      } catch {
        return null;
      }
    },
    listRuns(projectId: string): SavedRun[] {
      return readArray<SavedRun>(STORAGE_KEY_RUNS).filter(
        (r) => r.projectId === projectId
      );
    },
    appendRun(run: SavedRun): SavedRun {
      validateRun(run);
      const all = readArray<SavedRun>(STORAGE_KEY_RUNS);
      all.push(run);
      writeArray(STORAGE_KEY_RUNS, all);

      // Update project metadata.
      const projects = readArray<SavedProject>(STORAGE_KEY_PROJECTS);
      const idx = projects.findIndex(
        (p) => p.metadata.id === run.projectId
      );
      if (idx >= 0) {
        const meta = projects[idx].metadata;
        projects[idx] = {
          ...projects[idx],
          metadata: {
            ...meta,
            lastRunAt: run.runAt,
            runCount: (meta.runCount ?? 0) + 1,
            updatedAt: new Date().toISOString(),
          },
        };
        writeArray(STORAGE_KEY_PROJECTS, projects);
      }
      return run;
    },
    deleteRun(runId: string): void {
      const all = readArray<SavedRun>(STORAGE_KEY_RUNS).filter(
        (r) => r.id !== runId
      );
      writeArray(STORAGE_KEY_RUNS, all);
    },
    listResults(projectId: string): TestResult[] {
      return readArray<TestResult>(STORAGE_KEY_RESULTS).filter(
        (r) => r.projectId === projectId
      );
    },
    upsertResult(result: TestResult): TestResult {
      validateResult(result);
      const now = new Date().toISOString();
      const all = readArray<TestResult>(STORAGE_KEY_RESULTS);
      const idx = all.findIndex((r) => r.id === result.id);
      const next: TestResult = {
        ...result,
        createdAt: result.createdAt || now,
        updatedAt: now,
      };
      if (idx >= 0) {
        all[idx] = next;
      } else {
        all.push(next);
      }
      writeArray(STORAGE_KEY_RESULTS, all);
      return next;
    },
    deleteResult(resultId: string): void {
      const all = readArray<TestResult>(STORAGE_KEY_RESULTS).filter(
        (r) => r.id !== resultId
      );
      writeArray(STORAGE_KEY_RESULTS, all);
    },
  };
}

// ---- Memory adapter ---------------------------------------------------
//
// Same interface, backed by in-memory arrays. Useful for SSR (where
// localStorage isn't available) and for the test-logic harness.

export function createMemoryProjectStore(): ProjectStore {
  let projects: SavedProject[] = [];
  let runs: SavedRun[] = [];
  let results: TestResult[] = [];
  let activeId: string | null = null;

  return {
    listProjects(): SavedProject[] {
      return projects.slice();
    },
    getProject(id: string): SavedProject | null {
      return projects.find((p) => p.metadata.id === id) ?? null;
    },
    saveProject(project: SavedProject): SavedProject {
      validateProject(project);
      const now = new Date().toISOString();
      const idx = projects.findIndex((p) => p.metadata.id === project.metadata.id);
      const next: SavedProject = {
        ...project,
        metadata: {
          ...project.metadata,
          updatedAt: now,
          createdAt: project.metadata.createdAt || now,
        },
      };
      if (idx >= 0) {
        projects[idx] = next;
      } else {
        projects.push(next);
      }
      return next;
    },
    deleteProject(id: string): void {
      projects = projects.filter((p) => p.metadata.id !== id);
      runs = runs.filter((r) => r.projectId !== id);
      results = results.filter((r) => r.projectId !== id);
      if (activeId === id) activeId = null;
    },
    setActiveProject(id: string | null): void {
      activeId = id;
    },
    getActiveProjectId(): string | null {
      return activeId;
    },
    listRuns(projectId: string): SavedRun[] {
      return runs.filter((r) => r.projectId === projectId);
    },
    appendRun(run: SavedRun): SavedRun {
      validateRun(run);
      runs.push(run);
      const idx = projects.findIndex((p) => p.metadata.id === run.projectId);
      if (idx >= 0) {
        const meta = projects[idx].metadata;
        projects[idx] = {
          ...projects[idx],
          metadata: {
            ...meta,
            lastRunAt: run.runAt,
            runCount: (meta.runCount ?? 0) + 1,
            updatedAt: new Date().toISOString(),
          },
        };
      }
      return run;
    },
    deleteRun(runId: string): void {
      runs = runs.filter((r) => r.id !== runId);
    },
    listResults(projectId: string): TestResult[] {
      return results.filter((r) => r.projectId === projectId);
    },
    upsertResult(result: TestResult): TestResult {
      validateResult(result);
      const now = new Date().toISOString();
      const idx = results.findIndex((r) => r.id === result.id);
      const next: TestResult = {
        ...result,
        createdAt: result.createdAt || now,
        updatedAt: now,
      };
      if (idx >= 0) {
        results[idx] = next;
      } else {
        results.push(next);
      }
      return next;
    },
    deleteResult(resultId: string): void {
      results = results.filter((r) => r.id !== resultId);
    },
  };
}
