# Rapport d'activation backend — JUNO-06 (PR #69 fusionnée) — 2026-09-23

```
FUSION 491e861 RATIFIÉE
PHASE 0 LECTURE SEULE AUTORISÉE
ACTIVATION BACKEND BLOQUÉE SUR LA REVUE DES MUTATIONS DE POLITIQUE
```

**Statut : PRÉPARÉ — activation bloquée sur la revue des mutations de politique (§1bis). Rien n'est appliqué, rien n'est déployé.** La Phase 0 est un script unique en lecture seule (`docs/runbooks/sql/2026-09-juno-06-phase0-capture.sql`) : ce poste de préparation n'a AUCUN accès base (vérifié : pas de CLI supabase, pas de psql, `.env.local` = clés publiques client uniquement) — la colonne « constaté » de la matrice se remplit depuis sa sortie, qui est la source de vérité du rollback.

Fusion : PR #69 → `master` au merge commit **`491e861`** (head fusionné `9a196ca` = `09961df` + correctif de 4 marqueurs de commentaire ; l'écart est documenté dans la PR, commentaire `5797022290`). CI master verte sur `491e861` (Quality Gates, Gitleaks, CodeQL).

Périmètre de CE rapport : l'activation backend seule — migrations `20260922000001` + `20260922000002`, déploiement des edges `sync-entitlement` et `premium-tarot-reading`. **Hors périmètre** : build Android 131, fermeture de JUNO-06 (le verdict reste 2/11 server-enforced-data, 7/11 server-metered-ui, 2/11 public-content), poursuite des 7 contournables.

---

## 0. Ce que la fusion a mis sur `master` (et ce qu'elle N'a PAS fait)

Sur `master` depuis `491e861` : le code client (gate purgé du lissage RC, écran tarot serveur, flux sync), les deux sources d'edges, les deux migrations, la table de test SQL, les validateurs et leurs canaris. **Aucune base n'a vu ces migrations, aucune fonction n'est déployée** : jusqu'à l'activation ci-dessous, la production se comporte exactement comme avant la fusion (build 130 = dernier client ; les edges n'existent pas à l'URL).

## 1. État distant AVANT mutation — Phase 0 (lecture seule, autorisée)

**Script unique** : `docs/runbooks/sql/2026-09-juno-06-phase0-capture.sql` (transaction + ROLLBACK ; aucune écriture possible même par accident ; aucune valeur secrète, aucune PII — les volumes `premium_usage` sont des agrégats par clé). Sortie à archiver avec ce rapport.

Valeurs « attendues » ci-dessous **reconstruites depuis l'historique versionné** (20260419000006 → 20260915000001). Toute divergence capture/attendu = **ARRÊT avant M1** (JUNO-15).

**⚠ Divergence CONNUE à arbitrer en premier — `synastry.free_preview_quota`** : `20260915000001` l'a posée à `1` (son rollback vers NULL y est documenté comme *opérationnel*, exécuté à la main — aucune migration ne l'a fait). `20260922000001` asserte `NULL` et son `ON CONFLICT DO UPDATE` l'**écraserait activement** à `NULL` si le live est `1`. Si P0-1 montre `1` : M1 s'auto-refuse à son self-check, et le choix NULL-ou-1 doit être pris **explicitement** (conception : l'aperçu synastrie est un contrat par-cible dans `synastry_free_grant`, pas dans `premium_usage` — mais écraser une valeur live est une décision, jamais un effet de bord).

### 1bis. Matrice des mutations, clé par clé (la revue demandée)

Colonnes : Prod = état attendu avant M1 (**à confirmer par P0-1** ; `q`=daily_quota, `p`=free_preview_quota) · Après M1 = valeur posée par `20260922000001` · 130 = le build Play livré l'utilise-t-il ? (130 mobile n'enforce que `natal_chart`+`conversation_guide` ; les 9 autres y sont client-gated) · Web = le site livré l'enforce-t-il ? (6 clés, vérifié dans le code) · Effet = changement observable dès M1 appliquée.

| Clé | Prod (attendu) | Après M1 | 130 mobile | Web livré | Effet dès M1 | Classification |
|---|---|---|---|---|---|---|
| natal_chart | celestial q-NULL p1 | idem + classe | **enforce** | **enforce** | aucun (rien ne change hors classe) | sécurité/doc |
| conversation_guide | celestial q100 p1 | idem + classe | **enforce** | **enforce** | aucun | sécurité/doc |
| synastry | celestial q20 **p1-ou-NULL ⚠** | q→NULL, p→**NULL** ⚠ | client-gated | non (flux dédié `synastry_preview_gate`) | aucun sur clients livrés ; ⚠ écrasement possible | normalisation (assouplit) + **⚠ décision produit** |
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

Lignes `premium_usage` existantes par clé : **à consigner depuis P0-4** (agégat par clé) — elles orientent la décision « garder/archiver+purger » du rollback. **Aucun quota produit n'est réduit nulle part** : les deux mutations de quota (50→NULL, 20→NULL) *assouplissent* ; toutes les mutations de preview *ajoutent* un aperçu — sauf le cas ⚠ synastry, seul retrait potentiel, à décider explicitement.

### 1ter. Découpage proposé de M1 (l'application du principe « pas de quota produit implicite sous couvert de sécurité »)

`20260922000001` est fusionnée mais **jamais appliquée nulle part** — elle peut donc être amendée sur master sans historically break (PR code séparée, hors #70 documentaire) :

1. **M1a — classification (sécurité, inerte)** : colonne `enforcement_class` + classes sur les lignes EXISTANTES + filet (lignes inconnues → `server_metered_ui`) + NOT NULL/CHECK + self-check. Aucun client livré ne lit cette colonne ; zéro effet utilisateur ; c'est la partie strictement sécurité/documentation.
2. **M1b — prérequis edges : ∅ côté politiques.** `E1 sync-entitlement` ne nécessite que `M2` (table de claim). `E2 premium-tarot-reading` fonctionne sur le catalogue **actuel** (clés tarot existantes depuis 20260511000002 ; compte free → 402 sans aperçu dépensé = comportement web d'aujourd'hui). Aucune mutation de politique n'est un prérequis au déploiement des deux edges.
3. **M1c — produit (différé, autorisation séparée, calé sur 131)** : les 6 upserts (dont synastry q20→NULL et ⚠ preview), les 8 previews=1 (dont les 5 visibles web : +aperçu gratuit/jour), le DELETE des 3 graines mortes. Chaque ligne est classée dans la matrice ci-dessus ; rien n'y réduit un quota.

Mise en œuvre proposée (sur approbation) : amender `20260922000001` → M1a seule ; créer `20260924000003_juno06c_product_policies.sql` portant M1c, en-tête « NE PAS APPLIQUER sans autorisation produit explicite ».

**Exécution** : tout le contenu P0-1 → P0-6 (catalogue, absences des objets nouveaux, volumes `premium_usage`, baseline `subscriptions`, contraintes existantes, fonctions déployées, noms de secrets) vit dans **un seul script** : `docs/runbooks/sql/2026-09-juno-06-phase0-capture.sql` — lecture seule, transaction + ROLLBACK, aucune PII, aucune valeur secrète. Sa sortie archivée : (a) remplit la colonne « constaté » de la matrice §1bis, (b) vérifie la reconstruction du script de rollback §4, (c) arbitre le cas synastry.

**Constat structurel** (confirmé par relecture de l'historique) : `20260922000001` n'est pas purement additive — les mutations de lignes existantes sont exactement : quotas `daily_horoscope` 50→NULL et `synastry` 20→NULL (assouplissements), previews NULL→1 sur 8 clés (dont 5 visibles immédiatement sur le web livré : transits, rétrogrades, date-planner, tarot×2 — des AJOUTS d'aperçus gratuits), ⚠ synastry preview →NULL (seul retrait potentiel), et le DELETE de 3 graines mortes. D'où le découpage §1ter.

## 2. Commandes unitaires prévues (ordre strict ; un gate après chacune)

Jamais `supabase db push` (JUNO-15). Chaque unité s'exécute seule, gate verte, puis la suivante.

| # | Commande | Gate |
|---|---|---|
| M1 | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260922000001_juno06_server_enforced_features.sql` | G1 (§3) — l'auto-vérification interne DOIT aussi passer (elle refuse tout autre catalogue que 3/7/2) |
| M2 | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260922000002_sync_entitlement_throttle.sql` | G2 (§3) |
| T1 | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/juno06_sync_entitlement_claim.test.sql` | NOTICE finale `4/4 cases green` (script transactionnel, ROLLBACK — ne laisse rien) |
| E1 | `supabase functions deploy sync-entitlement --project-ref "$REF"` | S1 (§3) — `verify_jwt=true` vient du `config.toml` versionné |
| E2 | `supabase functions deploy premium-tarot-reading --project-ref "$REF"` | S2 (§3) — **après M1** (sans les previews posées par M1, un compte gratuit recevrait 402 sans jamais avoir son aperçu) |

Aucun job pg_cron, aucun secret nouveau, aucun webhook à changer. `REVENUECAT_API_KEY` existe déjà (backfill-revenuecat) — vérifié en P0-6, jamais affiché.

## 3. Postconditions SQL (après chaque unité)

**G1 — après M1 :**
```sql
-- Comptes de classes, bornés au catalogue connu (12 lignes = 11 features + alias)
SELECT enforcement_class, COUNT(*) FROM public.premium_feature_policy
 WHERE feature_key IN ('natal_chart','conversation_guide','synastry','daily_horoscope',
   'monthly_horoscope','lucky_days','planetary_transits','retrograde_alerts',
   'date_planner','tarot_monthly','tarot_cosmic','tarot')
 GROUP BY 1 ORDER BY 1;
-- ATTENDU : public_content 2, server_enforced_data 3, server_metered_ui 7
SELECT COUNT(*) FROM public.premium_feature_policy
 WHERE feature_key IN ('compatibility_details','priority_messages','likes_you_see_who');  -- 0
SELECT feature_key FROM public.premium_feature_policy
 WHERE feature_key IN ('daily_horoscope','monthly_horoscope','lucky_days','planetary_transits',
   'retrograde_alerts','date_planner','tarot_monthly','tarot_cosmic')
   AND free_preview_quota IS DISTINCT FROM 1;  -- ATTENDU 0 ligne
-- Contrat 130 intact : natal_chart/conversation_guide/tarot inchangés (comparer à P0-1)
SELECT feature_key, required_tier, daily_quota FROM public.premium_feature_policy
 WHERE feature_key IN ('natal_chart','conversation_guide','tarot');
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
- POST avec JWT compte gratuit → 402 `premium_required` AVEC raison, **et** `premium_usage` gagne exactement UNE ligne free_preview pour `tarot_monthly` (l'aperçu est dépensé par LA décision de l'edge — un seul enforce) ;
- même appel juste après → 402 `free_preview_exhausted` ;
- POST JWT payant (compte de test cosmic si disponible) → 200, `reading.cards` = 4 (weekly) — et **zéro** `enforcement_class`/corpus dans la réponse (c'est une lecture, pas un chart).

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

**R-M1 — restauration du catalogue à la capture P0-1** (ordre : colonne, lignes créées, lignes modifiées, graines mortes) :
```sql
BEGIN;
ALTER TABLE public.premium_feature_policy DROP COLUMN IF EXISTS enforcement_class;

-- Lignes créées par M1 (n'existaient pas en P0-1) : vérifier contre P0-1 d'abord.
-- Les 7 clés legacy EXISTAIENT (20260419000006) : ne PAS les supprimer, les RESTAURER :

-- 1) restaurer les quotas/previews vers les valeurs P0-1, ex. (adapter au capturé) :
UPDATE public.premium_feature_policy SET daily_quota=50, free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='daily_horoscope';
UPDATE public.premium_feature_policy SET daily_quota=20, free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='synastry';
UPDATE public.premium_feature_policy SET daily_quota=10, free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='tarot_cosmic';
UPDATE public.premium_feature_policy SET daily_quota=10, free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='date_planner';
-- (monthly_horoscope, lucky_days, planetary_transits, retrograde_alerts, tarot_monthly : idem, valeurs P0-1)

-- 2) ressemer les graines mortes SI le produit les veut (elles étaient mortes —
--    décision à prendre, pas à automatiser) :
-- INSERT INTO public.premium_feature_policy (feature_key, required_tier, daily_quota) VALUES
--   ('compatibility_details','celestial',50), ('priority_messages','celestial',100),
--   ('likes_you_see_who','celestial',50);

-- 3) Télémétrie écrite entre M1 et le rollback (premium_usage des nouvelles clés) :
--    compter (SELECT feature_key, COUNT(*) …) et DÉCIDER — garder (télémétrie honnête)
--    ou purger (INSERT … SELECT pour archive, puis DELETE). Ne rien faire en silence.
COMMIT;
```

**Non-réversible sans archive** : rien. Les aperçus dépensés entre activation et rollback (`premium_usage`) sont des faits produits ; le rollback les laisse en place par défaut et le rapport d'exécution en consigne le volume.

## 5. Après activation — quoi surveiller

- `premium_usage` : les premières lignes `tarot_monthly`/`tarot_cosmic` avec `reason='free_preview'` (preuves que l'edge décide) — tant que le build 130 est le seul client, **zéro appel est aussi le comportement attendu** (130 n'appelle pas ces edges) ;
- `entitlement_sync_claims` : croît seulement si un opérateur teste E1 ou après le build 131 ;
- logs edges : `outcome=` uniquement (aucun corps RC, aucune clé — structuré par les tests) ;
- avertissement : tout déploiement POSTÉRIEUR de `sync-entitlement` sans M2 appliquée répond `state_unavailable` 503 fail-closed (sûr mais inutile) — l'ordre M1→M2→E1/E2 est contraignant.
