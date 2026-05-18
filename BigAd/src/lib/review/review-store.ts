// review-store.ts — persistence adapter for the BigAd Review &
// Approval Layer.
//
// Mirrors `src/lib/workspace/project-store.ts`. State lives in
// localStorage under versioned `:v1` keys so future schema bumps can
// migrate without silent loss. The browser adapter is SSR-safe: when
// `window` is undefined, reads return empty arrays and writes are
// no-ops. A second `createMemoryReviewStore()` adapter shares the
// same interface for tests and SSR fallbacks.
//
// No external dependencies. No backend. No telemetry.

import type { SavedRun } from "@/types/workspace";
import type {
  ReviewAuthor,
  ReviewComment,
  ReviewItem,
} from "@/types/review";
import { initialItemsForRun } from "./review-board";

// Versioned localStorage keys. Bump the suffix when the shape changes.
export const STORAGE_KEY_REVIEW_ITEMS = "bigad:review-items:v1";
export const STORAGE_KEY_REVIEW_COMMENTS = "bigad:review-comments:v1";

export interface AddCommentInput {
  itemId: string;
  author: ReviewAuthor;
  body: string;
}

export interface ReviewStore {
  listItems(projectId: string, runId: string): ReviewItem[];
  upsertItem(item: ReviewItem): ReviewItem;
  deleteItem(id: string): void;

  listComments(itemId: string): ReviewComment[];
  addComment(input: AddCommentInput): ReviewComment;
  resolveComment(id: string): void;
  deleteComment(id: string): void;

  // Idempotent: when no items exist for a runId, seed the 10 items
  // (6 critical + 4 non-critical) from the run's strategy. When at
  // least one item already exists, this is a no-op.
  initBoardFromRun(projectId: string, run: SavedRun): void;

  // Cascades comments for items belonging to the run.
  clearForRun(runId: string): void;
}

// ---- Shape validation (defence-in-depth) -------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validateItem(item: ReviewItem): void {
  if (!item || typeof item !== "object") {
    throw new Error("ReviewStore: upsertItem requires a ReviewItem");
  }
  if (!isNonEmptyString(item.id)) {
    throw new Error("ReviewStore: item.id is required");
  }
  if (!isNonEmptyString(item.runId)) {
    throw new Error("ReviewStore: item.runId is required");
  }
  if (!isNonEmptyString(item.kind)) {
    throw new Error("ReviewStore: item.kind is required");
  }
}

function validateCommentInput(input: AddCommentInput): void {
  if (!input || typeof input !== "object") {
    throw new Error("ReviewStore: addComment requires an input object");
  }
  if (!isNonEmptyString(input.itemId)) {
    throw new Error("ReviewStore: comment.itemId is required");
  }
  if (!isNonEmptyString(input.body)) {
    throw new Error("ReviewStore: comment.body must be a non-empty string");
  }
  if (!isNonEmptyString(input.author)) {
    throw new Error("ReviewStore: comment.author is required");
  }
}

// ---- Id generation (local-only — localStorage is per-browser) -----------

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

// ---- Browser adapter ----------------------------------------------------

function hasWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readArray<T>(key: string): T[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, items: T[]): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // localStorage may throw (quota, private mode). Silent fallback.
  }
}

export function createBrowserReviewStore(): ReviewStore {
  return {
    listItems(projectId: string, runId: string): ReviewItem[] {
      void projectId; // projectId is metadata only — items are keyed by runId.
      return readArray<ReviewItem>(STORAGE_KEY_REVIEW_ITEMS).filter(
        (it) => it.runId === runId
      );
    },
    upsertItem(item: ReviewItem): ReviewItem {
      validateItem(item);
      const now = Date.now();
      const all = readArray<ReviewItem>(STORAGE_KEY_REVIEW_ITEMS);
      const idx = all.findIndex((i) => i.id === item.id);
      const next: ReviewItem = {
        ...item,
        updatedAt: item.updatedAt && item.updatedAt > 0 ? item.updatedAt : now,
      };
      // Caller may pre-stamp updatedAt; if not, stamp it.
      if (!item.updatedAt) {
        next.updatedAt = now;
      }
      if (idx >= 0) {
        all[idx] = next;
      } else {
        all.push(next);
      }
      writeArray(STORAGE_KEY_REVIEW_ITEMS, all);
      return next;
    },
    deleteItem(id: string): void {
      const all = readArray<ReviewItem>(STORAGE_KEY_REVIEW_ITEMS).filter(
        (it) => it.id !== id
      );
      writeArray(STORAGE_KEY_REVIEW_ITEMS, all);
      // Cascade — drop comments owned by this item.
      const comments = readArray<ReviewComment>(
        STORAGE_KEY_REVIEW_COMMENTS
      ).filter((c) => c.itemId !== id);
      writeArray(STORAGE_KEY_REVIEW_COMMENTS, comments);
    },
    listComments(itemId: string): ReviewComment[] {
      return readArray<ReviewComment>(STORAGE_KEY_REVIEW_COMMENTS).filter(
        (c) => c.itemId === itemId
      );
    },
    addComment(input: AddCommentInput): ReviewComment {
      validateCommentInput(input);
      const all = readArray<ReviewComment>(STORAGE_KEY_REVIEW_COMMENTS);
      const comment: ReviewComment = {
        id: newId("rcomment"),
        itemId: input.itemId,
        author: input.author,
        body: input.body,
        resolved: false,
        createdAt: Date.now(),
      };
      all.push(comment);
      writeArray(STORAGE_KEY_REVIEW_COMMENTS, all);
      return comment;
    },
    resolveComment(id: string): void {
      const all = readArray<ReviewComment>(STORAGE_KEY_REVIEW_COMMENTS);
      const idx = all.findIndex((c) => c.id === id);
      if (idx < 0) return;
      all[idx] = {
        ...all[idx],
        resolved: true,
        resolvedAt: Date.now(),
      };
      writeArray(STORAGE_KEY_REVIEW_COMMENTS, all);
    },
    deleteComment(id: string): void {
      const all = readArray<ReviewComment>(
        STORAGE_KEY_REVIEW_COMMENTS
      ).filter((c) => c.id !== id);
      writeArray(STORAGE_KEY_REVIEW_COMMENTS, all);
    },
    initBoardFromRun(projectId: string, run: SavedRun): void {
      const existing = readArray<ReviewItem>(
        STORAGE_KEY_REVIEW_ITEMS
      ).filter((it) => it.runId === run.id);
      if (existing.length > 0) return; // idempotent
      const seeded = initialItemsForRun(
        projectId,
        run.id,
        run.strategy,
        Date.now()
      );
      const all = readArray<ReviewItem>(STORAGE_KEY_REVIEW_ITEMS);
      all.push(...seeded);
      writeArray(STORAGE_KEY_REVIEW_ITEMS, all);
    },
    clearForRun(runId: string): void {
      const items = readArray<ReviewItem>(STORAGE_KEY_REVIEW_ITEMS);
      const toDrop = new Set(
        items.filter((it) => it.runId === runId).map((it) => it.id)
      );
      const keptItems = items.filter((it) => it.runId !== runId);
      writeArray(STORAGE_KEY_REVIEW_ITEMS, keptItems);
      const comments = readArray<ReviewComment>(
        STORAGE_KEY_REVIEW_COMMENTS
      ).filter((c) => !toDrop.has(c.itemId));
      writeArray(STORAGE_KEY_REVIEW_COMMENTS, comments);
    },
  };
}

// ---- Memory adapter ----------------------------------------------------
//
// Same interface, backed by in-memory arrays. Used for SSR (where
// localStorage isn't available) and the test-logic harness.

export function createMemoryReviewStore(): ReviewStore {
  let items: ReviewItem[] = [];
  let comments: ReviewComment[] = [];

  return {
    listItems(projectId: string, runId: string): ReviewItem[] {
      void projectId;
      return items.filter((it) => it.runId === runId);
    },
    upsertItem(item: ReviewItem): ReviewItem {
      validateItem(item);
      const now = Date.now();
      const idx = items.findIndex((i) => i.id === item.id);
      const next: ReviewItem = {
        ...item,
        updatedAt: item.updatedAt && item.updatedAt > 0 ? item.updatedAt : now,
      };
      if (!item.updatedAt) {
        next.updatedAt = now;
      }
      if (idx >= 0) {
        items[idx] = next;
      } else {
        items.push(next);
      }
      return next;
    },
    deleteItem(id: string): void {
      items = items.filter((it) => it.id !== id);
      comments = comments.filter((c) => c.itemId !== id);
    },
    listComments(itemId: string): ReviewComment[] {
      return comments.filter((c) => c.itemId === itemId);
    },
    addComment(input: AddCommentInput): ReviewComment {
      validateCommentInput(input);
      const comment: ReviewComment = {
        id: newId("rcomment"),
        itemId: input.itemId,
        author: input.author,
        body: input.body,
        resolved: false,
        createdAt: Date.now(),
      };
      comments.push(comment);
      return comment;
    },
    resolveComment(id: string): void {
      const idx = comments.findIndex((c) => c.id === id);
      if (idx < 0) return;
      comments[idx] = {
        ...comments[idx],
        resolved: true,
        resolvedAt: Date.now(),
      };
    },
    deleteComment(id: string): void {
      comments = comments.filter((c) => c.id !== id);
    },
    initBoardFromRun(projectId: string, run: SavedRun): void {
      const existing = items.filter((it) => it.runId === run.id);
      if (existing.length > 0) return;
      const seeded = initialItemsForRun(
        projectId,
        run.id,
        run.strategy,
        Date.now()
      );
      items.push(...seeded);
    },
    clearForRun(runId: string): void {
      const toDrop = new Set(
        items.filter((it) => it.runId === runId).map((it) => it.id)
      );
      items = items.filter((it) => it.runId !== runId);
      comments = comments.filter((c) => !toDrop.has(c.itemId));
    },
  };
}
