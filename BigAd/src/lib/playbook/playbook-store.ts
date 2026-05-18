// playbook-store.ts — persistence adapter for the Playbook Library.
//
// Mirrors `src/lib/agency/agency-store.ts`. State lives in localStorage
// under a versioned `:v1` key so future schema bumps can migrate without
// silent loss. The browser adapter is SSR-safe: when `window` is
// undefined, reads return undefined and writes are no-ops. A second
// `createMemoryPlaybookStore()` adapter shares the same interface for
// tests and SSR fallbacks.
//
// No external dependencies. No backend. No telemetry.

import type { AppliedPlaybook, PlaybookId } from "@/types/playbook";

// Versioned localStorage key. Bump the suffix when the shape changes.
export const STORAGE_KEY_APPLIED_PLAYBOOK = "bigad:applied-playbook:v1";

export interface PlaybookStore {
  getApplied(projectId: string): PlaybookId | undefined;
  setApplied(projectId: string, playbookId: PlaybookId): void;
  clear(projectId: string): void;
}

// ---- Shape validation -------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validate(projectId: string, playbookId: PlaybookId): void {
  if (!isNonEmptyString(projectId)) {
    throw new Error("PlaybookStore: projectId is required");
  }
  if (!isNonEmptyString(playbookId)) {
    throw new Error("PlaybookStore: playbookId is required");
  }
}

// ---- Browser adapter --------------------------------------------------

function hasWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readArray(): AppliedPlaybook[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_APPLIED_PLAYBOOK);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AppliedPlaybook[]) : [];
  } catch {
    return [];
  }
}

function writeArray(items: AppliedPlaybook[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_APPLIED_PLAYBOOK,
      JSON.stringify(items)
    );
  } catch {
    // localStorage may throw (quota, private mode). Silent fallback.
  }
}

export function createBrowserPlaybookStore(): PlaybookStore {
  return {
    getApplied(projectId: string): PlaybookId | undefined {
      return readArray().find((a) => a.projectId === projectId)?.playbookId;
    },
    setApplied(projectId: string, playbookId: PlaybookId): void {
      validate(projectId, playbookId);
      const all = readArray();
      const idx = all.findIndex((a) => a.projectId === projectId);
      const entry: AppliedPlaybook = {
        projectId,
        playbookId,
        updatedAt: Date.now(),
      };
      if (idx >= 0) {
        all[idx] = entry;
      } else {
        all.push(entry);
      }
      writeArray(all);
    },
    clear(projectId: string): void {
      const all = readArray().filter((a) => a.projectId !== projectId);
      writeArray(all);
    },
  };
}

// ---- Memory adapter ---------------------------------------------------

export function createMemoryPlaybookStore(): PlaybookStore {
  let items: AppliedPlaybook[] = [];

  return {
    getApplied(projectId: string): PlaybookId | undefined {
      return items.find((a) => a.projectId === projectId)?.playbookId;
    },
    setApplied(projectId: string, playbookId: PlaybookId): void {
      validate(projectId, playbookId);
      const idx = items.findIndex((a) => a.projectId === projectId);
      const entry: AppliedPlaybook = {
        projectId,
        playbookId,
        // Memory adapter still records an updatedAt for parity with
        // the browser adapter. Tests that need determinism should not
        // depend on this field.
        updatedAt: 0,
      };
      if (idx >= 0) {
        items[idx] = entry;
      } else {
        items.push(entry);
      }
    },
    clear(projectId: string): void {
      items = items.filter((a) => a.projectId !== projectId);
    },
  };
}
