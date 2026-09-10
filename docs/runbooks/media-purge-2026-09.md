# JUNO-09 phase B — purger les médias quand un compte est supprimé

**Runbook d'exploitation. 10 septembre 2026.** Rien n'est appliqué ni déployé au moment où ce
document est écrit.

---

## 1. Le constat, qualifié

Les trois chemins de suppression appelaient `auth.admin.deleteUser()` et rien d'autre. La cascade de
clés étrangères emporte `profiles` et tout ce qui en dépend. Elle n'emporte **aucun objet de
Storage** : ceux-là vivent dans `storage.objects`, qui n'a pas de clé étrangère vers `auth.users`.

Mesuré le 9 septembre 2026, **corrigé le 10 après la fermeture de JUNO-29** :

| bucket | orphelins |
|---|---|
| `avatars` | **4** |
| `voice-intros` | 0 |
| `verifications` | **1** — une vidéo du visage |
| **total** | **5** · plus ancien : **1ᵉʳ février 2026** |

> Le quatrième avatar est celui du seul compte, parmi les huit supprimés par JUNO-29, qui possédait un
> objet. Cet arbitrage avait été rendu explicitement : *« Le retard d'effacement de huit comptes
> l'emporte sur la création contrôlée d'un seul nouvel avatar orphelin. »*

### Nature

Ce n'est **ni une exposition, ni une fuite**. Aucun de ces objets n'a été divulgué. C'est une
**conservation sans base légale** : des données personnelles — dont un média biométrique au sens
large — subsistent après que leur propriétaire a demandé la suppression de son compte, depuis plus de
sept mois pour la plus ancienne.

Le préjudice est la rétention, pas l'accès. Cela ne le rend pas mineur : `avatars` est un bucket
**public**, donc l'objet reste servi par URL à qui la connaît.

---

## 2. Ce que la phase B fait, et dans quel ordre

```
1. créer la ligne media_purge_jobs          ← PRÉALABLE OBLIGATOIRE
2. tenter la purge, lots bornés, budget borné
3. supprimer auth.users                      ← l'exécutant
4. marquer le travail terminé, ou le laisser pending
5. un cron reprend ce qui reste
```

**1 avant 3 n'est pas une préférence.** La ligne porte l'UUID et **n'a pas de clé étrangère vers
`auth.users`** : c'est la seule chose qui survive à la cascade, donc la seule qui puisse piloter une
reprise après la disparition du compte. Si l'étape 1 échoue, l'exécutant **ne supprime pas** le
compte — il créerait un orphelin sans trace de son existence.

**3 ne dépend jamais du succès de 2.** Le lecteur a demandé la suppression de son compte ; la lui
refuser parce que le stockage tousse serait un manquement plus grave que celui qu'on corrige. C'est
l'étape 5 qui garantit la fin.

### Une seule implémentation, et c'est le point

`process-expired-deletions` est du Deno, la route web `confirm-deletion` du Node. Deux runtimes ne
partagent pas un module sans une étape de compilation, et une étape de compilation que personne ne
lance est exactement comment ce dépôt a fini avec **deux éphémérides** et **deux jeux de tarot** déjà
divergents quand on les a trouvés. La purge vit donc dans une fonction edge unique,
`purge-user-media`, que les deux appellent en serveur-à-serveur.
`npm run validate:media-purge` le **prouve** au lieu de l'espérer.

### La propriété est prouvée, jamais devinée

Les cinq points d'upload du dépôt écrivent tous `{uuid}/{fichier}` — vérifié dans
`app/(tabs)/profile.tsx`, `app/profile/edit.tsx`, `verificationService.ts`, `voiceIntroService.ts` et
`AccountProfileWorkspace.tsx`. La propriété est donc **le premier segment du chemin égal à l'UUID en
entier**.

Jamais une correspondance partielle : `scripts/seed-profile-photos.js:161` écrit
`seed-{uuid}.jpg` **à la racine du bucket**. Il y a **60 objets de cette forme dans `avatars`
aujourd'hui**, et un test `path.includes(uuid)` les supprimerait tous.

Un chemin dont la propriété ne peut pas être prouvée n'est **jamais** supprimé : il est compté
`failed` avec la classe `ambiguous_ownership`, ce qui laisse le travail ouvert et visible.

### Ce qui ne peut pas être stocké, structurellement

`media_purge_jobs` ne porte ni chemin, ni nom de fichier, ni URL, ni message d'erreur libre. Deux
garde-fous, pas deux conventions :

- `last_error_class` a une contrainte `CHECK` sur **sept classes fermées** — un `SQLERRM` est
  **refusé** par la base ;
- `per_category` est validée par `_media_purge_shape_ok`, qui n'accepte que les trois buckets de la
  liste blanche et, sous chacun, quatre métriques **numériques ou booléennes**. Une chaîne est
  refusée, donc un chemin est instockable.

---

## 3. Prérequis

| | |
|---|---|
| coffre | `supabase_vault`, avec `cron_media_purge_secret` ≥ 32 caractères |
| planificateur | `pg_cron` + `cron.schedule` + `cron.unschedule` |
| réseau | `pg_net` + `net.http_post` |
| garde | `public._assert_cron_secret` (20260910000001) |
| table | `media_purge_jobs` + les trois RPC (20260910000002) |
| fonction edge | `purge-user-media` déployée, `MEDIA_PURGE_SECRET` posé |
| web | `MEDIA_PURGE_SECRET` posé dans Vercel |

---

## 4. ⚠️ L'ORDRE DE DÉPLOIEMENT, ET POURQUOI UNE INVERSION CASSE LE PRODUIT

Le garde est **fail-closed** : un exécutant qui n'obtient pas de ligne de travail **refuse de
supprimer le compte**. C'est le bon comportement, et c'est aussi ce qui rend l'ordre impératif.

> **Déployer un exécutant avant que `purge-user-media` ne réponde bloque toutes les suppressions de
> compte.** Aucune donnée n'est perdue et rien n'est irréversible — mais un lecteur qui demande la
> suppression de son compte reçoit une erreur, et les suppressions expirées s'accumulent dans
> `blocked_by_purge`. C'est visible, réparable, et à éviter.

| # | étape | pourquoi ici |
|---|---|---|
| 0 | geler l'état : `diagnose_media_purge_jobs.sql` | la moitié « avant » du dossier de preuves |
| 1 | générer la valeur du secret, sans l'afficher | §5 |
| 2 | poser `MEDIA_PURGE_SECRET` dans les **secrets Supabase** | la fonction edge en a besoin dès son déploiement |
| 3 | poser **la même valeur** dans **Vercel** | sinon la route web refusera toute suppression |
| 4 | poser **la même valeur** dans le **coffre** (`cron_media_purge_secret`) | prérequis de la migration 3 |
| 5 | appliquer **20260910000002** — table + RPC | la fonction edge les appelle |
| 6 | déployer **`purge-user-media`** | doit répondre avant qu'un exécutant ne l'appelle |
| 7 | **vérification contrôlée** sur un compte jetable | §6 — la seule preuve du comportement réel |
| 8 | déployer **`process-expired-deletions`** | le garde peut désormais aboutir |
| 9 | déployer la **route web** (fusion vers `master` → Vercel) | idem, et la variable Vercel est posée depuis l'étape 3 |
| 10 | appliquer **20260910000003** — reprise + rétention | la fonction doit exister ; la tâche est **armée** |
| 11 | appliquer **20260910000004** — supervision étendue | pour que la reprise soit **mesurée** |
| 12 | les preuves, §7 | |

Les étapes 2, 3 et 4 doivent porter **exactement la même chaîne**. Les trois côtés se comparent par
empreinte, jamais par valeur.

---

## 5. Le secret — généré une fois, jamais imprimé

**Le token n'est jamais affiché.** Seule son empreinte l'est. Garder cette console ouverte des
étapes 1 à 4 : la valeur n'existe que là, et rien ne permet de la relire ensuite.

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

> **`RandomNumberGenerator::Fill` n'existe pas en PowerShell 5.1** — c'est une méthode .NET Core.
> Elle échoue en `MethodNotFound`, laisse le tampon à zéro, et produit 64 zéros. D'où `Create()` et
> le garde `throw`. Ne **jamais** utiliser `Get-Random` : ce n'est pas un générateur cryptographique.

### Étape 2 — secrets Supabase

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
  npx supabase secrets set `
    --env-file $tempSecretFile `
    --project-ref qtihezzbuubnyvrjdkjd
  if ($LASTEXITCODE -ne 0) { throw "Echec de la mise a jour du secret Supabase." }
}
finally {
  if (Test-Path -LiteralPath $tempSecretFile) {
    Remove-Item -LiteralPath $tempSecretFile -Force
  }
}
```

`UTF8Encoding::new($false)` : `Set-Content -Encoding utf8` écrit un **BOM** en PowerShell 5.1, et le
BOM entrerait dans la valeur du secret. `finally` : une interruption laisserait le secret en clair
dans `%TEMP%`.

### Étape 3 — Vercel

```powershell
Set-Clipboard -Value $token
Write-Output "Valeur dans le presse-papiers. Coller dans Vercel > Settings > Environment Variables"
Write-Output "  nom  : MEDIA_PURGE_SECRET"
Write-Output "  scope: Production (et Preview si les previews doivent supprimer des comptes)"
```

Puis écraser aussitôt : `Set-Clipboard -Value "-"`.

> `MEDIA_PURGE_SECRET` est une variable **serveur**. Ne jamais la préfixer `NEXT_PUBLIC_` : elle
> partirait dans le bundle client, et n'importe qui pourrait alors purger les médias de n'importe
> quel compte dont il connaît l'UUID.

### Étape 4 — le coffre

```powershell
$sql = @"
SELECT vault.create_secret(
  '$token',
  'cron_media_purge_secret',
  'JUNO-09 - en-tete de la reprise de purge des medias');
"@
Set-Clipboard -Value $sql
Remove-Variable sql
```

Coller, exécuter, puis `Set-Clipboard -Value "-"`. Vérifier sans révéler :

```sql
SELECT length(decrypted_secret) AS longueur,
       left(encode(extensions.digest(decrypted_secret, 'sha256'), 'hex'), 16) AS empreinte,
       decrypted_secret <> btrim(decrypted_secret) AS espace_parasite
  FROM vault.decrypted_secrets
 WHERE name = 'cron_media_purge_secret';
```

`longueur = 64`, `empreinte` identique à l'étape 1, `espace_parasite = false`.

Conserver `$token` dans cette même session PowerShell jusqu'à la fin de la
vérification contrôlée de l'étape 7 : l'appel direct à `purge-user-media` en a
encore besoin. Ne pas fermer la console et ne pas régénérer une autre valeur
entre-temps. Effacer `$token` immédiatement après le second appel idempotent de
l'étape 7, comme indiqué dans cette section.

---

## 6. Étape 7 — la vérification contrôlée ⚠️ elle supprime des objets réels

**C'est la seule preuve du comportement réel.** Les 44 tests vitest utilisent un double de Storage :
ils prouvent les **décisions**, pas que Supabase Storage se comporte comme modélisé.

Elle est conçue pour ne toucher **aucune donnée d'un compte réel** :

1. Créer un compte jetable par le parcours d'inscription normal (web ou mobile).
2. Y téléverser un avatar, et si possible une intro vocale.
3. Relever son UUID :
   ```sql
   SELECT id FROM auth.users WHERE email = '<adresse du compte jetable>';
   ```
4. Constater ses objets, **sans afficher les chemins** :
   ```sql
   SELECT bucket_id, count(*) AS objets
     FROM storage.objects
    WHERE bucket_id IN ('avatars', 'voice-intros', 'verifications')
      AND (storage.foldername(name))[1] = '<UUID>'
    GROUP BY bucket_id;
   ```
5. Appeler la purge **directement**, en mode `purge`. Cet appel **ne supprime pas le compte** — seuls
   les exécutants le font. Il purge les médias et enregistre le travail.

   ```powershell
   $body = '{"userId":"<UUID>","requestedBy":"manual"}'
   $headers = @{ "x-media-purge-secret" = $token; "Content-Type" = "application/json" }
   Invoke-RestMethod -Method Post `
     -Uri "https://qtihezzbuubnyvrjdkjd.supabase.co/functions/v1/purge-user-media" `
     -Headers $headers -Body $body
   ```

   Attendu : `jobCreated: true`, `done: true`, `errorClass: null`, et `perCategory.avatars.deleted`
   égal au nombre relevé à l'étape 4.

6. Rejouer **le même appel**. Attendu : `done: true`, `deleted: 0`. C'est l'idempotence prouvée en
   conditions réelles.
   Après ce second appel, le secret n'est plus nécessaire dans PowerShell :
   ```powershell
   Remove-Variable token -ErrorAction SilentlyContinue
   Remove-Variable headers -ErrorAction SilentlyContinue
   [System.GC]::Collect()
   ```
   Fermer ensuite cette console dédiée : c'est la seule garantie réelle que la
   chaîne .NET ne reste plus dans la mémoire du processus.
7. Vérifier que la requête de l'étape 4 rend désormais **zéro ligne**, et que le travail est
   `completed` :
   ```sql
   SELECT status, per_category, attempts, last_error_class
     FROM public.media_purge_jobs
    WHERE user_id = '<UUID>';
   ```
8. Vérifier qu'un compte **voisin** n'a rien perdu — l'assertion qui compte le plus :
   ```sql
   SELECT count(*) AS objets_des_autres_comptes
     FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND (storage.foldername(name))[1] IS NOT NULL
      AND (storage.foldername(name))[1] <> '<UUID>';
   ```
   Ce nombre doit être **identique** à ce qu'il était avant l'appel. Le noter à l'étape 0.
9. Vérifier que les **60 objets `seed-*` à la racine** sont intacts :
   ```sql
   SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'avatars' AND name LIKE 'seed-%';
   ```
   Attendu : **60**, inchangé.
10. Supprimer le compte jetable par le parcours normal, et vérifier qu'il traverse maintenant le
    garde sans encombre.

Si l'appel de l'étape 5 rend **401**, le secret côté fonction edge diffère de celui utilisé. Comparer
les empreintes, ne pas insister : rien n'a été supprimé.

---

## 7. Les preuves

| # | preuve | où la lire |
|---|---|---|
| 1 | la table ne porte **aucune** clé étrangère | diagnostic, contrôle 2 |
| 2 | deny-all, aucun rôle client | contrôles 3 et 4 |
| 3 | les trois RPC sont fermées à `authenticated` | contrôle 5 |
| 4 | **retard métier = 0** | contrôle 8 |
| 5 | aucune chaîne dans `per_category` | contrôle 12 |
| 6 | la reprise est armée, `*/10`, figée en mode reprise | contrôles 13 et 14 |
| 7 | le secret n'est pas en clair dans la commande | contrôle 15 |
| 8 | la rétention est armée à 90 jours | contrôles 16 et 17 |
| 9 | les **5 orphelins historiques** sont inchangés | contrôles 19 et 20 |
| 10 | la supervision **mesure** la reprise | `check_cron_edge_health()` → `backlog` numérique |
| 11 | un compte réel voit ses médias partir, et lui seul | §6 étapes 5 à 9 |
| 12 | l'idempotence en conditions réelles | §6 étape 6 |
| 13 | les garde-fous du dépôt tiennent | `npm run validate:media-purge` — 57 contrôles |
| 14 | les décisions sont testées | `npm run validate:edge-security` — 233 tests, dont 44 pour JUNO-09 |

La preuve **9** est celle qu'on oublie : la phase B ne doit **rien** changer à l'état historique.
`avatars = 4`, `verifications = 1`. Un chiffre en baisse sans rattrapage validé est une anomalie.

---

## 8. Le rattrapage historique — livrable séparé, NON exécutable ici

**Les cinq orphelins ne sont pas touchés par la phase B**, et ce n'est pas un oubli :

- aucune ligne `media_purge_jobs` ne les désigne ;
- la tâche de reprise est **figée en mode `resume`**, donc elle ne peut agir que sur des travaux déjà
  enregistrés ;
- le détecteur (`diagnose_media_ownership.sql`) est **strictement en lecture** et n'a aucun mode
  destructif.

Le rattrapage, quand il sera écrit, devra porter :

| exigence | pourquoi |
|---|---|
| `--dry-run` par défaut | un outil de suppression de masse ne doit pas supprimer par défaut |
| manifeste immuable, produit **avant** toute suppression | il faut pouvoir dire ce qui a été supprimé |
| validation humaine explicite du rapport | c'est la décision, pas la mécanique, qui manque |
| plafond de volume | 5 aujourd'hui ; un bug de classification en ferait 90 |
| arrêt sur anomalie | un écart entre le manifeste et l'état courant arrête tout |
| aucun chemin dans les journaux | même règle que partout ailleurs ici |

**JUNO-09 n'est PAS fermé à la fin de ce runbook.** La phase B arrête l'hémorragie ; les cinq objets
déjà là restent à traiter, dont la vidéo de vérification du 1ᵉʳ février.

---

## 9. Retour arrière

| moment | réversible | comment |
|---|---|---|
| avant l'étape 5 | tout | ne rien faire |
| après 5 (migration table) | oui | les `DROP` sont en fin de 20260910000002 |
| après 6 (fonction déployée) | oui | elle n'est appelée par personne encore |
| **après 8 ou 9 (exécutants)** | oui, mais **attention** | redéployer la version précédente rétablit la suppression sans purge |
| après 10 (crons) | oui | `cron.unschedule('media-purge-resume')`, idem `-retention` |
| **objets supprimés** | **non** | un objet de Storage supprimé ne revient pas |

**Si les suppressions se bloquent** (`blocked_by_purge > 0`, ou la route web renvoie 500), la cause
est presque toujours le secret : absent côté Supabase, absent côté Vercel, ou différent des deux
côtés. Comparer les empreintes. **Ne jamais « débloquer » en retirant le garde** : cela remettrait en
service exactement le défaut corrigé, et sans trace.

Désarmer la reprise n'efface rien, mais laisse les purges échouées s'accumuler en silence — c'est le
défaut d'origine. Ne pas laisser durer cet état.

---

## 10. Risques résiduels

| risque | portée | atténuation |
|---|---|---|
| **Les 5 orphelins historiques restent** | 4 avatars, 1 vidéo de vérification | §8, livrable séparé. C'est le risque le plus important, et il est assumé. |
| **Les tests utilisent un double de Storage** | les 44 tests prouvent des décisions, pas le service | §6 exerce le service réel, une fois, sur un compte jetable |
| **`avatars` est un bucket public** | un objet orphelin reste servi par URL à qui la connaît | hors périmètre : rendre le bucket privé est une décision produit (JUNO-22) |
| **Un secret absent bloque les suppressions** | visible, réparable, aucune perte | §4 impose l'ordre ; `blocked_by_purge` le compte |
| **Un objet plus profond que `MAX_DEPTH`** | jamais silencieux : le bucket reste `done: false` | la reprise continue de le voir ; aucun chemin actuel n'a de sous-dossier |
| **`ambiguous_ownership` bloque un travail** | un objet non prouvé possédé n'est jamais supprimé | contrôle 11 du diagnostic ; demande un humain, par conception |
| **Un compte au-delà du budget de 20 s** | le travail reste `pending` | la reprise le termine ; le contrôle 8 le rend visible |
| **La rétention efface les UUID à 90 jours** | après quoi une reprise n'est plus possible | un travail `pending` n'est **jamais** effacé, quel que soit son âge |
| **JUNO-19 (pas de délai de grâce sur le web)** | distinct et toujours ouvert | rien ici ne présume la réponse |
| **`net._http_response` purgée par pg_net** | les codes HTTP ont une mémoire courte | le retard métier est le signal fiable, pas les 2xx |
