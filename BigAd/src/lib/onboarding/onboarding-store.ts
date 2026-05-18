// onboarding-store.ts — persistence adapter for the Onboarding & Demo
// Projects layer.
//
// Mirrors `src/lib/playbook/playbook-store.ts`. State lives in
// localStorage under versioned `:v1` keys so future schema bumps can
// migrate without silent loss. The browser adapter is SSR-safe: when
// `window` is undefined, reads return defaults and writes are no-ops.
// `createMemoryOnboardingStore()` shares the same interface for tests
// and SSR fallbacks.
//
// No external dependencies. No backend. No telemetry.

import type {
  OnboardingGoalId,
  OnboardingState,
  OnboardingStepId,
} from "@/types/onboarding";
import { buildInitialOnboardingState } from "./onboarding";

// Versioned localStorage keys. Bump the suffix when the shape changes.
export const STORAGE_KEY_ONBOARDING = "bigad:onboarding:v1";
export const STORAGE_KEY_DEMO_LOADED = "bigad:demo-loaded:v1";

export type DemoLoadedMap = Record<string, { loadedAt: number }>;

export interface OnboardingStore {
  getState(): OnboardingState;
  setState(state: OnboardingState): void;
  setGoal(goalId: OnboardingGoalId): void;
  markStepCompleted(stepId: OnboardingStepId): void;
  dismiss(): void;
  undismiss(): void;
  markDemoLoaded(demoId: string): void;
  wasDemoLoaded(demoId: string): boolean;
  reset(): void;
}

// ---- SSR guard ---------------------------------------------------------

function hasWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

// ---- Validation -------------------------------------------------------

function isOnboardingState(v: unknown): v is OnboardingState {
  if (!v || typeof v !== "object") return false;
  const s = v as OnboardingState;
  if (!Array.isArray(s.completedStepIds)) return false;
  if (typeof s.dismissed !== "boolean") return false;
  if (typeof s.updatedAt !== "number") return false;
  return true;
}

// ---- Browser adapter --------------------------------------------------

function readState(): OnboardingState {
  if (!hasWindow()) return buildInitialOnboardingState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_ONBOARDING);
    if (!raw) return buildInitialOnboardingState();
    const parsed = JSON.parse(raw);
    if (!isOnboardingState(parsed)) return buildInitialOnboardingState();
    return parsed;
  } catch {
    return buildInitialOnboardingState();
  }
}

function writeState(state: OnboardingState): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_ONBOARDING,
      JSON.stringify(state)
    );
  } catch {
    // localStorage may throw (quota, private mode). Silent fallback.
  }
}

function readDemoLoaded(): DemoLoadedMap {
  if (!hasWindow()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_DEMO_LOADED);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as DemoLoadedMap;
  } catch {
    return {};
  }
}

function writeDemoLoaded(map: DemoLoadedMap): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_DEMO_LOADED,
      JSON.stringify(map)
    );
  } catch {
    // ignore
  }
}

export function createBrowserOnboardingStore(): OnboardingStore {
  return {
    getState(): OnboardingState {
      return readState();
    },
    setState(state: OnboardingState): void {
      // Caller may pre-stamp updatedAt; if zero / missing, stamp it.
      const stamped: OnboardingState = {
        ...state,
        updatedAt: state.updatedAt > 0 ? state.updatedAt : Date.now(),
      };
      writeState(stamped);
    },
    setGoal(goalId: OnboardingGoalId): void {
      const current = readState();
      writeState({
        ...current,
        goalId,
        updatedAt: Date.now(),
      });
    },
    markStepCompleted(stepId: OnboardingStepId): void {
      const current = readState();
      if (current.completedStepIds.includes(stepId)) return;
      writeState({
        ...current,
        completedStepIds: [...current.completedStepIds, stepId],
        updatedAt: Date.now(),
      });
    },
    dismiss(): void {
      const current = readState();
      writeState({ ...current, dismissed: true, updatedAt: Date.now() });
    },
    undismiss(): void {
      const current = readState();
      writeState({ ...current, dismissed: false, updatedAt: Date.now() });
    },
    markDemoLoaded(demoId: string): void {
      const map = readDemoLoaded();
      map[demoId] = { loadedAt: Date.now() };
      writeDemoLoaded(map);
    },
    wasDemoLoaded(demoId: string): boolean {
      const map = readDemoLoaded();
      return !!map[demoId];
    },
    reset(): void {
      if (!hasWindow()) return;
      try {
        window.localStorage.removeItem(STORAGE_KEY_ONBOARDING);
        window.localStorage.removeItem(STORAGE_KEY_DEMO_LOADED);
      } catch {
        // ignore
      }
    },
  };
}

// ---- Memory adapter ---------------------------------------------------

export function createMemoryOnboardingStore(): OnboardingStore {
  let state: OnboardingState = buildInitialOnboardingState();
  let demoMap: DemoLoadedMap = {};

  return {
    getState(): OnboardingState {
      // Return a defensive copy so callers cannot mutate internals.
      return {
        ...state,
        completedStepIds: state.completedStepIds.slice(),
      };
    },
    setState(next: OnboardingState): void {
      state = {
        ...next,
        // Memory adapter records updatedAt for parity with the browser
        // adapter; tests that need determinism should not depend on it.
        updatedAt: next.updatedAt > 0 ? next.updatedAt : 0,
        completedStepIds: next.completedStepIds.slice(),
      };
    },
    setGoal(goalId: OnboardingGoalId): void {
      state = { ...state, goalId, updatedAt: state.updatedAt };
    },
    markStepCompleted(stepId: OnboardingStepId): void {
      if (state.completedStepIds.includes(stepId)) return;
      state = {
        ...state,
        completedStepIds: [...state.completedStepIds, stepId],
      };
    },
    dismiss(): void {
      state = { ...state, dismissed: true };
    },
    undismiss(): void {
      state = { ...state, dismissed: false };
    },
    markDemoLoaded(demoId: string): void {
      demoMap[demoId] = { loadedAt: 0 };
    },
    wasDemoLoaded(demoId: string): boolean {
      return !!demoMap[demoId];
    },
    reset(): void {
      state = buildInitialOnboardingState();
      demoMap = {};
    },
  };
}
