"use client";

// /report — Client-Ready Report surface.
//
// A single-column, print-friendly page that renders the deterministic
// ClientReport built from the active project + saved runs + workspace
// memory. The page reads from localStorage on mount, so it's marked
// "use client" and stays SSR-safe via guarded window access.
//
// The "Print / Save as PDF" button uses the browser's native dialog —
// no third-party PDF dependency. `@media print` rules in this file hide
// the toggle strip and buttons, page-break before each `<h2>`, and
// avoid splitting tables across pages.

import { useEffect, useMemo, useState } from "react";
import {
  createBrowserProjectStore,
  type ProjectStore,
} from "@/lib/workspace/project-store";
import { deriveLearningMemory } from "@/lib/workspace/learning";
import { buildClientReport, REPORT_SECTION_ORDER } from "@/lib/report/report-builder";
import { renderClientReportMarkdown } from "@/lib/report/report-markdown";
import type {
  ClientReport,
  ReportSectionKind,
} from "@/types/report";

const SECTION_LABELS: Record<ReportSectionKind, string> = {
  "executive-summary": "Executive Summary",
  "strategy-snapshot": "Strategy Snapshot",
  "input-quality": "Input Quality",
  "proof-plan": "Proof Plan",
  "execution-plan": "Execution Plan",
  "campaign-setup": "Campaign Setup",
  "test-results": "Test Results",
  "learning-memory": "Learning Memory",
  "decision-log": "Decision Log",
  "next-actions": "Next Actions",
};

export default function ReportPage() {
  const [store, setStore] = useState<ProjectStore | null>(null);
  const [enabled, setEnabled] = useState<Record<ReportSectionKind, boolean>>(() => {
    const init = {} as Record<ReportSectionKind, boolean>;
    for (const k of REPORT_SECTION_ORDER) init[k] = true;
    return init;
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Lazy client-side init so SSR doesn't touch window.
    setStore(createBrowserProjectStore());
  }, []);

  const report: ClientReport | null = useMemo(() => {
    if (!store) return null;
    const activeId = store.getActiveProjectId();
    if (!activeId) return null;
    const project = store.getProject(activeId);
    if (!project) return null;
    const runs = store
      .listRuns(activeId)
      .slice()
      .sort((a, b) => (a.runAt < b.runAt ? 1 : -1));
    if (runs.length === 0) return null;
    const results = store.listResults(activeId);
    const learningMemory = deriveLearningMemory(results, runs);
    const toggles: Partial<Record<ReportSectionKind, boolean>> = {};
    for (const k of REPORT_SECTION_ORDER) toggles[k] = enabled[k];
    return buildClientReport({
      project,
      runs,
      testResults: results,
      learningMemory,
      toggles,
    });
  }, [store, enabled, tick]);

  function toggleSection(kind: ReportSectionKind) {
    setEnabled((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  function downloadMarkdownHref(): string | null {
    if (!report) return null;
    const md = renderClientReportMarkdown(report);
    const enc = typeof encodeURIComponent === "function" ? encodeURIComponent(md) : md;
    return `data:text/markdown;charset=utf-8,${enc}`;
  }

  if (!store) {
    return (
      <main className="report-shell">
        <p>Loading report…</p>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="report-shell">
        <ReportPrintStyles />
        <h1>CampaignOS Report</h1>
        <p>
          No active project, or no saved runs for this project. Open the main
          CampaignOS workspace, select a project, save at least one run, then come
          back to this page.
        </p>
        <p className="no-print">
          <button
            type="button"
            onClick={() => setTick((t) => t + 1)}
            className="report-btn"
          >
            Refresh
          </button>
        </p>
      </main>
    );
  }

  const md = downloadMarkdownHref();
  const projectName = report.project.metadata.name;
  const isEnabled = (k: ReportSectionKind) => report.toggles.find((t) => t.kind === k)?.enabled !== false;

  return (
    <main className="report-shell">
      <ReportPrintStyles />

      <header className="report-header">
        <h1>CampaignOS Report — {projectName}</h1>
        <p className="report-meta">
          Generated: {report.generatedAt}
          {" · "}Primary run: <code>{report.primaryRunId}</code>
          {report.comparison && report.comparison.previous ? (
            <>
              {" · "}Compared with <code>{report.comparison.previous.runId}</code>
              {" "}({report.comparison.changedFields.length} field(s) changed)
            </>
          ) : null}
        </p>
      </header>

      <section className="no-print report-toolbar">
        <div className="report-toggles">
          {REPORT_SECTION_ORDER.map((k) => (
            <label key={k} className="report-toggle">
              <input
                type="checkbox"
                checked={enabled[k]}
                onChange={() => toggleSection(k)}
              />
              <span>{SECTION_LABELS[k]}</span>
            </label>
          ))}
        </div>
        <div className="report-actions">
          <button
            type="button"
            onClick={handlePrint}
            className="report-btn"
          >
            Print / Save as PDF
          </button>
          {md && (
            <a
              className="report-btn"
              href={md}
              download={`campaignos-report-${projectName.replace(/\s+/g, "-").toLowerCase()}.md`}
            >
              Download Markdown
            </a>
          )}
        </div>
      </section>

      {isEnabled("executive-summary") && (
        <section className="report-section">
          <h2>Executive Summary</h2>
          {report.executiveSummary.bullets.length === 0 ? (
            <p><em>No summary bullets for this report.</em></p>
          ) : (
            <ul>
              {report.executiveSummary.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isEnabled("strategy-snapshot") && (
        <section className="report-section">
          <h2>Strategy Snapshot</h2>
          <ul>
            <li><strong>Positioning:</strong> {report.strategySnapshot.positioning}</li>
            <li><strong>Top angle:</strong> {report.strategySnapshot.topAngle}</li>
            <li><strong>Top offer:</strong> {report.strategySnapshot.topOffer}</li>
            <li><strong>Campaign window:</strong> {report.strategySnapshot.campaignWindow}</li>
            <li><strong>Audience:</strong> {report.strategySnapshot.audience}</li>
          </ul>
          {report.strategySnapshot.items.length > 0 && (
            <table className="report-table">
              <thead>
                <tr><th>Field</th><th>Value</th></tr>
              </thead>
              <tbody>
                {report.strategySnapshot.items.map((it, i) => (
                  <tr key={i}><td>{it.label}</td><td>{it.value}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {isEnabled("input-quality") && (
        <section className="report-section">
          <h2>Input Quality</h2>
          <p>
            Score: <strong>{report.inputQuality.score}/100</strong> — {report.inputQuality.status}.
          </p>
          {report.inputQuality.warnings.length > 0 && (
            <>
              <h3>Warnings</h3>
              <table className="report-table">
                <thead>
                  <tr><th>Field</th><th>Severity</th><th>Message</th><th>Fix</th></tr>
                </thead>
                <tbody>
                  {report.inputQuality.warnings.map((w, i) => (
                    <tr key={i}>
                      <td>{w.field}</td>
                      <td>{w.severity}</td>
                      <td>{w.message}</td>
                      <td>{w.fix}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {report.inputQuality.suggestions.length > 0 && (
            <>
              <h3>Suggestions</h3>
              <table className="report-table">
                <thead>
                  <tr><th>Field</th><th>Suggestion</th><th>Rationale</th></tr>
                </thead>
                <tbody>
                  {report.inputQuality.suggestions.map((s, i) => (
                    <tr key={i}>
                      <td>{s.field}</td>
                      <td>{s.suggestion}</td>
                      <td>{s.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <h3>Rewritten hints</h3>
          <ul>
            <li><strong>Audience:</strong> {report.inputQuality.rewrittenHints.audience}</li>
            <li><strong>Core pain:</strong> {report.inputQuality.rewrittenHints.corePain}</li>
            <li><strong>Differentiator:</strong> {report.inputQuality.rewrittenHints.differentiator}</li>
            <li><strong>Goal:</strong> {report.inputQuality.rewrittenHints.goal}</li>
            {report.inputQuality.rewrittenHints.proofNeeded.length > 0 && (
              <li><strong>Proof needed:</strong> {report.inputQuality.rewrittenHints.proofNeeded.join(", ")}</li>
            )}
          </ul>
        </section>
      )}

      {isEnabled("proof-plan") && (
        <section className="report-section">
          <h2>Proof Plan</h2>
          <p>
            Readiness score: <strong>{report.proofPlan.proofReadinessScore}/100</strong>.
          </p>
          {report.proofPlan.missingBeforeSpend.length > 0 && (
            <p><strong>Missing before spend:</strong> {report.proofPlan.missingBeforeSpend.join(", ")}</p>
          )}
          {report.proofPlan.priorityAssets.length > 0 && (
            <table className="report-table">
              <thead>
                <tr><th>Id</th><th>Type</th><th>Priority</th><th>Title</th><th>Why it matters</th></tr>
              </thead>
              <tbody>
                {report.proofPlan.priorityAssets.map((a) => (
                  <tr key={a.id}>
                    <td>{a.id}</td>
                    <td>{a.type}</td>
                    <td>{a.priority}</td>
                    <td>{a.title}</td>
                    <td>{a.whyItMatters}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {isEnabled("execution-plan") && (
        <section className="report-section">
          <h2>Execution Plan</h2>
          <p>
            Recommended first batch: {report.executionPlan.matrix.recommendedFirstBatch.length} cell(s);
            max concurrent tests: {report.executionPlan.matrix.maxConcurrentTests}.
          </p>
          {(() => {
            const matrix = report.executionPlan.matrix;
            const recommended = new Set(matrix.recommendedFirstBatch);
            const firstBatch = matrix.testCells.filter((c) => recommended.has(c.id));
            return firstBatch.length === 0 ? null : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Cell</th><th>Format</th><th>Audience tier</th>
                    <th>Offer</th><th>Primary KPI</th><th>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {firstBatch.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td>{c.format}</td>
                      <td>{c.audienceTier}</td>
                      <td>{c.offer}</td>
                      <td>{c.primaryKpi}</td>
                      <td>{c.estimatedRunDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
          {report.executionPlan.iteration.recommendations.length > 0 && (
            <>
              <h3>Next iteration recommendations</h3>
              <ul>
                {report.executionPlan.iteration.recommendations.map((r, i) => (
                  <li key={i}><strong>{r.signal}</strong> — {r.diagnosis}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {isEnabled("campaign-setup") && (
        <section className="report-section">
          <h2>Campaign Setup</h2>
          <p>Naming convention: <code>{report.executionPlan.campaign.namingConvention}</code></p>
          {report.executionPlan.campaign.campaigns.map((camp, i) => (
            <div key={i} className="report-subblock">
              <h3>{camp.name}</h3>
              <ul>
                <li>Objective: {camp.objective}</li>
                <li>Conversion event: {camp.conversionEvent}</li>
                <li>Budget mode: {camp.budgetMode}</li>
                <li>Architecture: {camp.audienceArchitecture}</li>
                <li>UTM: <code>{camp.utmTemplate}</code></li>
                <li>Reporting columns: {camp.reportingColumns.join(", ")}</li>
              </ul>
              {camp.adSets.length > 0 && (
                <table className="report-table">
                  <thead>
                    <tr><th>Ad set</th><th>Tier</th><th>Budget</th><th>Optimization</th></tr>
                  </thead>
                  <tbody>
                    {camp.adSets.map((a, j) => (
                      <tr key={j}>
                        <td>{a.name}</td>
                        <td>{a.audienceTier}</td>
                        <td>{a.budgetSplit}</td>
                        <td>{a.optimizationEvent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </section>
      )}

      {isEnabled("test-results") && (
        <section className="report-section">
          <h2>Test Results</h2>
          {report.testResults.length === 0 ? (
            <p><em>No test results logged for the included runs.</em></p>
          ) : (
            <table className="report-table">
              <thead>
                <tr><th>Cell</th><th>Status</th><th>Spend</th><th>Days</th><th>Key metric</th></tr>
              </thead>
              <tbody>
                {report.testResults.map((r) => (
                  <tr key={r.id}>
                    <td>{r.testCellId}</td>
                    <td>{r.status}</td>
                    <td>{r.spend}</td>
                    <td>{r.daysRun}</td>
                    <td>{r.metrics.length > 0 ? `${r.metrics[0].kpi}=${r.metrics[0].value}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {isEnabled("learning-memory") && (
        <section className="report-section">
          <h2>Learning Memory</h2>
          {report.learningMemory.learnings.length === 0 ? (
            <p><em>No learnings derived yet.</em></p>
          ) : (
            <>
              <p>Derived from {report.learningMemory.fromResultCount} result(s) at {report.learningMemory.derivedAt}.</p>
              <table className="report-table">
                <thead>
                  <tr><th>Signal</th><th>Subject</th><th>Confidence</th><th>Evidence</th></tr>
                </thead>
                <tbody>
                  {report.learningMemory.learnings.map((l, i) => (
                    <tr key={i}>
                      <td>{l.signal}</td>
                      <td>{l.subject}</td>
                      <td>{l.confidence}</td>
                      <td>{l.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {isEnabled("decision-log") && (
        <section className="report-section">
          <h2>Decision Log</h2>
          {report.decisionLog.length === 0 ? (
            <p><em>No decisions surfaced for this report.</em></p>
          ) : (
            <table className="report-table">
              <thead>
                <tr><th>Source</th><th>Decision</th><th>Severity</th><th>Rationale</th><th>Related</th></tr>
              </thead>
              <tbody>
                {report.decisionLog.map((d) => (
                  <tr key={d.id}>
                    <td>{d.source}</td>
                    <td>{d.decision}</td>
                    <td>{d.severity}</td>
                    <td>{d.rationale}</td>
                    <td>{d.relatedIds && d.relatedIds.length > 0 ? d.relatedIds.join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {isEnabled("next-actions") && (
        <section className="report-section">
          <h2>Next Actions</h2>
          {report.nextActions.length === 0 ? (
            <p><em>No next actions queued.</em></p>
          ) : (
            <ol>
              {report.nextActions.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>{" "}
                  <em>{a.category} · {a.effort}{a.owner ? ` · owner: ${a.owner}` : ""}</em>
                  {" — "}{a.why}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}

// Inline style block — keeps the print rules colocated with the surface
// they apply to and avoids an extra CSS file Next would have to wire
// through globals.css.
function ReportPrintStyles() {
  return (
    <style>{`
      .report-shell {
        max-width: 920px;
        margin: 0 auto;
        padding: 32px 32px 64px;
        color: #111;
        background: #fff;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif;
        font-size: 13pt;
        line-height: 1.45;
      }
      .report-shell h1 {
        font-size: 22pt;
        margin: 0 0 4px;
      }
      .report-shell h2 {
        font-size: 16pt;
        margin: 24px 0 8px;
        border-bottom: 1px solid #ddd;
        padding-bottom: 4px;
      }
      .report-shell h3 {
        font-size: 13pt;
        margin: 16px 0 6px;
      }
      .report-meta {
        color: #555;
        font-size: 11pt;
        margin: 0 0 24px;
      }
      .report-toolbar {
        margin: 0 0 24px;
        padding: 12px 16px;
        border: 1px solid #ddd;
        background: #f8f8f8;
        border-radius: 6px;
      }
      .report-toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        margin-bottom: 12px;
      }
      .report-toggle {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        font-size: 11pt;
        color: #333;
      }
      .report-actions {
        display: flex;
        gap: 8px;
      }
      .report-btn {
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
      .report-btn:hover {
        background: #333;
      }
      .report-section {
        margin: 16px 0;
      }
      .report-subblock {
        margin: 12px 0;
      }
      .report-table {
        width: 100%;
        border-collapse: collapse;
        margin: 8px 0 16px;
        font-size: 11pt;
      }
      .report-table th,
      .report-table td {
        border: 1px solid #ddd;
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
      }
      .report-table th {
        background: #f0f0f0;
        font-weight: 600;
      }
      .report-shell code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: #f0f0f0;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 11pt;
      }

      @media print {
        :root {
          color-scheme: light;
        }
        html, body {
          background: #fff !important;
          color: #000 !important;
        }
        .no-print {
          display: none !important;
        }
        .report-shell {
          max-width: none;
          margin: 0;
          padding: 0;
          font-size: 11pt;
          box-shadow: none;
        }
        .report-section {
          break-inside: avoid-page;
          page-break-inside: avoid;
        }
        .report-section h2 {
          break-before: page;
          page-break-before: always;
        }
        .report-shell > .report-section:first-of-type h2 {
          break-before: auto;
          page-break-before: auto;
        }
        .report-table {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .report-table tr,
        .report-table tbody,
        .report-table thead {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .report-shell h2 {
          border-bottom: 1px solid #999;
        }
      }
    `}</style>
  );
}
