-- =============================================================================
-- Synastrie gratuite — une comparaison offerte par jour civil UTC
-- =============================================================================
--
-- DÉCISION PRODUIT (15 septembre 2026, opérateur) :
--   * une seule cible admissible par lecteur et par jour UTC ;
--   * la même cible est rejouable toute la journée sans nouvelle consommation ;
--   * une autre cible est refusée jusqu'au prochain jour UTC ;
--   * Céleste et Cosmique : accès normal, AUCUN grant créé ;
--   * réponse perdue après succès : grant conservé ;
--   * cible devenue bloquée/inaccessible : grant conservé, identité jamais divulguée ;
--   * rétention : jour courant + six jours précédents au MAXIMUM (le
--     prédicat de purge supprime J−7 et plus anciens — voir section 3) ;
--
-- POURQUOI UNE TABLE DÉDIÉE ET PAS premium_usage (choix validé)
-- -----------------------------------------------------------------
-- premium_usage compte des UNITÉS par (user, feature, jour) avec une fenêtre
-- de rejeu de 15 minutes (20260823000001). Le contrat demandé ici lie un
-- TARGET au jour — une dimension que ce modèle n'a pas, et une fenêtre qu'il
-- n'exprime pas : rouvrir la même cible à la minute 16 y serait REFUSÉ.
-- Étendre enforce_premium_feature d'un paramètre cible conditionnel mettrait
-- la promesse de paiement du natal_chart et la sémantique par-cible de la
-- synastrie dans la même fonction — le type de couplage que ce dépôt documente
-- comme la source de ses pires dérives. Cette table n'est PAS une seconde
-- autorité : premium_feature_policy reste le drapeau d'existence (absente ou
-- ambiguë => échec fermé), et l'edge function reste l'orchestrateur unique.
--
-- ORDRE DES CONTRÔLES (corrigé après revue — « claim APRÈS calcul »)
-- -----------------------------------------------------------------
--   auth → UUID → rate limit fail-closed → PORTE (tier explicite, lecture
--   seule) → visibilité → lecture du thème → calcul → CLAIM ATOMIQUE →
--   réponse SEULEMENT si le claim autorise la cible.
-- Aucune donnée astrologique n'est émise avant le claim : un appel concurrent
-- perdant jette son calcul et reçoit free_preview_used_other_target. Aucun
-- DELETE de compensation n'existe — la course « A réserve / B rejoue / A
-- échoue et supprime » est structurellement impossible.
--
-- SÉMANTIQUE DE POLITIQUE (décision opérateur)
--   ligne absente ou plusieurs lignes => policy_unavailable (503, fermé) ;
--   ligne présente + free_preview_quota NULL   => aperçu DÉSACTIVÉ =>
--     402 insufficient_tier — c'est le ROLLBACK SANS REDÉPLOIEMENT ;
--   ligne présente + quota >= 1                => aperçu activé ;
--   tier payant suffisant                      => allowed_paid, aucun grant.
-- =============================================================================

begin;

-- =============================================================================
-- 1) La table des grants
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.synastry_free_grant (
  viewer_user_id  UUID        NOT NULL,
  usage_date_utc  DATE        NOT NULL,
  target_user_id  UUID        NOT NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- LA contrainte du contrat : une seule ligne par lecteur et par jour UTC.
  -- Deux claims concurrents vers deux cibles : exactement un INSERT gagne,
  -- par construction de l'index, pas par convention applicative.
  PRIMARY KEY (viewer_user_id, usage_date_utc)
);

COMMENT ON TABLE public.synastry_free_grant IS
  'Aperçu synastrie gratuit : LA cible offerte du jour pour chaque lecteur (PK viewer+day => une seule par jour civil UTC). Aucune donnée de naissance, coordonnée, nom ou thème : trois UUID, une date, un horodatage. Écriture exclusive via claim_synastry_free_grant (SECURITY DEFINER); lecture service_role pour diagnostics. Rétention : jour courant + six jours précédents au maximum (purge opportuniste bornée dans le claim).';

-- Purge : index sur la date seule, la requête de purge balaie les jours
-- expirés sans toucher à la PK. Volume borné par construction : au plus
-- une ligne par lecteur actif et par jour.
CREATE INDEX IF NOT EXISTS idx_synastry_free_grant_purge
  ON public.synastry_free_grant (usage_date_utc);

ALTER TABLE public.synastry_free_grant ENABLE ROW LEVEL SECURITY;

-- Aucune policy : anonymat complet pour les rôles clients. Les écritures
-- passent par le SECURITY DEFINER ci-dessous (propriétaire = migrateur),
-- les lectures par service_role (diagnostics) — même posture que
-- premium_usage après 20260823000001 : un registre que son sujet peut
-- réécrire n'est pas un registre.
--
-- INCIDENT D'APPLICATION n°3 (16 sept 2026, dry-run transactionnel ROLLBACK) :
-- la self-verify a refusé « service_role détient DELETE ». Supabase accorde
-- ALL à service_role sur toute NOUVELLE table via ses default privileges
-- (précédent 20260911000001) : un GRANT SELECT AJOUTE, il ne RETIRE rien.
-- L'ordre correct est donc : REVOKE ALL (service_role compris) D'ABORD,
-- puis GRANT SELECT seul, séparé.
REVOKE ALL ON TABLE public.synastry_free_grant
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.synastry_free_grant
  TO service_role;

-- =============================================================================
-- 2) La PORTE — lecture seule, tier EXPLICITE (défaut n°2 de la revue)
-- =============================================================================
-- can_use_premium_feature ne peut PLUS distinguer un abonné d'un compte
-- gratuit avec quota : dès free_preview_quota >= 1, les deux reçoivent
-- allowed=true. Cette porte tranche explicitement avec get_user_tier +
-- tier_at_least — les mêmes fonctions que enforce_premium_feature — et
-- classifie la politique (absente/ambiguë => fermé).
CREATE OR REPLACE FUNCTION public.synastry_preview_gate()
RETURNS TABLE (
  code           TEXT,  -- paid | preview_enabled | preview_disabled | policy_unavailable
  required_tier  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
-- Search path vide (durcissement 2026-09-15, revue opérateur) : chaque
-- objet est qualifié — auth.uid(), public.premium_feature_policy,
-- public.get_user_tier, public.tier_at_least. Un SECURITY DEFINER dont le
-- chemin de recherche suit l’appelant cherche ses objets dans un schéma
-- que l’appelant contrôle.
SET search_path = ''
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_rows   INTEGER;
  v_policy RECORD;
  v_tier   TEXT;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT 'policy_unavailable'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Politique : exactement une ligne. Zéro ou plusieurs = ambigu = fermé.
  SELECT COUNT(*), MIN(pf.required_tier), MIN(pf.free_preview_quota)
    INTO v_rows, v_policy.required_tier, v_policy.free_preview_quota
    FROM public.premium_feature_policy pf
   WHERE pf.feature_key = 'synastry';

  IF v_rows IS DISTINCT FROM 1 THEN
    RETURN QUERY SELECT 'policy_unavailable'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_tier := public.get_user_tier(v_user);

  IF public.tier_at_least(v_tier, v_policy.required_tier) THEN
    RETURN QUERY SELECT 'paid'::TEXT, v_policy.required_tier;
  ELSIF COALESCE(v_policy.free_preview_quota, 0) >= 1 THEN
    RETURN QUERY SELECT 'preview_enabled'::TEXT, v_policy.required_tier;
  ELSE
    -- Ligne présente, quota NULL/0 : aperçu DÉSACTIVÉ. C'est le chemin du
    -- rollback opérationnel — 402, pas 503.
    RETURN QUERY SELECT 'preview_disabled'::TEXT, v_policy.required_tier;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.synastry_preview_gate() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.synastry_preview_gate() TO authenticated;

COMMENT ON FUNCTION public.synastry_preview_gate IS
  'Porte lecture-seule de la synastrie offerte : tier EXPLICITE via get_user_tier+tier_at_least (jamais can_use_premium_feature.allowed, qui ne distingue plus un abonné dun gratuit avec quota). paid | preview_enabled | preview_disabled (quota NULL = rollback => 402) | policy_unavailable (ligne absente/ambiguë => 503). Nécrit rien, ne consomme rien.';

-- =============================================================================
-- 3) Le CLAIM — atomique, APRÈS calcul (défaut n°1 de la revue)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.claim_synastry_free_grant(
  p_target_user_id UUID
)
RETURNS TABLE (
  code               TEXT,       -- allowed_free_new | allowed_free_existing
                                 -- | allowed_paid | free_preview_used_other_target
                                 -- | target_ineligible | preview_disabled
                                 -- | policy_unavailable | unauthorized
  next_available_utc TIMESTAMPTZ -- rempli SEULEMENT sur used_other_target
)
LANGUAGE plpgsql
SECURITY DEFINER
-- Même durcissement : search_path vide, tout qualifié.
SET search_path = ''
AS $$
DECLARE
  v_user    UUID := auth.uid();
  v_today   DATE := (NOW() AT TIME ZONE 'utc')::date;
  v_rows    INTEGER;
  v_quota   INTEGER;
  v_reqtier TEXT;
  v_tier    TEXT;
  v_inserted BOOLEAN;
  v_existing UUID;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT 'unauthorized'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Politique : exactement une ligne, quota >= 1 — sinon fermé ou désactivé.
  SELECT COUNT(*), MIN(pf.free_preview_quota), MIN(pf.required_tier)
    INTO v_rows, v_quota, v_reqtier
    FROM public.premium_feature_policy pf
   WHERE pf.feature_key = 'synastry';

  IF v_rows IS DISTINCT FROM 1 THEN
    RETURN QUERY SELECT 'policy_unavailable'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  IF COALESCE(v_quota, 0) < 1 THEN
    RETURN QUERY SELECT 'preview_disabled'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Tier explicite : un abonné ne crée JAMAIS de grant (défaut n°2).
  v_tier := public.get_user_tier(v_user);
  IF public.tier_at_least(v_tier, v_reqtier) THEN
    RETURN QUERY SELECT 'allowed_paid'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Défense en profondeur : la visibilité est déjà vérifiée par l'edge AVANT
  -- le calcul ; le claim la re-vérifie — même prédicat partagé
  -- (profile_chart_visible) que le picker et can_view_profile_chart.
  -- Une cible devenue inaccessible conserve son grant : le refus ne divulgue
  -- ni l'existence ni l'identité de la cible du jour (décision opérateur).
  IF NOT public.profile_chart_visible(v_user, p_target_user_id) THEN
    RETURN QUERY SELECT 'target_ineligible'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Purge opportuniste BORNÉE (contrat : jour courant + six jours
  -- précédents AU MAXIMUM). Pas de cron non supervisé : chaque claim
  -- nettoie au plus 200 lignes expirées via l’index
  -- idx_synastry_free_grant_purge. Le prédicat < v_today - 6 jours garde
  -- exactement v_today et J−1..J−6, et supprime J−7 et plus anciens ;
  -- le grant du jour courant est structurellement hors d’atteinte.
  DELETE FROM public.synastry_free_grant
   WHERE ctid IN (
     SELECT g.ctid
       FROM public.synastry_free_grant g
      WHERE g.usage_date_utc < v_today - INTERVAL '6 days'
      ORDER BY g.usage_date_utc
      LIMIT 200
   );

  -- LE claim atomique. Un seul INSERT peut gagner par (viewer, jour) :
  -- le perdant reçoit la ligne existante et compare la cible.
  INSERT INTO public.synastry_free_grant (viewer_user_id, usage_date_utc, target_user_id)
  VALUES (v_user, v_today, p_target_user_id)
  ON CONFLICT (viewer_user_id, usage_date_utc)
  DO NOTHING
  RETURNING TRUE INTO v_inserted;

  IF COALESCE(v_inserted, FALSE) THEN
    RETURN QUERY SELECT 'allowed_free_new'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT g.target_user_id INTO v_existing
    FROM public.synastry_free_grant g
   WHERE g.viewer_user_id = v_user
     AND g.usage_date_utc = v_today;

  IF v_existing = p_target_user_id THEN
    -- Rejeu de LA cible du jour : gratuit, illimité dans la journée,
    -- aucune écriture. granted_at original conservé (pas de rafraîchissement
    -- qui pourrait jamais resservir de fenêtre).
    RETURN QUERY SELECT 'allowed_free_existing'::TEXT, NULL::TIMESTAMPTZ;
  ELSE
    -- L'autre cible a été offerte : refus produit, prochaine disponibilité
    -- serveur, AUCUNE identité divulguée.
    RETURN QUERY SELECT
      'free_preview_used_other_target'::TEXT,
      ((v_today + 1)::timestamp AT TIME ZONE 'utc');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_synastry_free_grant(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_synastry_free_grant(UUID) TO authenticated;

COMMENT ON FUNCTION public.claim_synastry_free_grant IS
  'Claim atomique de la comparaison synastrie offerte du jour : appelé PAR L EDGE APRÈS le calcul — aucune donnée navait encore été émise. PK (viewer, usage_date_utc) => jamais deux cibles le même jour, même cible rejouable gratuitement. Tier explicite : un abonné nobtient jamais de grant. Purge opportuniste bornée 200 lignes de J−7 et plus anciens (contrat : jour + 6 précédents). Aucun DELETE de compensation nexiste.';

-- =============================================================================
-- 4) Activer l'aperçu — LA ligne qui fait tout basculer (et son rollback)
-- =============================================================================
UPDATE public.premium_feature_policy
   SET free_preview_quota = 1,
       updated_at = NOW()
 WHERE feature_key = 'synastry';

-- ROLLBACK OPÉRATIONNEL (documenté, testé par synastry_free_grant.test.sql) :
--   UPDATE public.premium_feature_policy
--      SET free_preview_quota = NULL
--    WHERE feature_key = 'synastry';
--   => porte = preview_disabled => 402 insufficient_tier ; claim = preview_disabled
--   => 402 ; abonnés intacts ; AUCUN redéploiement edge requis.

-- =============================================================================
-- 5) Télémétrie minimale — liste blanche étendue, SANS toucher au canonique
-- =============================================================================
-- Les cinq événements validés, SANS target_user_id ni aucune donnée de
-- profil/thème/degré/coordonnée (décision opérateur).
--
-- LA RÉGRESSION QUE CETTE SECTION INTERDIT (revue opérateur, 2026-09-15) :
-- la première mouture de cette migration recréait record_product_event avec
-- SIX arguments — ressuscitant exactement la surcharge que
-- 20260831000002_product_events_attribution.sql DROPPE, et écrasant la
-- signature à 7 arguments qui porte l'attribution différée par
-- client_event_id. Résultat : email_clicked revenait au comportement
-- pré-attribution, et l'entonnoir « clic → actif » redevient aveugle sur le
-- join qui compte. La définition ci-dessous repart du canonique
-- (20260831000002) et n'y APporte qu'une chose : la liste blanche étendue et
-- l'idempotence quotidienne, appliquées UNIQUEMENT aux cinq événements
-- d'aperçu. email_clicked garde chaque sienne, mot pour mot :
--   - p_client_event_id UUID DEFAULT NULL ;
--   - attribution différée ON CONFLICT (client_event_id) ... DO UPDATE ;
--   - COALESCE + WHERE user_id IS NULL : jamais réattribuer une ligne déjà
--     attribuée ;
--   - created_at jamais réécrit (le moment du CLIC, pas celui du login).
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_events_preview_daily
  ON public.product_events (
    user_id,
    event_name,
    ((created_at AT TIME ZONE 'utc')::date)
  )
  WHERE event_name IN (
    'preview_presented', 'preview_succeeded', 'preview_reopened',
    'preview_used_other_target', 'upgrade_clicked'
  );

CREATE OR REPLACE FUNCTION public.record_product_event(
  p_event_name      TEXT,
  p_template        TEXT DEFAULT NULL,
  p_utm_source      TEXT DEFAULT NULL,
  p_utm_campaign    TEXT DEFAULT NULL,
  p_path            TEXT DEFAULT NULL,
  p_platform        TEXT DEFAULT NULL,
  p_client_event_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
-- Durcissement : chemin vide, tout qualifié — même posture que les RPC
-- nouvelles de cette migration. Le comportement est celui du canonique,
-- seul le voisinage change.
SET search_path = ''
AS $$
DECLARE
  c_events    CONSTANT TEXT[] := ARRAY[
    'email_clicked',
    -- Aperçu synastrie (2026-09-15) — vocabulaire clos, idempotent par
    -- ux_product_events_preview_daily (un par lecteur/nom/jour UTC).
    'preview_presented', 'preview_succeeded', 'preview_reopened',
    'preview_used_other_target', 'upgrade_clicked'
  ];
  c_templates CONSTANT TEXT[] := ARRAY[
    'welcome', 'onboarding_day1', 'onboarding_day3', 'onboarding_day5'
  ];
  c_platforms CONSTANT TEXT[] := ARRAY['web', 'mobile'];

  v_path     TEXT;
  v_platform TEXT;
BEGIN
  IF p_event_name IS NULL OR NOT (p_event_name = ANY (c_events)) THEN
    RETURN;
  END IF;

  IF p_event_name = 'email_clicked'
     AND (p_template IS NULL OR NOT (p_template = ANY (c_templates)))
  THEN
    RETURN;
  END IF;

  v_path     := LEFT(SPLIT_PART(COALESCE(p_path, ''), '?', 1), 200);
  v_platform := CASE WHEN p_platform = ANY (c_platforms) THEN p_platform ELSE NULL END;

  -- ── Les cinq événements d'aperçu ─────────────────────────────────────────
  -- Toujours émis par l'edge ou le web POUR un lecteur identifié ; sans
  -- session il n'y a rien à dédupliquer ni à mesurer — refus silencieux.
  -- Idempotence quotidienne ciblée : la cible de conflit désigne l'index
  -- partiel ux_product_events_preview_daily (les cinq noms, RIEN qu'eux),
  -- donc un doublon (lecteur, nom, jour UTC) est ignoré — et AUCUN autre
  -- conflit (client_event_id en particulier) n'est intercepté ici.
  IF p_event_name <> 'email_clicked' THEN
    IF auth.uid() IS NULL THEN
      RETURN;
    END IF;
    INSERT INTO public.product_events
      (user_id, event_name, template, utm_source, utm_campaign, path, platform)
    VALUES (auth.uid(), p_event_name, p_template,
            LEFT(p_utm_source, 64), LEFT(p_utm_campaign, 64), v_path, v_platform)
    ON CONFLICT (
      user_id, event_name, ((created_at AT TIME ZONE 'utc')::date)
    ) WHERE event_name IN (
      'preview_presented', 'preview_succeeded', 'preview_reopened',
      'preview_used_other_target', 'upgrade_clicked'
    )
    DO NOTHING;
    RETURN;
  END IF;

  -- ── email_clicked : le canonique de 20260831000002, mot pour mot ────────
  IF p_client_event_id IS NULL THEN
    -- No idempotency key: behave exactly as before this migration.
    INSERT INTO public.product_events
      (user_id, event_name, template, utm_source, utm_campaign, path, platform)
    VALUES (auth.uid(), p_event_name, p_template,
            LEFT(p_utm_source, 64), LEFT(p_utm_campaign, 64), v_path, v_platform);
    RETURN;
  END IF;

  INSERT INTO public.product_events
    (user_id, event_name, template, utm_source, utm_campaign, path, platform,
     client_event_id)
  VALUES (auth.uid(), p_event_name, p_template,
          LEFT(p_utm_source, 64), LEFT(p_utm_campaign, 64), v_path, v_platform,
          p_client_event_id)
  ON CONFLICT (client_event_id) WHERE client_event_id IS NOT NULL
  DO UPDATE
    -- COALESCE, never overwrite. An already-attributed row keeps its reader:
    -- the second call can only fill a hole, never reassign a click from one
    -- account to another. `created_at` is left alone so the row keeps the
    -- moment of the CLICK, not the moment of the sign-in.
    SET user_id = COALESCE(public.product_events.user_id, EXCLUDED.user_id)
    WHERE public.product_events.user_id IS NULL
      AND EXCLUDED.user_id IS NOT NULL;
END;
$$;

-- La surcharge à 6 arguments est la régression interdite : si une application
-- partielle l'a laissée, elle disparaît ici. Le canonique l'avait déjà dropée
-- (20260831000002) — ce DROP est défensif, pas structurel.
DROP FUNCTION IF EXISTS public.record_product_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

COMMENT ON FUNCTION public.record_product_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) IS
  'Append one product event, or attribute an existing one. Whitelists event name, template and platform; truncates attribution strings; strips any query string from the path. With a client_event_id, a repeat call upgrades the row from anonymous to identified instead of inserting a duplicate — never reassigning an already-attributed click. The five synastry preview events are additionally idempotent per (reader, event, UTC day) via ux_product_events_preview_daily, and require a session. Silently ignores anything unrecognised.';

REVOKE EXECUTE ON FUNCTION public.record_product_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_product_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO anon, authenticated;

-- =============================================================================
-- 6) Outils d'inspection ACL — PUBLIC est un PSEUDO-RÔLE, pas une chaîne
-- =============================================================================
-- `has_table_privilege('public', ...)` n'est PAS une preuve : la chaîne
-- 'public' y est interprétée comme un nom de schéma/limite d'API, et le
-- résultat n'atteste rien sur le pseudo-rôle PUBLIC. La preuve est l'ACL
-- elle-même : aclexplode() sur proacl (fonctions) ou relacl (tables), en
-- remplaçant un ACL NULL par son défaut — car un objet SANS proacl explicite
-- accorde EXECUTE à PUBLIC par défaut, et c'est précisément ce que le défaut
-- encode. grantee = 0 EST le pseudo-rôle PUBLIC (0 pour « tous », cf.
-- pg_authid.oid jamais 0). Ces deux helpers servent la self-verification
-- ci-dessous ET la régression du test synastry_free_grant.test.sql (section
-- R) ; même patron que public._assert_cron_secret (20260910000001).
--
-- PAS DE STRICT (revue 4, P0) : « p_privilege DEFAULT NULL » + STRICT
-- faisait retourner NULL sans exécuter la requête à tout appel
-- mono-argument — un contrôle vert parce qu'il n'avait rien vérifié.
-- Corollaire : un privilège inconnu lève une EXCEPTION plutôt que de
-- répondre FALSE en silence ; la seule façon d'obtenir FALSE est qu'aucune
-- entrée grantee=0 n'existe. Tous les sites appellent avec IS NOT FALSE /
-- IS FALSE / IS TRUE — jamais une condition booléienne nue.
CREATE OR REPLACE FUNCTION public._acl_public_fn_privilege(
  p_func_oid  OID,
  p_privilege TEXT DEFAULT 'EXECUTE'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_privilege IS NULL THEN
    p_privilege := 'EXECUTE';
  END IF;
  IF p_privilege <> 'EXECUTE' THEN
    RAISE EXCEPTION 'privilège de fonction inconnu : «%» (EXECUTE est le seul)', p_privilege;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc f
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(f.proacl, pg_catalog.acldefault('f', f.proowner))
           ) AS a
   -- PAS de liste de définition de colonnes sur aclexplode (incident n°2,
   -- 16 sept 2026 : erreur 42601 « redundant for a function with OUT
   -- parameters » — les noms grantor/grantee/privilege_type/is_grantable
   -- viennent des paramètres OUT déclarés par aclexplode elle-même).
     WHERE f.oid = p_func_oid
       AND a.grantee = 0                 -- 0 = pseudo-rôle PUBLIC
       AND a.privilege_type = p_privilege
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._acl_public_tbl_privilege(
  p_table_oid OID,
  p_privilege TEXT DEFAULT NULL          -- NULL = N'IMPORTE quel privilège
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_privilege IS NOT NULL AND p_privilege NOT IN (
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ) THEN
    RAISE EXCEPTION 'privilège de table inconnu : «%»', p_privilege;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
           ) AS a
   -- Même correctif que ci-dessus : alias nu, jamais de liste de colonnes.
     WHERE c.oid = p_table_oid
       AND a.grantee = 0                 -- 0 = pseudo-rôle PUBLIC
       AND (p_privilege IS NULL OR a.privilege_type = p_privilege)
  );
END;
$$;

-- Un objet sans REVOKE explicite accorde EXECUTE à PUBLIC par défaut : ces
-- helpers sont donc eux-mêmes verrouillés, et la self-verify le prouve.
REVOKE ALL ON FUNCTION public._acl_public_fn_privilege(OID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._acl_public_tbl_privilege(OID, TEXT) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 7) Auto-vérification — la migration refuse de committer autrement
-- =============================================================================
DO $$
DECLARE
  v_rows     INTEGER;
  v_quota    INTEGER;
  v_pk_ok    BOOLEAN;
  v_rls      BOOLEAN;
  v_grants   TEXT;
  v_def      TEXT;
  v_norm     TEXT;
  v_idx      TEXT;
  v_nargs    INTEGER;
  v_over     INTEGER;
  v_event    TEXT;
  v_ix       RECORD;
BEGIN
  IF to_regclass('public.synastry_free_grant') IS NULL THEN
    RAISE EXCEPTION 'synastry_free_grant absente';
  END IF;

  -- PK exacte : (viewer, usage_date_utc) — LA garantie une-cible-par-jour.
  --
  -- INCIDENT D'APPLICATION (16 sept 2026, production, ANNULE PROPREMENT) :
  -- la première mouture comparait i.indkey à la concaténation des deux
  -- pg_attribute.attnum — `smallint || smallint` n'existe pas (erreur
  -- 42883), la self-verify a refusé de committer, tout a été annulé (table
  -- absente, quota NULL, zéro fonction : mesuré). Forme portable ci-dessous :
  -- les colonnes de la PK, agrégées DANS L'ORDRE de indkey via unnest WITH
  -- ORDINALITY, comparées aux deux noms attendus.
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    WHERE i.indrelid = 'public.synastry_free_grant'::regclass
      AND i.indisprimary
      AND (
        SELECT pg_catalog.array_agg(a.attname ORDER BY key_col.ordinality)
        FROM pg_catalog.unnest(i.indkey)
             WITH ORDINALITY AS key_col(attnum, ordinality)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = i.indrelid
         AND a.attnum = key_col.attnum
      ) = ARRAY['viewer_user_id', 'usage_date_utc']::name[]
  )
  INTO v_pk_ok;
  IF NOT v_pk_ok THEN
    RAISE EXCEPTION 'PK de synastry_free_grant != (viewer_user_id, usage_date_utc)';
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE oid = 'public.synastry_free_grant'::regclass;
  IF NOT v_rls THEN RAISE EXCEPTION 'RLS inactive sur synastry_free_grant'; END IF;

  -- ── ACL de la table : PUBLIC par inspection réelle, puis chaque rôle
  --    nommé séparément (revue 3, blocage 1). IS NOT FALSE : TRUE ou NULL
  --    refusent tous deux — un helper indéterminé n’est jamais un vert
  --    (revue 4, P0).
  IF public._acl_public_tbl_privilege('public.synastry_free_grant'::regclass) IS NOT FALSE THEN
    RAISE EXCEPTION 'PUBLIC (grantee=0 dans relacl) détient un privilège sur synastry_free_grant, ou lecture indéterminée';
  END IF;
  IF has_table_privilege('anon', 'public.synastry_free_grant', 'SELECT')
     OR has_table_privilege('anon', 'public.synastry_free_grant', 'INSERT')
     OR has_table_privilege('anon', 'public.synastry_free_grant', 'UPDATE')
     OR has_table_privilege('anon', 'public.synastry_free_grant', 'DELETE') THEN
    RAISE EXCEPTION 'anon détient un privilège sur synastry_free_grant';
  END IF;
  IF has_table_privilege('authenticated', 'public.synastry_free_grant', 'SELECT')
     OR has_table_privilege('authenticated', 'public.synastry_free_grant', 'INSERT')
     OR has_table_privilege('authenticated', 'public.synastry_free_grant', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.synastry_free_grant', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated détient un privilège sur synastry_free_grant';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.synastry_free_grant', 'SELECT') THEN
    RAISE EXCEPTION 'service_role ne peut pas lire synastry_free_grant (diagnostics)';
  END IF;
  -- service_role : LECTURE seule (incident n°3). Chaque privilège de
  -- mutation est refusé INDÉPENDAMMMENT — la base a prouvé qu'elle accorde
  -- ALL par défaut, chaque droit retiré doit donc être vérifié retiré.
  FOR v_event IN SELECT unnest(ARRAY[
    'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ])
  LOOP
    IF has_table_privilege('service_role', 'public.synastry_free_grant', v_event) IS TRUE THEN
      RAISE EXCEPTION 'service_role détient % sur synastry_free_grant : lecture seule, refusé', v_event;
    END IF;
  END LOOP;

  -- ── ACL des fonctions : PUBLIC par inspection réelle, une par une,
  --    IS NOT FALSE partout (NULL échoue, jamais un vert silencieux).
  IF public._acl_public_fn_privilege('public.synastry_preview_gate()'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'PUBLIC (grantee=0 dans proacl) peut exécuter synastry_preview_gate, ou lecture indéterminée';
  END IF;
  IF public._acl_public_fn_privilege('public.claim_synastry_free_grant(uuid)'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'PUBLIC (grantee=0 dans proacl) peut exécuter claim_synastry_free_grant, ou lecture indéterminée';
  END IF;
  IF public._acl_public_fn_privilege('public.record_product_event(text,text,text,text,text,text,uuid)'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'PUBLIC (grantee=0 dans proacl) peut exécuter record_product_event, ou lecture indéterminée';
  END IF;
  IF public._acl_public_fn_privilege('public._acl_public_fn_privilege(oid,text)'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'PUBLIC peut exécuter _acl_public_fn_privilege, ou lecture indéterminée';
  END IF;
  IF public._acl_public_fn_privilege('public._acl_public_tbl_privilege(oid,text)'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'PUBLIC peut exécuter _acl_public_tbl_privilege, ou lecture indéterminée';
  END IF;
  IF has_function_privilege('anon', 'public.synastry_preview_gate()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.claim_synastry_free_grant(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut exécuter une RPC de la synastrie offerte';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.synastry_preview_gate()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.claim_synastry_free_grant(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ne peut pas exécuter les RPC de la synastrie offerte';
  END IF;
  IF has_function_privilege('anon', 'public._acl_public_fn_privilege(oid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._acl_public_fn_privilege(oid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._acl_public_tbl_privilege(oid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._acl_public_tbl_privilege(oid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'un rôle client peut exécuter un outil d inspection ACL';
  END IF;

  -- Durcissement : aucun SECURITY DEFINER de cette migration ne suit un
  -- chemin de recherche non vide.
  FOR v_grants IN
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('synastry_preview_gate', 'claim_synastry_free_grant',
                        'record_product_event',
                        '_acl_public_fn_privilege', '_acl_public_tbl_privilege')
  LOOP
    IF v_grants LIKE '%SET search_path = public%' THEN
      RAISE EXCEPTION 'un SECURITY DEFINER de cette migration garde search_path = public';
    END IF;
  END LOOP;

  -- Rétention : le prédicat installé est bien jour + 6 précédents.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'claim_synastry_free_grant';
  IF v_def NOT LIKE '%usage_date_utc < v_today - INTERVAL ''6 days''%' THEN
    RAISE EXCEPTION 'prédicat de purge != J−7 et plus anciens (contrat : jour courant + six précédents)';
  END IF;
  IF v_def NOT LIKE '%LIMIT 200%' THEN
    RAISE EXCEPTION 'purge sans borne de 200 lignes';
  END IF;

  -- ── Télémétrie : CHAQUE exigence lève indépendamment (revue 3, blocage 3).
  SELECT COUNT(*), MAX(p.pronargs) INTO v_over, v_nargs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_product_event';
  IF v_over <> 1 THEN
    RAISE EXCEPTION 'record_product_event : % signatures — surcharge interdite (une seule attendue)', v_over;
  END IF;
  IF v_nargs <> 7 THEN
    RAISE EXCEPTION 'record_product_event : % argument(s) — la signature canonique en a 7', v_nargs;
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_product_event'
     AND p.pronargs = 7;
  v_norm := regexp_replace(v_def, '\s+', ' ', 'g');

  IF v_norm NOT LIKE '%p_client_event_id%' THEN
    RAISE EXCEPTION 'télémétrie : p_client_event_id absent de la signature/corps';
  END IF;
  IF v_norm NOT LIKE '%ON CONFLICT (client_event_id) WHERE client_event_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'télémétrie : branche d attribution ON CONFLICT (client_event_id) absente ou altérée';
  END IF;
  FOR v_event IN SELECT unnest(ARRAY[
    'preview_presented', 'preview_succeeded', 'preview_reopened',
    'preview_used_other_target', 'upgrade_clicked'
  ])
  LOOP
    IF v_norm NOT LIKE '%' || v_event || '%' THEN
      RAISE EXCEPTION 'télémétrie : événement d aperçu "%" absent de la liste blanche ET/OU de la cible de conflit', v_event;
    END IF;
  END LOOP;
  IF v_norm NOT LIKE '%ON CONFLICT ( user_id, event_name, ((created_at AT TIME ZONE ''utc'')::date) ) WHERE event_name IN (%' THEN
    RAISE EXCEPTION 'télémétrie : cible de conflit quotidienne des aperçus absente ou altérée';
  END IF;
  IF v_norm NOT LIKE '%DO UPDATE%COALESCE(public.product_events.user_id, EXCLUDED.user_id)%user_id IS NULL%' THEN
    RAISE EXCEPTION 'télémétrie : la garantie « jamais réattribuer » (COALESCE + WHERE IS NULL) a disparu';
  END IF;

  -- L'index partiel : preuve STRUCTURELLE, jamais textuelle
  -- (incident n°4 : pg_get_indexdef NORMALISE sa sortie — « AT TIME ZONE
  -- 'utc' » peut y être rendu « timezone('utc'::text, …) », et comparer la
  -- définition entière à une chaîne attendue teste le FORMATAGE choisi par
  -- PostgreSQL, pas l’index). Ci-dessous : les trois clés et le prédicat,
  -- position par position, sur les catalogues.
  --
  -- INCIDENT PRÉVENU AVANT APPLICATION n°5 : indkey est un int2vector
  -- INDEXÉ À PARTIR DE 0 — indkey[0] = première clé, indkey[1] = deuxième,
  -- indkey[2] = troisième (= 0 : expression). La 1-based de pg_get_indexdef
  -- (index_oid, column_no, …) est une AUTRE convention : son « 3 » désigne
  -- bien la troisième clé et reste correct. Ne jamais confondre les deux.
  SELECT i.indisunique              AS indisunique,
         i.indnkeyatts              AS indnkeyatts,
         i.indkey[0]                AS first_key_attnum,
         i.indkey[1]                AS second_key_attnum,
         i.indkey[2]                AS third_key_attnum,
         (SELECT a.attname FROM pg_catalog.pg_attribute a
           WHERE a.attrelid = i.indrelid AND a.attnum = i.indkey[0]) AS first_key_column,
         (SELECT a.attname FROM pg_catalog.pg_attribute a
           WHERE a.attrelid = i.indrelid AND a.attnum = i.indkey[1]) AS second_key_column,
         pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS pred_expr
    INTO v_ix
    FROM pg_catalog.pg_index i
   WHERE i.indexrelid = 'public.ux_product_events_preview_daily'::regclass
     -- l'index doit être SUR product_events : sinon NOT FOUND ci-dessous.
     AND i.indrelid = 'public.product_events'::regclass;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'index d idempotence télémétrique absent (ou pas sur product_events)';
  END IF;
  IF v_ix.indisunique IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'ux_product_events_preview_daily : plus unique';
  END IF;
  IF v_ix.indnkeyatts <> 3 THEN
    RAISE EXCEPTION 'ux_product_events_preview_daily : % clé(s) — attendu exactement 3', v_ix.indnkeyatts;
  END IF;
  -- Positions 1 et 2 : les colonnes nommées, EXACTEMENT (0-based : [0], [1]).
  IF v_ix.first_key_column IS DISTINCT FROM 'user_id' THEN
    RAISE EXCEPTION 'ux_product_events_preview_daily : clé 1 = «%» — attendu user_id', v_ix.first_key_column;
  END IF;
  IF v_ix.second_key_column IS DISTINCT FROM 'event_name' THEN
    RAISE EXCEPTION 'ux_product_events_preview_daily : clé 2 = «%» — attendu event_name', v_ix.second_key_column;
  END IF;
  -- Position 3 : une EXPRESSION (indkey[2] = 0 marque l'absence de colonne).
  IF v_ix.third_key_attnum IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'ux_product_events_preview_daily : la clé 3 doit être une expression (indkey[2] = 0), pas une colonne';
  END IF;
  -- L'expression de la clé 3, SÉMANTIQUEMENT : created_at, UTC, conversion
  -- en date — quelle que soit la forme rendue (AT TIME ZONE ou timezone()).
  -- NB : pg_get_indexdef est 1-based : « 3 » = bien la TROISIÈME clé.
  SELECT pg_catalog.pg_get_indexdef('public.ux_product_events_preview_daily'::regclass, 3, true) INTO v_idx;
  v_norm := lower(v_idx);
  IF v_norm NOT LIKE '%created_at%'
     OR v_norm NOT LIKE '%utc%'
     OR v_norm NOT LIKE '%date%' THEN
    RAISE EXCEPTION 'ux_product_events_preview_daily : clé 3 != jour UTC de created_at (rendue : %)', v_idx;
  END IF;
  -- Le prédicat partiel, par pg_get_expr : chacun des cinq événements…
  FOR v_event IN SELECT unnest(ARRAY[
    'preview_presented', 'preview_succeeded', 'preview_reopened',
    'preview_used_other_target', 'upgrade_clicked'
  ])
  LOOP
    IF v_ix.pred_expr NOT LIKE '%' || v_event || '%' THEN
      RAISE EXCEPTION 'ux_product_events_preview_daily : le prédicat ne couvre plus «%»', v_event;
    END IF;
  END LOOP;
  -- …ET exactement cinq constantes d'événement : un sixième ajout silencieux
  -- (ou un renommage) change le compte — chaque constante normalisée porte
  -- un « ::text » dans le rendu du prédicat.
  IF (length(v_ix.pred_expr) - length(replace(v_ix.pred_expr, '''::text', '')))
       / length('''::text') <> 5 THEN
    RAISE EXCEPTION 'ux_product_events_preview_daily : le prédicat porte un nombre de constantes != 5 — ajout ou retrait silencieux';
  END IF;
  IF to_regclass('public.ux_product_events_client_event_id') IS NULL THEN
    RAISE EXCEPTION 'index d attribution client_event_id (20260831000002) absent : la migration l aurait détruit';
  END IF;
  IF NOT has_function_privilege('anon', 'public.record_product_event(text,text,text,text,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.record_product_event(text,text,text,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'record_product_event : grants anon/authenticated perdus';
  END IF;

  -- Politique : exactement une ligne, quota = 1, celestial.
  SELECT COUNT(*), MIN(free_preview_quota) INTO v_rows, v_quota
    FROM public.premium_feature_policy
   WHERE feature_key = 'synastry';
  IF v_rows <> 1 OR v_quota <> 1 THEN
    RAISE EXCEPTION 'politique synastry : % ligne(s), quota % — attendu 1 ligne, quota 1', v_rows, v_quota;
  END IF;

  -- Les abonnés existants restent servis : le tier requis n'a pas bougé.
  SELECT required_tier INTO v_grants
    FROM public.premium_feature_policy
   WHERE feature_key = 'synastry';
  IF v_grants IS DISTINCT FROM 'celestial' THEN
    RAISE EXCEPTION 'required_tier de synastry modifié (%) — la migration ne doit pas y toucher', v_grants;
  END IF;

  RAISE NOTICE 'Synastrie offerte : table, porte, claim (rétention jour+6), politique (quota=1), télémétrie (7 args, attribution intacte), ACL PUBLIC inspectées — en place.';
END
$$;

commit;

-- =============================================================================
-- APRÈS APPLICATION — diagnostic en lecture seule
-- =============================================================================
--   SELECT * FROM public.synastry_preview_gate();  -- connecté : paid|enabled|disabled
--   SELECT code, COUNT(*) FROM public.synastry_free_grant GROUP BY 1; -- vide au départ
-- Tests comportementaux (rollback-safe) :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/synastry_free_grant.test.sql
-- =============================================================================
