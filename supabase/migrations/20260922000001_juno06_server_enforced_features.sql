-- =============================================================================
-- JUNO-06 — M1a : classification honnête des politiques premium (2026-09-23).
-- NOT APPLIED: activation backend non autorisée à ce jour ; production apply
-- ses migrations par son propre processus revu (jamais db push — JUNO-15).
--
-- PROVENANCE (pourquoi cette migration peut être amendée) : fusionnée sur
-- master via la PR #69 (merge 491e861) dans une version qui mêlait
-- classification et mutations produit, puis AMENDÉE avant toute première
-- application. La Phase 0 (lecture seule, 2026-09-23, projet
-- qtihezzbuubnyvrjdkjd — sortie archivée avec le runbook d'activation) a
-- prouvé : cette migration est ABSENTE de l'historique distant
-- (supabase_migrations.schema_migrations ne contient aucun 20260922*),
-- le catalogue Production compte exactement 15 lignes conformes à la
-- reconstruction versionnée, et synastry.free_preview_quota = 1. Modifier un
-- fichier fusionné mais jamais appliqué est donc sûr ; si cette prémissse
-- devait être fausse (migration déjà appliquée quelque part), la règle
-- opérateur exige une migration corrective NOUVELLE, jamais de réécriture —
-- et le self-check ci-dessous (section 0) refuserait de committer de toute
-- façon sur un état divergent.
--
-- PÉRIMÈTRE M1a — STRICTEMENT ADDITIF, ZÉRO CHANGEMENT PRODUIT :
--   * ajoute la colonne enforcement_class et classe les 15 lignes EXISTANTES
--     du catalogue (aucun INSERT, aucun DELETE — les 15 lignes existent en
--     Production, preuve Phase 0) ;
--   * ne modifie AUCUN required_tier, daily_quota ni free_preview_quota ;
--   * ne touche AUCUNE ligne utilisateur (premium_usage, subscriptions :
--     comptages vérifiés identiques avant/après, section 4) ;
--   * synastry.free_preview_quota reste 1 (décision produit 2026-09-23) ;
--   * les mutations produit (6 upserts, 8 previews 1/jour, suppression des
--     graines mortes) sont M1c : INTERDITES jusqu'au build 131 + autorisation
--     produit dédiée ; elles vivent uniquement en BROUILLON sous
--     docs/runbooks/sql/2026-09-juno-06-m1c-product-policies-DRAFT.sql et
--     JAMAIS dans supabase/migrations (règle validate:premium-gating).
--
-- LES CINQ CLASSES — trois niveaux de sécurité, deux marqueurs d'inventaire.
-- Seules les trois premières décrivent une protection ; legacy_alias et
-- legacy_unused NE SONT PAS des niveaux de sécurité : elles disent qu'une
-- ligne n'est PAS une fonctionnalité auditée (compatibilité ou graine morte)
-- et l'excluent des compteurs 2/7/2 par construction.
--
--   server_enforced_data (2/11) — le RÉSULTAT premium est produit par le
--     serveur après autorisation ; moteur/corpus absents de l'APK. Un APK
--     patché ne peut pas le produire.
--       tarot_cosmic, tarot_monthly — la lecture est tirée par l'edge
--         premium-tarot-reading depuis l'artefact committé tarot.generated.ts
--         (généré de packages/shared par build:edge-tarot, contrat sha en
--         CI) ; aucun fichier sous apps/mobile n'importe @astro/shared/tarot.
--
--   server_metered_ui (7/11) — la décision d'ACCÈS est serveur (entitlement
--     + preview + quota, dépense enregistrée côté serveur) mais le résultat
--     reste produisible hors ligne : un APK patché PEUT le produire. Du
--     metering honnête, pas de la protection d'extraction.
--       natal_chart (propre birth_chart + moteur astro embarqué), synastry
--       (lecture publiée serveur mais fallback local embarqué),
--       conversation_guide (corpus ~35 Ko dans le binaire), daily/monthly
--       _horoscope (libellés locaux seedés), lucky_days (const WINDOWS),
--       date_planner (tableaux i18n locaux).
--
--   public_content (2/11) — octets publics statiques dans chaque APK ; la
--     porte est présentationnelle et un client patché est indistinguable
--     d'un payant. Décision produit assumée : garder la porte pour la
--     majorité honnête, documenter ici qu'elle n'est PAS une frontière.
--       planetary_transits, retrograde_alerts (consts THEMES ; V2 a retiré
--       l'éphéméride).
--
--   legacy_alias (1 ligne) — alias de compatibilité, PAS une fonctionnalité
--     auditée. `tarot` est l'ancienne clé pré-split (20260511000002) :
--     les clients installés d'avant l'éclat l'appellent encore — la ligne
--     DOIT survivre pour que leur gate ne réponde pas unknown_feature
--     (contrat build 130). En pratique elle résout par le même enforce que
--     sa cible (tarot_monthly → server_enforced_data à l'effet), mais
--     l'inventaire la compte à part : elle n'entre JAMAIS dans les 2/7/2.
--
--   legacy_unused (3 lignes) — graines mortes de 20260419000006, sans aucun
--     chemin client (web ou mobile) depuis la retraite des fonctionnalités
--     correspondantes. Elles ne doivent JAMAIS être présentées comme
--     protégées par quoi que ce soit. Leur suppression est un changement
--     produit (M1c) : M1a les classe, ne les supprime pas.
--       compatibility_details, priority_messages, likes_you_see_who.
--
-- COMPTEURS AUDITÉS (les 11 fonctionnalités client, jamais les marqueurs) :
--   server_enforced_data 2 · server_metered_ui 7 · public_content 2.
--   Le verdict public reste : JUNO-06 PARTIELLEMENT CORRIGÉ — 2/11
--   réellement protégés serveur, 9/11 contournables dans l'APK.
--
-- CONTRAT BUILD 130 : cette migration ne change RIEN de visible pour le
-- build livré — mêmes clés, mêmes tiers, mêmes quotas, mêmes previews ;
-- aucun chemin 130 ne lit ni n'écrit enforcement_class. La colonne est
-- additive ; le CHECK n'entrave aucun INSERT/UPDATE existant (les graines
-- futures DOIVENT déclarer une classe — c'est le point).
--
-- EXTENSIBILITÉ DU CHECK : ajouter une classe plus tard = un ALTER standard
-- (DROP CONSTRAINT + ADD CHECK avec la liste étendue, en migration revue) ;
-- aucune réécriture dangereuse : la contrainte ne porte que cette colonne.
-- =============================================================================

begin;

-- Isolation REPEATABLE READ, AVANT toute lecture (décision opérateur
-- 2026-09-23) : les comptages premium_usage/subscriptions des preuves
-- d'absence-de-mutation sont pris sur un SNAPSHOT unique — une activité
-- utilisateur concurrente ne peut plus créer de faux échec, tandis que les
-- propres écritures de cette transaction restent visibles de ses lectures.
-- Aucune table métier n'est verrouillée pour cette preuve négative (les
-- COUNT ne prennent que des ACCESS SHARE momentanés).
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- -----------------------------------------------------------------------------
-- 0) Snapshot PRE-M1a encodé depuis la Phase 0 (sans updated_at — la
--    classification peut légitimement toucher cette métadonnée). Toute
--    divergence avec la capture = refus de committer AVANT toute mutation.
--    Les compteurs utilisateurs sont pris ici et revérifiés en section 3.5 :
--    M1a ne touche AUCUNE ligne utilisateur (stable par construction sous
--    le snapshot REPEATABLE READ ci-dessus).
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _juno06_m1a_catalog_pre AS
SELECT feature_key, required_tier, daily_quota, free_preview_quota
  FROM public.premium_feature_policy;

CREATE TEMP TABLE _juno06_m1a_userrows_pre AS
SELECT (SELECT COUNT(*) FROM public.premium_usage)     AS premium_usage_rows,
       (SELECT COUNT(*) FROM public.subscriptions)     AS subscriptions_rows;

DO $$
DECLARE
  -- Snapshot Phase 0 (2026-09-23, projet qtihezzbuubnyvrjdkjd) :
  -- tier|daily_quota|free_preview_quota pour les 15 lignes, '' = NULL.
  v_expected CONSTANT TEXT[] := ARRAY[
    'compatibility_details|celestial|50|',
    'conversation_guide|celestial|100|1',
    'daily_horoscope|celestial|50|',
    'date_planner|cosmic|10|',
    'likes_you_see_who|celestial|50|',
    'lucky_days|cosmic||',
    'monthly_horoscope|cosmic||',
    'natal_chart|celestial||1',
    'planetary_transits|cosmic||',
    'priority_messages|celestial|100|',
    'retrograde_alerts|cosmic||',
    'synastry|celestial|20|1',
    'tarot|cosmic|10|',
    'tarot_cosmic|cosmic|10|',
    'tarot_monthly|celestial||'
  ];
  v_actual TEXT[];
BEGIN
  SELECT COALESCE(array_agg(feature_key || '|' || required_tier || '|' ||
         COALESCE(daily_quota::text,'') || '|' ||
         COALESCE(free_preview_quota::text,'') ORDER BY feature_key), '{}')
    INTO v_actual
    FROM _juno06_m1a_catalog_pre;

  IF v_actual <> v_expected THEN
    RAISE EXCEPTION
      'M1a self-check (pre) : le catalogue ne correspond pas à la capture Phase 0.%' ||
      ' Attendu : % — Obtenu : % (clé manquante, clé inconnue ou valeur tier/quota/preview divergente)',
      E'\n', v_expected, v_actual;
  END IF;

  IF (SELECT COUNT(*) FROM _juno06_m1a_catalog_pre) <> 15 THEN
    RAISE EXCEPTION 'M1a self-check (pre) : 15 lignes attendues exactement (aucune inconnue), obtenu %',
      (SELECT COUNT(*) FROM _juno06_m1a_catalog_pre);
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1) La colonne, puis quinze classifications littérales — RIEN d'autre dans
--    chaque statement (aucun tier, aucun quota, aucune preview, aucun
--    DELETE, aucun INSERT : validate:premium-gating lit ce texte et refuse
--    toute mutation produit dans ce fichier).
-- -----------------------------------------------------------------------------
ALTER TABLE public.premium_feature_policy
  ADD COLUMN IF NOT EXISTS enforcement_class TEXT;

-- Les 11 fonctionnalités auditées (compteurs 2/7/2) -------------------------
UPDATE public.premium_feature_policy
   SET enforcement_class = 'server_enforced_data', updated_at = NOW()
 WHERE feature_key = 'tarot_cosmic';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'server_enforced_data', updated_at = NOW()
 WHERE feature_key = 'tarot_monthly';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'server_metered_ui', updated_at = NOW()
 WHERE feature_key = 'natal_chart';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'server_metered_ui', updated_at = NOW()
 WHERE feature_key = 'conversation_guide';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'server_metered_ui', updated_at = NOW()
 WHERE feature_key = 'synastry';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'server_metered_ui', updated_at = NOW()
 WHERE feature_key = 'daily_horoscope';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'server_metered_ui', updated_at = NOW()
 WHERE feature_key = 'monthly_horoscope';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'server_metered_ui', updated_at = NOW()
 WHERE feature_key = 'lucky_days';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'server_metered_ui', updated_at = NOW()
 WHERE feature_key = 'date_planner';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'public_content', updated_at = NOW()
 WHERE feature_key = 'planetary_transits';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'public_content', updated_at = NOW()
 WHERE feature_key = 'retrograde_alerts';

-- Les 4 lignes historiques (marqueurs d'inventaire, PAS des niveaux de
-- sécurité, jamais comptées dans 2/7/2) -------------------------------------
UPDATE public.premium_feature_policy
   SET enforcement_class = 'legacy_alias', updated_at = NOW()
 WHERE feature_key = 'tarot';            -- contrat build 130 : la ligne survit

UPDATE public.premium_feature_policy
   SET enforcement_class = 'legacy_unused', updated_at = NOW()
 WHERE feature_key = 'compatibility_details';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'legacy_unused', updated_at = NOW()
 WHERE feature_key = 'priority_messages';

UPDATE public.premium_feature_policy
   SET enforcement_class = 'legacy_unused', updated_at = NOW()
 WHERE feature_key = 'likes_you_see_who';

-- -----------------------------------------------------------------------------
-- 2) Contrainte, dans l'ordre exigé par la revue (décision opérateur
--    2026-09-23) : la colonne est ajoutée NULLABLE et SANS DEFAULT en
--    section 1 ; les 15 clés connues sont classées nommément ci-dessus ;
--    les clés inconnues sont refusées par le snapshot pré-encodé (section 0)
--    ET par l'assertion de classes exactes (section 3.2). Ici : le CHECK
--    d'abord, puis — section 3.4, APRÈS la preuve qu'aucune valeur n'est
--    restée NULL — le NOT NULL.
--
--    AUCUN DEFAULT, définitivement : « toute nouvelle clé exige une
--    classification explicite ». Un INSERT sans enforcement_class doit
--    ÉCHOUER (23502), jamais recevoir silencieusement un marqueur
--    historique — c'est le contrat inversé du test C8
--    (supabase/tests/juno06_server_enforced_features.test.sql) et une règle
--    de scripts/validate-premium-gating.mjs.
-- -----------------------------------------------------------------------------
ALTER TABLE public.premium_feature_policy
  DROP CONSTRAINT IF EXISTS premium_feature_policy_enforcement_class_check;
ALTER TABLE public.premium_feature_policy
  ADD CONSTRAINT premium_feature_policy_enforcement_class_check
  CHECK (enforcement_class IN (
    'server_enforced_data', 'server_metered_ui', 'public_content',
    'legacy_alias', 'legacy_unused'
  )) NOT VALID; -- VALIDÉ en section 3.6, après le NOT NULL.

-- -----------------------------------------------------------------------------
-- 3) Auto-vérification finale (règle maison 20260903000003 : une migration
--    qui touche aux privilèges/au schéma se prouve elle-même avant commit).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_classes_expected CONSTANT TEXT[] := ARRAY[
    'compatibility_details|legacy_unused',
    'conversation_guide|server_metered_ui',
    'daily_horoscope|server_metered_ui',
    'date_planner|server_metered_ui',
    'likes_you_see_who|legacy_unused',
    'lucky_days|server_metered_ui',
    'monthly_horoscope|server_metered_ui',
    'natal_chart|server_metered_ui',
    'planetary_transits|public_content',
    'priority_messages|legacy_unused',
    'retrograde_alerts|public_content',
    'synastry|server_metered_ui',
    'tarot|legacy_alias',
    'tarot_cosmic|server_enforced_data',
    'tarot_monthly|server_enforced_data'
  ];
  v_audited CONSTANT TEXT[] := ARRAY[
    'natal_chart','conversation_guide','synastry','daily_horoscope',
    'monthly_horoscope','lucky_days','date_planner',
    'planetary_transits','retrograde_alerts','tarot_cosmic','tarot_monthly'
  ];
  v_classes_actual TEXT[];
  v_count INT;
  v_bad RECORD;
BEGIN
  -- 3.1 Le catalogue PRODUIT est intouché : tier/quota/preview identiques au
  --     snapshot pre-M1a (l'additivité n'est pas affirmée, elle est prouvée).
  FOR v_bad IN
    SELECT COALESCE(p.feature_key, k.feature_key) AS feature_key
      FROM _juno06_m1a_catalog_pre k
      FULL JOIN public.premium_feature_policy p
        ON p.feature_key = k.feature_key
     WHERE p.required_tier      IS DISTINCT FROM k.required_tier
        OR p.daily_quota        IS DISTINCT FROM k.daily_quota
        OR p.free_preview_quota IS DISTINCT FROM k.free_preview_quota
        OR p.feature_key IS NULL OR k.feature_key IS NULL
  LOOP
    RAISE EXCEPTION 'M1a self-check : valeur produit modifiée ou ligne apparue/disparue pour %',
      v_bad.feature_key;
  END LOOP;

  -- 3.2 Les quinze classes, exactement.
  SELECT COALESCE(array_agg(feature_key || '|' || enforcement_class ORDER BY feature_key), '{}')
    INTO v_classes_actual
    FROM public.premium_feature_policy;
  IF v_classes_actual <> v_classes_expected THEN
    RAISE EXCEPTION 'M1a self-check : classes ≠ attendues.%Attendu : % — Obtenu : %',
      E'\n', v_classes_expected, v_classes_actual;
  END IF;

  -- 3.3 Les compteurs AUDITÉS font exactement 2/7/2 — et seulement sur les
  --     11 (les marqueurs legacy n'y entrent jamais, par construction).
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE feature_key = ANY (v_audited) AND enforcement_class = 'server_enforced_data';
  IF v_count <> 2 THEN RAISE EXCEPTION 'M1a self-check : server_enforced_data attendu 2/11, obtenu %', v_count; END IF;
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE feature_key = ANY (v_audited) AND enforcement_class = 'server_metered_ui';
  IF v_count <> 7 THEN RAISE EXCEPTION 'M1a self-check : server_metered_ui attendu 7/11, obtenu %', v_count; END IF;
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE feature_key = ANY (v_audited) AND enforcement_class = 'public_content';
  IF v_count <> 2 THEN RAISE EXCEPTION 'M1a self-check : public_content attendu 2/11, obtenu %', v_count; END IF;

  -- 3.5 Les invariants nominatifs de la revue.
  IF EXISTS (SELECT 1 FROM public.premium_feature_policy
              WHERE feature_key = 'synastry' AND free_preview_quota <> 1) THEN
    RAISE EXCEPTION 'M1a self-check : synastry.free_preview_quota doit rester 1 (décision produit 2026-09-23)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.premium_feature_policy
              WHERE feature_key = 'tarot' AND enforcement_class <> 'legacy_alias') THEN
    RAISE EXCEPTION 'M1a self-check : l''alias tarot doit être legacy_alias (contrat build 130, hors compteurs)';
  END IF;
  FOR v_bad IN
    SELECT feature_key FROM public.premium_feature_policy
     WHERE feature_key IN ('compatibility_details','priority_messages','likes_you_see_who')
       AND enforcement_class <> 'legacy_unused'
  LOOP
    RAISE EXCEPTION 'M1a self-check : la graine morte % doit être legacy_unused — jamais présentée comme protégée', v_bad.feature_key;
  END LOOP;

  -- 3.6 Aucune ligne utilisateur touchée (stable sous le snapshot
  --     REPEATABLE READ posé en tête de migration : l'activité concurrente
  --     ne peut pas fausser cette preuve).
  IF (SELECT COUNT(*) FROM public.premium_usage) <>
     (SELECT premium_usage_rows FROM _juno06_m1a_userrows_pre) THEN
    RAISE EXCEPTION 'M1a self-check : premium_usage a changé de volume — M1a ne touche aucune ligne utilisateur';
  END IF;
  IF (SELECT COUNT(*) FROM public.subscriptions) <>
     (SELECT subscriptions_rows FROM _juno06_m1a_userrows_pre) THEN
    RAISE EXCEPTION 'M1a self-check : subscriptions a changé de volume — M1a ne touche aucune ligne utilisateur';
  END IF;

  -- 3.7 Preuve « aucun NULL restant » PUIS durcissement du schéma : le
  --     NOT NULL n'est posé qu'une fois prouvé que les 15 classifications
  --     ont couvert chaque ligne — pas de DEFAULT pour rattraper un oubli
  --     (l'ordre CHECK → preuve → NOT NULL est celui exigé par la revue).
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE enforcement_class IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'M1a self-check : % ligne(s) sans classe après classification — le NOT NULL ne serait pas prouvé', v_count;
  END IF;
  EXECUTE 'ALTER TABLE public.premium_feature_policy
             ALTER COLUMN enforcement_class SET NOT NULL';
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='premium_feature_policy'
                AND column_name='enforcement_class' AND is_nullable='YES') THEN
    RAISE EXCEPTION 'M1a self-check : enforcement_class doit être NOT NULL';
  END IF;
  -- Et AUCUN DEFAULT n'existe (revue 2026-09-23) : un INSERT sans classe
  -- doit échouer, pas être rattrapé.
  IF EXISTS (SELECT 1 FROM pg_attrdef d
              JOIN pg_class c ON c.oid = d.adrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname='public' AND c.relname='premium_feature_policy'
               AND d.adnum = (SELECT attnum FROM information_schema.columns
                               WHERE table_schema='public'
                                 AND table_name='premium_feature_policy'
                                 AND column_name='enforcement_class')) THEN
    RAISE EXCEPTION 'M1a self-check : enforcement_class ne doit avoir AUCUN DEFAULT (classification explicite obligatoire)';
  END IF;

  EXECUTE 'ALTER TABLE public.premium_feature_policy
             VALIDATE CONSTRAINT premium_feature_policy_enforcement_class_check';
END;
$$;

commit;
