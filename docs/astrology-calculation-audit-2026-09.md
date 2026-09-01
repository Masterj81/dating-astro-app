# Audit du moteur de calcul astrologique JUNO

**Date :** 1ᵉʳ septembre 2026.
**Révisé le :** 1ᵉʳ septembre 2026 — voir §0, **la première version de ce
document surestimait l'impact produit du bug P0**.
**Statut :** audit. Deux correctifs serveur appliqués et déployés
(`get-profile-chart` v17) ; un fichier de test ajouté (§2.1).
**Périmètre :** tout ce qui produit un nombre astrologique, du moteur partagé
aux deux edge functions et aux trois surfaces d'affichage.

---

## 0. Note de correction

Ce document a été révisé deux fois le jour de sa rédaction. Les deux
corrections vont dans le même sens et méritent d'être lues avant le reste.

**Correction 1 — un défaut manqué.** La première version affirmait « aucun
`null → 0,0` » alors que le motif figurait dans la liste à chercher. Il
existait, dans le coarsening des coordonnées de `get-profile-chart`. Détaillé
en §5.10, corrigé et déployé.

**Correction 2 — un impact surestimé.** La première version affirmait que le
bug P0 « tronquait tout score de synastrie » et que « les meilleures
compatibilités du produit étaient invisibles ». **C'est faux.**

`applyConfidenceCap` n'a qu'un seul consommateur, `computeSynastry`. Et
`computeSynastry` n'a **aucun appelant produit** : ses deux points d'entrée
publics, `calculateCompatibility` et `calculateSynastry`
([astrology.ts:205-210](../apps/mobile/services/astrology.ts#L205)), ne sont
appelés que par eux-mêmes et par les tests. Aucun nombre affiché à l'écran ne
traverse ce plafond.

Le plafond existe dans le moteur partagé, mais **le moteur n'est pas branché
aux écrans produit. L'impact visible actuel est nul.**

J'avais déduit l'impact de la lecture du code sans vérifier qui appelait quoi
— exactement le raccourci que ce document reproche au reste de la base. Le bug
lui-même reste réel, le correctif reste juste, et il fallait le déployer : une
colonne lue doit être sélectionnée. Mais il ne débloque aucun score aujourd'hui.

Cette vérification a produit le constat le plus important de l'audit : §5.11.

---

## 1. Résumé exécutif

**Le moteur astronomique est bon.** Positions géocentriques réelles via
`astronomy-engine` (~1′ d'arc), longitudes écliptiques **tropicales de la
date** — je l'ai vérifié numériquement plutôt que supposé (§2.1) —, pipeline
horaire correct (Luxon + tzdb + IANA, jamais l'horloge de l'appareil), et
depuis les correctifs du 31 août / 1ᵉʳ septembre plus aucun repli silencieux.
Le principe « si la donnée manque, on l'omet » est appliqué dans le moteur
lui-même, pas seulement à l'affichage.

**Trois problèmes structurels demeurent.**

**P0 — deux bugs de données, corrigés et déployés.**
`get-profile-chart` lisait `target.birth_chart` sans jamais le sélectionner :
`storedTz` valait donc toujours `null`, le fuseau était re-déduit des
coordonnées, `tz.source` passait de `'input'` à `'lookup'`, et la confiance de
`high` à `medium`. Le même fichier renvoyait aussi
`coordinates: { latitude: 0, longitude: 0 }` pour un profil sans lieu de
naissance (§5.10). Les deux sont réparés.

**L'effet sur les scores affichés est nul**, parce que le moteur qui applique
le plafond n'est branché à aucun écran (§0, §5.11). Ces correctifs valaient
d'être faits pour ce qu'ils sont — une colonne lue doit être sélectionnée, et
`null` ne doit pas devenir le golfe de Guinée — pas pour un gain de score.

**P1 — le moteur de synastrie est dormant (§5.11).** JUNO possède un moteur
d'aspects complet — trois cadres, orbes centralisées, aspects interprétatifs,
plafonds de confiance, six bandes, versionnement, 11 tests — et **rien ne
l'appelle**. Les écrans affichent à la place des scores calculés à partir des
seuls **noms de signes** (`lib/synastry.ts`, dupliqué mobile/web) : aucun degré,
aucune orbe, aucun aspect. Deux Vénus à 1° et deux Vénus à 29° d'écart dans le
même signe donnent le même score. Il faut décider de le brancher ou de le
retirer ; le laisser dormant est le seul choix qui coûte sans rien rapporter.

**P1 — quatre moteurs, aucun contrat.** La même formule d'ascendant existe en
trois exemplaires : `chart.ts` (204 lignes), `calculate-chart` (776),
`get-profile-chart` (365). Elles sont **identiques aujourd'hui** — comparées
ligne à ligne — et rien ne garantit qu'elles le restent. Elles ne produisent
déjà pas la même chose : `calculate-chart` ne calcule **ni MC ni maisons**. Le
quatrième, `lib/synastry.ts`, est celui que les utilisateurs voient.

**P1 — deux absences que les utilisateurs remarquent.** Aucune
**rétrogradation** et aucun **nœud lunaire**. Ce sont les deux premières choses
qu'un lecteur un peu informé cherche dans un thème, et leur absence se voit
plus qu'un système de maisons.

**Sur les maisons : ne changez rien maintenant.** Equal House est une méthode
traditionnelle légitime, pas une approximation. Elle est stable, explicable, et
elle a une propriété que le produit exploite déjà : les cuspides se dérivent
exactement de l'ascendant stocké, donc sans migration. Passer à Placidus
aujourd'hui déstabiliserait un moteur qu'on vient tout juste de rendre honnête.
Ce qu'il faut ajouter, c'est **une phrase qui dit lequel on utilise**.

---

## 2. Le pipeline de calcul

```
                    ┌─────────────────────────────────────────────┐
  birth_date        │  normalizeBirthInput()          time.ts     │
  birth_time  ─────►│    parseBirthDate / parseBirthTime          │
  birth_city        │    resolveBirthTimezone(lat,lng,tz)         │
  lat / lng         │      input > tz-lookup > UTC (fallback)     │
  timezone?         │    birthInputToUtcDate() via Luxon          │
                    │    → utcDate, confidence, warnings          │
                    └──────────────────┬──────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │  computeNatalChart()            chart.ts    │
                    │    Astronomy.MakeTime(utcDate)              │
                    │    Sun    SunPosition().elon                │
                    │    Moon   EclipticGeoMoon().lon             │
                    │    ×8     Ecliptic(GeoVector(body,t,true))  │
                    │                                             │
                    │    si hasBirthTime ET hasBirthPlace :       │
                    │      ASC  computeAscendant(t,lat,lng)       │
                    │      MC   computeMidheaven(t,lng)           │
                    │      maisons computeEqualHouses(ASC)        │
                    │    sinon : rising=mc=houses=null            │
                    │            + warning missing_birth_place    │
                    └──────────────────┬──────────────────────────┘
                                       ▼
        toStoredBirthChart()  ──►  profiles.birth_chart (JSONB v2)
             ⚠ n'écrit NI houses NI mc
                                       │
                    ┌──────────────────┴──────────────────────────┐
                    ▼                                             ▼
      hydrateStoredChart()  stored.ts              resolveHouseCusps()  houses.ts
        tolère v1 et v2, jamais d'invention          cuspides dérivées de rising
                    │                                 (équi-maisons, exact)
                    ▼                                             │
      computeSynastry()  synastry.ts  ◄───────────────────────────┘
        detectAspect / resolveMaxOrb / applyConfidenceCap
```

**Trois chemins parallèles écrivent ou lisent des thèmes :**

| chemin | moteur | usage |
|---|---|---|
| mobile onboarding | `packages/shared` via `services/astrology.ts` | écrit `birth_chart` |
| web onboarding | edge `calculate-chart` (copie inline) | écrit `birth_chart` |
| profil d'autrui | edge `get-profile-chart` (copie inline) | recalcule à la volée |

### 2.1 Le repère de référence — vérifié, pas supposé

L'astrologie occidentale mesure la longitude écliptique depuis le point vernal
**de la date**. Un thème rapporté à l'équinoxe fixe J2000 serait faux de la
précession accumulée : ~1° par 72 ans, soit ~0,4° pour une naissance de 1990.

`astronomy-engine` mélange les conventions dans son API — `SunPosition` est
documentée « écliptique de la date », tandis que `Ecliptic()` convertit un
vecteur équatorial. J'ai donc mesuré au lieu de conclure :
`packages/shared/src/astrology/__tests__/equinox-frame.test.ts` calcule le
Soleil **à l'instant exact de l'équinoxe de mars**, où sa longitude tropicale
vaut 0° par définition.

**Résultat : 0° à moins d'une minute d'arc, pour 1970, 1990, 2010 et 2026.** Et
Mars donne la même valeur par les deux chemins de code. Le repère est correct
et cohérent. Le test reste dans la suite pour que ça le demeure.

---

## 3. Ce qui est calculé, corps par corps

| Corps | Fichier · fonction | Entrées | Calculé | Omis si… | Confiance |
|---|---|---|---|---|---|
| **Soleil** | [chart.ts:145](../packages/shared/src/astrology/chart.ts#L145) `SunPosition().elon` | instant UTC | longitude apparente géocentrique de la date | jamais omis | suit le thème |
| **Lune** | [chart.ts:146](../packages/shared/src/astrology/chart.ts#L146) `EclipticGeoMoon().lon` | instant UTC | longitude géocentrique | jamais omis | suit le thème |
| **Mercure→Saturne** | [chart.ts:147-151](../packages/shared/src/astrology/chart.ts#L147) `Ecliptic(GeoVector(b,t,true))` | instant UTC | longitude, aberration corrigée | jamais omis | suit le thème |
| **Uranus/Neptune/Pluton** | [chart.ts:152-154](../packages/shared/src/astrology/chart.ts#L152) | instant UTC | idem ; Pluton par série propre (1700-2200) | `null` sur un thème v1 hydraté | — |
| **Ascendant** | [chart.ts:89](../packages/shared/src/astrology/chart.ts#L89) `computeAscendant` | UTC + **lat + lng** | formule tangente standard, obliquité IAU tronquée | **heure OU lieu manquant → `null`** | `low` si absent |
| **MC** | [chart.ts:113](../packages/shared/src/astrology/chart.ts#L113) `computeMidheaven` | UTC + **lng** | arctan(sin LST / (cos LST·cos ε)) | idem ASC | — |
| **Maisons** | [chart.ts:127](../packages/shared/src/astrology/chart.ts#L127) `computeEqualHouses` | longitude ASC | 12 cuspides à ASC + 30i | idem ASC | — |
| **Signe sur cuspide** | [houses.ts](../packages/shared/src/astrology/houses.ts) `signsOnCusps` | cuspides | `ZODIAC[⌊lon/30⌋]` | `null` sans cuspides fiables | — |
| **Planète en maison** | [houses.ts](../packages/shared/src/astrology/houses.ts) `houseOfLongitude` | longitude réelle + cuspides | arc semi-ouvert [cusp[i], cusp[i+1]) | `null` sans longitude ou sans cuspides | — |
| **Aspects** | [aspects.ts](../packages/shared/src/astrology/aspects.ts) `detectAspect` + [orbs.ts](../packages/shared/src/astrology/orbs.ts) | 2 longitudes + 2 corps | 5 aspects ptoléméens, orbe selon politique | corps absent → paire ignorée | — |
| **Synastrie** | [synastry.ts](../packages/shared/src/astrology/synastry.ts) `computeSynastry` | 2 `NatalChart` | 3 cadres pondérés, score 0-100 | longitude manquante → paire **et son poids** retirés | plafonné par `applyConfidenceCap` — **mais dormant, §5.11** |
| **Synastrie affichée** | `apps/*/lib/synastry.ts` `getWhyFactors` / `calculateZoneScores` | 2 jeux de **noms de signes** | scores par éléments et modalités | signe manquant → facteur retiré | aucune notion de confiance |

**Niveaux de confiance** ([time.ts:226-237](../packages/shared/src/astrology/time.ts#L226)) :

| | condition | conséquence |
|---|---|---|
| `high` | fuseau fourni explicitement | score jusqu'à 100 |
| `medium` | fuseau déduit des coordonnées — **le cas courant** | score plafonné à **92** |
| `low` | pas d'heure, ou fuseau en repli UTC | score plafonné à **80** |

> Point important pour le produit : le chemin nominal produit `medium`, pas
> `high`. Ces plafonds sont réels dans le moteur partagé — mais **ils
> n'atteignent aujourd'hui aucun écran**, parce que `computeSynastry` n'est
> appelé par rien (§0, §5.11). Ils redeviendront déterminants le jour où le
> moteur sera branché.

---

## 4. JUNO face aux méthodes traditionnelles

| Sujet | Pratique de référence | JUNO | Verdict |
|---|---|---|---|
| Zodiaque | Tropical (occidental) | **Tropical de la date**, vérifié §2.1 | ✅ conforme |
| Repère | Géocentrique apparent | `GeoVector(..., true)`, aberration corrigée | ✅ conforme |
| Longitude | Écliptique | Écliptique | ✅ |
| Lune | Position géocentrique vraie | `EclipticGeoMoon` | ✅ |
| Obliquité | Moyenne + nutation | Moyenne seule (`23.439291 − 0.0130042·T`) | ⚠️ écart ≤ 9″ — **négligeable**, ~0,0025° |
| Fuseau | tzdb historique, DST inclus | Luxon + tzdb, DST honoré, jamais l'appareil | ✅ meilleur que la moyenne du marché |
| Heure inconnue | Thème « solaire » ou refus des angles | **Refus des angles**, planètes conservées | ✅ le choix honnête |
| Lieu inconnu | Angles impossibles | **Refus des angles** depuis le 31 août | ✅ (auparavant : Greenwich/Montréal) |
| **Maisons** | Placidus dominant en usage moderne ; Whole Sign en renouveau ; Equal House classique | **Equal House** | ✅ légitime — voir §6 |
| MC | Point distinct des cuspides | Calculé, **jamais affiché** | ⚠️ occasion manquée, pas une erreur |
| MC = cuspide 10 ? | Vrai en Placidus/Koch, **faux en Equal House** | Jamais énoncé | ⚠️ à expliquer si le MC s'affiche un jour |
| Rétrogradation | Attendue par tout lecteur | **Absente** | ❌ manque le plus visible |
| Nœuds lunaires | Nord/Sud, très courants | **Absents** | ❌ |
| Chiron, astéroïdes | Optionnels | Absents | — non prioritaire |
| Aspects | 5 ptoléméens ± mineurs | 5 ptoléméens | ✅ |
| Orbes | 6-10° conjonction, plus serré pour les lents | 8/8/7/7/5, +1 luminaire, −2 lent×lent, plancher 1° | ✅ table saine et centralisée |
| Applicant/séparant | Courant en transits | **Refusé explicitement**, avec la raison | ✅ honnête : deux thèmes natals n'ont pas d'instant commun |
| Synastrie | Lecture d'aspects inter-thèmes | Score pondéré 0-100 sur 3 cadres | ⚠️ produit, pas tradition — assumé et documenté |

**Ce qui manque vraiment**, pour une app grand public : la rétrogradation et
les nœuds. Le système de maisons ne se voit pas ; « Mercure rétrograde » se
voit immédiatement.

---

## 5. Risques

### P0

#### 5.1 `get-profile-chart` lit une colonne qu'il ne sélectionne pas

```ts
// index.ts:249-253 — la liste s'arrête à onboarding_completed
.select('id, name, age, birth_date, birth_time, birth_city, birth_latitude, ' +
        'birth_longitude, sun_sign, moon_sign, rising_sign, bio, image_url, ' +
        'images, photos, gender, has_voice_intro, voice_intro_url, ' +
        'is_verified, last_active, is_active, onboarding_completed')

// index.ts:308 — et pourtant
const storedTz = typeof target.birth_chart === 'object' && target.birth_chart != null
  ? (target.birth_chart as Record<string, unknown>).timezone
  : null
```

`target.birth_chart` vaut toujours `undefined`. `storedTz` vaut toujours
`null`. Le fuseau stocké — celui que l'onboarding mobile a résolu et persisté —
n'est **jamais** utilisé.

**Conséquence.** `resolveIanaTimezone(lat, lng, null)` renvoie
`source: 'lookup'` au lieu de `'input'`, donc `confidence: 'medium'` au lieu de
`'high'`.

**Ce que ça ne fait PAS.** La première version de ce document en concluait que
tout score de synastrie était écrêté à 92. C'est faux : le plafond vit dans
`computeSynastry`, que rien n'appelle (§0, §5.11). **Aucun score affiché
n'était touché.**

**Pourquoi le corriger quand même.** Une colonne lue doit être sélectionnée.
Le défaut est silencieux, il rend une valeur définitivement `undefined`, et il
deviendra visible dès que le moteur sera branché. Le correctif est d'une ligne
et il est déployé (v17).

#### 5.2 Trois moteurs, aucun test de contrat

| fichier | lignes | ASC | MC | maisons | planètes |
|---|---|---|---|---|---|
| `packages/shared/src/astrology/chart.ts` | 204 | ✅ | ✅ | ✅ | 10 |
| `supabase/functions/calculate-chart/index.ts` | 776 | ✅ | ❌ | ❌ | 8 + Soleil/Lune |
| `supabase/functions/get-profile-chart/index.ts` | 365 | ✅ | ❌ | ❌ | 8 + Soleil/Lune |

Les formules d'ascendant sont **identiques au caractère près** dans les trois,
et les versions de bibliothèques concordent (`astronomy-engine@2.1.19`,
`luxon@3.7.2`, `tz-lookup@6.1.25`). Ce n'est donc pas un bug aujourd'hui — mais
rien ne l'assure demain, et **la divergence de sortie existe déjà** : ni MC ni
maisons côté edge.

Deno ne peut pas importer trivialement le package TypeScript du monorepo. La
solution réaliste n'est pas l'unification immédiate, c'est un **contrat de
tests** (§7, phase 1).

### P1

#### 5.3 Aucune rétrogradation
`astronomy-engine` fournit les vitesses. Le calcul est une comparaison de
longitude à deux instants proches. Absence purement produit, pas technique.

#### 5.4 Aucun nœud lunaire
Le nœud nord moyen est une formule fermée ; le nœud vrai demande l'orbite
lunaire. Les deux sont à portée.

#### 5.5 `toStoredBirthChart` n'écrit ni `houses` ni `mc`
([stored.ts:204](../packages/shared/src/astrology/stored.ts#L204))
Sans conséquence tant que le système reste équi-maisons — `resolveHouseCusps`
redérive les cuspides exactement depuis le rising stocké. **Le jour où Placidus
arrive, ça devient bloquant** et demande une migration.

#### 5.6 Le MC est calculé et jamais montré
Un point angulaire majeur, correctement calculé, invisible pour l'utilisateur.

#### 5.7 Le chemin web produit `medium`, le chemin mobile `high`
Mobile passe `geoResult.iana` explicitement → `'input'` → `high`. Web ne passe
un fuseau que sans ville de naissance → sinon `lookup` → `medium`. **Deux
lecteurs identiques reçoivent une confiance différente selon la plateforme
d'inscription.** Sans effet visible tant que le moteur dort (§5.11) ; à
uniformiser avant de le brancher.

### P2

#### 5.8 Obliquité sans nutation
≤ 9″ d'écart, soit 0,0025°. Aucun impact perceptible. **Ne pas corriger** — la
complexité ajoutée dépasse largement le gain.

#### 5.9 Instabilité de l'ascendant au-delà des cercles polaires
Documentée en tête de `chart.ts`. Aucun garde-fou ; le cas est rarissime.

#### 5.10 `null → 0,0` dans le coarsening — **CORRECTION DE CET AUDIT**

> La première version de ce document affirmait « aucun `null → 0,0` ». **C'était
> faux**, et je ne l'ai vu qu'en rouvrant le fichier pour appliquer le correctif
> 0.1. Le motif figurait explicitement dans la liste à chercher ; je l'ai
> survolé.

[get-profile-chart/index.ts:325](../supabase/functions/get-profile-chart/index.ts#L325) :

```ts
const coarseLat = Math.round(lat * 2) / 2   // lat peut être null
const coarseLng = Math.round(lng * 2) / 2
```

`lat` est `number | null` depuis le 31 août. En JavaScript,
`Math.round(null * 2) / 2` vaut **0**. Un profil sans lieu de naissance était
donc renvoyé par l'API avec
`coordinates: { latitude: 0, longitude: 0 }` — le golfe de Guinée, présenté
comme son lieu de naissance approximatif. C'est aussi exactement la forme dont
`hydrateStoredChart` lit les coordonnées : un consommateur qui hydraterait ce
payload reconstruirait un thème calculé là-bas.

Aucun écran ne lit `chart.coordinates` aujourd'hui, donc rien n'était affiché.
Mais c'est un fait fabriqué dans une réponse d'API, du même genre que les
quatre replis retirés le 31 août.

**Corrigé** en même temps que 0.1 : `hasBirthPlace ? Math.round(...) : null`.

#### 5.11 Le moteur de synastrie réel est dormant — ✅ **BRANCHÉ le 1ᵉʳ septembre**

> **Décision produit prise et appliquée.** `computeSynastry` est désormais la
> source canonique du score de synastrie sur mobile **et** sur web, via
> l'adaptateur partagé `packages/shared/src/astrology/synastry-view.ts`.
> `calculateSunCompatibility` ne subsiste que comme repli explicitement
> étiqueté « Sign rhythm preview », affiché uniquement quand un des deux thèmes
> ne peut pas être hydraté. Prérequis §5.12 réglé au préalable
> (`parseConfidence` → `medium`).
>
> Le décompte des moteurs passe de quatre à **deux** : le moteur partagé pour
> la synastrie, et les copies inline des edge functions pour le thème natal
> (§5.2, toujours ouvert).
>
> La description ci-dessous est conservée telle qu'elle était au moment du
> constat.

##### Le constat d'origine

C'est le constat le plus important de cet audit, et il n'est apparu qu'en
vérifiant l'affirmation fausse de §0.

**JUNO possède un moteur de synastrie complet que rien n'appelle.**

| Ce qu'il contient | Où |
|---|---|
| Trois cadres pondérés : **love / friendship / business**, tables de poids distinctes | [synastry.ts:48-88](../packages/shared/src/astrology/synastry.ts#L48) |
| Détection d'aspects sur les **longitudes réelles** (5 ptoléméens) | [aspects.ts](../packages/shared/src/astrology/aspects.ts) |
| **Politique d'orbes centralisée** : 8/8/7/7/5, +1 luminaire, −2 lent×lent, plancher 1° | [orbs.ts](../packages/shared/src/astrology/orbs.ts) |
| **Aspects interprétatifs** Uranus/Neptune/Pluton, `contribution: 0`, qui narrent sans déstabiliser le score | [types.ts:180-188](../packages/shared/src/astrology/types.ts#L180) |
| **Plafonnement par confiance** : high 100 / medium 92 / low 80 | [scoring.ts:33](../packages/shared/src/astrology/scoring.ts#L33) |
| **Six bandes** de score, stables entre plateformes | [scoring.ts:12](../packages/shared/src/astrology/scoring.ts#L12) |
| **Versionnement** du modèle (`SCORING_MODEL_VERSION = 2`) | [version.ts](../packages/shared/src/astrology/version.ts) |
| **11 tests** dédiés + les tests de `stored.test.ts` qui le traversent | `__tests__/synastry.test.ts` |

Points d'entrée : `computeSynastry`, exposé via `calculateSynastry` et
`calculateCompatibility`
([astrology.ts:205-210](../apps/mobile/services/astrology.ts#L205)).
**Appelants produit : aucun.** Vérifié sur tout le dépôt.

##### Ce que les écrans utilisent à la place

`apps/mobile/lib/synastry.ts` et `apps/web/src/lib/synastry.ts` — deux copies
proches mais non identiques d'un calcul **par signes uniquement** :

```ts
// lib/synastry.ts:205
export function getWhyFactors(self, target) {
  return [
    buildFactor('elementRhythm', self.sun_sign,    target.sun_sign),
    buildFactor('emotionalPace', self.moon_sign,   target.moon_sign),
    buildFactor('risingRhythm',  self.rising_sign, target.rising_sign),
  ];
}
```

`calculateZoneScores` fonctionne de la même façon : `pairScore(signe, signe)`.

**Aucun degré, aucune orbe, aucun aspect.** Deux personnes dont les Vénus sont
à 1° l'une de l'autre et deux personnes dont les Vénus sont à 29° d'écart dans
le même signe obtiennent le même score. C'est une approximation défendable pour
un affichage simple — mais c'est bien moins précis que le moteur qui dort à
côté, et ce n'est pas ce que les tests couvrent.

##### Le décompte réel des moteurs

L'audit annonçait « trois moteurs ». Il y en a **quatre** :

| # | moteur | statut |
|---|---|---|
| 1 | `packages/shared/src/astrology` — aspects réels | **dormant** |
| 2 | `calculate-chart` — copie inline, thème natal | vivant (onboarding web) |
| 3 | `get-profile-chart` — copie inline, thème natal | vivant (profil d'autrui) |
| 4 | `lib/synastry.ts` ×2 — scores par signes | **vivant, c'est lui qu'on voit** |

##### Ce qu'il faut en faire

Deux issues, et aucune n'est « laisser tel quel » :

1. **Le brancher.** Les écrans gagnent des scores fondés sur les vraies
   positions, et les 11 tests + le versionnement du modèle deviennent utiles.
   Prérequis : régler §5.12, sinon 74 profils sur 95 entrent dans le calcul avec
   une confiance inventée.
2. **Le retirer explicitement.** Si le score par signes est le produit voulu —
   il est plus lisible et plus tolérant aux données manquantes — alors le moteur
   d'aspects est de la dette : du code testé, versionné et maintenu que personne
   n'exécute.

Le laisser dormant est le seul choix qui coûte sans rien rapporter. C'est aussi
ce qui m'a fait surestimer l'impact du correctif P0 : j'ai lu un plafond réel
dans un chemin mort.

#### 5.12 `parseConfidence` — ✅ **CORRIGÉ le 1ᵉʳ septembre**

> Le défaut est passé de `'high'` à `'medium'`
> ([stored.ts](../packages/shared/src/astrology/stored.ts)). C'était le
> prérequis dur au branchement de §5.11 : sans lui, 74 profils sur 95
> entraient dans le scoring avec une confiance inventée, et
> `applyConfidenceCap` atteint désormais un nombre que le lecteur voit.
>
> Effet mesurable : toute paire impliquant un thème v1 est plafonnée à 92 au
> lieu de 100, et le lecteur en est informé (« Some details are limited… »).
> L'asymétrie hydratation/recalcul décrite plus bas disparaît.

##### Le constat d'origine

[stored.ts:104](../packages/shared/src/astrology/stored.ts#L104) :

```ts
return raw === 'high' || raw === 'medium' || raw === 'low' ? raw : 'high';
```

Recensement du 1ᵉʳ septembre :

| forme | profils | avec heure |
|---|---|---|
| v1 — ni `confidence`, ni `timezone`, ni `chartVersion` | **74** | 64 |
| v2 — les trois présents | 21 | 20 |

Les 74 lignes v1 ont été écrites par l'ancien pipeline : celui qui utilisait le
fuseau de l'appareil et substituait Montréal ou Greenwich. Ce sont les données
**les moins fiables** de la base, et l'hydratation leur attribue la note **la
plus haute**.

Sans conséquence aujourd'hui, puisque rien ne consomme ce plafond (§5.11). Mais
c'est un blocage dur avant de brancher `computeSynastry` : 78 % de la base
entrerait dans le scoring avec une confiance qu'on ne possède pas.

Trois options, à trancher au moment du branchement :

| défaut | plafond | effet |
|---|---|---|
| `'high'` (actuel) | 100 | 74 profils notés au maximum sur des données invérifiables |
| **`'medium'`** | 92 | « on ne sait pas » n'est ni la meilleure note ni la pire — **recommandé**, et cohérent avec ce que `get-profile-chart` leur attribue déjà en recalcul |
| `'low'` | 80 | traite l'inconnu comme mauvais ; change presque tous les scores affichés |

Note d'asymétrie : `hydrateStoredChart` donne `high` à ces 74 thèmes,
`get-profile-chart` leur donnera `medium` en recalcul. **Deux chemins, deux
verdicts sur le même thème.** Le passage à `'medium'` supprime aussi cette
divergence.

### Néant — vérifié, rien trouvé

Balayage explicite des autres motifs demandés : plus aucun `getFallbackSign`,
aucun `baseSeed`, aucun `|| signs[...]`, aucun degré ni maison en dur, aucun
repli Greenwich (51.5074) ni Montréal (45.5017) hors des tables de villes
légitimes, aucun calcul dépendant du fuseau de l'appareil hors du cas web
explicitement étiqueté `timezone_guessed_from_device`.

**Ce paragraphe vaut ce que valent les gardes qui le soutiennent**, et l'épisode
5.10 le montre : une garde de ce lot matchait un caractère backspace au lieu
d'une limite de mot et passait donc à vide. Elle est réparée et vérifiée par
régression délibérée. Les 167 vérifications de `validate:natal-integrity`
verrouillent désormais chacun de ces points, **y compris la classe de bug 5.1** :
toute colonne lue en `target.x` doit figurer dans le `.select()`.

---

## 6. Le système de maisons

**Equal House n'est pas une erreur.** C'est une méthode ancienne, encore
enseignée et utilisée, dans laquelle les douze maisons font exactement 30° à
partir de l'ascendant. Elle a des propriétés que JUNO exploite déjà :

- **Stable partout.** Placidus dégénère aux hautes latitudes — au-delà du
  cercle polaire, certaines maisons deviennent indéfinies. Equal House ne
  dégénère jamais. Pour une app internationale, c'est décisif.
- **Explicable en une phrase.** « Chaque maison couvre 30°, à partir de votre
  ascendant. » Placidus demande un paragraphe sur la division du temps diurne.
- **Dérivable sans migration.** `cuspide[i] = (ASC + 30i) mod 360` exactement,
  donc les cuspides se reconstruisent depuis le rising déjà stocké. C'est ce
  qui a permis de livrer les maisons personnelles sans toucher au schéma.

**Ce que ça coûte.** Beaucoup d'utilisateurs modernes ont vu leur thème sur un
site Placidus et compareront. Un désaccord sur la maison d'une planète est
possible, et il n'y a pas de mauvaise foi des deux côtés : ce sont deux
conventions.

**Whole Sign** serait le concurrent le plus intéressant à terme : encore plus
simple (une maison = un signe entier), traditionnelle, et très lisible pour
débutants. Elle a le même avantage de stabilité polaire.

**Le piège du MC.** En Placidus et Koch, le MC **est** la cuspide de la 10ᵉ
maison. En Equal House, il ne l'est pas — il tombe où il tombe, souvent en 9ᵉ
ou en 11ᵉ. JUNO calcule le MC et ne l'affiche nulle part, donc le problème
n'existe pas aujourd'hui. **Il apparaîtra le jour où le MC sera affiché**, et
il faudra alors dire explicitement que ce n'est pas la cuspide de la 10.

### Recommandation

**Garder Equal House.** Ajouter **une phrase** dans la section des maisons :

> « JUNO utilise le système des maisons égales : chaque maison couvre 30° à
> partir de votre ascendant. D'autres systèmes existent et placent parfois une
> planète dans une maison voisine. »

C'est honnête, ça désamorce la comparaison avant qu'elle ne devienne une
plainte, et ça coûte une clé de traduction. Ne **pas** ajouter Placidus
maintenant : le moteur vient d'être assaini, une seconde convention doublerait
la surface de test avant que la première ne soit verrouillée par un contrat.

---

## 7. Plan d'action

### Priorités révisées

| | quoi | pourquoi |
|---|---|---|
| **P0** | **Conserver les deux correctifs `get-profile-chart`** — déjà faits et déployés (v17) | ils corrigeaient des données et une réponse d'API fausses : une colonne lue non sélectionnée, et `{0, 0}` renvoyé comme lieu de naissance. Leur justification ne dépend pas des scores. |
| **P1** | **Décider du sort de `computeSynastry`** : le brancher aux écrans, ou le déclarer explicitement dormant | §5.11. C'est une décision produit, pas technique : le score par signes est plus lisible et plus tolérant, le moteur d'aspects est plus juste. L'un des deux doit partir. |
| **P2** | **`parseConfidence` sur les thèmes v1** — à régler **avant** tout branchement | §5.12. 74 profils sur 95 entreraient dans le scoring avec une confiance inventée. Sans conséquence tant que le moteur dort. |

Le reste du plan ci-dessous reste valable, à un détail près : la phase 2
(rétrogradation, nœuds) et la phase 3 (choix du système de maisons) supposent
toutes deux que la question P1 soit tranchée. Ajouter des corps à un moteur que
personne n'appelle n'améliore rien à l'écran.

### Phase 0 — sécurité immédiate

| # | Action | Fichier | Coût |
|---|---|---|---|
| 0.1 | Ajouter `birth_chart` au `.select()` | `get-profile-chart/index.ts:258` | ✅ **fait** |
| 0.2 | Coarsening : `null` reste `null` au lieu de devenir 0,0 (§5.10) | `get-profile-chart/index.ts:325` | ✅ **fait** |
| 0.3 | Garde générique : toute colonne lue en `target.x` doit être dans le select | `validate-natal-integrity.mjs` | ✅ **fait** |
| 0.4 | Gardes : coarsening nullable, `sanitizeProfile` reste une liste blanche | idem | ✅ **fait** |
| 0.5 | Vérifier après déploiement que la confiance remonte à `high` | requête §8 | à faire |

0.1 et 0.2 sont les deux seuls correctifs de données de cet audit. Les deux
sont serveur pur et n'exigent qu'un redéploiement de `get-profile-chart`.

### Phase 1 — un moteur, ou au moins un contrat

Deno ne peut pas importer le package TS du monorepo sans outillage de bundling.
L'unification réelle est un chantier ; **le contrat de tests ne l'est pas**.

Créer `packages/shared/src/astrology/__tests__/engine-contract.test.ts` : pour
chaque cas ci-dessous, calculer via le moteur partagé et comparer aux valeurs
attendues, figées comme ancres. Puis un script qui rejoue les mêmes cas contre
les edge functions déployées et compare à 0,01° près.

Cas obligatoires :

| cas | pourquoi |
|---|---|
| heure + ville | chemin nominal |
| sans heure | angles doivent être `null` |
| heure sans ville | angles `null` + `missing_birth_place` |
| **longitude 0 réelle** | le méridien de Greenwich n'est pas « absent » |
| **latitude 0 réelle** | l'équateur non plus |
| ville avec DST | Luxon doit choisir le bon offset |
| fuseau demi-heure (Inde, `Asia/Kolkata`) | +05:30 |
| fuseau 45 minutes (Népal, `Asia/Kathmandu`) | +05:45 — le piège classique |
| latitude élevée (Tromsø, 69°N) | stabilité de l'ascendant |

Les quatre premiers et le fuseau népalais sont **déjà couverts** par
`chart.test.ts` et `houses.test.ts`. Les autres sont à ajouter.

### Phase 2 — enrichissement raisonnable

1. **Rétrogradation** — comparer la longitude à t et t+1h ; un booléen par
   planète. Le plus visible pour l'effort le plus faible.
2. **Nœud nord / nœud sud** — formule du nœud moyen, ou nœud vrai.
3. **Afficher le système de maisons** (§6).
4. **Afficher le MC**, avec la mention qu'en maisons égales il ne coïncide pas
   avec la cuspide de la 10ᵉ.
5. Chiron : seulement si la demande existe.

### Phase 3 — option premium avancée

Choix du système (Equal / Whole Sign / Placidus), comparaison entre systèmes,
lectures planète × maison × signe de cuspide. **Uniquement après la phase 1** :
proposer trois systèmes sur trois moteurs non contractualisés multiplierait par
neuf la surface de divergence.

---

## 8. Vérifications

**Après le correctif 0.1**, la confiance doit remonter :

```sql
SELECT birth_chart ->> 'confidence'  AS confiance,
       COUNT(*)                      AS profils
  FROM public.profiles
 WHERE birth_chart IS NOT NULL
 GROUP BY 1 ORDER BY profils DESC;
```

**Résultat du 1ᵉʳ septembre**, après application :

| forme | profils | avec heure |
|---|---|---|
| v1 — ni `confidence`, ni `timezone`, ni `chartVersion` | **74** | 64 |
| v2 — les trois présents | **21** | 20 |

Séparation nette, rien entre les deux. Le correctif 0.1 ne concerne donc que
les **21 lignes v2** : ce sont les seules à porter un `timezone` que
`get-profile-chart` puisse relire. Les 74 lignes v1 continueront de recevoir
`medium` en recalcul — et `high` à l'hydratation, ce qui est l'asymétrie
décrite en §5.12.

Aucun score affiché ne change dans les deux cas (§0).

**Tests** — la suite partagée compte **228 tests** après l'ajout de
`equinox-frame.test.ts`. À relancer après toute modification du moteur :

```
npm run typecheck --workspace=@astro/shared
npx vitest run              # dans packages/shared
npm run validate:natal-integrity
```

---

## 9. Recommandations de livraison

| | quoi | pourquoi |
|---|---|---|
| **1** | Supabase — `get-profile-chart` redéployé (v17, 1ᵉʳ sept. 13:39 UTC) | ✅ fait. Corrige une colonne lue non sélectionnée et un `{0, 0}` renvoyé comme lieu de naissance. **Ne débloque aucun score** : voir §0. |
| **2** | Rien d'autre n'est urgent | l'audit ne trouve aucun autre calcul faux |
| **3** | Phase 1 avant phase 2 | ajouter des corps à trois moteurs non contractualisés triple la dette |

**Pas de build Android nécessaire pour cet audit.** Le correctif 0.1 est
serveur pur. La rétrogradation et les nœuds, eux, exigeront un build — à
grouper avec le build 125 déjà nécessaire (maisons, ascendants suspects,
géocodeur).

---

## 10. Ce qu'il ne faut PAS changer maintenant

- **Le système de maisons.** Equal House est correct, stable et déjà livré.
- **L'obliquité.** 9″ d'erreur ne justifient pas la nutation.
- **Le refus des angles sans heure ou sans lieu.** C'est la décision la plus
  importante du moteur ; elle a coûté trois migrations à faire respecter.
- **La table d'orbes.** La toucher change tous les scores et impose un bump de
  `SCORING_MODEL_VERSION`.
- **L'absence d'applicant/séparant.** Le raisonnement en tête de `types.ts` est
  juste : deux thèmes natals n'ont pas d'instant commun à différencier.
- **Le scoring de synastrie.** C'est un choix produit assumé, pas une
  prétention à la tradition.

---

**Documents liés :** `docs/twelve-houses-audit-2026-08.md`,
`docs/rising-sign-integrity-2026-08.md`, `docs/suivi-supabase-2026-09.md`.
