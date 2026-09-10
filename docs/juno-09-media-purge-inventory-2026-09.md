# JUNO-09 — Phase A : inventaire et architecture proposée

**9 septembre 2026.** Phase A uniquement : aucune modification fonctionnelle, aucune suppression,
aucun objet de production touché. Ce document établit ce qui est **observé** dans le dépôt, ce qui
en est **inféré**, et ce qui reste à **prouver contre la base** avant d'écrire une ligne de purge.

---

## Résumé

Trois parcours de suppression de compte existent. **Aucun des trois ne touche au stockage.** Un
compte supprimé laisse derrière lui ses photos de profil, son introduction vocale et — c'est le
point le plus lourd — sa **vidéo de vérification**, c'est-à-dire l'enregistrement de son visage.

Pire : la suppression détruit l'information qui permettrait de retrouver ces objets par la base.
`profiles.id REFERENCES auth.users(id) ON DELETE CASCADE`
([`00000000000000_full_schema.sql:113`](../supabase/migrations/00000000000000_full_schema.sql#L113)),
donc l'appel à `auth.admin.deleteUser()` efface la ligne `profiles` et avec elle `photos[]`,
`voice_intro_url` et `verification_video_url`.

La bonne nouvelle, et elle conditionne toute l'architecture : **la propriété d'un objet ne dépend
pas de la base.** Elle est inscrite dans son chemin, et une politique RLS l'impose depuis le schéma
initial. Un compte supprimé reste retrouvable par son UUID seul.

Et un courriel ment aujourd'hui aux lecteurs. `confirm-deletion` leur écrit :
*« All associated data (profile, matches, messages) has been removed »*
([`route.ts:121`](../apps/web/src/app/api/account/confirm-deletion/route.ts#L121)).
Les médias, eux, restent.

---

## 1. Les trois parcours de suppression

### 1.1 Vue d'ensemble

```
PARCOURS A — mobile, avec fenêtre de grâce
  app/settings/index.tsx:115  supabase.functions.invoke('delete-account')
        │  JWT + ré-authentification < 5 min  (delete-account/index.ts:104-127)
        ▼
  delete-account          UPDATE profiles SET deletion_requested_at,
                                              deletion_scheduled_for = +7j,
                                              is_active = false        ← AUCUN stockage
        │  courriel avec lien d'annulation signé (DELETION_TOKEN_SECRET)
        ▼
  … 7 jours …                     ↺ cancel-account-deletion remet les colonnes à NULL
        ▼
  pg_cron 03:00 UTC  →  process-expired-deletions
                          SELECT profiles WHERE deletion_scheduled_for < now() LIMIT 200
                          auth.admin.deleteUser(id)          ← index.ts:84, AUCUN stockage
                          └─ CASCADE : la ligne profiles disparaît

PARCOURS B — web, immédiat
  AccountDeletionFlow.tsx:67   POST /api/account/request-deletion   (code à 6 octets, 15 min)
  AccountDeletionFlow.tsx:100  POST /api/account/confirm-deletion
        │  JWT + le code, comparaison en temps constant, 5 tentatives
        ▼
                          auth.admin.deleteUser(id)          ← route.ts:107, AUCUN stockage
                          └─ CASCADE
        │
        ▼  courriel : « All associated data … has been removed »   ← FAUX pour les médias

PARCOURS C — annulation
  cancel-account-deletion   remet deletion_* à NULL, is_active = true
                            (n'est pas une suppression ; borne la fenêtre du parcours A)
```

### 1.2 Comparaison

| | **A — mobile** | **B — web** | **C — annulation** |
|---|---|---|---|
| Entrée | `app/settings/index.tsx:115` | `AccountDeletionFlow.tsx:67,100` | lien dans le courriel |
| Exécutant | `delete-account` puis `process-expired-deletions` | `api/account/confirm-deletion` | `cancel-account-deletion` |
| Runtime | Deno (edge) | Node (Next.js route) | Deno (edge) |
| Auth | JWT **+ ré-auth < 5 min** | JWT + code par courriel | jeton HMAC signé |
| Délai de grâce | **7 jours** | **aucun** | — |
| Tables modifiées | `profiles` puis cascade complète | `deletion_requests` puis cascade | `profiles` |
| `auth.users` supprimé | par le cron, J+7 | **immédiatement** | jamais |
| Stockage purgé | **non** | **non** | — |
| Reprise possible aujourd'hui | **non** — l'UUID n'est nulle part après coup | **non** | — |
| Sur timeout partiel | le cron réessaiera le compte au passage suivant *si* `deleteUser` a échoué ; s'il a réussi, tout est perdu | la route rend 500, le compte est déjà supprimé | — |

**Divergence notée, hors périmètre JUNO-09** : le parcours B supprime définitivement, sans délai de
grâce ni ré-authentification récente — c'est JUNO-19. La correction de JUNO-09 ne doit pas la
masquer, et le parcours B reste donc traité comme un chemin de suppression à part entière.

### 1.3 Le moment critique

`process-expired-deletions/index.ts:84` et `confirm-deletion/route.ts:107` appellent tous deux
`auth.admin.deleteUser()`. **Après cette ligne, la ligne `profiles` n'existe plus** (cascade), donc :

- `photos[]`, `images[]`, `image_url` — perdus
- `voice_intro_url` — perdu
- `verification_video_url` — perdu

Il ne reste que l'UUID, et seulement dans la mémoire du processus en cours. Si le processus meurt
là, plus rien au monde ne relie ces objets à un compte. **C'est ce fait, et lui seul, qui décide de
l'ordre des opérations au §7.**

---

## 2. Inventaire Storage

### 2.1 Buckets

| bucket | visibilité | créé par | contenu | concerné par JUNO-09 |
|---|---|---|---|---|
| `avatars` | **public** | `00000000000000_full_schema.sql` | photos de profil | **oui** |
| `voice-intros` | **public** | `20260227000001_new_features.sql` | introduction vocale | **oui** |
| `verifications` | **privé** (`20260419000001` fin) | `20260227000001_new_features.sql` | vidéo de vérification | **oui — le plus sensible** |
| `marketing-images` | public | `20260908000001` (vague 2) | contenu promotionnel | non — aucun utilisateur |
| `tarot` | ? | aucune migration | illustrations de cartes | non — contenu applicatif |

`tarot` est cité par `20260416000001_drop_public_bucket_listing_policies.sql:7` mais **aucune
migration ne le crée** — même dérive que `marketing-images` avant la vague 2 (JUNO-15). Hors
périmètre ici : il ne contient aucune donnée d'utilisateur. À déclarer un jour.

### 2.2 Politiques RLS

`20260419000001_harden_user_upload_buckets.sql` recrée, pour les trois buckets utilisateurs, le même
jeu : SELECT (public pour `avatars`/`voice-intros`, propriétaire seul pour `verifications`), et
INSERT / UPDATE / DELETE conditionnés à

```sql
(storage.foldername(name))[1] = auth.uid()::text
```

**Ce prédicat n'est pas une nouveauté d'avril.** Il est présent dès
[`full_schema.sql:483`](../supabase/migrations/00000000000000_full_schema.sql#L483) pour `avatars`,
et dès `20260227000001` pour les deux autres. **Il n'existe donc aucune fenêtre historique** pendant
laquelle un client aurait pu écrire hors de son propre dossier. C'est le fait qui rend la propriété
prouvable rétroactivement.

`service_role` contourne RLS. C'est la seule brèche, et elle est connue : voir §2.4.

### 2.3 Conventions de chemins observées

| bucket | motif | écrit par |
|---|---|---|
| `avatars` | `{uuid}/avatar-{ts}.{ext}` | [`app/(tabs)/profile.tsx:145-147`](../apps/mobile/app/(tabs)/profile.tsx#L145) |
| `avatars` | `{uuid}/photo_{index}_{ts}.{ext}` | [`app/profile/edit.tsx:202-206`](../apps/mobile/app/profile/edit.tsx#L202) |
| `avatars` | `{uuid}/avatar-web-{ts}.{ext}` | [`AccountProfileWorkspace.tsx:544-548`](../apps/web/src/components/AccountProfileWorkspace.tsx#L544) |
| `voice-intros` | `{uuid}/voice_intro_{ts}.{ext}` | [`voiceIntroService.ts:112-114`](../apps/mobile/services/voiceIntroService.ts#L112) |
| `verifications` | `{uuid}/verification_{ts}.{ext}` | [`verificationService.ts:72-77`](../apps/mobile/services/verificationService.ts#L72) |

**Tous plats** : exactement deux segments, `{uuid}/{fichier}`. La purge ne doit pas en dépendre —
voir le risque R4.

### 2.4 L'exception connue : `marketing/` dans `avatars`

Jusqu'à la vague 2, `marketingagent/cloud-scheduler.ts` téléversait ses visuels dans
`avatars` sous `marketing/{ts}-{nom}`, avec la clé `service_role` — donc **sans passer par RLS**.
La vague 2 a déplacé les nouveaux vers `marketing-images`, mais **les objets historiques restent
dans `avatars`**.

Conséquence directe pour JUNO-09 : dans `avatars`, tout objet dont le premier segment n'est pas un
UUID est **de propriété non prouvable**. Il ne doit jamais être purgé, et le détecteur d'orphelins
doit le classer explicitement plutôt que de le compter comme orphelin.

### 2.5 Variantes, miniatures, temporaires

**Aucune.** Recherche effectuée sur `transform:`, `resize`, `width/height` associés à
`getPublicUrl` : aucune transformation d'image Supabase n'est utilisée. Les clients affichent
l'objet d'origine (`app/profile/[id].tsx:162` fait un `resizeMode` côté rendu, pas côté stockage).
Aucun préfixe temporaire n'a été trouvé. **Le périmètre est donc l'objet d'origine, un par
téléversement.**

### 2.6 Le seul code de suppression existant

[`voiceIntroService.ts:170-186`](../apps/mobile/services/voiceIntroService.ts#L170) —
`deleteVoiceIntro()` reconstruit le chemin ainsi :

```ts
const url = new URL(profile.voice_intro_url);
const pathParts = url.pathname.split('/');
const filePath = pathParts.slice(-2).join('/');   // userId/filename
```

`slice(-2)` — les deux derniers segments. Cela fonctionne pour la convention plate actuelle et
**casse en silence** pour tout chemin plus profond : il produirait `sousdossier/fichier`, un chemin
qui n'existe pas, et `remove()` réussirait sans rien supprimer. À ne pas reproduire dans la purge.

---

## 3. Règle de propriété — formelle

Un objet **appartient** à l'utilisateur `U` si et seulement si, dans l'ordre :

| # | critère | disponible ici ? |
|---|---|---|
| 1 | relation explicite en base avec `user_id` | **non** — `storage.objects` n'a pas de FK vers `profiles`, et les colonnes de `profiles` disparaissent par cascade |
| 2 | métadonnée serveur fiable — `storage.objects.owner` | **à mesurer** — contrôles 3, 4 et 5 du diagnostic |
| 3 | **chemin canonique** : `(storage.foldername(name))[1]` est un UUID **complet et bien formé**, égal à `U` | **oui** — imposé par RLS depuis le schéma initial (§2.2) |
| 4 | compatibilité héritée documentée | **sans objet** — la règle RLS précède tout objet utilisateur |

### Règles de refus, sans exception

- **Jamais** de correspondance partielle de chaîne. Le segment doit valider
  `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` **en entier**, puis être **égal**
  à l'UUID cible. `LIKE '%' || uid || '%'` est interdit : il attraperait
  `autre-uuid/photo-<uid>.jpg`.
- **Jamais** de suppression par préfixe non validé. L'API Storage n'offre d'ailleurs pas de
  « supprimer un préfixe » : `remove()` prend une liste de chemins explicites. La purge **liste**,
  **valide chaque nom un par un**, puis **supprime**.
- Si le critère 2 est disponible **et** contredit le critère 3, la propriété est **ambiguë** :
  échouer fermé, ne rien supprimer, signaler. Le contrôle 5 du diagnostic mesure si ce cas existe.
- Un objet hors convention (§2.4) n'a **pas** de propriétaire prouvable. Ni purgé, ni compté
  orphelin : classé à part.

### Collisions envisagées, et pourquoi elles ne mordent pas

| scénario | verdict |
|---|---|
| un fichier nommé d'après l'UUID d'un autre, dans son propre dossier | le segment **1** décide, jamais le nom du fichier |
| un dossier dont le nom *contient* un UUID (`x-<uuid>`) | rejeté : le segment entier doit valider le motif |
| deux comptes successifs avec le même UUID | impossible — `gen_random_uuid()`, et Postgres n'en réémet pas |
| un UUID valide mais d'un compte encore vivant | la purge cible **un** UUID passé en argument serveur, jamais une liste fournie par le client |

---

## 4. Matrice de couverture

| Type de média | Bucket | Convention de chemin | Référence DB | Propriété prouvée par | Créateur | Parcours couvert aujourd'hui |
|---|---|---|---|---|---|---|
| Photo de profil (mobile, avatar) | `avatars` | `{uuid}/avatar-{ts}.{ext}` | `profiles.photos[]`, `image_url` | chemin, segment 1 | `app/(tabs)/profile.tsx:147` | **aucun** |
| Photo de profil (mobile, galerie) | `avatars` | `{uuid}/photo_{i}_{ts}.{ext}` | `profiles.photos[]` | chemin, segment 1 | `app/profile/edit.tsx:206` | **aucun** |
| Photo de profil (web) | `avatars` | `{uuid}/avatar-web-{ts}.{ext}` | `profiles.photos[]` | chemin, segment 1 | `AccountProfileWorkspace.tsx:548` | **aucun** |
| Introduction vocale | `voice-intros` | `{uuid}/voice_intro_{ts}.{ext}` | `profiles.voice_intro_url` (URL publique) | chemin, segment 1 | `voiceIntroService.ts:114` | **aucun** |
| Vidéo de vérification | `verifications` | `{uuid}/verification_{ts}.{ext}` | `profiles.verification_video_url` (**URL signée 1 an**, ou chemin nu en repli) | chemin, segment 1 | `verificationService.ts:77` | **aucun** |
| Visuel marketing (historique) | `avatars` | `marketing/{ts}-{nom}` | `marketing_posts.image_url` | **non prouvable** | ancien `cloud-scheduler.ts`, `service_role` | sans objet — pas un média d'utilisateur |
| Visuel marketing (actuel) | `marketing-images` | `marketing/{année}/{uuid}.{ext}` | `marketing_posts.image_url` | non applicable | `marketing-agent` | sans objet |

**Cinq catégories d'objets appartenant à un utilisateur. Zéro couverte.**

---

## 5. Ce que le dépôt ne peut pas prouver

Tout ce qui précède est lu dans le code et les migrations. Trois questions n'ont de réponse que
contre la base, et elles conditionnent l'implémentation :

1. **`storage.objects.owner` est-il renseigné, et cohérent avec le chemin ?** S'il l'est à 100 % et
   ne contredit jamais le segment 1, il devient un second témoin gratuit. S'il est partiel, le
   chemin reste seul juge.
2. **Combien d'orphelins existent aujourd'hui**, par bucket, et depuis quand ? C'est la mesure du
   constat, et le dimensionnement du rattrapage historique.
3. **Combien d'objets hors convention** dans `avatars` (le `marketing/` historique) ? Ils fixent la
   taille de la catégorie « propriété non prouvable ».

→ `supabase/tests/diagnose_media_ownership.sql`, **une seule requête, strictement en lecture**
(zéro `DELETE`/`UPDATE`/`INSERT`, vérifié), et **aucun chemin ni nom de fichier dans la sortie** —
uniquement des compteurs et des classifications.

---

## 5 bis. Résultats mesurés — 9 septembre 2026

### Une erreur dans la première version de ce diagnostic

La première exécution a rendu, pour `avatars` : 89 objets au total, 21 de premier segment UUID,
6 hors convention. **21 + 6 = 27.** Soixante-deux objets n'étaient dans aucun compteur.

`storage.foldername('fichier.jpg')` rend un **tableau vide** pour un objet posé à la racine d'un
bucket. `[1]` vaut donc `NULL`, `seg1_is_uuid` vaut `NULL`, et `count(*) FILTER (WHERE NOT
seg1_is_uuid)` ne compte que les `TRUE` — jamais les `NULL`. Les deux filtres se sont donc tus
ensemble, en silence.

C'est la même famille d'erreur que les trois passes à vide de la vague 1 (`bool_or` sur zéro ligne)
et que `has_function_privilege('public', …)` de la vague 2. La correction : une colonne `classe`
à trois valeurs **exhaustives**, et un **contrôle 0 qui vérifie que leur somme égale le total**. Un
diagnostic qui ne s'auto-vérifie pas est un diagnostic qui peut mentir.

### Ce que la base contient réellement

| | `avatars` | `voice-intros` | `verifications` |
|---|---|---|---|
| objets | **89** | **0** | **1** |
| classe `uuid` — propriété prouvable | 21 | — | 1 |
| classe `prefixe-non-uuid` | 6 | — | 0 |
| classe `racine` | **62** | — | 0 |
| **orphelins** (classe uuid, compte disparu) | **4** | — | **1** |

362 comptes `auth.users`. Plus ancien orphelin : **1ᵉʳ février 2026** — sept mois.

> **Mesure corrigée le 10 septembre 2026.** La phase A avait relevé **3** orphelins dans `avatars`
> et 369 comptes. La fermeture de JUNO-29 le 9 septembre a supprimé les huit comptes en retard
> d'effacement, dont **un** possédait un objet de stockage : `avatars` est donc passé à **4**
> orphelins, et `auth.users` à 362 (369 − 8 + 1 inscription vérifiée).
>
> Cet objet était prévu et arbitré : « Le retard d'effacement de huit comptes l'emporte sur la
> création contrôlée d'un seul nouvel avatar orphelin. Cet objet devra être comptabilisé dans le
> rattrapage historique de JUNO-09. » `verifications` reste à **1**, inchangé.
>
> **Total : 5 orphelins**, dont une vidéo de vérification.

### Les trois classes, et ce qu'on en fait

**21 + 1 objets de classe `uuid`** — propriété prouvée par le segment de dossier. C'est le seul
périmètre que la purge touchera.

**6 objets de préfixe non-UUID** dans `avatars` : le `marketing/` historique décrit au §2.4.
Confirmé.

**62 objets à la racine de `avatars`** — c'est la découverte. RLS **exige**
`foldername[1] = auth.uid()` à l'INSERT ; un objet sans dossier a `foldername[1] = NULL`, et
`NULL = auth.uid()` n'est pas `TRUE`. **Aucun client n'a donc pu les écrire.** Ce sont des écritures
`service_role`, et leur origine est identifiée :
[`scripts/seed-profile-photos.js:161`](../scripts/seed-profile-photos.js#L161) —
`seed-${crypto.randomUUID()}.jpg`, téléversé à la racine du bucket.

Ces objets illustrent exactement la collision que la règle du §3 refuse : **leur nom contient un
UUID**, mais dans le *nom de fichier*, pas dans un segment de dossier — et cet UUID est aléatoire,
il ne désigne aucun compte. Un `LIKE '%' || uid || '%'` les prendrait pour des médias
d'utilisateur. La règle « segment de dossier entier, égalité stricte » les écarte sans effort.
Propriété non prouvable → **jamais purgés**, jamais comptés orphelins.

### La propriété, tranchée

- `storage.objects.owner` est renseigné sur **22 objets sur 90** → il **ne peut pas** être la source
  unique de vérité. Le chemin reste le juge.
- Mais il **contredit le segment 1 zéro fois**. Là où il existe, il confirme. Il devient donc un
  **témoin corroborant** : si owner est présent et diverge, la purge échoue fermé sur cet objet.

Le critère 3 du §3 est donc retenu comme critère principal, le critère 2 comme garde-fou.

### Le média le plus sensible

`verifications` contient **exactement un objet**, et **c'est un orphelin**. Aucun profil vivant ne
porte de `verification_video_url` (contrôle 15 = 0).

Autrement dit : une seule personne a jamais utilisé la vérification par vidéo, elle a supprimé son
compte, et **l'enregistrement de son visage est toujours là**. Le volume est dérisoire ; le fait ne
l'est pas.

`voice-intros` est vide : la catégorie existe dans le code, pas encore dans les données. La purge
doit la couvrir quand même — c'est du code qui vivra plus longtemps que cette mesure.

### Un second constat, indépendant de JUNO-09

Contrôles 16 à 18 : **8 comptes en fenêtre de grâce, et les 8 ont déjà expiré.**

Le cron `process-expired-deletions` tourne à 03:00 UTC. Si l'écart entre l'expiration la plus
ancienne et maintenant dépasse 25 heures, ce n'est pas une attente — c'est une panne, et **huit
personnes ont demandé l'effacement de leur compte sans l'obtenir**.

C'est un manquement au droit à l'effacement **distinct** de JUNO-09, et antérieur.

**Confirmé le même jour** par `supabase/tests/diagnose_deletion_cron.sql` :

| | |
|---|---|
| tâche `process-expired-deletions` | `0 3 * * *`, **active** |
| **secret dans la commande cron** | **VIDE** |
| exécutions | **142, dont 142 « réussies »** |
| réponses HTTP sur 14 jours | 200 × 72 · **401 × 25** |
| retard de la plus ancienne | **114 jours** ; 7 comptes sur 8 au-delà de 30 jours |

Cause racine :
[`20260419000004:46-49`](../supabase/migrations/20260419000004_account_soft_deletion.sql#L46) —
`COALESCE(current_setting('app.settings.expired_deletions_secret', TRUE), '')`. Le paramètre n'a
jamais été posé, `current_setting` rend `NULL`, `COALESCE` en fait `''`, et la commande a été figée
avec un en-tête vide. Le bloc se termine par `EXCEPTION WHEN OTHERS THEN RAISE NOTICE` : **deux
constructions fail-open dans le même bloc.**

`pg_cron` enregistre `succeeded` dès que l'appel HTTP part — il ne lit pas le code de réponse. Le
seul témoin était la ligne `401` dans `net._http_response`, que rien ne surveille. **142 nuits de
suite.**

→ Suivi complet : `docs/runbooks/expired-deletions-cron-2026-09.md`. Une décision d'ordre en découle
et elle touche JUNO-09 : réparer le cron supprimerait ces 8 comptes **avant** que la purge existe.
`supabase/tests/diagnose_expired_deletions_impact.sql` mesure combien d'objets deviendraient
orphelins, et si l'un d'eux est une vidéo de vérification.

---

## 6. Risques identifiés

| # | risque | gravité | traitement retenu |
|---|---|---|---|
| **R1** | **Suppression croisée** — purger l'objet d'un autre compte | critique | UUID validé en entier, égalité stricte sur le segment 1, revalidation de **chaque** nom renvoyé par `list()` avant `remove()`, jamais de liste de chemins fournie par un appelant |
| **R2** | **Perte de l'UUID** — `deleteUser()` casse la cascade et efface le seul lien | critique | travail de purge durable **sans clé étrangère**, créé **avant** la suppression Auth (§7) |
| **R3** | **Purge partielle silencieuse** — timeout au milieu d'un lot | haute | état par catégorie + compteurs + cron de reprise ; l'objet absent compte comme succès idempotent |
| **R4** | **Chemins imbriqués** — `list()` ne renvoie qu'un niveau ; un sous-dossier serait ignoré | moyenne | parcours récursif borné en profondeur, revalidation du segment 1 sur le chemin **complet reconstitué** |
| **R5** | **Pagination** — `list()` plafonne à 100 entrées par défaut | moyenne | pagination explicite jusqu'à épuisement, lots bornés, test au-delà d'une page |
| **R6** | **Objets hors convention** — `marketing/` dans `avatars` | moyenne | jamais purgés ; classés « propriété non prouvable » ; le détecteur ne les compte pas orphelins |
| **R7** | **URL signée survivante** — `verification_video_url` porte une URL valable **1 an** (`verificationService.ts:92`) | moyenne | la ligne disparaît par cascade, mais l'URL reste valide où qu'elle ait été copiée. La purge de l'objet la neutralise : c'est un argument de plus pour purger **avant** d'oublier l'UUID |
| **R8** | **Fuite par les journaux** — un chemin en clair identifie un compte | moyenne | ni chemin, ni nom, ni URL signée dans les journaux ni dans la table d'état : uniquement bucket, catégorie et compteurs |
| **R9** | **Rattrapage historique confondu avec la correction** | haute | deux livrables distincts : la purge (future) et le détecteur (lecture seule). Aucun mode destructif dans le second sans autorisation explicite |
| **R10** | **Le courriel affirme déjà que tout est supprimé** | faible→moyenne | corriger le texte de `confirm-deletion` en même temps que le comportement, pas avant |
| **R11** | **Comptes déjà en fenêtre de grâce** au moment du déploiement | moyenne | le contrôle 16 du diagnostic les compte ; s'il est > 0, la purge doit être déployée avant le prochain passage du cron de 03:00 UTC |

---

## 7. Architecture proposée

### 7.1 Ordre des opérations — les deux options, et le choix

**Option 1 — purger le stockage puis supprimer le compte Auth.**
Simple, et suffisante quand tout se passe bien. Elle échoue exactement là où il ne faut pas : si la
purge s'interrompt au milieu et que la suppression Auth suit quand même, le reste est orphelin sans
trace. Et si l'on fait dépendre la suppression Auth du succès complet de la purge, une panne de
Storage **empêche un lecteur de supprimer son compte** — un manquement plus grave que celui qu'on
corrige.

**Option 2 — créer un travail de purge durable, puis supprimer le compte Auth, puis exécuter et
reprendre.**
La ligne de travail porte l'UUID et survit à la cascade **parce qu'elle n'a pas de clé étrangère
vers `auth.users`**. C'est le seul mécanisme qui conserve de quoi reprendre après la disparition du
compte.

**Retenu : option 2, avec exécution synchrone opportuniste.**

```
1. créer la ligne media_purge_jobs (user_id, catégories attendues, status='pending')
                                            ← sans FK : survit à la cascade
2. tenter la purge immédiatement, en lots bornés, budget de temps borné
3. supprimer auth.users                     ← reprise possible quoi qu'il arrive
4. marquer le travail 'completed' si tout est parti, 'pending' sinon
5. un cron reprend les travaux non terminés
```

Pourquoi cet ordre exact :

- **1 avant 3** est obligatoire. C'est R2.
- **2 avant 3** est un choix : le cas courant se termine en une passe, sans laisser d'objet vivant
  entre-temps, et R7 (l'URL signée) est neutralisé au plus tôt.
- **3 ne dépend jamais du succès de 2.** Le lecteur a demandé la suppression de son compte ; la lui
  refuser parce que le stockage tousse serait le mauvais arbitrage. L'étape 5 garantit la fin.
- **Retour arrière** : si l'étape 3 échoue, le travail reste `pending` et le compte existe encore.
  Le cron le reprendra, et le parcours pourra être rejoué — l'étape 2 est idempotente, donc rejouer
  ne coûte rien. Le seul état irréversible est la suppression Auth, et elle est la dernière.

### 7.2 Purge centralisée

Une seule implémentation, appelée par les trois chemins. Contrainte : `process-expired-deletions`
est du Deno, `confirm-deletion` du Node. Deux runtimes → **une fonction edge dédiée**,
`purge-user-media`, que les deux appellent en serveur-à-serveur. C'est ce qui rend « les trois
parcours utilisent la purge centralisée » **prouvable** plutôt qu'espéré.

Contrat :

- entrée : **un** `userId` validé, jamais une liste de chemins ;
- authentification : secret dédié, comparaison en temps constant, **fail-closed** ;
- buckets : **liste blanche** en dur — `avatars`, `voice-intros`, `verifications` ;
- pour chaque bucket : `list('{uuid}')` paginé, descente bornée en profondeur, **revalidation du
  segment 1 sur chaque chemin reconstitué**, puis `remove()` par lots ;
- objet absent = **succès idempotent**, jamais une erreur fatale ;
- propriété ambiguë = **échec fermé**, aucun `remove()` ;
- retour structuré par catégorie : détectés / supprimés / en erreur ;
- journaux : bucket, catégorie, compteurs. **Jamais** de chemin.

### 7.3 État durable

Table `media_purge_jobs` — **sans clé étrangère vers `auth.users`**, c'est le point entier :

```
id, user_id, requested_by_path ('mobile_cron' | 'web_immediate' | 'manual'),
status, per_category jsonb {bucket: {found, deleted, failed, done}},
attempts, last_error_class, created_at, updated_at, completed_at
```

N'y entrent jamais : chemin complet, nom d'origine, URL publique ou signée, jeton, contenu.
`last_error_class` est une **classe** (`storage_unavailable`, `permission_denied`), pas un message.

RLS deny-all, `service_role` seul. Rétention : purge des lignes `completed` après 90 jours par le
cron de nettoyage existant — ce sont des journaux techniques, pas une trace de conformité.

### 7.4 Détecteur d'orphelins — séparé, lecture seule

Outil distinct, **aucun mode destructif**. Classifie en cinq catégories : propriété confirmée et
compte présent / orphelin confirmé / référence cassée / propriété ambiguë / erreur d'analyse.
Paginé, reprenable, compteurs seuls en sortie. Le mode de suppression, s'il est demandé un jour,
sera un livrable séparé avec `--dry-run` par défaut, manifeste immuable, validation humaine, plafond
de volume et arrêt sur anomalie.

---

## 8. Plan de migration

Additives, jamais de modification d'une migration appliquée.

| # | migration | contenu | vérifie |
|---|---|---|---|
| 1 | `2026090900000X_media_purge_jobs.sql` | table + index + RLS deny-all + GRANT `service_role` seul | absence de FK vers `auth.users` (la survie à la cascade), aucun rôle client, RLS active |
| 2 | `2026090900000Y_media_purge_resume_cron.sql` | cron de reprise des travaux `pending` | la tâche est planifiée ; le bloc `pg_cron` avale ses erreurs, donc la vérification passe par une requête, leçon de JUNO-28 |

Aucune migration ne supprime quoi que ce soit. Le rattrapage historique est un plan distinct (§7.4),
non exécutable sans validation humaine du rapport.

---

## 9. Plan de tests

Les 20 cas exigés, avec leur nature — un test sur mocks n'est jamais présenté comme une preuve de
comportement réel.

| # | cas | nature |
|---|---|---|
| 1 | utilisateur sans média | unitaire, mock Storage |
| 2 | un objet par catégorie | unitaire |
| 3 | plusieurs objets dans une catégorie | unitaire |
| 4 | objet déjà absent | unitaire — doit rendre succès |
| 5 | références DB en double | unitaire |
| 6 | purge rejouée à l'identique | unitaire — idempotence |
| 7 | timeout après purge partielle | unitaire — état `pending` conservé |
| 8 | reprise après timeout | unitaire — le second passage termine |
| 9 | erreur temporaire de Storage | unitaire — pas de perte d'état |
| 10 | bucket absent ou mal configuré | unitaire — n'annule pas les autres |
| 11 | chemin legacy valide | unitaire |
| 12 | chemin ambigu ou malformé | unitaire — **refus** |
| 13 | cibler l'objet d'un autre utilisateur | unitaire — **refus**, deux UUID distincts |
| 14 | suppression Auth réussie après purge | intégration |
| 15 | suppression Auth échouée après purge | intégration — travail conservé |
| 16 | compte Auth déjà absent | intégration |
| 17 | objet sans ligne DB | détecteur |
| 18 | ligne DB sans objet | détecteur |
| 19 | pagination au-delà d'un lot | unitaire — > 100 entrées |
| 20 | aucun chemin sensible dans les journaux | statique + comportemental |

Plus des **validateurs statiques** : les trois parcours appellent la purge centralisée ; aucun
`remove()` hors du module de purge ; aucun motif de correspondance partielle d'UUID ; la table
d'état ne porte aucune colonne de chemin.

---

## 10. Décisions nécessaires avant la phase B

**Tranchée par la mesure — `storage.objects.owner`.** 22/90 renseignés, 0 contradiction. Critère
principal = le chemin ; `owner` = garde-fou. Un objet dont `owner` existe et diverge du segment 1
fait échouer la purge fermé. Plus de décision requise.

Restent quatre points, dont un urgent :

1. **URGENT — les 8 comptes expirés non supprimés.** Lancer
   `supabase/tests/diagnose_deletion_cron.sql`. Si le contrôle 3 rend « secret VIDE », le correctif
   est de poser `app.settings.expired_deletions_secret` et de replanifier la tâche — et il est
   indépendant de JUNO-09, donc livrable immédiatement. **Ces huit personnes attendent leur
   effacement.**
2. **Parcours B et fenêtre de grâce** — la purge web s'exécute immédiatement, sans les 7 jours du
   parcours A. Assumé, ou faut-il aligner (JUNO-19) ? La purge est irréversible : **c'est une
   décision produit**, pas technique.
3. **Rétention des travaux de purge** — 90 jours proposés. À confirmer.
4. **Conservation légale (phase F)** — je n'ai trouvé **aucune obligation documentée** dans le
   dépôt : ni politique de conservation, ni exigence contractuelle, ni durée. Sans exigence
   confirmée par vous, la règle appliquée sera la **suppression**, y compris pour la vidéo de
   vérification orpheline. La seule question à trancher : un média de vérification lié à un
   signalement `reports` en cours doit-il survivre ? La table `reports` ne référence aucun média
   (`full_schema.sql:290-300`), donc rien ne l'exige aujourd'hui.

### Ce qui change dans le plan, à la lumière de la mesure

- **Le rattrapage historique est minuscule** : **5 orphelins** au 10 septembre 2026 — 4 avatars et
  1 vidéo de vérification. Il ne demande pas d'outillage industriel, mais la même rigueur : le
  détecteur reste en lecture seule et son rapport reste validé à la main. Le plafond de volume
  compte précisément parce que le chiffre est petit — un bug de classification en ferait 90.
- **Les 62 objets `seed-`** ne sont pas un problème JUNO-09 : ils appartiennent à la question du
  ménage des comptes synthétiques déjà ouverte dans `docs/suivi-supabase-2026-09.md`. Ils doivent
  être **explicitement exclus** de tout futur mode destructif, et le détecteur doit les nommer
  « propriété non prouvable » plutôt que de les taire.
- **Le volume ne justifie pas de raccourci.** 90 objets aujourd'hui, 369 comptes ; le code écrit ici
  vivra sur des ordres de grandeur supérieurs. Pagination, lots bornés et reprise restent au
  programme.

---

## 11. Ce que la phase A n'a pas fait

Aucun fichier fonctionnel modifié. Aucun objet supprimé. Aucune migration créée. Aucune requête
exécutée contre la production — le diagnostic est écrit, pas lancé.

Deux fichiers ajoutés, tous deux inertes : ce document et
`supabase/tests/diagnose_media_ownership.sql`.

---

## 12. Phase B — préparée le 10 septembre 2026, non appliquée

L'architecture de la §7 est retenue telle quelle, avec les douze amendements arrêtés par
l'exploitant. Les livrables :

| fichier | rôle |
|---|---|
| `supabase/migrations/20260910000002_media_purge_jobs.sql` | la table durable **sans FK**, les trois RPC, deny-all |
| `supabase/migrations/20260910000003_media_purge_resume_cron.sql` | reprise `*/10` **armée**, rétention 90 j |
| `supabase/migrations/20260910000004_cron_edge_health_media_purge.sql` | la supervision sait **mesurer** la reprise |
| `supabase/functions/purge-user-media/index.ts` | la purge centralisée, seule implémentation |
| `supabase/functions/process-expired-deletions/index.ts` | exécutant mobile — le garde précède la suppression |
| `apps/web/src/app/api/account/confirm-deletion/route.ts` | exécutant web — même garde, et le courriel corrigé |
| `packages/shared/src/security/__tests__/media-purge.test.ts` | 44 tests sur le **vrai** code edge |
| `scripts/validate-media-purge.mjs` | 55 contrôles statiques |
| `supabase/tests/diagnose_media_purge_jobs.sql` | 21 contrôles, lecture seule |
| `docs/runbooks/media-purge-2026-09.md` | l'ordre de déploiement, la vérification contrôlée, le retour arrière |

### Ce que la phase B ne fait pas, et pourquoi

**Elle ne touche pas les cinq orphelins historiques.** Aucun travail ne les désigne, la tâche de
reprise est figée en mode `resume`, et le détecteur n'a pas de mode destructif. C'est l'amendement 12,
et c'est aussi la bonne conception : un rattrapage de masse mérite son propre livrable, avec
`--dry-run` par défaut, un manifeste immuable, un plafond de volume et une validation humaine.

**JUNO-09 reste donc OUVERT.** La phase B arrête l'hémorragie — à partir de son déploiement, aucune
suppression de compte ne laisse de média derrière elle. Les cinq objets déjà là, dont la vidéo de
vérification du 1ᵉʳ février, attendent le rattrapage.
