-- =============================================================================
-- JUNO-09 phase C — état du rattrapage des médias orphelins historiques
-- =============================================================================
--
-- STRICTEMENT EN LECTURE. Aucun INSERT, UPDATE, DELETE, aucun appel à une
-- fonction de purge. À exécuter AVANT et APRÈS une campagne : la colonne
-- « attendu » dit ce qui doit avoir changé, et surtout ce qui ne doit pas.
--
-- AUCUN CHEMIN NE SORT D'ICI, ni nom de fichier, ni URL, ni UUID de compte, ni
-- identifiant d'objet. Des compteurs, des classes, des empreintes tronquées.
--
-- LES DEUX MOITIÉS DE LA VÉRIFICATION
-- ---------------------------------------------------------------------------
-- Les contrôles 7 et 8 disent si les cinq objets sont partis. Les contrôles 9,
-- 10 et 11 disent si quelque chose d'autre est parti — et c'est la moitié qui
-- compte. Quatre-vingt-cinq objets ne doivent pas bouger, dont soixante
-- `seed-*` dont l'UUID est dans le NOM DE FICHIER.

CREATE OR REPLACE FUNCTION pg_temp.juno_q(p_sql TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $juno$
DECLARE
  v_out TEXT;
BEGIN
  EXECUTE p_sql INTO v_out;
  RETURN COALESCE(v_out, 'aucun resultat');
EXCEPTION WHEN OTHERS THEN
  RETURN 'INDISPONIBLE (' || SQLSTATE || ') : ' || left(SQLERRM, 110);
END;
$juno$;

-- La règle formelle de propriété, en un seul endroit : premier segment de
-- dossier égal à un UUID EN ENTIER, et absent de auth.users.
CREATE OR REPLACE FUNCTION pg_temp.orphan_class(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $cls$
DECLARE
  v_seg TEXT;
BEGIN
  v_seg := (storage.foldername(p_name))[1];
  -- storage.foldername('file.jpg') rend un tableau VIDE : [1] vaut NULL, et
  -- NOT NULL vaut NULL, jamais TRUE. C'est ce défaut qui avait perdu 62 objets
  -- en silence dans la première version du diagnostic de phase A.
  IF v_seg IS NULL THEN RETURN 'unknown_path_shape'; END IF;
  IF v_seg !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN RETURN 'ambiguous_ownership'; END IF;
  IF p_name ~ '(^|/)(\.|\.\.)(/|$)' OR p_name ~ '//' THEN RETURN 'ambiguous_ownership'; END IF;
  RETURN 'uuid';
END;
$cls$;


SELECT
  n       AS "n",
  objet   AS "objet",
  valeur  AS "valeur",
  attendu AS "attendu",
  lecture AS "comment lire"
FROM (

  SELECT 0 AS n,
    'A QUOI SERT CETTE REQUETE' AS objet,
    'etat du rattrapage des medias orphelins historiques' AS valeur,
    'lire les controles 7 a 11 ensemble' AS attendu,
    'Lecture seule. Les controles 7 et 8 disent si les cinq objets sont partis ; les controles 9, 10 et 11 disent si autre chose est parti. La seconde moitie compte davantage.' AS lecture

  -- =========================================================================
  -- La structure
  -- =========================================================================
  UNION ALL SELECT 1,
    'le registre de campagnes existe-t-il ?',
    CASE WHEN to_regclass('public.orphan_purge_campaigns') IS NULL
         THEN 'NON — 20260911000001 non appliquee' ELSE 'oui' END,
    'oui',
    'sans lui, aucune campagne ne peut etre approuvee : la fonction edge enregistre l approbation avant de signer'

  UNION ALL SELECT 2,
    'le registre peut-il contenir un chemin ?',
    pg_temp.juno_q($q$
      SELECT CASE count(*) WHEN 0 THEN 'non (attendu)'
             ELSE '*** ' || count(*)::text || ' colonne(s) suspecte(s) ***' END
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'orphan_purge_campaigns'
         AND column_name ~* '(path|file|url|object|owner|email)'
    $q$),
    'non',
    'un journal de suppression qui enregistre ce qu il a supprime recree la donnee qu il existe pour effacer — et la garde apres la disparition du compte'

  UNION ALL SELECT 3,
    'RLS, policies, et privileges clients',
    pg_temp.juno_q($q$
      SELECT CASE
        WHEN NOT (SELECT c.relrowsecurity FROM pg_class c
                    JOIN pg_namespace ns ON ns.oid = c.relnamespace
                   WHERE ns.nspname='public' AND c.relname='orphan_purge_campaigns')
          THEN '*** RLS INACTIVE ***'
        WHEN (SELECT count(*) FROM pg_policies
               WHERE schemaname='public' AND tablename='orphan_purge_campaigns') > 0
          THEN '*** DES POLICIES EXISTENT ***'
        WHEN (SELECT count(*) FROM information_schema.role_table_grants
               WHERE table_schema='public' AND table_name='orphan_purge_campaigns'
                 AND grantee IN ('anon','authenticated','PUBLIC')) > 0
          THEN '*** PRIVILEGE CLIENT ***'
        ELSE 'RLS active, 0 policy, aucun privilege client'
      END
    $q$),
    'RLS active, 0 policy, aucun privilege client',
    'deny-all. service_role contourne RLS et c est le seul appelant.'

  UNION ALL SELECT 4,
    'la trace est-elle ineffacable ?',
    pg_temp.juno_q($q$
      SELECT CASE
        WHEN has_table_privilege('service_role','public.orphan_purge_campaigns','DELETE')
          THEN '*** service_role peut SUPPRIMER une campagne ***'
        WHEN has_table_privilege('service_role','public.orphan_purge_campaigns','TRUNCATE')
          THEN '*** service_role peut VIDER le registre ***'
        ELSE 'oui, ni DELETE ni TRUNCATE' END
    $q$),
    'oui, ni DELETE ni TRUNCATE',
    'une trace qu on peut effacer n est pas une trace. Supabase accorde ALL a service_role par defaut : seul un REVOKE explicite retire DELETE.'

  UNION ALL SELECT 5,
    'les quatre lectures sont-elles fermees aux roles clients ?',
    pg_temp.juno_q($q$
      SELECT COALESCE(string_agg(etat, '  |  ' ORDER BY etat), 'aucune') FROM (
        SELECT CASE
                 WHEN to_regprocedure(sig) IS NULL THEN nom || '=ABSENTE'
                 WHEN has_function_privilege('authenticated', sig, 'EXECUTE')
                   OR has_function_privilege('anon', sig, 'EXECUTE')
                   THEN nom || '=*** OUVERTE ***'
                 ELSE nom || '=ok'
               END AS etat
          FROM (VALUES
            ('scan',    'public.orphan_scan_objects()'),
            ('lookup',  'public.orphan_lookup_objects(uuid[])'),
            ('present', 'public.auth_users_present(uuid[])'),
            ('total',   'public.auth_users_total()')
          ) AS f(nom, sig)
      ) s
    $q$),
    'lookup=ok | present=ok | scan=ok | total=ok',
    'auth_users_present ouverte a authenticated deviendrait un oracle de comptes : elle dirait, pour tout UUID, s il existe'

  -- =========================================================================
  -- Les campagnes
  -- =========================================================================
  UNION ALL SELECT 6,
    'campagnes enregistrees, par statut',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(status || '=' || nb::text, '  |  ' ORDER BY status)
           FROM (SELECT status, count(*) AS nb
                   FROM public.orphan_purge_campaigns GROUP BY status) s),
        'aucune campagne')
    $q$),
    'aucune campagne, puis executed=1',
    'discovered = decouverte faite ; approved = signee par le serveur ; executed = suppression effectuee ; aborted = arretee'

  UNION ALL SELECT 7,
    '*** ORPHELINS RESTANTS, PAR BUCKET — LA MESURE CENTRALE ***',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(bucket_id || '=' || nb::text, '  |  ' ORDER BY bucket_id)
           FROM (
             SELECT o.bucket_id, count(*) AS nb
               FROM storage.objects o
              WHERE o.bucket_id IN ('avatars','voice-intros','verifications')
                AND pg_temp.orphan_class(o.name) = 'uuid'
                AND NOT EXISTS (SELECT 1 FROM auth.users u
                                 WHERE u.id = ((storage.foldername(o.name))[1])::uuid)
              GROUP BY o.bucket_id) s),
        'aucun')
    $q$),
    'AVANT : avatars=4 | verifications=1        APRES : aucun',
    'REFERENCE IMMUABLE mesuree le 10 sep 2026. Si AVANT differe de 4/0/1, la campagne doit etre ARRETEE : un ecart signifie que la classification a change, et une classification changee invalide la revue humaine.'

  UNION ALL SELECT 8,
    'dont medias de verification (biometrie au sens large)',
    pg_temp.juno_q($q$
      SELECT count(*)::text FROM storage.objects o
       WHERE o.bucket_id = 'verifications'
         AND pg_temp.orphan_class(o.name) = 'uuid'
         AND NOT EXISTS (SELECT 1 FROM auth.users u
                          WHERE u.id = ((storage.foldername(o.name))[1])::uuid)
    $q$),
    'AVANT : 1        APRES : 0',
    'la categorie la plus sensible : une video du visage, conservee sans compte ni base legale depuis le 1er fevrier 2026. Aucune obligation de conservation n a ete documentee ; en son absence, la demande de suppression du compte commande la suppression du media.'

  -- =========================================================================
  -- Les 85 qui ne doivent PAS bouger
  -- =========================================================================
  UNION ALL SELECT 9,
    '*** LES 60 TEMOINS seed-* SONT-ILS INTACTS ? ***',
    pg_temp.juno_q($q$
      SELECT count(*)::text FROM storage.objects
       WHERE bucket_id = 'avatars' AND name LIKE 'seed-%'
    $q$),
    'AVANT et APRES : 60',
    'scripts/seed-profile-photos.js ecrit seed-{uuid}.jpg A LA RACINE : l UUID est dans le NOM DE FICHIER, pas dans un dossier. Un test path.includes(uuid) les supprimerait tous les soixante. Ce nombre est le canari de la campagne.'

  UNION ALL SELECT 10,
    '*** OBJETS DE COMPTES VIVANTS — doivent etre inchanges ***',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(bucket_id || '=' || nb::text, '  |  ' ORDER BY bucket_id)
           FROM (
             SELECT o.bucket_id, count(*) AS nb
               FROM storage.objects o
              WHERE o.bucket_id IN ('avatars','voice-intros','verifications')
                AND pg_temp.orphan_class(o.name) = 'uuid'
                AND EXISTS (SELECT 1 FROM auth.users u
                             WHERE u.id = ((storage.foldername(o.name))[1])::uuid)
              GROUP BY o.bucket_id) s),
        'aucun')
    $q$),
    'identique AVANT et APRES',
    'Noter la valeur AVANT et la comparer APRES. Une baisse ici est le pire resultat possible : un compte vivant a perdu un media.'

  UNION ALL SELECT 11,
    'classification EXHAUSTIVE — la somme fait-elle le total ?',
    pg_temp.juno_q($q$
      SELECT CASE WHEN total = classes
                  THEN 'OK — ' || total::text || ' objets, tous classes'
                  ELSE '*** ECHEC — ' || total::text || ' objets, ' || classes::text ||
                       ' classes : des objets echappent aux quatre classes ***' END
        FROM (
          SELECT count(*) AS total,
                 count(*) FILTER (
                   WHERE pg_temp.orphan_class(name) IN
                         ('uuid','ambiguous_ownership','unknown_path_shape')) AS classes
            FROM storage.objects
           WHERE bucket_id IN ('avatars','voice-intros','verifications')
        ) s
    $q$),
    'OK',
    'La premiere version du diagnostic de phase A comptait 21 + 6 sur 89 objets : storage.foldername() rend un tableau VIDE pour un objet a la racine, [1] vaut NULL, et NOT NULL vaut NULL — jamais TRUE. 62 objets tombaient dans aucun compteur, en silence.'

  UNION ALL SELECT 12,
    'repartition complete par classe',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(cls || '=' || nb::text, '  |  ' ORDER BY cls)
           FROM (SELECT pg_temp.orphan_class(name) AS cls, count(*) AS nb
                   FROM storage.objects
                  WHERE bucket_id IN ('avatars','voice-intros','verifications')
                  GROUP BY 1) s),
        'aucun objet')
    $q$),
    'AVANT : ambiguous_ownership=6 | unknown_path_shape=62 | uuid=22',
    'uuid se scinde ensuite en orphelins (controle 7) et comptes vivants (controle 10). ambiguous = prefixe marketing/. unknown_path_shape = objets a la racine, dont les 60 temoins.'

  UNION ALL SELECT 13,
    'plus ancien orphelin restant',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT to_char(min(o.created_at),'YYYY-MM-DD') || ' (' ||
                (NOW()::date - min(o.created_at)::date)::text || ' jours)'
           FROM storage.objects o
          WHERE o.bucket_id IN ('avatars','voice-intros','verifications')
            AND pg_temp.orphan_class(o.name) = 'uuid'
            AND NOT EXISTS (SELECT 1 FROM auth.users u
                             WHERE u.id = ((storage.foldername(o.name))[1])::uuid)),
        'aucun')
    $q$),
    'AVANT : 2026-02-01        APRES : aucun',
    'depuis quand la donnee aurait du etre effacee'

  -- =========================================================================
  -- Le resultat de la campagne, et la sante de la phase B
  -- =========================================================================
  UNION ALL SELECT 14,
    'resultat de la derniere campagne executee',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT 'deleted=' || deleted::text ||
                '  already_absent=' || already_absent::text ||
                '  failed=' || failed::text ||
                '  classe=' || COALESCE(last_error_class,'aucune') ||
                '  plafond=' || volume_cap::text
           FROM public.orphan_purge_campaigns
          WHERE status = 'executed'
          ORDER BY executed_at DESC LIMIT 1),
        'aucune campagne executee')
    $q$),
    'deleted=5  already_absent=0  failed=0  classe=aucune  plafond=5',
    'deleted + already_absent + failed ne peut pas depasser le plafond : la contrainte orphan_campaign_result_within_cap le refuse'

  UNION ALL SELECT 15,
    'empreintes de la derniere campagne (tronquees)',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT 'manifeste=' || left(manifest_hash,16) ||
                '  approbation=' || COALESCE(left(approval_hash,16),'aucune')
           FROM public.orphan_purge_campaigns
          ORDER BY discovered_at DESC LIMIT 1),
        'aucune campagne')
    $q$),
    'les deux presentes',
    'a comparer avec l empreinte du manifeste local. Tronquees a 16 caracteres : suffisant pour comparer, insuffisant pour reconstruire.'

  UNION ALL SELECT 16,
    'une campagne executee sans approbation ?',
    pg_temp.juno_q($q$
      SELECT CASE count(*) WHEN 0 THEN 'aucune (attendu)'
             ELSE '*** ' || count(*)::text || ' — la contrainte a ete retiree ***' END
        FROM public.orphan_purge_campaigns
       WHERE status = 'executed' AND approval_hash IS NULL
    $q$),
    'aucune',
    'orphan_campaign_executed_needs_approval devrait le rendre impossible : une ligne ici signifie que la contrainte a disparu'

  UNION ALL SELECT 17,
    'PHASE B — retard metier, doit rester a 0',
    pg_temp.juno_q($q$
      SELECT count(*)::text FROM public.media_purge_jobs
       WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour'
    $q$),
    '0',
    'la phase C ne doit rien changer a la phase B. Un travail en attente apparu pendant la campagne signifierait qu une suppression de compte a eu lieu en meme temps — a verifier, pas a ignorer.'

  UNION ALL SELECT 18,
    'PHASE B — aucun travail historique invente ?',
    pg_temp.juno_q($q$
      SELECT CASE count(*) WHEN 0 THEN 'aucun (attendu)'
             ELSE '*** ' || count(*)::text || ' travail(aux) manual ***' END
        FROM public.media_purge_jobs WHERE requested_by = 'manual'
    $q$),
    'les seuls travaux manual attendus sont ceux de la verification controlee de la phase B',
    'CONTRAINTE 13 : media_purge_jobs est concue pour des comptes dont la propriete etait connue AVANT la suppression. La phase C ne doit y ecrire aucune ligne — elle a son propre registre.'

  UNION ALL SELECT 19,
    'comptes auth existants',
    (SELECT count(*)::text FROM auth.users),
    'variable',
    'denominateur. Une AUGMENTATION entre la decouverte et l execution est normale (une inscription) et la re-verification serveur la gere ; une baisse signifierait une suppression concurrente.'
) d
ORDER BY n;
