# Rapport d'activation backend — JUNO-06 (PR #69 fusionnée) — 2026-09-23

**Statut : PRÉPARÉ — en attente d'autorisation de déploiement. Rien n'est appliqué, rien n'est déployé.**

Fusion : PR #69 → `master` au merge commit **`491e861`** (head fusionné `9a196ca` = `09961df` + correctif de 4 marqueurs de commentaire ; l'écart est documenté dans la PR, commentaire `5797022290`). CI master verte sur `491e861` (Quality Gates, Gitleaks, CodeQL).

Périmètre de CE rapport : l'activation backend seule — migrations `20260922000001` + `20260922000002`, déploiement des edges `sync-entitlement` et `premium-tarot-reading`. **Hors périmètre** : build Android 131, fermeture de JUNO-06 (le verdict reste 2/11 server-enforced-data, 7/11 server-metered-ui, 2/11 public-content), poursuite des 7 contournables.

---

## 0. Ce que la fusion a mis sur `master` (et ce qu'elle N'a PAS fait)

Sur `master` depuis `491e861` : le code client (gate purgé du lissage RC, écran tarot serveur, flux sync), les deux sources d'edges, les deux migrations, la table de test SQL, les validateurs et leurs canaris. **Aucune base n'a vu ces migrations, aucune fonction n'est déployée** : jusqu'à l'activation ci-dessous, la production se comporte exactement comme avant la fusion (build 130 = dernier client ; les edges n'existent pas à l'URL).

## 1. État distant AVANT mutation — capture obligatoire (Phase 0)

À exécuter en lecture seule et **à archiver avec ce rapport** (les valeurs attendues viennent du dépôt ; tout écart = constat à consigner AVANT de muter — leçon JUNO-15 : le dépôt n'est pas forcément l'état).

```sql
-- P0-1  Catalogue complet des politiques (source de vérité du rollback)
SELECT feature_key, required_tier, daily_quota, free_preview_quota, updated_at
  FROM public.premium_feature_policy ORDER BY feature_key;
-- ATTENDU (~19 lignes, valeurs 20260419000006 + 20260511000002 + 20260823000001) :
--   natal_chart celestial 5 (preview 1), conversation_guide celestial …,
--   tarot cosmic 10, tarot_monthly celestial, tarot_cosmic cosmic 10,
--   date_planner cosmic 10, daily_horoscope celestial 50, synastry celestial 20,
--   monthly_horoscope/lucky_days/planetary_transits/retrograde_alerts cosmic NULL,
--   compatibility_details celestial 50, priority_messages celestial 100,
--   likes_you_see_who celestial 50   (super_likes supprimé par 20260429000001)

-- P0-2  La colonne classe n'existe pas encore
SELECT COUNT(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='premium_feature_policy'
   AND column_name='enforcement_class';            -- ATTENDU 0

-- P0-3  La table de claim n'existe pas (et le brouillon retiré non plus)
SELECT COUNT(*) FROM information_schema.tables
 WHERE table_schema='public' AND table_name='entitlement_sync_claims';  -- ATTENDU 0
SELECT COUNT(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='subscriptions'
   AND column_name='last_sync_at';                 -- ATTENDU 0

-- P0-4  Baseline télémétrique (sanity post-activation)
SELECT COUNT(*) AS subs FROM public.subscriptions;
SELECT feature_key, COUNT(*) AS usage_rows
  FROM public.premium_usage GROUP BY feature_key;  -- archive des volumes actuels
```

```bash
# P0-5  Fonctions déployées : les deux edges ABSENTS de la liste
supabase functions list --project-ref "$REF"
# P0-6  Secrets (noms seulement — JAMAIS afficher la valeur)
supabase secrets list --project-ref "$REF" | grep -c REVENUECAT_API_KEY   # ATTENDU 1
```

**Constat structurel à écrire noir sur blanc dans le rapport d'exécution** : `20260922000001` n'est **pas purement additive** — 7 clés existent déjà (graines 20260419000006) et son `ON CONFLICT DO UPDATE` les **modifie** (`daily_quota` 50/20/… → NULL, preview → 1). C'est voulu (les quotas legacy sont de l'ère `increment_feature_usage` ; NULL = illimité pour le tier requis, ce que le gate serveur attend), mais c'est une mutation de lignes existantes, d'où la capture P0-1.

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

## 4. Rollback (ordre inverse ; source de vérité = la capture P0-1, pas ce document)

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
