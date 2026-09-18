# Runbook — JUNO-15 : réconciliation de l'historique des migrations Supabase

**Date du diagnostic : 18 septembre 2026 · Projet : Astro-dating (`qtihezzbuubnyvrjdkjd`, us-east-1, lié, Production). Aucun staging n'existe.**
**Statut : FERMÉ le 18 sept 2026 — réconciliation exécutée en deux vagues (§10bis/§10ter), revue humaine favorable : 109/109 versions alignées, 0 locale-seule, 0 distant-seul, watchdog PII actif, 6 validateurs verts. `supabase db push` reste INTERDIT (§12).**

## 1. Règle absolue

**`supabase db push` ne doit jamais être exécuté dans ce dépôt.** Les migrations appliquées à la main portent des effets métier non rejouables (déplacements de données, NULL de lieux de naissance, files de courriels, crons, privilèges). `migration repair --status applied` ne modifie que l'historique déclaré et ne sera utilisé que sur preuve indépendante, version par version.

## 2. Méthode de reproduction (lecture seule)

```
npx supabase migration list --linked          # JSON archivé en %TEMP%
node scripts/compare-migration-history.mjs <sortie>
```

CLI : `supabase 2.117.0` (via npx), session valide, projet lié = Production. Les preuves de schéma passent par la Management API (requêtes en lecture seule sur les catalogues et agrégats uniquement ; aucun PII, aucun secret, aucune écriture — script jetable en `%TEMP%`, jamais commité).

## 3. Inventaire avant

| Mesure | Valeur |
|---|---|
| Fichiers locaux `.sql` | 108 migrations canoniques + 1 utilitaire (`run_pending.sql`) |
| Historique distant | **78** versions enregistrées |
| Communes | 78 |
| **Locales-seules** | **30** (liste §5) |
| Distantes-seules | **0** |
| Doublons de version locaux | 0 |
| Dernière version distante | `20260827000001` — MAIS `20260824000001` manque en son milieu : la rupture n'est pas un simple point de coupure |

La cause est documentée : depuis le 28 août 2026, chaque migration a été appliquée à la main via la Management API puis jamais enregistrée dans `supabase_migrations.schema_migrations`. Le « neuf » historique de l'audit datait d'avant cette série.

## 4. Preuve par migration — verdicts

30 vérifications lecture seule (métadonnées + agrégats). **29 prouvées appliquées, 1 partielle.**

| Version | Effet pivot vérifié en Production | Verdict |
|---|---|---|
| 20260824000001 | default `notification_preferences` contient `"dailyHoroscope": true` (le cron `send-scheduled-emails` */15 a été remplacé légitimement par `scheduled-emails-dispatch` */5 le 10 sept) | **appliquée** |
| 20260828000001 | `premium_feature_policy` : `conversation_guide`, tier `celestial`, quota 100, `free_preview_quota=1` — conforme à l'état final du fichier (l'« = 3 » du fichier est un commentaire, l'UPDATE réel fixe 1) | **appliquée** |
| 20260830000001 | fonction `enforce_rising_requires_birth_time` + trigger + invariant `rising_sign NOT NULL ⇒ birth_time NOT NULL` = 0 contre-exemple | **appliquée** (supplantée par 20260901000002) |
| 20260831000001 | table `product_events` + RLS + REVOKE anon/authenticated + `record_product_event` | **appliquée** |
| 20260831000002 | colonne `client_event_id` + index unique + **une seule** signature (7 args) — le fichier DROP l'ancienne 6 args | **appliquée** |
| 20260831000003 | trigger `trigger_create_profile_on_auth_signup` sur `auth.users` | **appliquée** |
| 20260901000001 | index `ux_scheduled_emails_welcome_once` + `schedule_onboarding_emails()` + trigger | **appliquée** |
| 20260901000002 | colonne `rising_sign_unconfirmed` + fn v2 (mentionne `birth_latitude`) + invariant complet (temps **et** coordonnées) = 0 contre-exemple | **appliquée** |
| 20260901000003 | agrégat : 0 profil restant aux coordonnées exactes de Montréal hors `birth_city ~* 'montr'` (69 traitées à l'époque) | **appliquée** (preuve rétrospective forte, see §6) |
| 20260902000001 | la vue `discoverable_profiles` expose `connection_intentions` | **appliquée** |
| 20260903000001 | DML révoqué sur `conversations` + `discoverable_profiles` pour `authenticated` **et** `anon` (24 combinaisons testées, 0 violation) | **appliquée** |
| 20260903000002 | **0** privilège **SELECT** colonne pour `authenticated` sur les 5 colonnes sensibles (`email`, `birth_time`, `birth_latitude`, `birth_longitude`, `push_token`) — les INSERT/UPDATE/REFERENCES restants au niveau table sont légitimes (profil propre) | **appliquée** |
| 20260903000003 | SELECT table révoqué sur `profiles` (authenticated + anon) + re-grant colonne par colonne (subset public) | **appliquée** |
| 20260903000004 | table `security_posture_alerts` + RLS + les 2 fonctions + `check_profiles_pii_posture()` renvoie `ok=true, offenders=[]` — **MAIS le cron `profiles-pii-posture` (17 3 * * *) est ABSENT de `cron.job`** : le bloc de planification du fichier avale sa propre défaillance (`EXCEPTION WHEN OTHERS → RAISE NOTICE`, anti-pattern JUNO-29) | **PARTIELLE** — état AVANT réconciliation ; corrigée et enregistrée au §10ter |
| 20260907000001 | `profile_chart_visible` + `can_view_profile_chart` (EXECUTE authenticated seul) | **appliquée** |
| 20260907000002 | `messages` : UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER révoqués pour authenticated + anon (0 violation) | **appliquée** |
| 20260907000003 | grants EXECUTE persistants du picker (corps supplanté par 20260915000002) | **appliquée** |
| 20260908000001 | bucket `marketing-images` (public=true) + 3 RPC `marketing_agent_*` EXECUTE service_role seul (via ACL exactes) | **appliquée** |
| 20260908000002 | table `edge_rate_limits` + RLS + policy deny + `check_edge_rate_limit` (EXECUTE authenticated+service_role, PUBLIC non) | **appliquée** |
| 20260909000001 | `process-expired-deletions` : commande résolue depuis `vault.decrypted_secrets`, **active=true = état final voulu** (armé manuellement le 9 sept, JUNO-29 fermé : 8 suppressions, idempotence prouvée) | **appliquée** |
| 20260909000002 | `check_cron_edge_health` EXECUTE service_role seul (corps v3 en place) | **appliquée** |
| 20260910000001 | `_assert_cron_secret` (EXECUTE personne) + `scheduled-emails-dispatch` */5 actif + ancien `send-scheduled-emails` absent | **appliquée** |
| 20260910000002 | `media_purge_jobs` : table + **FORCE** RLS + revoke all + index + `_media_purge_shape_ok` | **appliquée** |
| 20260910000003 | `purge_completed_media_purge_jobs` (service_role) + crons `media-purge-resume` */10 et `media-purge-retention` 17 4 | **appliquée** |
| 20260910000004 | `check_cron_edge_health` mentionne `media_purge` (v2) | **appliquée** |
| 20260911000001 | `orphan_purge_campaigns` : service_role a SELECT/INSERT/UPDATE **sans DELETE** (la leçon du 11 sept) | **appliquée** |
| 20260914000001 | `cron_task_decisions` : ≥2 décisions JUNO-30 + health v3 mentionne la table | **appliquée** |
| 20260915000001 | `synastry_free_grant` : table + RLS + SELECT service_role (pas authenticated — c'est le RPC qui agit) + les 2 fonctions EXECUTE authenticated + **1 ligne utilisée** (fonctionnalité prouvée vivante) | **appliquée** |
| 20260915000002 | picker : mentionne `free_preview_quota`, `profile_chart_visible`, `v_preview` (garde comptée fail-closed) | **appliquée** |
| 20260916000001 | `synastry_preview_gate` : `RETURNS TABLE` + `v_free_preview_quota` (scalaires) | **appliquée** |

Erreurs de classement corrigées pendant l'audit (assertions initiales trop larges, aucune n'était une dérive réelle) : 20260828000001 (quota lu dans un commentaire), 20260831000002 (le DROP de l'ancienne signature est dans le fichier), 20260903000002 (les INSERT/UPDATE table s'étendent aux colonnes — la propriété de sécurité porte sur SELECT seul), 20260909000001 (l'armement est l'état final voulu), 20260915000001 (le GRANT SELECT vise service_role).

## 5. Réparations proposées — autorisation requise, version par version, EN DEUX VAGUES

**Vague 1 — candidates au repair immédiat** (effets intégralement prouvés, §4) — 29 versions :

```
20260824000001 20260828000001 20260830000001 20260831000001 20260831000002
20260831000003 20260901000001 20260901000002 20260901000003 20260902000001
20260903000001 20260903000002 20260903000003 20260907000001 20260907000002
20260907000003 20260908000001 20260908000002 20260909000001 20260909000002
20260910000001 20260910000002 20260910000003 20260910000004 20260911000001
20260914000001 20260915000001 20260915000002 20260916000001
```

**Vague 2 — repairs CONDITIONNELS, uniquement après application et vérification du correctif** (§10, étapes 3–4) :

| Version | Condition qui débloque son repair |
|---|---|
| `20260903000004` | `20260918000001` appliquée ET job `profiles-pii-posture` constaté (présent, actif, `17 3 * * *`, appelle `record_profiles_pii_posture`) — la postcondition manquante de 03000004 est alors restaurée, tous ses effets sont réellement présents |
| `20260918000001` | avoir été exécutée manuellement (étape 3) — c'est l'exécution qui fonde le marquage, pas l'existence du fichier |

**Jamais en vrac** : chaque repair est unitaire, dans cet ordre (29 × vague 1, puis 03000004, puis 18000001). L'ordre de la vague 2 est significatif : 03000004 ne devient « appliquée » que PARCE QUE 18000001 restaure son effet manquant.

## 6. Risques de chaque repair

`migration repair` n'écrit que `supabase_migrations.schema_migrations` : aucun DDL, aucune donnée, aucun cron, aucun courriel. Le risque réel est d'enregistrer une migration qui ne serait PAS appliquée — c'est ce que les preuves du §4 excluent pour les 29 candidates. Pour `20260901000003` (effet purement données), la preuve rétrospective est un agrégat (0 profil aux coordonnées de Montréal hors « montr ») : l'état ne peut provenir que de cette mise à NULL (aucune autre écriture de coordonnées n'existe depuis — le géocodage local a été supprimé le 4 sept et l'onboarding n'écrit plus de coordonnées sans ville résolue). Classée appliquée sur cette base ; le doute résiduel est consigné ici.

## 7. Historique du défaut : 20260903000004 — le watchdog PII qui n'a jamais tourné

> **État final (18 sept 2026, §10ter) : migration corrective `20260918000001` APPLIQUÉE ; cron `profiles-pii-posture` PRÉSENT et ACTIF à `17 3 * * *`, appelant `public.record_profiles_pii_posture()` ; repair de `20260903000004` ENREGISTRÉ dans l'historique distant.** Ce qui suit est le récit du défaut, conservé comme leçon.

- **Constat (au diagnostic)** : `check_profiles_pii_posture()` existait et répondait `ok=true`, mais **aucun job `profiles-pii-posture`** dans `cron.job` — la vérification quotidienne de posture PII ne s'était **jamais exécutée** depuis l'origine.
- **Cause** : le bloc de planification du fichier migrait sa défaillance (`EXCEPTION WHEN OTHERS THEN RAISE NOTICE`) — l'anti-pattern JUNO-29 à l'intérieur même d'une migration : la transaction commettait, la planification échouait en silence (pg_cron vraisemblablement indisponible au moment de l'application manuelle).
- **Résolution** : `20260918000001` (fail-closed, postcondition `RAISE EXCEPTION`, conforme à la règle R4 du validateur) appliquée transactionnellement sous seconde autorisation ; quatre postconditions vérifiées vraies (présent, actif, planification, fonction appelée) avant le repair de `20260903000004`.
- **Leçon durable** : le risque qu'une réapparition de privilège table hors contrôle de version (celle du 3 sept a existé) reste invisible **n'existe plus** — c'est précisément ce que la règle R4 de `validate:migration-history` (postcondition obligatoire, avalement interdit) empêche de reproduire.

## 8. État distant sans fichier local

Aucun (0 distant-seul). Ce cas du brief ne s'applique pas — aucune fabrique rétroactive n'est nécessaire.

## 9. Prévention de récidive

`scripts/validate-migration-history.mjs` (`npm run validate:migration-history`, câblé en CI) refuse désormais :
- **R1** les noms non canoniques (allowlist : `run_pending.sql`, utilitaire hérité documenté) ;
- **R2** les versions dupliquées ;
- **R3** une migration de privilèges datée ≥ 20260907 sans `RAISE EXCEPTION` (PostgreSQL WARN et COMMITE sur un REVOKE manqué) ;
- **R4** une migration cron datée ≥ 20260918 sans postcondition `RAISE EXCEPTION` ou qui avale ses échecs — trois fichiers historiques sont grand-pèrés avec ce runbook en référence ;
- **R5** tout marqueur `NOT DEPLOYED` dans une migration datée ≥ 2026-09-18 (l'état de déploiement se consigne ici). Cinq fichiers historiques portent un marqueur désormais **périmé** (`20260419000004`, `20260903000001`, `20260903000002`, `20260907000001`, `20260907000002`) — dont deux prouvés APPLIQUÉS par le présent audit : modifier une migration déjà appliquée est interdit, ce runbook est la source de vérité ;
- **R6** tout octet NUL.

Les motifs sont testés sur le **code sans commentaires** (leçon documentée du dépôt : une regex ne doit jamais matcher sa propre documentation) et les dates comparent les 8 premiers chiffres de la version. Le validateur est prouvé discriminant : un canari cron-qui-avale (20260918000002, créé puis supprimé pour la preuve) déclenche les deux échecs R4, l'arbre propre repasse vert.

`scripts/compare-migration-history.mjs` mesure la dérive local/distant côté opérateur. **Limite documentée** : la CI n'a pas d'accès au projet Production et ne peut pas prouver l'état distant — le compare est une opération opérateur, à consigner dans ce runbook à chaque chantier base.

## 10. Procédure de réconciliation complète (chaque étape sur autorisation explicite)

> Séquence révisée le 18 sept (soir) après revue opérateur : la version initiale de ce
> runbook excluait définitivement `20260903000004` et `20260918000001` du repair tout en
> exigeant « aucune locale-seule » en fermeture — incohérent. Les deux versions sont
> désormais des repairs **conditionnels de vague 2** (§5), dans cet ordre exact :

1. **Pousser** les commits du chantier et obtenir une **CI verte** (PR #42).
2. **Vague 1** — repair des **29 versions** prouvées, UNE À UNE. Pour chacune :
   - état avant : `node scripts/compare-migration-history.mjs` (archiver la sortie) ;
   - `npx supabase migration repair --status applied <version>` ;
   - vérifier : code de sortie 0, version en colonne remote, **et re-vérifier UNE preuve pivot du §4 pour cette version** ;
   - consigner la ligne ici avant de passer à la suivante.
3. **Appliquer transactionnellement `20260918000001`** via la Management API (le fichier est `begin; … commit;` avec postcondition `RAISE EXCEPTION` : une exécution partielle est impossible).
4. **Vérifier le watchdog** : `profiles-pii-posture` présent dans `cron.job`, `active=true`, `schedule='17 3 * * *'`, commande appelant `record_profiles_pii_posture`. Toute divergence = arrêt (la migration n'a pas pu passer sa propre postcondition — ne pas « arranger » à la main).
5. **Repair `20260903000004`** (`--status applied`) — légitime à partir de maintenant : sa postcondition manquante (le cron) est restaurée, TOUS ses effets sont présents.
6. **Repair `20260918000001`** (`--status applied`) — elle vient d'être réellement exécutée à l'étape 3.
7. **Re-comparer** : `compare-migration-history` → **0 locale-seule, 0 distant-seul**.
8. **Relancer tous les validateurs** : `validate:migration-history`, `validate:rls-contract`, `validate:cron-secrets`, `validate:repo-hygiene`, `validate:media-purge`, `validate:orphan-purge`.
9. **`db push` demeure INTERDIT** (§12) — la réconciliation de l'historique ne change pas la nature non rejouable des migrations historiques.

**Arrêt immédiat** si une commande produit un résultat inattendu ; jamais de `db push` pour « remettre d'aplomb ».

**Rollback des métadonnées** — fait vérifié le 18 sept 2026 sur la CLI installée (`supabase 2.117.0`, `npx supabase migration repair --help`) : le drapeau `--status` accepte **`applied` et `reverted`**. Un repair erroné s'annule donc par la commande symétrique :

```
npx supabase migration repair --status reverted <version>
```

(La version initiale de ce runbook affirmait qu'un DELETE manuel dans `supabase_migrations.schema_migrations` était la seule voie : c'était faux pour cette CLI, et cette affirmation n'aurait pas dû être consignée sans vérification — corrigé.)

### 10bis. Exécution de la vague 1 — 18 septembre 2026 : 29/29

Autorisation opérateur (formulation exacte archivée dans la session) : les 29 repairs **individuels** du §5 sur la Production, comparaison et preuve pivot après chaque version, arrêt immédiat à la première anomalie ; **explicitement exclus** : `db push`, l'application de `20260918000001`, la vague 2.

Exécution par pilote fail-stop (une version à la fois : `repair --linked` → vérification de l'enregistrement dans `supabase_migrations.schema_migrations` → **preuve pivot du §4 re-exécutée** → journal) :

| Contrôle | Résultat |
|---|---|
| Repairs exécutés | **29/29**, exit 0 chacun, aucun arrêt |
| Enregistrement vérifié (schema_migrations) | 29/29 |
| Preuves pivots re-exécutées après repair | 29/29 OK |
| Historique distant | 78 → **107** versions |
| Locales-seules | 31 → **2** (exactement `20260903000004` + `20260918000001`, la paire de vague 2) |
| Distantes-seules | **0** |
| `cron.job` | **7 jobs, inchangé** — un repair n'a créé/activé/modifié aucun cron, aucune donnée, aucun schéma |

Journal complet (29 lignes `version|exit|registered|pivot`) : chaque ligne `yes|yes`. Les états avant/après (`migration list --linked`) sont archivés côté opérateur (`juno15-wave1-before.txt` / `-after.txt`).

**Reste la seconde autorisation** : étapes 3–6 du §10 (application transactionnelle de `20260918000001`, vérification du watchdog, repair `20260903000004` puis `20260918000001`), puis 7–8 (compare 0/0 + validateurs).

### 10ter. Seconde phase — 18 septembre 2026 : exécutée intégralement

Autorisation opérateur (bornée) : appliquer **uniquement** `20260918000001`, vérifier ses quatre postconditions, et seulement si toutes vraies exécuter les deux repairs dans l'ordre ; interdits maintenus : `db push`, toute autre migration, modification de données, cron ou configuration.

| Étape | Résultat |
|---|---|
| 3. Application transactionnelle de `20260918000001` (Management API) | exécutée sans erreur (script `begin; … commit;` à postcondition `RAISE EXCEPTION`) |
| 4. Postconditions du watchdog | **présent ✅ · actif ✅ · `17 3 * * *` ✅ · appelle `record_profiles_pii_posture()` ✅** — `cron.job` passe de 7 à **8** jobs (exactement le job autorisé, aucun autre changement) |
| 5. Repair `20260903000004` | exit 0, enregistré (sa postcondition manquante — le cron — est désormais restaurée) |
| 6. Repair `20260918000001` | exit 0, enregistré (fondé sur son exécution réelle à l'étape 3) |
| 7. Compare final | **local=109 · remote=109 · both=109 · 0 locale-seule · 0 distant-seul** — « historique local et distant alignés » |
| 8. Validateurs | `validate:migration-history`, `validate:rls-contract`, `validate:cron-secrets`, `validate:repo-hygiene`, `validate:media-purge`, `validate:orphan-purge` — **6/6 exit 0** |

Aucune anomalie, aucun arrêt. Les seules mutations Production de cette phase : une ligne dans `cron.job` (le watchdog) et deux lignes dans `supabase_migrations.schema_migrations`.

**Revue humaine effectuée le 18 sept 2026 : favorable** — 109/109 versions alignées ; 0 locale-seule ; 0 distant-seul ; watchdog présent, actif, correctement planifié ; réparations exécutées dans l'ordre autorisé ; six validateurs verts ; aucune mutation étrangère au périmètre. **Toutes les conditions du §11 sont remplies : JUNO-15 est FERMÉ.** `supabase db push` demeure INTERDIT (§12).

## 11. Conditions de fermeture de JUNO-15 — TOUTES REMPLIES le 18 sept 2026

1. ✅ vague 1 exécutée : repair des **29** versions, preuve par preuve (§10bis) ;
2. ✅ `20260918000001` appliquée et job `profiles-pii-posture` constaté actif, à `17 3 * * *`, appelant la bonne fonction (§10ter, étapes 3–4) ;
3. ✅ vague 2 exécutée dans l'ordre : repair `20260903000004` puis `20260918000001` (§10ter, étapes 5–6) ;
4. ✅ `compare-migration-history.mjs` : **0 locale-seule et 0 distant-seul** (109/109) ;
5. ✅ validateurs verts (6/6) **et revue humaine du tableau final effectuée — favorable** ;
6. ✅ décision rendue : **`db push` reste interdit** (§12) — l'application manuelle demeure la voie nommée, et les migrations historiques non rejouables n'ont pas changé de nature.

## 12. Interdiction persistante

`supabase db push` : **INTERDIT** (§1). Le présent diagnostic ne change rien à cette règle : deux migrations du dépôt (`20260413000003`, `20260419000004`) interpoleraient la clé service_role dans `cron.job.command` si elles étaient rejouées avec le réglage positionné — raison supplémentaire, documentée depuis JUNO-31.
