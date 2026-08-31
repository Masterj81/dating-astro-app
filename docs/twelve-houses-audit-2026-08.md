# Les douze maisons — audit d'intégrité et plan

**Date :** 31 août 2026.
**Statut :** audit **exécuté**. P0 et P1 implémentés le 31 août ; voir §0.
**Périmètre :** `The Twelve Houses` dans le Full Natal Chart, mobile et web.

---

## 0. Ce qui a été implémenté (31 août 2026)

Le plan §9 prévoyait un P0 de suppression puis un P1 de calcul. Les deux sont
faits, dans le même passage, parce que le P1 s'est révélé être une fonction pure
sans migration (§5.3) — le reporter aurait laissé l'écran plus pauvre qu'avant
pour rien.

**Supprimé — placements fabriqués**

| Où | Ce qui était affiché |
|---|---|
| mobile | `degree: 15 / house: 1` (Soleil), `22 / 4` (Lune), `12 / 3` (Mercure), `28 / 7` (Vénus), `5 / 10` (Mars), `19 / 9` (Jupiter), `3 / 11` (Saturne), `8 / 1` (Ascendant) — constantes, identiques pour tout utilisateur |
| mobile | `data.mercury_sign \|\| signs[3]` ×5. Les colonnes `mercury_sign`… **n'existent pas** dans `profiles`, donc le repli tirait 100 % du temps : Mercure toujours Cancer, Vénus toujours Balance, Mars toujours Bélier, Jupiter toujours Sagittaire, Saturne toujours Capricorne |
| web | `degree: ((baseSeed + i*7) % 29) + 1`, `house: ((baseSeed + i*2) % 12) + 1` |
| moteur | angles calculés avec `latitude`/`longitude` coercés depuis null → 0° / 0° |
| `calculate-chart` | `lat = 51.5074; lng = 0` (Greenwich), sur un test `!lat \|\| !lng` qui écrasait aussi les **vraies** coordonnées 0 |
| `get-profile-chart` | même substitution Greenwich |
| `astrology.ts` | paramètres par défaut `45.5017, -73.5673` (Montréal) |
| `geocoding.ts` | `buildResult(45.5017, -73.5673, city)` pour toute ville non résolue |
| `birth-info.tsx` | `geocodeCity(birthCity \|\| 'Montreal')` — l'onboarding lui-même |

**Ajouté — vérité à la place**

- `packages/shared/src/astrology/houses.ts` : `resolveBirthDataState`,
  `areHousesTrustworthy`, `resolveHouseCusps`, `houseOfLongitude`,
  `planetsByHouse`, `signsOnCusps`, `resolveRisingLongitude`.
- Les deux écrans lisent désormais `birth_chart` : **vrais** degrés et
  **vraies** planètes Mercure→Saturne. Le web n'en affichait aucune (les
  colonnes n'existent pas, la planète était supprimée) ; mobile en inventait
  cinq.
- Les maisons personnelles se calculent quand l'heure **et** le lieu sont
  prouvés, par dérivation équi-maisons depuis le rising stocké — aucune
  migration (§5.3).
- Section des douze maisons **portée sur mobile** ; les 24 clés étaient
  traduites dans les 8 locales et rendues nulle part.
- Signe sur la cuspide affiché en état C, encart d'état distinct en A et B.
- `ChartWarning` gagne `missing_birth_place` ; `BirthInput.latitude/longitude`
  et `StoredBirthChart.coordinates` deviennent nullables ; `geocodeCity`
  renvoie `GeoResult | null`.

**Garde-fous**

- `scripts/validate-natal-integrity.mjs` — **117 vérifications**, câblé sous
  `npm run validate:natal-integrity`. Les 13 régressions correspondantes ont
  été réintroduites une par une pour vérifier qu'elles échouent.
- `__tests__/houses.test.ts` (29 tests) et 6 tests moteur supplémentaires.
  Suite partagée : **211 tests**.
- P0-5 de `validate:retention-guards` renforcée : elle vérifiait que
  `resolveTrustedRisingSign` était *appelée*, pas que la ligne Ascendant était
  *conditionnée* à sa réponse. Elle l'exige maintenant (71 vérifications).

**Non fait, et pourquoi** — P2 §9.12-15 (interprétations personnalisées par
maison, croisements planète × maison × signe de cuspide, analytics). Le corpus
de 96 clés redevient utilisable tel quel maintenant que les maisons sont
vraies, mais l'écrire est un travail de contenu, pas de code.

---

## 1. Résumé exécutif

La question posée était : comment rendre la section « The Twelve Houses » plus
utile. L'audit répond d'abord autre chose, parce que le code dit autre chose.

**La section des douze maisons n'existe que sur le web, et c'est le seul endroit
honnête de tout l'écran.** Ses douze cartes sont pédagogiques, identiques pour
tout le monde, et le code le dit explicitement
([NatalChartOverview.tsx:568](../apps/web/src/components/NatalChartOverview.tsx#L568)).
Elle ne prétend rien.

**Le problème est une section plus haut.** « Planetary Positions » affiche, pour
chaque planète, un degré et un numéro de maison — et les deux sont inventés, sur
les deux plateformes :

- **Mobile** ([natal-chart.tsx:134-158](../apps/mobile/app/premium-screens/natal-chart.tsx#L134)) :
  des constantes écrites en dur. Soleil maison 1 à 15°, Lune maison 4 à 22°,
  Mercure maison 3 à 12°, Vénus maison 7 à 28°, Mars maison 10 à 5°, Jupiter
  maison 9 à 19°, Saturne maison 11 à 3°. **Identiques pour chaque utilisateur
  de la planète.**
- **Web** ([NatalChartOverview.tsx:179-180](../apps/web/src/components/NatalChartOverview.tsx#L179)) :
  `house: ((baseSeed + index * 2) % 12) + 1`, un hachage de longueurs de chaînes.
  Varié, plausible, sans aucun rapport avec le ciel.

Ce numéro fabriqué sert ensuite de clé pour aller chercher une interprétation
personnalisée : `natalPlanetInHouse_{planète}_{n}`. Il existe **96 de ces clés**
(8 corps × 12 maisons), traduites dans les 8 locales sur les deux plateformes —
**768 paragraphes** rédigés avec soin, servis contre un numéro tiré au sort.
Le lecteur lit « Vénus en 7ᵉ maison » et un paragraphe sur ses relations, avec
la même mise en page et la même autorité que son signe solaire, qui est vrai.

**Troisième constat, plus grave encore.** Même si on voulait calculer les vraies
maisons, on ne le pourrait pas honnêtement pour une partie des comptes, parce
que **le lieu de naissance est inventé quand il manque** :

| Chemin | Substitution |
|---|---|
| `calculate-chart` ([index.ts:639-655](../supabase/functions/calculate-chart/index.ts#L639)) | `lat = 51.5074, lng = 0` — Greenwich |
| `get-profile-chart` ([index.ts:289](../supabase/functions/get-profile-chart/index.ts#L289)) | `51.5074 / 0` — Greenwich |
| mobile ([astrology.ts:146-147](../apps/mobile/services/astrology.ts#L146)) | `45.5017, -73.5673` — **Montréal** |

L'ascendant dépend du lieu autant que de l'heure. Un compte avec une heure de
naissance mais sans ville reçoit un ascendant calculé depuis Londres — ou depuis
Montréal selon le chemin — et `isRisingTrustworthy` le laisse passer, parce que
cette fonction prouve qu'une **heure** existait, jamais qu'un **lieu** existait.

C'est la même famille de bug que l'ascendant Aries : une valeur plausible
substituée à une valeur absente. Elle est simplement plus difficile à repérer,
parce que sa sortie varie de façon crédible au lieu de dire « Bélier » à tout le
monde.

**Conséquence pour le plan.** Le premier patch utile n'ajoute rien. Il retire :
le degré et le numéro de maison fabriqués, et les 768 interprétations qu'ils
déclenchent. Rendre les maisons « plus utiles » commence par arrêter d'en
afficher de fausses.

---

## 2. Décision tier : Celestial vs Cosmic

**Celestial. Aucun changement de politique n'est nécessaire** — le modèle de
données est déjà correct.

```sql
-- 20260419000006_premium_server_gating.sql:96
('natal_chart', 'celestial', 5),
-- 20260823000001_free_preview_quota.sql:53
SET free_preview_quota = 1 WHERE feature_key = 'natal_chart';
```

Les maisons ne sont pas une feature séparée : elles sont une couche de lecture du
thème natal, au même titre que les positions planétaires. Elles héritent de
`natal_chart`, donc de Celestial, donc du preview quotidien gratuit.

**Pourquoi pas Cosmic.** Cosmic doit rester ce qui regarde le temps : transits,
fenêtres de planification, reflets mensuels, timing. Les maisons sont
strictement statiques — elles sont fixées à la seconde de naissance et ne
bougent plus jamais. Les mettre derrière Cosmic reviendrait à faire payer un
niveau « avancé » pour comprendre une donnée qui est déjà dans le thème que
Celestial vend.

**Règle à tenir.** Comprendre son propre thème natal ne doit jamais exiger
Cosmic. Si un jour on ajoute « vos transits traversent actuellement votre 7ᵉ
maison », **cette phrase-là** est Cosmic : ce n'est plus la maison, c'est le
transit. La maison reste Celestial, le mouvement devient Cosmic. La frontière
est nette et il faut la tenir dans le wording autant que dans le code.

**Ce qui doit rester gratuit.** L'introduction générale aux douze maisons est du
contenu pédagogique, pas une donnée personnelle. Voir §8.

---

## 3. État actuel — mobile

**Il n'y a pas de section « The Twelve Houses » sur mobile.**
[`app/premium-screens/natal-chart.tsx`](../apps/mobile/app/premium-screens/natal-chart.tsx)
rend exactement deux sections : `planetaryPositions` (ligne 442) et
`elementsModalities` (ligne 562).

Pourtant **les 24 clés de contenu existent déjà, traduites dans les 8 locales**
(`natalHouseName_1..12`, `natalHouseMeaning_1..12`, vérifié dans
`apps/mobile/locales/*.json`). Le corpus est écrit, payé, traduit, et n'est
rendu nulle part. C'est la partie la moins chère de tout ce plan.

### 3.1 Ce que mobile affiche à la place

`getPlanetaryPositions` ([lignes 130-160](../apps/mobile/app/premium-screens/natal-chart.tsx#L130))
construit huit lignes avec un `degree` et un `house` littéraux :

| Corps | Signe | Degré affiché | Maison affichée |
|---|---|---|---|
| Soleil | `sun_sign` (réel) | **15** | **1** |
| Lune | `moon_sign` (réel) | **22** | **4** |
| Ascendant | `rising_sign`, gardé | **8** | **1** |
| Mercure | `mercury_sign` **ou `signs[3]`** | **12** | **3** |
| Vénus | `venus_sign` **ou `signs[6]`** | **28** | **7** |
| Mars | `mars_sign` **ou `signs[0]`** | **5** | **10** |
| Jupiter | `jupiter_sign` **ou `signs[8]`** | **19** | **9** |
| Saturne | `saturn_sign` **ou `signs[9]`** | **3** | **11** |

Deux fabrications distinctes se superposent ici :

1. **Le degré et la maison sont des constantes.** Deux utilisateurs nés à vingt
   ans d'écart voient tous deux « Vénus, 28°, maison 7 ».
2. **Le signe lui-même a un repli.** `data.mercury_sign || signs[3]` — un compte
   dont `mercury_sign` est nul se voit attribuer le Cancer. `signs[6]` = Balance
   pour Vénus, `signs[0]` = Bélier pour Mars, `signs[8]` = Sagittaire pour
   Jupiter, `signs[9]` = Capricorne pour Saturne. C'est exactement le
   `getFallbackSign` retiré du web le 30 août, encore vivant sur mobile.

### 3.2 Le rendu

Lignes [483-543](../apps/mobile/app/premium-screens/natal-chart.tsx#L483) :

```tsx
{signLabel} {pos.degree}° · {t('house')} {pos.house}
…
{planetInHouse ? formatPlanetInHouseLabel(pos.planet, houseName) : houseName}
{planetInHouse || houseMeaning || ''}
```

`hasHouse` est `pos.house >= 1 && pos.house <= 12` — toujours vrai, puisque le
numéro est écrit en dur. Le bloc s'affiche donc systématiquement, avec le
paragraphe `natalPlanetInHouse_venus_7` présenté comme une lecture du thème du
lecteur.

### 3.3 Ce que mobile fait bien

L'ascendant est correctement gardé
([lignes 141-153](../apps/mobile/app/premium-screens/natal-chart.tsx#L141)) : la
ligne entière est retirée quand `resolveTrustedRisingSign` renvoie null, plutôt
que d'afficher une interprétation sur un signe que personne n'a. C'est le bon
modèle — il faut simplement l'étendre au degré, à la maison, et aux signes
planétaires.

### 3.4 Aucun état « heure de naissance manquante »

Rien dans l'écran ne dit au lecteur qu'il manque une donnée. L'ascendant
disparaît silencieusement de la liste. Un lecteur sans heure de naissance voit
sept lignes au lieu de huit et n'a aucune raison de comprendre pourquoi, ni
aucun moyen d'y remédier depuis cet écran.

---

## 4. État actuel — web

[`NatalChartOverview.tsx`](../apps/web/src/components/NatalChartOverview.tsx),
675 lignes. Deux blocs concernent les maisons.

### 4.1 L'accordéon des positions planétaires — fabriqué

```ts
// lignes 174-180
// NOTE: degree and house remain decorative, derived from a string
// length. They are precision theatre of the same family as the "82%
// overall energy" removed in the Daily Reflection V2 rewrite…
degree: ((baseSeed + index * 7) % 29) + 1,
house:  ((baseSeed + index * 2) % 12) + 1,
```

Le code sait ce qu'il fait et le documente. C'est la dette explicitement
reportée dans `docs/rising-sign-integrity-2026-08.md` §6 et laissée de côté le
30 août. Elle est encore en production.

`baseSeed` dérive de longueurs de chaînes du profil. Deux conséquences :

- La maison est **stable par profil** — le lecteur qui revient voit toujours la
  même. Rien ne trahit la fabrication.
- Elle **change si le lecteur modifie son prénom ou sa ville**. Ses « maisons »
  se réorganisent après une correction de faute de frappe.

Le rendu (lignes [480](../apps/web/src/components/NatalChartOverview.tsx#L480) et
[535-548](../apps/web/src/components/NatalChartOverview.tsx#L535)) est identique
à mobile : `{signe} {degré}° · House {n}`, puis le nom de la maison et le
paragraphe `natalPlanetInHouse_*`.

### 4.2 La section des douze maisons — honnête, mais elle promet

Lignes [568-603](../apps/web/src/components/NatalChartOverview.tsx#L568). Douze
cartes statiques, numéro + nom + signification. Le commentaire du code est
exact : *« pedagogical, identical for every chart »*.

Le problème est dans la copie :

> **The twelve houses**
> Each house describes a life area. **The sign sitting on each house cusp colors
> how that area unfolds** — which is why two charts with the same Sun sign can
> still feel very different.

La phrase annonce le signe sur la cuspide, puis douze cartes s'affichent **sans
aucun signe**. Le texte décrit une personnalisation que la section ne livre pas.
Un lecteur attentif conclut soit que la donnée manque, soit — plus probablement
— que les numéros de maison qu'il vient de lire dans l'accordéon juste au-dessus
**sont** cette personnalisation. Le paragraphe honnête sert de caution au bloc
qui ment.

### 4.3 Ce que web fait bien

- `getFallbackSign` a été retiré le 30 août : un signe absent est **supprimé**,
  jamais inventé (lignes [153-183](../apps/web/src/components/NatalChartOverview.tsx#L153)).
- L'écran affiche `birth_time` dans le récapitulatif de données
  ([ligne 399](../apps/web/src/components/NatalChartOverview.tsx#L399)), avec
  `statusUnknown` quand elle manque. C'est le seul endroit des deux plateformes
  où le lecteur peut constater qu'il manque quelque chose — mais rien ne relie
  ce constat aux maisons.
- L'accordéon existe déjà et est accessible (`aria-expanded`, `aria-controls`,
  rotation du chevron sous `motion-safe`). Le patron UX demandé au §7 est déjà
  construit ; il suffira de le réutiliser.

---

## 5. Données nécessaires pour des maisons personnalisées

### 5.1 Ce que le moteur produit

[`chart.ts:156-164`](../packages/shared/src/astrology/chart.ts#L156) est
irréprochable :

```ts
let rising: Placement | null = null;
let mc: Placement | null = null;
let houses: number[] | null = null;
if (normalized.hasBirthTime) {
  const ascLong = computeAscendant(time, input.latitude, input.longitude);
  rising = longitudeToPlacement(ascLong);
  mc     = longitudeToPlacement(computeMidheaven(time, input.longitude));
  houses = computeEqualHouses(ascLong);
}
```

Sans heure : `rising`, `mc` et `houses` restent null, et
`houses_unavailable_without_birth_time` est ajouté aux warnings. Le type
`NatalChart` déclare `houses: number[] | null` et
`ChartWarning` contient déjà le code. **Rien à changer dans le moteur.**

### 5.2 Ce qui est réellement persisté — et ce qui ne l'est pas

[`toStoredBirthChart`](../packages/shared/src/astrology/stored.ts#L204) écrit :

```
sun, moon, rising, planets{…}, coordinates, timezone, confidence, chartVersion
```

**Ni `houses`, ni `mc`.** `hydrateStoredChart` sait les lire
([lignes 155-160](../packages/shared/src/astrology/stored.ts#L155)) mais rien ne
les écrit jamais par le sérialiseur canonique. En pratique
`birth_chart.houses` est null sur la quasi-totalité des lignes.

Le P1 demandé — « lire les vraies cuspides depuis `birth_chart.houses` » — **ne
peut donc pas fonctionner tel quel**. Il lirait null partout.

### 5.3 La bonne nouvelle : les cuspides sont dérivables sans migration

Le système est **équi-maisons** :

```ts
// chart.ts:127
export function computeEqualHouses(asc: number): number[] {
  for (let i = 0; i < 12; i++) houses.push(normalize360(asc + i * 30));
}
```

Donc `cuspide[i] = (rising.longitude + 30i) mod 360`, exactement. Et
`rising.longitude` **est** persisté, et reconstruit sans perte depuis
`sign + degree` quand il manque
([`parseStoredPlacement`](../packages/shared/src/astrology/stored.ts#L90)).

**Les douze cuspides se dérivent du rising stocké, à l'identique de ce que le
moteur calculerait.** Pas de migration, pas de changement de schéma, pas de
recalcul serveur. C'est une fonction pure de six lignes.

> ⚠️ Cette dérivation est valide **uniquement tant que le système reste
> équi-maisons**. Le jour où Placidus ou Koch arrive (Phase 2 / Swiss
> Ephemeris, annoncé en tête de `chart.ts`), les cuspides cessent d'être
> équidistantes et devront être persistées pour de bon. Le validateur du §11
> doit échouer si `computeEqualHouses` change de forme.

### 5.4 Placer une planète dans une maison — ce qu'il faut vraiment

```
maison(planète) = floor(((longitude_planète − longitude_ASC + 360) mod 360) / 30) + 1
```

**Il faut la longitude de la planète, pas son signe.** C'est le point technique
qui décide de la faisabilité côté web :

- Les colonnes `mercury_sign`, `venus_sign`… ne portent que le signe. Un signe
  fait 30° et une cuspide équi-maison tombe presque toujours **au milieu** d'un
  signe. Une planète en Balance peut être en 6ᵉ ou en 7ᵉ maison selon son degré.
  **Signe ≠ maison, et le signe seul ne permet pas de trancher.**
- Le web ne charge aujourd'hui que ces colonnes (`NatalProfile`,
  [lignes 11-25](../apps/web/src/components/NatalChartOverview.tsx#L11)). Il
  devra lire `birth_chart` pour obtenir les longitudes.
- Mobile passe déjà par `get_my_full_profile`, qui retourne `birth_chart`,
  `birth_latitude` et `birth_longitude`
  ([20260427000030](../supabase/migrations/20260427000030_get_my_full_profile_rpc.sql#L30)).

### 5.5 La condition de confiance — plus stricte que pour l'ascendant

`isRisingTrustworthy` prouve qu'une **heure de naissance** existait. Pour les
maisons, ce n'est **pas suffisant** (voir §6.2). La condition correcte est :

```
maisons affichables  ⟺  rising digne de confiance
                      ∧  birth_latitude ≠ null
                      ∧  birth_longitude ≠ null
```

Et pour placer les planètes, il faut en plus `birth_chart` hydratable avec des
longitudes réelles.

---

## 6. Risques d'intégrité astrologique

### 6.1 Ce qui est affiché aujourd'hui est faux, et interprété

Ce n'est pas un risque, c'est l'état courant. Les 96 clés
`natalPlanetInHouse_*` × 8 locales sont servies contre un numéro fabriqué. Le
préjudice n'est pas le numéro — c'est le paragraphe qu'il déclenche, qui parle
au lecteur de sa carrière ou de ses relations avec l'autorité d'une donnée
calculée.

### 6.2 Le lieu de naissance est inventé quand il manque

Trois chemins, trois lieux fictifs différents :

```js
// calculate-chart/index.ts:639-655
if (!lat || !lng) { … lat = 51.5074; lng = 0 }      // Greenwich

// get-profile-chart/index.ts:289
const lat = typeof target.birth_latitude === 'number' ? … : 51.5074
const lng = typeof target.birth_longitude === 'number' ? … : 0

// apps/mobile/services/astrology.ts:146-147
latitude: number = 45.5017,
longitude: number = -73.5673,                        // Montréal
```

**Ampleur de l'erreur.** Dans
[`computeAscendant`](../packages/shared/src/astrology/chart.ts#L89), la longitude
entre directement dans le temps sidéral local (`lst = gmst + longitude`), degré
pour degré. Sur une rotation complète, 360° de LST valent 360° d'ascendant, donc
**une erreur de longitude se reporte en moyenne degré pour degré**. Montréal
(−73,57°) contre Paris (+2,35°) : **76° d'écart, soit plus de deux signes et
demi**.

La latitude n'est pas un simple facteur d'échelle : elle apparaît dans
`x = sin(ε)·tan(lat) + cos(ε)·sin(lst)`, donc elle **déplace aussi l'ascendant**
pour un même instant, et elle rend la conversion LST → ascendant fortement non
linéaire. Aux latitudes élevées, certains signes montent en moins d'une heure
quand d'autres mettent plus de trois heures. L'écart de 76° ci-dessus est donc
un ordre de grandeur, pas une constante : selon le signe qui monte, il peut être
sensiblement plus faible ou plus fort.

En équi-maisons, une erreur de X° sur l'ascendant décale **les douze cuspides
de X°**. Une planète située à moins de X° d'une cuspide change de maison. Pour
X = 76°, l'attribution des maisons est du bruit.

**Et `isRisingTrustworthy` ne voit rien de tout ça.** Sa règle 3 renvoie `true`
dès qu'une `birth_time` non vide existe
([rising.ts:120](../packages/shared/src/astrology/rising.ts#L120)), avant même
de regarder la confiance du thème. Un compte avec heure mais sans ville passe la
garde et reçoit un ascendant de Greenwich présenté comme le sien.

> C'est le cinquième bug de la même famille cette semaine, et le seul encore
> ouvert. Il n'appartient pas au périmètre « douze maisons » mais il le
> conditionne entièrement : on ne peut pas construire des maisons personnalisées
> au-dessus d'un ascendant dont on ne sait pas s'il vient du bon continent.

### 6.3 `!lat || !lng` est un test de véracité, pas de nullité

`if (!lat || !lng)` traite `0` comme absent. Une naissance sur le méridien de
Greenwich (Londres, Accra, l'est de la France) ou sur l'équateur voit ses
**vraies** coordonnées écrasées par la substitution. Le cas est rare mais il
transforme une donnée correcte en donnée fausse, ce qui est pire qu'une donnée
absente.

### 6.4 Le fuseau deviné

L'onboarding web sans ville passe le fuseau de l'appareil et rétrograde le thème
en `confidence: 'low'` avec le warning `timezone_guessed_from_device`
(CLAUDE.md, invariant 5). Une erreur de fuseau d'une heure vaut ~15°
d'ascendant, soit une demi-maison. Un thème `confidence: 'low'` ne doit jamais
produire de cuspides affichées.

### 6.5 Le repli de signe encore vivant sur mobile

`data.mercury_sign || signs[3]` et ses quatre sœurs
([natal-chart.tsx:154-158](../apps/mobile/app/premium-screens/natal-chart.tsx#L154)).
Le web a supprimé l'équivalent le 30 août ; mobile ne l'a pas fait. Un compte
dont les colonnes planétaires sont nulles se voit attribuer cinq signes fixes,
avec les interprétations qui vont avec.

### 6.6 Les maisons ne bougent jamais — ce qui aggrave l'erreur

Un transit faux se périme en trois jours. Une maison fausse est présentée comme
un fait structurel de la personne, répété à chaque visite, indéfiniment. Le coût
d'une erreur y est plus élevé qu'ailleurs dans le produit.

---

## 7. UX recommandée

### 7.1 Trois états, pas deux

Le piège de ce chantier est de raisonner en binaire « heure connue / heure
inconnue ». Il y a **trois** états, et c'est le deuxième qui sera oublié.

| État | Condition | Ce qu'on affiche |
|---|---|---|
| **A — Général** | pas d'heure fiable | Introduction aux douze maisons, sans aucune cuspide. Explication nommée + action pour ajouter l'heure. |
| **B — Heure sans lieu** | heure fiable, `birth_latitude` ou `birth_longitude` null, ou `confidence: 'low'` | **Comme A pour les cuspides.** Explication *différente* : ce n'est pas l'heure qui manque, c'est le lieu. Action : ajouter la ville de naissance. |
| **C — Complet** | heure fiable ∧ coordonnées réelles ∧ confiance ≥ medium | Cuspides réelles, signe par maison, planètes placées. |

L'état B est le seul honnête pour un compte qui a rempli son heure et croit donc
avoir tout donné. Le confondre avec C, c'est le bug du §6.2. Le confondre avec A,
c'est lui dire d'ajouter une donnée qu'il a déjà fournie.

### 7.2 Accordéon — oui, avec une réserve

Douze cartes toujours ouvertes font un mur de texte, sur mobile en particulier.
L'accordéon est le bon patron, et **il existe déjà** sur le web
([lignes 196-199](../apps/web/src/components/NatalChartOverview.tsx#L196)) :
état à une seule clé ouverte, `aria-expanded` / `aria-controls`, chevron sous
`motion-safe`. Il faut le réutiliser tel quel, pas en écrire un second.

La réserve : **un accordéon ne doit pas être introduit en même temps que les
cuspides**. Si les douze cartes deviennent dépliables le jour où elles se
remplissent de données personnelles, on ne saura pas si un éventuel gain d'usage
vient de l'interaction ou du contenu. En état A/B, l'accordéon est un pur gain
de lisibilité et peut partir seul.

### 7.3 Ce que chaque carte affiche, par état

| Élément | A | B | C |
|---|:-:|:-:|:-:|
| Numéro + nom de la maison | ✅ | ✅ | ✅ |
| Signification générale | ✅ | ✅ | ✅ |
| Signe sur la cuspide | ❌ | ❌ | ✅ |
| Planètes dans la maison | ❌ | ❌ | ✅ |
| Interprétation personnalisée | ❌ | ❌ | ✅ (P2) |
| Encart explicatif | « heure requise » | « lieu requis » | — |

En A et B, **aucun emplacement vide, aucun tiret, aucun « — »**. Un champ vide
là où le lecteur attend un signe se lit comme un bug ou comme une donnée
retenue. L'absence doit être expliquée une fois, en haut de la section, pas
répétée douze fois.

### 7.4 Le wording de l'introduction

La copie actuelle promet la cuspide et ne la livre pas (§4.2). Deux variantes
sont nécessaires :

- **États A/B** — décrire les maisons comme un cadre de lecture général, sans
  annoncer de signe. Le mot « votre » ne doit pas apparaître.
- **État C** — la copie actuelle devient exacte, et peut rester telle quelle.

### 7.5 Parité mobile/web

Mobile n'a pas la section et possède déjà les 24 clés traduites. La porter est
l'action au meilleur rapport valeur/coût de tout le document. Elle doit
cependant partir **dans le même build** que la suppression des maisons
fabriquées : ajouter une section honnête sur les maisons en laissant l'accordéon
mensonger juste au-dessus rendrait la contradiction visible dans un seul écran.

---

## 8. Free preview / accès premium recommandé

| Contenu | Accès |
|---|---|
| Introduction générale aux 12 maisons + significations | **Gratuit, illimité** |
| Signe sur les cuspides, planètes en maisons | **Celestial** (via `natal_chart`) |
| Interprétations personnalisées par maison (P2) | **Celestial** |
| Transits traversant une maison | Cosmic — *hors périmètre* |

**Pourquoi l'introduction doit rester gratuite.** C'est du contenu pédagogique
identique pour tout le monde ; le facturer reviendrait à vendre une définition.
Et surtout, c'est ce qui donne un sens à l'état A : un lecteur sans heure de
naissance doit repartir avec quelque chose de vrai et d'utile, sinon l'écran ne
fait que lui annoncer ce qu'il n'a pas.

**Pas de nouvelle clé de feature.** Les maisons passent par `natal_chart`
(Celestial, `free_preview_quota = 1`). En créer une seconde multiplierait les
appels à `enforce_premium_feature` sur un même écran et consommerait deux unités
de preview pour une seule visite — exactement le bug corrigé le 23 août
(`20260823000001_free_preview_quota.sql`).

**Le preview quotidien ne doit pas être consommé par la section des maisons.**
L'écran est déjà gardé à son montage. Les maisons sont un bloc **à l'intérieur**
de cet écran : elles ne rappellent jamais la garde.

---

## 9. Plan P0 / P1 / P2

### P0 — Arrêter d'afficher de fausses maisons

1. **Retirer `degree` et `house` fabriqués des positions planétaires**, sur les
   deux plateformes, ainsi que le bloc `natalPlanetInHouse_*` qu'ils
   déclenchent. La ligne devient « Vénus · Balance », qui est vraie.
2. **Retirer le repli de signe sur mobile** (`|| signs[3]` et ses quatre sœurs).
   Aligner sur le web : une planète sans signe est supprimée, pas inventée.
3. **Porter la section des douze maisons sur mobile**, en réutilisant les 24
   clés déjà traduites.
4. **Réécrire l'introduction** pour ne plus promettre la cuspide en états A/B.
5. **Ajouter l'encart d'état** — deux textes distincts, « heure requise » et
   « lieu requis », avec le chemin pour compléter la donnée.
6. *(optionnel, même patch)* **Accordéon** sur les douze cartes, en réutilisant
   le patron web existant.

### P1 — Cuspides réelles

7. **`packages/shared/src/astrology/houses.ts`** — nouveau module :
   `deriveEqualHouseCusps(chart)`, `houseOfLongitude(cusps, longitude)`,
   `areHousesTrustworthy(input)`. Les cuspides sont dérivées du rising stocké
   (§5.3), aucune migration.
8. **`areHousesTrustworthy`** exige rising fiable **et** coordonnées réelles
   **et** `confidence ≥ medium`. C'est la garde qui empêche Greenwich et
   Montréal d'entrer dans l'interface.
9. **Web : charger `birth_chart`** en plus des colonnes `*_sign`, sans quoi les
   longitudes manquent et les planètes ne peuvent pas être placées (§5.4).
10. **Afficher le signe de chaque cuspide** en état C, et les planètes de chaque
    maison quand leurs longitudes sont disponibles.
11. **Corriger le lieu inventé** — les trois substitutions du §6.2 doivent
    devenir des nulls, et l'ascendant ne doit pas être calculé sans
    coordonnées. *C'est un chantier propre, à traiter séparément et probablement
    avant le reste du P1 : il conditionne la véracité de tout ce qui précède.*

### P2 — Lecture personnalisée

12. Interprétations planète × maison servies contre les **vraies** maisons — le
    corpus de 96 clés existe déjà et redevient utilisable tel quel.
13. Croisements planète + maison + signe de cuspide.
14. Parité complète mobile/web sur l'état C.
15. Mesure d'usage via `product_events` (§12.4).

---

## 10. Le premier patch recommandé

**`fix(natal): stop showing house placements nobody computed`**

Le plus petit patch utile ne construit rien. Il retire.

**Contenu**

- `apps/web/src/components/NatalChartOverview.tsx` — supprimer `degree` et
  `house` de `PlanetPosition` et de son constructeur ; supprimer
  `{position.degree}° · House {n}` (ligne 480) et le bloc `hasHouse`
  (lignes 535-548).
- `apps/mobile/app/premium-screens/natal-chart.tsx` — mêmes suppressions
  (lignes 134-158, 510, 534-543) ; supprimer aussi les replis `|| signs[n]`.
- Réécrire `natalChartHousesBody` pour ne plus annoncer un signe absent, dans
  les 8 locales web **et** mobile.
- Ajouter `natalHousesNeedBirthTime` et `natalHousesNeedBirthPlace` — deux
  messages distincts, 8 locales, sur les deux plateformes.

**Pourquoi celui-là d'abord**

- Il retire une affirmation fausse. Tout le reste est une amélioration ; ceci
  est une correction.
- Il ne dépend d'aucune donnée nouvelle, d'aucune migration, d'aucun recalcul.
- Il est réversible et petit.
- Il **débloque** le P1 : tant que le faux numéro de maison est affiché, ajouter
  le vrai créerait deux numéros contradictoires dans le même écran.

**Ce qu'il coûte.** Le web se déploie sur Vercel. Mobile exige un build complet
et une revue Play — `expo-updates` est absent du projet. Le patch mobile devrait
donc partir groupé avec le portage de la section des douze maisons (P0-3), pour
ne pas dépenser deux builds là où un suffit.

**Ce qu'il ne fait pas.** Il ne corrige pas le lieu de naissance inventé
(§6.2). Ce défaut existait avant ce chantier, il survit à ce patch, et il doit
être traité séparément — mais **avant** le P1, faute de quoi les vraies cuspides
seraient calculées depuis un faux ascendant.

---

## 11. Tests et validateurs à ajouter

Un `scripts/validate-natal-houses.mjs`, dans la lignée de
`validate-web-onboarding.mjs` et `validate-mobile-retention-guards.mjs` : des
assertions **structurelles**, parce qu'aucun de ces défauts ne lève d'erreur ni
ne casse un rendu.

**Contre la fabrication**

1. Aucun littéral `house:` numérique dans `natal-chart.tsx` ni dans
   `NatalChartOverview.tsx`.
2. Aucun `degree:` calculé depuis un modulo d'une graine (`% 29`, `% 12`,
   `baseSeed`).
3. Aucun repli `|| signs[` ni `getFallbackSign` sur l'une ou l'autre plateforme.
4. Une clé `natalPlanetInHouse_*` n'est jamais interpolée avec un numéro qui ne
   provient pas de `houseOfLongitude`.

**Contre la régression des gardes (P1)**

5. `areHousesTrustworthy` exige les trois conditions ; le test échoue si l'une
   disparaît.
6. Un thème `confidence: 'low'` ne produit aucune cuspide.
7. `birth_latitude` null ⟹ aucune cuspide, même avec une heure de naissance.

**Contre la dérive du modèle**

8. `computeEqualHouses` reste équidistant à 30° — sinon la dérivation du §5.3
   devient fausse et il faut persister les cuspides pour de bon.
9. `deriveEqualHouseCusps(chart)` est **identique** à `chart.houses` pour un
   thème fraîchement calculé (round-trip prouvé, pas supposé).

**Parité de contenu**

10. `natalHouseName_1..12` et `natalHouseMeaning_1..12` présents et non vides
    dans les 8 locales, web **et** mobile (aujourd'hui : 24/24 partout).
11. Les nouvelles clés d'état présentes dans les 8 locales des deux plateformes.
12. Copie des maisons exempte du vocabulaire promissoire déjà banni ailleurs
    (`soulmate`, `perfect match`, `guaranteed`, `destined`).

**Tests unitaires** dans `packages/shared/src/astrology/__tests__/` :
placement d'une planète exactement sur une cuspide, à 0,01° de part et d'autre,
ascendant à 29,99° d'un signe, passage du 360°/0°, thème sans heure
(`houses === null`).

**Maestro** : un scénario par état — A (pas d'heure), B (heure sans ville),
C (complet) — asservissant que la carte de cuspide est **absente** en A et B.

---

## 12. Requêtes et vérifications sur les données existantes

### 12.1 Combien de comptes peuvent réellement afficher des maisons

```sql
SELECT
  COUNT(*)                                                     AS onboardes,
  COUNT(*) FILTER (WHERE birth_time IS NOT NULL)               AS avec_heure,
  COUNT(*) FILTER (WHERE birth_time IS NOT NULL
                     AND birth_latitude IS NOT NULL
                     AND birth_longitude IS NOT NULL)          AS etat_C_possible,
  COUNT(*) FILTER (WHERE birth_time IS NOT NULL
                     AND (birth_latitude IS NULL
                       OR birth_longitude IS NULL))            AS etat_B_heure_sans_lieu,
  COUNT(*) FILTER (WHERE birth_time IS NULL)                   AS etat_A
FROM public.profiles
WHERE onboarding_completed
  AND split_part(COALESCE(email,''),'@',2) NOT IN
      ('astrodating.test','test.com','demo.com','example.com');
```

`etat_B_heure_sans_lieu` est le chiffre décisif : ce sont les comptes qui ont
aujourd'hui un ascendant calculé depuis Greenwich ou Montréal. S'il est élevé,
le §6.2 passe devant tout le reste du plan.

### 12.2 Les ascendants calculés depuis un lieu inventé

```sql
SELECT rising_sign, COUNT(*) AS n
  FROM public.profiles
 WHERE onboarding_completed
   AND birth_time IS NOT NULL
   AND (birth_latitude IS NULL OR birth_longitude IS NULL)
 GROUP BY 1 ORDER BY n DESC;
```

Une distribution nettement non uniforme trahit la substitution : tous ces thèmes
partagent le même lieu fictif, donc leur ascendant ne dépend plus que de la date
et de l'heure.

### 12.3 Les cuspides ne sont effectivement jamais stockées

```sql
SELECT
  COUNT(*)                                                       AS avec_chart,
  COUNT(*) FILTER (WHERE birth_chart ? 'houses')                 AS avec_houses,
  COUNT(*) FILTER (WHERE birth_chart ? 'mc')                     AS avec_mc,
  COUNT(*) FILTER (WHERE birth_chart -> 'rising' IS NOT NULL
                     AND birth_chart -> 'rising' <> 'null'::jsonb) AS avec_rising,
  COUNT(*) FILTER (WHERE birth_chart ->> 'confidence' = 'low')   AS confiance_basse
FROM public.profiles
WHERE birth_chart IS NOT NULL;
```

Attendu d'après §5.2 : `avec_houses` et `avec_mc` à **0** ou quasi, `avec_rising`
élevé. C'est ce qui valide la stratégie de dérivation plutôt que de migration.

### 12.4 Mesure d'usage (P2)

`product_events` existe déjà
([20260831000001](../supabase/migrations/20260831000001_product_events.sql)) mais
sa whitelist ne contient que `email_clicked`. Ajouter `houses_section_opened` et
`house_card_expanded` demande une migration qui étend `c_events` — à ne faire
qu'au P2, quand la section aura une raison d'être mesurée.

En attendant, `premium_usage` donne déjà le volume d'ouverture de l'écran natal
(`feature_key = 'natal_chart'`), ce qui suffit à savoir si le chantier concerne
beaucoup de monde.

---

## 13. Relecture — un lecteur sans heure de naissance

*Exercice demandé : parcourir l'écran tel qu'il est aujourd'hui, avec le plan
appliqué, en se demandant si l'interface peut faire croire que des maisons
personnelles ont été calculées.*

**Aujourd'hui, sans le plan.** J'ouvre le Full Natal Chart. Je lis « Soleil,
Taureau, 15°, maison 1 » et un paragraphe sur ma façon d'arriver dans une pièce.
Puis « Vénus, Balance, 28°, maison 7 » et un paragraphe sur mes relations. Je
descends, je trouve « The twelve houses » avec la phrase *« le signe posé sur
chaque cuspide colore la façon dont ce domaine se déploie »*. Je conclus que
l'application a calculé mes maisons — les numéros sont juste au-dessus — et que
les douze cartes sont le glossaire qui les explique.

**Rien ne me détrompe.** L'ascendant a disparu de la liste, mais je ne l'ai pas
remarqué : je ne sais pas combien de lignes j'étais censé voir. Aucun message ne
m'apprend qu'il manque une donnée. **L'interface actuelle échoue au test.**

**Avec le P0 appliqué.** Les lignes deviennent « Vénus · Balance », sans degré ni
maison. La section des douze maisons s'ouvre sur un texte qui décrit un cadre de
lecture, sans jamais dire « votre ». Un encart, une seule fois, m'explique que
mes maisons dépendent de l'heure exacte de ma naissance, que je ne l'ai pas
renseignée, et me propose de l'ajouter. Les douze cartes n'ont aucun
emplacement vide — il n'y a rien à remplir, parce qu'on ne me promet rien.

Je repars en sachant deux choses vraies : ce que sont les douze maisons, et
pourquoi les miennes ne sont pas là. **Le test passe.**

**Le cas qui reste à surveiller — état B.** J'ai renseigné mon heure de
naissance mais pas ma ville. Si l'implémentation confond B et C, je vois des
cuspides calculées depuis Greenwich et je n'ai aucun moyen de le savoir : elles
sont plausibles, variées, et personne ne les vérifiera jamais. **C'est le seul
endroit où ce plan peut encore échouer**, et c'est pour ça que
`areHousesTrustworthy` exige les coordonnées et pas seulement l'heure, et que le
validateur 7 du §11 existe.

---

## Annexe — références de code

| Sujet | Emplacement |
|---|---|
| Moteur, maisons null sans heure | [`chart.ts:156-164`](../packages/shared/src/astrology/chart.ts#L156) |
| Équi-maisons | [`chart.ts:127-133`](../packages/shared/src/astrology/chart.ts#L127) |
| Cuspides jamais persistées | [`stored.ts:204-228`](../packages/shared/src/astrology/stored.ts#L204) |
| Hydratation tolérante | [`stored.ts:155-160`](../packages/shared/src/astrology/stored.ts#L155) |
| Garde de l'ascendant | [`rising.ts:96-150`](../packages/shared/src/astrology/rising.ts#L96) |
| Maisons fabriquées — mobile | [`natal-chart.tsx:134-158`](../apps/mobile/app/premium-screens/natal-chart.tsx#L134) |
| Maisons fabriquées — web | [`NatalChartOverview.tsx:174-183`](../apps/web/src/components/NatalChartOverview.tsx#L174) |
| Section des douze maisons (web only) | [`NatalChartOverview.tsx:568-603`](../apps/web/src/components/NatalChartOverview.tsx#L568) |
| Lieu inventé — edge | [`calculate-chart/index.ts:639-655`](../supabase/functions/calculate-chart/index.ts#L639) |
| Lieu inventé — mobile | [`astrology.ts:146-147`](../apps/mobile/services/astrology.ts#L146) |
| Tier et preview | [`20260419000006`](../supabase/migrations/20260419000006_premium_server_gating.sql#L96), [`20260823000001`](../supabase/migrations/20260823000001_free_preview_quota.sql) |
| Coordonnées lisibles par le lecteur | [`20260427000030`](../supabase/migrations/20260427000030_get_my_full_profile_rpc.sql#L30) |

**Documents liés :** `docs/rising-sign-integrity-2026-08.md` (§6 porte la dette
du degré décoratif), `docs/premium-free-preview.md`,
`docs/conversation-coach-feature-plan-2026-08.md` (§12.4, règles de contenu).
