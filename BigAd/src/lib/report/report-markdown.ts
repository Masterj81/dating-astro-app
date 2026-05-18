// report-markdown.ts — Markdown exporter for the Client-Ready Report.
//
// Deterministic. Section emission is gated by ClientReport.toggles. A
// disabled toggle omits both the section header and its body so a
// caller diffing against the toggle state can rely on header absence.
//
// Tone: factual, BigAd voice, no marketing fluff. The reader is a
// founder or stakeholder, not a copywriter.

import type {
  ClientReport,
  DecisionLogEntry,
  NextActionItem,
  ReportSectionKind,
} from "@/types/report";
import type { TestResult } from "@/types/workspace";

function sectionEnabled(report: ClientReport, kind: ReportSectionKind): boolean {
  const t = report.toggles.find((x) => x.kind === kind);
  return t ? t.enabled : true;
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, "/");
}

function h2(lines: string[], title: string): void {
  lines.push(`## ${title}`);
  lines.push("");
}

export function renderClientReportMarkdown(report: ClientReport): string {
  const lines: string[] = [];

  // Title + header lines (always emitted — they're not a toggleable section).
  lines.push(`# CampaignOS Report — ${report.project.metadata.name}`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Primary run: ${report.primaryRunId}`);
  if (report.comparison && report.comparison.previous) {
    lines.push(
      `Compared with: ${report.comparison.previous.runId} (${report.comparison.changedFields.length} field(s) changed)`
    );
  }
  lines.push("");

  // 1. Executive Summary
  if (sectionEnabled(report, "executive-summary")) {
    h2(lines, "Executive Summary");
    if (report.executiveSummary.bullets.length === 0) {
      lines.push("_No summary bullets generated for this report._");
    } else {
      for (const b of report.executiveSummary.bullets) {
        lines.push(`- ${b}`);
      }
    }
    lines.push("");
  }

  // 2. Strategy Snapshot
  if (sectionEnabled(report, "strategy-snapshot")) {
    h2(lines, "Strategy Snapshot");
    const s = report.strategySnapshot;
    lines.push(`- **Positioning:** ${s.positioning}`);
    lines.push(`- **Top angle:** ${s.topAngle}`);
    lines.push(`- **Top offer:** ${s.topOffer}`);
    lines.push(`- **Campaign window:** ${s.campaignWindow}`);
    lines.push(`- **Audience:** ${s.audience}`);
    lines.push("");
    if (s.items.length > 0) {
      lines.push(`| Field | Value |`);
      lines.push(`|-------|-------|`);
      for (const it of s.items) {
        lines.push(`| ${escapePipe(it.label)} | ${escapePipe(it.value)} |`);
      }
      lines.push("");
    }
  }

  // 3. Input Quality
  if (sectionEnabled(report, "input-quality")) {
    h2(lines, "Input Quality");
    const iq = report.inputQuality;
    lines.push(`Score: **${iq.score}/100** — ${iq.status}.`);
    lines.push("");
    if (iq.warnings.length > 0) {
      lines.push(`**Warnings:**`);
      lines.push("");
      lines.push(`| Field | Severity | Message | Fix |`);
      lines.push(`|-------|----------|---------|-----|`);
      for (const w of iq.warnings) {
        lines.push(
          `| ${escapePipe(w.field)} | ${w.severity} | ${escapePipe(w.message)} | ${escapePipe(w.fix)} |`
        );
      }
      lines.push("");
    }
    if (iq.suggestions.length > 0) {
      lines.push(`**Suggestions:**`);
      lines.push("");
      lines.push(`| Field | Suggestion | Rationale |`);
      lines.push(`|-------|------------|-----------|`);
      for (const s of iq.suggestions) {
        lines.push(
          `| ${escapePipe(s.field)} | ${escapePipe(s.suggestion)} | ${escapePipe(s.rationale)} |`
        );
      }
      lines.push("");
    }
    lines.push(`**Rewritten hints:**`);
    lines.push(`- Audience: ${iq.rewrittenHints.audience}`);
    lines.push(`- Core pain: ${iq.rewrittenHints.corePain}`);
    lines.push(`- Differentiator: ${iq.rewrittenHints.differentiator}`);
    lines.push(`- Goal: ${iq.rewrittenHints.goal}`);
    if (iq.rewrittenHints.proofNeeded.length > 0) {
      lines.push(`- Proof needed: ${iq.rewrittenHints.proofNeeded.join(", ")}`);
    }
    lines.push("");
  }

  // 4. Proof Plan
  if (sectionEnabled(report, "proof-plan")) {
    h2(lines, "Proof Plan");
    const pp = report.proofPlan;
    lines.push(`Readiness score: **${pp.proofReadinessScore}/100**.`);
    if (pp.missingBeforeSpend.length > 0) {
      lines.push(
        `Missing before spend: ${pp.missingBeforeSpend.join(", ")}.`
      );
    }
    lines.push("");
    if (pp.priorityAssets.length > 0) {
      lines.push(`| Id | Type | Priority | Title | Why it matters |`);
      lines.push(`|----|------|----------|-------|----------------|`);
      for (const a of pp.priorityAssets) {
        lines.push(
          `| ${a.id} | ${a.type} | ${a.priority} | ${escapePipe(a.title)} | ${escapePipe(a.whyItMatters)} |`
        );
      }
      lines.push("");
    }
  }

  // 5. Execution Plan
  if (sectionEnabled(report, "execution-plan")) {
    h2(lines, "Execution Plan");
    const matrix = report.executionPlan.matrix;
    const iter = report.executionPlan.iteration;
    lines.push(
      `Recommended first batch: ${matrix.recommendedFirstBatch.length} cell(s); max concurrent tests: ${matrix.maxConcurrentTests}.`
    );
    lines.push("");
    if (matrix.testCells.length > 0) {
      lines.push(
        `| Cell | Format | Audience tier | Offer | Primary KPI | Days |`
      );
      lines.push(
        `|------|--------|---------------|-------|-------------|------|`
      );
      const recommended = new Set(matrix.recommendedFirstBatch);
      const firstBatch = matrix.testCells.filter((c) => recommended.has(c.id));
      for (const c of firstBatch) {
        lines.push(
          `| ${c.id} | ${c.format} | ${escapePipe(c.audienceTier)} | ${c.offer} | ${c.primaryKpi} | ${c.estimatedRunDays} |`
        );
      }
      lines.push("");
    }
    if (iter.recommendations.length > 0) {
      lines.push(`**Next iteration recommendations:**`);
      for (const r of iter.recommendations) {
        lines.push(`- **${r.signal}** — ${r.diagnosis}`);
      }
      lines.push("");
    }
  }

  // 6. Campaign Setup
  if (sectionEnabled(report, "campaign-setup")) {
    h2(lines, "Campaign Setup");
    const cs = report.executionPlan.campaign;
    lines.push(`Naming convention: \`${cs.namingConvention}\`.`);
    lines.push("");
    for (const camp of cs.campaigns) {
      lines.push(`### ${camp.name}`);
      lines.push("");
      lines.push(`- Objective: ${camp.objective}`);
      lines.push(`- Conversion event: ${camp.conversionEvent}`);
      lines.push(`- Budget mode: ${camp.budgetMode}`);
      lines.push(`- Architecture: ${camp.audienceArchitecture}`);
      lines.push(`- UTM: \`${camp.utmTemplate}\``);
      lines.push(`- Reporting columns: ${camp.reportingColumns.join(", ")}`);
      if (camp.adSets.length > 0) {
        lines.push("");
        lines.push(`| Ad set | Tier | Budget | Optimization |`);
        lines.push(`|--------|------|--------|--------------|`);
        for (const a of camp.adSets) {
          lines.push(
            `| ${escapePipe(a.name)} | ${escapePipe(a.audienceTier)} | ${escapePipe(a.budgetSplit)} | ${escapePipe(a.optimizationEvent)} |`
          );
        }
      }
      lines.push("");
    }
  }

  // 7. Test Results
  if (sectionEnabled(report, "test-results")) {
    h2(lines, "Test Results");
    if (report.testResults.length === 0) {
      lines.push("_No test results logged for the included runs._");
    } else {
      lines.push(`| Cell | Status | Spend | Days | Key metric |`);
      lines.push(`|------|--------|-------|------|------------|`);
      for (const r of report.testResults as TestResult[]) {
        const km =
          r.metrics && r.metrics.length > 0
            ? `${r.metrics[0].kpi}=${r.metrics[0].value}`
            : "—";
        lines.push(
          `| ${r.testCellId} | ${r.status} | ${r.spend} | ${r.daysRun} | ${km} |`
        );
      }
    }
    lines.push("");
  }

  // 8. Learning Memory
  if (sectionEnabled(report, "learning-memory")) {
    h2(lines, "Learning Memory");
    const lm = report.learningMemory;
    if (lm.learnings.length === 0) {
      lines.push("_No learnings derived yet._");
    } else {
      lines.push(
        `Derived from ${lm.fromResultCount} result(s) at ${lm.derivedAt}.`
      );
      lines.push("");
      const grouped = new Map<string, typeof lm.learnings>();
      for (const l of lm.learnings) {
        const arr = grouped.get(l.signal) ?? [];
        arr.push(l);
        grouped.set(l.signal, arr);
      }
      for (const [signal, items] of Array.from(grouped.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      )) {
        lines.push(`**${signal}**`);
        for (const it of items) {
          lines.push(`- [${it.confidence}] ${it.subject} — ${it.evidence}`);
        }
        lines.push("");
      }
    }
  }

  // 9. Decision Log
  if (sectionEnabled(report, "decision-log")) {
    h2(lines, "Decision Log");
    if (report.decisionLog.length === 0) {
      lines.push("_No decisions surfaced for this report._");
    } else {
      lines.push(`| Source | Decision | Severity | Rationale | Related |`);
      lines.push(`|--------|----------|----------|-----------|---------|`);
      for (const d of report.decisionLog as DecisionLogEntry[]) {
        const rel = d.relatedIds && d.relatedIds.length > 0 ? d.relatedIds.join(", ") : "—";
        lines.push(
          `| ${d.source} | ${escapePipe(d.decision)} | ${d.severity} | ${escapePipe(d.rationale)} | ${escapePipe(rel)} |`
        );
      }
    }
    lines.push("");
  }

  // 10. Next Actions
  if (sectionEnabled(report, "next-actions")) {
    h2(lines, "Next Actions");
    if (report.nextActions.length === 0) {
      lines.push("_No next actions queued._");
    } else {
      let n = 1;
      for (const a of report.nextActions as NextActionItem[]) {
        const owner = a.owner ? ` · owner: ${a.owner}` : "";
        lines.push(
          `${n}. **${a.title}** — _${a.category} · ${a.effort}${owner}_ — ${a.why}`
        );
        n++;
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
