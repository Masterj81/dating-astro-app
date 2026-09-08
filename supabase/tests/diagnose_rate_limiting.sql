SELECT
  n            AS "n",
  objet        AS "objet",
  etat         AS "etat",
  detail       AS "detail / consequence"
FROM (
  SELECT 0 AS n,
    'VERDICT' AS objet,
    CASE
      WHEN to_regprocedure('public.check_rate_limit(uuid,text,integer,interval)') IS NULL
        THEN 'CRITIQUE'
      WHEN to_regprocedure('public.check_edge_rate_limit(text,integer,integer)') IS NULL
        THEN 'A CORRIGER'
      ELSE 'TOUT EST EN PLACE'
    END AS etat,
    CASE
      WHEN to_regprocedure('public.check_rate_limit(uuid,text,integer,interval)') IS NULL
        THEN 'get-profile-chart echoue FERME : la synastrie repond 503 a tout le monde, maintenant'
      WHEN to_regprocedure('public.check_edge_rate_limit(text,integer,integer)') IS NULL
        THEN 'appliquer 20260908000002_edge_rate_limits_present.sql avant la phase B du runbook'
      ELSE 'aucune migration de limitation n est requise'
    END AS detail

  UNION ALL
  SELECT 1,
    'signatures reellement presentes',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
       WHERE ns.nspname = 'public'
         AND p.proname IN ('check_edge_rate_limit', 'check_rate_limit',
                           'cleanup_edge_rate_limits', 'cleanup_rate_limits')
    ) THEN 'voir detail' ELSE 'AUCUNE' END,
    COALESCE((
      SELECT string_agg(
               p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
               '  |  ' ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
       WHERE ns.nspname = 'public'
         AND p.proname IN ('check_edge_rate_limit', 'check_rate_limit',
                           'cleanup_edge_rate_limits', 'cleanup_rate_limits')
    ), 'aucune fonction de limitation dans le schema public')

  UNION ALL
  SELECT 2,
    'public.check_rate_limit(uuid,text,integer,interval)',
    CASE WHEN to_regprocedure('public.check_rate_limit(uuid,text,integer,interval)') IS NOT NULL
         THEN 'PRESENT' ELSE 'ABSENT' END,
    'get-profile-chart (vague 1) echoue FERME dessus. Absent = synastrie 503 pour tous. Cree par 20260320000003.'

  UNION ALL
  SELECT 3,
    'table public.rate_limits',
    CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rate_limits')
         THEN 'PRESENT' ELSE 'ABSENT' END,
    'compteur par utilisateur, utilise par check_rate_limit. Vient de 00000000000000_full_schema.sql.'

  UNION ALL
  SELECT 4,
    'public.check_edge_rate_limit(text,integer,integer)',
    CASE WHEN to_regprocedure('public.check_edge_rate_limit(text,integer,integer)') IS NOT NULL
         THEN 'PRESENT' ELSE 'ABSENT' END,
    'calculate-chart, claim-referral et claim-promo-code echouent OUVERT : absent = leur limite de debit ne fonctionne pas, en silence. marketing-agent echoue FERME et refuserait tout. Cree par 20260420000004.'

  UNION ALL
  SELECT 5,
    'table public.edge_rate_limits',
    CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'edge_rate_limits')
         THEN 'PRESENT' ELSE 'ABSENT' END,
    'compteur a fenetre glissante des fonctions edge. Meme migration que ci-dessus.'

  UNION ALL
  SELECT 6,
    'public.cleanup_edge_rate_limits()',
    CASE WHEN to_regprocedure('public.cleanup_edge_rate_limits()') IS NOT NULL
         THEN 'PRESENT' ELSE 'ABSENT' END,
    'purge des fenetres expirees. Absent = la table grossit sans fin, si elle existe.'

  UNION ALL
  SELECT 7,
    'taches cron de purge',
    CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname LIKE '%rate%limit%')
         THEN 'voir detail' ELSE 'AUCUNE' END,
    COALESCE((
      SELECT string_agg(jobname || ' (' || schedule || ')', '  |  ' ORDER BY jobname)
        FROM cron.job WHERE jobname LIKE '%rate%limit%'
    ), 'aucune')

  UNION ALL
  SELECT 8,
    'tache cleanup-edge-rate-limits planifiee',
    CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-edge-rate-limits')
         THEN 'OUI' ELSE 'NON' END,
    'Planifiee a 15 3 * * * par 20260420000004 OU par 20260908000002 : cette ligne ne distingue pas laquelle, et ne doit pas etre lue comme une preuve que la migration d avril a tourne. Elle importe parce que le bloc pg_cron de ces migrations avale ses propres erreurs (EXCEPTION WHEN OTHERS) : leur auto-verification ne peut pas prouver ce point, seule cette requete le peut. Absente = la table edge_rate_limits grossit sans fin.'
) d
ORDER BY n;
