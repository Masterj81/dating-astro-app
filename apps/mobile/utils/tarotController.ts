// JUNO-06 PR B — the tarot screen's request controller.
//
// The screen (app/premium-screens/tarot.tsx) owns React state; this controller
// owns the two invariants React cannot express inline:
//
//   * STALENESS — every load() takes a ticket; a result whose ticket is no
//     longer the latest is dropped, so a slow answer for a previous
//     mode/period/locale can never overwrite (or pose as) a newer request's
//     outcome. Combined with onPending() clearing the previous reading BEFORE
//     the request starts, an old reading can never be interpreted as the
//     result of the current call.
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

  return {
    load(period, mode, locale) {
      const mySeq = ++latestSeq;
      callbacks.onPending();
      return fetchTarotReading(period, mode, locale).then((result) => {
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
    },
    dispose() {
      disposed = true;
    },
  };
}
