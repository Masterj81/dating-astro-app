# L'ascendant fabriqué — correctif et données historiques

**Statut :** clos.

- **29 août 2026** — correctif client mobile (build 122).
- **30 août 2026** — invariant posé en base + réparation des lignes
  historiques (`20260830000001`), **appliqué en production**. Mesuré :
  **17 comptes** portaient un ascendant fabriqué ; **93 ascendants réels**
  conservés intacts ; 0 violation restante.
- **30 août 2026** — audit des surfaces **web**, qui a révélé un second
  fabricateur, plus discret (§4 bis), et permis de relâcher la règle
  d'affichage devenue trop stricte (§4 ter).

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
| **Discover, chat, fiche publique** | seulement la colonne — `get_discoverable_profiles` ne renvoie ni `birth_time` ni `birth_chart` | voir §4 ter : la colonne porte désormais sa propre preuve |

> **Cette section décrit l'état du 29 août**, avant que la base ne garantisse
> l'invariant. À ce moment-là, sur Discover, aucun ascendant n'était
> démontrable et **tous** étaient masqués, y compris les 93 vrais. C'était le
> sens d'erreur choisi — masquer un vrai ascendant coûte une ligne sur une
> fiche et se répare ; en afficher un faux, c'est JUNO qui énonce une fausseté
> sur quelqu'un.
>
> Le trigger du 30 août a supprimé ce compromis : **§4 ter** explique pourquoi
> un signe nu suffit maintenant, et à quelle condition.

## 4. Nettoyage des données historiques

> **Mise à jour du 30 août 2026.** Le nettoyage n'est plus un runbook manuel à
> exécuter « quand le déploiement Play aura atterri ». Il est devenu la
> migration **`20260830000001_enforce_rising_requires_birth_time.sql`**, qui
> pose d'abord un trigger `BEFORE INSERT OR UPDATE` sur `profiles` puis répare
> les lignes dans la même transaction.
>
> **Pourquoi ce changement.** Le nettoyage seul n'était sûr qu'une fois qu'aucun
> ancien build ne pouvait plus écrire — et « publié sur Play » n'est pas ce
> moment-là : le déploiement s'étale sur plusieurs jours et les lecteurs
> mettent à jour quand ils veulent. Un utilisateur resté en 121 qui repasse par
> l'onboarding repolluait sa propre ligne, sans que rien ne le signale. Le
> trigger supprime la course : l'invariant est tenu là où vivent les données,
> donc la réparation peut tourner tout de suite et rester vraie.
>
> Le trigger **assainit au lieu de rejeter** (il met `rising_sign` à NULL
> plutôt que de lever une exception). Une contrainte `CHECK` ferait échouer
> l'enregistrement d'onboarding sur les anciens builds — une alerte d'erreur au
> moment précis où on demande à un nouveau lecteur de faire confiance à l'app,
> à propos d'un champ qu'on lui a présenté comme facultatif.
>
> Il nettoie aussi `birth_chart -> 'rising'`, pas seulement la colonne : c'est
> le JSONB que lit la synastrie, et le laisser continuerait d'alimenter un
> score « premières impressions » calculé sur un placement inexistant.
>
> **Aucun nouveau build mobile n'est nécessaire** pour l'appliquer.
>
> Les requêtes ci-dessous restent utiles : §4.1 pour mesurer l'ampleur avant
> d'appliquer, §4.2 comme trace de ce que fait la migration.

Les requêtes de mesure sont en lecture seule et peuvent être exécutées
immédiatement, avant toute décision.

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

> ✅ **Plus besoin d'attendre.** Ces deux `UPDATE` sont désormais inclus dans
> `20260830000001_enforce_rising_requires_birth_time.sql`, après le trigger qui
> rend la re-pollution impossible. Les exécuter à la main reste sans danger
> (ils sont idempotents), mais c'est redondant une fois la migration
> appliquée.
>
> **Aucun email ne part pendant le nettoyage.** Les deux triggers `AFTER
> UPDATE` sur `profiles` — `trigger_send_welcome_email` et
> `trigger_schedule_onboarding_emails` — sont gardés sur la transition
> `onboarding_completed` FALSE→TRUE. Ces `UPDATE` ne touchent que
> `rising_sign`, `birth_chart` et `updated_at`, donc la garde ne s'ouvre
> jamais. Vérifié avant application.

### 4.2 bis — La migration se vérifie elle-même

Pas de bloc à décommenter et à recoller à la main : la migration se termine par
deux `DO $$` qui tournent **dans la même transaction** que la réparation.

1. **Postcondition.** Compte les lignes qui violent encore l'invariant — colonne
   et JSONB. S'il en reste une seule, `RAISE EXCEPTION` et **toute la migration
   est annulée**. Une application partielle ne peut pas passer pour une
   application propre. En cas de succès, un `RAISE NOTICE` indique combien de
   comptes n'ont pas d'heure de naissance.
2. **Présence du trigger.** Lit `pg_trigger` pour confirmer qu'il est attaché
   à `public.profiles`, rattaché à la bonne fonction, et **non désactivé**
   (`tgenabled = 'D'`) — un trigger désactivé laisserait l'invariant sans
   protection tout en ayant l'air installé.

C'est une lecture du catalogue, pas une écriture. Une version antérieure faisait
la preuve comportementale (un `UPDATE ... 'Aries'` sur une vraie ligne), mais
cela revenait à écrire sur le compte d'un utilisateur uniquement pour se tester,
et à bousculer son `updated_at` sans raison produit.

> ⚠️ **L'éditeur SQL de Supabase n'affiche pas les `RAISE NOTICE`.** Appliquée
> par copier-coller, la migration ne montre que « Success, no rows returned » —
> ce qui est le succès attendu, mais n'apprend rien. C'est pourquoi elle se
> termine par un `SELECT` **après le `commit;`** : c'est le seul canal que
> cette UI rende. `violations_column` et `violations_chart` doivent valoir 0 ;
> `repaired_now` donne l'ampleur du bug.
>
> Si tu l'as appliquée avant l'ajout de ce `SELECT`, le chiffre reste
> récupérable : les lignes réparées partagent le même `updated_at` à la
> microseconde près, puisque `NOW()` est constant dans une transaction.
>
> ```sql
> SELECT updated_at, COUNT(*) AS lignes_reparees
>   FROM public.profiles
>  WHERE birth_time IS NULL
>  GROUP BY updated_at
>  ORDER BY updated_at DESC
>  LIMIT 5;
> ```
>
> Et la preuve vivante que la re-pollution est impossible, sans rien laisser
> derrière :
>
> ```sql
> BEGIN;
>   UPDATE public.profiles SET rising_sign = 'Aries' WHERE birth_time IS NULL;
>   SELECT COUNT(*) AS doit_valoir_zero
>     FROM public.profiles
>    WHERE birth_time IS NULL AND rising_sign IS NOT NULL;
> ROLLBACK;
> ```

### 4.2 ter — La preuve comportementale, elle, est un test

`supabase/tests/rising_requires_birth_time.test.sql`, sur le modèle de
`free_preview_quota.test.sql` : ses propres fixtures, tout dans une transaction
qui finit par `ROLLBACK`, aucune ligne laissée derrière.

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rising_requires_birth_time.test.sql
```

Neuf assertions : INSERT sans heure, Soleil et Lune préservés, UPDATE de
re-pollution par un ancien client, JSONB assaini sans abîmer le reste du thème,
**ascendant réel conservé**, retrait de l'heure qui rétracte l'ascendant, thème
legacy sans clé `rising` laissé intact, `birth_chart` scalaire toléré sans
erreur, et l'invariant global sur toute la table.

### 4.3 Après le nettoyage

Une fois `rising_sign` remis à NULL pour ces comptes, le pill Discover se
masque tout seul (`isRisingTrustworthy` refuse une chaîne vide). Pour
**réafficher les vrais ascendants sur Discover**, il faut ensuite ajouter un
signal de confiance à `get_discoverable_profiles` — par exemple une colonne
booléenne `has_birth_time` — et la passer à `isRisingTrustworthy`. C'est une
nouvelle migration + un déploiement, hors périmètre de ce patch.

## 4 bis. Le web — audité après coup, et il fabriquait aussi

Le premier correctif ne couvrait que les surfaces **mobile**. Le web lit lui
aussi `rising_sign`, et l'audit a trouvé pire que le repli Bélier.

### Ce que le nettoyage a rendu vivant

`NatalChartOverview.tsx` contenait :

```ts
const SIGNS = ["Aries", "Taurus", /* … */];
function getFallbackSign(seed: number) { return SIGNS[seed % SIGNS.length]; }
// …
sign: picks[index] || getFallbackSign(baseSeed + index * 3)
```

Un signe dérivé de la **longueur de quelques chaînes**, appliqué à *toute*
placement manquante — ascendant, Mercure, Vénus, Mars, Jupiter, Saturne.

Il est resté largement dormant tant que le bug mobile remplissait
`rising_sign` avec `'Aries'` : `picks[index]` était toujours truthy. **La
migration a mis ces colonnes à NULL, ce qui lui aurait livré 99 comptes pour
lesquels inventer un ascendant.** Corriger la base a activé ce repli-là.

Et il était plus insidieux que le Bélier : un signe *varié* et plausible ne
laisse aucun motif détectable. Personne ne l'aurait remarqué.

`getFallbackSign` et la liste `SIGNS` sont supprimés. Une placement absente est
maintenant **retirée**, jamais dérivée.

### Ce qui a changé sur les autres surfaces web

| Surface | Avant | Après |
|---|---|---|
| `NatalChartOverview` | signe inventé par hash | placement retirée ; ascendant conditionné à `birth_time` |
| `DiscoverOverview` (ligne de signes + tuile) | `"?"` sur la fiche d'un inconnu | pill masqué, séparateurs recalculés |
| `AccountProfileWorkspace` (profil perso) | `"?"` | phrase actionnable (`revealRefineMissingTime`) |
| `SynastryOverview` | colonne brute des deux côtés | `resolveTrustedRisingSign` des deux côtés |

`npm run validate:web-onboarding` passe de 50 à **63 checks** avec une section
« no invented placements ». Deux régressions ont été rejouées volontairement
pour vérifier qu'elle les attrape.

## 4 ter. Le trigger a changé ce qui compte comme preuve

Tant que la base pouvait contenir des ascendants fabriqués,
`isRisingTrustworthy` refusait un signe nu : sur Discover, le chat et les
fiches publiques, `get_discoverable_profiles` ne renvoie ni `birth_time` ni
`birth_chart`, donc rien n'était démontrable et **tous** les ascendants étaient
masqués, y compris les 93 vrais.

La migration change cela. La base garantit désormais :

```
birth_time IS NULL  ⟹  rising_sign IS NULL
```

dont la contraposée est ce qui compte ici :

```
rising_sign IS NOT NULL  ⟹  birth_time IS NOT NULL
```

Un signe stocké **porte donc sa propre preuve**. La règle a été relâchée en
conséquence : un signe nu suffit, sauf si quelque chose le **contredit**
(`birth_time` visible et vide, chart annonçant `rising: null` ou
`confidence: 'low'`). Les vrais ascendants réapparaissent partout, sans
toucher au RPC ni ajouter de migration.

> ⚠️ **Cette relaxation dépend du trigger.** S'il est supprimé ou désactivé,
> un signe nu ne prouve plus rien et la règle 5 de `rising.ts` doit revenir à
> `false`. Le test `rising_requires_birth_time.test.sql` existe pour que la
> suppression échoue bruyamment, et l'assertion « accepts a bare sign » dans
> `rising.test.ts` nomme explicitement ce lien.

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

---

## 6. Ce qui reste fabriqué, et qui n'est pas dans ce patch

Un seul reliquat identifié, nommé ici pour qu'il ne se perde pas.

**`degree` et `house` sur le thème natal web** (`NatalChartOverview.tsx`) sont
toujours dérivés d'une longueur de chaîne :

```ts
degree: ((baseSeed + index * 7) % 29) + 1,
house:  ((baseSeed + index * 2) % 12) + 1,
```

C'est de la précision décorative de la même famille que les « 82 % d'énergie
globale » et les numéros chanceux retirés lors de la réécriture V2 de Daily
Reflection, et cela mérite le même traitement. La différence avec l'ascendant :
un degré décoratif à côté d'un signe **réel** est une exagération de précision,
tandis qu'un signe inventé est une affirmation fausse sur la personne. Le
second était urgent ; le premier ne l'est pas.

Le vrai correctif n'est pas de masquer ces valeurs mais de les calculer : les
degrés réels existent déjà dans `birth_chart.planets.<planet>.degree`, et les
maisons demandent une heure de naissance — donc `houses: null` sans elle,
exactement comme l'ascendant. Chantier distinct.
