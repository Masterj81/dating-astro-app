# JUNO-09 phase B — checklist de déploiement

**Projet Supabase :** `qtihezzbuubnyvrjdkjd`  
**Date de préparation :** 10 septembre 2026  
**État initial :** aucun élément de la phase B appliqué ou déployé  
**Effet de cette phase :** empêcher la création de nouveaux médias orphelins  
**Hors périmètre :** suppression des cinq orphelins historiques

Ce document est la checklist opérateur. Les explications de conception et le
retour arrière détaillé se trouvent dans
`docs/runbooks/media-purge-2026-09.md`.

## Fichiers canoniques

| Ordre | Fichier | Fonction |
|---|---|---|
| 1 | `20260910000002_media_purge_jobs.sql` | table durable et RPC |
| 2 | `purge-user-media/index.ts` | implémentation unique de purge |
| 3 | `process-expired-deletions/index.ts` | exécutant Deno |
| 4 | route web `confirm-deletion` | exécutant web |
| 5 | `20260910000003_media_purge_resume_cron.sql` | reprise et rétention |
| 6 | `20260910000004_cron_edge_health_media_purge.sql` | supervision |
| preuve | `diagnose_media_purge_jobs.sql` | diagnostic en lecture seule |

## État de référence

La phase B doit laisser les orphelins historiques inchangés :

- `avatars = 4` ;
- `voice-intros = 0` ;
- `verifications = 1` ;
- total `= 5` ;
- la vidéo de vérification du 1er février 2026 demeure hors de cette phase.

Une diminution de ces compteurs pendant ce déploiement est une anomalie et
impose l'arrêt.

## Portes d'arrêt générales

Arrêter immédiatement si :

- le diagnostic initial ne correspond pas à l'état de référence ;
- une migration échoue ou n'est exécutée que partiellement ;
- une empreinte de secret diffère ;
- `purge-user-media` ne réussit pas sur le compte jetable ;
- un objet d'un compte voisin disparaît ;
- le nombre d'objets `seed-*` change ;
- un chemin, une URL signée ou une valeur secrète apparaît dans les journaux ;
- `blocked_by_purge` devient supérieur à zéro pendant le déploiement ;
- le cron de reprise est installé avant que la fonction edge soit opérationnelle.

Ne jamais contourner le garde durable pour débloquer une suppression.

## Étape 0 — diagnostic et vérifications locales

Depuis la racine du dépôt :

```powershell
Set-Location "C:\Users\njoub\dating-astro-app"

npm run validate:media-purge
npm run validate:edge-security
npm run typecheck
npm run lint
```

Attendu :

- [ ] `validate:media-purge` : 57 contrôles réussis ;
- [ ] `validate:edge-security` : 233 tests, dont 44 JUNO-09 ;
- [ ] typecheck vert ;
- [ ] lint sans erreur ;
- [ ] aucun fichier temporaire créé.

Dans Supabase SQL Editor, exécuter intégralement :

```text
supabase/tests/diagnose_media_purge_jobs.sql
```

Archiver la sortie « avant » sans chemin ni nom de fichier.

Relever également, avant le test, les compteurs de protection :

```sql
SELECT count(*) AS objets_uuid_autres
FROM storage.objects
WHERE bucket_id = 'avatars'
  AND (storage.foldername(name))[1] IS NOT NULL;

SELECT count(*) AS objets_seed_racine
FROM storage.objects
WHERE bucket_id = 'avatars'
  AND name LIKE 'seed-%';
```

- [ ] noter les deux compteurs ;
- [ ] confirmer `objets_seed_racine = 60`, ou documenter tout écart avant de continuer ;
- [ ] confirmer les cinq orphelins historiques.

## Étape 1 — générer un secret unique

Utiliser une console PowerShell dédiée et la conserver jusqu'à l'étape 7.

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

- [ ] `$token.Length = 64` ;
- [ ] noter uniquement `$fp` ;
- [ ] ne jamais imprimer `$token` ;
- [ ] ne pas fermer cette console.

## Étape 2 — secret de la fonction Supabase

```powershell
$tempSecretFile = Join-Path ([System.IO.Path]::GetTempPath()) (
  "juno-media-purge-" + [guid]::NewGuid() + ".env"
)

try {
  [System.IO.File]::WriteAllText(
    $tempSecretFile,
    "MEDIA_PURGE_SECRET=$token",
    [System.Text.UTF8Encoding]::new($false)
  )

  Set-Location "C:\Users\njoub\dating-astro-app"

  npx supabase secrets set `
    --env-file $tempSecretFile `
    --project-ref qtihezzbuubnyvrjdkjd

  if ($LASTEXITCODE -ne 0) {
    throw "Supabase n'a pas accepte MEDIA_PURGE_SECRET"
  }
}
finally {
  if (Test-Path -LiteralPath $tempSecretFile) {
    Remove-Item -LiteralPath $tempSecretFile -Force
  }
}
```

Vérifier seulement le nom :

```powershell
npx supabase secrets list --project-ref qtihezzbuubnyvrjdkjd
```

- [ ] `MEDIA_PURGE_SECRET` apparaît ;
- [ ] aucune valeur n'est affichée ;
- [ ] le fichier temporaire a disparu.

## Étape 3 — variable serveur Vercel

Dans PowerShell :

```powershell
if ($token.Length -ne 64) { throw "Token absent ou invalide" }
Set-Clipboard -Value $token
```

Dans Vercel, pour le projet web JUNO :

1. ouvrir **Settings → Environment Variables** ;
2. créer ou remplacer `MEDIA_PURGE_SECRET` ;
3. coller la valeur ;
4. sélectionner **Production** ;
5. sélectionner Preview uniquement si les previews doivent réellement pouvoir
   supprimer des comptes ;
6. sauvegarder.

Ne jamais utiliser le préfixe `NEXT_PUBLIC_`.

Effacer immédiatement le presse-papiers :

```powershell
Set-Clipboard -Value "-"
```

- [ ] variable nommée exactement `MEDIA_PURGE_SECRET` ;
- [ ] aucune exposition au client ;
- [ ] la valeur provient du même `$token`.

Le changement Vercel prendra effet au prochain déploiement de la route web,
prévu à l'étape 9.

## Étape 4 — secret Vault du cron

Vérifier d'abord si le nom existe :

```sql
SELECT id, name, created_at, updated_at
FROM vault.secrets
WHERE name = 'cron_media_purge_secret';
```

### Cas normal : zéro ligne

Dans PowerShell, construire l'instruction sans imprimer le token :

```powershell
$sql = @"
SELECT vault.create_secret(
  '{0}',
  'cron_media_purge_secret',
  'JUNO-09 - en-tete de la reprise de purge des medias');
"@ -f $token

if ($sql.Contains('$token')) {
  throw "La variable token n'a pas ete remplacee"
}
if ($sql -notmatch "'[0-9a-f]{64}'") {
  throw "Le SQL ne contient pas un secret hexadecimal valide"
}

Set-Clipboard -Value $sql
Remove-Variable sql
```

Ouvrir une **nouvelle requête** dans Supabase SQL Editor, faire `Ctrl+V`, puis
exécuter la requête complète.

### Si le nom existe déjà

Utiliser `update_secret`, jamais un deuxième `create_secret` :

```powershell
$sql = @"
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_media_purge_secret'),
  '{0}');
"@ -f $token

if ($sql.Contains('$token')) {
  throw "La variable token n'a pas ete remplacee"
}
if ($sql -notmatch "'[0-9a-f]{64}'") {
  throw "Le SQL ne contient pas un secret hexadecimal valide"
}

Set-Clipboard -Value $sql
Remove-Variable sql
```

Après exécution :

```powershell
Set-Clipboard -Value "-"
```

Vérifier sans révéler la valeur :

```sql
SELECT
  count(*) AS nombre,
  min(length(decrypted_secret)) AS longueur,
  min(left(encode(extensions.digest(decrypted_secret, 'sha256'), 'hex'), 16)) AS empreinte,
  bool_or(decrypted_secret <> btrim(decrypted_secret)) AS espace_parasite
FROM vault.decrypted_secrets
WHERE name = 'cron_media_purge_secret';
```

Attendu :

- [ ] `nombre = 1` ;
- [ ] `longueur = 64` ;
- [ ] `empreinte = $fp` ;
- [ ] `espace_parasite = false`.

Ne pas effacer `$token` : il est encore nécessaire pour l'étape 7.

## Étape 5 — appliquer la table et les RPC

Dans une nouvelle requête Supabase SQL Editor, coller et exécuter **en entier** :

```text
supabase/migrations/20260910000002_media_purge_jobs.sql
```

Le fichier doit être exécuté du `BEGIN;` au `COMMIT;`.

Attendu : aucune erreur. Puis exécuter le diagnostic :

```text
supabase/tests/diagnose_media_purge_jobs.sql
```

Portes obligatoires :

- [ ] table `media_purge_jobs` présente ;
- [ ] aucune FK vers `auth.users` ;
- [ ] RLS active et deny-all pour les rôles clients ;
- [ ] trois RPC présentes ;
- [ ] aucune RPC exécutable par `anon` ou `authenticated` ;
- [ ] file initiale vide ;
- [ ] contrainte de forme active.

Si cette migration échoue, arrêter avant tout déploiement.

## Étape 6 — déployer la fonction centrale

La configuration `supabase/config.toml` doit contenir la politique attendue pour
`purge-user-media`. Déployer depuis la racine :

```powershell
Set-Location "C:\Users\njoub\dating-astro-app"

npx supabase functions deploy purge-user-media `
  --project-ref qtihezzbuubnyvrjdkjd `
  --no-verify-jwt
```

Le secret partagé est vérifié par la fonction elle-même. Ne pas remplacer
`MEDIA_PURGE_SECRET` par une clé `service_role` dans l'appelant.

- [ ] déploiement réussi ;
- [ ] aucune erreur de démarrage dans les logs ;
- [ ] aucune valeur secrète dans les logs.

Ne déployer encore aucun exécutant.

## Étape 7 — vérification contrôlée sur un compte jetable

Cette étape supprime réellement les médias du compte jetable. Elle ne doit
jamais utiliser un compte réel.

### 7.1 Préparer le compte

1. Créer un compte jetable par l'inscription normale.
2. Lui ajouter au minimum un avatar.
3. Ajouter une introduction vocale si le parcours est disponible.
4. Ne pas utiliser un média appartenant à quelqu'un d'autre.
5. Relever son UUID sans l'afficher dans les preuves publiques.

```sql
SELECT id
FROM auth.users
WHERE email = '<adresse du compte jetable>';
```

Dans PowerShell :

```powershell
$testUserId = '<UUID DU COMPTE JETABLE>'
if ($testUserId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') {
  throw "UUID de test invalide"
}
```

### 7.2 Mesurer avant

```sql
SELECT bucket_id, count(*) AS objets
FROM storage.objects
WHERE bucket_id IN ('avatars', 'voice-intros', 'verifications')
  AND (storage.foldername(name))[1] = '<UUID DU COMPTE JETABLE>'
GROUP BY bucket_id;
```

Noter les compteurs sans afficher les chemins.

### 7.3 Appeler la purge

```powershell
$body = @{ userId = $testUserId; requestedBy = 'manual' } | ConvertTo-Json -Compress
$headers = @{
  'x-media-purge-secret' = $token
  'Content-Type' = 'application/json'
}

$first = Invoke-RestMethod -Method Post `
  -Uri "https://qtihezzbuubnyvrjdkjd.supabase.co/functions/v1/purge-user-media" `
  -Headers $headers `
  -Body $body

$first | Select-Object jobCreated, done, errorClass, perCategory
```

Attendu :

- [ ] `jobCreated = true` ;
- [ ] `done = true` ;
- [ ] `errorClass` vide ou `null` ;
- [ ] nombre supprimé égal au nombre mesuré avant.

Ne pas continuer en cas de 401, 403, 5xx ou timeout.

### 7.4 Prouver l'idempotence

Rejouer exactement le même appel :

```powershell
$second = Invoke-RestMethod -Method Post `
  -Uri "https://qtihezzbuubnyvrjdkjd.supabase.co/functions/v1/purge-user-media" `
  -Headers $headers `
  -Body $body

$second | Select-Object jobCreated, done, errorClass, perCategory
```

Attendu :

- [ ] `done = true` ;
- [ ] `deleted = 0` au second passage ;
- [ ] aucune erreur.

Le secret n'est plus nécessaire dans PowerShell :

```powershell
Remove-Variable token -ErrorAction SilentlyContinue
Remove-Variable headers -ErrorAction SilentlyContinue
Remove-Variable body -ErrorAction SilentlyContinue
[System.GC]::Collect()
```

Fermer ensuite cette console dédiée.

### 7.5 Vérifier Storage et le travail

```sql
SELECT status, per_category, attempts, last_error_class
FROM public.media_purge_jobs
WHERE user_id = '<UUID DU COMPTE JETABLE>';

SELECT bucket_id, count(*) AS objets_restants
FROM storage.objects
WHERE bucket_id IN ('avatars', 'voice-intros', 'verifications')
  AND (storage.foldername(name))[1] = '<UUID DU COMPTE JETABLE>'
GROUP BY bucket_id;
```

Attendu : travail `completed` et zéro objet restant.

Vérifier les protections :

```sql
SELECT count(*) AS objets_uuid_autres
FROM storage.objects
WHERE bucket_id = 'avatars'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND (storage.foldername(name))[1] <> '<UUID DU COMPTE JETABLE>';

SELECT count(*) AS objets_seed_racine
FROM storage.objects
WHERE bucket_id = 'avatars'
  AND name LIKE 'seed-%';
```

- [ ] compte voisin inchangé ;
- [ ] objets `seed-*` inchangés ;
- [ ] cinq orphelins historiques toujours présents.

Ne supprimez pas encore le compte jetable : son parcours normal servira de
preuve après le déploiement des exécutants.

## Étape 8 — déployer l'exécutant Deno

Déployer seulement après le succès complet de l'étape 7 :

```powershell
Set-Location "C:\Users\njoub\dating-astro-app"

npx supabase functions deploy process-expired-deletions `
  --project-ref qtihezzbuubnyvrjdkjd `
  --no-verify-jwt
```

- [ ] déploiement réussi ;
- [ ] aucune suppression expirée bloquée par la purge ;
- [ ] aucun log ne contient de chemin ou de secret.

## Étape 9 — déployer la route web

La variable Vercel `MEDIA_PURGE_SECRET` doit déjà exister en Production.

1. committer et pousser la phase B sur une branche dédiée ;
2. ouvrir ou mettre à jour la pull request ;
3. attendre le CI ;
4. fusionner vers `master` ;
5. attendre la fin du déploiement Vercel ;
6. vérifier que le déploiement utilise bien la variable serveur.

Ne pas considérer le merge comme une preuve de déploiement.

### Vérifier le parcours normal

Supprimer le compte jetable par le parcours web normal.

Attendu :

- [ ] création/reprise idempotente du travail ;
- [ ] suppression Auth réussie ;
- [ ] aucun média restant ;
- [ ] aucun objet d'un autre compte supprimé ;
- [ ] message de confirmation corrigé ;
- [ ] aucune erreur `blocked_by_purge`.

## Étape 10 — installer reprise et rétention

Dans Supabase SQL Editor, exécuter en entier :

```text
supabase/migrations/20260910000003_media_purge_resume_cron.sql
```

Attendu :

- [ ] tâche de reprise active en `*/10` ;
- [ ] commande figée en mode `resume` ;
- [ ] secret lu depuis `cron_media_purge_secret` à l'exécution ;
- [ ] aucun secret littéral dans `cron.job.command` ;
- [ ] rétention des travaux `completed` à 90 jours ;
- [ ] aucune ligne créée pour les cinq orphelins historiques.

## Étape 11 — étendre la supervision

Exécuter en entier :

```text
supabase/migrations/20260910000004_cron_edge_health_media_purge.sql
```

Puis :

```sql
SELECT jobname, secret_state, backlog, verdict
FROM public.check_cron_edge_health();
```

Attendu pour la reprise :

- [ ] tâche visible ;
- [ ] secret lu depuis Vault ;
- [ ] backlog numérique ;
- [ ] aucune conclusion fondée uniquement sur `pg_cron = succeeded`.

## Étape 12 — preuves finales

Rejouer :

```text
supabase/tests/diagnose_media_purge_jobs.sql
```

Archiver les preuves suivantes sans données sensibles :

- [ ] table sans FK vers Auth ;
- [ ] RLS deny-all et RPC inaccessibles aux clients ;
- [ ] aucune chaîne stockable dans `per_category` ;
- [ ] reprise active toutes les 10 minutes ;
- [ ] aucun secret en clair dans la commande cron ;
- [ ] rétention active à 90 jours ;
- [ ] backlog de purge nul ;
- [ ] purge réelle du compte jetable ;
- [ ] second passage idempotent ;
- [ ] compte voisin intact ;
- [ ] objets `seed-*` intacts ;
- [ ] cinq orphelins historiques inchangés ;
- [ ] 57 contrôles statiques verts ;
- [ ] 233 tests edge verts ;
- [ ] état exact de Supabase, Vercel et du dépôt.

La phase B peut être déclarée déployée et prouvée. **JUNO-09 reste ouvert** tant
que le rattrapage historique séparé n'a pas supprimé les cinq orphelins après
validation humaine.

## Retour arrière

Si les suppressions se bloquent après le déploiement des exécutants :

1. ne pas retirer le garde durable ;
2. vérifier la présence de `MEDIA_PURGE_SECRET` dans Supabase et Vercel ;
3. comparer les empreintes, jamais les valeurs ;
4. vérifier les logs de `purge-user-media` sans chemins sensibles ;
5. corriger la configuration puis reprendre.

Pour suspendre la reprise sans supprimer de données :

```sql
SELECT cron.unschedule('media-purge-resume')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'media-purge-resume'
);
```

La suspension ne restaure aucun objet déjà supprimé. Elle laisse les travaux
`pending` s'accumuler ; elle doit donc rester temporaire et surveillée.

Ne jamais redéployer un ancien exécutant qui appelle directement
`auth.admin.deleteUser()` sans créer d'abord un travail durable : cela
réintroduirait JUNO-09.

