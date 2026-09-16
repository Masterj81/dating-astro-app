-- =============================================================================
-- Synastrie offerte — tests comportementaux de la base, AVEC VRAIES SESSIONS
-- =============================================================================
--
-- HOW TO RUN (staging d'abord ; production : tout finit par ROLLBACK) :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/synastry_free_grant.test.sql
--
-- MÉTHODE (revue opérateur, 2026-09-15)
-- ------------------------------------
-- Les RPC lisent auth.uid(), qui lit request.jwt.claims. Ce test FOURNIT ces
-- claims par set_config(..., true) — locale à la transaction, restaurée au
-- ROLLBACK final — puis APPELLE RÉELLEMENT les RPC. Aucune décision n'est
-- simulée par des INSERT directs (sauf les fixtures de purge/roulement, qui
-- préparent des états que seul le temps produit).
--
-- La COURSE à deux cibles simultanées exige deux connexions PostgreSQL : elle
-- vit dans synastry_free_grant.race.test.sql et N'EST PAS exécutée ici. Ce
-- fichier prouve la machine à états en séquentiel + l'arbitrage PK par
-- unique_violation ; il ne se présente jamais comme une course exécutée.
--
-- Nécessite postgres/propriétaire (fixtures auth.users, set_config).
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- FIXTURES — adaptées à l'architecture RÉELLE (incident de test n°6)
-- =============================================================================
-- u1 gratuit · u2 Céleste (premium) · u3 Cosmique (premium_plus)
-- u4 roulement UTC · u5 purge · u6 télémétrie
-- tA/tB admissibles (actives, gender défini, looking_for par défaut = tout)
-- tC invisible (is_active = false)
--
-- EN PRODUCTION, `trigger_create_profile_on_auth_signup` (AFTER INSERT ON
-- auth.users → handle_new_auth_user_profile()) CRÉE AUTOMATIQUEMENT le
-- profil de chaque nouveau compte : l'INSERT explicite dans profiles
-- provoquait `duplicate key profiles_pkey`. Le protocole est donc :
--   1. PRÉCONTRÔLE : aucun des neuf UUID ne doit exister nulle part —
--      toute collision lève AVANT toute mutation (jamais de ON CONFLICT
--      pour masquer une collision antérieure) ;
--   2. neuf INSERT dans auth.users : le trigger crée les neuf profils ;
--   3. UPDATE ... FROM (VALUES) des neuf profils créés par le trigger,
--      avec GET DIAGNOSTICS : exactement neuf, sinon échec.
-- Le ROLLBACK final emporte tout (users, profils, abonnements, grants,
-- événements, politique).
DO $fixtures$
DECLARE
  v_collisions BIGINT;
  v_updated    INTEGER;
BEGIN
  -- 1. Précontrôle de collision, AVANT toute mutation.
  SELECT
      (SELECT COUNT(*) FROM auth.users u WHERE u.id IN (
         'aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000002',
         'aaaaaaa1-0000-4000-8000-000000000003','aaaaaaa1-0000-4000-8000-000000000004',
         'aaaaaaa1-0000-4000-8000-000000000005','aaaaaaa1-0000-4000-8000-000000000006',
         'aaaaaaa2-0000-4000-8000-00000000000a','aaaaaaa2-0000-4000-8000-00000000000b',
         'aaaaaaa2-0000-4000-8000-00000000000c'))
    + (SELECT COUNT(*) FROM public.profiles p WHERE p.id IN (
         'aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000002',
         'aaaaaaa1-0000-4000-8000-000000000003','aaaaaaa1-0000-4000-8000-000000000004',
         'aaaaaaa1-0000-4000-8000-000000000005','aaaaaaa1-0000-4000-8000-000000000006',
         'aaaaaaa2-0000-4000-8000-00000000000a','aaaaaaa2-0000-4000-8000-00000000000b',
         'aaaaaaa2-0000-4000-8000-00000000000c'))
    + (SELECT COUNT(*) FROM public.subscriptions s WHERE s.user_id IN (
         'aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000002',
         'aaaaaaa1-0000-4000-8000-000000000003','aaaaaaa1-0000-4000-8000-000000000004',
         'aaaaaaa1-0000-4000-8000-000000000005','aaaaaaa1-0000-4000-8000-000000000006',
         'aaaaaaa2-0000-4000-8000-00000000000a','aaaaaaa2-0000-4000-8000-00000000000b',
         'aaaaaaa2-0000-4000-8000-00000000000c'))
    + (SELECT COUNT(*) FROM public.synastry_free_grant g WHERE g.viewer_user_id IN (
         'aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000002',
         'aaaaaaa1-0000-4000-8000-000000000003','aaaaaaa1-0000-4000-8000-000000000004',
         'aaaaaaa1-0000-4000-8000-000000000005','aaaaaaa1-0000-4000-8000-000000000006',
         'aaaaaaa2-0000-4000-8000-00000000000a','aaaaaaa2-0000-4000-8000-00000000000b',
         'aaaaaaa2-0000-4000-8000-00000000000c'))
    + (SELECT COUNT(*) FROM public.product_events e WHERE e.user_id IN (
         'aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000002',
         'aaaaaaa1-0000-4000-8000-000000000003','aaaaaaa1-0000-4000-8000-000000000004',
         'aaaaaaa1-0000-4000-8000-000000000005','aaaaaaa1-0000-4000-8000-000000000006',
         'aaaaaaa2-0000-4000-8000-00000000000a','aaaaaaa2-0000-4000-8000-00000000000b',
         'aaaaaaa2-0000-4000-8000-00000000000c'))
    INTO v_collisions;
  IF v_collisions <> 0 THEN
    RAISE EXCEPTION 'collision préexistante : % ligne(s) portent déjà les UUID synthétiques — base non vierge pour ce test', v_collisions;
  END IF;

  -- 2. Les neuf comptes Auth : le trigger crée les neuf profils.
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaa1-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'syn.u1@juno.invalid', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaa1-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'syn.u2@juno.invalid', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaa1-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'syn.u3@juno.invalid', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaa1-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'syn.u4@juno.invalid', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaa1-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'syn.u5@juno.invalid', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaa1-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'syn.u6@juno.invalid', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaa2-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'syn.ta@juno.invalid', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaa2-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'syn.tb@juno.invalid', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaa2-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'syn.tc@juno.invalid', '', NOW(), NOW(), NOW());

  -- 3. AUCUN INSERT dans profiles : on MET À JOUR les profils du trigger.
  UPDATE public.profiles p
     SET email = v.email,
         name  = v.name,
         birth_date = v.birth_date,
         gender = v.gender,
         is_active = v.is_active,
         onboarding_completed = TRUE
    FROM (VALUES
      ('aaaaaaa1-0000-4000-8000-000000000001'::uuid, 'syn.u1@juno.invalid', 'Test U1',   '1994-05-05'::date, 'female', true),
      ('aaaaaaa1-0000-4000-8000-000000000002'::uuid, 'syn.u2@juno.invalid', 'Test U2',   '1992-02-02'::date, 'female', true),
      ('aaaaaaa1-0000-4000-8000-000000000003'::uuid, 'syn.u3@juno.invalid', 'Test U3',   '1990-10-10'::date, 'female', true),
      ('aaaaaaa1-0000-4000-8000-000000000004'::uuid, 'syn.u4@juno.invalid', 'Test U4',   '1991-11-11'::date, 'female', true),
      ('aaaaaaa1-0000-4000-8000-000000000005'::uuid, 'syn.u5@juno.invalid', 'Test U5',   '1993-09-09'::date, 'female', true),
      ('aaaaaaa1-0000-4000-8000-000000000006'::uuid, 'syn.u6@juno.invalid', 'Test U6',   '1995-03-03'::date, 'female', true),
      ('aaaaaaa2-0000-4000-8000-00000000000a'::uuid, 'syn.ta@juno.invalid', 'Cible A',   '1993-03-13'::date, 'female', true),
      ('aaaaaaa2-0000-4000-8000-00000000000b'::uuid, 'syn.tb@juno.invalid', 'Cible B',   '1991-01-21'::date, 'female', true),
      ('aaaaaaa2-0000-4000-8000-00000000000c'::uuid, 'syn.tc@juno.invalid', 'Cible C',   '1990-06-06'::date, 'female', false)
    ) AS v(id, email, name, birth_date, gender, is_active)
   WHERE p.id = v.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 9 THEN
    RAISE EXCEPTION 'fixtures : % profil(s) préparés — attendu exactement 9 (trigger + UPDATE)', v_updated;
  END IF;
END
$fixtures$;

-- u2 = Céleste ('premium'), u3 = Cosmique ('premium_plus') — actifs.
-- source = 'stripe' : subscriptions_source_check (20260312) n'accepte QUE
-- stripe/app_store/play_store — 'test' violait la CHECK (incident n°8, la
-- contrainte de production ne se plie JAMAIS à un test).
INSERT INTO public.subscriptions (user_id, tier, status, source, expires_at, cancel_at_period_end)
VALUES
  ('aaaaaaa1-0000-4000-8000-000000000002', 'premium',      'active', 'stripe', NOW() + INTERVAL '1 day', false),
  ('aaaaaaa1-0000-4000-8000-000000000003', 'premium_plus', 'active', 'stripe', NOW() + INTERVAL '1 day', false);

-- Sauvegarde de la ligne de politique pour les scénarios 7-8 (tout finit de
-- toute façon en ROLLBACK ; ceci protège les ÉTAPES SUIVANTES du test).
CREATE TEMP TABLE bk_synth_policy AS
  SELECT * FROM public.premium_feature_policy WHERE feature_key = 'synastry';

-- =============================================================================
-- LES DIX SCÉNARIOS OBLIGATOIRES — RPC réellement appelées
-- =============================================================================
DO $test$
DECLARE
  u1 UUID := 'aaaaaaa1-0000-4000-8000-000000000001';
  u2 UUID := 'aaaaaaa1-0000-4000-8000-000000000002';
  u3 UUID := 'aaaaaaa1-0000-4000-8000-000000000003';
  u4 UUID := 'aaaaaaa1-0000-4000-8000-000000000004';
  tA UUID := 'aaaaaaa2-0000-4000-8000-00000000000a';
  tB UUID := 'aaaaaaa2-0000-4000-8000-00000000000b';
  tC UUID := 'aaaaaaa2-0000-4000-8000-00000000000c';
  v_today  DATE := (NOW() AT TIME ZONE 'utc')::date;
  v_code   TEXT;
  v_next   TIMESTAMPTZ;
  v_count  BIGINT;
  v_granted_at TIMESTAMPTZ;
  v_caught BOOLEAN;
  v_msg    TEXT;
BEGIN
  -- Session simulée : ce que auth.uid() lit réellement. Locale à la
  -- transaction ; chaque scénario installe l'identité dont il a besoin.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);

  ------------------------------------------------------------------ 1 ----
  -- Gratuit + cible A => allowed_free_new (et une ligne viewer/jour).
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tA);
  IF v_code IS DISTINCT FROM 'allowed_free_new' THEN
    RAISE EXCEPTION '1. gratuit+A => % (attendu allowed_free_new)', v_code;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE viewer_user_id = u1 AND usage_date_utc = v_today;
  IF v_count <> 1 THEN RAISE EXCEPTION '1. % ligne(s) — attendu 1', v_count; END IF;
  RAISE NOTICE '1. gratuit + A => allowed_free_new, 1 ligne — OK';

  ------------------------------------------------------------------ 2 ----
  -- Gratuit + cible A ENCORE => allowed_free_existing, aucune écriture.
  SELECT granted_at INTO v_granted_at FROM public.synastry_free_grant
   WHERE viewer_user_id = u1 AND usage_date_utc = v_today;
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tA);
  IF v_code IS DISTINCT FROM 'allowed_free_existing' THEN
    RAISE EXCEPTION '2. gratuit+A rejeu => % (attendu allowed_free_existing)', v_code;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE viewer_user_id = u1 AND usage_date_utc = v_today;
  SELECT MIN(granted_at) INTO v_granted_at FROM public.synastry_free_grant
   WHERE viewer_user_id = u1 AND usage_date_utc = v_today;
  IF v_count <> 1 THEN RAISE EXCEPTION '2. rejeu a écrit (% lignes)', v_count; END IF;
  RAISE NOTICE '2. gratuit + A encore => allowed_free_existing, 1 ligne, granted_at intact — OK';

  ------------------------------------------------------------------ 3 ----
  -- Gratuit + cible B => free_preview_used_other_target + prochaine dispo
  -- serveur ; AUCUNE identité de la cible du jour dans la réponse.
  SELECT code, next_available_utc INTO v_code, v_next
    FROM public.claim_synastry_free_grant(tB);
  IF v_code IS DISTINCT FROM 'free_preview_used_other_target' THEN
    RAISE EXCEPTION '3. gratuit+B => % (attendu free_preview_used_other_target)', v_code;
  END IF;
  IF v_next IS DISTINCT FROM ((v_today + 1)::timestamp AT TIME ZONE 'utc') THEN
    RAISE EXCEPTION '3. next_available_utc != prochain minuit UTC (%)', v_next;
  END IF;
  RAISE NOTICE '3. gratuit + B => free_preview_used_other_target + minuit UTC — OK';

  ------------------------------------------------------------------ 4 ----
  -- Toujours une seule ligne (viewer, jour) après la séquence complète.
  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE viewer_user_id = u1 AND usage_date_utc = v_today;
  IF v_count <> 1 THEN RAISE EXCEPTION '4. % lignes pour (u1, aujourd''hui)', v_count; END IF;
  RAISE NOTICE '4. une seule ligne viewer/jour après A, A, B — OK';

  ------------------------------------------------------------------ 5 ----
  -- Céleste et Cosmique => allowed_paid, ZÉRO grant créé.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u2::text, 'role', 'authenticated')::text, true);
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tA);
  IF v_code IS DISTINCT FROM 'allowed_paid' THEN
    RAISE EXCEPTION '5. Céleste => % (attendu allowed_paid)', v_code;
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u3::text, 'role', 'authenticated')::text, true);
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tB);
  IF v_code IS DISTINCT FROM 'allowed_paid' THEN
    RAISE EXCEPTION '5. Cosmique => % (attendu allowed_paid)', v_code;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE viewer_user_id IN (u2, u3);
  IF v_count <> 0 THEN RAISE EXCEPTION '5. un abonné a un grant (%)', v_count; END IF;
  -- La porte les classe aussi 'paid'.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u2::text, 'role', 'authenticated')::text, true);
  SELECT code INTO v_code FROM public.synastry_preview_gate();
  IF v_code IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION '5. porte Céleste => %', v_code; END IF;
  RAISE NOTICE '5. Céleste/Cosmique => allowed_paid, porte paid, zéro grant — OK';

  ------------------------------------------------------------------ 6 ----
  -- Cible invisible (désactivée) => target_ineligible, grant du jour INTACT.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tC);
  IF v_code IS DISTINCT FROM 'target_ineligible' THEN
    RAISE EXCEPTION '6. cible invisible => % (attendu target_ineligible)', v_code;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE viewer_user_id = u1 AND usage_date_utc = v_today
     AND target_user_id = tA;
  IF v_count <> 1 THEN RAISE EXCEPTION '6. le grant du jour a bougé sur la cible invisible'; END IF;
  RAISE NOTICE '6. cible invisible => target_ineligible, grant du jour intact — OK';

  ------------------------------------------------------------------ 7 ----
  -- ROLLBACK quota NULL => preview_disabled au claim ET à la porte (=> 402
  -- edge), PAS policy_unavailable.
  UPDATE public.premium_feature_policy
     SET free_preview_quota = NULL WHERE feature_key = 'synastry';
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tA);
  IF v_code IS DISTINCT FROM 'preview_disabled' THEN
    RAISE EXCEPTION '7. claim quota NULL => % (attendu preview_disabled)', v_code;
  END IF;
  SELECT code INTO v_code FROM public.synastry_preview_gate();
  IF v_code IS DISTINCT FROM 'preview_disabled' THEN
    RAISE EXCEPTION '7. porte quota NULL => % (attendu preview_disabled)', v_code;
  END IF;
  UPDATE public.premium_feature_policy
     SET free_preview_quota = 1 WHERE feature_key = 'synastry';
  RAISE NOTICE '7. quota NULL => preview_disabled (claim + porte) — OK';

  ------------------------------------------------------------------ 8 ----
  -- Politique absente => policy_unavailable partout (fail-closed), y compris
  -- le picker ; restauration immédiate.
  DELETE FROM public.premium_feature_policy WHERE feature_key = 'synastry';
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tA);
  IF v_code IS DISTINCT FROM 'policy_unavailable' THEN
    RAISE EXCEPTION '8. claim sans politique => %', v_code;
  END IF;
  SELECT code INTO v_code FROM public.synastry_preview_gate();
  IF v_code IS DISTINCT FROM 'policy_unavailable' THEN
    RAISE EXCEPTION '8. porte sans politique => %', v_code;
  END IF;
  v_caught := FALSE;
  BEGIN
    PERFORM public.get_synastry_candidate_profiles(u1, 50);
  EXCEPTION WHEN OTHERS THEN
    v_caught := TRUE; v_msg := SQLERRM;
  END;
  IF NOT v_caught OR v_msg NOT LIKE '%policy_unavailable%' THEN
    RAISE EXCEPTION '8. picker sans politique : attrapé=% msg=%', v_caught, v_msg;
  END IF;
  INSERT INTO public.premium_feature_policy
    SELECT * FROM bk_synth_policy;
  RAISE NOTICE '8. politique absente => policy_unavailable (claim, porte, picker) — OK';

  ------------------------------------------------------------------ 9 ----
  -- Aucune session => unauthorized au claim ; porte fermée.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated')::text, true);
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tA);
  IF v_code IS DISTINCT FROM 'unauthorized' THEN
    RAISE EXCEPTION '9. claim sans session => % (attendu unauthorized)', v_code;
  END IF;
  SELECT code INTO v_code FROM public.synastry_preview_gate();
  IF v_code IS DISTINCT FROM 'policy_unavailable' THEN
    RAISE EXCEPTION '9. porte sans session => % (fermée attendue)', v_code;
  END IF;
  RAISE NOTICE '9. sans session => unauthorized / porte fermée — OK';

  ------------------------------------------------------------------ 10 ---
  -- Nouvelle journée UTC => nouvelle clé => nouveau grant possible. Le
  -- roulement réel est une fonction du temps ; ce qui est testable ici est la
  -- frontière : hier est une AUTRE clé, et le claim d'aujourd'hui installe
  -- un nouveau grant sans toucher à hier.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u4::text, 'role', 'authenticated')::text, true);
  INSERT INTO public.synastry_free_grant (viewer_user_id, usage_date_utc, target_user_id)
  VALUES (u4, v_today - 1, tB);
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tA);
  IF v_code IS DISTINCT FROM 'allowed_free_new' THEN
    RAISE EXCEPTION '10. jour suivant => % (attendu allowed_free_new)', v_code;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant WHERE viewer_user_id = u4;
  IF v_count <> 2 THEN RAISE EXCEPTION '10. hier+aujourd''hui = % lignes (attendu 2)', v_count; END IF;
  RAISE NOTICE '10. jour UTC distinct => clé distincte, nouveau grant — OK';

  RAISE NOTICE 'Scénarios 1-10 : conformes.';
END
$test$;

-- =============================================================================
-- PURGE — contrat : jour courant + six jours précédents AU MAXIMUM
-- =============================================================================
DO $test$
DECLARE
  u1 UUID := 'aaaaaaa1-0000-4000-8000-000000000001';
  u5 UUID := 'aaaaaaa1-0000-4000-8000-000000000005';
  tA UUID := 'aaaaaaa2-0000-4000-8000-00000000000a';
  tB UUID := 'aaaaaaa2-0000-4000-8000-00000000000b';  -- incident n°10-ter : utilisé ci-dessous, non déclaré = colonne SQL
  v_today DATE := (NOW() AT TIME ZONE 'utc')::date;
  v_code  TEXT;
  v_count BIGINT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u5::text, 'role', 'authenticated')::text, true);

  -- u5 : aujourd'hui (cible A), J−6 (A), J−7 (B), J−10 (B).
  INSERT INTO public.synastry_free_grant (viewer_user_id, usage_date_utc, target_user_id) VALUES
    (u5, v_today,      tA),
    (u5, v_today - 6,  tA),
    (u5, v_today - 7,  tB),
    (u5, v_today - 10, tB);

  -- Un claim u5 sur A (rejeu du jour) DÉCLENCHE la purge opportuniste.
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tA);
  IF v_code IS DISTINCT FROM 'allowed_free_existing' THEN
    RAISE EXCEPTION 'P0. rejeu purge => %', v_code;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE viewer_user_id = u5 AND usage_date_utc = v_today;
  IF v_count <> 1 THEN RAISE EXCEPTION 'P1. le grant du jour a été purgé'; END IF;
  RAISE NOTICE 'P1. jour courant conservé (et jamais supprimé par le claim qui purge) — OK';

  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE viewer_user_id = u5 AND usage_date_utc = v_today - 6;
  IF v_count <> 1 THEN RAISE EXCEPTION 'P2. J−6 supprimé (contrat : conservé)'; END IF;
  RAISE NOTICE 'P2. J−6 conservé — OK';

  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE viewer_user_id = u5 AND usage_date_utc = v_today - 7;
  IF v_count <> 0 THEN RAISE EXCEPTION 'P3. J−7 conservé (contrat : supprimé)'; END IF;
  RAISE NOTICE 'P3. J−7 supprimé — OK';

  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE viewer_user_id = u5 AND usage_date_utc = v_today - 10;
  IF v_count <> 0 THEN RAISE EXCEPTION 'P4. J−10 conservé (contrat : supprimé)'; END IF;
  RAISE NOTICE 'P4. J−10 supprimé — OK';

  -- BORNE 200 : 250 lignes expirées (J−8, viewers fictifs sans FK), un seul
  -- claim => exactement 200 suppressions, 50 restantes.
  INSERT INTO public.synastry_free_grant (viewer_user_id, usage_date_utc, target_user_id)
  SELECT gen_random_uuid(), v_today - 8, tA FROM generate_series(1, 250);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);
  SELECT code INTO v_code FROM public.claim_synastry_free_grant(tA);  -- rejeu : purge seule
  IF v_code IS DISTINCT FROM 'allowed_free_existing' THEN
    RAISE EXCEPTION 'P5. rejeu u1 => %', v_code;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.synastry_free_grant
   WHERE usage_date_utc = v_today - 8;
  IF v_count <> 50 THEN RAISE EXCEPTION 'P6. % lignes J−8 restantes (attendu 50 : borne 200)', v_count; END IF;
  RAISE NOTICE 'P6. purge bornée à 200 suppressions par appel — OK';

  RAISE NOTICE 'Purge : jour+J−6 conservés, J−7 et plus anciens purgés, borne 200 — OK';
END
$test$;

-- =============================================================================
-- STRUCTUREL — la purge est le SEUL DELETE ; aucun DELETE compensatoire
-- =============================================================================
-- On distingue la purge historique AUTORISÉE (prédicat J−7 et plus, borne
-- 200) d'une suppression du grant courant : il doit y avoir EXACTEMENT une
-- instruction DELETE dans le claim, et CETTE instruction doit porter le
-- prédicat de rétention et la borne. Tout autre DELETE = régression.
DO $test$
DECLARE
  v_def   TEXT;
  v_pos   INTEGER;
  v_len   INTEGER;
  v_occ   INTEGER;
  v_stmt  TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'claim_synastry_free_grant';

  v_occ := (length(v_def) - length(replace(v_def, 'DELETE FROM public.synastry_free_grant', '')))
           / length('DELETE FROM public.synastry_free_grant');
  IF v_occ <> 1 THEN
    RAISE EXCEPTION 'S1. % instructions DELETE sur les grants (attendu exactement 1 : la purge)', v_occ;
  END IF;

  v_pos := position('DELETE FROM public.synastry_free_grant' in v_def);
  v_len := position(';' in substring(v_def from v_pos));
  v_stmt := substring(v_def from v_pos for v_len - 1);
  IF v_stmt NOT LIKE '%usage_date_utc < v_today - INTERVAL ''6 days''%' THEN
    RAISE EXCEPTION 'S2. l''unique DELETE n''est pas la purge (prédicat de rétention absent)';
  END IF;
  IF v_stmt NOT LIKE '%LIMIT 200%' THEN
    RAISE EXCEPTION 'S3. l''unique DELETE n''est pas la purge (borne 200 absente)';
  END IF;
  RAISE NOTICE 'S. un seul DELETE = la purge (J−7 et plus anciens, borne 200) — aucun DELETE compensatoire — OK';
END
$test$;

-- =============================================================================
-- TÉLÉMÉTRIE — non-régression email_clicked + idempotence des aperçus
-- =============================================================================
DO $test$
DECLARE
  u6 UUID := 'aaaaaaa1-0000-4000-8000-000000000006';
  v_eid UUID := gen_random_uuid();
  v_count BIGINT;
  v_created TIMESTAMPTZ;
  v_created2 TIMESTAMPTZ;
BEGIN
  -- (a) session + SANS client_event_id : attribué directement (canonique).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u6::text, 'role', 'authenticated')::text, true);
  PERFORM public.record_product_event('email_clicked', 'welcome');
  SELECT COUNT(*) INTO v_count FROM public.product_events
   WHERE event_name = 'email_clicked' AND user_id = u6;
  IF v_count <> 1 THEN RAISE EXCEPTION 'T1. clic sans id : % ligne(s) attribuée(s)', v_count; END IF;

  -- (b) SANS session + client_event_id : ligne anonyme (le cas dominant).
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated')::text, true);
  PERFORM public.record_product_event('email_clicked', 'welcome',
    NULL, NULL, NULL, NULL, v_eid);
  SELECT COUNT(*) INTO v_count FROM public.product_events WHERE client_event_id = v_eid;
  IF v_count <> 1 THEN RAISE EXCEPTION 'T2. insert anonyme : % ligne(s)', v_count; END IF;
  SELECT COUNT(*) INTO v_count FROM public.product_events
   WHERE client_event_id = v_eid AND user_id IS NULL;
  IF v_count <> 1 THEN RAISE EXCEPTION 'T3. la ligne client_event_id n''est pas anonyme'; END IF;
  SELECT created_at INTO v_created FROM public.product_events WHERE client_event_id = v_eid;

  -- (c) session + MÊME client_event_id : attribution en place, UNE ligne,
  -- created_at préservé (le moment du clic, pas celui du login).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u6::text, 'role', 'authenticated')::text, true);
  PERFORM public.record_product_event('email_clicked', 'welcome',
    NULL, NULL, NULL, NULL, v_eid);
  SELECT COUNT(*) INTO v_count FROM public.product_events WHERE client_event_id = v_eid;
  IF v_count <> 1 THEN RAISE EXCEPTION 'T4. attribution a dupliqué (% lignes)', v_count; END IF;
  SELECT COUNT(*) INTO v_count FROM public.product_events
   WHERE client_event_id = v_eid AND user_id = u6;
  IF v_count <> 1 THEN RAISE EXCEPTION 'T5. attribution non effectuée'; END IF;
  SELECT created_at INTO v_created2 FROM public.product_events WHERE client_event_id = v_eid;
  IF v_created2 IS DISTINCT FROM v_created THEN
    RAISE EXCEPTION 'T5b. created_at réécrit par l''attribution (le clic doit garder son moment)';
  END IF;

  -- (d) re-attribution interdite : un appel anonyme ultérieur avec le MÊME id
  -- ne doit ni dupliquer ni VIDER l'attribution.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated')::text, true);
  PERFORM public.record_product_event('email_clicked', 'welcome',
    NULL, NULL, NULL, NULL, v_eid);
  SELECT COUNT(*) INTO v_count FROM public.product_events
   WHERE client_event_id = v_eid AND user_id = u6;
  IF v_count <> 1 THEN RAISE EXCEPTION 'T6. l''attribution a été vidée/écrasée'; END IF;

  -- (e) aperçus : idempotence quotidienne par (lecteur, nom, jour UTC) et
  -- refus sans session.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u6::text, 'role', 'authenticated')::text, true);
  PERFORM public.record_product_event('preview_succeeded');
  PERFORM public.record_product_event('preview_succeeded');
  PERFORM public.record_product_event('preview_reopened');
  SELECT COUNT(*) INTO v_count FROM public.product_events
   WHERE user_id = u6 AND event_name = 'preview_succeeded';
  IF v_count <> 1 THEN RAISE EXCEPTION 'T7. preview_succeeded ×2 => % lignes', v_count; END IF;
  SELECT COUNT(*) INTO v_count FROM public.product_events
   WHERE user_id = u6 AND event_name = 'preview_reopened';
  IF v_count <> 1 THEN RAISE EXCEPTION 'T8. preview_reopened => % lignes', v_count; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated')::text, true);
  PERFORM public.record_product_event('preview_succeeded');
  SELECT COUNT(*) INTO v_count FROM public.product_events
   WHERE event_name = 'preview_succeeded' AND user_id IS NULL;
  IF v_count <> 0 THEN RAISE EXCEPTION 'T9. aperçu anonyme accepté'; END IF;

  RAISE NOTICE 'Télémétrie : attribution intacte, idempotence aperçus — OK';
END
$test$;

-- =============================================================================
-- PICKER — sémantique gratuite/rollback/fail-closed, sessions réelles
-- =============================================================================
DO $test$
DECLARE
  u1 UUID := 'aaaaaaa1-0000-4000-8000-000000000001';
  u2 UUID := 'aaaaaaa1-0000-4000-8000-000000000002';
  tA UUID := 'aaaaaaa2-0000-4000-8000-00000000000a';
  tB UUID := 'aaaaaaa2-0000-4000-8000-00000000000b';
  tC UUID := 'aaaaaaa2-0000-4000-8000-00000000000c';
  v_count BIGINT;
  v_caught BOOLEAN;
  v_msg TEXT;
BEGIN
  -- Gratuit, quota actif : le picker sert les cibles admissibles.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);
  SELECT COUNT(*) INTO v_count FROM public.get_synastry_candidate_profiles(u1, 50)
   WHERE id = tA;
  IF v_count <> 1 THEN RAISE EXCEPTION 'K1. cible A absente du picker gratuit'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.get_synastry_candidate_profiles(u1, 50)
   WHERE id = tC;
  IF v_count <> 0 THEN RAISE EXCEPTION 'K2. cible invisible présente'; END IF;
  SELECT COUNT(*) INTO v_count FROM public.get_synastry_candidate_profiles(u1, 50)
   WHERE id = u1;
  IF v_count <> 0 THEN RAISE EXCEPTION 'K3. soi-même dans le picker'; END IF;
  RAISE NOTICE 'K. gratuit + quota actif : A et B servies, C exclue, soi exclu — OK';

  -- ROLLBACK quota NULL : premium_required (l'état d'avant l'aperçu).
  UPDATE public.premium_feature_policy SET free_preview_quota = NULL
   WHERE feature_key = 'synastry';
  v_caught := FALSE;
  BEGIN
    PERFORM public.get_synastry_candidate_profiles(u1, 50);
  EXCEPTION WHEN OTHERS THEN
    v_caught := TRUE; v_msg := SQLERRM;
  END;
  IF NOT v_caught OR v_msg NOT LIKE '%premium_required%' THEN
    RAISE EXCEPTION 'K4. quota NULL : attrapé=% msg=%', v_caught, v_msg;
  END IF;

  -- ...et l'abonné passe toujours (aucun contournement du tier).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u2::text, 'role', 'authenticated')::text, true);
  SELECT COUNT(*) INTO v_count FROM public.get_synastry_candidate_profiles(u2, 50);
  IF v_count < 2 THEN RAISE EXCEPTION 'K5. abonné bloqué par le quota NULL'; END IF;
  UPDATE public.premium_feature_policy SET free_preview_quota = 1
   WHERE feature_key = 'synastry';
  RAISE NOTICE 'K. quota NULL => premium_required pour free, abonné intact — OK';

  RAISE NOTICE 'Picker : conforme.';
END
$test$;

-- =============================================================================
-- ACL — le pseudo-rôle PUBLIC n'est PAS prouvable par has_*_privilege ; la
-- régression INJECTE de vrais GRANT TO PUBLIC et prouve que la détection
-- (celle des self-verifies des migrations) les voit. Les helpers ne sont
-- plus STRICT (revue 4, P0) : un appel mono-argument exécute désormais la
-- requête, et chaque assertion compare explicitement — IS FALSE en baseline,
-- IS TRUE après injection — pour qu'un NULL éventuel ÉCHOUE le test au lieu
-- de le verdir. Tout finit en ROLLBACK.
-- =============================================================================
DO $test$
DECLARE
  v_detected BOOLEAN;
  v_count    BIGINT;
  v_caught   BOOLEAN;
BEGIN
  -- 1. Baseline SANS privilège PUBLIC => strictement FALSE (TRUE/NULL => échec).
  IF public._acl_public_tbl_privilege('public.synastry_free_grant'::regclass) IS FALSE THEN
    RAISE NOTICE 'R1. baseline ACL table : FALSE (fermée, déterminée)';
  ELSE
    RAISE EXCEPTION 'R1. baseline ACL table : ni fermée ni déterminée (TRUE/NULL interdits)';
  END IF;
  IF public._acl_public_fn_privilege('public.synastry_preview_gate()'::regprocedure) IS FALSE THEN
    RAISE NOTICE 'R1. baseline ACL porte : FALSE';
  ELSE
    RAISE EXCEPTION 'R1. baseline ACL porte : ni fermée ni déterminée';
  END IF;
  IF public._acl_public_fn_privilege('public.claim_synastry_free_grant(uuid)'::regprocedure) IS FALSE THEN
    RAISE NOTICE 'R1. baseline ACL claim : FALSE';
  ELSE
    RAISE EXCEPTION 'R1. baseline ACL claim : ni fermée ni déterminée';
  END IF;

  -- 2. GRANT SELECT TO PUBLIC => TRUE en mode global (n'importe quel privilège).
  GRANT SELECT ON public.synastry_free_grant TO PUBLIC;
  SELECT public._acl_public_tbl_privilege('public.synastry_free_grant'::regclass)
    INTO v_detected;
  IF v_detected IS TRUE THEN
    RAISE NOTICE 'R2. GRANT SELECT TO PUBLIC => mode global TRUE (détection positive)';
  ELSE
    RAISE EXCEPTION 'R2. détection globale en échec (%) : self-verify aveugle', v_detected;
  END IF;

  -- 3. Même GRANT => TRUE en mode ciblé SELECT.
  SELECT public._acl_public_tbl_privilege('public.synastry_free_grant'::regclass, 'SELECT')
    INTO v_detected;
  IF v_detected IS TRUE THEN
    RAISE NOTICE 'R3. mode ciblé SELECT => TRUE';
  ELSE
    RAISE EXCEPTION 'R3. détection ciblée SELECT en échec (%)', v_detected;
  END IF;

  -- (Fonction aussi : GRANT EXECUTE TO PUBLIC => TRUE.)
  GRANT EXECUTE ON FUNCTION public.synastry_preview_gate() TO PUBLIC;
  SELECT public._acl_public_fn_privilege('public.synastry_preview_gate()'::regprocedure)
    INTO v_detected;
  IF v_detected IS TRUE THEN
    RAISE NOTICE 'R3. GRANT EXECUTE TO PUBLIC => TRUE (la branche RAISE de la migration se déclencherait)';
  ELSE
    RAISE EXCEPTION 'R3. détection fonction en échec (%)', v_detected;
  END IF;

  -- 4. REVOKE => retour strict à FALSE.
  REVOKE SELECT ON public.synastry_free_grant FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.synastry_preview_gate() FROM PUBLIC;
  IF public._acl_public_tbl_privilege('public.synastry_free_grant'::regclass) IS FALSE THEN
    RAISE NOTICE 'R4. après REVOKE table => FALSE';
  ELSE
    RAISE EXCEPTION 'R4. REVOKE table non observé (TRUE/NULL)';
  END IF;
  IF public._acl_public_fn_privilege('public.synastry_preview_gate()'::regprocedure) IS FALSE THEN
    RAISE NOTICE 'R4. après REVOKE fonction => FALSE';
  ELSE
    RAISE EXCEPTION 'R4. REVOKE fonction non observé (TRUE/NULL)';
  END IF;

  -- 5. Privilège INCONNU => EXCEPTION (jamais un FALSE silencieux, jamais un
  -- faux vert) — et ce, pour les DEUX helpers.
  v_caught := FALSE;
  BEGIN
    PERFORM public._acl_public_tbl_privilege('public.synastry_free_grant'::regclass, 'NOT_A_PRIVILEGE');
  EXCEPTION WHEN OTHERS THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'R5. privilège de table inconnu accepté en silence : faux vert possible';
  END IF;
  v_caught := FALSE;
  BEGIN
    PERFORM public._acl_public_fn_privilege('public.synastry_preview_gate()'::regprocedure, 'NOT_A_PRIVILEGE');
  EXCEPTION WHEN OTHERS THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'R5. privilège de fonction inconnu accepté en silence : faux vert possible';
  END IF;
  RAISE NOTICE 'R5. privilèges inconnus => EXCEPTION (aucun faux vert) — OK';

  -- 6. Les outils d'inspection ne sont PAS eux-mêmes ouverts à PUBLIC
  -- (sans REVOKE, EXECUTE irait à PUBLIC par défaut).
  IF public._acl_public_fn_privilege('public._acl_public_fn_privilege(oid,text)'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'R6. PUBLIC peut exécuter _acl_public_fn_privilege, ou lecture indéterminée';
  END IF;
  IF public._acl_public_fn_privilege('public._acl_public_tbl_privilege(oid,text)'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'R6. PUBLIC peut exécuter _acl_public_tbl_privilege, ou lecture indéterminée';
  END IF;
  RAISE NOTICE 'R6. outils ACL eux-mêmes fermés à PUBLIC — OK';

  -- 7. grantee=0 est bien l'unique représentation du pseudo-rôle : aucun
  -- rôle nommé « public » n'existe dans pg_authid.
  SELECT COUNT(*) INTO v_count FROM pg_authid WHERE rolname = 'public';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'R7. un rôle nommé public existerait (%) : les checks par nom seraient ambigus', v_count;
  END IF;
  RAISE NOTICE 'R7. aucun rôle «public» : grantee=0 est l unique représentation — OK';

  -- Les GRANT injectés disparaissent au ROLLBACK final de ce fichier.
END
$test$;

ROLLBACK;

-- Tout vit dans la transaction ci-dessus : auth.users factices, profils,
-- abonnements, grants, événements, et les mutations de politique. ROLLBACK
-- rend la base à l'identique — vérifiable par :
--   SELECT count(*) FROM public.synastry_free_grant;            -- 0 attendu
--   SELECT count(*) FROM public.profiles WHERE email LIKE 'syn.%';  -- 0 attendu
