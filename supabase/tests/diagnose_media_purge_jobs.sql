-- =============================================================================
-- JUNO-09 — état de la purge des médias après suppression de compte
-- =============================================================================
--
-- STRICTEMENT EN LECTURE. Aucun INSERT, UPDATE, DELETE, aucun net.http_post,
-- aucun appel à une fonction de purge. À exécuter AVANT et APRÈS le déploiement
-- de la phase B : la colonne « attendu APRÈS » dit ce qui doit avoir changé.
--
-- AUCUN CHEMIN NE SORT D'ICI. Ni nom de fichier, ni URL, ni UUID de compte : des
-- compteurs, des classes et des booléens. C'est la même règle que celle imposée
-- à la table elle-même, et pour la même raison — un outil de suivi de purge qui
-- affiche les chemins qu'il a supprimés recrée la donnée qu'il efface.
--
-- LES DEUX SIGNAUX, ET LEQUEL COMPTE
-- ---------------------------------------------------------------------------
-- `cron.job_run_details.status = 'succeeded'` ne signifie RIEN ici : la commande
-- se contente de mettre une requête HTTP en file. Le signal fiable est le
-- contrôle 8 — le nombre de travaux encore en attente au-delà d'une heure.

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
  -- Afficheur, pas garde : une source illisible se lit « INDISPONIBLE », jamais
  -- « OK ». C'est la raison du libellé.
  RETURN 'INDISPONIBLE (' || SQLSTATE || ') : ' || left(SQLERRM, 110);
END;
$juno$;


SELECT
  n       AS "n",
  objet   AS "objet",
  valeur  AS "valeur",
  attendu AS "attendu APRES la phase B",
  lecture AS "comment lire"
FROM (

  SELECT 0 AS n,
    'A QUOI SERT CETTE REQUETE' AS objet,
    'etat de la purge des medias apres suppression de compte' AS valeur,
    '—' AS attendu,
    'Lecture seule. Aucun chemin, nom de fichier ni UUID ne sort d ici : compteurs, classes et booleens uniquement.' AS lecture

  -- =========================================================================
  -- La structure
  -- =========================================================================
  UNION ALL SELECT 1,
    'la table de travaux existe-t-elle ?',
    CASE WHEN to_regclass('public.media_purge_jobs') IS NULL
         THEN 'NON — 20260910000002 non appliquee'
         ELSE 'oui' END,
    'oui',
    'sans elle, aucune suppression de compte ne peut se faire : les executants s arretent si le travail n est pas cree'

  UNION ALL SELECT 2,
    '*** LA TABLE PORTE-T-ELLE UNE CLE ETRANGERE ? ***',
    pg_temp.juno_q($q$
      SELECT CASE count(*) WHEN 0 THEN 'aucune (attendu)'
             ELSE '*** ' || count(*)::text || ' — LA LIGNE SERAIT EMPORTEE PAR LA CASCADE ***' END
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace ns ON ns.oid = t.relnamespace
       WHERE ns.nspname = 'public' AND t.relname = 'media_purge_jobs' AND c.contype = 'f'
    $q$),
    'aucune',
    'C EST LA PROPRIETE SUR LAQUELLE TOUT REPOSE. La ligne doit survivre a la suppression du compte : c est le seul mecanisme qui permet de reprendre une purge apres la disparition de auth.users. Une FK la detruirait au moment precis ou elle devient utile.'

  UNION ALL SELECT 3,
    'RLS active, et combien de policies ?',
    pg_temp.juno_q($q$
      SELECT CASE WHEN NOT c.relrowsecurity THEN '*** RLS INACTIVE ***'
                  ELSE 'active, ' || (SELECT count(*) FROM pg_policies p
                                       WHERE p.schemaname = 'public'
                                         AND p.tablename = 'media_purge_jobs')::text
                       || ' policy' END
        FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relname = 'media_purge_jobs'
    $q$),
    'active, 0 policy',
    'RLS active SANS policy = deny-all pour tout role soumis a RLS. service_role la contourne, et c est le seul appelant.'

  UNION ALL SELECT 4,
    'un role client a-t-il un privilege sur la table ?',
    pg_temp.juno_q($q$
      SELECT CASE count(*) WHEN 0 THEN 'aucun (attendu)'
             ELSE '*** ' || string_agg(DISTINCT grantee || ':' || privilege_type, ', ') || ' ***' END
        FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = 'media_purge_jobs'
         AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    $q$),
    'aucun',
    'Supabase applique un GRANT ALL au niveau du schema : ne pas revoquer explicitement laisserait authenticated lire la liste des comptes supprimes. C est exactement ce qui s est passe sur messages (JUNO-08).'

  UNION ALL SELECT 5,
    'les trois RPC sont-elles en place et fermees ?',
    pg_temp.juno_q($q$
      SELECT string_agg(etat, '  |  ' ORDER BY etat) FROM (
        SELECT CASE
                 WHEN to_regprocedure(sig) IS NULL THEN nom || '=ABSENTE'
                 WHEN has_function_privilege('authenticated', sig, 'EXECUTE') THEN nom || '=*** OUVERTE ***'
                 ELSE nom || '=ok'
               END AS etat
          FROM (VALUES
            ('create',  'public.create_media_purge_job(uuid, text)'),
            ('record',  'public.record_media_purge_result(uuid, jsonb, boolean, text)'),
            ('claim',   'public.claim_media_purge_jobs(integer, integer, integer)')
          ) AS f(nom, sig)
      ) s
    $q$),
    'create=ok | record=ok | claim=ok',
    'accordees a service_role SEUL. Une RPC de purge appelable par authenticated serait une primitive de suppression arbitraire.'

  -- =========================================================================
  -- L'état des travaux
  -- =========================================================================
  UNION ALL SELECT 6,
    'travaux par statut',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(status || '=' || nb::text, '  |  ' ORDER BY status)
           FROM (SELECT status, count(*) AS nb FROM public.media_purge_jobs GROUP BY status) s),
        'aucun travail')
    $q$),
    'aucun travail, puis completed uniquement',
    'A l installation la file est vide. Un travail apparait a la premiere suppression de compte, et doit passer a completed en quelques secondes.'

  UNION ALL SELECT 7,
    'travaux par parcours d origine',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(requested_by || '=' || nb::text, '  |  ' ORDER BY requested_by)
           FROM (SELECT requested_by, count(*) AS nb FROM public.media_purge_jobs GROUP BY requested_by) s),
        'aucun travail')
    $q$),
    'mobile_cron et web_immediate',
    'manual ne doit apparaitre que si un rattrapage a ete lance a la main — et il exige une validation humaine du rapport'

  UNION ALL SELECT 8,
    '*** RETARD METIER — travaux en attente depuis plus d une heure ***',
    pg_temp.juno_q($q$
      SELECT count(*)::text FROM public.media_purge_jobs
       WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour'
    $q$),
    '0',
    'LA PREUVE QUI COMPTE. La purge synchrone traite le cas courant en quelques secondes : ce qui survit une heure est une reprise qui n aboutit pas. Un « succeeded » de pg_cron ne dit rien — il signifie seulement que la requete a ete mise en file.'

  UNION ALL SELECT 9,
    'plus ancien travail en attente',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT to_char(min(created_at), 'YYYY-MM-DD HH24:MI') || ' UTC (' ||
                (NOW()::date - min(created_at)::date)::text || ' jours)'
           FROM public.media_purge_jobs WHERE status = 'pending'),
        'aucun')
    $q$),
    'aucun',
    'depuis quand un media aurait du etre efface'

  UNION ALL SELECT 10,
    'tentatives : distribution des travaux en attente',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(bande || '=' || nb::text, '  |  ' ORDER BY bande)
           FROM (SELECT CASE WHEN attempts = 0 THEN '0'
                             WHEN attempts <= 3 THEN '1-3'
                             WHEN attempts <= 10 THEN '4-10'
                             ELSE 'plus de 10' END AS bande,
                        count(*) AS nb
                   FROM public.media_purge_jobs WHERE status = 'pending'
                  GROUP BY 1) s),
        'aucun travail en attente')
    $q$),
    'aucun travail en attente',
    'un travail au-dela de 10 tentatives ne se resoudra pas seul : lire sa classe d erreur au controle 11'

  UNION ALL SELECT 11,
    'classes d erreur rencontrees',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(last_error_class || '=' || nb::text, '  |  ' ORDER BY last_error_class)
           FROM (SELECT last_error_class, count(*) AS nb FROM public.media_purge_jobs
                  WHERE last_error_class IS NOT NULL GROUP BY last_error_class) s),
        'aucune')
    $q$),
    'aucune',
    'Une CLASSE, jamais un message : un message d erreur de stockage contient le chemin qui a echoue. ambiguous_ownership est la seule qui demande un humain — elle signifie qu un objet n a pas pu etre prouve possede, et il n a donc PAS ete supprime.'

  UNION ALL SELECT 12,
    'la contrainte de forme tient-elle ? (aucune chaine dans per_category)',
    pg_temp.juno_q($q$
      SELECT CASE count(*) WHEN 0 THEN 'oui, aucune chaine stockee'
             ELSE '*** ' || count(*)::text || ' travail(aux) portent une chaine ***' END
        FROM public.media_purge_jobs j,
             LATERAL jsonb_each(j.per_category) AS e(bucket, payload),
             LATERAL jsonb_each(e.payload) AS v(metric, val)
       WHERE jsonb_typeof(v.val) = 'string'
    $q$),
    'oui, aucune chaine stockee',
    'C est ce qui rend un chemin STRUCTURELLEMENT instockable. La contrainte CHECK devrait deja l interdire : une ligne ici signifierait que la contrainte a ete retiree.'

  -- =========================================================================
  -- Les tâches
  -- =========================================================================
  UNION ALL SELECT 13,
    'tache de reprise : etat',
    COALESCE((SELECT jobname || ' [' || schedule || '] ' ||
                CASE WHEN active THEN 'active' ELSE '*** INACTIVE ***' END
                FROM cron.job WHERE jobname = 'media-purge-resume'), 'ABSENTE'),
    'media-purge-resume [*/10 * * * *] active',
    'inactive, les purges inachevees s accumulent en silence — ce qui EST le defaut JUNO-09'

  UNION ALL SELECT 14,
    'la tache de reprise est-elle bien figee en mode reprise ?',
    COALESCE((SELECT CASE
                WHEN command ~ '"mode"\s*:\s*"resume"' THEN 'oui'
                ELSE '*** NON — elle pourrait viser un compte arbitraire ***' END
                FROM cron.job WHERE jobname = 'media-purge-resume'), 'tache absente'),
    'oui',
    'Figee en reprise, elle ne peut agir que sur des travaux DEJA enregistres. Elle ne peut donc PAS atteindre les cinq orphelins historiques, qu aucun travail ne designe.'

  UNION ALL SELECT 15,
    'le secret de la tache est-il en clair dans la commande ?',
    COALESCE((SELECT CASE
                WHEN command ~ '''x-[a-z-]+-secret''\s*,\s*''[^'']+'''
                  OR command ~ '"x-[a-z-]+-secret"\s*:\s*"[^"]+"'
                  THEN '*** OUI — JUNO-31 reintroduit ***'
                WHEN command ~ 'vault\.decrypted_secrets' THEN 'non, lu dans le coffre'
                ELSE 'aucun en-tete de secret' END
                FROM cron.job WHERE jobname = 'media-purge-resume'), 'tache absente'),
    'non, lu dans le coffre',
    'les deux orthographes sont testees : la seconde a echappe au controle pendant une journee en septembre'

  UNION ALL SELECT 16,
    'tache de retention : etat',
    COALESCE((SELECT jobname || ' [' || schedule || '] ' ||
                CASE WHEN active THEN 'active' ELSE '*** INACTIVE ***' END
                FROM cron.job WHERE jobname = 'media-purge-retention'), 'ABSENTE'),
    'media-purge-retention [17 4 * * *] active',
    'sans elle, la table conserve indefiniment les UUID des comptes supprimes — une liste que la suppression etait censee faire disparaitre'

  UNION ALL SELECT 17,
    'travaux termines au-dela de 90 jours',
    pg_temp.juno_q($q$
      SELECT count(*)::text FROM public.media_purge_jobs
       WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '90 days'
    $q$),
    '0',
    'plus de 0 signifie que la tache de retention ne tourne pas'

  -- =========================================================================
  -- Le contrôle croisé, et l'état historique
  -- =========================================================================
  UNION ALL SELECT 18,
    'travaux en attente dont le compte EXISTE ENCORE',
    pg_temp.juno_q($q$
      SELECT count(*)::text FROM public.media_purge_jobs j
       WHERE j.status = 'pending'
         AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = j.user_id)
    $q$),
    '0, ou transitoirement quelques secondes',
    'Etat NORMAL et bref : le travail est cree avant la suppression Auth. Durable, il signifie que la suppression a ete refusee apres creation du travail — a rapprocher du champ blocked_by_purge de process-expired-deletions.'

  UNION ALL SELECT 19,
    '*** ORPHELINS HISTORIQUES — ne doivent PAS bouger en phase B ***',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(bucket_id || '=' || nb::text, '  |  ' ORDER BY bucket_id)
           FROM (
             SELECT o.bucket_id, count(*) AS nb
               FROM storage.objects o
              WHERE o.bucket_id IN ('avatars', 'voice-intros', 'verifications')
                AND (storage.foldername(o.name))[1] ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                AND NOT EXISTS (
                  SELECT 1 FROM auth.users u
                   WHERE u.id = ((storage.foldername(o.name))[1])::uuid)
              GROUP BY o.bucket_id) s),
        'aucun')
    $q$),
    'avatars=4  |  verifications=1',
    'MESURE DU 10 SEP 2026, apres la fermeture de JUNO-29. La phase B ne les touche PAS : aucun travail ne les designe et la tache de reprise est figee en mode reprise. Leur rattrapage est un livrable separe qui exige une validation humaine du rapport. Un chiffre EN BAISSE ici sans rattrapage valide est une anomalie a investiguer.'

  UNION ALL SELECT 20,
    'dont medias de verification (biometrie au sens large)',
    pg_temp.juno_q($q$
      SELECT count(*)::text
        FROM storage.objects o
       WHERE o.bucket_id = 'verifications'
         AND (storage.foldername(o.name))[1] ~*
             '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND NOT EXISTS (
           SELECT 1 FROM auth.users u
            WHERE u.id = ((storage.foldername(o.name))[1])::uuid)
    $q$),
    '1',
    'La categorie la plus sensible : une video du visage, conservee sans compte ni base legale depuis le 1er fevrier 2026. C est la raison pour laquelle le rattrapage historique doit etre traite, et la raison pour laquelle il ne doit pas etre improvise.'

  UNION ALL SELECT 21,
    'comptes auth existants',
    (SELECT count(*)::text FROM auth.users),
    'variable',
    'denominateur pour interpreter les compteurs ci-dessus'
) d
ORDER BY n;
