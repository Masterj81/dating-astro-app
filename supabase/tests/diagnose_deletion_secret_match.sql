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
  SELECT 0 AS n,
    'A QUOI SERT CETTE REQUETE' AS objet,
    'comparer le secret du coffre a celui de la fonction edge, SANS afficher ni l un ni l autre' AS valeur,
    'Elle rend une EMPREINTE SHA-256 tronquee a 16 caracteres. Comparer avec l empreinte calculee cote PowerShell sur la valeur posee par supabase secrets set. Identiques = les valeurs correspondent.' AS lecture

  UNION ALL SELECT 1,
    'le secret existe-t-il dans le coffre ?',
    CASE WHEN EXISTS (SELECT 1 FROM vault.decrypted_secrets
                       WHERE name = 'cron_expired_deletions_secret')
         THEN 'oui' ELSE 'NON — c est la cause' END,
    'nom attendu : cron_expired_deletions_secret'

  UNION ALL SELECT 2,
    'longueur de la valeur',
    COALESCE((SELECT length(decrypted_secret)::text || ' caracteres'
                FROM vault.decrypted_secrets
               WHERE name = 'cron_expired_deletions_secret'), 'sans objet'),
    'comparer avec la longueur de ce que vous avez pose cote edge. Une difference de 1 ou 2 = espace ou saut de ligne parasite.'

  UNION ALL SELECT 3,
    'la valeur porte-t-elle des espaces au bord ?',
    COALESCE((SELECT CASE WHEN decrypted_secret <> btrim(decrypted_secret)
                          THEN '*** OUI — espace ou saut de ligne parasite ***'
                          ELSE 'non' END
                FROM vault.decrypted_secrets
               WHERE name = 'cron_expired_deletions_secret'), 'sans objet'),
    'un \n final suffit a faire echouer la comparaison stricte de la fonction edge'

  UNION ALL SELECT 4,
    'EMPREINTE (sha256, 16 premiers caracteres)',
    pg_temp.juno_q($q$
      SELECT left(encode(extensions.digest(decrypted_secret, 'sha256'), 'hex'), 16)
        FROM vault.decrypted_secrets
       WHERE name = 'cron_expired_deletions_secret'
    $q$),
    'A COMPARER avec la sortie du bloc PowerShell du runbook. Une empreinte tronquee ne permet pas de retrouver la valeur.'

  UNION ALL SELECT 5,
    'empreinte, variante si extensions.digest est indisponible',
    pg_temp.juno_q($q$
      SELECT left(encode(digest(decrypted_secret, 'sha256'), 'hex'), 16)
        FROM vault.decrypted_secrets
       WHERE name = 'cron_expired_deletions_secret'
    $q$),
    'selon le schema ou pgcrypto est installe, l une des deux lignes 4 ou 5 repond'

  UNION ALL SELECT 6,
    'quand le secret du coffre a-t-il ete modifie ?',
    pg_temp.juno_q($q$
      SELECT to_char(updated_at, 'YYYY-MM-DD HH24:MI') || ' UTC'
        FROM vault.secrets WHERE name = 'cron_expired_deletions_secret'
    $q$),
    'si cette date est anterieure a votre update_secret, la mise a jour n a pas pris'

  UNION ALL SELECT 7,
    'la commande cron lit-elle bien le coffre ?',
    COALESCE((SELECT CASE WHEN command ~ 'vault\.decrypted_secrets' THEN 'oui'
                          ELSE 'NON — migration 20260909000001 non appliquee' END
                FROM cron.job WHERE jobname = 'process-expired-deletions'), 'tache absente'),
    'sans effet sur l appel manuel, mais confirme l etat de la migration'

  UNION ALL SELECT 8,
    'la tache est-elle toujours desarmee ?',
    COALESCE((SELECT CASE WHEN active THEN '*** ACTIVE ***' ELSE 'desarmee (attendu)' END
                FROM cron.job WHERE jobname = 'process-expired-deletions'), 'tache absente'),
    'elle doit rester inactive tant que l appel manuel ne rend pas 200'

  UNION ALL SELECT 9,
    'comptes expires restants',
    (SELECT count(*)::text FROM public.profiles
      WHERE deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for < now()),
    'toujours 8 tant que l appel rend 401 : aucune suppression n a eu lieu'
) d
ORDER BY n;
