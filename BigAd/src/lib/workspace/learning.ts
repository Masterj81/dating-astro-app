// learning.ts — derive LearningMemory from a project's test results log.
//
// Pure / deterministic. Given the same (results, runs) input the output
// is byte-identical: result ids are sorted, learnings are emitted in a
// fixed signal order, and the derivedAt timestamp comes from the most
// recent result (NOT from `Date.now()` — that would defeat determinism).
//
// Confidence tiers:
//   1-2 results  → low
//   3-5 results  → medium
//   6+ results   → high
//
// Evidence sentences are deliberately generic and short — they read as
// "Hook pattern '<x>' has won across <N> tests; confidence <c>." — no
// platform-coined terms, no third-party training-source language.

import type { HookLibrary, HookLibraryItem } from "@/types/strategy";
import type {
  Learning,
  LearningMemory,
  LearningSignal,
  RunComparison,
  SavedRun,
  TestResult,
} from "@/types/workspace";

const WINNING_STATUSES = new Set<TestResult["status"]>(["winning"]);
const LOSING_STATUSES = new Set<TestResult["status"]>([
  "losing",
  "killed-early",
]);

// Deterministic emission order for learnings.
const SIGNAL_ORDER: LearningSignal[] = [
  "hook-pattern-winning",
  "hook-pattern-losing",
  "offer-kind-winning",
  "offer-kind-losing",
  "format-winning",
  "format-losing",
  "avatar-winning",
  "avatar-losing",
  "audience-tier-winning",
  "audience-tier-losing",
  "proof-asset-required-validated",
  "killrule-triggered-pattern",
];

function confidenceFor(count: number): Learning["confidence"] {
  if (count >= 6) return "high";
  if (count >= 3) return "medium";
  return "low";
}

function findHookPattern(
  hookText: string,
  hookLibrary: HookLibrary | undefined
): string | null {
  if (!hookLibrary || !Array.isArray(hookLibrary.items)) return null;
  const match = hookLibrary.items.find((h: HookLibraryItem) => h.text === hookText);
  return match ? match.pattern : null;
}

function resolveAvatarLabel(
  avatarId: string,
  run: SavedRun | undefined
): string {
  if (!run) return avatarId;
  const avatar = run.strategy.audienceAvatars.find((a) => a.id === avatarId);
  return avatar ? avatar.label : avatarId;
}

function evidenceSentence(
  subjectKind: string,
  subject: string,
  outcome: "won" | "lost",
  count: number,
  confidence: Learning["confidence"]
): string {
  const verb = outcome === "won" ? "has won" : "has lost";
  return `${subjectKind} '${subject}' ${verb} across ${count} test${
    count === 1 ? "" : "s"
  }; confidence ${confidence}.`;
}

interface Bucket {
  signal: LearningSignal;
  subject: string;
  subjectKind: string;
  outcome: "won" | "lost";
  resultIds: Set<string>;
}

function bucketKey(signal: LearningSignal, subject: string): string {
  return `${signal}::${subject}`;
}

function pushBucket(
  buckets: Map<string, Bucket>,
  signal: LearningSignal,
  subject: string,
  subjectKind: string,
  outcome: "won" | "lost",
  resultId: string
): void {
  if (!subject) return;
  const key = bucketKey(signal, subject);
  const existing = buckets.get(key);
  if (existing) {
    existing.resultIds.add(resultId);
    return;
  }
  buckets.set(key, {
    signal,
    subject,
    subjectKind,
    outcome,
    resultIds: new Set<string>([resultId]),
  });
}

export function deriveLearningMemory(
  results: TestResult[],
  runs: SavedRun[]
): LearningMemory {
  // Stable sort by result id so the output is deterministic even when
  // the caller hands us an arbitrary array order.
  const sorted = results.slice().sort((a, b) => a.id.localeCompare(b.id));

  const runById = new Map<string, SavedRun>();
  for (const r of runs) runById.set(r.id, r);

  const buckets = new Map<string, Bucket>();

  for (const result of sorted) {
    const winning = WINNING_STATUSES.has(result.status);
    const losing = LOSING_STATUSES.has(result.status);
    if (!winning && !losing) continue; // inconclusive / paused / not-yet-launched

    const run = runById.get(result.runId);
    if (!run) continue;

    const cell = run.strategy.creativeTestingMatrix?.testCells?.find(
      (c) => c.id === result.testCellId
    );
    if (!cell) continue;

    const outcome: "won" | "lost" = winning ? "won" : "lost";
    const suffix: "winning" | "losing" = winning ? "winning" : "losing";

    // Hook pattern signal — resolved via the hook text lookup.
    const pattern = findHookPattern(cell.hook, run.strategy.hookLibrary);
    if (pattern) {
      pushBucket(
        buckets,
        `hook-pattern-${suffix}` as LearningSignal,
        pattern,
        "Hook pattern",
        outcome,
        result.id
      );
    }

    // Offer kind signal.
    if (cell.offer) {
      pushBucket(
        buckets,
        `offer-kind-${suffix}` as LearningSignal,
        cell.offer,
        "Offer kind",
        outcome,
        result.id
      );
    }

    // Format signal.
    if (cell.format) {
      pushBucket(
        buckets,
        `format-${suffix}` as LearningSignal,
        cell.format,
        "Format",
        outcome,
        result.id
      );
    }

    // Avatar signal.
    if (cell.avatarId) {
      const label = resolveAvatarLabel(cell.avatarId, run);
      pushBucket(
        buckets,
        `avatar-${suffix}` as LearningSignal,
        label,
        "Avatar",
        outcome,
        result.id
      );
    }

    // Audience tier signal.
    if (cell.audienceTier) {
      pushBucket(
        buckets,
        `audience-tier-${suffix}` as LearningSignal,
        cell.audienceTier,
        "Audience tier",
        outcome,
        result.id
      );
    }

    // Killrule pattern — only emitted for losing/killed cells where the
    // cell carries a kill rule reference.
    if (!winning && cell.killRule && cell.killRule.metric) {
      pushBucket(
        buckets,
        "killrule-triggered-pattern",
        cell.killRule.metric,
        "Kill-rule metric",
        outcome,
        result.id
      );
    }

    // Proof-asset-required validation — emitted on winning cells that
    // had a proofAssetRequired reference attached at run time.
    if (winning && cell.proofAssetRequired) {
      pushBucket(
        buckets,
        "proof-asset-required-validated",
        cell.proofAssetRequired,
        "Proof asset",
        outcome,
        result.id
      );
    }
  }

  // Build the deterministic Learning array.
  const learnings: Learning[] = [];
  const orderedKeys: string[] = [];
  for (const signal of SIGNAL_ORDER) {
    const keys: string[] = [];
    for (const [k, b] of buckets) {
      if (b.signal === signal) keys.push(k);
    }
    keys.sort(); // alphabetical inside a signal — deterministic
    orderedKeys.push(...keys);
  }

  for (const key of orderedKeys) {
    const b = buckets.get(key);
    if (!b) continue;
    const count = b.resultIds.size;
    const confidence = confidenceFor(count);
    const supportingResultIds = Array.from(b.resultIds).sort();
    learnings.push({
      signal: b.signal,
      subject: b.subject,
      evidence: evidenceSentence(
        b.subjectKind,
        b.subject,
        b.outcome,
        count,
        confidence
      ),
      confidence,
      supportingResultIds,
    });
  }

  // Determine derivedAt from the most recent result's updatedAt — keeps
  // the function deterministic for fixed inputs.
  let derivedAt = "1970-01-01T00:00:00.000Z";
  for (const r of sorted) {
    const ts = r.updatedAt || r.createdAt;
    if (ts && ts > derivedAt) derivedAt = ts;
  }

  return {
    derivedAt,
    fromResultCount: sorted.length,
    learnings,
  };
}

// ---- Run comparison ---------------------------------------------------

type Primitive = string | number | boolean | null | undefined;

function isPrimitive(v: unknown): v is Primitive {
  return (
    v === null ||
    v === undefined ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Compare two objects shallowly at the field level, with a single level
// of recursion into known sub-objects (input, strategy.positioning,
// strategy.campaignCalendar, etc.). Returns a flat list of changed
// dotted paths, capped at 12.
function diffFields(
  prev: Record<string, unknown>,
  curr: Record<string, unknown>,
  prefix: string,
  out: string[],
  cap: number
): void {
  if (out.length >= cap) return;
  const keys = new Set<string>([...Object.keys(prev), ...Object.keys(curr)]);
  for (const key of Array.from(keys).sort()) {
    if (out.length >= cap) return;
    const pv = prev[key];
    const cv = curr[key];
    if (jsonEqual(pv, cv)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(path);
  }
}

const TRACKED_INPUT_FIELDS = [
  "name",
  "category",
  "description",
  "price",
  "businessModel",
  "audience",
  "audiencePain",
  "competitors",
  "differentiator",
  "goal",
  "awareness",
  "sophistication",
  "campaignType",
];

const TRACKED_STRATEGY_FIELDS: Array<keyof import("@/types/strategy").Strategy> = [
  "positioning",
  "centralPromise",
  "uniqueMechanism",
  "offers",
  "campaignCalendar",
  "audienceAvatars",
  "hookLibrary",
  "adConceptCards",
  "creativeTestingMatrix",
  "nextIterationPlan",
];

export function buildRunComparison(
  current: SavedRun,
  previous: SavedRun | null
): RunComparison {
  if (!previous) {
    return {
      current: { runId: current.id, runAt: current.runAt },
      previous: null,
      changedFields: [],
      noteworthy: [
        "First run for this project — no previous strategy to compare against.",
      ],
    };
  }

  const changed: string[] = [];

  // input.* — only track the fields we know about so we don't emit
  // diffs against derived / optional shapes the engine doesn't care
  // about.
  const prevInput = previous.input as unknown as Record<string, unknown>;
  const currInput = current.input as unknown as Record<string, unknown>;
  const inputDiffs: string[] = [];
  for (const f of TRACKED_INPUT_FIELDS) {
    if (!jsonEqual(prevInput[f], currInput[f])) {
      inputDiffs.push(`input.${f}`);
    }
  }
  changed.push(...inputDiffs);

  // strategy.* — top-level fields only; the diff is "this subtree changed",
  // not the recursive set of leaves.
  const prevStrategy = previous.strategy as unknown as Record<string, unknown>;
  const currStrategy = current.strategy as unknown as Record<string, unknown>;
  for (const f of TRACKED_STRATEGY_FIELDS) {
    if (!jsonEqual(prevStrategy[f as string], currStrategy[f as string])) {
      changed.push(`strategy.${String(f)}`);
    }
  }

  // Cap at 12 deterministic entries.
  const capped = changed.slice(0, 12);

  const noteworthy: string[] = [];
  if (inputDiffs.length === 0) {
    noteworthy.push(
      "Inputs unchanged — any strategy delta comes from engine output, not your inputs."
    );
  } else if (inputDiffs.length === 1) {
    noteworthy.push(
      `One input changed (${inputDiffs[0].replace("input.", "")}) — narrow comparison.`
    );
  } else {
    noteworthy.push(
      `${inputDiffs.length} input fields changed — expect broad strategy drift.`
    );
  }
  if (capped.some((p) => p.startsWith("strategy.offers"))) {
    noteworthy.push("Offer architecture shifted between runs.");
  }
  if (capped.some((p) => p.startsWith("strategy.campaignCalendar"))) {
    noteworthy.push("Campaign calendar windows or architecture moved.");
  }

  return {
    current: { runId: current.id, runAt: current.runAt },
    previous: { runId: previous.id, runAt: previous.runAt },
    changedFields: capped,
    noteworthy: noteworthy.slice(0, 3),
  };
}

// Silence the unused-parameter lint in this helper-only export.
export const __diffFields = diffFields;
