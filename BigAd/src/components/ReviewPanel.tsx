"use client";

// ReviewPanel.tsx — Review & Approval Layer UI for BigAd.
//
// Mirrors WorkspacePanel: a `useReviewBoard()` hook binds to the
// browser store and exposes items, comments, and the derived summary.
// `ReviewBoardTab` is the main tab body. `ClientHandoffPanel` is a
// compact sub-section that filters down to client-assigned items
// and client-authored comments.
//
// Render must stay deterministic for SSR — we never call
// `Date.now()` inside render. Timestamps shown to the user come from
// stored fields (createdAt / updatedAt). A small `useEffect`
// hydrates a single `now` value after mount for any client-only
// labels that need it.

import { useEffect, useMemo, useState } from "react";
import type { SavedRun } from "@/types/workspace";
import type {
  ReviewAuthor,
  ReviewBoard,
  ReviewBoardSummary,
  ReviewComment,
  ReviewItem,
  ReviewItemKind,
  ReviewStatus,
} from "@/types/review";
import {
  CRITICAL_REVIEW_ITEM_KINDS,
  NON_CRITICAL_REVIEW_ITEM_KINDS,
} from "@/types/review";
import {
  createBrowserReviewStore,
  type ReviewStore,
} from "@/lib/review/review-store";
import {
  reviewItemKindLabel,
  summarizeReviewBoard,
  unresolvedCommentCountByItem,
} from "@/lib/review/review-board";

// ---- Hook: live store binding -------------------------------------------

export interface ReviewBoardState {
  store: ReviewStore | null;
  projectId: string | null;
  run: SavedRun | null;
  items: ReviewItem[];
  comments: ReviewComment[];
  summary: ReviewBoardSummary;
}

const EMPTY_SUMMARY: ReviewBoardSummary = {
  approvalScore: 0,
  approvalReadiness: "not-ready",
  criticalApproved: 0,
  criticalTotal: CRITICAL_REVIEW_ITEM_KINDS.length,
  unresolvedComments: 0,
  blockedItems: 0,
  needsChangesItems: 0,
  pendingCriticalKinds: [],
  derivedAt: 0,
};

export function useReviewBoard(args: {
  projectId: string | null;
  run: SavedRun | null;
}): ReviewBoardState & {
  refresh: () => void;
} {
  const { projectId, run } = args;
  const [store, setStore] = useState<ReviewStore | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Lazy-instantiate only on the client to keep SSR happy.
    setStore(createBrowserReviewStore());
  }, []);

  // When the active run changes and the board has not been seeded yet,
  // seed it idempotently. The store call is a no-op when items already
  // exist for the runId.
  useEffect(() => {
    if (!store || !projectId || !run) return;
    store.initBoardFromRun(projectId, run);
    setTick((t) => t + 1);
  }, [store, projectId, run]);

  const items = useMemo<ReviewItem[]>(() => {
    if (!store || !projectId || !run) return [];
    return store.listItems(projectId, run.id);
  }, [store, projectId, run, tick]);

  const comments = useMemo<ReviewComment[]>(() => {
    if (!store || items.length === 0) return [];
    const out: ReviewComment[] = [];
    for (const it of items) {
      out.push(...store.listComments(it.id));
    }
    return out;
  }, [store, items, tick]);

  const summary = useMemo<ReviewBoardSummary>(() => {
    if (!projectId || !run) return EMPTY_SUMMARY;
    const board: ReviewBoard = {
      projectId,
      runId: run.id,
      items,
      comments,
    };
    return summarizeReviewBoard(board);
  }, [projectId, run, items, comments]);

  return {
    store,
    projectId,
    run,
    items,
    comments,
    summary,
    refresh: () => setTick((t) => t + 1),
  };
}

// ---- Utilities ----------------------------------------------------------

const STATUS_OPTIONS: { value: ReviewStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "needs-changes", label: "Needs changes" },
  { value: "blocked", label: "Blocked" },
];

const AUTHOR_OPTIONS: { value: ReviewAuthor; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "client", label: "Client" },
  { value: "media-buyer", label: "Media buyer" },
  { value: "creator", label: "Creator" },
];

function statusPillClass(status: ReviewStatus): string {
  switch (status) {
    case "approved":
      return "border-emerald-500/40 text-emerald-300";
    case "needs-changes":
      return "border-amber-500/40 text-amber-300";
    case "blocked":
      return "border-rose-500/40 text-rose-300";
    case "pending":
    default:
      return "border-ink-600 text-ink-300";
  }
}

function readinessPillClass(readiness: ReviewBoardSummary["approvalReadiness"]): string {
  switch (readiness) {
    case "ready":
      return "border-emerald-500/40 text-emerald-300";
    case "partial":
      return "border-amber-500/40 text-amber-300";
    case "not-ready":
    default:
      return "border-rose-500/40 text-rose-300";
  }
}

function isoDateOnly(epochMs: number | undefined): string {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs) || epochMs <= 0) {
    return "—";
  }
  // Render ISO date (YYYY-MM-DD) only — deterministic per timestamp.
  return new Date(epochMs).toISOString().slice(0, 10);
}

// ---- ReviewBoardTab — main tab body -------------------------------------

interface ReviewBoardTabProps {
  state: ReviewBoardState & { refresh: () => void };
}

export function ReviewBoardTab({ state }: ReviewBoardTabProps) {
  if (!state.projectId || !state.run) {
    return (
      <div className="hairline rounded-lg bg-ink-900 p-5 text-xs text-ink-300">
        Save a run first to start a Review Board. The board seeds 10
        reviewable items (6 critical, 4 non-critical) from the active
        run's strategy, then tracks approvals and comments per author
        in your browser's localStorage.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ClientHandoffPanel state={state} />
      <ReviewSummaryHeader summary={state.summary} />
      <ReviewItemList state={state} />
    </div>
  );
}

// ---- Approval summary header -------------------------------------------

function ReviewSummaryHeader({
  summary,
}: {
  summary: ReviewBoardSummary;
}) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Approval score
          </p>
          <p className="text-2xl font-semibold text-ink-50">
            {summary.approvalScore}
            <span className="text-base text-ink-400"> / 100</span>
          </p>
        </div>
        <div>
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Readiness
          </p>
          <span
            className={`inline-block rounded-sm border px-2 py-0.5 text-xs ${readinessPillClass(
              summary.approvalReadiness
            )}`}
          >
            {summary.approvalReadiness}
          </span>
        </div>
        <div>
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Critical approved
          </p>
          <p className="text-base text-ink-100">
            {summary.criticalApproved} / {summary.criticalTotal}
          </p>
        </div>
        <div>
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Unresolved comments
          </p>
          <p className="text-base text-ink-100">{summary.unresolvedComments}</p>
        </div>
        <div>
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Blocked items
          </p>
          <p className="text-base text-ink-100">{summary.blockedItems}</p>
        </div>
      </div>
    </section>
  );
}

// ---- Per-author filter + item list -------------------------------------

function ReviewItemList({
  state,
}: {
  state: ReviewBoardState & { refresh: () => void };
}) {
  const [filter, setFilter] = useState<ReviewAuthor | "all">("all");

  // Sort: critical first (in CRITICAL order), then non-critical (in
  // non-critical order). Deterministic so the UI doesn't shift after
  // edits.
  const ordered = useMemo<ReviewItem[]>(() => {
    const byKind = new Map<ReviewItemKind, ReviewItem>();
    for (const it of state.items) byKind.set(it.kind, it);
    const out: ReviewItem[] = [];
    for (const k of CRITICAL_REVIEW_ITEM_KINDS) {
      const it = byKind.get(k);
      if (it) out.push(it);
    }
    for (const k of NON_CRITICAL_REVIEW_ITEM_KINDS) {
      const it = byKind.get(k);
      if (it) out.push(it);
    }
    return out;
  }, [state.items]);

  const unresolvedByItem = useMemo(
    () =>
      unresolvedCommentCountByItem({
        projectId: state.projectId ?? "",
        runId: state.run?.id ?? "",
        items: state.items,
        comments: state.comments,
      }),
    [state.projectId, state.run, state.items, state.comments]
  );

  const filtered = useMemo<ReviewItem[]>(() => {
    if (filter === "all") return ordered;
    return ordered.filter((it) => {
      if (it.assignedTo === filter) return true;
      const itemComments = state.comments.filter((c) => c.itemId === it.id);
      return itemComments.some((c) => c.author === filter);
    });
  }, [ordered, filter, state.comments]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Review items
        </p>
        <span className="text-xxs text-ink-500">filter by author</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-sm border px-2 py-0.5 text-xxs ${
              filter === "all"
                ? "border-accent text-accent"
                : "border-ink-700 text-ink-300 hover:border-ink-500"
            }`}
          >
            all
          </button>
          {AUTHOR_OPTIONS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setFilter(a.value)}
              className={`rounded-sm border px-2 py-0.5 text-xxs ${
                filter === a.value
                  ? "border-accent text-accent"
                  : "border-ink-700 text-ink-300 hover:border-ink-500"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-400">
          No items match this filter.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((it) => (
            <ReviewItemCard
              key={it.id}
              item={it}
              comments={state.comments.filter((c) => c.itemId === it.id)}
              unresolved={unresolvedByItem[it.id] ?? 0}
              state={state}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- ReviewItemCard ----------------------------------------------------

function ReviewItemCard({
  item,
  comments,
  unresolved,
  state,
}: {
  item: ReviewItem;
  comments: ReviewComment[];
  unresolved: number;
  state: ReviewBoardState & { refresh: () => void };
}) {
  const { store } = state;
  const [draftBody, setDraftBody] = useState("");
  const [draftAuthor, setDraftAuthor] = useState<ReviewAuthor>("owner");

  function patchItem(patch: Partial<ReviewItem>) {
    if (!store) return;
    const next: ReviewItem = {
      ...item,
      ...patch,
      updatedAt: 0, // signal: stamp at write
    };
    store.upsertItem(next);
    state.refresh();
  }

  function approveAs(author: ReviewAuthor) {
    if (!store) return;
    const now = Date.now();
    store.upsertItem({
      ...item,
      status: "approved",
      approvedBy: author,
      approvedAt: now,
      updatedAt: now,
    });
    state.refresh();
  }

  function addComment() {
    if (!store) return;
    const body = draftBody.trim();
    if (!body) return;
    store.addComment({ itemId: item.id, author: draftAuthor, body });
    setDraftBody("");
    state.refresh();
  }

  // Sort comments newest first by createdAt (no Date.now in render).
  const sortedComments = useMemo(
    () =>
      comments
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)),
    [comments]
  );

  return (
    <li
      className={`hairline rounded-lg bg-ink-900 p-4 ${
        item.critical ? "border-l-2 border-accent" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-100">
            {item.critical ? "★ " : ""}
            {item.title}
            <span className="ml-2 text-xxs uppercase tracking-wide text-ink-500">
              {reviewItemKindLabel(item.kind)}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-300">{item.summary}</p>
        </div>
        <span
          className={`rounded-sm border px-2 py-0.5 text-xxs ${statusPillClass(
            item.status
          )}`}
        >
          {item.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xxs">
        <label className="text-ink-400">
          Status:{" "}
          <select
            className="ml-1 rounded-sm border border-ink-700 bg-ink-800 px-1 py-0.5 text-ink-100"
            value={item.status}
            onChange={(e) =>
              patchItem({ status: e.target.value as ReviewStatus })
            }
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink-400">
          Assigned to:{" "}
          <select
            className="ml-1 rounded-sm border border-ink-700 bg-ink-800 px-1 py-0.5 text-ink-100"
            value={item.assignedTo ?? ""}
            onChange={(e) =>
              patchItem({
                assignedTo: (e.target.value || undefined) as ReviewAuthor | undefined,
              })
            }
          >
            <option value="">— none —</option>
            {AUTHOR_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        {item.status === "approved" && item.approvedBy ? (
          <span className="text-ink-400">
            Approved by <span className="text-ink-200">{item.approvedBy}</span>{" "}
            on {isoDateOnly(item.approvedAt)}
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-ink-500">Quick approve as:</span>
            {AUTHOR_OPTIONS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => approveAs(a.value)}
                className="rounded-sm border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-ink-200 hover:border-emerald-500/40 hover:text-emerald-300"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        {unresolved > 0 ? (
          <span className="rounded-sm border border-amber-500/40 px-2 py-0.5 text-amber-300">
            {unresolved} unresolved comment{unresolved === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <div className="mt-3 border-t border-ink-800 pt-3">
        <p className="mb-2 text-xxs uppercase tracking-wide text-ink-400">
          Comments
        </p>
        {sortedComments.length === 0 ? (
          <p className="text-xxs text-ink-500">No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedComments.map((c) => (
              <li
                key={c.id}
                className="rounded-sm border border-ink-800 bg-ink-950 p-2 text-xs"
              >
                <div className="flex items-baseline gap-2">
                  <span className="rounded-sm border border-ink-700 px-1 py-0.5 text-xxs text-ink-300">
                    {c.author}
                  </span>
                  <span className="text-xxs text-ink-500">
                    {isoDateOnly(c.createdAt)}
                  </span>
                  {c.resolved ? (
                    <span className="rounded-sm border border-emerald-500/40 px-1 py-0.5 text-xxs text-emerald-300">
                      resolved
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-ink-200">{c.body}</p>
                <div className="mt-1 flex gap-2 text-xxs">
                  {!c.resolved ? (
                    <button
                      type="button"
                      onClick={() => {
                        store?.resolveComment(c.id);
                        state.refresh();
                      }}
                      className="text-ink-400 hover:text-emerald-300"
                    >
                      resolve
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      store?.deleteComment(c.id);
                      state.refresh();
                    }}
                    className="text-ink-400 hover:text-rose-300"
                  >
                    delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            className="rounded-sm border border-ink-700 bg-ink-800 px-1 py-0.5 text-xxs text-ink-100"
            value={draftAuthor}
            onChange={(e) => setDraftAuthor(e.target.value as ReviewAuthor)}
          >
            {AUTHOR_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <textarea
            className="flex-1 rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xs text-ink-100 placeholder:text-ink-500"
            rows={1}
            placeholder="Add a comment…"
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
          />
          <button
            type="button"
            onClick={addComment}
            disabled={!draftBody.trim()}
            className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-100 disabled:opacity-50 hover:border-accent hover:text-white"
          >
            Send
          </button>
        </div>
      </div>
    </li>
  );
}

// ---- ClientHandoffPanel ------------------------------------------------
//
// Compact sub-section that filters down to items assigned to the
// client OR comments authored by the client. Read-only view so the
// owner can scan the open client thread at a glance before drilling
// into the full board below.

export function ClientHandoffPanel({
  state,
}: {
  state: ReviewBoardState & { refresh: () => void };
}) {
  const clientItems = useMemo<ReviewItem[]>(
    () => state.items.filter((it) => it.assignedTo === "client"),
    [state.items]
  );
  const clientComments = useMemo<ReviewComment[]>(
    () =>
      state.comments.filter((c) => c.author === "client" && !c.resolved),
    [state.comments]
  );

  if (clientItems.length === 0 && clientComments.length === 0) {
    return (
      <section className="hairline rounded-lg bg-ink-900 p-3 text-xxs text-ink-400">
        Client handoff: no items are assigned to the client yet, and
        there are no open client comments. Assign critical items to the
        client to surface them here.
      </section>
    );
  }

  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-300">
        Client handoff
      </p>
      {clientItems.length > 0 ? (
        <div className="mb-3">
          <p className="text-xxs uppercase tracking-wide text-ink-500">
            Assigned to client
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-xs">
            {clientItems.map((it) => (
              <li key={it.id} className="text-ink-200">
                <span
                  className={`mr-2 inline-block rounded-sm border px-1 py-0.5 text-xxs ${statusPillClass(
                    it.status
                  )}`}
                >
                  {it.status}
                </span>
                <span className="font-medium text-ink-100">{it.title}</span>
                <span className="ml-1 text-ink-400">— {it.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {clientComments.length > 0 ? (
        <div>
          <p className="text-xxs uppercase tracking-wide text-ink-500">
            Open client comments
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-xs">
            {clientComments.map((c) => (
              <li key={c.id} className="text-ink-200">
                <span className="mr-2 text-xxs text-ink-500">
                  {isoDateOnly(c.createdAt)}
                </span>
                {c.body}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
