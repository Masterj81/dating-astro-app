# Runbook — Synastrie offerte : une comparaison gratuite par jour (PWA)

**Date de conception : 15 septembre 2026**
**État : implémenté localement, NON appliqué, NON déployé, NON commité**
**Branche de travail : `fix/security-wave-2-2026-09-08` (non commité)**

## Incident d'application n°4 (16 sept 2026, dry-run transactionnel — ANNULÉ AVANT COMMIT)

**Représentation normalisée de `pg_get_indexdef` comparée textuellement.** La self-verify refusait `colonnes/expression != (user_id, event_name, jour UTC)` : la définition de l'index était comparée à une chaîne attendue dans laquelle `AT TIME ZONE 'utc'` apparaît tel qu'écrit — or PostgreSQL peut le normaliser en `timezone('utc'::text, …)`. Le lot s'est terminé par `ROLLBACK` : rien d'appliqué, et **la définition de l'index n'a pas changé** (elle est correcte) — seul le contrôle était en tort.

**Correctif — preuve structurelle, jamais textuelle** : vérification via les catalogues, sans comparer le rendu de `pg_get_indexdef` pour la définition entière : (1) existence sur `product_events` (`indrelid` dans le WHERE) ; (2) `indisunique` ; (3) `indnkeyatts = 3` ; (4) clé 1 = colonne `user_id` exactement ; (5) clé 2 = colonne `event_name` exactement ; (6) clé 3 = **expression** (`indkey[3] = 0`) ; (7) l'élément 3 seul, via `pg_get_indexdef(indexrelid, 3, true)`, contient sémantiquement `created_at`, `utc`, une conversion vers `date` ; (8) le prédicat via `pg_get_expr(indpred, indrelid)` contient chacun des cinq événements ; (9) **exactement cinq** constantes d'événement (compte des `'::text` du rendu) — un sixième ajout silencieux, ou un renommage, change le compte. Régression statique correspondante dans `synastry-grant-contract.test.ts` : les deux formes textuelles fragiles sont interdites au retour, et chaque exigence structurelle est exigée nommément.

## Incident d'application n°3 (16 sept 2026, dry-run transactionnel — ANNULÉ AVANT COMMIT)

Le dry-run transactionnel (terminé par `ROLLBACK`) a compilé au-delà des deux incidents précédents, puis la self-verification a refusé l'état réel : **`service_role détient DELETE sur synastry_free_grant`**. Cause : l'état Supabase réel diffère de l'hypothèse locale — Supabase accorde `ALL` à `service_role` sur toute **nouvelle** table via ses default privileges (précédent documenté : `20260911000001`), et le `GRANT SELECT` de la migration **ajoute** sans jamais retirer. Intercepté avant commit : rien d'appliqué.

**Correctif** : `REVOKE ALL ON TABLE … FROM PUBLIC, anon, authenticated, service_role` **d'abord**, puis `GRANT SELECT … TO service_role` seul et séparé. Self-verify renforcée : SELECT positif exigé, et **chacun** des six privilèges de mutation (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) refusé individuellement pour `service_role` — les contrôles `PUBLIC` (ACL réelle, `grantee = 0`), `anon` et `authenticated` restent distincts. Régression statique dans `synastry-grant-contract.test.ts` : `service_role` exigé dans le `REVOKE ALL`, `GRANT SELECT` séparé et postérieur, couverture des six privilèges vérifiée.

## Incident d'application n°2 (16 sept 2026, production — ANNULÉ PROPREMENT)

Deuxième application (après le correctif PK) : la self-verification a échoué sur

```
ERROR 42601: a column definition list is redundant for a function with OUT parameters
```

Les deux helpers ACL portaient `aclexplode(...) AS a(grantor OID, grantee OID, privilege_type TEXT, is_grantable BOOLEAN)` — or `aclexplode` **déclare ses paramètres OUT** : la liste de colonnes est redondante et PostgreSQL la refuse. La migration a de nouveau été intégralement annulée par sa self-verify (table absente, quota NULL, zéro fonction).

**Correctif** : alias nu `) AS a` sur `CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(...))` dans les deux helpers — les noms de colonnes viennent des OUT. Régression dans `synastry-grant-contract.test.ts` : toute liste de définition après `aclexplode` (fenêtre de 220 caractères) ou tout `AS x(grantor…)` est un échec ; `CROSS JOIN LATERAL` + `) AS a` + références `a.grantee`/`a.privilege_type` exigés dans chaque helper.

## Incident d'application n°1 (16 sept 2026, production — ANNULÉ PROPREMENT)

Première application de `20260915000001` : la self-verification a échoué sur

```
ERROR 42883: operator does not exist: smallint || smallint
```

Le contrôle de PK concaténait les deux `pg_attribute.attnum` (`smallint`) — opérateur inexistant en PostgreSQL. **La transaction a été intégralement annulée** ; preuves mesurées après coup : `grant_table = NULL`, `free_preview_quota = NULL`, `created_functions = 0`. La production est revenue à son état exact d'avant : aucun aperçu actif, aucun nettoyage nécessaire. C'est la self-verify qui a refusé de committer — le mécanisme a fait son travail.

**Correctif** (commit `fix(security): validate synastry grant primary key portably`) : vérification portable par `unnest(i.indkey) WITH ORDINALITY` + `array_agg(attname ORDER BY ordinality)` comparé à `ARRAY['viewer_user_id','usage_date_utc']::name[]`. Régression ajoutée à `synastry-grant-contract.test.ts` : le motif `attnum … || … attnum`, toute comparaison directe `indkey = (…`, l'absence de `WITH ORDINALITY` et l'absence des deux noms dans l'ordre sont chacun des échecs de suite.

## Corrections de la revue du 16 sept 2026 (quatrième passe — toutes appliquées)

10. **`STRICT` retiré des helpers ACL (P0).** `p_privilege DEFAULT NULL` + `STRICT` faisait retourner NULL **sans exécuter la requête** à tout appel mono-argument — et `IF NULL` ne levant pas en PL/pgSQL, le self-verify de la table était un faux vert intégral. Les deux helpers sont désormais en plpgsql sans STRICT ; corollaire : un nom de privilège inconnu lève une **exception** (jamais un FALSE silencieux), et la seule façon d'obtenir FALSE est l'absence réelle d'entrée `grantee = 0`. **Tous** les sites d'appel (self-verifies des deux migrations, test SQL) comparent explicitement : baseline `IS FALSE` / `IS NOT FALSE`, injection `IS TRUE` — un NULL éventuel échoue toujours.
11. **Harnais de course sécurisé.** `fail()` **jette** au lieu d'appeler `process.exit` : l'orchestration est en try/catch/finally et le `finally` est invitable — ROLLBACK des workers encore ouverts, fermeture stdin, attente bornée (3 s) puis kill borné (2 s), nettoyage **idempotent** borné aux UUID `d17a5ace-…`, vérification des résidus **même après échec** (un échec de nettoyage est rapporté comme `INCIDENT CRITIQUE DE NETTOYAGE` et fait échouer la sortie). Le code d'échec original est préservé via `process.exitCode`.
12. **Chaîne de connexion jamais en argv.** Le harnais lit uniquement `JUNO_STAGING_DATABASE_URL` — pas de `process.argv` : rien dans l'historique du shell, la liste des processus ou les logs. Toute sortie est passée au `redact()` qui remplace la chaîne par `[redacted]`.
13. **Production interdite.** Le harnais exige `JUNO_ALLOW_STAGING_RACE_TEST=yes` **et** une identité de projet attendue (`JUNO_STAGING_PROJECT_REF`, comparée aux labels d'hôte et au nom d'utilisateur de la chaîne) ; le ref de production `qtihezzbuubnyvrjdkjd` est refusé absolument. Il crée et supprime des utilisateurs : **staging only**, jamais une première preuve sur la production. Tant qu'aucun staging ne l'a exécuté, la garantie concurrente reste **structurelle** (PK + `ON CONFLICT DO NOTHING`).
14. **Duplication `DB_URL` corrigée** dans `psqlScript` (PSQL_BASE la contient déjà — elle était passée deux fois, tout comme `ON_ERROR_STOP`).
15. **Garde-fou exécutable.** Nouvelle suite vitest `synastry-grant-contract.test.ts` (13 tests) relit les sources et refuse le retour de chacun des défauts ci-dessus : STRICT sur un helper, appel ACL en condition booléenne nue, prédicat de rétention autre que jour+6, `process.argv` dans le harnais, `process.exit(1)` direct, teardown sans ROLLBACK/kill, nettoyage non borné.

## Corrections de la revue du 16 sept 2026 (troisième passe — toutes appliquées)

7. **Faux contrôles PUBLIC remplacés.** `has_*_privilege('public', …)` n’atteste rien (PUBLIC est un pseudo-rôle, pas un nom). Deux helpers posés par la migration 1 — `public._acl_public_fn_privilege(oid, text)` et `public._acl_public_tbl_privilege(oid, text)` — inspectent `pg_proc.proacl` / `pg_class.relacl` via `aclexplode(COALESCE(acl, acldefault(…)))` et refusent toute entrée `grantee = 0`. Les self-verifies des DEUX migrations les utilisent ; anon/authenticated/service_role gardent leurs assertions directes et séparées. Régression dédiée dans le test SQL (section R) : injection réelle de `GRANT … TO PUBLIC` (fonction ET table), détection prouvée positive, ROLLBACK final — plus la preuve qu’aucun rôle nommé `public` n’existe (grantee=0 est l’unique représentation).
8. **Harnais de course réel.** `supabase/tests/synastry-free-grant.race.mjs` : orchestrateur Node + DEUX workers `psql` vivants. Barrière = le stdin des workers (READY → ARMED, libération dans la même tick par l’orchestrateur). Le gagnant est le premier qui répond (pas A par convention) ; son COMMIT libère le verrou d’index sur lequel le perdant est réellement bloqué, qui doit alors rendre `free_preview_used_other_target`. Contrôles : une ligne viewer/jour vers la cible du gagnant, nettoyage BORNÉ aux UUID synthétiques `d17a5ace-…`, preuve de zéro résidu. L’ancien protocole SQL à verrous advisory (invalide) est retiré ; le fichier `.race.test.sql` n’est plus qu’un pointeur honnête. **Non exécuté à ce jour** (aucun psql/DATABASE_URL local) — la course reste structurelle jusqu’à son exécution.
9. **Self-verify télémétrique renforcé.** Chaque exigence lève désormais indépendamment : signature unique (≠ surcharge) PUIS 7 arguments, `p_client_event_id`, la branche `ON CONFLICT (client_event_id) WHERE … IS NOT NULL`, CHACUN des cinq événements (liste blanche ET prédicat), la cible de conflit quotidienne `ON CONFLICT (user_id, event_name, jour UTC) WHERE event_name IN (…)`, la garde jamais-réattribuer, l’existence de l’index partiel PUIS sa définition via `pg_get_indexdef` (unique, colonnes/expression, prédicat normalisé `= ANY (ARRAY[…])`, couverture des cinq noms).

## Corrections de la revue du 15 sept 2026 (deuxième passe — toutes appliquées)

1. **Régression P0 `record_product_event` fermée.** La première mouture recréait la signature à 6 arguments — ressuscitant la surcharge que `20260831000002` droppe et écrasant l'attribution différée par `client_event_id`. La définition repart maintenant du canonique : UNE signature à 7 arguments, `p_client_event_id` conservé, `ON CONFLICT (client_event_id) ... DO UPDATE` avec COALESCE + `WHERE user_id IS NULL` (jamais réattribuer), `created_at` jamais réécrit, DROP défensif de la surcharge à 6 arguments, self-verify « exactement 1 signature, 7 args ». L'idempotence quotidienne est **ciblée** aux cinq événements d'aperçu par la cible de conflit de l'index partiel — `email_clicked` garde chaque sienne. Non-régression testée (avec et sans `client_event_id`, y compris re-attribution refusée et `created_at` préservé).
2. **SECURITY DEFINER durcis.** `synastry_preview_gate`, `claim_synastry_free_grant` et `record_product_event` passent à `SET search_path = ''` avec qualification explicite de chaque objet (`auth.uid()`, `public.*`). Assertions de privilèges étendues à `PUBLIC` (table + fonctions).
3. **Rétention corrigée.** Le prédicat `< v_today - INTERVAL '7 days'` conservait huit dates ; il est désormais `< v_today - INTERVAL '6 days'` : jour courant + J−1..J−6 conservés, J−7 et plus anciens purgés. Prouvé : aujourd'hui conservé, J−6 conservé, J−7/J−10 supprimés, borne de 200 suppressions par appel (250 insérés → 50 restants), le grant du jour survit au claim qui purge.
4. **Tests RPC avec sessions réelles.** `set_config('request.jwt.claims', …, true)` fournit ce que `auth.uid()` lit ; les RPC sont appelées pour de vrai. Les dix scénarios obligatoires (gratuit+A, +A rejeu, +B perdant, une ligne viewer/jour, Céleste/Cosmique `allowed_paid` zéro grant, cible invisible `target_ineligible`, quota NULL `preview_disabled`, politique absente `policy_unavailable` partout, sans session `unauthorized`, jour UTC distinct) + picker + télémétrie. Le test « aucun DELETE compensatoire » distingue désormais la purge autorisée (l'UNIQUE instruction DELETE, portant prédicat de rétention et borne) de toute autre suppression.
5. **Course à deux sessions séparée.** `synastry_free_grant.race.test.sql` documente le protocole réel (deux connexions, verrous d'orchestration, verdict). Non exécutée : jusqu'à son verdict, la course est une garantie structurelle (PK + `ON CONFLICT DO NOTHING`), jamais présentée comme mesurée.
6. **Cible sans date de naissance : décision explicite.** Réponse profil seul AVANT le claim → l'aperçu du jour n'est PAS consommé (rien d'astrologique à gated, champs déjà servis par le picker, la comparaison reste disponible). Test structurel dédié.

## Décision produit (opérateur, 15 sept 2026)

- Une seule cible admissible par lecteur et par jour civil **UTC**.
- La même cible est rejouable toute la journée sans nouvelle consommation.
- Une autre cible : refus 402 avec `next_available_utc`, **jamais** l'identité de la cible du jour.
- Céleste et Cosmique : accès normal, **aucun grant créé**.
- Réponse perdue après succès : grant conservé (aucun DELETE de compensation n'existe).
- Cible devenue bloquée/inaccessible entre visibilité et claim : grant conservé, refus uniforme.
- Rétention : jour courant + six jours précédents AU MAXIMUM (la purge supprime J−7 et plus anciens), opportuniste et bornée (200 lignes) à chaque claim — pas de cron non supervisé.
- Android **non concerné** en P0 : l'app mobile ne route pas la synastrie vers ce chemin ; les comptes gratuits Android n'ont pas l'aperçu (documenté, non annoncé).

## Les trois défauts de la revue de conception, et où ils sont corrigés

| # | Défaut | Correction |
|---|--------|------------|
| 1 | Claim AVANT calcul : un échec entre les deux perd la comparaison | Ordre imposé : porte → visibilité → lecture → **calcul** → claim atomique → émission. Aucun octet astrologique n'est émis avant le claim. Prouvé par `profile-chart-authz.test.ts` (« CLAIMS THE GRANT AFTER THE COMPUTE ») |
| 2 | `can_use_premium_feature` ne distingue plus un abonné d'un gratuit avec quota (`allowed=true` pour les deux) | `synastry_preview_gate()` : lecture de tier EXPLICITE (`get_user_tier` + `tier_at_least`), classification de la politique. Un abonné n'écrit jamais de grant |
| 3 | Picker gardé Céleste : l'aperçu serait une porte sans couloir | `20260915000002` : politique COMPTÉE (≠1 ligne → fail-closed), gratuit admis si quota ≥ 1, NULL → `premium_required` (état rollback) |

## Fichiers

| fichier | rôle |
|---|---|
| `supabase/migrations/20260915000001_synastry_free_grant.sql` | table `synastry_free_grant` (PK viewer+day), `synastry_preview_gate()`, `claim_synastry_free_grant()`, `free_preview_quota = 1`, télémétrie (5 événements, index unique d'idempotence), self-verify |
| `supabase/migrations/20260915000002_synastry_picker_free_preview.sql` | picker ouvert aux gratuits (quota ≥ 1), fail-closed sur politique absente/ambiguë, self-verify |
| `supabase/functions/get-profile-chart/index.ts` | porte explicite dans `authorizeChartAccess`, claim APRÈS calcul dans le handler, contrat de réponse `grant`, télémétrie best-effort |
| `supabase/tests/synastry_free_grant.test.sql` | tests SQL rollback-safe, sessions RÉELLES via `set_config('request.jwt.claims')` : scénarios 1-10 du claim/de la porte, preuves de purge (J−6 conservé, J−7 purgé, borne 200, grant du jour intact), non-régression `email_clicked` (avec/sans `client_event_id`, attribution différée, jamais réattribuée, `created_at` préservé), idempotence des aperçus, picker |
| `supabase/tests/synastry-free-grant.race.mjs` | course RÉELLE : orchestrateur Node, deux workers psql, barrière stdin, commit du premier autorisé, perdant débloqué, contrôles et nettoyage borné — exécution opérateur en **staging only** (env `JUNO_STAGING_DATABASE_URL` + `JUNO_STAGING_PROJECT_REF` + `JUNO_ALLOW_STAGING_RACE_TEST=yes`, production refusée par ref), NON exécutée à ce jour |
| `supabase/tests/synastry_free_grant.race.test.sql` | pointeur honnête vers le harnais — plus aucun protocole SQL bidon |
| `packages/shared/src/security/__tests__/profile-chart-authz.test.ts` | 31 tests : ordre des contrôles, 402 vs 503, fail-closed, claim-après-calcul structurel, perdant sans données |
| `apps/web/src/components/SynastryOverview.tsx` | 3 états (bannière grant / 402 used-other avec heure locale / verrou serveur), télémétrie `preview_presented` + `upgrade_clicked` |
| `apps/web/src/components/DiscoverOverview.tsx` | CTA « Voir notre synastrie offerte » (deep-link `profileId`), aucun appel au rendu de la carte |
| `apps/web/src/components/AstroPortal.tsx` | raccourci synastrie déverrouillé + note « 1 comparaison offerte par jour » |
| `apps/web/messages/*.json` (×8) | 9 clés nouvelles (`astroQuickSynastryFreeNote`, 7 × `synastryPreview*`, `discoverSynastryFreeCta`) |
| `scripts/validate-astro-portal.mjs` | nouvelle section 2b : natal ET synastrie `locked={false}` + note gratuite exigés |

## Contrat de réponse de `get-profile-chart` (chemin gratuit)

| verdict du claim | statut | corps |
|---|---|---|
| `allowed_free_new` | 200 | lecture complète + `grant: { code, used: true }` |
| `allowed_free_existing` | 200 | lecture complète + `grant: { code, used: false }` |
| `allowed_paid` (course) | 200 | lecture complète, **sans** `grant` |
| `free_preview_used_other_target` | 402 | `{ error, next_available_utc }` — **aucune** donnée astro, aucune identité |
| `target_ineligible` | 404 | uniforme avec tout autre NOT_VISIBLE |
| `preview_disabled` (rollback) | 402 | `insufficient_tier` |
| politique absente/ambiguë, RPC en erreur | 503 | fail-closed, aucune donnée |

Abonné (porte `paid`) : réponse actuelle, inchangée, sans champ `grant`.

## Ordre de déploiement (chaque étape a une porte)

1. **Diagnostic AVANT** (lecture seule) : état de `premium_feature_policy` pour `synastry`, présence des RPC (`pg_proc`), version déployée de `get-profile-chart`.
2. **Migration 1** (`20260915000001`) : son self-verify doit passer — sinon il refuse de committer. Porte : re-vérifier `SELECT * FROM synastry_preview_gate()` ne peut pas tourner sans session ; vérifier la ligne politique `quota = 1, required_tier = 'celestial'`.
3. **Preuve RPC** : exécuter `supabase/tests/synastry_free_grant.test.sql` (termine par ROLLBACK, ne laisse rien).
4. **Migration 2** (`20260915000002`) : self-verify des marqueurs du picker.
5. **Déployer SEUL `get-profile-chart`** (supabase functions deploy). Ne pas déployer le web avant l'étape 7.
6. **Vérification contrôlée** (curl, compte gratuit de test) :
   - cible A → 200 + `grant.used = true` ;
   - cible A encore → 200 + `grant.used = false` (rejeu gratuit) ;
   - cible B → 402 + `next_available_utc`, corps SANS `chart`/`synastry`/`profile` ;
   - compte Céleste → 200 sans `grant` ;
   - `SELECT count(*) FROM synastry_free_grant` = 1 ligne (le compte gratuit), 0 pour l'abonné.
7. **Vercel** (`npm run build:web` déjà vert localement).
8. **Tests finaux** : gratuit (bannière, puis état 402 après changement de cible), Céleste (aucune bannière), Cosmique (idem), Discover (CTA offert), portail Astro (raccourci sans cadenas), 8 locales.
9. **Diagnostic APRÈS** : mêmes lectures qu'avant + `product_events` (les 5 événements, aucune colonne cible).
10. **Observation J+1** : `synastry_free_grant` compte ≈ lecteurs actifs gratuits ayant comparé ; `preview_used_other_target` vs `preview_succeeded` (taux de frustration) ; taux `upgrade_clicked`.

## ROLLBACK — deux niveaux, aucun redéploiement edge

**Désactiver l'aperçu** (repli immédiat, sans toucher au code déployé) :

```sql
UPDATE public.premium_feature_policy
   SET free_preview_quota = NULL
 WHERE feature_key = 'synastry';
```

La porte répond `preview_disabled` → edge 402 `insufficient_tier` ; le picker répond `premium_required` ; le web affiche le verrou classique (décidé par le serveur, pas par le tier local). Les abonnés ne voient aucune différence. Les grants existants restent (inoffensifs : plus rien ne les lit ; purge J−7 et plus anciens).

**Retirer entièrement** : re-déployer `get-profile-chart` sur la révision précédente, puis drop des deux fonctions et de la table. Jamais nécessaire en urgence : le premier niveau suffit.

## Tests et validation exécutés localement (15 sept, 2ᵉ passe, tout vert) — voir le rapport de session pour les sorties brutes

- `npm run test --workspace=@astro/shared` — suite authz portée à **32 tests**
- `npm run test --workspace=@astro/web` — 9/9 (portail : 0 cadenas pour un gratuit)
- `npm run typecheck` — 3/3 workspaces · `npm run lint` — 0 erreur
- `npm run build:web` — vert
- `validate:premium-gating`, `validate:web:locales`, `validate:astro-portal`, `validate:chart-privacy`, `validate:profile-reads`, `validate:edge-astrology`, `validate:rls-contract` — verts
- `supabase/tests/synastry_free_grant.test.sql` — **écrit, NON encore exécuté** (nécessite une base : staging ou psql local). Son exécution fait partie de l'étape 3 du déploiement.
- **NON exécutés à ce jour** : tout test SQL contre une base réelle, la course à deux sessions, tout déploiement. Rien n'est commité ni poussé.

## Non-fonctionnel documenté

- **Télémétrie minimale** : 5 événements en liste blanche (`preview_presented`, `preview_succeeded`, `preview_reopened`, `preview_used_other_target`, `upgrade_clicked`), idempotents par index unique partiel (un par lecteur/événement/jour UTC), **aucun** `target_user_id`, aucune donnée de thème.
- **Android** : non touché (mission phase 9). Les écrans mobiles de synastrie continuent d'appeler l'edge ; un compte gratuit Android recevra 402 — comportement d'aujourd'hui, pas de régression, pas d'annonce.
- **Volume** : au plus une ligne par lecteur actif gratuit et par jour ; purge bornée à 200 suppressions par claim (J−7 et plus anciens) via l'index `idx_synastry_free_grant_purge`.
