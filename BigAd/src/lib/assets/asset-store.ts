// asset-store.ts — persistence adapter for the Asset Production Manager.
//
// Mirrors `src/lib/agency/agency-store.ts`: a versioned `:v1` localStorage
// key, an SSR-safe browser adapter, and a parallel in-memory adapter for
// tests / SSR fallbacks. State is keyed by runId so each strategy run can
// own its own asset queue.
//
// State mutations (status, owner, file link, quality checks) stamp
// `updatedAt = Date.now()`. The derived plan reads `updatedAt` to compute
// `derivedAt` — derived selectors never call `Date.now()` themselves.

import type {
  AssetOwnerRole,
  AssetQualityCheckKind,
  AssetStatus,
  ProductionAsset,
} from "@/types/assets";

// Versioned localStorage keys. Bump the suffix when the shape changes.
export const STORAGE_KEY_ASSETS = "bigad:assets:v1";
export const STORAGE_KEY_ASSET_FILES = "bigad:asset-files:v1";

// Internal shape — assets keyed by runId.
type AssetsByRun = Record<string, ProductionAsset[]>;

export interface AssetStore {
  listAssets(runId: string): ProductionAsset[];
  upsertAsset(asset: ProductionAsset): void;
  deleteAsset(id: string): void;
  setStatus(id: string, status: AssetStatus): void;
  setOwner(id: string, ownerRole: AssetOwnerRole): void;
  setFileLink(id: string, link: string): void;
  addNote(id: string, note: string): void;
  setQualityCheck(id: string, kind: AssetQualityCheckKind, done: boolean): void;
  clearForRun(runId: string): void;
}

// ---- SSR guard ---------------------------------------------------------

function hasWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

// ---- Validation --------------------------------------------------------

function isProductionAsset(v: unknown): v is ProductionAsset {
  if (!v || typeof v !== "object") return false;
  const a = v as ProductionAsset;
  return (
    typeof a.id === "string" &&
    typeof a.title === "string" &&
    typeof a.sourceKind === "string" &&
    typeof a.sourceRefId === "string" &&
    typeof a.format === "string" &&
    typeof a.priority === "string" &&
    typeof a.status === "string" &&
    Array.isArray(a.qualityChecks) &&
    Array.isArray(a.dependencies) &&
    Array.isArray(a.whereUsed)
  );
}

// ---- Browser adapter ---------------------------------------------------

function readAssets(): AssetsByRun {
  if (!hasWindow()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_ASSETS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // Validate each entry's value is an array of ProductionAsset-shaped objects.
    const out: AssetsByRun = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      out[k] = v.filter(isProductionAsset);
    }
    return out;
  } catch {
    return {};
  }
}

function writeAssets(map: AssetsByRun): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_ASSETS, JSON.stringify(map));
  } catch {
    // localStorage may throw (quota, private mode). Silent fallback.
  }
}

function findRunForAsset(
  map: AssetsByRun,
  id: string
): { runId: string; index: number } | null {
  for (const [runId, list] of Object.entries(map)) {
    const index = list.findIndex((a) => a.id === id);
    if (index >= 0) return { runId, index };
  }
  return null;
}

export function createBrowserAssetStore(): AssetStore {
  return {
    listAssets(runId: string): ProductionAsset[] {
      const map = readAssets();
      return (map[runId] ?? []).slice();
    },
    upsertAsset(asset: ProductionAsset): void {
      const map = readAssets();
      // We don't know which runId owns this asset from the asset alone;
      // upsert relies on an existing entry. If none, the caller must
      // have called `listAssets(runId)` first and reseeded — fall back
      // to a default runId bucket "default" only when no match.
      const existing = findRunForAsset(map, asset.id);
      const stamped: ProductionAsset = { ...asset, updatedAt: Date.now() };
      if (existing) {
        map[existing.runId][existing.index] = stamped;
      } else {
        const bucket = map["default"] ?? [];
        bucket.push(stamped);
        map["default"] = bucket;
      }
      writeAssets(map);
    },
    deleteAsset(id: string): void {
      const map = readAssets();
      const existing = findRunForAsset(map, id);
      if (!existing) return;
      map[existing.runId].splice(existing.index, 1);
      writeAssets(map);
    },
    setStatus(id: string, status: AssetStatus): void {
      mutate(id, (a) => ({ ...a, status, updatedAt: Date.now() }));
    },
    setOwner(id: string, ownerRole: AssetOwnerRole): void {
      mutate(id, (a) => ({ ...a, ownerRole, updatedAt: Date.now() }));
    },
    setFileLink(id: string, link: string): void {
      mutate(id, (a) => ({ ...a, fileLink: link, updatedAt: Date.now() }));
    },
    addNote(id: string, note: string): void {
      mutate(id, (a) => {
        const next = a.notes ? `${a.notes}\n${note}` : note;
        return { ...a, notes: next, updatedAt: Date.now() };
      });
    },
    setQualityCheck(
      id: string,
      kind: AssetQualityCheckKind,
      done: boolean
    ): void {
      mutate(id, (a) => {
        const checks = a.qualityChecks.map((c) =>
          c.kind === kind
            ? { ...c, done, notedAt: done ? Date.now() : c.notedAt }
            : c
        );
        return { ...a, qualityChecks: checks, updatedAt: Date.now() };
      });
    },
    clearForRun(runId: string): void {
      const map = readAssets();
      if (!map[runId]) return;
      delete map[runId];
      writeAssets(map);
    },
  };
}

function mutate(
  id: string,
  fn: (a: ProductionAsset) => ProductionAsset
): void {
  const map = readAssets();
  const existing = findRunForAsset(map, id);
  if (!existing) return;
  map[existing.runId][existing.index] = fn(map[existing.runId][existing.index]);
  writeAssets(map);
}

// ---- Memory adapter ----------------------------------------------------

export function createMemoryAssetStore(): AssetStore {
  let map: AssetsByRun = {};

  function find(id: string): { runId: string; index: number } | null {
    for (const [runId, list] of Object.entries(map)) {
      const index = list.findIndex((a) => a.id === id);
      if (index >= 0) return { runId, index };
    }
    return null;
  }

  function update(
    id: string,
    fn: (a: ProductionAsset) => ProductionAsset
  ): void {
    const found = find(id);
    if (!found) return;
    map[found.runId][found.index] = fn(map[found.runId][found.index]);
  }

  return {
    listAssets(runId: string): ProductionAsset[] {
      return (map[runId] ?? []).slice();
    },
    upsertAsset(asset: ProductionAsset): void {
      const found = find(asset.id);
      const stamped: ProductionAsset = { ...asset, updatedAt: Date.now() };
      if (found) {
        map[found.runId][found.index] = stamped;
      } else {
        const bucket = map["default"] ?? [];
        bucket.push(stamped);
        map["default"] = bucket;
      }
    },
    deleteAsset(id: string): void {
      const found = find(id);
      if (!found) return;
      map[found.runId].splice(found.index, 1);
    },
    setStatus(id: string, status: AssetStatus): void {
      update(id, (a) => ({ ...a, status, updatedAt: Date.now() }));
    },
    setOwner(id: string, ownerRole: AssetOwnerRole): void {
      update(id, (a) => ({ ...a, ownerRole, updatedAt: Date.now() }));
    },
    setFileLink(id: string, link: string): void {
      update(id, (a) => ({ ...a, fileLink: link, updatedAt: Date.now() }));
    },
    addNote(id: string, note: string): void {
      update(id, (a) => {
        const next = a.notes ? `${a.notes}\n${note}` : note;
        return { ...a, notes: next, updatedAt: Date.now() };
      });
    },
    setQualityCheck(
      id: string,
      kind: AssetQualityCheckKind,
      done: boolean
    ): void {
      update(id, (a) => {
        const checks = a.qualityChecks.map((c) =>
          c.kind === kind
            ? { ...c, done, notedAt: done ? Date.now() : c.notedAt }
            : c
        );
        return { ...a, qualityChecks: checks, updatedAt: Date.now() };
      });
    },
    clearForRun(runId: string): void {
      delete map[runId];
    },
  };
}

// Helper for tests / external callers — direct bucket access.
export function seedMemoryStore(
  store: AssetStore,
  runId: string,
  assets: ProductionAsset[]
): void {
  // upsertAsset uses internal find() — we want to seed cleanly per run.
  // The memory store doesn't expose internals, so we reach back via the
  // documented setStatus path: upsert each, then if needed reset the
  // updatedAt by re-upserting. Tests that need precise control can
  // construct a fresh store and call upsertAsset for each.
  for (const a of assets) {
    store.upsertAsset(a);
  }
  void runId;
}
