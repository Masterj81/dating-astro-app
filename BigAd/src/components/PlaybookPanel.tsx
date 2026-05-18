"use client";

// PlaybookPanel.tsx — Playbook Library UI for BigAd.
//
// Mirrors AgencyPanel: a `usePlaybookSelection()` hook binds to the
// browser store and exposes the applied playbook id plus an `apply`
// setter. `PlaybookTab` is the main tab body and renders eight sections
// (recommended playbook, top alternatives, execution checklist, required
// proof, launch gates, default test plan, reporting focus, risk notes).
//
// Render must stay deterministic for SSR. The store is lazy-instantiated
// post-mount. Applying a playbook NEVER mutates ProductInput — it only
// updates the local applied-playbook record and feeds context to the
// markdown export.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductInput, Strategy } from "@/types/strategy";
import type {
  Playbook,
  PlaybookChecklistItem,
  PlaybookFitScore,
  PlaybookId,
  PlaybookRecommendation,
} from "@/types/playbook";
import type { AgencySelection } from "@/types/agency";
import {
  createBrowserPlaybookStore,
  type PlaybookStore,
} from "@/lib/playbook/playbook-store";
import { PLAYBOOKS, listPlaybooks } from "@/lib/playbook/catalog";
import { recommendPlaybooks } from "@/lib/playbook/recommend";

// ---- Derived helpers --------------------------------------------------

// Derive a PlaybookChecklistItem[] from a playbook's executionSteps,
// proofRequirements, launchGates, and reviewRequirements. Used by the
// Execution checklist section AND by the markdown export.
export function deriveChecklist(playbook: Playbook): PlaybookChecklistItem[] {
  const out: PlaybookChecklistItem[] = [];

  // Required-input items.
  for (const field of playbook.requiredInputs) {
    out.push({
      id: `inputs-${field}`,
      label: `Confirm ProductInput.${field} is filled with concrete content`,
      category: "inputs",
      required: true,
    });
  }

  // Proof items.
  let pi = 1;
  for (const proof of playbook.proofRequirements) {
    out.push({
      id: `proof-${pi}`,
      label: `Capture: ${proof}`,
      category: "proof",
      required: pi <= 3,
    });
    pi += 1;
  }

  // Creative items — pull from executionSteps tagged with the
  // creative-adjacent modules.
  let ci = 1;
  for (const step of playbook.executionSteps) {
    const mod = step.module;
    if (mod === "hooks" || mod === "scripts" || mod === "concepts" || mod === "static-briefs") {
      out.push({
        id: `creative-${ci}`,
        label: `${step.title} (${step.module})`,
        category: "creative",
        required: true,
      });
      ci += 1;
    }
  }

  // Tracking items — pull from launchGates that mention tracking.
  let ti = 1;
  for (const gate of playbook.launchGates) {
    if (gate.toLowerCase().includes("tracking")) {
      out.push({
        id: `tracking-${ti}`,
        label: gate,
        category: "tracking",
        required: true,
      });
      ti += 1;
    }
  }

  // Review items.
  let ri = 1;
  for (const kind of playbook.reviewRequirements) {
    out.push({
      id: `review-${kind}-${ri}`,
      label: `Review approval: ${kind}`,
      category: "review",
      required: true,
    });
    ri += 1;
  }

  // Launch items — remaining gates not yet covered.
  let li = 1;
  for (const gate of playbook.launchGates) {
    if (gate.toLowerCase().includes("tracking")) continue;
    out.push({
      id: `launch-${li}`,
      label: gate,
      category: "launch",
      required: true,
    });
    li += 1;
  }

  return out;
}

// ---- Hook: live store binding -----------------------------------------

export interface PlaybookSelectionState {
  store: PlaybookStore | null;
  projectId: string | null;
  applied: PlaybookId | undefined;
  apply(id: PlaybookId | undefined): void;
  clear(): void;
  refresh(): void;
}

export function usePlaybookSelection(args: {
  projectId: string | null;
}): PlaybookSelectionState {
  const { projectId } = args;
  const [store, setStore] = useState<PlaybookStore | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setStore(createBrowserPlaybookStore());
  }, []);

  const applied = useMemo<PlaybookId | undefined>(() => {
    if (!store || !projectId) return undefined;
    return store.getApplied(projectId);
    // tick is a refresh dependency
  }, [store, projectId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    store,
    projectId,
    applied,
    apply(id) {
      if (!store || !projectId) return;
      if (!id) {
        store.clear(projectId);
      } else {
        store.setApplied(projectId, id);
      }
      refresh();
    },
    clear() {
      if (!store || !projectId) return;
      store.clear(projectId);
      refresh();
    },
    refresh,
  };
}

// ---- Utility components -----------------------------------------------

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-200">
      {children}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-sm border border-accent/40 px-2 py-0.5 text-xxs text-accent">
      {children}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? "border-emerald-500/40 text-emerald-300"
      : score >= 40
      ? "border-amber-500/40 text-amber-300"
      : "border-rose-500/40 text-rose-300";
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xxs ${tone}`}>
      {score} / 100
    </span>
  );
}

// ---- PlaybookTab ------------------------------------------------------

export interface PlaybookTabProps {
  state: PlaybookSelectionState;
  input: ProductInput;
  strategy: Strategy | null;
  agencySelection?: AgencySelection;
}

export function PlaybookTab({
  state,
  input,
  strategy,
  agencySelection,
}: PlaybookTabProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Playbook library is loading…
      </p>
    );
  }

  if (!strategy) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Generate a strategy first to get playbook recommendations.
      </p>
    );
  }

  const hasMeaningfulInput = Boolean(
    (input.name || "").trim() ||
      (input.audience || "").trim() ||
      (input.differentiator || "").trim()
  );
  if (!hasMeaningfulInput) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Generate a strategy first to get playbook recommendations.
      </p>
    );
  }

  const recommendation: PlaybookRecommendation = recommendPlaybooks(
    input,
    strategy,
    agencySelection
  );

  const topPlaybook = recommendation.topPlaybook;
  const appliedId = state.applied;
  const appliedPlaybook = appliedId ? PLAYBOOKS[appliedId] : undefined;

  // The "active" playbook = applied if any, else recommended.
  const active = appliedPlaybook ?? topPlaybook;

  return (
    <div className="flex flex-col gap-6">
      {!active ? (
        <p className="hairline rounded-lg bg-ink-900 p-3 text-xxs text-ink-400">
          No playbook is a clear match for the current input. Tighten the
          audience, differentiator, or campaign type to surface a fit.
        </p>
      ) : (
        <>
          <RecommendedSection
            playbook={active}
            topScore={recommendation.topScore}
            whyItFits={recommendation.whyItFits}
            whyItMayNotFit={recommendation.whyItMayNotFit}
            isApplied={!!appliedPlaybook && appliedPlaybook.id === active.id}
            onApply={() => state.apply(active.id)}
            onClear={() => state.clear()}
          />
          <NextActionsSection playbook={active} />
        </>
      )}
      <AlternativesSection
        ranked={recommendation.ranked}
        appliedId={appliedId}
        onApply={(id) => state.apply(id)}
      />
      {active ? (
        <>
          <RecommendedModulesSection playbook={active} />
          <ChecklistSection playbook={active} />
          <ProofSection playbook={active} strategy={strategy} />
          <LaunchGatesSection playbook={active} strategy={strategy} />
          <TestPlanSection playbook={active} />
          <ReportingFocusSection playbook={active} />
          <RiskNotesSection playbook={active} />
        </>
      ) : null}
    </div>
  );
}

// ---- Recommended playbook --------------------------------------------

function RecommendedSection({
  playbook,
  topScore,
  whyItFits,
  whyItMayNotFit,
  isApplied,
  onApply,
  onClear,
}: {
  playbook: Playbook;
  topScore: PlaybookFitScore | undefined;
  whyItFits: string[];
  whyItMayNotFit: string[];
  isApplied: boolean;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Recommended playbook
          </p>
          {isApplied ? <Pill>Applied</Pill> : null}
        </div>
        {topScore ? <ScoreBadge score={topScore.score} /> : null}
      </div>

      <h3 className="mt-3 text-sm font-semibold text-ink-50">{playbook.name}</h3>
      <div className="mt-2 flex flex-wrap gap-1">
        <Chip>{playbook.category}</Chip>
        {playbook.businessModels.map((b) => (
          <Chip key={b}>{b}</Chip>
        ))}
        {playbook.channels.map((c) => (
          <Chip key={c}>{c}</Chip>
        ))}
      </div>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Best for</p>
      <ul className="mt-1 list-disc pl-5 text-xs text-ink-200">
        {playbook.bestFor.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      {whyItFits.length > 0 ? (
        <>
          <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Why it fits</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-ink-200">
            {whyItFits.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      ) : null}

      {whyItMayNotFit.length > 0 ? (
        <>
          <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Why it may not fit</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-ink-300">
            {whyItMayNotFit.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          className={`rounded-sm border px-3 py-1.5 text-xs transition ${
            isApplied
              ? "border-accent text-accent"
              : "border-ink-700 bg-ink-800 text-ink-100 hover:border-accent hover:text-white"
          }`}
        >
          {isApplied ? "Applied" : "Apply playbook"}
        </button>
        {isApplied ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-sm border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-300 hover:border-ink-500"
          >
            Clear
          </button>
        ) : null}
      </div>
    </section>
  );
}

// ---- Suggested next actions ------------------------------------------

function NextActionsSection({ playbook }: { playbook: Playbook }) {
  const next = playbook.executionSteps.slice(0, 3);
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Suggested next actions
      </p>
      <ol className="list-decimal pl-5 text-xs text-ink-200">
        {next.map((s) => (
          <li key={s.order} className="mt-1">
            <span className="font-medium text-ink-100">{s.title}</span>{" "}
            <span className="text-ink-300">— {s.description}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- Top alternatives -------------------------------------------------

function AlternativesSection({
  ranked,
  appliedId,
  onApply,
}: {
  ranked: PlaybookFitScore[];
  appliedId: PlaybookId | undefined;
  onApply: (id: PlaybookId) => void;
}) {
  const alternates = ranked.slice(1, 5);
  if (alternates.length === 0) return null;
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Top alternatives
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {alternates.map((s) => {
          const p = PLAYBOOKS[s.playbookId];
          const active = appliedId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onApply(p.id)}
              className={`rounded-sm border p-3 text-left transition ${
                active
                  ? "border-accent bg-ink-950"
                  : "border-ink-700 bg-ink-800 hover:border-ink-500"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-100">{p.name}</p>
                <ScoreBadge score={s.score} />
              </div>
              <p className="mt-1 text-xxs text-ink-400">{p.category}</p>
              {s.reasons.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-xxs text-ink-300">
                  {s.reasons.slice(0, 2).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---- Recommended modules ---------------------------------------------

function RecommendedModulesSection({ playbook }: { playbook: Playbook }) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Recommended modules (in order)
      </p>
      <ol className="flex flex-wrap gap-1">
        {playbook.recommendedModules.map((m, i) => (
          <li key={m} className="flex items-center gap-1">
            <span className="rounded-sm border border-accent/40 px-2 py-0.5 text-xxs text-accent">
              {i + 1}. {m}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- Execution checklist ---------------------------------------------

function ChecklistSection({ playbook }: { playbook: Playbook }) {
  const items = useMemo(() => deriveChecklist(playbook), [playbook]);
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Execution checklist
      </p>
      <ul className="space-y-1.5 text-xs text-ink-200">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-2">
            <span className="mt-0.5 inline-block h-3 w-3 rounded-sm border border-ink-600" />
            <span>
              <span className="text-xxs uppercase tracking-wide text-ink-400">
                {it.category}
              </span>{" "}
              — {it.label}
              {it.required ? (
                <span className="ml-1 text-xxs text-amber-300">(required)</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Required proof --------------------------------------------------

function ProofSection({
  playbook,
  strategy,
}: {
  playbook: Playbook;
  strategy: Strategy;
}) {
  const captured = new Set<string>();
  for (const a of strategy.proofAssetPlan?.priorityAssets ?? []) {
    captured.add(a.title.toLowerCase());
  }
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Required proof
      </p>
      <ul className="space-y-1 text-xs text-ink-200">
        {playbook.proofRequirements.map((req) => {
          const match = Array.from(captured).some((c) =>
            c.includes(req.toLowerCase().slice(0, 12))
          );
          return (
            <li key={req} className="flex items-start gap-2">
              <span
                className={`mt-0.5 inline-block h-3 w-3 rounded-sm border ${
                  match
                    ? "border-emerald-500 bg-emerald-500/40"
                    : "border-ink-600"
                }`}
              />
              <span>{req}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- Launch gates ----------------------------------------------------

function LaunchGatesSection({
  playbook,
  strategy,
}: {
  playbook: Playbook;
  strategy: Strategy;
}) {
  const trackingScore = strategy.trackingReadiness?.score ?? 0;
  const proofScore = strategy.proofAssetPlan?.proofReadinessScore ?? 0;
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Launch gates
      </p>
      <ul className="space-y-1 text-xs text-ink-200">
        {playbook.launchGates.map((g) => {
          const lower = g.toLowerCase();
          let passed: boolean | null = null;
          if (lower.includes("trackingreadiness.score >= 70")) {
            passed = trackingScore >= 70;
          } else if (lower.includes("proofreadiness") || lower.includes("proofassetplan.proofreadinessscore")) {
            passed = proofScore >= 50;
          }
          return (
            <li key={g} className="flex items-start gap-2">
              <span
                className={`mt-0.5 inline-block h-3 w-3 rounded-sm border ${
                  passed === true
                    ? "border-emerald-500 bg-emerald-500/40"
                    : passed === false
                    ? "border-rose-500 bg-rose-500/30"
                    : "border-ink-600"
                }`}
              />
              <span>
                {g}
                {passed === true ? (
                  <span className="ml-1 text-xxs text-emerald-400">(pass)</span>
                ) : passed === false ? (
                  <span className="ml-1 text-xxs text-rose-400">(fail)</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- Default test plan -----------------------------------------------

function TestPlanSection({ playbook }: { playbook: Playbook }) {
  const tp = playbook.defaultTestPlan;
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Default test plan
      </p>
      <div className="flex flex-wrap gap-2">
        <Pill>
          {tp.cellCount.min}–{tp.cellCount.max} cells
        </Pill>
        <Pill>{tp.oneVariableAtATime ? "One variable at a time" : "Multi-variable"}</Pill>
      </div>
      <p className="mt-2 text-xxs uppercase tracking-wide text-ink-400">Formats</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {tp.formats.map((f) => (
          <Chip key={f}>{f}</Chip>
        ))}
      </div>
      <p className="mt-3 text-xxs text-ink-300">
        <span className="font-medium text-ink-100">Budget:</span> {tp.budgetGuidance}
      </p>
      <p className="mt-1 text-xxs text-ink-300">
        <span className="font-medium text-ink-100">Kill rule:</span> {tp.killRuleHint}
      </p>
      <p className="mt-1 text-xxs text-ink-300">
        <span className="font-medium text-ink-100">Scale rule:</span> {tp.scaleRuleHint}
      </p>
    </section>
  );
}

// ---- Reporting focus -------------------------------------------------

function ReportingFocusSection({ playbook }: { playbook: Playbook }) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Reporting focus
      </p>
      <div className="flex flex-wrap gap-1">
        {playbook.reportingFocus.map((k) => (
          <Chip key={k}>{k}</Chip>
        ))}
      </div>
    </section>
  );
}

// ---- Risk notes ------------------------------------------------------

function RiskNotesSection({ playbook }: { playbook: Playbook }) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Risk notes
      </p>
      <ul className="list-disc pl-5 text-xs text-ink-200">
        {playbook.riskNotes.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </section>
  );
}

// ---- (unused but exported for completeness) --------------------------

export { listPlaybooks };
