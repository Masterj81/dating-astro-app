"use client";

// OnboardingWelcomePanel.tsx — first-run welcome surface for CampaignOS.
//
// Co-located `useOnboarding()` hook binds to the browser store and
// exposes the current onboarding state plus action helpers. The
// `OnboardingWelcomePanel` component renders when no projects exist
// AND `state.dismissed === false`. Layout: hero → goal picker → demo
// selector → "create empty project" fallback → skip link.
//
// User-facing strings say "CampaignOS". Internal identifiers and the
// localStorage keys stay BigAd-shaped for migration continuity.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildDemoLoadPlan,
  listDemoProjects,
  getDemoProject,
} from "@/lib/onboarding/demo-projects";
import {
  getOnboardingGoals,
  getOnboardingGoal,
} from "@/lib/onboarding/onboarding";
import {
  createBrowserOnboardingStore,
  type OnboardingStore,
} from "@/lib/onboarding/onboarding-store";
import {
  createBrowserProjectStore,
  type ProjectStore,
} from "@/lib/workspace/project-store";
import {
  createBrowserReviewStore,
  type ReviewStore,
} from "@/lib/review/review-store";
import {
  createBrowserPlaybookStore,
  type PlaybookStore,
} from "@/lib/playbook/playbook-store";
import { PLAYBOOKS } from "@/lib/playbook/catalog";
import type {
  DemoProjectMetadata,
  OnboardingGoal,
  OnboardingGoalId,
  OnboardingState,
} from "@/types/onboarding";

// ---- Hook ----------------------------------------------------------------

export interface UseOnboardingResult {
  store: OnboardingStore | null;
  state: OnboardingState;
  setGoal(goalId: OnboardingGoalId): void;
  markStepCompleted(stepId: string): void;
  dismiss(): void;
  undismiss(): void;
  markDemoLoaded(demoId: string): void;
  wasDemoLoaded(demoId: string): boolean;
  reset(): void;
  refresh(): void;
}

export function useOnboarding(): UseOnboardingResult {
  const [store, setStore] = useState<OnboardingStore | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setStore(createBrowserOnboardingStore());
  }, []);

  const state = useMemo<OnboardingState>(() => {
    if (!store)
      return {
        completedStepIds: [],
        dismissed: false,
        updatedAt: 0,
      };
    return store.getState();
    // tick is the refresh dependency
  }, [store, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    store,
    state,
    setGoal(goalId) {
      if (!store) return;
      store.setGoal(goalId);
      refresh();
    },
    markStepCompleted(stepId) {
      if (!store) return;
      store.markStepCompleted(stepId as never);
      refresh();
    },
    dismiss() {
      if (!store) return;
      store.dismiss();
      refresh();
    },
    undismiss() {
      if (!store) return;
      store.undismiss();
      refresh();
    },
    markDemoLoaded(demoId) {
      if (!store) return;
      store.markDemoLoaded(demoId);
      refresh();
    },
    wasDemoLoaded(demoId) {
      if (!store) return false;
      return store.wasDemoLoaded(demoId);
    },
    reset() {
      if (!store) return;
      store.reset();
      refresh();
    },
    refresh,
  };
}

// ---- Demo loader (client-side composition) ------------------------------

interface LoadDemoArgs {
  projectStore: ProjectStore;
  reviewStore: ReviewStore;
  playbookStore: PlaybookStore;
  onboarding: UseOnboardingResult;
  demoId: DemoProjectMetadata["id"];
  onLoadInput?: (input: ReturnType<typeof getDemoProject>["input"]) => void;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function loadDemoIntoWorkspace(args: LoadDemoArgs): string {
  const { projectStore, reviewStore, playbookStore, onboarding, demoId, onLoadInput } = args;
  const demo = getDemoProject(demoId);
  const projectId = newId(`demo-${demo.id}`);
  const runId = `${projectId}-run-1`;
  const nowMs = Date.now();

  const plan = buildDemoLoadPlan(demo, { projectId, runId, nowMs });

  projectStore.saveProject(plan.project);
  projectStore.appendRun(plan.run);
  for (const result of plan.testResults) {
    projectStore.upsertResult(result);
  }

  // Review items + comments: we write the review items by calling
  // upsertItem (which is idempotent on item.id). Comments cannot be
  // pre-loaded via the store API (addComment generates its own id),
  // so we write them in-place via localStorage.
  for (const item of plan.reviewItems) {
    reviewStore.upsertItem(item);
  }
  // Best-effort comment seed via direct localStorage write — the
  // review store's `addComment` re-generates ids, which would lose
  // the deterministic linkage to the demo plan. We append to the
  // same versioned key the store reads from.
  if (typeof window !== "undefined" && plan.reviewComments.length > 0) {
    try {
      const KEY = "bigad:review-comments:v1";
      const existingRaw = window.localStorage.getItem(KEY);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const next = Array.isArray(existing) ? existing : [];
      for (const c of plan.reviewComments) {
        next.push(c);
      }
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Silent fallback — demo comments are decorative, not load-bearing.
    }
  }

  playbookStore.setApplied(projectId, plan.appliedPlaybookId);
  projectStore.setActiveProject(projectId);

  onboarding.markDemoLoaded(demo.id);
  onboarding.setGoal(demo.goalId);
  onboarding.markStepCompleted("create-or-load-project");

  if (onLoadInput) onLoadInput(demo.input);

  return projectId;
}

// ---- Welcome panel -----------------------------------------------------

export interface OnboardingWelcomePanelProps {
  onboarding: UseOnboardingResult;
  onLoadInput?: (input: ReturnType<typeof getDemoProject>["input"]) => void;
  onCreateEmpty?: () => void;
}

export function OnboardingWelcomePanel({
  onboarding,
  onLoadInput,
  onCreateEmpty,
}: OnboardingWelcomePanelProps) {
  const [mounted, setMounted] = useState(false);
  const [projectStore, setProjectStore] = useState<ProjectStore | null>(null);
  const [reviewStore, setReviewStore] = useState<ReviewStore | null>(null);
  const [playbookStore, setPlaybookStore] = useState<PlaybookStore | null>(null);

  useEffect(() => {
    setMounted(true);
    setProjectStore(createBrowserProjectStore());
    setReviewStore(createBrowserReviewStore());
    setPlaybookStore(createBrowserPlaybookStore());
  }, []);

  if (!mounted) return null;
  const goals = getOnboardingGoals();
  const demos = listDemoProjects();

  function handleLoadDemo(demoId: DemoProjectMetadata["id"]) {
    if (!projectStore || !reviewStore || !playbookStore) return;
    loadDemoIntoWorkspace({
      projectStore,
      reviewStore,
      playbookStore,
      onboarding,
      demoId,
      onLoadInput,
    });
  }

  function handleSkip() {
    onboarding.dismiss();
  }

  function handleCreateEmpty() {
    if (onCreateEmpty) onCreateEmpty();
    onboarding.dismiss();
  }

  return (
    <section className="hairline mx-4 mt-4 rounded-lg bg-ink-900 p-5 md:mx-6">
      <header>
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          First-run onboarding
        </p>
        <h2 className="mt-1 text-base font-semibold text-ink-50">
          Welcome to CampaignOS
        </h2>
        <p className="mt-1 text-xs text-ink-300">
          Pick a goal, load a demo, or start from scratch. Nothing leaves
          this browser — every input, run, and review stays in
          localStorage.
        </p>
      </header>

      {/* Step 1 — Pick a goal */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
          Step 1 — Pick your goal
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {goals.map((g) => (
            <GoalButton
              key={g.id}
              goal={g}
              selected={onboarding.state.goalId === g.id}
              onClick={() => onboarding.setGoal(g.id)}
            />
          ))}
        </div>
      </div>

      {/* Step 2 — Load a demo */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
          Step 2 — Load a demo project
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {demos.map((d) => (
            <DemoCard
              key={d.id}
              demo={d}
              loaded={onboarding.wasDemoLoaded(d.id)}
              onLoad={() => handleLoadDemo(d.id)}
            />
          ))}
        </div>
      </div>

      {/* Or start from scratch */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 pt-4">
        <div>
          <p className="text-xs text-ink-300">
            Or fill in your own product on the left and skip the demos.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCreateEmpty}
            className="rounded-sm border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 hover:border-accent hover:text-white"
          >
            Create empty project
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-sm px-3 py-1.5 text-xs text-ink-400 hover:text-ink-100"
          >
            Skip onboarding
          </button>
        </div>
      </div>
    </section>
  );
}

function GoalButton({
  goal,
  selected,
  onClick,
}: {
  goal: OnboardingGoal;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-sm border p-3 text-left transition ${
        selected
          ? "border-accent bg-ink-950"
          : "border-ink-700 bg-ink-800 hover:border-ink-500"
      }`}
    >
      <span className="text-sm font-medium text-ink-100">{goal.label}</span>
      <span className="text-xxs text-ink-400">{goal.description}</span>
    </button>
  );
}

function DemoCard({
  demo,
  loaded,
  onLoad,
}: {
  demo: DemoProjectMetadata;
  loaded: boolean;
  onLoad: () => void;
}) {
  const playbook = PLAYBOOKS[demo.recommendedPlaybook];
  return (
    <div className="hairline flex flex-col gap-2 rounded-sm bg-ink-950 p-3">
      <p className="text-sm font-medium text-ink-100">{demo.label}</p>
      <p className="text-xxs text-ink-400">{demo.blurb}</p>
      <span className="inline-block w-fit rounded-sm border border-accent/40 px-2 py-0.5 text-xxs text-accent">
        {playbook?.name ?? demo.recommendedPlaybook}
      </span>
      <button
        type="button"
        onClick={onLoad}
        className="mt-1 rounded-sm border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 hover:border-accent hover:text-white"
      >
        {loaded ? "Reload demo" : "Load demo"}
      </button>
    </div>
  );
}

// ---- Goal pill (compact selector reopen) -------------------------------

export interface OnboardingGoalPillProps {
  onboarding: UseOnboardingResult;
}

export function OnboardingGoalPill({ onboarding }: OnboardingGoalPillProps) {
  const [editing, setEditing] = useState(false);
  const state = onboarding.state;
  const goal = state.goalId ? getOnboardingGoal(state.goalId) : undefined;
  if (!goal) return null;

  if (editing) {
    return (
      <div className="hairline mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-sm bg-ink-900 px-3 py-2 text-xxs md:mx-6">
        <span className="text-ink-300">Change goal:</span>
        {getOnboardingGoals().map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              onboarding.setGoal(g.id);
              setEditing(false);
            }}
            className={`rounded-sm border px-2 py-0.5 transition ${
              g.id === state.goalId
                ? "border-accent text-accent"
                : "border-ink-700 bg-ink-800 text-ink-100 hover:border-ink-500"
            }`}
          >
            {g.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="ml-1 text-ink-400 hover:text-ink-100"
        >
          cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 text-xxs md:mx-6">
      <span className="rounded-sm border border-accent/40 px-2 py-0.5 text-accent">
        Goal: {goal.label}
      </span>
      <span className="text-ink-400">
        Recommended playbook:{" "}
        {PLAYBOOKS[goal.recommendedPlaybook]?.name ?? goal.recommendedPlaybook}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-ink-400 hover:text-ink-100"
      >
        Change
      </button>
    </div>
  );
}
