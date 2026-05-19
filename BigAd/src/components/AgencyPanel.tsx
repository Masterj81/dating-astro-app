"use client";

// AgencyPanel.tsx — Agency Packaging Layer UI for BigAd.
//
// Mirrors WorkspacePanel and ReviewPanel: a `useAgencySelection()` hook
// binds to the browser store and exposes the current selection plus
// setters. `AgencyTab` is the main tab body and renders four sections
// (template, role, package, delivery summary) plus two flat lists
// (client responsibilities, acceptance criteria).
//
// Render must stay deterministic for SSR — we never call `Date.now()`
// inside render. Timestamps shown come from stored fields. A small
// `useEffect` lazy-instantiates the browser store after mount.

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgencyRoleId,
  AgencySelection,
  DeliverySummary,
  PackagePresetId,
  ProjectTemplateId,
} from "@/types/agency";
import type { Strategy } from "@/types/strategy";
import type { LearningMemory } from "@/types/workspace";
import type {
  ReviewBoardSummary,
  ReviewComment,
  ReviewItem,
} from "@/types/review";
import {
  createBrowserAgencyStore,
  type AgencyStore,
} from "@/lib/agency/agency-store";
import {
  PROJECT_TEMPLATES,
  ROLE_PRESETS,
  PACKAGE_PRESETS,
  listPackages,
  listRoles,
  listTemplates,
} from "@/lib/agency/catalog";
import {
  buildDeliverySummary,
  type DeliverySummaryInput,
} from "@/lib/agency/delivery-summary";
import { reviewItemKindLabel } from "@/lib/review/review-board";

// ---- Hook: live store binding -------------------------------------------

export interface AgencySelectionState {
  store: AgencyStore | null;
  projectId: string | null;
  selection: AgencySelection | undefined;
  setTemplate(id: ProjectTemplateId | undefined): void;
  setRole(id: AgencyRoleId | undefined): void;
  setPackage(id: PackagePresetId | undefined): void;
  clear(): void;
  refresh(): void;
}

export function useAgencySelection(args: {
  projectId: string | null;
}): AgencySelectionState {
  const { projectId } = args;
  const [store, setStore] = useState<AgencyStore | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setStore(createBrowserAgencyStore());
  }, []);

  const selection = useMemo<AgencySelection | undefined>(() => {
    if (!store || !projectId) return undefined;
    return store.getSelection(projectId);
  }, [store, projectId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const writePatch = useCallback(
    (patch: Partial<AgencySelection>) => {
      if (!store || !projectId) return;
      const current = store.getSelection(projectId);
      const next: AgencySelection = {
        projectId,
        templateId: current?.templateId,
        roleId: current?.roleId,
        packageId: current?.packageId,
        ...patch,
        updatedAt: Date.now(),
      };
      store.setSelection(next);
      refresh();
    },
    [store, projectId, refresh]
  );

  return {
    store,
    projectId,
    selection,
    setTemplate(id) {
      writePatch({ templateId: id });
    },
    setRole(id) {
      writePatch({ roleId: id });
    },
    setPackage(id) {
      writePatch({ packageId: id });
    },
    clear() {
      if (!store || !projectId) return;
      store.clearSelection(projectId);
      refresh();
    },
    refresh,
  };
}

// ---- Utilities ----------------------------------------------------------

function formatUsd(min: number, max: number): string {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `$${fmt(min)}–$${fmt(max)}`;
}

function formatDayRange(min: number, max: number): string {
  if (min === max) return `${min} day${min === 1 ? "" : "s"}`;
  return `${min}–${max} days`;
}

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

// ---- AgencyTab — main tab body ----------------------------------------

export interface AgencyTabProps {
  state: AgencySelectionState;
  strategy: Strategy | null;
  reviewBoard?: {
    items: ReviewItem[];
    comments: ReviewComment[];
    summary: ReviewBoardSummary;
  };
  learningMemory?: LearningMemory;
}

export function AgencyTab({
  state,
  strategy,
  reviewBoard,
  learningMemory,
}: AgencyTabProps) {
  // SSR safety: lazy `null` on first render, store wired post-mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Agency packaging is loading…
      </p>
    );
  }

  if (!state.projectId) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Select a project to begin agency packaging.
      </p>
    );
  }

  if (!strategy) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Save a run first so the agency layer can derive the delivery summary.
      </p>
    );
  }

  const template = state.selection?.templateId
    ? PROJECT_TEMPLATES[state.selection.templateId]
    : undefined;
  const role = state.selection?.roleId
    ? ROLE_PRESETS[state.selection.roleId]
    : undefined;
  const pkg = state.selection?.packageId
    ? PACKAGE_PRESETS[state.selection.packageId]
    : undefined;

  const summaryInput: DeliverySummaryInput = {
    strategy,
    template,
    role,
    pkg,
    reviewBoard,
    learningMemory,
  };
  const summary = buildDeliverySummary(summaryInput);

  // Empty-state hint when nothing is picked yet.
  const nothingPicked = !template && !role && !pkg;

  return (
    <div className="flex flex-col gap-6">
      {nothingPicked ? (
        <p className="hairline rounded-lg bg-ink-900 p-3 text-xxs text-ink-400">
          Select a template to begin agency packaging.
        </p>
      ) : null}

      <TemplateSection state={state} />
      <RoleSection state={state} />
      <PackageSection state={state} />
      <DeliverySummarySection summary={summary} />
      <ClientResponsibilitiesSection
        templateId={template?.id}
        packageId={pkg?.id}
      />
      <AcceptanceCriteriaSection packageId={pkg?.id} />
    </div>
  );
}

// ---- Template section --------------------------------------------------

function TemplateSection({ state }: { state: AgencySelectionState }) {
  const templates = listTemplates();
  const currentId = state.selection?.templateId;

  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Project template
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const active = t.id === currentId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => state.setTemplate(active ? undefined : t.id)}
              className={`rounded-sm border p-3 text-left transition ${
                active
                  ? "border-accent bg-ink-950"
                  : "border-ink-700 bg-ink-800 hover:border-ink-500"
              }`}
            >
              <p className="text-sm font-medium text-ink-100">{t.label}</p>
              <p className="mt-1 text-xxs text-ink-400">{t.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Chip>{t.campaignType}</Chip>
                <Chip>{t.businessModel}</Chip>
              </div>
            </button>
          );
        })}
      </div>

      {currentId ? (
        <TemplateDetail templateId={currentId} state={state} />
      ) : null}
    </section>
  );
}

function TemplateDetail({
  templateId,
  state,
}: {
  templateId: ProjectTemplateId;
  state: AgencySelectionState;
}) {
  const t = PROJECT_TEMPLATES[templateId];
  return (
    <div className="mt-4 border-t border-ink-800 pt-3 text-xs text-ink-200">
      <p className="text-xxs uppercase tracking-wide text-ink-400">Default proof requirements</p>
      <ul className="mt-1 list-disc pl-5 text-ink-200">
        {t.defaultProofRequirements.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Tracking emphasis</p>
      <ul className="mt-1 list-disc pl-5 text-ink-200">
        {t.trackingChecklistEmphasis.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Recommended output sections</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {t.recommendedOutputSections.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </div>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Recommended report sections</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {t.recommendedReportSections.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </div>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Review approval items</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {t.reviewApprovalItems.map((k) => (
          <Chip key={k}>{reviewItemKindLabel(k)}</Chip>
        ))}
      </div>

      <p className="mt-3 text-xxs text-ink-400">
        Suggested package:{" "}
        <button
          type="button"
          onClick={() => state.setPackage(t.defaultPackage)}
          className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-100 hover:border-accent hover:text-white"
        >
          {PACKAGE_PRESETS[t.defaultPackage].label}
        </button>
      </p>
    </div>
  );
}

// ---- Role section ------------------------------------------------------

function RoleSection({ state }: { state: AgencySelectionState }) {
  const roles = listRoles();
  const currentId = state.selection?.roleId;

  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Role view
      </p>
      <div className="flex flex-wrap gap-1">
        {roles.map((r) => {
          const active = r.id === currentId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => state.setRole(active ? undefined : r.id)}
              className={`rounded-sm border px-2 py-0.5 text-xxs transition ${
                active
                  ? "border-accent text-accent"
                  : "border-ink-700 text-ink-300 hover:border-ink-500"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {currentId ? <RoleDetail roleId={currentId} /> : null}
    </section>
  );
}

function RoleDetail({ roleId }: { roleId: AgencyRoleId }) {
  const r = ROLE_PRESETS[roleId];
  return (
    <div className="mt-4 border-t border-ink-800 pt-3 text-xs text-ink-200">
      <p className="text-xxs uppercase tracking-wide text-ink-400">Cares about</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {r.cares.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </div>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Approves</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {r.approves.length === 0 ? (
          <span className="text-xxs text-ink-500">— advisory; no default approvals.</span>
        ) : (
          r.approves.map((k) => <Chip key={k}>{reviewItemKindLabel(k)}</Chip>)
        )}
      </div>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Hides</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {r.hides.length === 0 ? (
          <span className="text-xxs text-ink-500">— hides nothing; sees the whole picture.</span>
        ) : (
          r.hides.map((s) => <Chip key={s}>{s}</Chip>)
        )}
      </div>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Handoff format</p>
      <div className="mt-1">
        <Pill>{r.handoffFormat}</Pill>
      </div>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Default questions</p>
      <ul className="mt-1 list-disc pl-5 text-ink-200">
        {r.defaultQuestions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          // Stub — Review Panel owns the comment thread; we don't have a
          // direct write hook here without coupling, so this is left as
          // a no-op for now. Wiring requires lifting the review store
          // into the parent and threading it down.
        }}
        className="mt-2 rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-100 hover:border-accent hover:text-white"
      >
        Open as review comments (coming soon)
      </button>
    </div>
  );
}

// ---- Package section ---------------------------------------------------

function PackageSection({ state }: { state: AgencySelectionState }) {
  const packages = listPackages();
  const currentId = state.selection?.packageId;

  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Package preset
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {packages.map((p) => {
          const active = p.id === currentId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => state.setPackage(active ? undefined : p.id)}
              className={`rounded-sm border p-3 text-left transition ${
                active
                  ? "border-accent bg-ink-950"
                  : "border-ink-700 bg-ink-800 hover:border-ink-500"
              }`}
            >
              <p className="text-sm font-medium text-ink-100">{p.label}</p>
              <p className="mt-1 text-xxs text-ink-400">{p.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Chip>
                  {formatDayRange(p.timelineDays.min, p.timelineDays.max)}
                </Chip>
                <Chip>{formatUsd(p.priceRangeUsd.min, p.priceRangeUsd.max)}</Chip>
              </div>
            </button>
          );
        })}
      </div>

      {currentId ? <PackageDetail packageId={currentId} state={state} /> : null}
    </section>
  );
}

function PackageDetail({
  packageId,
  state,
}: {
  packageId: PackagePresetId;
  state: AgencySelectionState;
}) {
  const p = PACKAGE_PRESETS[packageId];
  return (
    <div className="mt-4 border-t border-ink-800 pt-3 text-xs text-ink-200">
      <div className="flex flex-wrap gap-3">
        <Pill>{formatDayRange(p.timelineDays.min, p.timelineDays.max)}</Pill>
        <Pill>{formatUsd(p.priceRangeUsd.min, p.priceRangeUsd.max)}</Pill>
      </div>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Deliverables</p>
      <ul className="mt-1 list-disc pl-5 text-ink-200">
        {p.deliverables.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Included modules</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {p.includedModules.map((m) => (
          <Chip key={m}>{m}</Chip>
        ))}
      </div>

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Client responsibilities</p>
      <ul className="mt-1 list-disc pl-5 text-ink-200">
        {p.clientResponsibilities.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>

      {p.upsellPath.length > 0 ? (
        <div className="mt-3">
          <p className="text-xxs uppercase tracking-wide text-ink-400">Upsell path</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.upsellPath.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => state.setPackage(id)}
                className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-0.5 text-xxs text-ink-100 hover:border-accent hover:text-white"
              >
                {PACKAGE_PRESETS[id].label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-xxs uppercase tracking-wide text-ink-400">Acceptance criteria</p>
      <ul className="mt-1 list-disc pl-5 text-ink-200">
        {p.acceptanceCriteria.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

// ---- Delivery summary section -----------------------------------------

function DeliverySummarySection({ summary }: { summary: DeliverySummary }) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-300">
        Delivery summary
      </p>
      <Group title="What was decided" items={summary.whatWasDecided} />
      <Group title="What needs approval" items={summary.whatNeedsApproval} />
      <Group title="What will launch first" items={summary.whatWillLaunchFirst} />
      <Group title="Missing assets" items={summary.missingAssets} />
      <Group title="Client needs to provide" items={summary.clientNeedsToProvide} />
      <Group title="Next meeting agenda" items={summary.nextMeetingAgenda} />
      <p className="mt-4">
        <a
          href="/portal"
          target="_blank"
          rel="noreferrer"
          className="rounded-sm border border-ink-700 bg-ink-800 px-3 py-1.5 text-xxs text-ink-100 hover:border-accent hover:text-white"
        >
          Open client portal
        </a>
      </p>
    </section>
  );
}

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-xxs uppercase tracking-wide text-ink-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1 text-xxs text-ink-500">— nothing to show yet.</p>
      ) : (
        <ul className="mt-1 list-disc pl-5 text-xs text-ink-200">
          {items.map((s, i) => (
            <li key={`${title}-${i}`}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Client responsibilities (deduped from template + package) -------

function ClientResponsibilitiesSection({
  templateId,
  packageId,
}: {
  templateId: ProjectTemplateId | undefined;
  packageId: PackagePresetId | undefined;
}) {
  if (!templateId && !packageId) return null;
  const combined: string[] = [];
  if (packageId) {
    for (const c of PACKAGE_PRESETS[packageId].clientResponsibilities) {
      combined.push(c);
    }
  }
  if (templateId) {
    for (const c of PROJECT_TEMPLATES[templateId].defaultProofRequirements) {
      combined.push(c);
    }
  }
  const deduped = Array.from(new Set(combined));
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Client responsibilities
      </p>
      <ul className="list-disc pl-5 text-xs text-ink-200">
        {deduped.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </section>
  );
}

// ---- Acceptance criteria ---------------------------------------------

function AcceptanceCriteriaSection({
  packageId,
}: {
  packageId: PackagePresetId | undefined;
}) {
  if (!packageId) return null;
  const list = PACKAGE_PRESETS[packageId].acceptanceCriteria;
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Acceptance criteria
      </p>
      <ul className="list-disc pl-5 text-xs text-ink-200">
        {list.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </section>
  );
}
