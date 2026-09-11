# JUNO-09 phase C — conception et modèle de menace

**Conçu le 11 septembre 2026, exécuté le même jour** — campagne `2026-09-11-6cb356`, `deleted=5 · already_absent=0 · failed=0`. **JUNO-09 est FERMÉ.** Le résultat et ce que l'exécution a appris à la conception sont en §8.

Ce document précède l'implémentation. Il énonce ce qui est à supprimer, ce qui est à ne jamais
supprimer, contre quoi les quatre portes protègent réellement, et les six décisions qui vous
appartiennent.

---

## 1. L'objet de la campagne

La phase B empêche la création de nouveaux orphelins. Elle ne devait pas — et ne pouvait pas —
toucher aux objets historiques : aucune ligne `media_purge_jobs` ne les désigne, la tâche de reprise
est figée en mode `resume`, et le détecteur n'a aucun mode destructif.

Il reste exactement cinq objets :

| bucket | objets | nature |
|---|---|---|
| `avatars` | **4** | photos de profil |
| `voice-intros` | **0** | — |
| `verifications` | **1** | **vidéo du visage** |
| **total** | **5** | plus ancien : **1ᵉʳ février 2026** |

Ces compteurs sont la **référence immuable** de la campagne. Tout écart, dans un sens ou dans
l'autre, arrête la procédure — il n'est jamais absorbé par un ajustement automatique.

JUNO-09 restait ouvert uniquement à cause de ces cinq objets. Ils ont été supprimés le 11 septembre 2026 (§8).

---

## 2. Ce qui ne doit jamais être touché

C'est la moitié qui compte. Le stockage contient 90 objets ; cinq sont à supprimer, **85 ne doivent
pas l'être**, et rien dans un chemin ne les distingue à l'œil.

| classe | volume | pourquoi elle est intouchable |
|---|---|---|
| **`seed-*` à la racine** | **60** dans `avatars` | `scripts/seed-profile-photos.js:161` écrit `seed-{uuid}.jpg` **à la racine du bucket**. L'UUID est dans le NOM DE FICHIER, pas dans un dossier. Un test `path.includes(uuid)` les prendrait tous pour des médias utilisateur. |
| **préfixe non-UUID** | **6** (`marketing/…`) | écrits par `service_role`, qui contourne RLS. Aucun propriétaire prouvable, donc **aucun orphelinat prouvable**. |
| **propriétaire Auth existant** | **21** — 1 = 20 dans `avatars`, 0 dans `verifications` | ce sont les médias de comptes vivants |
| **racine hors `seed-`** | **2** | forme inconnue : classées, jamais purgées |

La règle formelle de la phase A, inchangée : **la propriété est le premier segment de dossier égal à
l'UUID en entier**, jamais une correspondance partielle, jamais une inclusion de sous-chaîne.

---

## 3. Modèle de menace — contre quoi les quatre portes protègent vraiment

L'honnêteté sur ce point détermine la valeur du dispositif. Deux catégories, et une seule est
réellement couverte.

### 3.1 Ce qui est couvert : l'accident, sous ses six formes

| scénario | ce qui l'arrête |
|---|---|
| **Manifeste périmé** — de nouveaux objets sont apparus depuis la découverte | l'approbation expire (60 min) ; l'exécution refuse toute entrée hors manifeste ; un objet nouveau exige une nouvelle campagne |
| **Manifeste édité à la main** — un objet ajouté « pendant qu'on y est » | l'empreinte globale change → la signature d'approbation ne vérifie plus |
| **Approbation d'une autre campagne** — copiée depuis un essai précédent | la signature couvre `campaignId` **et** l'empreinte du manifeste |
| **Mauvais projet Supabase** | le `project_ref` est dans la signature et re-vérifié |
| **Compte réactivé entre-temps** | le serveur re-vérifie l'absence du propriétaire **à l'exécution**, entrée par entrée |
| **Volume dérivant** | plafond absolu à 5, et distribution exacte `4/0/1` exigée |

### 3.2 Ce qui n'est PAS couvert, et il faut le dire

- **Un acteur qui contrôle le poste de l'exploitant.** Il peut lire le secret dans l'environnement,
  appeler la fonction directement, et fabriquer le manifeste qu'il veut. Les quatre portes ne sont
  pas un contrôle d'accès : c'est le secret de la fonction qui l'est.
- **Un acteur qui contrôle la fonction edge.** Elle détient la clé de service.
- **Une erreur de classification à la source.** Si `storage.foldername()` ou la table `auth.users`
  mentent, tout le dispositif ment de la même façon. C'est pourquoi la classification est
  **exhaustive** — quatre classes dont la somme doit égaler le total — plutôt que sélective.

**La signature d'approbation vient du serveur, pas du poste.** C'est ce qui donne sa force à la
porte C : l'exploitant ne peut pas signer lui-même, parce que `ORPHAN_APPROVAL_KEY` ne quitte jamais
la fonction. Un manifeste retouché est donc irrémédiablement non approuvé, y compris par quelqu'un
qui a tous les droits sur le poste.

### 3.3 Le pire cas résiduel

Un exploitant légitime, avec le bon secret, sur le bon projet, supprime **au maximum 5 objets**, tous
appartenant à des comptes dont l'inexistence a été vérifiée deux fois, et jamais un objet absent du
manifeste. C'est le plafond du dommage possible, et il est acceptable.

---

## 4. Les quatre portes

```
   PORTE A — découverte           lecture seule sur Storage ; le SERVEUR assemble et
                                  hache le manifeste, l'enregistre, RELIT la ligne
        ↓  manifeste du serveur, écrit tel quel (gitignoré, jamais committé)
   PORTE B — manifeste            empreinte par entrée + empreinte globale, recalculées
        ↓  revue humaine des COMPTEURS (aucun chemin à lire)
   PORTE C — validation           le manifeste ENTIER repart ; le serveur le hache,
                                  exige la campagne au registre avec cette empreinte,
                                  re-vérifie, SIGNE, enregistre, relit
        ↓  artefact d'approbation, lié par signature au manifeste exact
   PORTE D — exécution            --execute + manifeste + approbation + plafond
                                  + projet + registre `approved` AVANT la première
                                  suppression + re-vérification + confirmation chiffrée
```

**Chaque porte écrit le registre et le relit.** La version du 11 septembre ne l'enregistrait
qu'à partir de la porte C : le manifeste était assemblé sur le poste, le serveur n'avait rien à
enregistrer à la découverte, et la base refusait à raison, à la porte C, une campagne qu'elle
n'avait jamais vue. Les portes avaient chacune leur test, contre un double ; l'enchaînement n'en
avait pas. Il en a un maintenant (`orphan-purge-chain.test.ts`), qui exécute les vraies fonctions
de porte en séquence contre un double du registre appliquant les refus de la migration, et le
validateur statique borne chaque assertion à la fonction de porte nommée.

Chaque porte est une **sous-commande distincte**. Aucune ne peut être franchie par une option de
la précédente : `discover` ne supprime pas, `validate` ne supprime pas, et `execute` sans les trois
artefacts sort en erreur.

### 4.1 Pourquoi une fonction edge, et pas un script à la clé de service

La question mérite d'être posée puisque le script serait plus simple.

**Contrainte 11 : ne jamais employer la clé `service_role` comme secret applicatif.** Un CLI qui
supprime des objets Storage a besoin d'un pouvoir administratif : la clé de service, sur le poste.
C'est exactement ce que JUNO-04 vient de retirer de ce poste. La reposer pour cette campagne serait
une régression de posture, réintroduite pour une opération unique.

La fonction edge garde la clé de service dans le magasin de secrets Supabase, où JUNO-04 l'a mise. Le
poste ne détient que `ORPHAN_PURGE_SECRET`, dont le pouvoir se limite à ces trois modes.

**Le risque introduit** — un point de terminaison capable de supprimer — est borné par une propriété
structurelle : le serveur **re-classe chaque entrée lui-même** et ne supprime que l'intersection avec
le manifeste. Le manifeste peut donc **restreindre**, jamais **élargir**. Un appelant ne peut pas
faire supprimer un objet que le serveur ne classe pas indépendamment comme orphelin prouvé.

### 4.2 « Re-vérification » n'est pas « découverte dynamique »

La contrainte interdit une découverte dynamique pendant l'exécution destructive, et exige pourtant
une nouvelle vérification de l'absence du propriétaire. Les deux tiennent ensemble sous une règle
précise :

> **Le chemin d'exécution n'itère JAMAIS sur un bucket.** Il itère sur les entrées du manifeste. La
> re-vérification ne peut que **retirer** une entrée, jamais en ajouter.

Le validateur statique l'assert : aucun appel de listage dans la branche d'exécution.

---

## 5. Le manifeste — ce qu'il contient, et ce qu'il ne contient pas

**Votre question : faut-il chiffrer les chemins, ou les garder dans un artefact local à permissions
restreintes ?**

**Réponse : ni l'un ni l'autre. Le manifeste ne contient aucun chemin.**

Il porte `storage.objects.id`, l'UUID que Storage attribue à l'objet. C'est un identifiant
véritablement opaque :

- il ne révèle ni le compte, ni le nom de fichier, ni le bucket par lui-même ;
- il est stable et suffisant pour agir — le serveur résout `id → chemin` de son côté ;
- il ne demande aucune clé de chiffrement, donc aucune gestion de clé, donc aucun secret de plus.

Chiffrer les chemins aurait été moins bon : il faudrait une clé, la stocker, la faire vivre, et le
manifeste redeviendrait déchiffrable par quiconque obtient les deux. Ne pas écrire la donnée est
strictement supérieur à la chiffrer.

Pour la revue humaine, le manifeste porte en plus un **`ownerGroup`** : `sha256(campaignId + ':' +
ownerUuid)` tronqué à 12 caractères. Il permet de compter les propriétaires distincts sans savoir qui
ils sont. Il n'est pas inversible en pratique : l'espace des UUID est de 2^122, et ces propriétaires
sont par définition **absents** d'`auth.users`, donc il n'existe aucune liste de candidats à tester.

### 5.1 Schéma

```jsonc
{
  "schema": "juno09-orphan-manifest/2",    // v2 : assemblé par le serveur, v1 refusé partout
  "campaignId": "2026-09-11-a1b2c3",       // date + 6 hex aléatoires
  "generatedAt": "2026-09-11T…Z",          // horloge du SERVEUR
  "toolVersion": "1.1.0",
  "projectRef": "qtihezzbuubnyvrjdkjd",
  "authUsersAtDiscovery": 362,             // la preuve du §5.2
  "totals": { "objects": 5, "byBucket": {…}, "byCategory": {…} },
  "entries": [
    {
      "objectId": "…uuid…",                // storage.objects.id — opaque
      "bucket": "avatars",
      "sizeBytes": 84213,
      "createdAt": "2026-02-01T…Z",
      "ownerGroup": "3f9a1c8e2b04",        // aveugle, pour compter, pas pour identifier
      "category": "orphan_proven",
      "reason": "first_segment_uuid_absent_from_auth_users",
      "entryHash": "…"                     // sha256(campaignId|bucket|objectId|category)
    }
  ],
  "manifestHash": "…"                      // sha256 du JSON canonique sans ce champ
}
```

Aucun champ ne peut recevoir un chemin : le schéma est fermé, et le validateur statique refuse
l'apparition d'un champ dont le nom évoque un chemin, un nom de fichier ou une URL.

### 5.2 La preuve qu'aucun propriétaire n'existe

Le manifeste porte, pour chaque entrée, `category: "orphan_proven"` et la raison formelle. Il porte
en outre `authUsersAtDiscovery` : le nombre de comptes au moment de l'inventaire. Ce n'est pas une
preuve cryptographique — c'en est le témoin utile : si ce nombre a **augmenté** entre la découverte
et l'exécution, un compte a pu être créé, et la re-vérification serveur est ce qui tranche
réellement, entrée par entrée.

---

## 6. Journalisation — classes fermées, et rien d'autre

`deleted` · `already_absent` · `auth_owner_exists` · `ambiguous_ownership` · `unknown_path_shape` ·
`storage_unavailable` · `permission_denied` · `timeout` · `manifest_mismatch` ·
`approval_mismatch` · `volume_limit_exceeded` · `unknown`

Et, depuis la v1.1.0, quatre classes de registre, **répondues à l'appelant mais jamais persistées**
(la colonne d'audit n'est écrite qu'à partir d'un résultat Storage) : `campaign_unknown` ·
`campaign_closed` · `registry_unavailable` · `registry_mismatch`.

Jamais un `Error.message`, jamais un `SQLERRM`, jamais un chemin, jamais une URL signée. La table
d'audit contraint l'énumération par un `CHECK`, donc un message libre est **refusé par la base** —
c'est le même mécanisme que `media_purge_jobs.last_error_class`, et pour la même raison : une
convention se contourne, une contrainte non.

---

## 7. Les six décisions qui vous appartiennent

| # | décision | ma recommandation |
|---|---|---|
| **1** | **La vidéo de vérification** — existe-t-il une obligation de conservation documentée ? | **Je n'en invente aucune.** En l'absence d'obligation écrite, la demande de suppression du compte commande la suppression du média. C'est la lecture par défaut du RGPD art. 17, et c'est celle que le code applique. Si une obligation existe (litige, fraude, exigence d'un fournisseur d'identité), elle doit être **écrite** et l'objet retiré du manifeste — la campagne devient alors `4/0/0`, et le plafond doit être ajusté **à la main**. |
| **2** | **Deux nouveaux secrets** — `ORPHAN_PURGE_SECRET` et `ORPHAN_APPROVAL_KEY` | 64 hexadécimaux chacun, posés dans les secrets Supabase ; le premier seul est copié sur le poste, le second ne le quitte jamais. |
| **3** | **La clé de service reste-t-elle hors du poste ?** | Oui — c'est le motif du choix de la fonction edge (§4.1). Si vous préférez un script à la clé de service, dites-le : c'est plus simple, et c'est une régression assumée de la posture JUNO-04. |
| **4** | **Durée de vie de l'approbation** | 60 minutes. Assez pour une revue, trop court pour qu'un manifeste dorme une semaine et soit rejoué. |
| **5** | **Que garder après la campagne ?** | La ligne d'audit (compteurs + empreintes, aucun chemin, aucun identifiant d'objet) et la sortie du diagnostic. **Le manifeste et l'approbation sont détruits** — ils portent les identifiants d'objets. |
| **6** | **Une campagne, ou une par bucket ?** | Une seule. Cinq objets ne justifient pas deux procédures, et un plafond unique est plus facile à vérifier qu'une somme de plafonds. |

**Décisions arrêtées le 11 septembre 2026.** (1) Aucune obligation de conservation de la vidéo de
vérification n'a été identifiée ; la vidéo brute n'était plus nécessaire après la vérification et le
compte avait demandé sa suppression ; elle a été incluse — la campagne est restée `4 / 0 / 1`.
(2) Les deux secrets ont été posés ; seul `ORPHAN_PURGE_SECRET` a touché le poste. (3) Oui : la clé
de service n'a pas quitté Supabase. (4) 60 minutes. (5) Appliqué : ligne d'audit et diagnostics
conservés, manifeste et approbation détruits. (6) Une seule campagne.

---

## 8. Résultat — exécutée le 11 septembre 2026, JUNO-09 FERMÉ

Campagne `2026-09-11-6cb356`. Le diagnostic, relu entre chaque porte, a montré le registre à
`discovered` puis `approved` avec l'empreinte affichée par le CLI, puis `executed=1`. Résultat
`deleted=5 · already_absent=0 · failed=0`. Avant / après : orphelins `4/0/1` → `0/0/0`, vidéo de
vérification `1 → 0`, témoins `seed-*` `60 → 60`, médias des comptes vivants `17 → 17`,
objets classés `90 → 85`, retard phase B `0 → 0`, comptes Auth `365 → 365`. Artefacts locaux
détruits. Le §3.3 annonçait un pire cas borné à cinq objets ; le cas réel a été cinq objets, les
bons.

**Ce que l'exécution a appris à la conception.** Le §4 initial décrivait un registre qui « refuse
une empreinte qu'il n'a pas vue à la découverte » — et le code ne lui donnait rien à voir, parce que
le manifeste était assemblé sur le poste. Le premier essai réel a échoué à la porte C, proprement,
sans rien supprimer. Le §4 ci-dessus est la version corrigée : le serveur assemble, hache,
enregistre et relit ; la chaîne a son test. La règle qui en sort, et qui vaut au-delà de ce
livrable : **un contrôle décrit dans une conception n'existe que si un test exécute la porte
précédente puis celle-ci, dans cet ordre.**

**Une campagne, une seule passe.** Un timeout ou un résultat partiel ferme la campagne ; une
seconde exécution est refusée `campaign_closed` avant toute suppression ; ce qui reste est une
nouvelle campagne et un changement de plafond revu.

---

## 9. Ce que la phase C ne touche pas

`daily-horoscope-push` · `publish-scheduled-posts` · JUNO-19 · les interpolations `%L` de la clé de
service · les courriels · le garde fail-closed de la phase B · `media_purge_jobs`.

**`media_purge_jobs` n'est pas réutilisée** (contrainte 13). Elle est conçue pour des comptes dont la
propriété était connue **avant** la suppression ; y fabriquer des travaux historiques inventerait
une provenance que personne n'a. La phase C a sa propre table, `orphan_purge_campaigns`, qui
enregistre des campagnes et non des comptes.
