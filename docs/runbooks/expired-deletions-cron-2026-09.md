# Runbook — JUNO-29 : le cron de suppression définitive n'a jamais rien supprimé

**9 septembre 2026.** Découvert pendant la phase A de JUNO-09, dont il est **distinct**.

Rien ici n'a été exécuté. **Les migrations n'engagent aucune suppression** : la tâche est
replanifiée **désarmée**. La suppression n'a lieu qu'au déclenchement manuel de l'étape 4, qui
demande votre validation.

Preuves figées avant toute écriture : [`docs/juno-29-evidence-2026-09-09.md`](../juno-29-evidence-2026-09-09.md).

---

## 1. Le constat, en une ligne

**142 nuits de suite, la tâche s'est déclarée réussie sans rien supprimer.** Huit personnes ont
demandé l'effacement de leur compte ; la plus ancienne attend depuis **114 jours**.

`pg_cron` enregistre `succeeded` dès que `net.http_post` a **mis la requête en file**. Il ne lit
jamais le code de réponse. La supervision voyait donc 142 succès consécutifs.

## 2. Cause racine — le même défaut, écrit deux fois

[`20260419000004:46-49`](../../supabase/migrations/20260419000004_account_soft_deletion.sql#L46),
puis [`20260419000005`](../../supabase/migrations/20260419000005_rotate_cron_secrets.sql) via
`public._load_cron_secret` :

```sql
v_secret := COALESCE(current_setting('app.settings.…', TRUE), '');
…
EXCEPTION WHEN OTHERS THEN RAISE NOTICE '… — reschedule manually';
```

Le paramètre n'a jamais été posé → `NULL` → `''` → en-tête `x-expired-deletions-secret` **vide**,
figé dans `cron.job.command`. `process-expired-deletions/index.ts:51-52` la refuse — correctement —
par un 401. `config.toml:411` déclare `verify_jwt = false` pour cette fonction : le refus vient bien
de son propre contrôle, pas de la passerelle.

Deux constructions fail-open dans le même bloc : un défaut qui vaut « pas de secret », et un
gestionnaire qui empêche l'échec d'être vu.

### 2 bis. Ce n'est pas une tâche isolée — mesuré le 9 septembre

| tâche cron | cible | fréquence | secret | verdict |
|---|---|---|---|---|
| `daily-horoscope-push` | send-daily-horoscope | `0 12 * * *` | **VIDE** | **401 — cassée** |
| `process-expired-deletions` | process-expired-deletions | `0 3 * * *` | **VIDE** | **401 — JUNO-29** |
| `process-scheduled-emails` | send-scheduled-emails | `*/5 * * * *` | aucun en-tête | **200 — fonctionne** |
| `send-scheduled-emails` | send-scheduled-emails | `*/15 * * * *` | **VIDE** | **401 — cassée** |

**L'horoscope quotidien n'est pas parti depuis avril.** Même défaut, même migration, autre
fonctionnalité — et personne ne l'a signalé, parce qu'une notification push absente ne laisse
aucune trace.

**`publish-scheduled-posts` n'est planifiée nulle part**, bien que `20260413000003` et
`20260419000005` la créent. La publication marketing programmée n'a aucun publieur. Rien n'est
bloqué aujourd'hui (retard = 0), mais un post programmé ne partirait jamais.

**Et la tâche qui marche n'est dans aucune migration.** `process-scheduled-emails` a été planifiée
à la main ; elle passe un `Authorization` valide, donc `send-scheduled-emails/index.ts:11-24`
l'accepte sans secret. Celle que le dépôt documente (`20260824000001:44`) répond 401 quatre fois par
heure. **Rejouer les migrations pour « remettre d'aplomb » garderait la cassée et pourrait retirer
celle qui fonctionne.**

Ces trois points relèvent de **JUNO-30**, séparé. Ce runbook ne traite que
`process-expired-deletions`.

## 3. Ce qui est livré

| fichier | rôle | destructif ? |
|---|---|---|
| `supabase/tests/diagnose_cron_edge_supervision.sql` | état réel des 4 tâches edge, noms de secrets, fenêtre pg_net, retards métier | **non — lecture seule** |
| `supabase/migrations/20260909000001_expired_deletions_cron_fail_closed.sql` | JUNO-29 : corrige la commande, secret au coffre, **laisse la tâche INACTIVE** | **non** |
| `supabase/migrations/20260909000002_cron_edge_health.sql` | JUNO-30 : `check_cron_edge_health()` | **non** |

## 4. Mécanisme coffre

Le secret sort de `cron.job.command`. La commande porte désormais une **sous-requête** résolue à
chaque passage :

```sql
'x-expired-deletions-secret',
  (SELECT v.decrypted_secret FROM vault.decrypted_secrets v
    WHERE v.name = 'cron_expired_deletions_secret')
```

Trois conséquences : `cron.job.command` ne contient plus aucune valeur sensible ; une rotation ne
demande plus de replanifier ; et le secret ne peut plus être « figé vide », puisqu'il n'est plus
figé du tout.

**Le nom est `cron_expired_deletions_secret`** — celui que `20260419000005` a établi, pas un
nouveau. La migration échoue si le secret est absent, vide, ou plus court que 16 caractères.

## 5. Procédure

### Étape 0 — geler les preuves

Exécuter les trois diagnostics en lecture seule et conserver leurs sorties. Déjà fait pour
JUNO-29 : `docs/juno-29-evidence-2026-09-09.md`. Ajouter la sortie de
`diagnose_cron_edge_supervision.sql`, non encore mesurée.

### Étape 1 — le secret est déjà dans le coffre : le vérifier, pas le créer

Mesuré le 9 septembre : `cron_expired_deletions_secret` **existe**, aux côtés de
`cron_horoscope_secret` et `cron_scheduled_posts_secret`. Le prérequis de `20260909000001` est donc
**déjà satisfait**.

Ce qui reste incertain : sa **valeur** correspond-elle à la variable d'environnement
`EXPIRED_DELETIONS_SECRET` de la fonction edge ? Le coffre ne le dit pas, et
`supabase secrets list` non plus — il prouve qu'un nom existe, **jamais** que vous en connaissez la
valeur.

**Vous n'avez pas à le deviner.** L'étape 4 le prouve : si les deux valeurs diffèrent, la fonction
répond 401 et **rien n'est supprimé**. C'est un échec propre, pas une perte.

Ne rien faire ici, donc — sauf si l'étape 4 rend 401. Dans ce cas seulement, poser une valeur
neuve **des deux côtés**, dans une console dont l'historique est désactivé
(`Set-PSReadLineOption -HistorySaveStyle SaveNothing`) :

```
supabase secrets set EXPIRED_DELETIONS_SECRET=<nouvelle>
```

```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_expired_deletions_secret'),
  '<la même valeur>');
```

`update_secret`, pas un second `create_secret` : le nom existe déjà.

> Ne jamais écrire cette valeur dans une migration, un commit, un journal, un ticket ou
> l'historique du terminal.

### Étape 2 — appliquer les deux migrations

`20260909000001` puis `20260909000002`. Elles échouent si le secret manque — c'est voulu.

**Aucune suppression n'a lieu.** La tâche est replanifiée `active = false`, et l'auto-vérification
lève si elle ne l'est pas.

### Étape 3 — prouver la configuration, avant tout effet

```sql
SELECT * FROM public.check_cron_edge_health();
```

Attendu pour `process-expired-deletions` : `secret_state = 'coffre, lu a l execution'`,
`active = false`, `verdict = 'DESARMEE'`.

Et vérifier que le secret n'est plus dans la commande :

```sql
SELECT strpos(command, 'vault.decrypted_secrets') > 0        AS lit_le_coffre,
       command ~ '''x-expired-deletions-secret''\s*,\s*'''   AS porte_un_litteral
  FROM cron.job WHERE jobname = 'process-expired-deletions';
```

Attendu : `true`, `false`. **La commande elle-même n'est pas affichée** — elle ne doit jamais
l'être, par principe, même maintenant qu'elle ne porte plus de secret.

> Les apostrophes se comptent : `'''` ouvre le littéral **et** produit une apostrophe ; `''` en
> produit une ; `'''` en produit une puis ferme. La regex cherchée est donc
> `'x-expired-deletions-secret'\s*,\s*'` — soit « le nom de l'en-tête, suivi d'une virgule, suivie
> d'une valeur littérale ». C'est exactement la forme du défaut d'origine.

### Étape 4 — vérification contrôlée ⚠️ IRRÉVERSIBLE

> **Cette étape supprime définitivement 8 comptes.** Mesuré : un seul possède un objet de stockage
> (un avatar), **aucune vidéo de vérification** n'est concernée. Ne pas la lancer sans avoir validé
> tout ce qui précède.

```sql
-- L'editeur SQL de Supabase n'affiche PAS les RAISE NOTICE : un bloc DO
-- emettrait la requete sans jamais montrer son identifiant. Cette forme rend
-- l'identifiant dans la grille de resultats.
WITH cfg AS (
  SELECT
    -- `app.settings.supabase_url` n'est PAS pose sur ce projet — verifie le
    -- 9 sep 2026. Sans ce COALESCE, current_setting rend NULL, et net.http_post
    -- echoue sur la contrainte NOT NULL de http_request_queue.url. Meme famille
    -- que le defaut d origine : un reglage absent qui devient une valeur vide.
    COALESCE(
      current_setting('app.settings.supabase_url', TRUE),
      'https://qtihezzbuubnyvrjdkjd.supabase.co'
    ) || '/functions/v1/process-expired-deletions' AS url,
    (SELECT decrypted_secret
       FROM vault.decrypted_secrets
      WHERE name = 'cron_expired_deletions_secret') AS secret
),
garde AS (
  SELECT url, secret,
    CASE
      -- Sans ce garde, un nom de secret errone donnerait NULL, jsonb_build_object
      -- en ferait un en-tete null, et la fonction repondrait 401 — un echec
      -- comprehensible seulement apres coup.
      WHEN secret IS NULL OR secret = ''
        THEN 'ARRET — secret vault absent ou vide'
      WHEN url !~ '^https://[a-z0-9.-]+/functions/v1/process-expired-deletions$'
        THEN 'ARRET — URL cible invalide'
      ELSE 'ok'
    END AS verdict
  FROM cfg
)
SELECT
  verdict,
  url,
  -- CASE n evalue pas la branche non retenue : sur un ARRET, aucune requete
  -- n est emise et request_id reste NULL. Le garde est fail-closed, et visible.
  CASE WHEN verdict = 'ok' THEN net.http_post(
    url     := url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-expired-deletions-secret', secret),
    body    := '{}'::jsonb
  ) END AS request_id
FROM garde;
```

`verdict` doit valoir `ok` et `request_id` porter un nombre. Un `ARRET` avec `request_id` vide
signifie qu'aucune requête n'est partie — donc qu'aucun compte n'a été supprimé.

L'URL apparaît dans le résultat : ce n'est pas un secret. La valeur du secret, elle, reste dans une
colonne intermédiaire jamais projetée.

Une minute plus tard — **c'est la réponse qui compte, pas le `succeeded` de pg_cron**.

**Interroger par l'identifiant** rendu ci-dessus. Pas par `ORDER BY created DESC` :
`process-scheduled-emails` tourne toutes les 5 minutes et `send-scheduled-emails` toutes les 15,
soit **16 réponses par heure** qui noient la vôtre.

```sql
SELECT status_code, timed_out, error_msg, left(content, 200)
  FROM net._http_response
 WHERE id = 1234;   -- remplacer par le request_id rendu ci-dessus
```

Si l'identifiant a été perdu, la casse départage — chaque fonction a sa propre orthographe :

| corps de la réponse | fonction |
|---|---|
| `{"error":"unauthorized"}` **minuscule** | `process-expired-deletions` — c'est la vôtre |
| `{"error":"Unauthorized"}` **majuscule** | `send-scheduled-emails` ou `send-daily-horoscope` |
| `{"processed":0,"reason":"No pending emails"}` | `send-scheduled-emails`, qui fonctionne |

| réponse | signification | suite |
|---|---|---|
| **200** + `{"success":true,"deleted":8}` | l'authentification fonctionne | étape 5 |
| **401** `{"error":"unauthorized"}` | le secret du coffre ≠ la variable d'environnement. **Rien n'a été supprimé.** | étape 4 bis, **ne pas activer** |
| **500** | la fonction échoue pour une autre raison | lire `content`, **ne pas activer** |
| aucune ligne pour cet identifiant | la requête n'est pas partie | vérifier `pg_net` |

### Étape 4 bis — si le 401 tombe : réaligner les deux côtés

C'est le cas rencontré le 9 septembre 2026. Le coffre contenait bien
`cron_expired_deletions_secret`, mais pas la même valeur que la fonction edge — ce qu'aucune requête
ne pouvait dire à l'avance, et que seul cet appel prouve.

Générer une valeur neuve, dans une console dont l'historique est désactivé :

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing

$rng   = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$rng.Dispose()
$token = -join ($bytes | ForEach-Object { '{0:x2}' -f $_ })

# Garde-fou : une generation ratee doit s'ARRETER, pas produire une valeur
# inutilisable qui a l'air d'un secret.
if ($token.Length -ne 64 -or $token -eq ('0' * 64)) {
  throw "Generation ratee — NE PAS utiliser cette valeur."
}

$token   # a coller dans les deux commandes ci-dessous
Remove-Variable bytes
```

> **Ne pas utiliser `[System.Security.Cryptography.RandomNumberGenerator]::Fill()`** : cette méthode
> est .NET Core / .NET 5+. Windows PowerShell 5.1 tourne sur .NET Framework, où elle n'existe pas —
> l'appel échoue, `$bytes` reste **à zéro**, et la ligne suivante produit sagement
> `0000…0000` (64 zéros). Une clé qui a l'air d'une clé.
>
> C'est le défaut de toute cette enquête, appliqué à sa propre remédiation : une opération qui
> échoue et dont le résultat ressemble à un succès. D'où le `throw` ci-dessus.
>
> `RandomNumberGenerator::Create()` et `New-Object RNGCryptoServiceProvider` fonctionnent tous deux
> sur 5.1 — vérifié le 9 septembre 2026 sur cette machine. `openssl` n'y est pas installé.

Après avoir posé la valeur des deux côtés : `Remove-Variable token`.

**Côté fonction edge :**

```
supabase secrets set EXPIRED_DELETIONS_SECRET=<la valeur>
```

**Côté base**, la même :

```sql
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'cron_expired_deletions_secret'),
  '<la même valeur>');
```

`update_secret`, pas `create_secret` : le nom existe déjà.

Un secret posé par `supabase secrets set` s'applique aux **invocations suivantes** ; aucun
redéploiement n'est normalement nécessaire. Si le 401 persiste après quelques minutes, redéployer
`process-expired-deletions` lève le doute.

Puis reprendre l'étape 4. Elle est **idempotente et sans risque tant qu'elle rend 401** : aucune
suppression n'a lieu.

### Étape 4 ter — si le 401 persiste : comparer sans révéler

Deviner ce qui diffère est une perte de temps. Les deux valeurs se comparent par leur **empreinte
SHA-256 tronquée**, qui ne permet pas de remonter à la valeur.

**Côté base** — `supabase/tests/diagnose_deletion_secret_match.sql`. Il rend la longueur, la
présence d'espaces au bord, la date de dernière modification, et l'empreinte.

**Côté fonction edge** — la valeur que vous avez posée par `supabase secrets set` :

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing
$s   = Read-Host "valeur posee cote edge"
$sha = [System.Security.Cryptography.SHA256]::Create()
$fp  = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($s))) -replace '-','').ToLower().Substring(0,16)
$sha.Dispose()
Remove-Variable s
"empreinte cote edge : $fp"
```

Méthode vérifiée le 9 septembre 2026 : `SHA256::Create()` et `SHA256Managed` donnent le même
résultat sur PowerShell 5.1, identique à celui de Node et à
`encode(digest(x,'sha256'),'hex')` en SQL.

| lecture | conclusion |
|---|---|
| **empreintes identiques** | les valeurs correspondent → le problème est ailleurs : redéployer `process-expired-deletions`, le secret n'a pas été injecté |
| **empreintes différentes** | les valeurs diffèrent → reprendre l'étape 4 bis, en posant **la même chaîne** des deux côtés |
| **longueurs différentes de 1 ou 2** | espace ou saut de ligne parasite — un `\n` final suffit à faire échouer la comparaison stricte |
| **`updated_at` du coffre antérieur à votre `update_secret`** | la mise à jour n'a pas pris ; vérifier que `vault.update_secret` a bien trouvé l'`id` |

> `vault.update_secret` attend l'**identifiant**, pas le nom. Si
> `(SELECT id FROM vault.secrets WHERE name = '…')` rend NULL, l'appel ne met rien à jour et
> n'échoue pas forcément. Le contrôle 6 du diagnostic le révèle.

### Étape 5 — les sept preuves

| # | preuve | requête |
|---|---|---|
| 1 | l'en-tête n'est plus vide | étape 3, `porte_un_litteral = false` |
| 2 | le secret n'est pas dans la commande | étape 3, `lit_le_coffre = true` |
| 3 | la fonction répond 2xx | étape 4, `status_code = 200` |
| 4 | les 8 comptes sont traités | `SELECT * FROM public.check_cron_edge_health();` → `backlog = 0` |
| 5 | le nouvel orphelin est identifié, **sans son chemin** | `diagnose_media_ownership.sql` → `avatars` passe de 3 à **4** orphelins |
| 6 | aucun média de vérification laissé | même requête → `verifications` reste à **1** orphelin, inchangé |
| 7 | les passages suivants sont idempotents | relancer l'appel de l'étape 4 → `{"deleted":0}` et 200 |

### Étape 6 — réarmer

**Seulement si les sept preuves sont vertes :**

```sql
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'process-expired-deletions'),
  active := true
);
```

Puis re-vérifier : `check_cron_edge_health()` doit rendre `active = true`, `verdict = 'OK'`.

### Étape 7 — surveiller

48 heures : `check_cron_edge_health()` doit rester `OK`. Le passage de 03:00 UTC doit produire
`{"deleted":0}`.

## 6. Retour arrière

| moment | ce qui est réversible | commande |
|---|---|---|
| après l'étape 2 | **tout** — rien n'a été supprimé | réappliquer `20260419000005` restaure la commande d'origine (celle qui ne supprime rien) |
| après l'étape 4 | **rien** — les 8 suppressions sont définitives | on ne peut qu'empêcher les suivantes (ci-dessous) |
| après l'étape 6 | idem | désarmer à nouveau |

Désarmer :

```sql
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'process-expired-deletions'),
  active := false
);
```

Retirer la fonction de santé (JUNO-30), si besoin :

```sql
DROP FUNCTION IF EXISTS public.check_cron_edge_health();
```

Aucune donnée supprimée ne revient. C'est pourquoi l'étape 4 est la seule qui demande une décision.

## 7. Ce qui reste ouvert après ce runbook

- **JUNO-09 n'est PAS fermé.** L'avatar orphelin créé à l'étape 4 s'ajoute aux 4 orphelins déjà
  mesurés et doit être comptabilisé dans le rattrapage historique.
- **JUNO-30** — la supervision. `check_cron_edge_health()` rend le défaut visible ; elle ne
  l'alerte pas. Le canal (courriel, Slack, tableau de bord) est une décision d'exploitation.
- **Les trois autres tâches edge** planifiées par `20260419000005`. Si
  `diagnose_cron_edge_supervision.sql` les montre avec un `secret_state = 'VIDE'`,
  `daily-horoscope-push` et `publish-scheduled-posts` sont dans le même état depuis avril — et
  `publish-scheduled-posts` tourne toutes les 5 minutes.
