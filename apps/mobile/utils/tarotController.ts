// JUNO-06 PR B (corrective) — the tarot screen's request controller.
//
// The screen (app/premium-screens/tarot.tsx) owns React state; this controller
// owns the three invariants React cannot express inline:
//
//   * CONSUMPTION — at most ONE premium-tarot-reading operation may be in
//     flight for this screen instance, WHATEVER period/mode/locale it carries.
//     A sequence ticket alone cannot provide this: it protects the RENDER,
//     not the consumption — the Edge decides and spends on every invocation it
//     receives, so a second concurrent invocation with different parameters
//     would be a second enforce even though its answer would be dropped. The
//     lock below is therefore a single global slot (not keyed by parameters),
//     acquired synchronously before the operation's first await and released
//     only when the WHOLE operation settles — the bounded 401 renewal is part
//     of the same operation and never releases the slot between its two
//     authorized invocations. While the slot is held, every load() is a no-op
//     that JOINS the in-flight promise: no second invocation, no queue, no
//     deferred promise, nothing auto-fires when the slot frees. A new reading
//     always requires a fresh, explicit user action afterwards.
//   * STALENESS — every load() takes a ticket; a result whose ticket is no
//     longer the latest is dropped, so a slow answer can never overwrite (or
//     pose as) a newer outcome. With the consumption lock the second request
//     never exists, so the ticket is defense-in-depth for the render side.
//   * LATE UPDATES AFTER UNMOUNT — dispose() freezes every callback; the
//     screen calls it from an unmount-only effect, so a response landing
//     after the screen is gone sets no state at all.
//
// It deliberately contains NO retry logic, NO timer and NO authorization: the
// only paths back to the screen are the four callbacks, and only a server
// success reaches onSuccess. Premium refusal reaches onPremiumRequired with
// zero premium bytes; every other failure reaches onFailure with its code.
import {
  fetchTarotReading,
  type ServerTarotReading,
  type TarotFailureCode,
  type TarotMode,
  type TarotPeriod,
} from '../services/serverTarot';

export type TarotScreenCallbacks = {
  /** A new request started: clear stale state, show the loading UI. */
  onPending: () => void;
  /** The server authorized and returned a complete reading. */
  onSuccess: (reading: ServerTarotReading, viaFreePreview: boolean) => void;
  /** The server refused (402): paywall, no premium content anywhere. */
  onPremiumRequired: () => void;
  /** Any other failure — retryable or terminal per its code, never a grant. */
  onFailure: (code: TarotFailureCode) => void;
};

export type TarotScreenController = {
  load: (period: TarotPeriod, mode: TarotMode, locale: string) => Promise<void>;
  /** Freeze all callbacks — call exactly once, on unmount. */
  dispose: () => void;
};

export function createTarotScreenController(
  callbacks: TarotScreenCallbacks,
): TarotScreenController {
  let latestSeq = 0;
  let disposed = false;
  // THE consumption lock: one slot, no parameter key. Holds for the whole
  // logical operation — initial invocation, optional 401 renewal included.
  let inFlight: Promise<void> | null = null;

  return {
    load(period, mode, locale) {
      if (disposed) return Promise.resolve();
      // While an operation is in flight — whatever its parameters — this
      // trigger JOINS it and launches NOTHING: not a second invocation, not a
      // queued or deferred request, and nothing scheduled for release time.
      if (inFlight) return inFlight;

      const mySeq = ++latestSeq;
      // The parameters below are CAPTURED AT DEPARTURE: the operation that
      // runs is the one this call describes, and any parameter change during
      // the flight is a UI selection that will need its own explicit action
      // afterwards (the screen disables its network triggers while loading).
      callbacks.onPending();
      const operation = fetchTarotReading(period, mode, locale).then((result) => {
        // Drop this answer if the screen unmounted, or if a newer request
        // superseded it — an old response must never win.
        if (disposed || mySeq !== latestSeq) return;
        if (result.ok) {
          callbacks.onSuccess(result.reading, result.viaFreePreview);
        } else if (result.code === 'premium_required') {
          callbacks.onPremiumRequired();
        } else {
          callbacks.onFailure(result.code);
        }
      });
      // Acquired synchronously, BEFORE the operation's first await resolves —
      // two triggers in the same tick can never both miss.
      inFlight = operation;
      // Released ONLY when the whole operation settles: success, 402 refusal,
      // 429/500/503, transport exception, malformed 200 — and across the
      // bounded 401 renewal, which lives INSIDE fetchTarotReading's promise.
      // Nothing fires at release: no queued request, no auto-relaunch with
      // the latest parameters.
      void operation.then(
        () => {
          if (inFlight === operation) inFlight = null;
        },
        () => {
          if (inFlight === operation) inFlight = null;
        },
      );
      return operation;
    },
    dispose() {
      disposed = true;
    },
  };
}
