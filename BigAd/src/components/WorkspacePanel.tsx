"use client";

// WorkspacePanel.tsx — Project Workspace UI for BigAd.
//
// Holds the ProjectSwitcher (top sticky strip), and renders the
// dedicated Workspace tab body: run history, test-results log editor,
// learning memory readout. All state lives in localStorage via the
// ProjectStore adapter.

import { useEffect, useMemo, useState } from "react";
import type {
  Learning,
  LearningMemory,
  RunComparison,
  SavedProject,
  SavedRun,
  TestResult,
  TestResultStatus,
} from "@/types/workspace";
import type { ProductInput, Strategy, TestCell } from "@/types/strategy";
import {
  createBrowserProjectStore,
  type ProjectStore,
} from "@/lib/workspace/project-store";
import {
  buildRunComparison,
  deriveLearningMemory,
} from "@/lib/workspace/learning";

// Tiny deterministic-ish id helper. localStorage is per-browser so we
// don't need globally-unique ids; a short timestamp+random suffix is
// enough to avoid collisions.
function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

const STATUS_OPTIONS: { value: TestResultStatus; label: string }[] = [
  { value: "not-yet-launched", label: "Not yet launched" },
  { value: "paused", label: "Paused" },
  { value: "inconclusive", label: "Inconclusive" },
  { value: "winning", label: "Winning" },
  { value: "losing", label: "Losing" },
  { value: "killed-early", label: "Killed early" },
];

// ---- Hook: live store binding ------------------------------------------

export interface WorkspaceState {
  store: ProjectStore | null;
  projects: SavedProject[];
  activeProjectId: string | null;
  activeProject: SavedProject | null;
  runs: SavedRun[];
  results: TestResult[];
  learningMemory: LearningMemory;
}

export function useWorkspace(): WorkspaceState & {
  refresh: () => void;
  setStore: (s: ProjectStore | null) => void;
} {
  const [store, setStore] = useState<ProjectStore | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Lazy-instantiate only on the client to keep SSR happy.
    setStore(createBrowserProjectStore());
  }, []);

  const projects = useMemo(
    () => (store ? store.listProjects() : []),
    [store, tick]
  );
  const activeProjectId = useMemo(
    () => (store ? store.getActiveProjectId() : null),
    [store, tick]
  );
  const activeProject = useMemo(
    () =>
      store && activeProjectId ? store.getProject(activeProjectId) : null,
    [store, activeProjectId, tick]
  );
  const runs = useMemo(
    () => (store && activeProjectId ? store.listRuns(activeProjectId) : []),
    [store, activeProjectId, tick]
  );
  const results = useMemo(
    () => (store && activeProjectId ? store.listResults(activeProjectId) : []),
    [store, activeProjectId, tick]
  );
  const learningMemory = useMemo(
    () => deriveLearningMemory(results, runs),
    [results, runs]
  );

  return {
    store,
    projects,
    activeProjectId,
    activeProject,
    runs,
    results,
    learningMemory,
    refresh: () => setTick((t) => t + 1),
    setStore,
  };
}

// ---- ProjectSwitcher (sticky header strip) -----------------------------

interface SwitcherProps {
  state: WorkspaceState & { refresh: () => void };
  currentInput: ProductInput;
  currentStrategy: Strategy;
  onLoadInput: (input: ProductInput) => void;
}

export function ProjectSwitcher({
  state,
  currentInput,
  currentStrategy,
  onLoadInput,
}: SwitcherProps) {
  const { store, projects, activeProjectId, activeProject, refresh } = state;
  const [draftName, setDraftName] = useState("");

  if (!store) {
    return (
      <div className="flex items-center gap-2 border-b border-ink-700 bg-ink-900/60 px-4 py-2 text-xxs text-ink-400">
        Workspace loading…
      </div>
    );
  }

  function handleSelect(id: string) {
    if (!store) return;
    if (id === "__none__") {
      store.setActiveProject(null);
      refresh();
      return;
    }
    store.setActiveProject(id);
    const proj = store.getProject(id);
    if (proj) onLoadInput(proj.input);
    refresh();
  }

  function handleSaveAsNew() {
    if (!store) return;
    const name =
      draftName.trim() ||
      currentInput.name?.trim() ||
      `Project ${projects.length + 1}`;
    const now = new Date().toISOString();
    const id = newId("proj");
    store.saveProject({
      metadata: {
        id,
        name,
        createdAt: now,
        updatedAt: now,
        runCount: 0,
      },
      input: currentInput,
    });
    store.setActiveProject(id);
    setDraftName("");
    refresh();
  }

  function handleUpdateActive() {
    if (!store || !activeProject) return;
    store.saveProject({
      metadata: activeProject.metadata,
      input: currentInput,
    });
    refresh();
  }

  function handleSaveRun() {
    if (!store || !activeProjectId) return;
    const run: SavedRun = {
      id: newId("run"),
      projectId: activeProjectId,
      runAt: new Date().toISOString(),
      input: currentInput,
      strategy: currentStrategy,
    };
    store.appendRun(run);
    refresh();
  }

  function handleDelete() {
    if (!store || !activeProjectId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this project, all its runs, and all its test results?")
    ) {
      return;
    }
    store.deleteProject(activeProjectId);
    refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-900/60 px-4 py-2 text-xxs">
      <span className="text-ink-300">Project:</span>
      <select
        className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-ink-100"
        value={activeProjectId ?? "__none__"}
        onChange={(e) => handleSelect(e.target.value)}
      >
        <option value="__none__">— none —</option>
        {projects.map((p) => (
          <option key={p.metadata.id} value={p.metadata.id}>
            {p.metadata.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="New project name…"
        className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-ink-100 placeholder:text-ink-500"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
      />
      <button
        type="button"
        onClick={handleSaveAsNew}
        className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-ink-100 hover:border-accent hover:text-white"
      >
        Save as new project
      </button>
      {activeProject && (
        <>
          <button
            type="button"
            onClick={handleUpdateActive}
            className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-ink-100 hover:border-accent hover:text-white"
          >
            Update inputs
          </button>
          <button
            type="button"
            onClick={handleSaveRun}
            className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-ink-100 hover:border-accent hover:text-white"
          >
            Save run
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-sm border border-rose-500/40 bg-ink-800 px-2 py-1 text-rose-300 hover:border-rose-400 hover:text-rose-100"
          >
            Delete project
          </button>
          <span className="text-ink-500">
            {state.runs.length} run{state.runs.length === 1 ? "" : "s"} · {state.results.length} result{state.results.length === 1 ? "" : "s"}
          </span>
        </>
      )}
    </div>
  );
}

// ---- Workspace tab body ------------------------------------------------

interface WorkspaceTabProps {
  state: WorkspaceState & { refresh: () => void };
  currentStrategy: Strategy;
}

export function WorkspaceTab({ state, currentStrategy }: WorkspaceTabProps) {
  if (!state.activeProject) {
    return (
      <div className="hairline rounded-lg bg-ink-900 p-5 text-xs text-ink-300">
        No active project. Use the bar at the top of the page to save the
        current inputs as a project, or pick a saved project from the
        dropdown. State lives in your browser's localStorage — nothing
        leaves this device.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RunHistoryPanel state={state} />
      <TestResultsLogEditor state={state} currentStrategy={currentStrategy} />
      <LearningMemoryReadout memory={state.learningMemory} />
    </div>
  );
}

// ---- Run history --------------------------------------------------------

function RunHistoryPanel({
  state,
}: {
  state: WorkspaceState & { refresh: () => void };
}) {
  const { runs, store } = state;
  const [comparison, setComparison] = useState<RunComparison | null>(null);

  const sorted = useMemo(
    () => runs.slice().sort((a, b) => (a.runAt < b.runAt ? 1 : -1)),
    [runs]
  );

  function compareWithLatest(run: SavedRun) {
    const latest = sorted[0];
    if (!latest || latest.id === run.id) {
      setComparison(buildRunComparison(run, null));
      return;
    }
    setComparison(buildRunComparison(latest, run));
  }

  function deleteRun(id: string) {
    if (!store) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this run snapshot?")
    ) {
      return;
    }
    store.deleteRun(id);
    state.refresh();
  }

  return (
    <section>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Run history
      </h3>
      {sorted.length === 0 ? (
        <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-400">
          No runs saved yet. Generate a strategy, then click "Save run" in
          the bar above to snapshot the current input + strategy.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((run) => (
            <li
              key={run.id}
              className="hairline flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink-900 p-3 text-xs"
            >
              <div className="flex flex-col">
                <span className="text-ink-100">{run.runAt}</span>
                <span className="text-ink-400">
                  {run.input.name || "—"} · top offer:{" "}
                  {run.strategy.offers[0]?.kind ?? "—"} · windows:{" "}
                  {run.strategy.campaignCalendar.windows.length}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => compareWithLatest(run)}
                  className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-ink-100 hover:border-accent"
                >
                  Compare with latest
                </button>
                <button
                  type="button"
                  onClick={() => deleteRun(run.id)}
                  className="rounded-sm border border-rose-500/30 bg-ink-800 px-2 py-1 text-rose-300 hover:border-rose-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {comparison && (
        <div className="hairline mt-4 rounded-lg bg-ink-900 p-4 text-xs text-ink-200">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="font-medium text-ink-100">Run comparison</p>
            <button
              type="button"
              onClick={() => setComparison(null)}
              className="text-ink-400 hover:text-ink-100"
            >
              close
            </button>
          </div>
          <p className="text-ink-400">
            current {comparison.current.runId} ({comparison.current.runAt}) vs{" "}
            {comparison.previous
              ? `${comparison.previous.runId} (${comparison.previous.runAt})`
              : "(none)"}
          </p>
          <ul className="mt-3 list-disc pl-5 text-ink-200">
            {comparison.changedFields.length === 0 ? (
              <li className="text-ink-400">No tracked fields changed.</li>
            ) : (
              comparison.changedFields.map((p) => <li key={p}>{p}</li>)
            )}
          </ul>
          {comparison.noteworthy.length > 0 && (
            <div className="mt-3 text-ink-300">
              {comparison.noteworthy.map((n, i) => (
                <p key={i}>· {n}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---- Test results log editor -------------------------------------------

function TestResultsLogEditor({
  state,
  currentStrategy,
}: {
  state: WorkspaceState & { refresh: () => void };
  currentStrategy: Strategy;
}) {
  const { runs, results, store, activeProjectId } = state;

  // Latest run (most recent runAt). If absent, fall back to a synthetic
  // "current" run keyed off the in-memory strategy so the operator can
  // pre-log expectations against the current matrix.
  const latestRun = useMemo<SavedRun | null>(() => {
    if (runs.length === 0) return null;
    return runs.slice().sort((a, b) => (a.runAt < b.runAt ? 1 : -1))[0];
  }, [runs]);

  const cells: TestCell[] =
    latestRun?.strategy.creativeTestingMatrix.testCells ??
    currentStrategy.creativeTestingMatrix.testCells;

  function findResultFor(cellId: string): TestResult | undefined {
    if (!latestRun) return undefined;
    return results.find(
      (r) => r.testCellId === cellId && r.runId === latestRun.id
    );
  }

  function upsert(cell: TestCell, patch: Partial<TestResult>) {
    if (!store || !activeProjectId || !latestRun) return;
    const existing = findResultFor(cell.id);
    const now = new Date().toISOString();
    const base: TestResult = existing ?? {
      id: newId("result"),
      projectId: activeProjectId,
      runId: latestRun.id,
      testCellId: cell.id,
      status: "not-yet-launched",
      metrics: [],
      spend: 0,
      daysRun: 0,
      createdAt: now,
      updatedAt: now,
    };
    store.upsertResult({ ...base, ...patch, updatedAt: now });
    state.refresh();
  }

  return (
    <section>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Test results log
      </h3>
      {!latestRun ? (
        <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-400">
          Save a run first. The log binds each row to a saved
          (input → strategy) snapshot so the learning memory has stable
          references back to test cells.
        </p>
      ) : (
        <div className="hairline rounded-lg bg-ink-900 p-3">
          <p className="mb-2 text-xxs text-ink-400">
            Logging against run <code>{latestRun.id}</code> ({latestRun.runAt}).{" "}
            {cells.length} test cell{cells.length === 1 ? "" : "s"}.
          </p>
          <table className="w-full text-xs">
            <thead className="text-ink-400">
              <tr>
                <th className="text-left">Cell</th>
                <th className="text-left">Status</th>
                <th className="text-left">Spend</th>
                <th className="text-left">Days</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((cell) => {
                const existing = findResultFor(cell.id);
                return (
                  <tr key={cell.id} className="border-t border-ink-800">
                    <td className="py-2 pr-3 text-ink-200">
                      <span className="block font-medium text-ink-100">
                        {cell.id}
                      </span>
                      <span className="block text-xxs text-ink-400">
                        {cell.format} · {cell.audienceTier} · offer: {cell.offer}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-ink-100"
                        value={existing?.status ?? "not-yet-launched"}
                        onChange={(e) =>
                          upsert(cell, {
                            status: e.target.value as TestResultStatus,
                          })
                        }
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        className="w-20 rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-ink-100"
                        value={existing?.spend ?? 0}
                        onChange={(e) =>
                          upsert(cell, {
                            spend: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        className="w-16 rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-ink-100"
                        value={existing?.daysRun ?? 0}
                        onChange={(e) =>
                          upsert(cell, {
                            daysRun: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---- Learning memory readout -------------------------------------------

function LearningMemoryReadout({ memory }: { memory: LearningMemory }) {
  if (memory.learnings.length === 0) {
    return (
      <section>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
          Learning memory
        </h3>
        <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-400">
          No learnings derived yet. Log at least one winning or losing
          test result and this surface fills in automatically. The
          memory feeds into the Next Iteration Planner on the next run.
        </p>
      </section>
    );
  }

  const grouped = new Map<string, Learning[]>();
  for (const l of memory.learnings) {
    const arr = grouped.get(l.signal) ?? [];
    arr.push(l);
    grouped.set(l.signal, arr);
  }

  return (
    <section>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Learning memory
      </h3>
      <p className="mb-3 text-xxs text-ink-400">
        Derived from {memory.fromResultCount} logged result
        {memory.fromResultCount === 1 ? "" : "s"} at {memory.derivedAt}.
      </p>
      <div className="flex flex-col gap-3">
        {Array.from(grouped.entries()).map(([signal, ls]) => (
          <div
            key={signal}
            className="hairline rounded-lg bg-ink-900 p-3 text-xs"
          >
            <p className="text-ink-300">
              <span className="font-medium text-ink-100">{signal}</span>
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {ls.map((l) => (
                <li
                  key={`${l.signal}-${l.subject}`}
                  className="flex flex-wrap items-baseline gap-2 text-ink-200"
                >
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 text-xxs ${
                      l.confidence === "high"
                        ? "border-emerald-500/40 text-emerald-300"
                        : l.confidence === "medium"
                        ? "border-amber-500/40 text-amber-300"
                        : "border-ink-600 text-ink-300"
                    }`}
                  >
                    {l.confidence}
                  </span>
                  <span className="font-medium text-ink-100">{l.subject}</span>
                  <span className="text-ink-400">{l.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
