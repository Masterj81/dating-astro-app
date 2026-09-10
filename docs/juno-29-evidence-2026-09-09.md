# JUNO-29 / JUNO-30 — preuves du diagnostic, avant toute écriture

**9 septembre 2026.** Instantané figé **avant** toute modification de la base. Toutes les mesures
proviennent de requêtes **strictement en lecture** (zéro `INSERT`/`UPDATE`/`DELETE`, vérifié par
inspection). Aucune valeur de secret n'apparaît ici : uniquement « vide », « posé », ou une
longueur.

---

## 1. `diagnose_deletion_cron.sql`

| n | objet | valeur |
|---|---|---|
| 0 | VERDICT | **TACHE PRESENTE MAIS INEFFICACE** |
| 1 | tâche planifiée | `0 3 * * *` **[active]** |
| 2 | vise la bonne fonction | oui |
| 3 | **secret non vide ?** | **NON — secret VIDE** |
| 4 | `pg_net` | oui |
| 5 | exécutions enregistrées | **142 au total, dont 142 réussies** |
| 6 | dernière exécution | 2026-09-09 03:00 UTC |
| 7 | statut de la dernière | `succeeded — 1 row` |
| 8 | réponses HTTP | `200 ×72  ·  401 ×25` |
| 9 | comptes expirés non supprimés | **8** |
| 10 | retard de la plus ancienne | **114 jours** |
| 11 | répartition des retards | `1 à 7 j = 1  ·  plus de 30 j = 7` |
| 12 | déjà masqués (`is_active = false`) | **8 sur 8** |

## 2. `diagnose_expired_deletions_impact.sql`

| n | objet | valeur |
|---|---|---|
| 0 | DÉCISION D'ORDRE | **ARBITRAGE REQUIS — 1 objet deviendrait orphelin** |
| 1 | comptes expirés concernés | 8 |
| 2 | comptes possédant au moins un objet | **1 sur 8** |
| 3 | objets concernés, par bucket | **`avatars = 1`** |
| 4 | dont médias de vérification | **0** |
| 5 | coffre Supabase | **disponible** |
| 6 | `app.settings.expired_deletions_secret` | **VIDE ou absent** |

## 3. `diagnose_media_ownership.sql` — état de référence

| | `avatars` | `voice-intros` | `verifications` |
|---|---|---|---|
| objets | 89 | 0 | 1 |
| classe `uuid` (propriété prouvable) | 21 | — | 1 |
| classe `prefixe-non-uuid` | 6 | — | 0 |
| classe `racine` | 62 | — | 0 |
| **orphelins** | **3** | — | **1** |

369 comptes `auth.users`. Plus ancien orphelin : **2026-02-01**.
`owner` renseigné sur **22/90**, **0 contradiction** avec le premier segment.

**C'est l'état AVANT.** Après la vérification contrôlée de JUNO-29, `avatars` doit passer à
**4 orphelins** — l'avatar du seul compte concerné — et rien d'autre ne doit bouger.

---

## 4. Décision prise, et par qui

> « Décision : réparer JUNO-29 maintenant, avant JUNO-09. Le retard d'effacement de huit comptes
> l'emporte sur la création contrôlée d'un seul nouvel avatar orphelin. Cet objet devra être
> comptabilisé dans le rattrapage historique de JUNO-09. Ne pas présenter JUNO-09 comme fermé. »
> — utilisateur, 9 septembre 2026

## 5. Effets destructifs attendus, chiffrés

| effet | volume | réversible |
|---|---|---|
| suppression définitive de comptes `auth.users` | **8** | **non** |
| lignes `profiles` supprimées par cascade | 8 | non |
| données liées supprimées par cascade (messages, conversations, abonnements…) | selon les comptes | non |
| objets de stockage devenant orphelins | **1 avatar** | l'objet subsiste, sa propriété devient non rattachable |
| vidéos de vérification concernées | **0** | — |

**Aucun de ces effets ne se produit à l'application des migrations.** La tâche est replanifiée
**inactive** ; la suppression n'a lieu qu'au déclenchement manuel de la vérification contrôlée.

## 5 bis. `diagnose_cron_edge_supervision.sql` — mesuré ensuite, et il élargit le constat

### Les quatre tâches réellement planifiées

| tâche cron | cible | fréquence | état du secret | verdict |
|---|---|---|---|---|
| `daily-horoscope-push` | send-daily-horoscope | `0 12 * * *` | **VIDE** | **401 — cassée** |
| `process-expired-deletions` | process-expired-deletions | `0 3 * * *` | **VIDE** | **401 — JUNO-29** |
| `process-scheduled-emails` | send-scheduled-emails | `*/5 * * * *` | aucun en-tête | **200 — fonctionne** |
| `send-scheduled-emails` | send-scheduled-emails | `*/15 * * * *` | **VIDE** | **401 — cassée** |

**`publish-scheduled-posts` n'est planifiée nulle part**, alors que `20260413000003` et
`20260419000005` la créent toutes deux. La publication marketing programmée n'a **aucun
publieur**. Le retard métier est à 0 aujourd'hui, donc rien n'est bloqué — mais un post programmé
par `marketingagent` ne partirait jamais.

### Attribution des réponses HTTP — l'arithmétique se recoupe

Fenêtre réelle de `net._http_response` : **08:15 → 14:10**, soit 5 h 55 (pg_net purge le reste).
97 réponses.

| tâche | passages attendus sur la fenêtre | code |
|---|---|---|
| `process-scheduled-emails` (*/5) | ~72 | **200 × 72** |
| `send-scheduled-emails` (*/15) | ~24 | 401 |
| `daily-horoscope-push` (12:00 UTC) | 1 | 401 |
| `process-expired-deletions` (03:00 UTC) | 0 — hors fenêtre | — |
| | **97** | **200×72 + 401×25** |

72 + 25 = 97, exactement le total mesuré. pg_net ne conserve pas l'URL dans `_http_response`, donc
cette attribution est une **inférence** — mais elle est arithmétiquement exacte et cohérente avec
l'état des secrets.

### Pourquoi « aucun en-tête » réussit là où « en-tête vide » échoue

`send-scheduled-emails/index.ts:11-24` accepte **deux** preuves : un `Authorization` porteur de la
clé de service, **ou** un en-tête secret correspondant.

```ts
const isServiceRole = serviceRoleKey.length > 0 && bearerToken === serviceRoleKey;
const isValidSecret = SECRET.length > 0 && secretHeader === SECRET;
if (!isServiceRole && !isValidSecret) → 401
```

`process-scheduled-emails` passe un `Authorization` valide : elle est authentifiée comme
service_role, sans avoir besoin du secret. Les trois autres passent un en-tête vide **et** un
`Authorization` vide : aucune des deux preuves ne tient.

### La tâche qui marche n'est dans aucune migration

`process-scheduled-emails` **n'est créée par aucun fichier de `supabase/migrations/`** — elle a été
planifiée à la main. `send-scheduled-emails`, celle que le dépôt décrit
(`20260824000001_restore_d1_return_loop.sql:44`), est cassée.

Le courrier de cycle de vie part donc grâce à une tâche que le dépôt ignore, pendant que celle qu'il
documente répond 401 quatre fois par heure. **Rejouer les migrations pour « remettre d'aplomb »
garderait la cassée et pourrait retirer celle qui fonctionne.** C'est JUNO-15 dans sa forme la plus
piégeuse : la dérive est du bon côté.

### Un troisième réglage absent, découvert en exécutant la procédure

Le premier essai de l'étape 4 a échoué ainsi :

```
ERROR: 23502: null value in column "url" of relation "http_request_queue"
       violates not-null constraint
```

**`app.settings.supabase_url` n'est pas posé non plus.** L'extrait du runbook écrivait
`url := current_setting('app.settings.supabase_url', TRUE)` sans repli — `NULL`, et `net.http_post`
a buté sur la contrainte `NOT NULL`.

**Aucune requête n'est partie, aucun compte n'a été supprimé.** L'échec était bruyant, ce qui est
précisément la différence avec le défaut d'origine.

Trois réglages `app.settings.*` sont donc absents de ce projet : `expired_deletions_secret`,
`supabase_service_role_key`, et `supabase_url`. Les onze migrations qui construisent une URL
retombent toutes sur le littéral `https://qtihezzbuubnyvrjdkjd.supabase.co` — **le repli est le
chemin réel**, pas une précaution théorique.

Cela éclaire la distinction qui compte : un `COALESCE` n'est pas fautif en soi. Celui de l'URL
retombe sur une valeur **utilisable** ; celui du secret retombait sur la **chaîne vide**. La faute
n'est pas le mot-clé, c'est ce vers quoi il retombe.

L'extrait du runbook est corrigé : il résout l'URL avec le même repli, **et** lève si l'URL ou le
secret sont absents ou malformés, au lieu de laisser passer un `NULL`.

### La vérification contrôlée a rendu 401 — et c'est une bonne nouvelle

Premier appel réel, 9 septembre 2026 : **`401 {"error":"unauthorized"}`**.

L'attribution ne fait aucun doute : `process-expired-deletions/index.ts:52` répond
`{ error: "unauthorized" }` en **minuscule**, tandis que `send-scheduled-emails/index.ts:20` et
`send-daily-horoscope/index.ts:126` répondent `"Unauthorized"` avec une **majuscule**. Le corps
observé est minuscule.

**Aucun compte n'a été supprimé.** C'est exactement le comportement recherché : le secret du coffre
ne correspond pas à `EXPIRED_DELETIONS_SECRET` de la fonction edge, et le refus est propre.

Deux enseignements :

1. **Le coffre contenait le bon NOM, pas la bonne VALEUR.** Aucune requête ne pouvait le dire à
   l'avance — ni `supabase secrets list`, ni `vault.decrypted_secrets`. Seul un appel réel le
   prouve. C'est pourquoi l'étape 4 précède l'activation, et non l'inverse.
2. **`ORDER BY created DESC LIMIT 3` était une mauvaise méthode de lecture.**
   `process-scheduled-emails` (*/5) et `send-scheduled-emails` (*/15) produisent 16 réponses par
   heure : la réponse cherchée s'y noie. Le runbook interroge désormais
   `net._http_response` **par l'identifiant** rendu par `net.http_post`, et documente la casse comme
   départage de secours.

### Les secrets sont déjà dans le coffre

`cron_expired_deletions_secret`, `cron_horoscope_secret`, `cron_scheduled_posts_secret` — les trois
noms que `20260419000005` attend **existent**. Le défaut n'est donc pas qu'ils manquent : c'est que
`_load_cron_secret` a été appelé **au moment de la planification**, avant qu'ils n'existent ou sans
pouvoir les lire, et que son `COALESCE(…, '')` a figé une chaîne vide dans la commande.

Conséquence pratique : le prérequis de `20260909000001` est **déjà satisfait**. Il reste à vérifier
que la valeur du coffre correspond à la variable d'environnement de la fonction edge — ce que
l'étape 4 du runbook prouve, et elle échoue proprement en 401 sans rien supprimer si ce n'est pas le
cas.

---

## 6. Ce que ces preuves ne disent pas

- `net._http_response` est **purgé par pg_net au bout de quelques heures**. La ligne « sur 14 jours »
  du §1 est donc trompeuse : c'est une fenêtre courte. `diagnose_cron_edge_supervision.sql` mesure
  la fenêtre réelle, et c'est l'une des raisons pour lesquelles le retard **métier** est un signal
  plus fiable que les codes HTTP.
- Le rattachement d'une réponse HTTP à la tâche qui l'a émise n'est pas possible : pg_net ne
  conserve pas l'URL dans `_http_response`. Les 401 observés ne sont donc **pas** attribués avec
  certitude à `process-expired-deletions`. Ce qui est certain, et suffit : sa commande porte un
  en-tête vide, et la fonction refuse un en-tête vide par un 401.
- Trois autres tâches cron appellent une fonction edge et ont été planifiées par le même
  `20260419000005`, avec le même chargeur `_load_cron_secret` fail-open.
  `diagnose_cron_edge_supervision.sql` dit lesquelles sont dans le même état. **Non mesuré au moment
  où ce document est figé.**

---

## 7. État APRÈS la vérification contrôlée — 9 septembre 2026

### La suite des événements, telle qu'elle s'est réellement déroulée

| heure UTC | événement | effet |
|---|---|---|
| 14:56 | première mise à jour du coffre — **16 caractères** | valeur ne correspondant pas à l'edge |
| — | premier appel réel | **401**, aucune suppression |
| 17:21 | coffre réaligné : **64 caractères**, empreintes comparées identiques des deux côtés | — |
| **17:23:10** | réponse **53395** : `200 {"success":true,"deleted":8,"total_candidates":8,"truncated":false}` | **8 comptes supprimés** |
| 18:18:51 | réponse 53412 : `200 {"deleted":0}` | aucun |
| 18:19:33 | réponse 53413 : `200 {"deleted":0}` | aucun |

`total_candidates: 8` et `truncated: false` : la fonction a vu les huit et n'en a écarté aucun.
`failures: []` : aucune suppression partielle.

### Les sept preuves

| # | preuve | mesure |
|---|---|---|
| 1 | l'en-tête n'est plus vide | `secret_state = 'coffre, lu a l execution'` |
| 2 | le secret n'est pas dans la commande | même mesure |
| 3 | la fonction répond 2xx | réponse 53395 = **200** |
| 4 | les 8 comptes sont traités | `check_cron_edge_health()` → `backlog = 0` |
| 5 | le nouvel orphelin est identifié, sans son chemin | `avatars` : **3 → 4** orphelins |
| 6 | aucun média de vérification laissé | `verifications` : **1**, inchangé |
| 7 | les passages suivants sont idempotents | 53412 et 53413 → `deleted: 0`, **200** |

### L'effet mesuré, avant / après

| | avant | après |
|---|---|---|
| comptes `auth.users` | 369 | **362** (369 − 8 + 1 inscription) |
| lignes `profiles` | — | **362**, en parité avec `auth.users` |
| comptes expirés non traités | **8** | **0** |
| retard de la plus ancienne | **114 jours** | aucun |
| objets de stockage, total | 90 | **90** — rien n'a été supprimé du stockage |
| orphelins `avatars` | 3 | **4** |
| orphelins `verifications` | 1 | **1** |

La suppression de compte n'efface pas le média : c'est précisément JUNO-09, et le nouvel orphelin
en est la démonstration en conditions réelles.

### Ce que cet épisode a appris, et qui n'était dans aucun plan

**L'éditeur SQL de Supabase n'affiche pas les `RAISE NOTICE`.** L'étape 4 émettait sa requête et
annonçait son identifiant par un `NOTICE` — invisible. L'exploitant a donc cru le premier appel sans
effet, alors qu'il venait de supprimer huit comptes ; il a ensuite buté sur la relecture, faute
d'identifiant, et n'a découvert la suppression qu'une heure plus tard par le compte métier.

Aucune donnée n'a été perdue au-delà de ce qui était décidé, et l'idempotence a absorbé les deux
appels suivants. Mais la règle est générale : **une opération irréversible doit rendre sa preuve
dans la grille de résultats, jamais par un canal que l'outil peut taire.** L'étape 4 du runbook a
été réécrite en `WITH … SELECT` : elle projette `verdict`, `url` et `request_id` en colonnes, et le
garde fail-closed y est visible — un `ARRET` laisse `request_id` vide, `CASE` n'évaluant pas la
branche non retenue.

### Ce qui n'est pas fermé

- **JUNO-09** reste ouvert. Le compte d'orphelins est désormais de **5** : 4 dans `avatars`,
  1 dans `verifications`. Le plus ancien remonte au **1er février 2026**.
- **JUNO-30** reste ouvert, et la fonction de santé l'a confirmé en production :
  `daily-horoscope-push` et `send-scheduled-emails` portent toujours un secret **VIDE**, et
  `publish-scheduled-posts` n'est planifiée nulle part.
- Le compteur non-2xx de `check_cron_edge_health()` agrège **toutes les tâches**, faute de pouvoir
  attribuer une réponse à son émetteur — pg_net ne conserve pas l'URL. Il affiche donc
  `A VERIFIER : 28 reponse(s) non-2xx` sur la ligne de la seule tâche qui fonctionne. Le compte est
  juste, son emplacement est trompeur : à corriger avec JUNO-30.
