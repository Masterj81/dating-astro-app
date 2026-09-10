SELECT
  n         AS "n",
  objet     AS "objet",
  valeur    AS "valeur",
  lecture   AS "comment lire"
FROM (
  WITH expired AS (
    SELECT id
      FROM public.profiles
     WHERE deletion_scheduled_for IS NOT NULL
       AND deletion_scheduled_for < now()
  ),
  owned AS (
    SELECT
      o.bucket_id,
      (storage.foldername(o.name))[1] AS seg1
    FROM storage.objects o
    WHERE o.bucket_id IN ('avatars', 'voice-intros', 'verifications')
      AND (storage.foldername(o.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  impacted AS (
    SELECT w.bucket_id, w.seg1
      FROM owned w
      JOIN expired e ON e.id = w.seg1::uuid
  )

  SELECT 0 AS n,
    'DECISION D ORDRE' AS objet,
    CASE WHEN (SELECT count(*) FROM impacted) = 0
         THEN 'REPARER LE CRON D ABORD — aucun media ne serait orphelin'
         ELSE 'ARBITRAGE REQUIS — ' || (SELECT count(*) FROM impacted)::text
              || ' objets deviendraient orphelins si le cron est repare avant JUNO-09'
    END AS valeur,
    'Reparer le cron supprime ces comptes. Sans la purge JUNO-09, leurs medias survivent et rejoignent le rattrapage historique.' AS lecture

  UNION ALL SELECT 1,
    'comptes expires concernes',
    (SELECT count(*) FROM expired)::text,
    'chacun a demande son effacement et ne l a pas obtenu'

  UNION ALL SELECT 2,
    'comptes expires possedant au moins un objet',
    (SELECT count(DISTINCT seg1) FROM impacted)::text || ' sur ' || (SELECT count(*) FROM expired)::text,
    'les autres ne laisseraient aucun media derriere eux'

  UNION ALL SELECT 3,
    'objets concernes, par bucket',
    COALESCE((SELECT string_agg(bucket_id || '=' || cnt::text, '  |  ' ORDER BY bucket_id)
                FROM (SELECT bucket_id, count(*) AS cnt FROM impacted GROUP BY bucket_id) s),
             'aucun'),
    'volume qui s ajouterait aux 4 orphelins deja mesures'

  UNION ALL SELECT 4,
    'dont medias de verification',
    (SELECT count(*) FROM impacted WHERE bucket_id = 'verifications')::text,
    'la categorie la plus sensible : si > 0, purger avant de supprimer devient nettement preferable'

  UNION ALL SELECT 5,
    'coffre Supabase (vault) disponible ?',
    CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault')
         THEN 'oui — le secret peut rester hors de cron.job.command'
         ELSE 'non — le secret devra etre inscrit dans la commande cron, comme aujourd hui' END,
    'aujourd hui EXPIRED_DELETIONS_SECRET vit en clair dans cron.job.command ; le coffre evite cela'

  UNION ALL SELECT 6,
    'parametre app.settings.expired_deletions_secret',
    CASE WHEN COALESCE(current_setting('app.settings.expired_deletions_secret', TRUE), '') = ''
         THEN 'VIDE ou absent — c est la cause racine'
         ELSE 'pose' END,
    'la valeur elle-meme n est jamais affichee : seulement vide ou non'
) d
ORDER BY n;
