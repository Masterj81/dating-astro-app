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


SELECT
  n         AS "n",
  objet     AS "objet",
  valeur    AS "valeur",
  lecture   AS "comment lire"
FROM (
  WITH edge_jobs AS (
    SELECT
      j.jobname,
      j.schedule,
      j.active,
      (regexp_match(j.command, 'functions/v1/([a-z-]+)'))[1] AS target,
      j.command ~ 'vault\.decrypted_secrets'                 AS reads_vault,
      (regexp_match(j.command, '''x-[a-z-]+-secret''\s*,\s*''([^'']*)'''))[1] AS literal_secret
    FROM cron.job j
    WHERE j.command ~ 'net\.http_post'
  )

  SELECT 0 AS n,
    'VERDICT' AS objet,
    CASE
      WHEN (SELECT count(*) FROM edge_jobs) = 0 THEN 'AUCUNE TACHE EDGE PLANIFIEE'
      WHEN (SELECT count(*) FROM edge_jobs WHERE literal_secret = '') > 0
        THEN (SELECT count(*) FROM edge_jobs WHERE literal_secret = '')::text
             || ' TACHE(S) AVEC UN SECRET VIDE — elles repondent 401 en silence'
      WHEN (SELECT count(*) FROM edge_jobs WHERE literal_secret IS NOT NULL) > 0
        THEN 'secrets en dur dans la commande, mais non vides'
      ELSE 'toutes lisent le coffre a l execution'
    END AS valeur,
    'Un en-tete litteral vide est le defaut de 20260419000004 et 20260419000005 : COALESCE(current_setting(...), '''') transforme une configuration absente en chaine vide.' AS lecture

  UNION ALL SELECT 1,
    'taches cron appelant une fonction edge',
    COALESCE((SELECT string_agg(jobname || ' -> ' || COALESCE(target, '?')
                                || ' (' || schedule || ')'
                                || CASE WHEN active THEN '' ELSE ' [INACTIVE]' END,
                                E'\n' ORDER BY jobname)
                FROM edge_jobs), 'aucune'),
    'inventaire reel, lu dans cron.job — pas dans les migrations'

  UNION ALL SELECT 2,
    'ETAT DU SECRET, par tache',
    COALESCE((SELECT string_agg(
                jobname || ' : ' ||
                CASE
                  WHEN reads_vault THEN 'lit le coffre a l execution'
                  WHEN literal_secret IS NULL THEN 'aucun en-tete de secret trouve'
                  WHEN literal_secret = '' THEN '*** SECRET VIDE — 401 garanti ***'
                  ELSE 'secret en dur, non vide (' || length(literal_secret)::text || ' car.)'
                END, E'\n' ORDER BY jobname)
                FROM edge_jobs), 'aucune'),
    'la VALEUR n est jamais affichee : seulement vide, ou sa longueur'

  UNION ALL SELECT 3,
    'secrets presents dans le coffre (noms seuls)',
    pg_temp.juno_q($q$
      SELECT COALESCE(string_agg(name || CASE WHEN length(decrypted_secret) = 0
                                              THEN ' [VIDE]' ELSE '' END, '  |  ' ORDER BY name),
                      'aucun')
        FROM vault.decrypted_secrets
    $q$),
    'un nom de secret n est pas un secret. 20260419000005 attend cron_horoscope_secret, cron_scheduled_posts_secret et cron_expired_deletions_secret.'

  UNION ALL SELECT 4,
    'fenetre reellement couverte par net._http_response',
    pg_temp.juno_q($q$
      SELECT to_char(min(created), 'YYYY-MM-DD HH24:MI') || ' -> ' ||
             to_char(max(created), 'YYYY-MM-DD HH24:MI') || '  (' ||
             count(*)::text || ' reponses)'
        FROM net._http_response
    $q$),
    'pg_net PURGE cette table (quelques heures). Toute lecture « sur 14 jours » y est trompeuse : c est la fenetre reelle qui compte.'

  UNION ALL SELECT 5,
    'codes de reponse sur la fenetre disponible',
    pg_temp.juno_q($q$
      SELECT COALESCE(string_agg(status_code::text || ' x' || cnt::text, '  |  ' ORDER BY status_code),
                      'aucune reponse')
        FROM (SELECT COALESCE(status_code, 0) AS status_code, count(*) AS cnt
                FROM net._http_response GROUP BY 1) s
    $q$),
    'status_code NULL = aucune reponse recue (timeout ou erreur reseau) : compte ici comme 0'

  UNION ALL SELECT 6,
    'reponses non-2xx',
    pg_temp.juno_q($q$
      SELECT COALESCE(count(*)::text, '0')
        FROM net._http_response
       WHERE status_code IS NULL OR status_code < 200 OR status_code >= 300
    $q$),
    'toute valeur > 0 merite une explication : pg_cron ne les voit pas'

  UNION ALL SELECT 7,
    'erreurs reseau ou timeouts',
    pg_temp.juno_q($q$
      SELECT count(*) FILTER (WHERE timed_out)::text || ' timeout(s), ' ||
             count(*) FILTER (WHERE error_msg IS NOT NULL)::text || ' erreur(s)'
        FROM net._http_response
    $q$),
    'invisible pour pg_cron, qui enregistre succeeded des que l appel part'

  UNION ALL SELECT 8,
    'executions pg_cron des taches edge, 7 derniers jours',
    pg_temp.juno_q($q$
      SELECT COALESCE(string_agg(j.jobname || ': ' || s.total::text || ' dont ' ||
                                 s.ok::text || ' succeeded', E'\n' ORDER BY j.jobname), 'aucune')
        FROM (SELECT d.jobid, count(*) AS total,
                     count(*) FILTER (WHERE d.status = 'succeeded') AS ok
                FROM cron.job_run_details d
               WHERE d.start_time > now() - INTERVAL '7 days'
               GROUP BY d.jobid) s
        JOIN cron.job j ON j.jobid = s.jobid
       WHERE j.command ~ 'net\.http_post'
    $q$),
    'succeeded ne prouve QUE l emission de l appel. Comparer avec les codes de reponse ci-dessus.'

  UNION ALL SELECT 9,
    'preuve metier : posts marketing en retard',
    (SELECT count(*)::text FROM public.marketing_posts
      WHERE status = 'scheduled' AND scheduled_for < now() - INTERVAL '1 hour'),
    'publish-scheduled-posts tourne toutes les 5 min. Un post programme depuis plus d une heure prouve qu il ne publie pas.'

  UNION ALL SELECT 10,
    'preuve metier : effacements en retard',
    (SELECT count(*)::text FROM public.profiles
      WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now()),
    'JUNO-29. Une preuve de RESULTAT vaut mieux qu une preuve de configuration.'

  UNION ALL SELECT 11,
    'preuve metier : courriels programmes en retard',
    pg_temp.juno_q($q$
      SELECT count(*)::text
        FROM public.scheduled_emails
       WHERE status = 'pending' AND scheduled_for < now() - INTERVAL '2 hours'
    $q$),
    'send-scheduled-emails. Meme logique : le retard est le symptome observable.'
) d
ORDER BY n;
