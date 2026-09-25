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
// 2026-09-25 REVISION — the RPC must run as the CALLER, not as the anon key.
// The first version called `supabase.rpc('enforce_premium_feature', …)` on a
// module-level client built from SUPABASE_ANON_KEY, so PostgREST executed the
// function under the `anon` role — whose EXECUTE was revoked by
// 20260427000022 — and every reader, paid or not, got 503
// decision_unavailable (proven on a disposable 17.11 cluster in the exact
// production privilege state). supabase-js rpc() options accept only
// {head, get, count}: a `headers` third argument is ignored, so the JWT
// cannot ride on the call — it must ride on the CLIENT. The client below is
// therefore created per REQUEST from the caller's own Authorization header
// (public anon key kept; the service-role key is never read here), which
// makes getUser and the RPC both run as that caller, with no module-level
// mutable state that could leak one request's JWT into a concurrent one.
//
// Free preview, CURRENT TRUTH (2026-09-25): the Production catalogue has
// free_preview_quota = NULL on both tarot_cosmic and tarot_monthly (M1a
// classifications server_enforced_data; M1c — which would set previews — is
// NOT applied and NOT authorized). A free account therefore gets 402
// premium_required (reason insufficient_tier) with no reading bytes, and no
// usage row is written on a refusal. If M1c ever lands, the preview would
// flow through this same enforce call with no change here.
//
// Security: caller JWT identifies the reader (no user_id param); the seed
// uses auth.uid() so a caller cannot draw someone else's reading; no CORS
// (RN client via supabase.functions.invoke); fail-closed on every failure.

// Pinned 2026-09-25: there is no deno.lock in this repo, so `@2` floated.
// Pinned to 2.114.0 — the exact version the security suite executes (the
// npm workspace lock resolves the same), whose rpc() signature accepts only
// {head, get, count}.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.114.0';
import { generateReading } from './tarot.generated.ts';

type Period = 'weekly' | 'monthly';
type Mode = 'love' | 'general';

const CORS = { 'Content-Type': 'application/json' };

function fail(status: number, code: string) {
  return new Response(JSON.stringify({ success: false, error: code }), {
    status,
    headers: CORS,
  });
}

// Exported so the security suite can execute the REAL handler bytes outside
// Deno (packages/shared/src/testing/edge-source.ts) — Deno.serve only wires
// it to the platform.
export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return fail(401, 'unauthenticated');

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !anonKey) return fail(500, 'config_error');

  // REQUEST-SCOPED client. The caller's Authorization travels on the client's
  // global headers (the only place supabase-js carries it to PostgREST), so
  // both auth.getUser and the enforce RPC execute as THIS caller — the
  // `authenticated` role holds EXECUTE on enforce_premium_feature, `anon`
  // does not (20260427000022). No module-level client, no mutable JWT state:
  // concurrent requests cannot see each other's tokens.
  const requestClient = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await requestClient.auth.getUser(authHeader.replace('Bearer ', ''));
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

  // THE decision — on the request client, i.e. as the caller. Everything
  // below only runs on a server YES.
  const { data: decision, error: decisionError } = await requestClient.rpc(
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
  // Whether this open spent the account's free daily preview — with the
  // current catalogue (previews NULL until M1c) a paid account always answers
  // false. The decision is the SAME enforce call; there is no second spend.
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
}

Deno.serve(async (req) => handleRequest(req));
