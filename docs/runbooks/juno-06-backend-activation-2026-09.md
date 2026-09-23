# Rapport d'activation backend — JUNO-06 (PR #69 fusionnée) — 2026-09-23

```
FUSION 491e861 RATIFIÉE · PR #70 FUSIONNÉE (242a2bc)
PHASE 0 : EXÉCUTÉE, VERTE (2026-09-23, projet qtihezzbuubnyvrjdkjd) — les six gates §1quater passent
DÉCOUPAGE M1a / M2 / M1c : APPROUVÉ ET PRÉPARÉ (cette branche porte M1a+M2)
M1c : BROUILLON sous docs/runbooks/sql/ — INTERDITE jusqu'au cycle 131 + autorisation produit dédiée
SYNASTRY free_preview_quota : CONSERVER 1 (décision produit 2026-09-23)
ACTIVATION BACKEND : NON AUTORISÉE — aucune migration appliquée, aucun edge déployé
```

**Statut : PRÉPARÉ — activation bloquée sur la revue des mutations de politique (§1bis). Rien n'est appliqué, rien n'est déployé.** La Phase 0 est un script unique en lecture seule (`docs/runbooks/sql/2026-09-juno-06-phase0-capture.sql`) : ce poste de préparation n'a AUCUN accès base (vérifié : pas de CLI supabase, pas de psql, `.env.local` = clés publiques client uniquement) — la colonne « constaté » de la matrice se remplit depuis sa sortie, qui est la source de vérité du rollback.

Fusion : PR #69 → `master` au merge commit **`491e861`** (head fusionné `9a196ca` = `09961df` + correctif de 4 marqueurs de commentaire ; l'écart est documenté dans la PR, commentaire `5797022290`). CI master verte sur `491e861` (Quality Gates, Gitleaks, CodeQL).

Périmètre de CE rapport : l'activation backend seule — migrations `20260922000001` + `20260922000002`, déploiement des edges `sync-entitlement` et `premium-tarot-reading`. **Hors périmètre** : build Android 131, fermeture de JUNO-06 (le verdict reste 2/11 server-enforced-data, 7/11 server-metered-ui, 2/11 public-content), poursuite des 7 contournables.

---

## 0. Ce que la fusion a mis sur `master` (et ce qu'elle N'a PAS fait)

Sur `master` depuis `491e861` : le code client (gate purgé du lissage RC, écran tarot serveur, flux sync), les deux sources d'edges, les deux migrations, la table de test SQL, les validateurs et leurs canaris. **Aucune base n'a vu ces migrations, aucune fonction n'est déployée** : jusqu'à l'activation ci-dessous, la production se comporte exactement comme avant la fusion (build 130 = dernier client ; les edges n'existent pas à l'URL).

## 1. État distant AVANT mutation — Phase 0 (EXÉCUTÉE, verte, 2026-09-23)

**Exécutée en lecture seule sur le projet `qtihezzbuubnyvrjdkjd`** (script `docs/runbooks/sql/2026-09-juno-06-phase0-capture.sql`, sortie archivée). Les six contrôles de concordance (§1quater) sont **verts** :

| # | Contrôle | Constaté |
|---|---|---|
| 1 | Historique distant | `20260922000001` et `20260922000002` **absentes** (jamais appliquées nulle part) |
| 2 | Catalogue réel | **15 lignes, conforme à la reconstruction versionnée** |
| 3 | synastry | `celestial / daily_quota 20 / free_preview_quota 1` ✔ |
| 4 | Objets M1a/M2 | colonne `enforcement_class` **absente** ; table `entitlement_sync_claims` **absente** ; edges `sync-entitlement` et `premium-tarot-reading` **absents** |
| 5 | Télémétrie | agrégats `premium_usage` et `subscriptions` archivés, sans PII |
| 6 | Secret | nom `REVENUECAT_API_KEY` présent, valeur jamais consultée |

**Conséquence juridique-opératoire** : la prémisse « migration fusionnée mais jamais appliquée » est PROUVÉE — l'amendement de `20260922000001` en M1a est donc légitime ; la règle d'arrêt (§1quater gate 1) reste gravée pour l'avenir.

**Historique de fusion** : PR #69 → `491e861` (ratifiée) ; PR documentaire #70 → `242a2bc`. Aucune migration ni Edge déployés à ce jour.

**Script unique** : `docs/runbooks/sql/2026-09-juno-06-phase0-capture.sql` (transaction + ROLLBACK ; aucune écriture possible même par accident ; aucune valeur secrète, aucune PII — les volumes `premium_usage` sont des agrégats par clé). Sortie à archiver avec ce rapport.

Valeurs « attendues » ci-dessous **reconstruites depuis l'historique versionné** (20260419000006 → 20260915000001). Toute divergence capture/attendu = **ARRÊT avant M1** (JUNO-15).

**Synastry — divergence réglée par décision produit (2026-09-23)** : `20260915000001` a posé `free_preview_quota = 1` (son rollback vers NULL est documenté comme une opération manuelle, jamais exécutée par une migration). **Décision : CONSERVER 1** — l'état existant, le choix le moins régressif ; le passage à NULL supprimerait un aperçu existant et exigerait une décision produit distincte. Conséquences : M1a n'y touche pas (classification seule) ; **M1c, quand elle sera autorisée, doit préserver p=1** (l'upsert synastry y perd son `free_preview_quota = NULL`) ; le self-check de M1a/M1c s'attend à 1 ; le rollback restaure 1. La capture (P0-1d) VÉRIFIE live=1 — toute autre valeur = arrêt.

### 1quater. Contrôles de concordance post-capture (obligatoires avant TOUTE migration)

| # | Contrôle | Source | Attendu | Si divergent |
|---|---|---|---|---|
| 1 | Historique distant : `20260922000001`/`0002` **jamais appliquées** | P0-0 | 0 ligne | **ARRÊT IMMÉDIAT** — l'amendement de la migration fusionnée n'est acceptable QUE si elle n'a tourné nulle part ; sinon migration corrective NOUVELLE, jamais réécrire l'ancienne |
| 2 | Catalogue réel vs reconstruction historique | P0-1b vs matrice §1bis colonne « Prod » | égalité exacte | Arrêt — JUNO-15 (le dépôt n'est pas l'état) ; documenter l'écart, re-décider |
| 3 | `synastry.free_preview_quota = 1` | P0-1d | `1 / OK` | Arrêt — divergence à arbitrer avant tout |
| 4 | Objets M1a/M2 absents (colonne `enforcement_class`, table `entitlement_sync_claims`) | P0-2, P0-3 | 0 / 0 | Arrêt — quelqu'un a muté sans trace ; auditer |
| 5 | Agrégats `premium_usage` par clé | P0-4 | archivé (baseline télémétrie) | — (valeur de référence, pas un gate binaire) |
| 6 | Nom `REVENUECAT_API_KEY` présent, valeur jamais affichée | commandes en pied du script | présent | Arrêt si absent (E1 le requerra ; à provisionner avant activation) |

**Gates verts 1→6 ⇒ la PR code suivante peut être ouverte** (voir §1ter, mise en œuvre) — pas avant.

### 1bis. Matrice des mutations, clé par clé (la revue demandée)

Colonnes : Prod = état attendu avant M1 (**à confirmer par P0-1** ; `q`=daily_quota, `p`=free_preview_quota) · Après M1 = valeur posée par `20260922000001` · 130 = le build Play livré l'utilise-t-il ? (130 mobile n'enforce que `natal_chart`+`conversation_guide` ; les 9 autres y sont client-gated) · Web = le site livré l'enforce-t-il ? (6 clés, vérifié dans le code) · Effet = changement observable dès M1 appliquée.

| Clé | Prod (attendu) | Après M1 | 130 mobile | Web livré | Effet dès M1 | Classification |
|---|---|---|---|---|---|---|
| natal_chart | celestial q-NULL p1 | idem + classe | **enforce** | **enforce** | aucun (rien ne change hors classe) | sécurité/doc |
| conversation_guide | celestial q100 p1 | idem + classe | **enforce** | **enforce** | aucun | sécurité/doc |
| synastry | celestial q20 **p=1 (ratifié — conservé)** | M1a : idem (ne touche pas les politiques) ; M1c : q→NULL, **p reste 1** | client-gated | non (flux dédié `synastry_preview_gate`) | aucun sur clients livrés | normalisation (assouplit) ; **preview 1 conservé, décision produit 2026-09-23** |
| daily_horoscope | celestial q50 p-NULL | q→NULL, p→1 | client-gated | non | aucun sur livrés (inerte jusqu'à 131) | normalisation (assouplit) ; aperçu = produit différé |
| monthly_horoscope | cosmic q-NULL p-NULL | p→1 | client-gated | non | aucun sur livrés | produit différé (131) |
| lucky_days | cosmic q-NULL p-NULL | p→1 | client-gated | non | aucun sur livrés | produit différé (131) |
| planetary_transits | cosmic q-NULL p-NULL | p→1 | client-gated | **enforce** | **+ : compte free web gagne 1 aperçu/jour** (aujourd'hui refus sec) | **changement produit (+)** |
| retrograde_alerts | cosmic q-NULL p-NULL | p→1 | client-gated | **enforce** | **+ : idem web** | **changement produit (+)** |
| date_planner | cosmic q10 p-NULL | p→1 | client-gated | **enforce** | **+ : idem web** | **changement produit (+)** |
| tarot_monthly | celestial q-NULL p-NULL | p→1 | client-gated (jamais enforce tarot) | **enforce** | **+ : idem web** | **changement produit (+)** |
| tarot_cosmic | cosmic q10 p-NULL | p→1 | client-gated | **enforce** | **+ : idem web** | **changement produit (+)** |
| tarot (alias legacy) | cosmic q10 p-NULL | inchangé + classe | non (clients pré-split uniquement) | non | aucun | sécurité/doc |
| compatibility_details | celestial q50 | **DELETE** | non | non | aucun (graine morte) | normalisation sans effet |
| priority_messages | celestial q100 | **DELETE** | non | non | aucun | normalisation sans effet |
| likes_you_see_who | celestial q50 | **DELETE** | non | non | aucun | normalisation sans effet |
| *(colonne enforcement_class)* | absente | 3/7/2 + CHECK | aucun client ne la lit | aucun | aucun | sécurité/doc |

Lignes `premium_usage` existantes par clé : **à consigner depuis P0-4** (agrégat par clé) — elles orientent la décision « garder/archiver+purger » du rollback. **Aucun quota produit n'est réduit nulle part** : les deux mutations de quota (50→NULL, 20→NULL) *assouplissent* ; toutes les mutations de preview *ajoutent* un aperçu ; l'unique retrait potentiel (synastry →NULL) est **écarté par la décision produit 2026-09-23 : conserver 1**.

### 1ter. Découpage de M1 — APPROUVÉ EN PRINCIPE (2026-09-23)

`20260922000001` est fusionnée mais **jamais appliquée nulle part** — elle peut donc être amendée sur master sans historically break (PR code séparée, hors #70 documentaire) :

1. **M1a — classification (sécurité, inerte)** : colonne `enforcement_class` + classes sur les lignes EXISTANTES + filet (lignes inconnues → `server_metered_ui`) + NOT NULL/CHECK + self-check. Aucun client livré ne lit cette colonne ; zéro effet utilisateur ; c'est la partie strictement sécurité/documentation.
2. **M1b — prérequis edges : ∅ côté politiques.** `E1 sync-entitlement` ne nécessite que `M2` (table de claim). `E2 premium-tarot-reading` fonctionne sur le catalogue **actuel** (clés tarot existantes depuis 20260511000002 ; compte free → 402 sans aperçu dépensé = comportement web d'aujourd'hui). Aucune mutation de politique n'est un prérequis au déploiement des deux edges.
3. **M1c — produit : INTERDITE jusqu'au cycle 131 et une autorisation produit dédiée** (décision 2026-09-23). Contenu lorsqu'elle sera autorisé : les 6 upserts (**synastry : q20→NULL, p RESTE 1** — son upsert perd le `free_preview_quota = NULL` de l'ancien draft), les 8 previews=1 (dont les 5 visibles web : +aperçu gratuit/jour), le DELETE des 3 graines mortes. Chaque ligne est classée dans la matrice ci-dessus ; rien n'y réduit un quota ni un aperçu.

Mise en œuvre (PR code, à ouvrir UNIQUEMENT après les six gates verts de §1quater) : amender `20260922000001` → **M1a classification uniquement** (self-checks adaptés : synastry attendu p=1 ; plus de comptes sur des quotas) ; **conserver `20260922000002`** telle quelle (table de claims) ; le contenu M1c vit en **BROUILLON** sous `docs/runbooks/sql/2026-09-juno-06-m1c-product-policies-DRAFT.sql` (bannière NE PAS EXÉCUTER, condition 131 + autorisation produit) — le jour venu il devient une migration NOUVELLE datée du jour, jamais une réédition de 20260922000001 ; **adapter le rollback** (§4 : DROP COLUMN — déjà à jour). Condition d'arrêt rappelée en §1quater gate 1 : si l'historique distant contient 20260922000001/0002, l'amendement est INTERDIT — migration corrective nouvelle.

**Exécution** : tout le contenu (P0-0 historique des migrations, catalogue, absences des objets nouveaux, volumes `premium_usage`, baseline `subscriptions`, contraintes existantes, fonctions déployées, noms de secrets) vit dans **un seul script** : `docs/runbooks/sql/2026-09-juno-06-phase0-capture.sql` — lecture seule VÉRIFIÉE MÉCANIQUEMENT (SELECT + BEGIN/ROLLBACK + métadonnées psql uniquement ; aucun DO/DML/DDL/réseau/fonction mutante/cron), aucune PII, aucune valeur secrète. Sa sortie archivée alimente les **six contrôles de concordance §1quater** — gates obligatoires avant TOUTE migration.

**Constat structurel** (confirmé par relecture de l'historique) : `20260922000001` n'est pas purement additive — les mutations de lignes existantes sont exactement : quotas `daily_horoscope` 50→NULL et `synastry` 20→NULL (assouplissements), previews NULL→1 sur 8 clés (dont 5 visibles immédiatement sur le web livré : transits, rétrogrades, date-planner, tarot×2 — des AJOUTS d'aperçus gratuits), synastry preview →NULL dans l'ancien draft (retrait **écarté** par la décision p=1 conservé), et le DELETE de 3 graines mortes. D'où le découpage §1ter.

## 2. Commandes unitaires prévues (ordre strict ; un gate après chacune)

Jamais `supabase db push` (JUNO-15). Chaque unité s'exécute seule, gate verte, puis la suivante. **M1c n'existe pas dans les migrations** (BROUILLON sous `docs/runbooks/sql/2026-09-juno-06-m1c-product-policies-DRAFT.sql`, condition 131 + autorisation produit) — aucune commande ici ne l'applique.

**Contrat d'application de M1a** (vérifié, revue 2026-09-23) : le mécanisme documenté est `psql -v ON_ERROR_STOP=1 -f <fichier>`, qui exécute le fichier tel quel — le fichier ouvre lui-même sa transaction (`begin;`) et son `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;` est le PREMIER statement qui suit (exigence PostgreSQL : avant toute requête). Sous un éventuel wrapper single-transaction (`psql -1`), le `begin` interne n'émet qu'un avertissement et le `SET TRANSACTION` reste légal (aucune requête avant lui) : l'isolation s'applique. La migration le PROUVE au runtime : son pré-check refuse de courir si l'isolation effective n'est pas `repeatable read` — le snapshot des preuves ne peut pas être silencieusement dégradé.

| # | Commande | Gate |
|---|---|---|
| M1a | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260922000001_juno06_server_enforced_features.sql` | G1 (§3) + l'auto-vérification INTERNE de la migration (snapshot Phase 0 pré-encodé ; classification 15 lignes ; compteurs audités 2/7/2 ; catalogue produit intouché ; zéro ligne utilisateur) |
| M2 | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260922000002_sync_entitlement_throttle.sql` | G2 (§3) |
| T1 | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/juno06_sync_entitlement_claim.test.sql` | NOTICE `4/4 cases green` (transactionnel, ROLLBACK) |
| T2 | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/juno06_server_enforced_features.test.sql` | NOTICE `C1..C11 green` (transactionnel, ROLLBACK — le contrat M1a/M2 en base) |
| E1 | `supabase functions deploy sync-entitlement --project-ref "$REF"` | S1 (§3) — `verify_jwt=true` vient du `config.toml` versionné |
| E2 | `supabase functions deploy premium-tarot-reading --project-ref "$REF"` | S2 (§3) — fonctionnel sur le catalogue ACTUEL (clés tarot existantes depuis 20260511000002) ; les previews des comptes free sont M1c, donc un free reçoit 402 sans aperçu dépensé = comportement web du jour |

Aucun job pg_cron, aucun secret nouveau, aucun webhook à changer. `REVENUECAT_API_KEY` existe déjà (backfill-revenuecat) — vérifié en Phase 0, jamais affiché.

## 3. Postconditions SQL (après chaque unité)

**G1 — après M1a :**
```sql
-- Les 15 classes : compteurs audités 2/7/2 + 4 marqueurs legacy hors compteurs
SELECT enforcement_class, COUNT(*) FROM public.premium_feature_policy
 GROUP BY 1 ORDER BY 1;
-- ATTENDU : server_enforced_data 2 · server_metered_ui 7 · public_content 2
--           legacy_alias 1 (tarot) · legacy_unused 3 (graines mortes)
-- Le catalogue PRODUIT est INTACT (M1a additive) : identique à la capture Phase 0
SELECT feature_key, required_tier, daily_quota, free_preview_quota
  FROM public.premium_feature_policy ORDER BY feature_key;   -- comparer à l'archive
-- synastry reste 1 (décision produit) ; les graines mortes existent toujours
-- (suppression = M1c) ; aucune des 8 clés d'aperçu ne porte preview (M1c)
SELECT feature_key FROM public.premium_feature_policy
 WHERE feature_key = 'synastry' AND free_preview_quota <> 1;         -- 0 ligne
SELECT COUNT(*) FROM public.premium_feature_policy
 WHERE feature_key IN ('compatibility_details','priority_messages','likes_you_see_who');  -- 3
SELECT COUNT(*) FROM public.premium_feature_policy
 WHERE feature_key IN ('daily_horoscope','monthly_horoscope','lucky_days','planetary_transits',
   'retrograde_alerts','date_planner','tarot_monthly','tarot_cosmic')
   AND free_preview_quota IS NOT NULL;                               -- 0 (M1c différée)
```

**G2 — après M2 :**
```sql
SELECT relrowsecurity FROM pg_class WHERE relname='entitlement_sync_claims';  -- true
SELECT has_table_privilege('anon','entitlement_sync_claims','SELECT')         -- false
     , has_table_privilege('authenticated','entitlement_sync_claims','SELECT') -- false
     , has_table_privilege('service_role','entitlement_sync_claims','ALL');    -- true (bypass RLS)
SELECT COUNT(*) FROM public.entitlement_sync_claims;  -- 0 (aucun claim avant E1)
```

**S1 — après E1 (smoke, compte de test gratuit + JWT valide) :**
- POST sans JWT → 401 (le refus vient soit de la plateforme `verify_jwt`, soit du contrôle interne — les deux doivent tenir) ;
- POST avec JWT → soit `synced:true tier:free` (404 RC = honnête), soit 404 RC absent : selon le compte ; **aucun cas ne doit écrire quoi que ce soit dans `subscriptions`** (vérifier `SELECT COUNT(*) FROM subscriptions WHERE user_id='<compte test'>` inchangé vs P0-4) ;
- 2e appel immédiat → 429 `rate_limited` (le claim tient — c'est T1 en vrai) ; la ligne `entitlement_sync_claims` du compte test existe ;
- `supabase functions list` : Verify JWT = true pour les deux.

**S2 — après E2 (smoke) :**
- POST sans JWT → 401 ;
- POST avec JWT compte gratuit → 402 `premium_required` avec raison, **et AUCUNE ligne `premium_usage` pour tarot** (les previews tarot sont M1c — différées : le refus ne dépense rien, c'est le comportement web du jour) ;
- POST JWT payant (compte de test cosmic si disponible) → 200, `reading.cards` = 4 (weekly), une ligne `premium_usage` `reason='ok'` pour `tarot_cosmic` — et **zéro** classe/corpus dans la réponse (c'est une lecture, pas un chart).

## 4. Rollback (ordre inverse ; déterministe, versionné — plus seulement une capture éphémère)

**M1 : script de restauration déterministe** — `docs/runbooks/sql/2026-09-juno-06-rollback-m1-catalog.sql` : valeurs reconstruites depuis l'historique versionné (pas une capture), inspectable AVANT M1, sans données utilisateur, **auto-vérifié** (refuse de committer si le catalogue restauré ≠ attendu ; un unique point de décision explicite : la ligne synastry). La capture P0-1 ne sert plus de source de restauration mais de **VÉRIFICATION** de la reconstruction — divergence = arrêt avant M1.

**R-E2 / R-E1 — edges** (aucun client installé ne les appelle ; le code fusionné n'est pas livré) :
```bash
supabase functions delete premium-tarot-reading --project-ref "$REF"
supabase functions delete sync-entitlement   --project-ref "$REF"
```

**R-T1** — rien (transactionnel, déjà ROLLBACK).

**R-M2 — table technique, sans donnée produit :**
```sql
DROP TABLE IF EXISTS public.entitlement_sync_claims;
-- Puis re-vérifier : la table n'existe plus, les grants partent avec elle.
```

**R-M1a — exactement l'inverse de M1a : retirer la colonne.** Le catalogue produit n'a JAMAIS bougé (M1a est strictement additive, prouvé par son propre self-check) — il n'y a **rien à restaurer**, et l'ancien script de restauration complète est retiré : il aurait MUTÉ le catalogue pendant un rollback. Script déterministe : `docs/runbooks/sql/2026-09-juno-06-rollback-m1-catalog.sql` — `DROP COLUMN IF EXISTS enforcement_class`, puis auto-vérification que le catalogue est toujours le snapshot Phase 0 (15 lignes, synastry p=1) : la preuve que rien d'autre n'a muté entre-temps. Sans donnée utilisateur.

**Télémétrie écrite entre activation et rollback** (`premium_usage` des clés nouvellement enforcees) : compter par clé et **DÉCIDER** — garder (télémétrie honnête) ou archiver+purger. Jamais rien en silence.

**Non-réversible sans archive** : rien. Les lignes `premium_usage` écrites entre-temps sont des faits ; le rollback les laisse en place et le rapport d'exécution en consigne le volume.

## 5. Après activation — quoi surveiller

- `premium_usage` : les premières lignes `tarot_cosmic`/`tarot_monthly` — **`reason='ok'` uniquement tant que M1c n'est pas appliquée** (les previews tarot sont différées : un compte free reçoit 402 SANS dépense ; les lignes `free_preview` n'apparaîtront qu'après M1c) — et tant que le build 130 est le seul client, **zéro appel est aussi le comportement attendu** (130 n'appelle pas ces edges) ;
- `entitlement_sync_claims` : croît seulement si un opérateur teste E1 ou après le build 131 ;
- logs edges : `outcome=` uniquement (aucun corps RC, aucune clé — structuré par les tests) ;
- avertissement : tout déploiement POSTÉRIEUR de `sync-entitlement` sans M2 appliquée répond `state_unavailable` 503 fail-closed (sûr mais inutile) — l'ordre M1a→M2→E1/E2 est contraignant.

## 6. Télémétrie historique — variantes de clés et mapping canonique (décision 2026-09-23)

**Constat.** `premium_usage.feature_key` contient historiquement DEUX formes pour la même fonctionnalité : la forme **soulignée** (clé de politique, écrite par le serveur via `enforce_premium_feature`/`increment_feature_usage` quand l'appelant passe la clé canonique) et la forme **tiretée** (le `FeatureKey` client, écrite par l'ancien chemin d'essai local qui lisait/comptait avec sa propre clé — la source exacte du bug d'aperçu documenté dans `validate-premium-gating.mjs`). Variantes connues à ce jour :

| Forme canonique (politique) | Variantes historiques observées |
|---|---|
| `planetary_transits` | `planetary-transits` |
| `retrograde_alerts` | `retrograde-alerts` |
| `tarot_cosmic` | `weekly-tarot`, `tarot` (pré-split) |
| `tarot_monthly` | `monthly-tarot`, `tarot` (pré-split) |
| `natal_chart` | `natal-chart` |
| `conversation_guide` | `conversation-guide` |
| (toutes les autres clés) | leur homologue tiretée |

**Décision — mapping canonique pour les NOUVELLES écritures** : la **clé de politique soulignée**, uniquement. Ancrage : `enforce_premium_feature`/`can_use_premium_feature` écrivent `p_feature_key` tel quel (20260823000001, l.171) — c'est donc l'APPELANT qui doit passer la canonique ; le contrat est garanti côté clients par `SERVER_ENFORCED_FEATURES` (chaque `FeatureKey` client est mappé vers la clé de politique, exhaustivité vérifiée par `validate:premium-gating`) et par le Conversation Guide (les deux plateformes passent le littéral souligné, ex. `SERVER_FEATURE_KEY = 'conversation_guide'`). L'alias `tarot` reste appelable par les clients pré-split (contrat 130) : ses lignes `premium_usage` se lisent comme du `tarot_monthly` historique, à destination d'analyse seulement.

**Règles.**
1. **Aucune migration d'historique dans cette PR** — les lignes existantes (les deux formes) sont des faits ; ne rien réécrire, ne rien supprimer.
2. **Aucun compteur ne fusionne silencieusement deux formes** : toute requête d'analyse qui veut agréger une fonctionnalité doit either filtrer la forme canonique seule (recommandé : les nouvelles écritures sont canoniques) ou agréger explicitement les deux formes **avec la décision documentée dans la requête** (commentaire SQL citant cette section). Le doc `docs/conversation-guide-telemetry.md` interroge `conversation_guide` (canonique) — inchangé.
3. La liste des variantes ci-dessus vit ICI : toute nouvelle variante découverte la complète (aucune table de mapping en base — ce serait une deuxième vérité).
