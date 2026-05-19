// benchmark-store.ts — persistence adapter for the Benchmarks /
// Calibration Layer.
//
// Holds the **manual** / **client-history** benchmark profiles the
// operator captures in the UI. Built-in profiles live in `catalog.ts`
// and are never persisted. Manual profiles are surfaced ONLY in the
// UI (BenchmarkPanel) alongside the built-in catalog — they MUST NOT
// be threaded into `buildStrategy` so engine purity is preserved.
//
// State lives in localStorage under a versioned `:v1` key so future
// schema bumps can migrate without silent loss. The browser adapter
// is SSR-safe: when `window` is undefined, reads return [] and writes
// are no-ops. A second `createMemoryBenchmarkStore()` adapter shares
// the same interface for tests and SSR fallbacks.
//
// No external dependencies. No backend. No telemetry.

import type { BenchmarkProfile } from "@/types/benchmarks";

// Versioned localStorage key. Bump the suffix when the shape changes.
export const STORAGE_KEY_BENCHMARK_PROFILES = "bigad:benchmark-profiles:v1";

export interface BenchmarkStore {
  listManualProfiles(): BenchmarkProfile[];
  upsertManualProfile(profile: BenchmarkProfile): void;
  deleteManualProfile(id: string): void;
  clearAll(): void;
}

// ---- Shape validation -------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validate(profile: BenchmarkProfile): void {
  if (!isNonEmptyString(profile.id)) {
    throw new Error("BenchmarkStore: profile.id is required");
  }
  if (profile.source === "built-in") {
    throw new Error("BenchmarkStore: built-in profiles are not persisted");
  }
  if (!Array.isArray(profile.metrics) || profile.metrics.length === 0) {
    throw new Error("BenchmarkStore: profile.metrics must be non-empty");
  }
}

// ---- Browser adapter --------------------------------------------------

function hasWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readArray(): BenchmarkProfile[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_BENCHMARK_PROFILES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter out anything pretending to be a built-in profile.
    return (parsed as BenchmarkProfile[]).filter(
      (p) => p && p.source !== "built-in"
    );
  } catch {
    return [];
  }
}

function writeArray(items: BenchmarkProfile[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_BENCHMARK_PROFILES,
      JSON.stringify(items)
    );
  } catch {
    // localStorage may throw (quota, private mode). Silent fallback.
  }
}

export function createBrowserBenchmarkStore(): BenchmarkStore {
  return {
    listManualProfiles(): BenchmarkProfile[] {
      return readArray();
    },
    upsertManualProfile(profile: BenchmarkProfile): void {
      validate(profile);
      const all = readArray();
      const idx = all.findIndex((p) => p.id === profile.id);
      if (idx >= 0) {
        all[idx] = profile;
      } else {
        all.push(profile);
      }
      writeArray(all);
    },
    deleteManualProfile(id: string): void {
      const all = readArray().filter((p) => p.id !== id);
      writeArray(all);
    },
    clearAll(): void {
      writeArray([]);
    },
  };
}

// ---- Memory adapter ---------------------------------------------------

export function createMemoryBenchmarkStore(): BenchmarkStore {
  let items: BenchmarkProfile[] = [];

  return {
    listManualProfiles(): BenchmarkProfile[] {
      return items.slice();
    },
    upsertManualProfile(profile: BenchmarkProfile): void {
      validate(profile);
      const idx = items.findIndex((p) => p.id === profile.id);
      if (idx >= 0) {
        items[idx] = profile;
      } else {
        items.push(profile);
      }
    },
    deleteManualProfile(id: string): void {
      items = items.filter((p) => p.id !== id);
    },
    clearAll(): void {
      items = [];
    },
  };
}
