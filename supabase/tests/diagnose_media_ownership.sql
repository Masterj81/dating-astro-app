SELECT
  n            AS "n",
  categorie    AS "categorie",
  objet        AS "objet",
  valeur       AS "valeur",
  lecture      AS "comment lire"
FROM (
  WITH allowed AS (
    SELECT unnest(ARRAY['avatars', 'voice-intros', 'verifications']) AS bucket
  ),
  obj AS (
    SELECT
      o.bucket_id,
      (storage.foldername(o.name))[1]              AS seg1,
      NULLIF(to_jsonb(o) ->> 'owner', '')          AS owner_col,
      o.name                                       AS obj_name,
      o.created_at
    FROM storage.objects o
    WHERE o.bucket_id IN (SELECT bucket FROM allowed)
  ),
  classified AS (
    SELECT
      bucket_id,
      seg1,
      owner_col,
      created_at,
      obj_name,
      CASE
        WHEN seg1 IS NULL THEN 'racine'
        WHEN seg1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'uuid'
        ELSE 'prefixe-non-uuid'
      END AS classe
    FROM obj
  ),
  resolved AS (
    SELECT
      c.*,
      CASE WHEN c.classe = 'uuid'
           THEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.seg1::uuid)
           ELSE NULL
      END AS account_exists
    FROM classified c
  )

  SELECT 0 AS n, 'integrite de CETTE requete' AS categorie,
    'classification exhaustive' AS objet,
    CASE WHEN (SELECT count(*) FROM resolved)
            = (SELECT count(*) FROM resolved WHERE classe IN ('uuid', 'prefixe-non-uuid', 'racine'))
         THEN 'OK — ' || (SELECT count(*) FROM resolved)::text || ' objets, tous classes'
         ELSE 'ECHEC — des objets echappent aux trois classes' END AS valeur,
    'La premiere version de ce diagnostic comptait 21 + 6 sur 89 objets : storage.foldername() rend un tableau VIDE pour un objet a la racine, donc [1] vaut NULL, et NOT NULL vaut NULL — jamais TRUE. 62 objets tombaient dans aucun compteur, en silence.' AS lecture

  UNION ALL SELECT 1, 'buckets',
    'buckets declares',
    COALESCE((SELECT string_agg(id || CASE WHEN public THEN ' (public)' ELSE ' (prive)' END, '  |  ' ORDER BY id)
                FROM storage.buckets), 'AUCUN'),
    'verifications doit etre prive ; avatars et voice-intros sont publics par decision produit (JUNO-22)'

  UNION ALL SELECT 2, 'buckets',
    'buckets utilisateurs manquants',
    COALESCE((SELECT string_agg(a.bucket, ', ')
                FROM allowed a
               WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = a.bucket)), 'aucun'),
    'un bucket absent rend sa purge sans objet, pas en echec'

  UNION ALL SELECT 3, 'propriete',
    'objets dont owner est renseigne',
    (SELECT count(*) FROM resolved WHERE owner_col IS NOT NULL)::text || ' / ' ||
    (SELECT count(*) FROM resolved)::text,
    'si ce n est pas 100 %, owner ne peut PAS etre la source unique de verite : il reste un temoin corroborant'

  UNION ALL SELECT 4, 'propriete',
    'objets dont owner CONTREDIT le premier segment',
    (SELECT count(*) FROM resolved
      WHERE owner_col IS NOT NULL AND classe = 'uuid' AND lower(owner_col) <> lower(seg1))::text,
    'DOIT etre 0. Toute ligne ici est une propriete ambigue : ne jamais purger sur cette base'

  UNION ALL SELECT 5, 'conformite',
    'total par bucket',
    COALESCE((SELECT string_agg(bucket_id || '=' || cnt::text, '  |  ' ORDER BY bucket_id)
                FROM (SELECT bucket_id, count(*) AS cnt FROM resolved GROUP BY bucket_id) s), 'aucun objet'),
    'volumetrie de reference'

  UNION ALL SELECT 6, 'conformite',
    'classe UUID — propriete PROUVABLE, purgeable',
    COALESCE((SELECT string_agg(bucket_id || '=' || cnt::text, '  |  ' ORDER BY bucket_id)
                FROM (SELECT bucket_id, count(*) AS cnt FROM resolved WHERE classe = 'uuid'
                       GROUP BY bucket_id) s), 'aucun'),
    'segment de dossier ENTIER valide contre le motif UUID, jamais une correspondance partielle. Seule classe que la purge touchera.'

  UNION ALL SELECT 7, 'conformite',
    'classe prefixe-non-UUID — propriete NON prouvable',
    COALESCE((SELECT string_agg(bucket_id || '=' || cnt::text, '  |  ' ORDER BY bucket_id)
                FROM (SELECT bucket_id, count(*) AS cnt FROM resolved WHERE classe = 'prefixe-non-uuid'
                       GROUP BY bucket_id) s), 'aucun'),
    'attendu : le prefixe marketing/ dans avatars, ecrit par service_role qui contourne RLS. Ne jamais purger.'

  UNION ALL SELECT 8, 'conformite',
    'classe racine — objets sans aucun dossier',
    COALESCE((SELECT string_agg(bucket_id || '=' || cnt::text, '  |  ' ORDER BY bucket_id)
                FROM (SELECT bucket_id, count(*) AS cnt FROM resolved WHERE classe = 'racine'
                       GROUP BY bucket_id) s), 'aucun'),
    'RLS EXIGE foldername[1] = auth.uid() a l INSERT, donc aucun client n a pu les ecrire : ce sont des ecritures service_role. Propriete NON prouvable.'

  UNION ALL SELECT 9, 'conformite',
    'dont noms commencant par seed- (comptes synthetiques)',
    (SELECT count(*) FROM resolved WHERE classe = 'racine' AND obj_name LIKE 'seed-%')::text
      || ' sur ' || (SELECT count(*) FROM resolved WHERE classe = 'racine')::text,
    'scripts/seed-profile-photos.js:161 ecrit seed-{uuid}.jpg A LA RACINE via service_role. L UUID est dans le NOM DE FICHIER, pas dans un dossier : un LIKE %uuid% naif les prendrait pour des medias utilisateur.'

  UNION ALL SELECT 10, 'orphelins',
    'objets UUID dont le compte N EXISTE PLUS',
    COALESCE((SELECT string_agg(bucket_id || '=' || cnt::text, '  |  ' ORDER BY bucket_id)
                FROM (SELECT bucket_id, count(*) AS cnt FROM resolved
                       WHERE classe = 'uuid' AND NOT account_exists GROUP BY bucket_id) s), 'aucun'),
    'C EST LE CONSTAT JUNO-09. Ne porte QUE sur la classe uuid : les classes racine et prefixe-non-uuid n ont pas de proprietaire prouvable, donc pas d orphelinat prouvable.'

  UNION ALL SELECT 11, 'orphelins',
    'dont medias de verification (biometrie au sens large)',
    (SELECT count(*) FROM resolved
      WHERE bucket_id = 'verifications' AND classe = 'uuid' AND NOT account_exists)::text,
    'la categorie la plus sensible : video du visage, conservee sans compte ni base legale'

  UNION ALL SELECT 12, 'orphelins',
    'plus ancien orphelin',
    COALESCE((SELECT to_char(min(created_at), 'YYYY-MM-DD') FROM resolved
               WHERE classe = 'uuid' AND NOT account_exists), 'aucun'),
    'depuis quand la donnee aurait du etre effacee'

  UNION ALL SELECT 13, 'references',
    'profils avec au moins une photo',
    (SELECT count(*) FROM public.profiles
      WHERE COALESCE(array_length(photos, 1), 0) > 0
         OR COALESCE(array_length(images, 1), 0) > 0
         OR image_url IS NOT NULL)::text,
    'colonnes photos[], images[], image_url'

  UNION ALL SELECT 14, 'references',
    'profils avec une intro vocale',
    (SELECT count(*) FROM public.profiles WHERE voice_intro_url IS NOT NULL)::text,
    'colonne voice_intro_url'

  UNION ALL SELECT 15, 'references',
    'profils avec un media de verification',
    (SELECT count(*) FROM public.profiles WHERE verification_video_url IS NOT NULL)::text,
    'colonne verification_video_url : URL SIGNEE valable 1 an, ou chemin nu en repli'

  UNION ALL SELECT 16, 'suppressions en cours',
    'comptes en fenetre de grace',
    (SELECT count(*) FROM public.profiles WHERE deletion_scheduled_for IS NOT NULL)::text,
    'la correction future doit etre en place avant leur purge'

  UNION ALL SELECT 17, 'suppressions en cours',
    'comptes dont la grace est DEJA expiree',
    (SELECT count(*) FROM public.profiles
      WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now())::text,
    'ces comptes auraient DU etre supprimes par le cron de 03:00 UTC. S ils s accumulent, le cron ne fait pas son travail — voir diagnose_deletion_cron.sql'

  UNION ALL SELECT 18, 'suppressions en cours',
    'expiration la plus ancienne non traitee',
    COALESCE((SELECT to_char(min(deletion_scheduled_for), 'YYYY-MM-DD') || ' (' ||
                     (now()::date - min(deletion_scheduled_for)::date)::text || ' jours)'
                FROM public.profiles
               WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now()), 'aucune'),
    'un ecart de plus de 24 h prouve que le cron n a pas tourne, ou a echoue'

  UNION ALL SELECT 19, 'volumetrie',
    'comptes auth existants',
    (SELECT count(*) FROM auth.users)::text,
    'denominateur pour interpreter le nombre d orphelins'
) d
ORDER BY n;
