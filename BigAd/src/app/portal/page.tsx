"use client";

// /portal — Shareable Client Portal surface.
//
// A single-column, print-friendly page that renders the deterministic
// ClientPortalSnapshot built from the active project + saved runs +
// review board + agency selection + results. The page reads from
// localStorage on mount, so it's marked "use client" and stays
// SSR-safe via guarded window access.
//
// Mirrors `/report` in shape: lazy store init, section toggles,
// Print / Download Markdown / Copy summary actions, inline `@media
// print` rules colocated with the surface.
//
// The portal is a sister to the Client Report — same plumbing pattern,
// different audience. The portal is client-facing; internal references
// default to hidden.

import { useEffect, useMemo, useState } from "react";
import {
  createBrowserProjectStore,
  type ProjectStore,
} from "@/lib/workspace/project-store";
import {
  createBrowserReviewStore,
  type ReviewStore,
} from "@/lib/review/review-store";
import {
  createBrowserAgencyStore,
  type AgencyStore,
} from "@/lib/agency/agency-store";
import {
  createBrowserResultsStore,
  type ResultsStore,
} from "@/lib/results/results-store";
import { deriveLearningMemory } from "@/lib/workspace/learning";
import { summarizeReviewBoard } from "@/lib/review/review-board";
import { analyzeCampaignResults } from "@/lib/results/results-analysis";
import {
  buildClientPortalSnapshot,
  buildPortalSharePack,
  defaultPortalVisibility,
  PORTAL_SECTION_ORDER,
} from "@/lib/portal/portal-builder";
import { renderClientPortalMarkdown } from "@/lib/portal/portal-markdown";
import type {
  ClientPortalSnapshot,
  PortalSectionId,
  PortalVisibilitySettings,
} from "@/types/portal";

const SECTION_LABELS: Record<PortalSectionId, string> = {
  overview: "Overview",
  "strategy-snapshot": "Strategy snapshot",
  offer: "Offer",
  audience: "Audience",
  proof: "Proof",
  execution: "Execution",
  forecast: "Forecast",
  simulator: "Simulator",
  benchmarks: "Benchmarks",
  "review-status": "Approval status",
  results: "Results",
  "next-actions": "Next actions",
};

function readinessLabel(
  r: ClientPortalSnapshot["approvals"]["readiness"]
): string {
  if (r === "ready") return "Ready";
  if (r === "partial") return "Partial";
  return "Not ready";
}

function projectSlug(name: string): string {
  return (
    name
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase() || "project"
  );
}

export default function PortalPage() {
  // Lazy store references — created in useEffect to stay SSR-safe.
  const [projectStore, setProjectStore] = useState<ProjectStore | null>(null);
  const [reviewStore, setReviewStore] = useState<ReviewStore | null>(null);
  const [agencyStore, setAgencyStore] = useState<AgencyStore | null>(null);
  const [resultsStore, setResultsStore] = useState<ResultsStore | null>(null);

  const [visibility, setVisibility] = useState<PortalVisibilitySettings>(
    () => defaultPortalVisibility()
  );
  const [tick, setTick] = useState(0);
  const [activeIdOverride, setActiveIdOverride] = useState<string | null>(
    null
  );

  useEffect(() => {
    setProjectStore(createBrowserProjectStore());
    setReviewStore(createBrowserReviewStore());
    setAgencyStore(createBrowserAgencyStore());
    setResultsStore(createBrowserResultsStore());
  }, []);

  const projectList = useMemo(() => {
    if (!projectStore) return [];
    return projectStore.listProjects();
  }, [projectStore, tick]);

  const activeProjectId: string | null = useMemo(() => {
    if (activeIdOverride) return activeIdOverride;
    if (!projectStore) return null;
    return projectStore.getActiveProjectId();
  }, [projectStore, activeIdOverride, tick]);

  const snapshot: ClientPortalSnapshot | null = useMemo(() => {
    if (!projectStore || !reviewStore || !agencyStore || !resultsStore) {
      return null;
    }
    if (!activeProjectId) return null;
    const project = projectStore.getProject(activeProjectId);
    if (!project) return null;
    // Newest first.
    const runs = projectStore
      .listRuns(activeProjectId)
      .slice()
      .sort((a, b) => (a.runAt < b.runAt ? 1 : -1));
    if (runs.length === 0) return null;
    const latestRun = runs[0];
    const testResults = projectStore.listResults(activeProjectId);
    const learningMemory = deriveLearningMemory(testResults, runs);

    // Review board summary for the latest run.
    const reviewItems = reviewStore.listItems(activeProjectId, latestRun.id);
    const reviewComments: typeof reviewItems extends infer T
      ? unknown
      : never = [];
    // Gather comments per item.
    const allComments = reviewItems.flatMap((it) =>
      reviewStore.listComments(it.id)
    );
    const reviewSummary = summarizeReviewBoard({
      projectId: activeProjectId,
      runId: latestRun.id,
      items: reviewItems,
      comments: allComments,
    });

    // Agency selection.
    const agencySelection = agencyStore.getSelection(activeProjectId);

    // Campaign actuals + accuracy report.
    const actuals = resultsStore.listResults(activeProjectId, latestRun.id);
    const accuracyReport =
      actuals.length > 0
        ? analyzeCampaignResults({
            strategy: latestRun.strategy,
            actualResults: actuals,
          })
        : undefined;

    // Suppress the unused-binding lint on the placeholder.
    void reviewComments;

    return buildClientPortalSnapshot({
      project,
      runs,
      reviewSummary,
      reviewItems,
      reviewComments: allComments,
      agencySelection,
      learningMemory,
      results: actuals,
      accuracyReport,
      visibility,
    });
  }, [
    projectStore,
    reviewStore,
    agencyStore,
    resultsStore,
    activeProjectId,
    visibility,
    tick,
  ]);

  function toggleSection(id: PortalSectionId) {
    setVisibility((prev) => ({
      ...prev,
      sections: { ...prev.sections, [id]: !prev.sections[id] },
    }));
  }

  function toggleHigh(
    key: "hidePricing" | "hideInternalNotes" | "hideAssumptions"
  ) {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  function handleDownloadMarkdown() {
    if (!snapshot || typeof window === "undefined") return;
    const md = renderClientPortalMarkdown(snapshot);
    const blob = new Blob([md], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `campaignos-portal-${projectSlug(
      snapshot.projectName
    )}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Defer revoke — Date.now() at click time is allowed inside this
    // handler (mirrors how /report handles its download).
    setTimeout(() => URL.revokeObjectURL(url), Date.now() % 1000);
  }

  async function handleCopySummary() {
    if (!snapshot || typeof window === "undefined") return;
    const md = renderClientPortalMarkdown(snapshot);
    const pack = buildPortalSharePack(snapshot, md);
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(pack.oneLiner);
      }
    } catch {
      // Clipboard unavailable — silently no-op. The Markdown download
      // remains the reliable fallback.
    }
  }

  if (!projectStore) {
    return (
      <main className="portal-shell">
        <PortalPrintStyles />
        <p>Loading portal…</p>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="portal-shell">
        <PortalPrintStyles />
        <h1>CampaignOS Client Portal</h1>
        <p>
          No CampaignOS project found. Create a project to publish a client
          portal.
        </p>
        <p className="no-print">
          <button
            type="button"
            onClick={() => setTick((t) => t + 1)}
            className="portal-btn"
          >
            Refresh
          </button>
        </p>
      </main>
    );
  }

  const generatedIso =
    snapshot.generatedAt > 0
      ? new Date(snapshot.generatedAt).toISOString()
      : "n/a";

  return (
    <main className="portal-shell">
      <PortalPrintStyles />

      <header className="portal-header">
        <h1>CampaignOS Client Portal — {snapshot.projectName}</h1>
        <p className="portal-lead">{snapshot.overviewHeadline}</p>
        <p className="portal-meta">Last updated: {generatedIso}</p>
      </header>

      <section className="no-print portal-toolbar">
        {projectList.length > 1 && (
          <div className="portal-project-picker">
            <label htmlFor="portal-project-select">Project:&nbsp;</label>
            <select
              id="portal-project-select"
              value={activeProjectId ?? ""}
              onChange={(e) => setActiveIdOverride(e.target.value || null)}
            >
              {projectList.map((p) => (
                <option key={p.metadata.id} value={p.metadata.id}>
                  {p.metadata.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="portal-toggles">
          {PORTAL_SECTION_ORDER.map((id) => (
            <label key={id} className="portal-toggle">
              <input
                type="checkbox"
                checked={visibility.sections[id] !== false}
                onChange={() => toggleSection(id)}
              />
              <span>{SECTION_LABELS[id]}</span>
            </label>
          ))}
        </div>
        <div className="portal-toggles portal-toggles-secondary">
          <label className="portal-toggle">
            <input
              type="checkbox"
              checked={visibility.hidePricing}
              onChange={() => toggleHigh("hidePricing")}
            />
            <span>Hide pricing</span>
          </label>
          <label className="portal-toggle">
            <input
              type="checkbox"
              checked={visibility.hideInternalNotes}
              onChange={() => toggleHigh("hideInternalNotes")}
            />
            <span>Hide internal notes</span>
          </label>
          <label className="portal-toggle">
            <input
              type="checkbox"
              checked={visibility.hideAssumptions}
              onChange={() => toggleHigh("hideAssumptions")}
            />
            <span>Hide assumptions</span>
          </label>
        </div>
        <div className="portal-actions">
          <button
            type="button"
            onClick={handlePrint}
            className="portal-btn"
          >
            Print / Save as PDF
          </button>
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="portal-btn"
          >
            Download Markdown
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            className="portal-btn"
          >
            Copy client summary
          </button>
        </div>
      </section>

      {snapshot.sections.map((section) => (
        <section key={section.id} className="portal-section">
          <h2>{section.title}</h2>
          {section.id === "review-status" && (
            <p className="portal-pill">
              Readiness: <strong>{readinessLabel(snapshot.approvals.readiness)}</strong>
            </p>
          )}
          {section.highlight && section.id !== "review-status" && (
            <p className="portal-highlight">{section.highlight}</p>
          )}
          {section.summary && (
            <p className="portal-summary">{section.summary}</p>
          )}
          {section.id === "next-actions" ? (
            <ol>
              {snapshot.nextActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ol>
          ) : section.id === "review-status" ? (
            <ul>
              <li>
                Critical approvals: {snapshot.approvals.criticalApproved} /{" "}
                {snapshot.approvals.criticalTotal}
              </li>
              {snapshot.approvals.pendingKinds.length > 0 && (
                <li>
                  Pending:{" "}
                  {snapshot.approvals.pendingKinds.slice(0, 3).join(", ")}
                </li>
              )}
              {snapshot.approvals.unresolvedComments > 0 && (
                <li>
                  Unresolved comments: {snapshot.approvals.unresolvedComments}
                </li>
              )}
            </ul>
          ) : (
            <ul>
              {section.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {!visibility.hideInternalNotes && (
        <footer className="portal-footer">
          <p>
            <em>
              Built with CampaignOS — internal reference: {snapshot.projectId}
            </em>
          </p>
        </footer>
      )}
    </main>
  );
}

function PortalPrintStyles() {
  return (
    <style>{`
      .portal-shell {
        max-width: 920px;
        margin: 0 auto;
        padding: 32px 32px 64px;
        color: #111;
        background: #fff;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif;
        font-size: 13pt;
        line-height: 1.45;
      }
      .portal-shell h1 {
        font-size: 22pt;
        margin: 0 0 4px;
      }
      .portal-shell h2 {
        font-size: 16pt;
        margin: 24px 0 8px;
        border-bottom: 1px solid #ddd;
        padding-bottom: 4px;
      }
      .portal-lead {
        font-size: 14pt;
        color: #222;
        margin: 8px 0 4px;
      }
      .portal-meta {
        color: #555;
        font-size: 11pt;
        margin: 0 0 24px;
      }
      .portal-pill {
        font-size: 12pt;
        margin: 0 0 4px;
      }
      .portal-highlight {
        font-size: 12pt;
        font-weight: 600;
        color: #111;
        margin: 0 0 4px;
      }
      .portal-summary {
        font-size: 11pt;
        color: #555;
        margin: 0 0 8px;
      }
      .portal-toolbar {
        margin: 0 0 24px;
        padding: 12px 16px;
        border: 1px solid #ddd;
        background: #f8f8f8;
        border-radius: 6px;
      }
      .portal-project-picker {
        margin-bottom: 12px;
        font-size: 11pt;
      }
      .portal-toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        margin-bottom: 12px;
      }
      .portal-toggles-secondary {
        border-top: 1px dashed #ccc;
        padding-top: 8px;
      }
      .portal-toggle {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        font-size: 11pt;
        color: #333;
      }
      .portal-actions {
        display: flex;
        gap: 8px;
      }
      .portal-btn {
        display: inline-block;
        background: #111;
        color: #fff;
        border: 1px solid #111;
        padding: 6px 12px;
        font-size: 11pt;
        cursor: pointer;
        text-decoration: none;
        border-radius: 4px;
      }
      .portal-btn:hover {
        background: #333;
      }
      .portal-section {
        margin: 16px 0;
      }
      .portal-footer {
        margin-top: 32px;
        padding-top: 12px;
        border-top: 1px solid #ddd;
        color: #777;
        font-size: 10pt;
      }

      @media print {
        :root { color-scheme: light; }
        html, body {
          background: #fff !important;
          color: #000 !important;
        }
        .no-print {
          display: none !important;
        }
        .portal-shell {
          max-width: none;
          margin: 0;
          padding: 0;
          font-size: 11pt;
          box-shadow: none;
        }
        .portal-section {
          break-inside: avoid-page;
          page-break-inside: avoid;
        }
        .portal-shell h2 {
          border-bottom: 1px solid #999;
        }
      }
    `}</style>
  );
}
