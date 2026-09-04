# Autocomplete de ville de naissance — choix du fournisseur (4 sep 2026)

Décision : **Geoapify Address Autocomplete**, appelé **uniquement depuis une
edge function Supabase**. Aucune clé de fournisseur ne part dans un bundle
client.

---

## 1. Pourquoi Geoapify plutôt que LocationIQ

Vérifié dans la documentation officielle des deux fournisseurs le 4 septembre
2026.

| | Geoapify | LocationIQ |
|---|---|---|
| endpoint | `GET https://api.geoapify.com/v1/geocode/autocomplete` | `/v1/autocomplete` |
| filtre villes | **`type=city`** — paramètre dédié | pas d'équivalent aussi net |
| langue | `lang`, ISO 639-1 | oui |
| **fuseau horaire dans la réponse** | **`timezone.name`** (IANA) | non |
| champs structurés | `city`, `state`, `county`, `country`, `country_code` | via `address` |
| coordonnées | `lat`, `lon` | `lat`, `lon` (chaînes) |
| free tier | **3 000 crédits/jour, 5 req/s** | plus restreint |
| attribution | « Powered by Geoapify » requis sur le plan gratuit | `licence` dans la réponse |

**Le fuseau horaire tranche.** JUNO calcule l'ascendant, le MC et les maisons à
partir d'un instant UTC. Cet instant dépend du fuseau du lieu de naissance —
pas de celui de l'appareil, pas de celui du serveur. Geoapify livre
`timezone.name` avec la ville : la donnée dont dépend tout le reste arrive avec
la ville qui la détermine, au lieu d'être dérivée après coup.

`type=city` compte presque autant : sans lui, un autocomplete d'adresses
proposerait un numéro de rue comme lieu de naissance.

## 2. Pourquoi un proxy et pas une clé publique

C'est la question qui décidait de l'architecture, et la doc y répond.

- **Geoapify** restreint une clé par IP, referrer HTTP, origine et CORS. Ce sont
  de vrais contrôles dans un navigateur. Dans un APK, aucun ne s'applique : la
  réponse documentée côté mobile est le filtrage par **sous-chaîne de
  User-Agent**, que n'importe quel client peut envoyer.
- **LocationIQ** l'écrit noir sur blanc : le referrer « can be spoofed », et les
  restrictions IP « should not be used for browser-based use-cases ».

Une clé livrée dans un bundle est publique. Sur un palier gratuit de 3 000
crédits/jour, ce n'est pas une fuite abstraite — c'est un **déni de service
contre notre propre onboarding** : quelqu'un vide le quota et plus aucun
nouvel utilisateur ne trouve sa ville, au moment exact où il décide s'il
termine son inscription.

Le proxy était donc **nécessaire pour le mobile**. Et puisqu'il l'était, le web
passe par le même chemin : un seul rate limit, un seul cache, une seule règle —
au lieu de deux clients qui divergeront.

**Variables d'environnement :** `GEOAPIFY_API_KEY` **côté serveur uniquement**
(`supabase secrets set`). Il n'y a délibérément **ni** `NEXT_PUBLIC_…` **ni**
`EXPO_PUBLIC_…`, et `apps/web/.env.example` comme `apps/mobile/.env.example`
portent une note qui dit pourquoi, pour que personne n'en ajoute une par
commodité.

**Restrictions recommandées dans la console Geoapify** : limiter la clé à
l'egress du projet Supabase si l'IP est stable, et surveiller le quota. Les
restrictions par origine ne servent à rien ici puisque l'appelant est notre
fonction, pas un navigateur.

## 3. Ce qui part chez le fournisseur

Le texte de ville, une langue sur deux lettres, une limite. **Rien d'autre.**

```ts
export type BirthCityQuery = {
  text: string;
  lang?: string;   // ISO 639-1, pour les noms de lieux locaux
  limit?: number;
};
```

C'est un **type**, pas un commentaire. Il n'y a nulle part où mettre un email,
un identifiant, un token, une date ou une heure de naissance. La fonction
reconstruit l'objet champ par champ (`parseBody`) plutôt que de transmettre ce
qu'elle reçoit : un client qui se mettrait à envoyer `{ text, email }` ne peut
pas fuiter l'email par accident.

L'IP de l'appelant n'est pas transmise non plus. Geoapify voit la fonction.

## 4. Architecture — une seule source

```
frappe → debounce 350 ms → notre edge function → Geoapify (type=city, limit=5)
```

**Il n'y a plus de catalogue local ni de géocodeur embarqué.** Le catalogue de
245 villes et `apps/mobile/services/geocoding.ts` ont été supprimés le 4
septembre 2026.

La raison n'est pas la simplicité, c'est la cohérence : un second chemin de
résolution, c'est un second jeu de coordonnées pour la même ville. Un lecteur
résolu par un chemin aujourd'hui et par l'autre demain obtient **deux
ascendants différents pour un seul lieu de naissance**. Ce dépôt a déjà livré ce
bug — 69 profils enregistrés aux coordonnées exactes d'une ville de repli.

`geocoding.ts` portait en plus une table de 44 villes, un appariement par
sous-chaîne, un appel Nominatim direct depuis l'appareil, et se terminait par le
repli Montréal. Le supprimer ne retire pas seulement du code : ça retire la
surface où ce bug pouvait renaître. Plusieurs gardes du validateur qui
surveillaient son comportement ont été remplacées par une seule, plus forte —
**le fichier n'existe pas**.

**Le coût, dit franchement :** quand l'endpoint est indisponible ou que le
secret n'est pas posé, **aucune ville ne se résout et l'inscription ne peut pas
continuer**. Rien n'est inventé pour masquer ça. C'est le prix assumé d'une
seule vérité.

**Cache et rate limit** dans la fonction : 24 h par requête normalisée, 40
requêtes/minute par appelant. Les deux sont en mémoire et **par instance** —
Supabase peut en lancer plusieurs, donc ce n'est pas un quota global. C'est un
frein sur l'abus évident et une vraie économie sur le cas courant (tout le monde
tape « Paris »). Le plafond réel reste le quota du fournisseur.

`verify_jwt = true` : l'onboarding tourne avec une session, et un endpoint
anonyme qui dépense des crédits est un quota que n'importe qui peut vider.

## 5. Ce que JUNO stocke

Quand une suggestion est choisie :

| colonne | source |
|---|---|
| `birth_city` | le libellé formaté — `Montréal, Québec, Canada` |
| `birth_latitude` | la latitude de la suggestion |
| `birth_longitude` | la longitude de la suggestion |
| fuseau | `timezone` de la suggestion si présent, sinon la résolution existante depuis les coordonnées |

`calculate-chart` reçoit `birthCity`, `latitude`, `longitude` et `birthTimezone`
si connu — il **ne re-géocode pas**, donc il ne peut pas substituer un autre
Paris à celui qui a été choisi.

Aucune coordonnée n'est écrite si elle ne vient pas d'une résolution :
`isUsableBirthCoordinate` refuse `NaN`, l'infini, le hors-planète et **`0,0`**,
qui est un point réel dans le golfe de Guinée et, en pratique, la forme que
prend un null passé par `?? 0`.

## 6. Attribution

Le plan gratuit Geoapify exige une attribution visible, et la donnée en dessous
est OpenStreetMap. Les deux sont affichées sous le champ, dans les huit
locales : *« City search powered by Geoapify · data © OpenStreetMap
contributors. »*

## 7. Risques restants

- **Dépendance dure au fournisseur.** Sans catalogue local, un endpoint
  indisponible ou un secret non posé bloque l'inscription : aucune ville ne se
  résout. C'est la conséquence directe et assumée de la source unique. Le champ
  affiche « La recherche de ville est indisponible » plutôt que de proposer
  quoi que ce soit.
- **Le quota gratuit est de 3 000 crédits/jour.** Un pic d'inscriptions le
  dépasse. Le cache absorbe les requêtes répétées, pas un afflux réel. À
  surveiller avant une campagne.
- **Le cache et le rate limit sont par instance.** Un attaquant réparti sur
  plusieurs instances contourne le compteur. Le vrai plafond est le quota
  Geoapify ; une table Postgres partagée serait la parade, pas nécessaire à ce
  volume.
- **La clé n'est pas encore posée.** `supabase secrets set GEOAPIFY_API_KEY=…`,
  puis déployer la fonction. Tant que ce n'est pas fait, l'endpoint répond
  `503` et **l'onboarding est bloqué** — il n'y a plus de mode dégradé.
- **Les brouillons d'avant le picker** ne portent qu'une chaîne. L'écran
  d'aperçu leur donne des coordonnées nulles : les angles sont retenus, le
  soleil et la lune restent exacts. Même dégradation honnête qu'un lecteur qui
  n'a jamais donné de lieu.
