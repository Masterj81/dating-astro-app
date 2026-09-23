// JUNO-06 — server-generated tarot reading (weekly Cosmic / monthly Celestial).
//
// WHY (operator ruling 2026-09-22/23): the complete tarot engine and corpus
// ship in the APK, so a patched client deletes the enforce call and draws
// locally — the gate protected UX, not the content. This edge makes the
// READING a server artifact:
//
//   auth -> enforce_premium_feature(tarot_cosmic | tarot_monthly) -> if
//   allowed, draw + resolve HERE (seeded, deterministic — same person, mode,
//   period = same cards as before) -> return ONLY the authorized result. The
//   client renders what it receives; it no longer imports the corpus or
//   engine for this surface.
//
// Determinism: the seed is derived exactly like the shared engine
// (userId-mode-period-ISOweek/month, FNV-1a + mulberry32 + Fisher-Yates over
// the fixed deck order) because this IS the shared engine: the bundle in
// tarot.generated.ts is generated from packages/shared by
// scripts/build-edge-tarot.mjs (same contract as the astrology engine bundle:
// the server and the clients cannot drift because the artifact is generated
// FROM the single source and CI regenerates it).
//
// Free preview: enforce_premium_feature owns it (1/day, replay window) — a
// free account gets its single daily reading from THIS function, and the
// corpus never reaches the bundle.
//
// Security: caller JWT identifies the reader (no user_id param); the seed
// uses auth.uid() so a caller cannot draw someone else's reading; no CORS
// (RN client via supabase.functions.invoke); fail-closed on every failure.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateReading } from './tarot.generated.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  { auth: { persistSession: false, detectSessionInUrl: false } },
);

type Period = 'weekly' | 'monthly';
type Mode = 'love' | 'general';

const CORS = { 'Content-Type': 'application/json' };

function fail(status: number, code: string) {
  return new Response(JSON.stringify({ success: false, error: code }), {
    status,
    headers: CORS,
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return fail(401, 'unauthenticated');

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (userError || !user) return fail(401, 'unauthenticated');

  let body: { period?: string; mode?: string; locale?: string } = {};
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid_body');
  }

  const period: Period = body.period === 'weekly' ? 'weekly' : 'monthly';
  const mode: Mode = body.mode === 'general' ? 'general' : 'love';
  // Any of the 8 locales; generateReading resolves en/fr to their corpus and
  // the other six to English with isFallback=true — the same honest fallback
  // the client shipped, decided by the same code.
  const locale = typeof body.locale === 'string' && body.locale ? body.locale : 'en';

  // THE decision. Everything below only runs on a server YES.
  const { data: decision, error: decisionError } = await supabase.rpc(
    'enforce_premium_feature',
    { p_feature_key: period === 'weekly' ? 'tarot_cosmic' : 'tarot_monthly' },
  );

  if (decisionError) return fail(503, 'decision_unavailable'); // fail-closed

  const d = Array.isArray(decision) ? decision[0] : decision;
  if (!d?.allowed) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'premium_required',
        reason: d?.reason ?? 'insufficient_tier',
      }),
      { status: 402, headers: CORS },
    );
  }
  // Whether this open spent the account's free daily preview — the client
  // shows the "1 free preview today" banner exactly like every other
  // server-gated surface (the decision is the SAME enforce call; there is no
  // second spend anywhere).
  const viaFreePreview = d.reason === 'free_preview';

  // The reading: seeded by auth.uid() (never a caller-supplied user id),
  // drawn and resolved HERE with the exact shared pipeline — the committed
  // artifact is generated from packages/shared, so the server cannot drift
  // from the engine that used to run on the phone. Only the authorized
  // result crosses the wire; the corpus no longer ships in the APK.
  const reading = generateReading({ userId: user.id, mode, period, locale });
  return new Response(
    JSON.stringify({ success: true, viaFreePreview, reading }),
    { headers: CORS },
  );
});
