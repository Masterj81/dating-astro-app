// agency-store.ts — persistence adapter for the Agency Packaging Layer.
//
// Mirrors `src/lib/review/review-store.ts`. State lives in localStorage
// under a versioned `:v1` key so future schema bumps can migrate without
// silent loss. The browser adapter is SSR-safe: when `window` is
// undefined, reads return undefined and writes are no-ops. A second
// `createMemoryAgencyStore()` adapter shares the same interface for
// tests and SSR fallbacks.
//
// No external dependencies. No backend. No telemetry.

import type { AgencySelection } from "@/types/agency";

// Versioned localStorage key. Bump the suffix when the shape changes.
export const STORAGE_KEY_AGENCY_SELECTION = "bigad:agency-selection:v1";

export interface AgencyStore {
  getSelection(projectId: string): AgencySelection | undefined;
  setSelection(selection: AgencySelection): void;
  clearSelection(projectId: string): void;
}

// ---- Shape validation (defence-in-depth) -------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validateSelection(s: AgencySelection): void {
  if (!s || typeof s !== "object") {
    throw new Error("AgencyStore: setSelection requires an AgencySelection");
  }
  if (!isNonEmptyString(s.projectId)) {
    throw new Error("AgencyStore: selection.projectId is required");
  }
}

// ---- Browser adapter ---------------------------------------------------

function hasWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readArray(): AgencySelection[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_AGENCY_SELECTION);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgencySelection[]) : [];
  } catch {
    return [];
  }
}

function writeArray(items: AgencySelection[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_AGENCY_SELECTION,
      JSON.stringify(items)
    );
  } catch {
    // localStorage may throw (quota, private mode). Silent fallback.
  }
}

export function createBrowserAgencyStore(): AgencyStore {
  return {
    getSelection(projectId: string): AgencySelection | undefined {
      return readArray().find((s) => s.projectId === projectId);
    },
    setSelection(selection: AgencySelection): void {
      validateSelection(selection);
      const all = readArray();
      const idx = all.findIndex((s) => s.projectId === selection.projectId);
      if (idx >= 0) {
        all[idx] = selection;
      } else {
        all.push(selection);
      }
      writeArray(all);
    },
    clearSelection(projectId: string): void {
      const all = readArray().filter((s) => s.projectId !== projectId);
      writeArray(all);
    },
  };
}

// ---- Memory adapter ----------------------------------------------------

export function createMemoryAgencyStore(): AgencyStore {
  let items: AgencySelection[] = [];

  return {
    getSelection(projectId: string): AgencySelection | undefined {
      return items.find((s) => s.projectId === projectId);
    },
    setSelection(selection: AgencySelection): void {
      validateSelection(selection);
      const idx = items.findIndex((s) => s.projectId === selection.projectId);
      if (idx >= 0) {
        items[idx] = selection;
      } else {
        items.push(selection);
      }
    },
    clearSelection(projectId: string): void {
      items = items.filter((s) => s.projectId !== projectId);
    },
  };
}
