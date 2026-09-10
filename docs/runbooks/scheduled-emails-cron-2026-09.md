# JUNO-31 — le secret du cron de courrier était en clair dans `cron.job`

**Runbook d'exploitation. 10 septembre 2026.** À exécuter dans l'ordre. Rien dans ce fichier ne
supprime de données ; la seule opération irréversible est la **rotation**, et elle est voulue.

---

## 1. Le constat, qualifié

Deux tâches cron visaient `send-scheduled-emails` :

| tâche | cadence | réponse | secret dans la commande | créée par |
|---|---|---|---|---|
| `process-scheduled-emails` | `*/5` | **200** | **EN CLAIR** | personne — planifiée à la main |
| `send-scheduled-emails` | `*/15` | 401 | vide | `20260824000001:43` |

La première est celle qui fait réellement partir le courrier de cycle de vie. La seconde est celle
que le dépôt décrit, et elle répond 401 quatre fois par heure depuis qu'elle existe.

**La dérive était du bon côté.** Rejouer les migrations pour « remettre d'aplomb » aurait gardé la
cassée et retiré celle qui fonctionne. C'est JUNO-15 dans sa forme la plus piégeuse.

### Nature — à ne pas surqualifier

**Exposition confirmée** d'un secret applicatif. Pas un privilège excessif, pas une compromission de
la clé `service_role`.

| | |
|---|---|
| où la valeur se trouvait | `cron.job.command`, donc dans chaque sauvegarde de la base, et lisible par tout rôle capable de lire cette table |
| aggravation du 9 sep 2026 | la commande a été affichée dans un terminal pendant le diagnostic, et donc dans un historique de session |
| portée du secret | déclencher `send-scheduled-emails`. Rien d'autre. |
| ce qu'un tiers pourrait faire | forcer l'envoi anticipé de courriels **déjà en file** |
| ce qu'il ne pourrait pas faire | en fabriquer, lire un profil, contourner RLS, toucher `auth.users` |

Sérieux, non critique — et suffisant pour imposer une rotation, parce que la valeur a quitté son
périmètre. **Ne jamais reposer l'ancienne valeur.**

### Un constat latent découvert en écrivant le validateur

`20260413000003:42-43` et `20260419000004:70-71` interpolent
`app.settings.supabase_service_role_key` dans leur commande cron par `%L`. Mesuré le 9 septembre :
aucune commande vivante ne porte de JWT (`command ~ 'eyJ…'` → faux sur les six tâches), parce que ce
réglage n'est pas posé et qu'elles ont donc écrit une chaîne vide.

**Latent, pas actif.** Mais rejouer l'une d'elles avec le réglage posé écrirait la **clé de service**
en clair dans `cron.job.command`. `npm run validate:cron-secrets` épingle les cinq migrations
concernées et échoue sur toute nouvelle occurrence.

---

## 2. Ce que la correction fait

`20260910000001_scheduled_emails_cron_canonical.sql` :

- supprime les **deux** tâches historiques ;
- crée **une seule** tâche, `scheduled-emails-dispatch`, toutes les 5 minutes, **active** ;
- lit le secret dans `vault.decrypted_secrets` **à chaque passage** : la commande ne porte que son
  **nom** ;
- fait précéder l'appel de `public._assert_cron_secret('cron_scheduled_emails_secret')`, qui **lève**
  si le secret est absent ou vide. Un secret retiré du coffre produit alors un passage `failed`,
  visible, au lieu d'un en-tête nul, d'un 401 et d'un `succeeded` — les trois ingrédients de
  JUNO-29 ;
- n'envoie **aucun** en-tête `Authorization` : `config.toml:409` déclare `verify_jwt = false`, et
  l'en-tête de secret **est** l'authentification. Les deux tâches historiques en portaient un,
  construit sur un réglage vide, ce qui produisait `Bearer ` — sans effet, et trompeur.

**Elle est active dès l'application**, contrairement à `20260909000001`. L'asymétrie est
délibérée : une tâche de suppression désarmée ne détruit rien, une tâche de courrier désarmée arrête
la livraison. Rien n'est supprimé ici.

**Le fichier entier est une seule transaction.** `cron.job` est une table ordinaire : si une
assertion échoue, les deux tâches historiques sont replacées telles quelles.

Cela restaure la **topologie**, pas la **livraison**. À ce point de la procédure la nouvelle valeur
est déjà posée côté fonction edge, tandis que la tâche historique envoie l'ancienne : elle répond
401 à chaque passage. Un échec de l'étape 4 laisse donc un publieur en place et le courrier en
attente — voir §6.

---

## 3. Prérequis

| | |
|---|---|
| coffre | extension `supabase_vault` présente |
| planificateur | `pg_cron` + `cron.schedule(text,text,text)` + `cron.unschedule(text)` |
| réseau | `pg_net` + `net.http_post` |
| secret | **exactement un** `cron_scheduled_emails_secret`, non vide, **≥ 32 caractères** |

Chacun fait **échouer** la migration s'il manque. Aucun repli, aucun `COALESCE(…, '')`, aucun
`EXCEPTION WHEN OTHERS`.

> Le plancher est à 32 et non à 16 pour une raison mesurée : celui de `20260909000001` était à 16, et
> une valeur de **16 caractères** est effectivement passée le 9 septembre. Générer 64 hexadécimaux.

---

## 4. Séquence de production

### Étape 0 — geler l'état AVANT

```
supabase/tests/diagnose_scheduled_emails_cron.sql
```

Attendu avant correction : contrôle 1 = **2**, contrôle 4 = **OUI**, contrôle 12 = 0.
Conserver la sortie : c'est la moitié « avant » du dossier de preuves.

### Étapes 1 à 3 — une seule session PowerShell, ne pas la fermer

**Le token n'est jamais imprimé.** Seule son empreinte l'est. Il vit dans `$token` le temps des
étapes 2 et 3, puis est effacé.

Garder cette console ouverte du début de l'étape 1 à la fin de l'étape 3 : la valeur n'existe que
là, et il n'y a aucun moyen de la relire ensuite — ni le coffre, ni `supabase secrets list` ne la
rendent.

### Étape 1 — générer la valeur

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing

$rng   = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$rng.Dispose()
$token = -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
if ($token.Length -ne 64 -or $token -eq ('0' * 64)) { throw "Generation ratee" }
Remove-Variable bytes

$sha = [System.Security.Cryptography.SHA256]::Create()
$fp  = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token))) `
        -replace '-','').ToLower().Substring(0,16)
$sha.Dispose()

Write-Output "EMPREINTE : $fp"
```

Noter l'**EMPREINTE**. Elle prouvera que les deux côtés portent la même chaîne **sans jamais
recomparer la valeur** : 16 caractères hexadécimaux d'un SHA-256 ne permettent pas de la retrouver.

> **`RandomNumberGenerator::Fill` n'existe pas en PowerShell 5.1** — c'est une méthode .NET Core.
> Elle échoue en `MethodNotFound`, laisse `$bytes` à zéro, et produit 64 zéros. D'où `Create()` et
> le garde `throw`. Ne **jamais** utiliser `Get-Random` : ce n'est pas un générateur
> cryptographique.

### Étape 2 — poser la valeur dans le coffre

**D'abord savoir s'il existe.** `create_secret` et `update_secret` ne sont pas interchangeables, et
le choix ne se devine pas :

```sql
SELECT name, CASE WHEN name = 'cron_scheduled_emails_secret'
                  THEN '<-- celui-ci' ELSE '' END AS cible
  FROM vault.secrets
 WHERE name LIKE 'cron_%'
 ORDER BY name;
```

> Mesuré le 10 septembre 2026 : `cron_scheduled_emails_secret` **n'existe pas**. Les trois secrets
> présents sont ceux que `20260419000005` a créés — `cron_horoscope_secret`,
> `cron_scheduled_posts_secret`, `cron_expired_deletions_secret`. `20260824000001:29` *attend* le nom
> du courrier, ce qui n'est pas la même chose que le créer : c'est précisément pourquoi cette
> migration a écrit une chaîne vide dans sa commande, et pourquoi la tâche `*/15` répond 401 depuis
> qu'elle existe.
>
> Ce runbook affirmait le contraire dans sa première version. L'échec du prérequis l'a corrigé, ce
> qui est exactement le rôle d'un prérequis fail-closed.

L'éditeur SQL a besoin de la valeur, et elle ne doit pas s'afficher. Le presse-papiers est le seul
passage propre : PowerShell y place l'instruction complète, vous la collez, vous l'écrasez.

**Cas normal — le secret n'existe pas encore :**

```powershell
$sql = @"
SELECT vault.create_secret(
  '$token',
  'cron_scheduled_emails_secret',
  'JUNO-31 - en-tete du cron de courrier programme');
"@
Set-Clipboard -Value $sql
Remove-Variable sql
Write-Output "Instruction SQL dans le presse-papiers. Coller, executer, puis revenir ici."
```

**Si la requête ci-dessus l'a montré présent** — ce serait le cas lors d'une rotation ultérieure :

```powershell
$sql = @"
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_scheduled_emails_secret'),
  '$token');
"@
Set-Clipboard -Value $sql
Remove-Variable sql
```

Coller dans l'éditeur SQL de Supabase, exécuter, **puis écraser immédiatement** :

```powershell
Set-Clipboard -Value "-"
```

> Le presse-papiers est une surface partagée — un gestionnaire d'historique de presse-papiers le
> capture. C'est néanmoins strictement moins exposé que le défilement du terminal, qui persiste
> toute la session et que le diagnostic du 9 septembre a déjà rendu public une fois. Coller, puis
> écraser sans attendre.

> Pour la variante `update_secret` : elle attend l'**identifiant**, pas le nom. Si la sous-requête
> rend `NULL`, l'appel ne met rien à jour et **n'échoue pas forcément** — d'où la vérification qui
> suit, qui n'est pas facultative.

Vérifier immédiatement, sans révéler la valeur :

```sql
SELECT length(decrypted_secret) AS longueur,
       left(encode(extensions.digest(decrypted_secret, 'sha256'), 'hex'), 16) AS empreinte,
       decrypted_secret <> btrim(decrypted_secret) AS espace_parasite
  FROM vault.decrypted_secrets
 WHERE name = 'cron_scheduled_emails_secret';
```

`longueur = 64`, `empreinte` **identique** à celle de l'étape 1, `espace_parasite = false`.
Si `extensions.digest` est indisponible, essayer `digest(...)` sans préfixe.

**Rien n'est cassé à ce stade** : l'ancienne tâche `*/5` porte encore son littéral, et la fonction
edge attend encore l'ancienne valeur. Les deux sont cohérents.

### Étape 3 — poser **exactement la même** valeur côté fonction edge

```powershell
$tempSecretFile = Join-Path ([System.IO.Path]::GetTempPath()) (
  "juno-scheduled-emails-" + [guid]::NewGuid() + ".env"
)

try {
  [System.IO.File]::WriteAllText(
    $tempSecretFile,
    "SCHEDULED_EMAILS_SECRET=$token",
    [System.Text.UTF8Encoding]::new($false)
  )

  npx supabase secrets set `
    --env-file $tempSecretFile `
    --project-ref qtihezzbuubnyvrjdkjd

  if ($LASTEXITCODE -ne 0) {
    throw "Échec de la mise à jour du secret Supabase."
  }
}
finally {
  if (Test-Path -LiteralPath $tempSecretFile) {
    Remove-Item -LiteralPath $tempSecretFile -Force
  }
}
```

Quatre détails qui comptent, chacun pour une raison distincte :

| | |
|---|---|
| `npx supabase` | le CLI n'est pas installé globalement dans cet environnement |
| `--project-ref` explicite | sans lui, la commande vise le projet lié du répertoire courant — poser un secret sur le mauvais projet est silencieux |
| `UTF8Encoding::new($false)` | `Set-Content -Encoding utf8` écrit un **BOM** en PowerShell 5.1, et le BOM entrerait dans la valeur du secret |
| `try` / `finally` | une interruption entre l'écriture et le nettoyage laisserait le secret en clair dans `%TEMP%`. Le `finally` s'exécute aussi sur `throw` et sur Ctrl+C |

Le `$LASTEXITCODE` est vérifié parce que le CLI peut échouer sans lever : un échec silencieux
laisserait l'ancienne valeur en place, et l'étape 5 rendrait un 401 dont la cause serait invisible.

Puis effacer la valeur de la session :

```powershell
Remove-Variable token -ErrorAction SilentlyContinue
[System.GC]::Collect()
```

> `Remove-Variable` ne purge pas la mémoire du processus — une chaîne .NET reste sur le tas jusqu'au
> ramasse-miettes, et il n'existe pas de moyen fiable de l'effacer depuis PowerShell. Fermer la
> console après l'étape 5 est la seule garantie. C'est une limite, pas une précaution complète.

> ⚠️ **LA FENÊTRE DE 401 COMMENCE ICI.** À partir de cet instant, la fonction edge attend la
> **nouvelle** valeur, tandis que la tâche `*/5` encore en place envoie l'**ancienne**. Chaque
> passage répond 401 jusqu'à l'étape 4.
>
> **Aucun courriel n'est perdu.** `scheduled_emails.status` reste `pending` et le premier passage
> réussi les reprend tous. Le coût est un retard, borné par le temps que vous mettez à enchaîner sur
> l'étape 4 — soit un passage manqué par tranche de 5 minutes.
>
> Enchaîner immédiatement. Ne pas s'interrompre entre 3 et 4.

### Étape 4 — appliquer la migration

Rejouer `supabase/migrations/20260910000001_scheduled_emails_cron_canonical.sql` **en entier**, du
`BEGIN;` au `COMMIT;`.

Sortie attendue :

```
NOTICE:  Tache canonique scheduled-emails-dispatch en place : */5, secret lu dans le coffre,
         aucune tache historique.
```

> L'éditeur SQL de Supabase **n'affiche pas les `RAISE NOTICE`**. L'absence de ce message ne prouve
> rien ; ce qui prouve, c'est l'absence d'erreur, puis l'étape 5. C'est la leçon du 9 septembre, où
> un `NOTICE` invisible a fait croire qu'un appel avait échoué alors qu'il venait de supprimer huit
> comptes.

**Si une assertion échoue, la topologie cron est restaurée — mais la livraison ne fonctionne plus.**
La transaction est annulée et les deux tâches historiques sont replacées telles quelles ; or la
fonction edge attend déjà la **nouvelle** valeur depuis l'étape 3, alors que la tâche historique
envoie l'**ancienne**, celle qui est exposée. Chaque passage répond 401 et le courrier reste en
attente.

Lire le message d'erreur, corriger la migration, **la rejouer immédiatement**. Ne jamais reposer
l'ancienne valeur pour « faire repartir » la tâche historique : ce serait remettre en service le
secret exposé, c'est-à-dire annuler la correction.

### Étape 5 — attendre un passage, et lire la RÉPONSE

Au plus 5 minutes. Puis :

```sql
SELECT id, created, status_code, left(content, 160) AS corps
  FROM net._http_response
 WHERE content LIKE '%"processed"%' OR content LIKE '%"Unauthorized"%'
 ORDER BY created DESC
 LIMIT 10;
```

| réponse | signification | suite |
|---|---|---|
| **200** `{"processed":N,…}` | l'authentification fonctionne | étape 6 |
| **401** `{"error":"Unauthorized"}` hors 12:00 UTC | le coffre ≠ la variable d'environnement | étape 5 bis |
| **401** à 12:00 UTC pile | c'est `daily-horoscope-push`, arbitrage produit distinct | ignorer |
| aucune ligne | la requête n'est pas partie | vérifier `cron.job_run_details.status` |

> `pg_net` ne conserve **pas** l'URL dans `_http_response` : l'attribution se fait par le corps.
> `processed` n'est rendu que par `send-scheduled-emails`. `Unauthorized` avec un **U majuscule** est
> partagé avec `send-daily-horoscope`, qui ne passe qu'à 12:00 UTC — d'où le départage par l'heure,
> que le contrôle 10 du diagnostic calcule.
>
> Ne **jamais** conclure sur `cron.job_run_details.status = 'succeeded'` : il signifie que
> `net.http_post` a mis la requête **en file**, jamais qu'elle a réussi.

### Étape 5 bis — si le 401 tombe : comparer sans révéler

```sql
SELECT length(decrypted_secret) AS longueur,
       left(encode(extensions.digest(decrypted_secret, 'sha256'), 'hex'), 16) AS empreinte
  FROM vault.decrypted_secrets
 WHERE name = 'cron_scheduled_emails_secret';
```

| | |
|---|---|
| **empreinte = celle de l'étape 1** | les valeurs correspondent → redéployer `send-scheduled-emails` : le secret n'a pas été injecté dans le runtime |
| **empreinte différente** | reprendre les étapes 1 à 3 en posant **la même chaîne** des deux côtés |
| **longueur ≠ 64** | une valeur tronquée ou un espace parasite a été posé |

Une empreinte tronquée à 16 caractères hexadécimaux ne permet pas de retrouver la valeur.

Pendant ce temps, rien n'est perdu : le courrier reste `pending`.

### Étape 6 — confirmer qu'une seule tâche canonique subsiste

```sql
SELECT jobname, schedule, active,
       command ~ 'vault\.decrypted_secrets'                   AS lit_le_coffre,
       command ~ '''x-[a-z-]+-secret''\s*,\s*''[^'']+'''
         OR command ~ '"x-[a-z-]+-secret"\s*:\s*"[^"]+"'      AS porte_un_litteral
  FROM cron.job
 WHERE command ~ 'functions/v1/send-scheduled-emails';
```

Attendu : **une seule ligne**, `scheduled-emails-dispatch`, `*/5 * * * *`, `active = true`,
`lit_le_coffre = true`, `porte_un_litteral = false`.

### Étape 7 — confirmer `backlog = 0`

```sql
SELECT count(*) AS retard_metier
  FROM public.scheduled_emails
 WHERE status = 'pending' AND scheduled_for < now() - INTERVAL '2 hours';
```

**0.** C'est la preuve qui compte : elle mesure le produit, pas la plomberie.

Et la supervision, si `20260909000002` est déployée :

```sql
SELECT jobname, secret_state, backlog, verdict FROM public.check_cron_edge_health();
```

> `scheduled-emails-dispatch` sera d'abord `EN ATTENTE : replanifiee, premier passage a venir`
> — une tâche replanifiée naît sans historique, `cron.unschedule` + `cron.schedule` créant un
> nouveau `jobid`. Elle passe à `OK` après son premier passage.

### Étape 8 — consigner et fermer

Relancer `diagnose_scheduled_emails_cron.sql` et archiver la sortie à côté de celle de l'étape 0.

---

## 5. Les sept preuves

| # | preuve | où la lire |
|---|---|---|
| 1 | une seule tâche vise la fonction | diagnostic, contrôle 1 = **1** |
| 2 | aucun secret en clair dans une commande | contrôle 4 = **non**, contrôle 14 = **aucune** |
| 3 | la commande lit le coffre à l'exécution | contrôle 5 = **oui** |
| 4 | le garde d'exécution est en place | contrôle 7 = **oui** |
| 5 | un passage postérieur répond **2xx** | contrôle 9 = `2xx (processed)` uniquement |
| 6 | `backlog = 0` | contrôle 12 = **0** |
| 7 | le secret n'est ni dans le dépôt, ni dans la migration | `npm run validate:cron-secrets` |

### Preuve 7 en détail

`npm run validate:cron-secrets` prouve **structurellement**, sans connaître aucune valeur :

- aucun en-tête de secret écrit comme littéral, **dans les deux orthographes** ;
- aucune **nouvelle** interpolation `%L` de matière secrète dans une commande cron — les cinq
  migrations livrées qui le font sont épinglées nommément ;
- la migration canonique lit le coffre, porte le garde, tourne en `*/5`, supprime les deux tâches
  historiques, reste active, et ne contient ni `COALESCE(secret, '')` ni `EXCEPTION WHEN OTHERS` ;
- le nom d'en-tête de la migration est bien celui que la fonction edge lit — un renommage d'un seul
  côté produit un 401 permanent sans autre symptôme.

Pour vérifier l'**ancienne valeur** elle-même, une fois et sans la mettre dans le dépôt :

```powershell
$env:JUNO31_EXPOSED_SECRET = '<ancienne valeur>'
node scripts/validate-cron-secrets.mjs
Remove-Item Env:\JUNO31_EXPOSED_SECRET
```

Le validateur ne rend que `fichier:ligne`, jamais la valeur. Il lit l'arbre de travail : il ne peut
pas voir une valeur committée puis retirée — `git log -p -S…` et `gitleaks detect --no-git`
répondent à cette question.

---

## 6. Retour arrière

**Il n'existe pas de « retour à l'état précédent ».** L'état précédent contenait un secret exposé ;
le restaurer serait remettre en service une valeur sortie de son périmètre.

| moment | ce qui est réversible | comment |
|---|---|---|
| avant l'étape 2 | tout | ne rien faire |
| après l'étape 2 | la valeur du coffre, vers une **autre nouvelle** valeur | `vault.update_secret` |
| après l'étape 3 | idem, des deux côtés | reprendre 1 → 3 |
| **échec de l'étape 4** | la **topologie** seule — les deux tâches historiques sont replacées, mais elles répondent 401 : la fonction edge attend déjà la nouvelle valeur | corriger la migration et **la rejouer immédiatement**. Le courrier reste `pending`, rien n'est perdu. |
| après l'étape 4 | la planification seule | désarmer, ci-dessous |

Suspendre la livraison sans rien réintroduire :

```sql
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'scheduled-emails-dispatch'),
  active := false);
```

Le courrier s'accumule en `pending`, rien n'est perdu, et le retard devient visible au contrôle 12.

Déclencher un passage à la main, avec les mêmes gardes — et en rendant l'identifiant **dans la
grille de résultats**, jamais par un `NOTICE` que l'outil peut taire :

```sql
WITH cfg AS (
  SELECT
    COALESCE(
      current_setting('app.settings.supabase_url', TRUE),
      'https://qtihezzbuubnyvrjdkjd.supabase.co'
    ) || '/functions/v1/send-scheduled-emails' AS url,
    (SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'cron_scheduled_emails_secret') AS secret
),
garde AS (
  SELECT url, secret,
    CASE
      WHEN secret IS NULL OR length(secret) < 32
        THEN 'ARRET — secret vault absent, vide ou trop court'
      WHEN url !~ '^https://[a-z0-9.-]+/functions/v1/send-scheduled-emails$'
        THEN 'ARRET — URL cible invalide'
      ELSE 'ok'
    END AS verdict
  FROM cfg
)
SELECT verdict, url,
  CASE WHEN verdict = 'ok' THEN net.http_post(
    url     := url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-scheduled-emails-secret', secret),
    body    := '{}'::jsonb
  ) END AS request_id
FROM garde;
```

Un `ARRET` laisse `request_id` vide : `CASE` n'évalue pas la branche non retenue, donc aucune requête
n'est émise.

### Les deux interdits

- **Ne jamais reposer l'ancienne valeur**, ni dans le coffre, ni dans les secrets de la fonction
  edge.
- **Ne jamais réappliquer `20260824000001` ni `20260419000005`.** Leur `%L` matérialiserait la
  nouvelle valeur dans `cron.job.command` et recréerait JUNO-31 avec le secret fraîchement tourné.
  C'est le piège que `validate:cron-secrets` épingle sans pouvoir l'empêcher — un `db push` qui
  rejouerait l'historique passerait outre.

---

## 7. Ce qui reste ouvert après ce runbook

- **`daily-horoscope-push`** porte un secret **vide** depuis avril et répond 401 une fois par jour.
  La réparer enverrait une notification poussée à tous les comptes au passage suivant : **arbitrage
  produit**, pas correction technique. Non traité ici.
- **`publish-scheduled-posts`** n'est planifiée **nulle part**, alors que `20260413000003` et
  `20260419000005` la créent toutes deux. Le retard métier est à 0 aujourd'hui, donc rien n'est
  bloqué — mais un post programmé par `marketingagent` ne partirait jamais.
- **Les deux `%L` de clé de service** (`20260413000003`, `20260419000004`) restent latents. Les
  neutraliser demande une migration de plus, du même modèle que celle-ci.
- **JUNO-09** n'est pas fermé : 5 objets orphelins, le plus ancien du 1ᵉʳ février 2026.

---

## 8. État après application — 10 septembre 2026

**JUNO-31 est fermé.** La procédure a été exécutée dans l'ordre, avec la correction découverte à
l'étape 2 : le secret n'existait pas dans le coffre et a dû être **créé**, non mis à jour.

### Les sept preuves, mesurées

| # | preuve | mesure |
|---|---|---|
| 1 | une seule tâche vise la fonction | **1** — `scheduled-emails-dispatch`, `*/5 * * * *`, active |
| 2 | aucun secret en clair dans une commande | **aucun**, et aucun JWT non plus |
| 3 | la commande lit le coffre à l'exécution | **oui** |
| 4 | le garde d'exécution est en place | **oui**, et aucun rôle client ne peut l'appeler |
| 5 | un passage postérieur répond 2xx | **200** à 14:35, 14:40 et 14:45 UTC, corps portant `processed` |
| 6 | `backlog = 0` | **0** |
| 7 | rien dans le dépôt ni la migration | `validate:cron-secrets`, 29 contrôles |

Secret du coffre : **une seule occurrence**, 64 caractères, sans espace parasite. Tâches historiques
`process-scheduled-emails` et `send-scheduled-emails` : **disparues**. Passage cron enregistré à
14:50 UTC.

### Les 401 encore visibles ne sont pas les nôtres

`net._http_response` couvre 08:55–14:50 UTC et conserve donc temporairement les échecs des **deux
anciennes tâches**, tous antérieurs à la bascule. Ils ne sont pas supprimés : ils sont la preuve
historique du constat. pg_net les purgera de lui-même.

C'est la lecture que le contrôle 11 du diagnostic impose de faire — une absence de 401 sur une
fenêtre de quelques heures ne prouverait rien sur la semaine, et une présence de 401 antérieurs ne
prouve rien sur l'état actuel. **Seul le retard métier tranche**, et il est à 0.

### Ce que l'exécution a corrigé dans ce runbook

Sa première version affirmait que le secret existait déjà, « `20260824000001:29` attend ce nom ».
**Attendre un nom n'est pas le créer.** Les trois secrets présents étaient ceux que
`20260419000005` a réellement créés. C'est d'ailleurs l'explication complète du 401 de la tâche
`*/15` : la migration a lu un coffre vide et figé une chaîne vide dans sa commande.

Le prérequis fail-closed a refusé de planifier plutôt que de perpétuer l'erreur, et la transaction
s'est annulée sans rien changer. C'est exactement le comportement recherché — et c'est ce que
`20260824000001` n'a pas fait, en silence, il y a deux semaines.
