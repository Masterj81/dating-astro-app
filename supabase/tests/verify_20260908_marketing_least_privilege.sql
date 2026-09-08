SELECT
  n                                         AS "n",
  label                                     AS "controle",
  CASE WHEN ok THEN 'OK' ELSE 'ECHEC' END   AS "resultat",
  detail                                    AS "detail"
FROM (
  WITH sigs AS (
    SELECT unnest(ARRAY[
      'public.marketing_agent_schedule_post(text,text,integer,text[],timestamptz,text)',
      'public.marketing_agent_list_queue(integer,text)',
      'public.marketing_agent_post_statuses(uuid[])'
    ]) AS sig
  ),
  present AS (
    SELECT sig FROM sigs WHERE to_regprocedure(sig) IS NOT NULL
  )
  SELECT 1 AS n,
    'les trois RPC existent' AS label,
    (SELECT count(*) FROM present) = 3 AS ok,
    COALESCE((SELECT string_agg(sig, ', ') FROM sigs WHERE to_regprocedure(sig) IS NULL), 'toutes presentes') AS detail
  UNION ALL
  SELECT 2,
    'anon ne peut appeler aucune des trois',
    (SELECT count(*) FROM present) = 3
      AND NOT EXISTS (SELECT 1 FROM present WHERE has_function_privilege('anon', sig, 'EXECUTE')),
    COALESCE((SELECT string_agg(sig, ', ') FROM present WHERE has_function_privilege('anon', sig, 'EXECUTE')), 'aucune')
  UNION ALL
  SELECT 3,
    'authenticated ne peut appeler aucune des trois',
    (SELECT count(*) FROM present) = 3
      AND NOT EXISTS (SELECT 1 FROM present WHERE has_function_privilege('authenticated', sig, 'EXECUTE')),
    COALESCE((SELECT string_agg(sig, ', ') FROM present WHERE has_function_privilege('authenticated', sig, 'EXECUTE')), 'aucune')
  UNION ALL
  SELECT 4,
    'PUBLIC ne peut appeler aucune des trois',
    (SELECT count(*) FROM present) = 3
      AND NOT EXISTS (
        SELECT 1
          FROM present p
          JOIN pg_proc pr ON pr.oid = to_regprocedure(p.sig)::oid
         WHERE pr.proacl IS NULL
            OR EXISTS (
              SELECT 1 FROM aclexplode(pr.proacl) a
               WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
            )
      ),
    COALESCE((
      SELECT string_agg(p.sig, ', ')
        FROM present p
        JOIN pg_proc pr ON pr.oid = to_regprocedure(p.sig)::oid
       WHERE pr.proacl IS NULL
          OR EXISTS (
            SELECT 1 FROM aclexplode(pr.proacl) a
             WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
          )
    ), 'aucune')
  UNION ALL
  SELECT 5,
    'service_role peut appeler les trois, sinon la fonction edge est cassee',
    (SELECT count(*) FROM present) = 3
      AND NOT EXISTS (SELECT 1 FROM present WHERE NOT has_function_privilege('service_role', sig, 'EXECUTE')),
    COALESCE((SELECT string_agg(sig, ', ') FROM present WHERE NOT has_function_privilege('service_role', sig, 'EXECUTE')), 'toutes accessibles')
  UNION ALL
  SELECT 6,
    'les trois epinglent search_path',
    (SELECT count(*) FROM present) = 3
      AND NOT EXISTS (
        SELECT 1 FROM present p
        JOIN pg_proc pr ON pr.oid = to_regprocedure(p.sig)::oid
        WHERE NOT EXISTS (
          SELECT 1 FROM unnest(COALESCE(pr.proconfig, ARRAY[]::text[])) AS c
          WHERE c LIKE 'search_path=%'
        )
      ),
    COALESCE((
      SELECT string_agg(p.sig, ', ')
      FROM present p
      JOIN pg_proc pr ON pr.oid = to_regprocedure(p.sig)::oid
      WHERE NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(pr.proconfig, ARRAY[]::text[])) AS c
        WHERE c LIKE 'search_path=%'
      )
    ), 'toutes epinglees')
  UNION ALL
  SELECT 7,
    'aucune des trois ne construit de SQL dynamique',
    (SELECT count(*) FROM present) = 3
      AND NOT EXISTS (
        SELECT 1 FROM present
        WHERE pg_get_functiondef(to_regprocedure(sig)::oid) ~* 'EXECUTE\s+(format|'')'
      ),
    COALESCE((
      SELECT string_agg(sig, ', ') FROM present
      WHERE pg_get_functiondef(to_regprocedure(sig)::oid) ~* 'EXECUTE\s+(format|'')'
    ), 'aucun SQL dynamique')
  UNION ALL
  SELECT 8,
    'le bucket marketing-images existe et est public',
    EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'marketing-images' AND public),
    COALESCE((SELECT 'public=' || public::text FROM storage.buckets WHERE id = 'marketing-images'), 'BUCKET ABSENT')
  UNION ALL
  SELECT 9,
    'RLS active sur marketing_posts',
    EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marketing_posts' AND rowsecurity),
    COALESCE((SELECT 'rowsecurity=' || rowsecurity::text FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marketing_posts'), 'TABLE ABSENTE')
  UNION ALL
  SELECT 10,
    'aucun privilege table sur marketing_posts pour anon ou authenticated',
    NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'marketing_posts'
        AND grantee IN ('anon', 'authenticated')
    ),
    COALESCE((
      SELECT string_agg(DISTINCT grantee || ':' || privilege_type, ', ')
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'marketing_posts'
        AND grantee IN ('anon', 'authenticated')
    ), 'aucun')
  UNION ALL
  SELECT 11,
    'la table edge_rate_limits existe',
    EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'edge_rate_limits'),
    CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'edge_rate_limits')
         THEN 'presente'
         ELSE 'ABSENTE : appliquer 20260908000002' END
  UNION ALL
  SELECT 12,
    'check_edge_rate_limit existe',
    to_regprocedure('public.check_edge_rate_limit(text,integer,integer)') IS NOT NULL,
    CASE WHEN to_regprocedure('public.check_edge_rate_limit(text,integer,integer)') IS NULL
         THEN 'ABSENTE : marketing-agent refuserait TOUT, et les limiteurs de calculate-chart, claim-referral et claim-promo-code sont morts'
         ELSE 'presente' END
  UNION ALL
  SELECT 13,
    'check_edge_rate_limit appelable par service_role',
    to_regprocedure('public.check_edge_rate_limit(text,integer,integer)') IS NOT NULL
      AND has_function_privilege('service_role', 'public.check_edge_rate_limit(text,integer,integer)', 'EXECUTE'),
    CASE WHEN to_regprocedure('public.check_edge_rate_limit(text,integer,integer)') IS NULL
         THEN 'FONCTION ABSENTE'
         ELSE 'la fonction edge echoue ferme sans lui' END
) checks
ORDER BY n;


CREATE OR REPLACE FUNCTION pg_temp.juno_probe(p_stmt TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $juno$
DECLARE
  c_sentinel CONSTANT TEXT := 'juno_probe_was_accepted';
BEGIN
  BEGIN
    EXECUTE p_stmt;
    RAISE EXCEPTION '%', c_sentinel;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = c_sentinel THEN
      RETURN NULL;
    END IF;
    RETURN SQLERRM;
  END;
END;
$juno$;

SELECT
  n                                                                AS "n",
  rule                                                             AS "regle de validation",
  CASE WHEN observed IS NOT NULL THEN 'OK (refuse)' ELSE 'ECHEC (accepte)' END AS "resultat",
  COALESCE(observed, 'la RPC a accepte une entree invalide')       AS "message"
FROM (
  SELECT t.n, t.rule, pg_temp.juno_probe(t.stmt) AS observed
  FROM (VALUES
    (1, 'plateforme hors liste blanche',
     $p$SELECT public.marketing_agent_schedule_post('t', NULL, 10, ARRAY['myspace'], now() + interval '1 hour', NULL)$p$),
    (2, 'texte vide',
     $p$SELECT public.marketing_agent_schedule_post('   ', NULL, 10, ARRAY['facebook'], now() + interval '1 hour', NULL)$p$),
    (3, 'texte trop long',
     $p$SELECT public.marketing_agent_schedule_post(repeat('x', 5001), NULL, 10, ARRAY['facebook'], now() + interval '1 hour', NULL)$p$),
    (4, 'score hors bornes',
     $p$SELECT public.marketing_agent_schedule_post('t', NULL, 500, ARRAY['facebook'], now() + interval '1 hour', NULL)$p$),
    (5, 'date de publication absurde',
     $p$SELECT public.marketing_agent_schedule_post('t', NULL, 10, ARRAY['facebook'], now() + interval '5 years', NULL)$p$),
    (6, 'image hebergee ailleurs que dans le bucket marketing',
     $p$SELECT public.marketing_agent_schedule_post('t', NULL, 10, ARRAY['facebook'], now() + interval '1 hour', 'https://evil.example/x.png')$p$),
    (7, 'image en javascript:',
     $p$SELECT public.marketing_agent_schedule_post('t', NULL, 10, ARRAY['facebook'], now() + interval '1 hour', 'javascript:alert(1)')$p$),
    (8, 'statut inconnu dans list_queue',
     $p$SELECT * FROM public.marketing_agent_list_queue(10, 'deleted')$p$),
    (9, 'plus de 200 identifiants',
     $p$SELECT * FROM public.marketing_agent_post_statuses((SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 201)))$p$)
  ) AS t(n, rule, stmt)
) probes
ORDER BY n;


SELECT
  'la file se lit et la limite est appliquee' AS "controle",
  count(*)                                    AS "lignes rendues",
  CASE WHEN count(*) <= 5 THEN 'OK' ELSE 'ECHEC' END AS "resultat"
FROM public.marketing_agent_list_queue(5, NULL);
