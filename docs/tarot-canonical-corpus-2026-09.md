# Tarot — corpus canonique, voix JUNO, localisation explicite (2 sep 2026)

Remplace `docs/tarot-localization-chantier-2026-09.md`, qui ouvrait le chantier
sur une hypothèse partiellement fausse. Ce document est le compte rendu et la
référence.

## 1. Ce que l'audit a réellement trouvé

L'audit n'a pas comparé les fichiers à l'œil : il a **importé les deux moteurs
côte à côte** et diffé les données qu'ils construisent. Le formatage disparaît,
seule la divergence réelle survit.

| | web | mobile |
|---|---|---|
| cartes | 78 | 78 |
| structure | 22 majeurs + 4×14 | identique |
| identifiants | identiques, **même ordre** | identiques |
| tirage pour la même graine | identique | identique |
| `getPositionLabel` | `→ string` | `→ { label, emoji }` |
| URL des images | URL du projet en dur | construite depuis l'env |

**Les décks n'avaient pas divergé structurellement.** L'écart de 666 contre 539
lignes était du formatage.

**Dix divergences de prose, sur trois cartes** — `major-10` (Roue de Fortune),
`major-16` (La Tour), `swords-10` (Dix d'Épées). Le motif est net : quelqu'un
avait adouci le fatalisme **côté web** et le changement n'a jamais atteint le
mobile.

| | web (déjà adouci) | mobile (original) |
|---|---|---|
| major-10 | « an unexpected opening **may** invite you to soften » | « **Fate brings** an unexpected romantic opportunity » |
| major-10 | « Cycles and turning points » | « **Destiny**, cycles, and turning points » |
| major-16 | « Truth **tends to** surface when it is ready » | « The truth **will** come out » |
| swords-10 | « the floor you build from » | « **the only way is up** » |

Passé au crible du vocabulaire interdit : **web 1 occurrence** (« toxic »),
**mobile 11**. Trois mois de dérive, invisible parce que rien ne comparait.

## 2. La prémisse fausse du brief : le gating

Le brief posait que « mobile utilise encore l'alias legacy `tarot` ». **C'est
faux, et la migration le dit elle-même** —
`20260511000002_split_tarot_feature_keys.sql` :

> *mobile uses 'tarot' only as a route name, not as an RPC key, so no mobile
> change is required.*

Vérifié dans le code et dans l'historique git (`log -S"'tarot'"` sur
`premiumUsage.ts` : **aucun commit**). L'état réel :

- **web** : côté serveur, `enforce_premium_feature('tarot_monthly' | 'tarot_cosmic')` ;
- **mobile** : **côté client**. `SERVER_ENFORCED_FEATURES` ne contient que
  `natal-chart` et `conversation-guide` ; le tarot passe par `PremiumGate` avec
  `weekly-tarot` / `monthly-tarot` et le chemin d'essai hérité ;
- la ligne `tarot` en base est un **alias défensif** pour de vieux clients qui
  n'ont jamais existé. Elle reste, comme prévu.

**Conséquence pour ce chantier :** la consolidation du moteur ne touche **aucun
code de gating**, sur aucune plateforme, parce que le gating vit entièrement
hors du moteur. C'est ce qui a rendu l'opération sûre.

*Constat non traité ici, à trancher séparément :* le tarot mobile est gaté
**côté client**, donc contournable par un client modifié. Ce n'est pas une
régression de ce chantier — c'est l'état depuis toujours — et le corriger
demande une migration de politique premium, pas un refactor de contenu.

## 3. L'architecture

```
packages/shared/src/tarot/
  types.ts        contrat de complétude : les 78 identifiants en type littéral
  deck.ts         structure seule — aucune prose
  engine.ts       graine, mélange, clés de période
  content-en.ts   78 noms + 312 significations
  content-fr.ts   78 noms + 312 significations
  index.ts        API publique + résolution de langue explicite
  __tests__/      42 tests
```

Exporté comme `@astro/shared/tarot`. Les deux applications l'importent ; les
deux anciens moteurs (**1 205 lignes**) sont supprimés.

**Le contrat de complétude est au compilateur.** `TarotCardId` est l'union des
78 identifiants littéraux et chaque corpus est `Record<TarotCardId, …>` : une
carte oubliée est une erreur `tsc`, pas une carte vide chez un abonné.

## 4. Trois défauts du moteur, corrigés

Le corpus étant réécrit, chaque carte dit déjà autre chose — personne ne perd
un tirage qu'il reconnaissait. C'était donc le moment.

1. **Le mélange était biaisé et dépendait du moteur JS.**
   `[...deck].sort(() => rng() - 0.5)` : un comparateur qui ignore ses
   arguments viole le contrat d'ordre, donc le résultat dépend de
   l'implémentation du tri — **V8 (web) et Hermes (React Native) n'ont aucune
   obligation de s'accorder**. Les deux plateformes pouvaient donner des cartes
   différentes pour la même graine. Et la distribution n'est pas uniforme.
   Remplacé par Fisher-Yates. Un test tire 78 000 fois et vérifie que chaque
   carte mène entre 800 et 1 200 fois — celui que l'ancien mélange ne pouvait
   pas passer.

2. **Le générateur perdait ses bits de poids faible.**
   `hash * 1103515245 + 12345` en double précision atteint ~2,3e18, au-delà de
   2^53 : les bits que le masque conservait étaient du bruit d'arrondi. Ça
   *avait l'air* aléatoire, ce qui est précisément pourquoi personne n'a
   vérifié. Remplacé par mulberry32 (`Math.imul`, exact en 32 bits).

3. **Le numéro de semaine était une approximation** qui dérivait au nouvel an
   et pouvait rendre 53 ou 54 — donc deux tirages « hebdomadaires » dans une
   semaine. ISO 8601 désormais, calculé sur la date locale.

**Conséquence assumée :** le tirage de la période en cours change pour tout le
monde. Rien n'est stocké en base — `generateReading` est pur, dérivé de
`userId` + période — donc aucune donnée ne casse.

## 5. Les positions ne prédisent plus

Le moteur disait `past / present / future / advice` ; le chrome web V2
affichait déjà « ce qui est présent », « ce qui demande ton attention », « ce
qui soutient la connexion ». Deux noms pour une même chose, et
`TarotReadingOverview` portait une table de remappage pour les réconcilier.

Les positions canoniques sont maintenant `present / attention / connection /
advice`. Le remappage disparaît, et le **mobile cesse d'afficher « Passé /
Présent / Futur »** — un cadrage de prédiction sur un produit qui promet de la
réflexion. Les libellés mobiles sont **copiés depuis les fichiers web**, pas
retraduits, pour que les deux plateformes ne puissent pas décrire le même
tirage différemment.

## 6. La voix

Encouragé : *may, can, often, tends to, invites, notice, worth asking, a
pattern*. Interdit et **cassant le build** : prédiction (*will happen,
guaranteed*), fatalisme (*destined, destiny, fate, inevitable, bad luck,
doomed*), étiquettes pseudo-cliniques (*toxic*), injonction (*you must*),
absolus. Équivalents français : *destin, fatalité, inévitable, malchance, âme
sœur, toxique, tu dois, il faut, garanti, jamais*.

Les significations inversées sont la partie que la plupart des corpus ratent.
Ici une inversion n'est pas une punition ni une version pire de la carte :
c'est le même thème vu par en dessous, écrit pour qu'on puisse en faire
quelque chose.

**Provenance.** Les noms de cartes sont les titres traditionnels du tarot à 78
lames (Rider-Waite-Smith, 1909, domaine public) — le vocabulaire partagé du
jeu. Les 312 significations par langue sont écrites pour JUNO : rien n'est
repris, condensé, paraphrasé ni réorganisé depuis une source publiée.

## 7. Localisation : deux langues écrites, six replis assumés

**EN et FR complets** (78 noms + 312 significations chacun). Les six autres
locales **retombent sur l'anglais et le disent** : `isFallback` est porté par
le tirage *et* par chaque carte, `tarotV2EnglishCorpusNote` existe dans les 16
fichiers de locales et s'affiche sur les deux plateformes, et le web pose
`lang="en"` sur la prose concernée pour qu'un lecteur d'écran change de voix.

C'est le précédent du Conversation Guide, pas une invention. L'alternative —
servir de l'anglais sous une interface japonaise sans le dire — est exactement
le genre de fausse promesse que ce dépôt démonte depuis un an. **Aucun
`[missing "..."]` n'est possible** : il y a toujours de la prose, et toujours
un drapeau disant dans quelle langue.

**Le tirage ne dépend pas de la langue** : la locale est délibérément absente
de la graine, donc changer de langue montre *ses propres* cartes traduites, pas
un autre tirage. Testé et gardé.

**Registre :** le corpus français **tutoie**, parce que le chrome du tarot
tutoie déjà dans les huit locales (« Ce qui demande **ton** attention »). Le
reste du dépôt vouvoie. La cohérence de l'écran l'emporte sur celle du dépôt —
mais **l'écart de registre entre fonctionnalités est une décision produit qui
reste ouverte**, pas un oubli.

## 8. Ce qui est gardé, ce qui est supprimé

**Supprimé** : `apps/web/src/lib/tarotEngine.ts` (666 l.),
`apps/mobile/services/tarotEngine.ts` (539 l.). Aucun import ne les visait plus
— vérifié avant suppression, et les deux applications compilent toujours.

**Gardé volontairement** :

- les clés `tarot_past` / `tarot_present` / `tarot_future` / `tarot_advice` dans
  les locales mobiles. Plus rien ne les lit, mais supprimer une clé traduite
  dans huit langues est une décision distincte d'en ajouter quatre ;
- la ligne de politique `tarot` en base (§2) ;
- `scripts/upload-tarot-images.js`, qui téléverse les images du bucket.

## 9. Garde-fous

`npm run validate:tarot-content` — **45 contrôles**, dans la CI. Deck (78,
22 majeurs, 4×14, identifiants uniques, **ordre exact**), corpus (312
significations par langue, aucun blanc, aucune phrase réutilisée, chaque carte
distincte entre endroit/inversé et amour/général), voix (vocabulaire interdit
dans les deux langues), architecture (les deux écrans importent le paquet
partagé, les anciens moteurs sont partis, **aucun fichier applicatif n'a fait
repousser un deck**), localisation (deux langues écrites, six replis signalés,
note présente dans 16 fichiers), et **gating inchangé** (web appelle les deux
clés serveur, mobile ne les appelle pas, l'alias legacy survit).

Testé en régression sur quatre cassures : phrase dupliquée, fatalisme
réintroduit, deck réordonné, web décroché du paquet. **4/4 détectées.**

`packages/shared/src/tarot/__tests__` — **42 tests** vitest pour le
comportement que le validateur ne peut pas charger (Node efface les types mais
ne résout pas les specifiers sans extension du dépôt, donc le validateur charge
les feuilles et pas le baril).

## 10. Ce qui reste ouvert

- **Les images des cartes.** Le bucket `tarot` sert les 78 images. Les noms sont
  du domaine public ; **l'illustration Rider-Waite-Smith de Pamela Colman Smith
  ne l'est pas partout** (domaine public aux États-Unis ; ailleurs, dépend de la
  durée post-mortem — Colman Smith est morte en 1951). Non audité ici. À vérifier
  avant toute diffusion large.
- **Le gating client-side du tarot mobile** (§2).
- **Le registre tutoiement/vouvoiement** entre fonctionnalités (§7).
- **Les six langues non écrites.** Le repli est honnête, il n'est pas une
  traduction. Si le tarot devient un argument de vente hors EN/FR, il faudra
  écrire les corpus — l'architecture les accueille sans rien changer d'autre.
