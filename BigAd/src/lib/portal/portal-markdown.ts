// portal-markdown.ts — Markdown exporter for the Shareable Client
// Portal.
//
// Deterministic. Same snapshot → byte-identical markdown. Sections
// whose `bullets.length === 0` are omitted entirely. The markdown is
// tuned for client-facing readability — short bullets, no internal
// scaffolding — and mirrors the canonical pattern from
// `report-markdown.ts`.

import type {
  ClientPortalSnapshot,
  PortalSection,
} from "@/types/portal";

function isoFromEpoch(ms: number): string {
  if (ms <= 0) return "n/a";
  try {
    return new Date(ms).toISOString();
  } catch {
    return "n/a";
  }
}

function readinessLabel(
  r: ClientPortalSnapshot["approvals"]["readiness"]
): string {
  if (r === "ready") return "Ready";
  if (r === "partial") return "Partial";
  return "Not ready";
}

// Demo projects are loaded via `buildDemoLoadPlan` which assigns a
// project id prefixed `demo-<demoId>-…`. Gating the founder demo
// summary on this prefix keeps the block out of real client portals
// while staying deterministic.
function isDemoProjectId(projectId: string): boolean {
  return projectId.startsWith("demo-");
}

function appendFounderDemoSummary(lines: string[]): void {
  lines.push(`## Founder demo summary`);
  lines.push("");
  lines.push(
    `- Strategy generated deterministically from a single product brief`
  );
  lines.push(
    `- Audience avatars, hooks, offers, and creative testing matrix built without LLMs`
  );
  lines.push(
    `- Unit economics, forecast, and scenario simulator surface viability before spend`
  );
  lines.push(
    `- Benchmarks calibrate forecast against planning ranges`
  );
  lines.push(
    `- Review approval, asset production, and results loop close the workflow`
  );
  lines.push(
    `- Report and client portal share the work in one click`
  );
  lines.push("");
}

function emitSection(lines: string[], section: PortalSection): void {
  if (section.bullets.length === 0) return;
  lines.push(`## ${section.title}`);
  if (section.highlight) {
    lines.push(`**${section.highlight}**`);
  }
  if (section.summary) {
    lines.push(`_${section.summary}_`);
  }
  lines.push("");
  for (const b of section.bullets) {
    lines.push(`- ${b}`);
  }
  lines.push("");
}

export function renderClientPortalMarkdown(
  snapshot: ClientPortalSnapshot
): string {
  const lines: string[] = [];

  lines.push(
    `# CampaignOS Client Portal — ${snapshot.projectName}`
  );
  lines.push("");
  lines.push(`> ${snapshot.overviewHeadline}`);
  lines.push("");
  lines.push(`_Last updated: ${isoFromEpoch(snapshot.generatedAt)}_`);
  lines.push("");

  // Founder demo summary — emitted only for projects loaded via the
  // demo flow (project id prefixed `demo-`). Skipped silently on real
  // client portals so the demo-pack messaging never reaches a buyer.
  if (isDemoProjectId(snapshot.projectId)) {
    appendFounderDemoSummary(lines);
  }

  // Walk sections in their pre-ordered shape. Skip empty content.
  for (const section of snapshot.sections) {
    // The Approval-status section is rendered with extra structure
    // (readiness pill + counts) so the client sees one glance-line.
    if (section.id === "review-status") {
      lines.push(`## ${section.title}`);
      lines.push(
        `**Readiness:** ${readinessLabel(snapshot.approvals.readiness)}`
      );
      if (section.summary) {
        lines.push(`_${section.summary}_`);
      }
      lines.push("");
      lines.push(
        `- Critical approvals: ${snapshot.approvals.criticalApproved} / ${snapshot.approvals.criticalTotal}`
      );
      if (snapshot.approvals.pendingKinds.length > 0) {
        lines.push(
          `- Pending: ${snapshot.approvals.pendingKinds
            .slice(0, 3)
            .join(", ")}`
        );
      }
      if (snapshot.approvals.unresolvedComments > 0) {
        lines.push(
          `- Unresolved comments: ${snapshot.approvals.unresolvedComments}`
        );
      }
      lines.push("");
      continue;
    }

    // Next-actions renders as an ordered list.
    if (section.id === "next-actions") {
      lines.push(`## ${section.title}`);
      if (section.summary) {
        lines.push(`_${section.summary}_`);
      }
      lines.push("");
      let n = 1;
      for (const action of snapshot.nextActions) {
        lines.push(`${n}. ${action}`);
        n++;
      }
      lines.push("");
      continue;
    }

    emitSection(lines, section);
  }

  // Footer — internal reference. Skipped when hideInternalNotes is true.
  if (!snapshot.visibility.hideInternalNotes) {
    lines.push(`---`);
    lines.push(
      `_Built with CampaignOS — internal reference: ${snapshot.projectId}_`
    );
    lines.push("");
  }

  return lines.join("\n");
}
