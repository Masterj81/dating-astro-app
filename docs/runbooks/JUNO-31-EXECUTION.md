# JUNO-31 — checklist complète d'exécution en production

**Projet Supabase :** `qtihezzbuubnyvrjdkjd`  
**Date de préparation :** 10 septembre 2026  
**État initial :** préparé et testé statiquement, non appliqué  
**Migration :** `supabase/migrations/20260910000001_scheduled_emails_cron_canonical.sql`

Ce document est la checklist opérateur de JUNO-31. Le raisonnement détaillé, le
retour arrière et les preuves sont dans
`docs/runbooks/scheduled-emails-cron-2026-09.md`.

## But

Remplacer deux tâches incohérentes appelant `send-scheduled-emails` par une
seule tâche canonique :

- `process-scheduled-emails` : toutes les 5 minutes, fonctionnelle, mais secret
  exposé en clair dans `cron.job.command` ;
- `send-scheduled-emails` : toutes les 15 minutes, secret vide, réponse 401 ;
- cible : `scheduled-emails-dispatch`, toutes les 5 minutes, secret lu depuis
  Supabase Vault à chaque passage.

L'ancienne valeur de `SCHEDULED_EMAILS_SECRET` est compromise. Ne jamais la
réutiliser, l'imprimer, la placer dans une migration ou la copier dans un
ticket.

## Portes d'arrêt

Arrêter la procédure si l'une de ces conditions est vraie :

- le diagnostic initial ne montre pas les deux tâches attendues ;
- le retard métier n'est pas compris ou augmente déjà ;
- le secret Vault existe plusieurs fois sous le même nom ;
- la nouvelle valeur ne fait pas exactement 64 caractères hexadécimaux ;
- l'empreinte Vault ne correspond pas à l'empreinte PowerShell ;
- la commande Supabase CLI échoue ;
- la migration retourne une erreur ;
- une valeur secrète apparaît dans une sortie, un fichier suivi ou
  `cron.job.command`.

Ne pas toucher à `daily-horoscope-push` pendant cette procédure.

## Étape 0 — préparer la fenêtre

- [ ] Ouvrir le Dashboard Supabase du projet `qtihezzbuubnyvrjdkjd`.
- [ ] Ouvrir le SQL Editor.
- [ ] Préparer une console PowerShell dédiée.
- [ ] Confirmer qu'on peut enchaîner les étapes 3 et 4 sans interruption.
- [ ] Ne pas fermer PowerShell avant la fin de l'étape 3.

Depuis la racine du dépôt, exécuter les contrôles statiques :

```powershell
Set-Location "C:\Users\njoub\dating-astro-app"
npm run validate:cron-secrets
```

Attendu : **29 contrôles réussis**.

## Étape 1 — figer l'état avant modification

Dans Supabase SQL Editor, exécuter en entier :

```text
supabase/tests/diagnose_scheduled_emails_cron.sql
```

Archiver la sortie sans afficher le contenu d'une commande cron contenant le
secret. Les résultats attendus avant correction incluent :

- [ ] deux tâches visant `send-scheduled-emails` ;
- [ ] `process-scheduled-emails` active en `*/5` ;
- [ ] `send-scheduled-emails` active en `*/15` ;
- [ ] exposition détectée dans la tâche `*/5` ;
- [ ] retard métier connu ;
- [ ] aucune modification produite par le diagnostic.

Ne pas exécuter `SELECT command FROM cron.job` : la commande historique contient
encore l'ancien secret en clair.

## Étape 2 — générer un nouveau secret

Dans la console PowerShell dédiée :

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$rng.Dispose()

$token = -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })
if ($token.Length -ne 64 -or $token -eq ('0' * 64)) {
  throw "Generation du secret echouee"
}
[Array]::Clear($bytes, 0, $bytes.Length)
Remove-Variable bytes

$sha = [System.Security.Cryptography.SHA256]::Create()
$fp = ([BitConverter]::ToString(
  $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token))
) -replace '-', '').ToLower().Substring(0, 16)
$sha.Dispose()

Write-Output "EMPREINTE : $fp"
```

- [ ] Noter uniquement l'empreinte.
- [ ] Ne jamais exécuter `Write-Output $token`.
- [ ] Garder `$token` en mémoire pour les deux étapes suivantes.

## Étape 3 — créer le secret dans Supabase Vault

Vérifier d'abord son absence ou sa présence :

```sql
SELECT id, name, created_at, updated_at
FROM vault.secrets
WHERE name = 'cron_scheduled_emails_secret';
```

Attendu lors de cette première installation : **zéro ligne**.

### S'il est absent

Dans PowerShell, placer l'instruction complète dans le presse-papiers sans
afficher la valeur :

```powershell
$sql = @"
SELECT vault.create_secret(
  '$token',
  'cron_scheduled_emails_secret',
  'JUNO-31 - en-tete du cron de courrier programme');
"@
Set-Clipboard -Value $sql
Remove-Variable sql
```

Coller et exécuter immédiatement cette instruction dans Supabase SQL Editor.

### S'il existe déjà

Ne pas créer un doublon. Utiliser :

```powershell
$sql = @"
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets
   WHERE name = 'cron_scheduled_emails_secret'),
  '$token');
"@
Set-Clipboard -Value $sql
Remove-Variable sql
```

Après l'exécution, écraser le presse-papiers :

```powershell
Set-Clipboard -Value "-"
```

Vérifier sans révéler le secret :

```sql
SELECT
  count(*) AS nombre,
  min(length(decrypted_secret)) AS longueur,
  min(left(encode(extensions.digest(decrypted_secret, 'sha256'), 'hex'), 16)) AS empreinte,
  bool_or(decrypted_secret <> btrim(decrypted_secret)) AS espace_parasite
FROM vault.decrypted_secrets
WHERE name = 'cron_scheduled_emails_secret';
```

Attendu :

- [ ] `nombre = 1` ;
- [ ] `longueur = 64` ;
- [ ] `empreinte` identique à `$fp` ;
- [ ] `espace_parasite = false`.

Si `extensions.digest` est introuvable, remplacer uniquement
`extensions.digest` par `digest`.

À ce stade, l'ancienne tâche `*/5` continue de fonctionner. La fenêtre de 401
n'est pas encore ouverte.

## Étape 4 — poser la même valeur dans la fonction edge

Toujours dans la même session PowerShell :

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

  Set-Location "C:\Users\njoub\dating-astro-app"

  npx supabase secrets set `
    --env-file $tempSecretFile `
    --project-ref qtihezzbuubnyvrjdkjd

  if ($LASTEXITCODE -ne 0) {
    throw "Supabase n'a pas accepte le secret"
  }
}
finally {
  if (Test-Path -LiteralPath $tempSecretFile) {
    Remove-Item -LiteralPath $tempSecretFile -Force
  }
}
```

- [ ] La commande termine avec succès.
- [ ] `SCHEDULED_EMAILS_SECRET` apparaît dans `npx supabase secrets list`.
- [ ] Ne pas chercher à afficher sa valeur.

```powershell
npx supabase secrets list --project-ref qtihezzbuubnyvrjdkjd
```

Effacer ensuite les variables de la session :

```powershell
Remove-Variable token -ErrorAction SilentlyContinue
[System.GC]::Collect()
```

Conserver uniquement `$fp` jusqu'à la fin des vérifications : ce n'est pas le
secret et il sert à diagnostiquer un éventuel 401.

**La fenêtre de 401 commence maintenant.** L'edge function attend la nouvelle
valeur, tandis que l'ancienne tâche `*/5` envoie encore l'ancienne. Enchaîner
immédiatement sur l'étape 5.

## Étape 5 — appliquer la migration canonique

Dans Supabase SQL Editor, ouvrir puis exécuter **le fichier complet**, de
`BEGIN;` à `COMMIT;` :

```text
supabase/migrations/20260910000001_scheduled_emails_cron_canonical.sql
```

Ne pas exécuter seulement une sélection du fichier.

Attendu : aucune erreur. Le SQL Editor peut ne pas afficher le `RAISE NOTICE` ;
son absence n'est pas un échec.

Si la migration échoue :

1. ne jamais restaurer l'ancien secret ;
2. savoir que les deux anciennes tâches sont restaurées par la transaction,
   mais qu'elles ne peuvent plus s'authentifier ;
3. le courrier reste `pending`, il n'est pas perdu ;
4. corriger la cause et rejouer immédiatement la migration complète.

## Étape 6 — vérifier la configuration

Exécuter :

```sql
SELECT
  jobname,
  schedule,
  active,
  command ~ 'vault\.decrypted_secrets' AS lit_le_coffre,
  command ~ '''x-[a-z-]+-secret''\s*,\s*''[^'']+'''
    OR command ~ '"x-[a-z-]+-secret"\s*:\s*"[^"]+"' AS porte_un_litteral
FROM cron.job
WHERE command ~ 'functions/v1/send-scheduled-emails';
```

Attendu : exactement une ligne :

- [ ] `jobname = scheduled-emails-dispatch` ;
- [ ] `schedule = */5 * * * *` ;
- [ ] `active = true` ;
- [ ] `lit_le_coffre = true` ;
- [ ] `porte_un_litteral = false`.

Ne pas afficher la colonne `command` elle-même.

## Étape 7 — prouver une réponse HTTP réussie

Attendre au plus cinq minutes, puis rechercher la réponse de
`send-scheduled-emails` :

```sql
SELECT id, created, status_code, left(content, 160) AS corps
FROM net._http_response
WHERE content LIKE '%"processed"%'
   OR content LIKE '%"Unauthorized"%'
ORDER BY created DESC
LIMIT 10;
```

Attendu : une réponse postérieure à la migration avec :

- [ ] `status_code` compris entre 200 et 299 ;
- [ ] un corps contenant `processed`.

Si la réponse est 401, ne pas modifier la tâche cron et ne pas restaurer
l'ancien secret. Comparer l'empreinte Vault à `$fp` si la console est encore
ouverte, puis vérifier que l'étape 4 a bien visé le bon projet.

Un statut `pg_cron = succeeded` ne constitue pas une preuve HTTP.

## Étape 8 — vérifier le retard métier

```sql
SELECT count(*) AS retard_metier
FROM public.scheduled_emails
WHERE status = 'pending'
  AND scheduled_for < now() - INTERVAL '2 hours';
```

Attendu :

- [ ] `retard_metier = 0`.

Puis vérifier la supervision :

```sql
SELECT jobname, secret_state, backlog, verdict
FROM public.check_cron_edge_health();
```

Après le premier passage réussi, `scheduled-emails-dispatch` doit être visible
et ne plus être en attente de sa première exécution.

## Étape 9 — relancer le diagnostic final

Rejouer en entier :

```text
supabase/tests/diagnose_scheduled_emails_cron.sql
```

Les preuves finales attendues sont :

- [ ] une seule tâche vise `send-scheduled-emails` ;
- [ ] aucune tâche historique ne subsiste ;
- [ ] aucune valeur secrète littérale n'est détectée ;
- [ ] la commande lit Vault à l'exécution ;
- [ ] `_assert_cron_secret` est présent ;
- [ ] aucun rôle client ne peut exécuter ce garde ;
- [ ] une réponse 2xx postérieure à la migration existe ;
- [ ] le retard métier est nul.

## Étape 10 — consigner et fermer JUNO-31

Archiver sans valeur sensible :

- [ ] sortie du diagnostic avant ;
- [ ] empreinte tronquée du nouveau secret ;
- [ ] succès de la commande `secrets set` sans sa valeur ;
- [ ] résultat de la migration ;
- [ ] configuration de la tâche canonique sans colonne `command` brute ;
- [ ] réponse HTTP 2xx ;
- [ ] `retard_metier = 0` ;
- [ ] sortie du diagnostic après ;
- [ ] résultat des 29 contrôles statiques ;
- [ ] commit contenant migration, diagnostic, validateur et documentation.

Fermer ensuite la console dédiée, ou supprimer l'empreinte restante :

```powershell
Remove-Variable fp -ErrorAction SilentlyContinue
```

Fermer JUNO-31 seulement lorsque les preuves de configuration **et** de
comportement réel sont toutes présentes.

## Retour arrière sûr

Il est interdit de revenir à l'ancien secret exposé.

Si la tâche canonique doit être suspendue :

```sql
SELECT cron.alter_job(
  (SELECT jobid
   FROM cron.job
   WHERE jobname = 'scheduled-emails-dispatch'),
  active := false
);
```

Conséquence : les courriels restent en `pending`. Après correction, réactiver
la tâche ou rejouer la migration canonique, puis prouver une réponse 2xx et un
retard métier nul.

## Hors périmètre

Cette procédure ne corrige pas :

- `daily-horoscope-push`, en attente d'un arbitrage produit ;
- l'absence éventuelle de planification de `publish-scheduled-posts` ;
- les anciennes migrations qui interpoleraient une clé de service par `%L` ;
- JUNO-09 et son rattrapage des médias orphelins.
