# L'ascendant fabriqué — correctif et données historiques

**Statut :** corrigé côté code le 29 août 2026. **Les données historiques ne
sont pas encore nettoyées** — ce document dit quoi exécuter et quand.

---

## 1. Le bug

`apps/mobile/services/astrology.ts` substituait un ascendant à celui que le
moteur avait refusé de calculer :

```ts
rising: placement(chart.rising, { sign: 'Aries', degree: 0, longitude: 0 })
```

Le moteur partagé (`packages/shared/src/astrology/chart.ts`) est correct : sans
heure de naissance il renvoie `rising: null`, `mc: null`, `houses: null`,
`confidence: 'low'` et le warning `missing_birth_time`. La façade mobile
écrasait ce `null` **après** le calcul.

L'onboarding invite explicitement à sauter l'heure de naissance
(« Don't worry if you're not sure », `birth-info.tsx` étape 2). Tout compte qui
l'a fait a donc été écrit en base avec `rising_sign = 'Aries'`, puis s'est vu
annoncer sur son tout premier écran personnalisé une information fausse — dans
onze cas sur douze.

Diagnostic d'origine : `docs/retention-day2-audit-2026-08.md` §3.5, classé
**CRITIQUE pour la crédibilité**.

Aggravant documenté dans ce même audit : `app/welcome/preview.tsx` appelait le
paquet partagé en direct et gérait le cas **correctement**. Le même utilisateur
voyait donc « pas d'ascendant » avant inscription, puis « Ascendant Bélier »
après, dans la même session.

## 2. Ce qui a été corrigé

| Couche | Avant | Après |
|---|---|---|
| Façade mobile | `placement(chart.rising, { sign: 'Aries', … })` | `rising: chart.rising` — passe-plat ; `mc` et `houses` idem |
| `placement()` | acceptait un `fallback`, défaut Bélier | plus de paramètre, lève plutôt que d'inventer |
| Type `NatalChart.rising` | `Placement` | `Placement \| null` |
| Onboarding | `rising_sign: chart.rising.sign` | `chart.rising?.sign ?? null` |
| Reveal | 3 placements en dur | 2 ou 3 selon ce qui existe + note honnête |
| Profil, Natal Chart, Discover, Synastry | affichaient la colonne brute | passent par `isRisingTrustworthy` |

**Le moteur, l'edge function `calculate-chart` et l'onboarding PWA n'avaient
pas le bug.** Seule la façade mobile l'avait.

## 3. Pourquoi corriger le code ne suffit pas

Les lignes déjà écrites restent fausses. Et une surface qui lit
`profiles.rising_sign` **ne peut pas distinguer** un vrai ascendant Bélier d'un
ascendant fabriqué en regardant la chaîne de caractères.

D'où `packages/shared/src/astrology/rising.ts` : n'afficher un ascendant que
lorsque quelque chose **prouve** qu'il a été calculé à partir d'une vraie heure
de naissance. L'absence de preuve est traitée comme l'absence d'ascendant.

Chaque surface dispose d'une preuve différente :

| Surface | Preuve disponible | Comportement |
|---|---|---|
| Profil, Natal Chart | `birth_time` via `get_my_full_profile` | preuve directe → affiche le vrai, sinon un CTA « Ajouter l'heure de naissance » |
| Synastry (soi) | `birth_time` | idem |
| Synastry (autre) | le chart calculé par `get-profile-chart`, qui expose `confidence` et `rising: null` | lit le chart, pas la colonne |
| **Discover** | **aucune** — `get_discoverable_profiles` ne renvoie ni `birth_time` ni `birth_chart` | **le pill Ascendant est masqué**, y compris pour les vrais |

Le coût est explicite : sur Discover, un ascendant réel n'est plus affiché tant
que le point 4 n'est pas fait. C'est le sens d'erreur choisi — masquer un vrai
ascendant coûte une ligne sur une fiche et se répare ; en afficher un faux,
c'est JUNO qui énonce une fausseté sur quelqu'un.

## 4. Nettoyage des données historiques — **non exécuté**

Aucune migration n'est incluse dans ce patch, volontairement. Voici quoi
exécuter, dans cet ordre, dans le SQL Editor Supabase.

### 4.1 Mesurer d'abord

```sql
-- Combien de comptes portent un ascendant qui ne peut pas exister ?
SELECT
  COUNT(*) FILTER (WHERE birth_time IS NULL AND rising_sign IS NOT NULL) AS fabriques,
  COUNT(*) FILTER (WHERE birth_time IS NULL AND rising_sign = 'Aries')   AS fabriques_aries,
  COUNT(*) FILTER (WHERE birth_time IS NOT NULL)                        AS avec_heure,
  COUNT(*)                                                              AS total
FROM public.profiles;

-- La signature du bug : sans heure de naissance, la distribution devrait être
-- vide. Si 'Aries' représente ~100 % des lignes, le fallback était bien actif.
SELECT rising_sign, COUNT(*)
  FROM public.profiles
 WHERE birth_time IS NULL
 GROUP BY 1
 ORDER BY 2 DESC;
```

### 4.2 Nettoyer

```sql
-- Sans heure de naissance, l'ascendant n'est pas calculable : toute valeur
-- présente a été inventée. Idempotent, et sans effet sur les comptes qui ont
-- une heure de naissance.
UPDATE public.profiles
   SET rising_sign = NULL,
       updated_at  = NOW()
 WHERE birth_time IS NULL
   AND rising_sign IS NOT NULL;
```

```sql
-- Le même mensonge est aussi figé dans le JSONB, où il alimente la synastrie.
UPDATE public.profiles
   SET birth_chart = jsonb_set(birth_chart, '{rising}', 'null'::jsonb),
       updated_at  = NOW()
 WHERE birth_time IS NULL
   AND birth_chart IS NOT NULL
   AND birth_chart -> 'rising' IS NOT NULL
   AND birth_chart -> 'rising' <> 'null'::jsonb;
```

> ⚠️ **Ne pas exécuter avant que le build corrigé soit en production.** Une
> version antérieure de l'app réécrirait `'Aries'` au prochain enregistrement
> d'onboarding.

### 4.3 Après le nettoyage

Une fois `rising_sign` remis à NULL pour ces comptes, le pill Discover se
masque tout seul (`isRisingTrustworthy` refuse une chaîne vide). Pour
**réafficher les vrais ascendants sur Discover**, il faut ensuite ajouter un
signal de confiance à `get_discoverable_profiles` — par exemple une colonne
booléenne `has_birth_time` — et la passer à `isRisingTrustworthy`. C'est une
nouvelle migration + un déploiement, hors périmètre de ce patch.

## 5. Ce qui empêche le bug de revenir

`npm run validate:mobile:retention-guards` (déjà en CI) gagne une section
**P0-5**, qui échoue si :

- un littéral `'Aries'` réapparaît dans `services/astrology.ts` ;
- `placement()` reprend un paramètre `fallback` ;
- `NatalChart.rising` cesse d'être nullable ;
- l'un des motifs `rising || 'Aries'`, `rising ?? 'Aries'`,
  `rising: { sign: 'Aries' }`, `rising_sign: 'Aries'` apparaît dans l'une des
  sept surfaces mobiles concernées ;
- l'onboarding déréférence `chart.rising.sign` sans garde ;
- le reveal cesse de conditionner sa troisième ligne ;
- l'une des quatre surfaces d'affichage cesse de passer par le helper de
  confiance.

Les trois régressions principales ont été rejouées volontairement pour
vérifier que le garde-fou les attrape.

Côté moteur, `packages/shared/src/astrology/__tests__/rising.test.ts` couvre 20
cas, dont un balayage de douze dates de naissance sans heure qui vérifie que
l'ascendant reste `null` à chaque fois.

---

**Voir aussi :** `docs/retention-day2-audit-2026-08.md` §3.5 (diagnostic
d'origine) · `packages/shared/src/astrology/rising.ts` (la règle) ·
`scripts/validate-mobile-retention-guards.mjs` section P0-5 (le garde-fou).
