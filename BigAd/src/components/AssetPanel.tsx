"use client";

// AssetPanel.tsx — Asset Production Manager UI for CampaignOS.
//
// Mirrors AgencyPanel / PlaybookPanel: a `useAssetProduction()` hook
// binds to the browser store and exposes the merged production plan
// plus setters. `AssetTab` is the main tab body and renders six sections
// (production queue, missing blockers, by owner, by status, quality
// checklist, where used).
//
// Render must stay deterministic for SSR — the planner never calls
// `Date.now()`. The store does, but only on user-triggered mutations.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductInput, Strategy } from "@/types/strategy";
import type { Playbook } from "@/types/playbook";
import type { ReviewBoardSummary } from "@/types/review";
import type {
  AssetOwnerRole,
  AssetProductionPlan,
  AssetProductionSummary,
  AssetQualityCheckKind,
  AssetStatus,
  ProductionAsset,
} from "@/types/assets";
import {
  buildAssetProductionPlan,
  summarizeAssetProductionPlan,
} from "@/lib/assets/asset-production";
import {
  createBrowserAssetStore,
  type AssetStore,
} from "@/lib/assets/asset-store";

// ---- Hook: live store binding -----------------------------------------

export interface AssetProductionState {
  store: AssetStore | null;
  runId: string | null;
  plan: AssetProductionPlan | null;
  summary: AssetProductionSummary | null;
  setStatus(id: string, status: AssetStatus): void;
  setOwner(id: string, ownerRole: AssetOwnerRole): void;
  setFileLink(id: string, link: string): void;
  setQualityCheck(
    id: string,
    kind: AssetQualityCheckKind,
    done: boolean
  ): void;
  clear(): void;
  refresh(): void;
}

export interface UseAssetProductionArgs {
  runId: string | null;
  strategy: Strategy | null;
  selectedPlaybook?: Playbook;
  reviewSummary?: ReviewBoardSummary;
}

export function useAssetProduction(
  args: UseAssetProductionArgs
): AssetProductionState {
  const { runId, strategy, selectedPlaybook, reviewSummary } = args;
  const [store, setStore] = useState<AssetStore | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setStore(createBrowserAssetStore());
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const plan = useMemo<AssetProductionPlan | null>(() => {
    if (!store || !runId || !strategy) return null;
    const existing = store.listAssets(runId);
    return buildAssetProductionPlan({
      runId,
      strategy,
      proofAssetPlan: strategy.proofAssetPlan,
      creativeTestingMatrix: strategy.creativeTestingMatrix,
      selectedPlaybook,
      reviewSummary,
      existingAssetState: existing,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, runId, strategy, selectedPlaybook, reviewSummary, tick]);

  const summary = useMemo<AssetProductionSummary | null>(() => {
    if (!plan) return null;
    return summarizeAssetProductionPlan(plan);
  }, [plan]);

  return {
    store,
    runId,
    plan,
    summary,
    setStatus(id, status) {
      if (!store) return;
      store.setStatus(id, status);
      refresh();
    },
    setOwner(id, ownerRole) {
      if (!store) return;
      store.setOwner(id, ownerRole);
      refresh();
    },
    setFileLink(id, link) {
      if (!store) return;
      store.setFileLink(id, link);
      refresh();
    },
    setQualityCheck(id, kind, done) {
      if (!store) return;
      store.setQualityCheck(id, kind, done);
      refresh();
    },
    clear() {
      if (!store || !runId) return;
      store.clearForRun(runId);
      refresh();
    },
    refresh,
  };
}

// ---- Utility chips ----------------------------------------------------

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-200">
      {children}
    </span>
  );
}

function PriorityPill({ priority }: { priority: ProductionAsset["priority"] }) {
  const tone =
    priority === "must-have"
      ? "border-rose-500/40 text-rose-300"
      : priority === "should-have"
      ? "border-amber-500/40 text-amber-300"
      : "border-ink-600 text-ink-300";
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xxs ${tone}`}>
      {priority}
    </span>
  );
}

function StatusPill({ status }: { status: AssetStatus }) {
  const tone =
    status === "shipped"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "approved"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "rejected"
      ? "border-rose-500/40 text-rose-300"
      : status === "in-review"
      ? "border-amber-500/40 text-amber-300"
      : "border-ink-600 text-ink-300";
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xxs ${tone}`}>
      {status}
    </span>
  );
}

// ---- AssetTab ---------------------------------------------------------

const STATUS_ORDER: AssetStatus[] = [
  "requested",
  "scripted",
  "in-production",
  "in-review",
  "approved",
  "shipped",
  "rejected",
];

const OWNER_ORDER: AssetOwnerRole[] = [
  "owner",
  "client",
  "media-buyer",
  "creator",
  "editor",
  "designer",
  "copywriter",
  "producer",
];

export interface AssetTabProps {
  state: AssetProductionState;
  input: ProductInput;
  strategy: Strategy | null;
}

export function AssetTab({ state, input, strategy }: AssetTabProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Asset production manager is loading…
      </p>
    );
  }

  const hasMeaningfulInput = Boolean(
    (input.name || "").trim() ||
      (input.audience || "").trim() ||
      (input.differentiator || "").trim()
  );
  if (!strategy || !hasMeaningfulInput) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Generate a strategy first to build the production plan.
      </p>
    );
  }

  if (!state.plan || !state.summary) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Save a run first to begin tracking asset production.
      </p>
    );
  }

  const { plan, summary } = state;

  return (
    <div className="flex flex-col gap-6">
      <SummaryHeader summary={summary} plan={plan} />
      <MissingBlockersSection plan={plan} />
      <ProductionQueueSection
        plan={plan}
        onSetStatus={state.setStatus}
        onSetOwner={state.setOwner}
        onSetFileLink={state.setFileLink}
        onToggleCheck={state.setQualityCheck}
      />
      <ByOwnerSection plan={plan} />
      <ByStatusSection plan={plan} />
      <QualityChecklistSection plan={plan} onToggleCheck={state.setQualityCheck} />
      <WhereUsedSection plan={plan} />
    </div>
  );
}

// ---- Summary header ---------------------------------------------------

function SummaryHeader({
  summary,
  plan,
}: {
  summary: AssetProductionSummary;
  plan: AssetProductionPlan;
}) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Asset readiness
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink-50">
            {summary.readinessScore} <span className="text-sm text-ink-400">/ 100</span>
          </p>
        </div>
        <div className="text-right text-xxs text-ink-300">
          <p>Total assets: {plan.assets.length}</p>
          <p>
            Must-have: {summary.mustHaveReady} / {summary.mustHaveTotal} ready
          </p>
          <p>Shipped: {summary.shippedCount}</p>
        </div>
      </div>
    </section>
  );
}

// ---- Missing blockers --------------------------------------------------

function MissingBlockersSection({ plan }: { plan: AssetProductionPlan }) {
  if (plan.missingBlockers.length === 0) return null;
  return (
    <section className="hairline rounded-lg border-rose-500/40 bg-rose-950/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-rose-300">
        Missing blockers ({plan.missingBlockers.length})
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-200">
        {plan.missingBlockers.map((b, i) => (
          <li key={`${b.assetId}-${i}`}>
            <span className="font-medium">{b.assetId}</span> — {b.reason}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Production queue --------------------------------------------------

function ProductionQueueSection({
  plan,
  onSetStatus,
  onSetOwner,
  onSetFileLink,
  onToggleCheck,
}: {
  plan: AssetProductionPlan;
  onSetStatus: (id: string, status: AssetStatus) => void;
  onSetOwner: (id: string, ownerRole: AssetOwnerRole) => void;
  onSetFileLink: (id: string, link: string) => void;
  onToggleCheck: (
    id: string,
    kind: AssetQualityCheckKind,
    done: boolean
  ) => void;
}) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Production queue
      </p>
      <div className="flex flex-col gap-3">
        {plan.assets.map((a) => (
          <AssetCard
            key={a.id}
            asset={a}
            onSetStatus={(s) => onSetStatus(a.id, s)}
            onSetOwner={(o) => onSetOwner(a.id, o)}
            onSetFileLink={(l) => onSetFileLink(a.id, l)}
            onToggleCheck={(k, d) => onToggleCheck(a.id, k, d)}
          />
        ))}
      </div>
    </section>
  );
}

function AssetCard({
  asset,
  onSetStatus,
  onSetOwner,
  onSetFileLink,
  onToggleCheck,
}: {
  asset: ProductionAsset;
  onSetStatus: (s: AssetStatus) => void;
  onSetOwner: (o: AssetOwnerRole) => void;
  onSetFileLink: (l: string) => void;
  onToggleCheck: (k: AssetQualityCheckKind, d: boolean) => void;
}) {
  const doneCount = asset.qualityChecks.filter((c) => c.done).length;
  const totalCount = asset.qualityChecks.length;
  const nextStatusIdx =
    (STATUS_ORDER.indexOf(asset.status) + 1) % STATUS_ORDER.length;
  const nextStatus = STATUS_ORDER[nextStatusIdx];

  return (
    <div className="hairline rounded-sm bg-ink-950 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink-100">{asset.title}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip>{asset.format}</Chip>
            <PriorityPill priority={asset.priority} />
            <StatusPill status={asset.status} />
            <Chip>{asset.ownerRole}</Chip>
          </div>
        </div>
        <div className="text-right text-xxs text-ink-400">
          <p>
            Due day {asset.dueWindow.startOffsetDays}–
            {asset.dueWindow.endOffsetDays}
          </p>
          <p>
            Quality: {doneCount} / {totalCount} checks done
          </p>
        </div>
      </div>

      <p className="mt-2 text-xxs text-ink-400">
        Risk if missing: {asset.riskIfMissing}
      </p>

      {asset.linkedTestCellIds.length > 0 ? (
        <p className="mt-2 text-xxs text-ink-300">
          Linked cells:{" "}
          {asset.linkedTestCellIds.map((id) => (
            <code key={id} className="ml-1 rounded-sm bg-ink-800 px-1 py-0.5 text-ink-200">
              {id}
            </code>
          ))}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSetStatus(nextStatus)}
          className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-100 hover:border-accent hover:text-white"
        >
          Advance → {nextStatus}
        </button>
        <select
          value={asset.ownerRole}
          onChange={(e) => onSetOwner(e.target.value as AssetOwnerRole)}
          className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-100"
        >
          {OWNER_ORDER.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="File link…"
          defaultValue={asset.fileLink ?? ""}
          onBlur={(e) => onSetFileLink(e.target.value)}
          className="flex-1 rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-100"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {asset.qualityChecks.map((c) => (
          <button
            key={c.kind}
            type="button"
            onClick={() => onToggleCheck(c.kind, !c.done)}
            className={`rounded-sm border px-2 py-0.5 text-xxs ${
              c.done
                ? "border-emerald-500/40 text-emerald-300"
                : c.required
                ? "border-amber-500/40 text-amber-300"
                : "border-ink-700 text-ink-300"
            }`}
            title={c.required ? "Required" : "Optional"}
          >
            {c.done ? "✓" : "○"} {c.kind}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- By owner ---------------------------------------------------------

function ByOwnerSection({ plan }: { plan: AssetProductionPlan }) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Assets by owner
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {OWNER_ORDER.map((o) => {
          const count = plan.byOwner[o] ?? 0;
          const owned = plan.assets.filter((a) => a.ownerRole === o);
          const ready = owned.filter(
            (a) =>
              a.status === "approved" ||
              (a.status === "shipped" &&
                a.qualityChecks.filter((c) => c.required).every((c) => c.done))
          ).length;
          if (count === 0) return null;
          return (
            <div key={o} className="hairline rounded-sm bg-ink-950 p-2">
              <p className="text-xs font-medium text-ink-100">{o}</p>
              <p className="mt-1 text-xxs text-ink-300">
                {count} asset{count === 1 ? "" : "s"} ({ready} ready)
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- By status (kanban) -----------------------------------------------

function ByStatusSection({ plan }: { plan: AssetProductionPlan }) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Assets by status
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {STATUS_ORDER.map((s) => {
          const items = plan.assets.filter((a) => a.status === s);
          return (
            <div key={s} className="hairline min-h-[80px] rounded-sm bg-ink-950 p-2">
              <p className="mb-1 text-xxs font-medium uppercase text-ink-300">
                {s} ({items.length})
              </p>
              <ul className="space-y-1 text-xxs text-ink-200">
                {items.map((a) => (
                  <li key={a.id} className="truncate">
                    {a.title}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- Quality checklist -------------------------------------------------

function QualityChecklistSection({
  plan,
  onToggleCheck,
}: {
  plan: AssetProductionPlan;
  onToggleCheck: (
    id: string,
    kind: AssetQualityCheckKind,
    done: boolean
  ) => void;
}) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Quality checklist
      </p>
      <details className="text-xxs text-ink-300">
        <summary className="cursor-pointer text-ink-200">
          Expand per-asset checks
        </summary>
        <ul className="mt-2 space-y-2">
          {plan.assets.map((a) => (
            <li key={a.id} className="hairline rounded-sm bg-ink-950 p-2">
              <p className="text-xs font-medium text-ink-100">{a.title}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {a.qualityChecks.map((c) => (
                  <button
                    key={c.kind}
                    type="button"
                    onClick={() => onToggleCheck(a.id, c.kind, !c.done)}
                    className={`rounded-sm border px-2 py-0.5 text-xxs ${
                      c.done
                        ? "border-emerald-500/40 text-emerald-300"
                        : c.required
                        ? "border-amber-500/40 text-amber-300"
                        : "border-ink-700 text-ink-300"
                    }`}
                  >
                    {c.done ? "✓" : "○"} {c.kind}
                    {c.required ? " *" : ""}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// ---- Where used --------------------------------------------------------

function WhereUsedSection({ plan }: { plan: AssetProductionPlan }) {
  const contexts: Array<["test-cell" | "campaign-ad" | "landing-page" | "report" | "proof-block", string]> = [
    ["test-cell", "Test cells"],
    ["campaign-ad", "Campaign ads"],
    ["landing-page", "Landing page"],
    ["report", "Report"],
    ["proof-block", "Proof block"],
  ];

  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Where used
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {contexts.map(([ctx, label]) => {
          const linked = plan.assets.filter((a) =>
            a.whereUsed.some((w) => w.context === ctx)
          );
          return (
            <div key={ctx} className="hairline rounded-sm bg-ink-950 p-2">
              <p className="text-xs font-medium text-ink-100">{label}</p>
              <ul className="mt-1 list-disc pl-5 text-xxs text-ink-300">
                {linked.length === 0 ? (
                  <li>(none)</li>
                ) : (
                  linked.slice(0, 8).map((a) => (
                    <li key={a.id} className="truncate">
                      {a.title}
                    </li>
                  ))
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
