// P2-7: wrap a promise (typically a Supabase RPC call) with a timeout and
// automatic retries so slow/broken networks surface an error within a bounded
// time instead of hanging the UI spinner indefinitely.
//
// Default behavior: 8s timeout per attempt, up to 1 retry with exponential
// backoff (500ms, 1500ms, 3000ms between attempts, in that order).
//
// IMPORTANT: the passed factory must be a thunk `() => Promise<T>` because
// each retry re-invokes the RPC — a live Promise can only be awaited once.

export type RpcWithTimeoutOptions = {
  timeoutMs?: number;
  retries?: number;
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 1;
const RETRY_DELAYS_MS = [500, 1500, 3000];

export class RpcTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`RPC timed out after ${timeoutMs}ms`);
    this.name = 'RpcTimeoutError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RpcTimeoutError(timeoutMs));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Run `factory()` with a timeout, retrying on timeout or thrown error.
 *
 * @example
 *   const tier = await rpcWithTimeout(() => getUserTier(user.id));
 *   const gate = await rpcWithTimeout(
 *     () => supabase.rpc('enforce_premium_feature', { p_feature_key: 'natal_chart' }).maybeSingle(),
 *     { timeoutMs: 6000, retries: 2 }
 *   );
 */
export async function rpcWithTimeout<T>(
  factory: () => PromiseLike<T>,
  options: RpcWithTimeoutOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Supabase query builders are PromiseLike, not full Promises — wrap
      // through Promise.resolve so raceWithTimeout always gets a real Promise.
      return await raceWithTimeout(Promise.resolve(factory()), timeoutMs);
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      if (__DEV__) {
        console.warn(
          `[rpcWithTimeout] attempt ${attempt + 1}/${retries + 1} failed, retrying in ${delay}ms`,
          err
        );
      }
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
