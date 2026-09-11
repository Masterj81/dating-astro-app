// JUNO-09 — what the media purge will and will not delete.
//
// WHY THIS SUITE EXISTS
// ---------------------
// All three deletion paths called `auth.admin.deleteUser()` and nothing else.
// The FK cascade removes `profiles` and everything hanging off it; it removes no
// storage object, because `storage.objects` has no foreign key to `auth.users`.
// Five objects were still in storage from accounts that no longer existed, the
// oldest from 1 February 2026, and one of them was a video of someone's face —
// deleted by the phase C campaign on 11 Sep 2026. This suite is phase B: what
// happens to the media of every account deleted from now on.
//
// The suite executes the REAL functions extracted from the deployed sources —
// `supabase/functions/purge-user-media/index.ts` and the two executors — rather
// than a second copy of them. A copy would pass forever while the deployed code
// drifted, which is the failure mode this repository has already lived through
// twice (two ephemerides, two tarot decks).
//
// The negative cases are the point. "Does it delete the user's avatar?" is the
// half you find out by using the product. "Does it refuse a path it cannot prove
// is owned?" is the half that only fails in production, silently, on someone
// else's data.
//
// A NOTE ON WHAT THESE TESTS ARE NOT
// ----------------------------------
// The storage client is a fake. That makes these tests proof of the DECISIONS —
// which paths are built, which are refused, what happens on a timeout, what the
// job status becomes — and NOT proof that Supabase Storage behaves as modelled.
// The behaviour of the real service is proved by the controlled verification in
// docs/runbooks/media-purge-2026-09.md §6, against a real account, once.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { cleanupEdgeModules, loadEdgeModule, readRepoFile } from '../../testing/edge-source';

const PURGE_FILE = 'supabase/functions/purge-user-media/index.ts';
const CRON_FILE = 'supabase/functions/process-expired-deletions/index.ts';
// Les helpers vivent dans un module et non dans la route : un `route.ts` de
// l App Router ne peut exporter que ses gestionnaires HTTP, et le typecheck le
// refuse autrement. Le fait que la route delegue est asserte par
// scripts/validate-media-purge.mjs, pas ici.
const WEB_FILE = 'apps/web/src/lib/media-purge.ts';
const DETECTOR = 'supabase/tests/diagnose_media_ownership.sql';
const TABLE_MIGRATION = 'supabase/migrations/20260910000002_media_purge_jobs.sql';

const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-8888-4777-8666-555555555555';

interface CategoryResult {
  found: number;
  deleted: number;
  failed: number;
  done: boolean;
}

type PurgeModule = {
  PURGE_SECRET_ENV: string;
  PURGE_SECRET_HEADER: string;
  MIN_SECRET_LENGTH: number;
  RATE_LIMIT_MAX_PER_HOUR: number;
  RATE_LIMIT_WINDOW_SECONDS: number;
  PURGE_BUCKETS: readonly string[];
  LIST_PAGE_SIZE: number;
  REMOVE_BATCH_SIZE: number;
  MAX_DEPTH: number;
  USER_BUDGET_MS: number;
  RESUME_BUDGET_MS: number;
  RESUME_DEFAULT_LIMIT: number;
  RESUME_MAX_LIMIT: number;
  ERROR_CLASSES: readonly string[];
  UNAUTHORIZED: { status: number; error: string };
  NOT_CONFIGURED: { status: number; error: string };
  RATE_LIMITED: { status: number; error: string };
  RATE_LIMIT_UNAVAILABLE: { status: number; error: string };
  BAD_REQUEST: { status: number; error: string };
  constantTimeEqual: (a: string, b: string) => boolean;
  isStrictUuid: (value: unknown) => boolean;
  classifyStorageError: (message: unknown) => string;
  buildOwnedPath: (userId: string, prefix: string, name: unknown) => string | null;
  chunk: <T>(items: readonly T[], size: number) => T[][];
  purgeBucketForUser: (
    deps: unknown, bucket: string, userId: string, deadline: number,
  ) => Promise<{ result: CategoryResult; errorClass: string | null }>;
  purgeUserMedia: (
    deps: unknown, userId: string, deadline: number,
  ) => Promise<{
    perCategory: Record<string, CategoryResult>;
    done: boolean;
    errorClass: string | null;
  }>;
  parsePurgeRequest: (body: unknown) => Record<string, unknown>;
  authorizePurgeRequest: (
    deps: unknown, provided: string | null, address: string,
  ) => Promise<{ ok: boolean; status?: number; error?: string }>;
  clientAddressOf: (req: { headers: { get: (k: string) => string | null } }) => string;
};

type CronModule = {
  PURGE_FUNCTION_PATH: string;
  requestMediaPurge: (
    userId: string,
    deps: { baseUrl: string; secret: string; fetchImpl: unknown },
  ) => Promise<{ jobCreated: boolean; done: boolean; errorClass: string | null }>;
};

type WebModule = {
  PURGE_FUNCTION_PATH: string;
  requestMediaPurge: (
    userId: string,
    deps: { baseUrl: string; secret: string; fetchImpl: unknown },
  ) => Promise<{ jobCreated: boolean; done: boolean }>;
  deletionEmailText: (purgeComplete: boolean) => string;
};

let purge: PurgeModule;
let cron: CronModule;
let web: WebModule;

beforeAll(async () => {
  purge = await loadEdgeModule<PurgeModule>({
    file: PURGE_FILE,
    label: 'purge-user-media',
    declarations: [
      'PURGE_SECRET_ENV', 'PURGE_SECRET_HEADER', 'MIN_SECRET_LENGTH',
      'RATE_LIMIT_MAX_PER_HOUR', 'RATE_LIMIT_WINDOW_SECONDS',
      'PURGE_BUCKETS', 'LIST_PAGE_SIZE', 'REMOVE_BATCH_SIZE', 'MAX_DEPTH',
      'USER_BUDGET_MS', 'RESUME_BUDGET_MS', 'RESUME_DEFAULT_LIMIT', 'RESUME_MAX_LIMIT',
      'ERROR_CLASSES',
      'UNAUTHORIZED', 'NOT_CONFIGURED', 'RATE_LIMITED', 'RATE_LIMIT_UNAVAILABLE', 'BAD_REQUEST',
      'constantTimeEqual', 'isStrictUuid', 'classifyStorageError',
      'buildOwnedPath', 'chunk',
      'purgeBucketForUser', 'purgeUserMedia',
      'parsePurgeRequest', 'authorizePurgeRequest', 'clientAddressOf',
    ],
  });

  cron = await loadEdgeModule<CronModule>({
    file: CRON_FILE,
    label: 'expired-deletions-purge',
    declarations: ['PURGE_FUNCTION_PATH', 'requestMediaPurge'],
  });

  web = await loadEdgeModule<WebModule>({
    file: WEB_FILE,
    label: 'web-confirm-deletion',
    declarations: ['PURGE_FUNCTION_PATH', 'requestMediaPurge', 'deletionEmailText'],
  });
});

afterAll(() => cleanupEdgeModules());

// ---------------------------------------------------------------------------
// A storage double.
//
// It models the two behaviours the purge depends on and nothing else: `list`
// returns LEAF NAMES relative to the prefix with `id: null` marking a
// pseudo-folder, and `remove` succeeds for a path that was never there. That
// second one is not a convenience — it is why "already deleted" is an idempotent
// success rather than a fatal error.
// ---------------------------------------------------------------------------
interface FakeOptions {
  listError?: Record<string, string>;
  removeError?: Record<string, string>;
  /**
   * Extra raw entry names injected verbatim into one listing.
   *
   * Keyed `bucket:prefix`, not `prefix` alone. Keying on the prefix injected the
   * same hostile entries into all three buckets, so a test that meant "the
   * avatars listing returns a traversing name" was really asserting it of every
   * bucket at once — the assertion passed while saying less than it appeared to.
   */
  inject?: Record<string, string[]>;
  clock?: { value: number };
}

function fakeStorage(objects: Record<string, string[]>, options: FakeOptions = {}) {
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const listCalls: Array<{ bucket: string; prefix: string; offset: number }> = [];
  const live: Record<string, Set<string>> = {};
  for (const [bucket, paths] of Object.entries(objects)) live[bucket] = new Set(paths);

  const bucket = (name: string) => ({
    list: async (prefix: string, opts: { limit: number; offset: number }) => {
      listCalls.push({ bucket: name, prefix, offset: opts.offset });
      if (options.listError?.[name]) {
        return { data: null, error: { message: options.listError[name] } };
      }
      const set = live[name];
      if (!set) return { data: null, error: { message: 'Bucket not found' } };

      const files = new Set<string>();
      const folders = new Set<string>();
      for (const path of set) {
        if (!path.startsWith(`${prefix}/`)) continue;
        const rest = path.slice(prefix.length + 1);
        const slash = rest.indexOf('/');
        if (slash === -1) files.add(rest);
        else folders.add(rest.slice(0, slash));
      }
      const entries = [
        ...[...folders].sort().map((n) => ({ name: n, id: null })),
        ...[...files].sort().map((n) => ({ name: n, id: `id-${n}` })),
        ...(options.inject?.[`${name}:${prefix}`] ?? []).map((n) => ({ name: n, id: `id-${n}` })),
      ];
      return {
        data: entries.slice(opts.offset, opts.offset + opts.limit),
        error: null,
      };
    },
    remove: async (paths: string[]) => {
      if (options.removeError?.[name]) {
        return { data: null, error: { message: options.removeError[name] } };
      }
      removed.push({ bucket: name, paths: [...paths] });
      for (const path of paths) live[name]?.delete(path);
      return { data: paths.map((p) => ({ name: p })), error: null };
    },
  });

  const clock = options.clock ?? { value: 0 };
  return {
    deps: { bucket, now: () => clock.value },
    removed,
    listCalls,
    live,
    clock,
    removedPaths: () => removed.flatMap((r) => r.paths),
  };
}

const FAR = Number.MAX_SAFE_INTEGER;
const empty = { avatars: [], 'voice-intros': [], verifications: [] } as Record<string, string[]>;

// ===========================================================================
// 1-6 · the ordinary shapes, and idempotence
// ===========================================================================
describe('JUNO-09 · ordinary purges', () => {
  it('1 · a user with no media completes cleanly, deleting nothing', async () => {
    const store = fakeStorage({ ...empty });
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.done).toBe(true);
    expect(out.errorClass).toBeNull();
    expect(store.removedPaths()).toEqual([]);
    for (const bucket of purge.PURGE_BUCKETS) {
      expect(out.perCategory[bucket]).toEqual({ found: 0, deleted: 0, failed: 0, done: true });
    }
  });

  it('2 · one object in each category', async () => {
    const store = fakeStorage({
      avatars: [`${USER}/avatar.jpg`],
      'voice-intros': [`${USER}/voice.m4a`],
      verifications: [`${USER}/face.mp4`],
    });
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.done).toBe(true);
    expect(store.removedPaths().sort()).toEqual([
      `${USER}/avatar.jpg`, `${USER}/face.mp4`, `${USER}/voice.m4a`,
    ].sort());
    // The most sensitive category is the one that must be provably gone.
    expect(out.perCategory.verifications).toEqual(
      { found: 1, deleted: 1, failed: 0, done: true },
    );
  });

  it('3 · several objects in one category', async () => {
    const paths = Array.from({ length: 7 }, (_, i) => `${USER}/photo_${i}.jpg`);
    const store = fakeStorage({ ...empty, avatars: paths });
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.perCategory.avatars.found).toBe(7);
    expect(out.perCategory.avatars.deleted).toBe(7);
    expect(store.removedPaths().sort()).toEqual([...paths].sort());
  });

  it('4 · an object already absent is an idempotent success, never fatal', async () => {
    const store = fakeStorage({ ...empty, avatars: [`${USER}/a.jpg`] });
    await purge.purgeUserMedia(store.deps, USER, FAR);
    // Second pass: storage is empty, and this must NOT be an error.
    const second = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(second.done).toBe(true);
    expect(second.errorClass).toBeNull();
    expect(second.perCategory.avatars).toEqual(
      { found: 0, deleted: 0, failed: 0, done: true },
    );
  });

  it('5 · a duplicated database reference cannot double-delete an object', async () => {
    // The purge never reads `profiles`: it enumerates storage. Two profile rows
    // pointing at the same object therefore produce ONE removal, structurally.
    const store = fakeStorage({ ...empty, avatars: [`${USER}/shared.jpg`] });
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.perCategory.avatars.deleted).toBe(1);
    expect(store.removedPaths()).toEqual([`${USER}/shared.jpg`]);
  });

  it('6 · replaying the identical purge changes nothing', async () => {
    const store = fakeStorage({
      avatars: [`${USER}/a.jpg`, `${USER}/b.jpg`],
      'voice-intros': [`${USER}/v.m4a`],
      verifications: [],
    });
    const first = await purge.purgeUserMedia(store.deps, USER, FAR);
    const removedAfterFirst = store.removedPaths().length;
    const second = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(first.done).toBe(true);
    expect(second.done).toBe(true);
    expect(store.removedPaths().length).toBe(removedAfterFirst);
  });
});

// ===========================================================================
// 7-10 · interruption, resumption, and failure that must not cascade
// ===========================================================================
describe('JUNO-09 · interruption and resumption', () => {
  it('7 · a timeout mid-walk leaves the job unfinished rather than claiming success', async () => {
    const clock = { value: 0 };
    const store = fakeStorage(
      { ...empty, avatars: [`${USER}/a.jpg`] },
      { clock },
    );
    // Deadline already passed: the walk cannot even begin.
    const out = await purge.purgeUserMedia(store.deps, USER, 0);

    expect(out.done).toBe(false);
    expect(out.errorClass).toBe('timeout');
    expect(store.removedPaths()).toEqual([]);
    void clock;
  });

  it('8 · the pass after a timeout finishes the work', async () => {
    const clock = { value: 0 };
    const store = fakeStorage({ ...empty, avatars: [`${USER}/a.jpg`] }, { clock });

    const first = await purge.purgeUserMedia(store.deps, USER, 0);
    expect(first.done).toBe(false);
    expect(store.live.avatars.size).toBe(1);

    const second = await purge.purgeUserMedia(store.deps, USER, FAR);
    expect(second.done).toBe(true);
    expect(second.errorClass).toBeNull();
    expect(store.live.avatars.size).toBe(0);
  });

  it('9 · a transient storage error loses no state and never reports done', async () => {
    const store = fakeStorage(
      { ...empty, avatars: [`${USER}/a.jpg`] },
      { listError: { avatars: 'fetch failed: connection reset' } },
    );
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.done).toBe(false);
    expect(out.errorClass).toBe('storage_unavailable');
    // The object is still there, and the job is still open: nothing was lost.
    expect(store.live.avatars.size).toBe(1);
  });

  it('10 · a missing bucket does not cancel the other categories', async () => {
    const store = fakeStorage({
      // `voice-intros` deliberately absent from the double.
      avatars: [`${USER}/a.jpg`],
      verifications: [`${USER}/face.mp4`],
    });
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.perCategory['voice-intros'].done).toBe(false);
    expect(out.errorClass).toBe('bucket_missing');
    // The two reachable buckets were still cleaned — including the sensitive one.
    expect(out.perCategory.avatars.deleted).toBe(1);
    expect(out.perCategory.verifications.deleted).toBe(1);
    expect(out.done).toBe(false);
  });

  it('9b · a remove failure counts as failed and keeps the job open', async () => {
    const store = fakeStorage(
      { ...empty, avatars: [`${USER}/a.jpg`] },
      { removeError: { avatars: 'Timeout while deleting object' } },
    );
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.perCategory.avatars).toMatchObject({ found: 1, deleted: 0, failed: 1, done: false });
    expect(out.errorClass).toBe('timeout');
  });
});

// ===========================================================================
// 11-13 · ownership. The tests that matter most.
// ===========================================================================
describe('JUNO-09 · ownership is proved, never matched', () => {
  it('11 · a legacy path one folder deeper is still owned and still purged', async () => {
    const store = fakeStorage({ ...empty, avatars: [`${USER}/2024/old.jpg`] });
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.perCategory.avatars.deleted).toBe(1);
    expect(store.removedPaths()).toEqual([`${USER}/2024/old.jpg`]);
    expect(out.done).toBe(true);
  });

  it('12 · a malformed or traversing entry name is REFUSED, never removed', async () => {
    const store = fakeStorage(
      { ...empty, avatars: [`${USER}/legit.jpg`] },
      { inject: { [`avatars:${USER}`]: ['..', '.', ''] } },
    );
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.perCategory.avatars.done).toBe(false);
    expect(out.errorClass).toBe('ambiguous_ownership');
    // The legitimate object still went; the ambiguous ones did not.
    expect(store.removedPaths()).toEqual([`${USER}/legit.jpg`]);
  });

  it("13 · an entry crafted to reach another user's folder is refused", async () => {
    const store = fakeStorage(
      { ...empty, avatars: [`${USER}/mine.jpg`, `${OTHER}/theirs.jpg`] },
      { inject: { [`avatars:${USER}`]: [`../${OTHER}/theirs.jpg`] } },
    );
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    const removed = store.removedPaths();
    expect(removed).toEqual([`${USER}/mine.jpg`]);
    expect(removed.some((p) => p.includes(OTHER))).toBe(false);
    // The other account's object is untouched.
    expect(store.live.avatars.has(`${OTHER}/theirs.jpg`)).toBe(true);
    expect(out.errorClass).toBe('ambiguous_ownership');
  });

  it('13b · buildOwnedPath rejects every shape that cannot be proved owned', () => {
    expect(purge.buildOwnedPath(USER, USER, 'a.jpg')).toBe(`${USER}/a.jpg`);
    // Case-insensitive: a UUID is hex, and Postgres renders it lowercase.
    expect(purge.buildOwnedPath(USER, USER.toUpperCase(), 'a.jpg')).not.toBeNull();

    expect(purge.buildOwnedPath(USER, OTHER, 'a.jpg')).toBeNull();
    expect(purge.buildOwnedPath(USER, USER, '../x/a.jpg')).toBeNull();
    expect(purge.buildOwnedPath(USER, USER, '..')).toBeNull();
    expect(purge.buildOwnedPath(USER, USER, '.')).toBeNull();
    expect(purge.buildOwnedPath(USER, USER, '')).toBeNull();
    expect(purge.buildOwnedPath(USER, USER, null)).toBeNull();
    expect(purge.buildOwnedPath(USER, '', 'a.jpg')).toBeNull();
    expect(purge.buildOwnedPath('not-a-uuid', 'not-a-uuid', 'a.jpg')).toBeNull();
    // Deeper than MAX_DEPTH below the prefix.
    const deep = Array.from({ length: purge.MAX_DEPTH + 2 }, () => 'x').join('/');
    expect(purge.buildOwnedPath(USER, `${USER}/${deep}`, 'a.jpg')).toBeNull();
  });

  it('13c · the seed objects at the bucket root are unreachable by construction', async () => {
    // scripts/seed-profile-photos.js writes `seed-{uuid}.jpg` AT THE ROOT. A
    // naive `path.includes(uuid)` would treat 60 of them as user media. The
    // purge lists a PREFIX, so they are never even enumerated.
    const store = fakeStorage({
      ...empty,
      avatars: [`seed-${USER}.jpg`, `${USER}/real.jpg`],
    });
    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(store.removedPaths()).toEqual([`${USER}/real.jpg`]);
    expect(store.live.avatars.has(`seed-${USER}.jpg`)).toBe(true);
    expect(out.done).toBe(true);
  });

  it('13d · a strict UUID is required, anchored at both ends', () => {
    expect(purge.isStrictUuid(USER)).toBe(true);
    expect(purge.isStrictUuid(USER.toUpperCase())).toBe(true);
    expect(purge.isStrictUuid(`../../${USER}`)).toBe(false);
    expect(purge.isStrictUuid(`${USER}/x`)).toBe(false);
    expect(purge.isStrictUuid(`x${USER}`)).toBe(false);
    expect(purge.isStrictUuid('')).toBe(false);
    expect(purge.isStrictUuid(null)).toBe(false);
    expect(purge.isStrictUuid(12345)).toBe(false);
    // A v1 or v7 id must remain purgeable: rejecting it would silently skip a
    // real reader's media.
    expect(purge.isStrictUuid('11111111-2222-1333-8444-555555555555')).toBe(true);
    expect(purge.isStrictUuid('11111111-2222-7333-8444-555555555555')).toBe(true);
  });
});

// ===========================================================================
// 14-16 · the gate on account deletion
// ===========================================================================
describe('JUNO-09 · the job row gates the irreversible act', () => {
  function fakeFetch(response: { ok: boolean; status?: number; body?: unknown }) {
    return vi.fn(async () => ({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.body,
    })) as unknown as typeof fetch;
  }

  it('14 · a created job and a complete purge allow the deletion', async () => {
    const out = await cron.requestMediaPurge(USER, {
      baseUrl: 'https://x.supabase.co',
      secret: 'y'.repeat(64),
      fetchImpl: fakeFetch({ ok: true, body: { jobCreated: true, done: true, errorClass: null } }),
    });
    expect(out).toEqual({ jobCreated: true, done: true, errorClass: null });
  });

  it('15 · an INCOMPLETE purge still allows the deletion, and keeps the job', async () => {
    // The reader asked for their account to be deleted. Refusing because object
    // storage is unwell would be a worse failure than the one being fixed.
    const out = await cron.requestMediaPurge(USER, {
      baseUrl: 'https://x.supabase.co',
      secret: 'y'.repeat(64),
      fetchImpl: fakeFetch({
        ok: true,
        body: { jobCreated: true, done: false, errorClass: 'storage_unavailable' },
      }),
    });
    expect(out.jobCreated).toBe(true);
    expect(out.done).toBe(false);
  });

  it('16 · every failure to create the job forbids the deletion', async () => {
    const base = { baseUrl: 'https://x.supabase.co', secret: 'y'.repeat(64) };

    const cases: Array<[string, unknown]> = [
      ['non-2xx', fakeFetch({ ok: false, status: 500, body: {} })],
      ['jobCreated false', fakeFetch({ ok: true, body: { jobCreated: false } })],
      ['jobCreated absent', fakeFetch({ ok: true, body: { ok: true } })],
      ['body not JSON', vi.fn(async () => ({
        ok: true, status: 200, json: async () => { throw new Error('nope'); },
      }))],
      ['fetch throws', vi.fn(async () => { throw new Error('ECONNREFUSED'); })],
    ];

    for (const [label, fetchImpl] of cases) {
      const out = await cron.requestMediaPurge(USER, { ...base, fetchImpl });
      expect(out.jobCreated, label).toBe(false);
    }

    // An unset secret must refuse without even calling out.
    const never = vi.fn();
    const unset = await cron.requestMediaPurge(USER, {
      baseUrl: 'https://x.supabase.co', secret: '', fetchImpl: never,
    });
    expect(unset.jobCreated).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });

  it('16b · the web route gates identically, and both target the same function', async () => {
    expect(web.PURGE_FUNCTION_PATH).toBe(cron.PURGE_FUNCTION_PATH);
    expect(web.PURGE_FUNCTION_PATH).toBe('/functions/v1/purge-user-media');

    const refused = await web.requestMediaPurge(USER, {
      baseUrl: 'https://x.supabase.co',
      secret: 'y'.repeat(64),
      fetchImpl: fakeFetch({ ok: true, body: { jobCreated: false } }),
    });
    expect(refused.jobCreated).toBe(false);

    const allowed = await web.requestMediaPurge(USER, {
      baseUrl: 'https://x.supabase.co',
      secret: 'y'.repeat(64),
      fetchImpl: fakeFetch({ ok: true, body: { jobCreated: true, done: true } }),
    });
    expect(allowed).toEqual({ jobCreated: true, done: true });
  });

  it('16c · both executors send the secret header and one validated user id', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const capture = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ jobCreated: true, done: true }) };
    }) as unknown as typeof fetch;

    await cron.requestMediaPurge(USER, {
      baseUrl: 'https://x.supabase.co', secret: 'z'.repeat(64), fetchImpl: capture,
    });
    await web.requestMediaPurge(USER, {
      baseUrl: 'https://x.supabase.co', secret: 'z'.repeat(64), fetchImpl: capture,
    });

    expect(seen).toHaveLength(2);
    for (const call of seen) {
      expect(call.url).toBe('https://x.supabase.co/functions/v1/purge-user-media');
      const headers = call.init.headers as Record<string, string>;
      expect(headers['x-media-purge-secret']).toBe('z'.repeat(64));
      const body = JSON.parse(call.init.body as string);
      expect(body.userId).toBe(USER);
      // Never a path, never a bucket, never a prefix.
      expect(Object.keys(body).sort()).toEqual(['requestedBy', 'userId']);
    }
    expect(JSON.parse(seen[0].init.body as string).requestedBy).toBe('mobile_cron');
    expect(JSON.parse(seen[1].init.body as string).requestedBy).toBe('web_immediate');
  });
});

// ===========================================================================
// 17-18 · the historical detector, read-only by construction
// ===========================================================================
describe('JUNO-09 · the orphan detector stays read-only', () => {
  const sql = readRepoFile(DETECTOR);

  it('17 · it reports objects whose owning account no longer exists', () => {
    expect(sql).toMatch(/account_exists/);
    expect(sql).toMatch(/NOT account_exists/);
    expect(sql).toMatch(/auth\.users/);
    // And it isolates the most sensitive category on its own line.
    expect(sql).toMatch(/verifications/);
  });

  it('18 · it also reports profile references, so a broken one is visible', () => {
    expect(sql).toMatch(/voice_intro_url/);
    expect(sql).toMatch(/verification_video_url/);
    expect(sql).toMatch(/image_url/);
  });

  it('18b · it contains no destructive statement, in any spelling', () => {
    const code = sql
      .replace(/--.*$/gm, '')
      .replace(/'[^']*'/g, "''");
    for (const verb of [
      /\bDELETE\s+FROM\b/i, /\bDROP\s+(TABLE|SCHEMA|FUNCTION)\b/i,
      /\bTRUNCATE\b/i, /\bUPDATE\s+\w/i, /\bINSERT\s+INTO\b/i,
      /storage\.\w*remove/i, /\bALTER\s+TABLE\b/i,
    ]) {
      expect(code, `detector must not contain ${verb}`).not.toMatch(verb);
    }
  });

  it('18c · it proves its own classification is exhaustive', () => {
    // The first version silently lost 62 of 89 objects: storage.foldername()
    // returns an EMPTY array for a root object, [1] is NULL, and NOT NULL is
    // NULL — never TRUE. The self-check is what caught it.
    expect(sql).toMatch(/classification exhaustive/i);
    expect(sql).toMatch(/ECHEC/);
  });
});

// ===========================================================================
// 19-20 · pagination, and what reaches the logs
// ===========================================================================
describe('JUNO-09 · bounds and silence', () => {
  it('19 · a listing beyond one page is fully walked, not silently truncated', async () => {
    const count = purge.LIST_PAGE_SIZE * 2 + 50;
    const paths = Array.from({ length: count }, (_, i) => `${USER}/p${String(i).padStart(4, '0')}.jpg`);
    const store = fakeStorage({ ...empty, avatars: paths });

    const out = await purge.purgeUserMedia(store.deps, USER, FAR);

    expect(out.perCategory.avatars.found).toBe(count);
    expect(out.perCategory.avatars.deleted).toBe(count);
    expect(out.done).toBe(true);
    expect(new Set(store.removedPaths()).size).toBe(count);

    // More than one page was actually requested for that bucket.
    const avatarPages = store.listCalls.filter((c) => c.bucket === 'avatars');
    expect(avatarPages.length).toBeGreaterThan(1);
    expect(avatarPages.map((c) => c.offset)).toContain(purge.LIST_PAGE_SIZE);

    // And removals were batched rather than sent as one enormous call.
    const batches = store.removed.filter((r) => r.bucket === 'avatars');
    expect(batches.length).toBe(Math.ceil(count / purge.REMOVE_BATCH_SIZE));
    for (const batch of batches) {
      expect(batch.paths.length).toBeLessThanOrEqual(purge.REMOVE_BATCH_SIZE);
    }
  });

  it('19b · chunk never loses or duplicates an item', () => {
    const items = Array.from({ length: 257 }, (_, i) => i);
    const parts = purge.chunk(items, 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 57]);
    expect(parts.flat()).toEqual(items);
    expect(() => purge.chunk(items, 0)).toThrow();
  });

  it('20 · no path, filename or uuid reaches the logs', async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(args.map(String).join(' '));
    });
    const err = vi.spyOn(console, 'error').mockImplementation((...args) => {
      lines.push(args.map(String).join(' '));
    });

    try {
      const store = fakeStorage(
        {
          avatars: [`${USER}/secret-photo-name.jpg`],
          'voice-intros': [`${USER}/my-voice.m4a`],
          verifications: [`${USER}/face-scan.mp4`],
        },
        { listError: { verifications: 'Object not found: ' + USER + '/face-scan.mp4' } },
      );
      await purge.purgeUserMedia(store.deps, USER, FAR);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }

    expect(lines.length).toBeGreaterThan(0);
    const joined = lines.join('\n');
    for (const forbidden of [
      USER, 'secret-photo-name', 'my-voice', 'face-scan', '.jpg', '.m4a', '.mp4',
    ]) {
      expect(joined, `logs must not contain ${forbidden}`).not.toContain(forbidden);
    }
    // What they DO contain is the useful part.
    expect(joined).toContain('bucket=avatars');
    expect(joined).toMatch(/deleted=\d+/);
  });

  it('20b · an error CLASS is returned, never the storage message', () => {
    expect(purge.classifyStorageError('Object not found: 11111111/x.jpg')).toBe('unknown');
    expect(purge.classifyStorageError('Bucket not found')).toBe('bucket_missing');
    expect(purge.classifyStorageError('permission denied for /a/b.jpg')).toBe('permission_denied');
    expect(purge.classifyStorageError('Too many requests')).toBe('rate_limited');
    expect(purge.classifyStorageError('Request timed out after 30s')).toBe('timeout');
    expect(purge.classifyStorageError('fetch failed')).toBe('storage_unavailable');
    expect(purge.classifyStorageError(null)).toBe('unknown');
    expect(purge.classifyStorageError(undefined)).toBe('unknown');

    // Whatever the input, the output is always one of the seven the database
    // CHECK constraint accepts. Anything else would be REFUSED on write.
    for (const message of [
      'x'.repeat(500), '/etc/passwd', `${USER}/a.jpg`, '', 42, {}, [],
    ]) {
      expect(purge.ERROR_CLASSES).toContain(purge.classifyStorageError(message));
    }
  });
});

// ===========================================================================
// The request contract, and the authorization decision
// ===========================================================================
describe('JUNO-09 · the request contract', () => {
  it('accepts only a validated user id, and never a path or a bucket', () => {
    expect(purge.parsePurgeRequest({ userId: USER })).toEqual({
      ok: true, mode: 'purge', userId: USER, requestedBy: 'manual',
    });
    expect(purge.parsePurgeRequest({ userId: USER, requestedBy: 'web_immediate' })).toMatchObject({
      ok: true, requestedBy: 'web_immediate',
    });

    // A caller-supplied path would make this a delete-anything primitive. It is
    // not a parameter, so it is ignored rather than honoured.
    const withPath = purge.parsePurgeRequest({
      userId: USER, path: '../../other/x.jpg', bucket: 'marketing-images',
    });
    expect(withPath).toEqual({ ok: true, mode: 'purge', userId: USER, requestedBy: 'manual' });

    for (const bad of [
      null, undefined, 'string', 42, [],
      {}, { userId: 'not-a-uuid' }, { userId: `${USER}/x` }, { userId: '' },
      { userId: USER, requestedBy: 'root' },
      { mode: 'wipe', userId: USER },
    ]) {
      expect(purge.parsePurgeRequest(bad), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
  });

  it('reads the prototype chain for nothing', () => {
    const hostile = JSON.parse('{"__proto__":{"mode":"resume","userId":"x"}}');
    expect(purge.parsePurgeRequest(hostile)).toMatchObject({ ok: false });
  });

  it('bounds the resume limit', () => {
    expect(purge.parsePurgeRequest({ mode: 'resume' })).toEqual({
      ok: true, mode: 'resume', limit: purge.RESUME_DEFAULT_LIMIT,
    });
    expect(purge.parsePurgeRequest({ mode: 'resume', limit: 5 })).toMatchObject({ limit: 5 });
    for (const bad of [0, -1, 1.5, purge.RESUME_MAX_LIMIT + 1, '10', null]) {
      expect(purge.parsePurgeRequest({ mode: 'resume', limit: bad })).toMatchObject({ ok: false });
    }
  });

  it('refuses before comparing when the secret is absent or too short', async () => {
    const never = vi.fn();
    for (const secret of ['', 'short', 'x'.repeat(purge.MIN_SECRET_LENGTH - 1)]) {
      const out = await purge.authorizePurgeRequest(
        { configuredSecret: secret, checkRateLimit: never }, 'anything', '1.2.3.4',
      );
      expect(out).toMatchObject({ ok: false, status: 500 });
    }
    expect(never).not.toHaveBeenCalled();
  });

  it('rate-limits BEFORE comparing the secret', async () => {
    const order: string[] = [];
    const secret = 'a'.repeat(64);
    const out = await purge.authorizePurgeRequest(
      {
        configuredSecret: secret,
        checkRateLimit: async () => { order.push('limit'); return { data: false, error: null }; },
      },
      'wrong-secret',
      '1.2.3.4',
    );
    // A limiter placed after the credential check cannot bound an attempt to
    // GUESS the credential, because a failed guess never reaches it.
    expect(order).toEqual(['limit']);
    expect(out).toMatchObject({ ok: false, status: 429 });
  });

  it('refuses when the limiter itself is unavailable', async () => {
    const out = await purge.authorizePurgeRequest(
      {
        configuredSecret: 'a'.repeat(64),
        checkRateLimit: async () => ({ data: null, error: { message: 'down' } }),
      },
      'a'.repeat(64),
      '1.2.3.4',
    );
    // Fail-closed. JUNO-29 logged its own failure and carried on for 142 nights.
    expect(out).toMatchObject({ ok: false, status: 503 });
  });

  it('accepts only the exact secret, and treats an absent header as wrong', async () => {
    const secret = 'a'.repeat(64);
    const deps = {
      configuredSecret: secret,
      checkRateLimit: async () => ({ data: true, error: null }),
    };
    expect(await purge.authorizePurgeRequest(deps, secret, '1.2.3.4')).toEqual({ ok: true });
    for (const wrong of [null, '', 'b'.repeat(64), secret + 'x', secret.slice(0, -1)]) {
      expect(await purge.authorizePurgeRequest(deps, wrong, '1.2.3.4'))
        .toMatchObject({ ok: false, status: 401 });
    }
  });

  it('compares in constant time and derives a rate-limit key from the caller', () => {
    expect(purge.constantTimeEqual('abc', 'abc')).toBe(true);
    expect(purge.constantTimeEqual('abc', 'abd')).toBe(false);
    expect(purge.constantTimeEqual('abc', 'ab')).toBe(false);
    expect(purge.constantTimeEqual('', '')).toBe(true);

    const headers = new Map([['x-forwarded-for', '9.9.9.9, 10.0.0.1']]);
    expect(purge.clientAddressOf({ headers: { get: (k) => headers.get(k) ?? null } }))
      .toBe('9.9.9.9');
    expect(purge.clientAddressOf({ headers: { get: () => null } })).toBe('unknown');
  });
});

// ===========================================================================
// The invariants the deployed code must keep
// ===========================================================================
describe('JUNO-09 · deployed invariants', () => {
  it('the bucket allowlist is hard-coded and holds only user media', () => {
    expect([...purge.PURGE_BUCKETS].sort()).toEqual(['avatars', 'verifications', 'voice-intros']);
    // Neither holds user media; both would be destroyed by a widened list.
    expect(purge.PURGE_BUCKETS).not.toContain('marketing-images');
    expect(purge.PURGE_BUCKETS).not.toContain('tarot');
  });

  it('the seven error classes match the database CHECK constraint exactly', () => {
    const migration = readRepoFile(TABLE_MIGRATION);
    for (const cls of purge.ERROR_CLASSES) {
      expect(migration, `${cls} must be accepted by the CHECK`).toContain(`'${cls}'`);
    }
    // A class the database refuses would make every failing purge fail twice.
    const inCheck = migration
      .slice(migration.indexOf('last_error_class TEXT'), migration.indexOf('claimed_at'))
      .match(/'([a-z_]+)'/g)
      ?.map((s) => s.replace(/'/g, '')) ?? [];
    expect([...inCheck].sort()).toEqual([...purge.ERROR_CLASSES].sort());
  });

  it('the table carries no foreign key — the property the whole design rests on', () => {
    const migration = readRepoFile(TABLE_MIGRATION);
    const table = migration.slice(
      migration.indexOf('CREATE TABLE IF NOT EXISTS public.media_purge_jobs'),
      migration.indexOf('COMMENT ON TABLE'),
    );
    expect(table).not.toMatch(/REFERENCES/i);
    expect(migration).toMatch(/c\.contype = 'f'/); // the assertion that enforces it
  });

  it('the secret floor matches the cron guard, so neither can be the weak one', () => {
    const guard = readRepoFile('supabase/migrations/20260910000001_scheduled_emails_cron_canonical.sql');
    expect(guard).toMatch(/v_len\s+IS\s+NULL\s+OR\s+v_len\s*<\s*32/);
    expect(purge.MIN_SECRET_LENGTH).toBe(32);
  });

  it('the confirmation email no longer claims more than was measured', () => {
    const complete = web.deletionEmailText(true);
    const partial = web.deletionEmailText(false);

    // The retired `matches` table, named in the old text.
    expect(complete).not.toMatch(/\bmatches\b/i);
    expect(partial).not.toMatch(/\bmatches\b/i);

    expect(complete).toMatch(/uploaded files/i);
    expect(complete).toMatch(/verification video/i);
    // The honest half: it does not say everything is gone when it is not.
    expect(partial).toMatch(/still being deleted/i);
    expect(partial).not.toMatch(/have all been removed/i);
    for (const text of [complete, partial]) {
      expect(text).toMatch(/permanently deleted/i);
      expect(text).toMatch(/support@astrodatingapp\.com/);
    }
  });

  it('neither the grace-window nor the cancellation path can purge anything', () => {
    // Constraints 6 and 7: `delete-account` schedules, it does not purge; and
    // cancelling a deletion must never trigger one.
    for (const file of [
      'supabase/functions/delete-account/index.ts',
      'supabase/functions/cancel-account-deletion/index.ts',
    ]) {
      const source = readRepoFile(file).replace(/\/\/.*$/gm, '');
      expect(source, `${file} must not purge`).not.toMatch(/purge-user-media/);
      expect(source, `${file} must not remove storage`).not.toMatch(/\.remove\s*\(/);
      expect(source, `${file} must not delete an account`).not.toMatch(/deleteUser/);
    }
  });
});
