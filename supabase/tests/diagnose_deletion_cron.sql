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
  RETURN 'INDISPONIBLE (' || SQLSTATE || ') : ' || left(SQLERRM, 120);
END;
$juno$;


SELECT
  n         AS "n",
  objet     AS "objet",
  valeur    AS "valeur",
  lecture   AS "comment lire"
FROM (
  SELECT 0 AS n,
    'VERDICT' AS objet,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-expired-deletions')
        THEN 'TACHE ABSENTE'
      WHEN (SELECT count(*) FROM public.profiles
             WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now() - INTERVAL '25 hours') > 0
        THEN 'TACHE PRESENTE MAIS INEFFICACE'
      WHEN (SELECT count(*) FROM public.profiles
             WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now()) > 0
        THEN 'EN ATTENTE DU PROCHAIN PASSAGE'
      ELSE 'RIEN EN RETARD'
    END AS valeur,
    'Un compte expire depuis plus de 25 h prouve que le cron quotidien de 03:00 UTC ne fait pas son travail : le droit a l effacement n est pas honore.' AS lecture

  UNION ALL SELECT 1,
    'tache process-expired-deletions planifiee',
    COALESCE((SELECT string_agg(schedule || CASE WHEN active THEN ' [active]' ELSE ' [INACTIVE]' END, '  |  ')
                FROM cron.job WHERE jobname = 'process-expired-deletions'), 'ABSENTE'),
    'planifiee a 03:00 UTC par 20260419000004. Absente = aucune suppression definitive n a jamais eu lieu par ce chemin.'

  UNION ALL SELECT 2,
    'la commande cron vise-t-elle la bonne fonction ?',
    COALESCE((SELECT CASE WHEN command LIKE '%process-expired-deletions%' THEN 'oui' ELSE 'NON' END
                FROM cron.job WHERE jobname = 'process-expired-deletions' LIMIT 1), 'sans objet'),
    'la commande elle-meme n est PAS affichee : elle porte EXPIRED_DELETIONS_SECRET en clair dans un en-tete'

  UNION ALL SELECT 3,
    'la commande porte-t-elle un secret non vide ?',
    COALESCE((SELECT CASE
                WHEN command ~ 'x-expired-deletions-secret''\s*,\s*''''' THEN 'NON — secret VIDE'
                WHEN command ILIKE '%x-expired-deletions-secret%' THEN 'oui, en-tete present et non vide'
                ELSE 'en-tete ABSENT' END
                FROM cron.job WHERE jobname = 'process-expired-deletions' LIMIT 1), 'sans objet'),
    'un secret vide fait repondre 401 a la fonction, silencieusement, tous les jours depuis avril'

  UNION ALL SELECT 4,
    'extension pg_net disponible',
    CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN 'oui' ELSE 'NON' END,
    'sans pg_net, la commande cron ne peut pas appeler la fonction edge'

  UNION ALL SELECT 5,
    'executions enregistrees (cron.job_run_details)',
    pg_temp.juno_q($q$
      SELECT count(*)::text || ' au total, dont ' ||
             count(*) FILTER (WHERE status = 'succeeded')::text || ' reussies'
        FROM cron.job_run_details d
        JOIN cron.job j ON j.jobid = d.jobid
       WHERE j.jobname = 'process-expired-deletions'
    $q$),
    'zero execution = la tache n a jamais tourne'

  UNION ALL SELECT 6,
    'derniere execution',
    pg_temp.juno_q($q$
      SELECT to_char(max(d.start_time), 'YYYY-MM-DD HH24:MI') || ' UTC'
        FROM cron.job_run_details d
        JOIN cron.job j ON j.jobid = d.jobid
       WHERE j.jobname = 'process-expired-deletions'
    $q$),
    'doit dater de moins de 24 h'

  UNION ALL SELECT 7,
    'statut de la derniere execution',
    pg_temp.juno_q($q$
      SELECT d.status || ' — ' || left(COALESCE(d.return_message, 'aucun message'), 90)
        FROM cron.job_run_details d
        JOIN cron.job j ON j.jobid = d.jobid
       WHERE j.jobname = 'process-expired-deletions'
       ORDER BY d.start_time DESC
       LIMIT 1
    $q$),
    'succeeded cote pg_cron signifie seulement que l APPEL a ete emis, pas que la fonction a repondu 200'

  UNION ALL SELECT 8,
    'reponses HTTP recues (net._http_response)',
    pg_temp.juno_q($q$
      SELECT string_agg(status_code::text || ' x' || cnt::text, '  |  ' ORDER BY status_code)
        FROM (SELECT status_code, count(*) AS cnt
                FROM net._http_response
               WHERE created > now() - INTERVAL '14 days'
               GROUP BY status_code) s
    $q$),
    'toutes fonctions confondues sur 14 jours. Un 401 recurrent pointe le secret ; un 500, la configuration.'

  UNION ALL SELECT 9,
    'comptes expires non supprimes',
    (SELECT count(*) FROM public.profiles
      WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now())::text,
    'chacun est une personne qui a demande son effacement et ne l a pas obtenu'

  UNION ALL SELECT 10,
    'retard de la plus ancienne',
    COALESCE((SELECT (now()::date - min(deletion_scheduled_for)::date)::text || ' jours'
                FROM public.profiles
               WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now()), 'aucune'),
    'au-dela de 1 jour, le cron n a pas fonctionne'

  UNION ALL SELECT 11,
    'repartition des retards',
    COALESCE((SELECT string_agg(tranche || '=' || cnt::text, '  |  ' ORDER BY tranche)
                FROM (SELECT CASE
                               WHEN deletion_scheduled_for > now() - INTERVAL '1 day'  THEN 'moins de 1j'
                               WHEN deletion_scheduled_for > now() - INTERVAL '7 days' THEN '1 a 7j'
                               WHEN deletion_scheduled_for > now() - INTERVAL '30 days' THEN '7 a 30j'
                               ELSE 'plus de 30j'
                             END AS tranche, count(*) AS cnt
                        FROM public.profiles
                       WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now()
                       GROUP BY 1) s), 'aucun'),
    'si tout est dans « moins de 1j », le cron fonctionne et ces comptes attendent simplement 03:00 UTC'

  UNION ALL SELECT 12,
    'ces comptes sont-ils deja masques ?',
    (SELECT count(*) FILTER (WHERE is_active = false)::text || ' sur ' || count(*)::text
       FROM public.profiles
      WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now()),
    'is_active = false les retire de Discover des la demande : le prejudice est la conservation, pas l exposition'
) d
ORDER BY n;
