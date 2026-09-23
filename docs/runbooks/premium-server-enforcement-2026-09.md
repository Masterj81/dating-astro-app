# Runbook — JUNO-06 : contrôle premium mobile (reprise, 2026-09-23)

**Verdict : PARTIELLEMENT CORRIGÉ — CONTRÔLES SERVEUR RÉELS SUR 2/11, 9/11 RESTENT CONTOURNABLES DANS L'APK.**
**Statut : CORRIGÉ LOCALEMENT — migration, déploiement des edges et preuve production requis.**
Aucune fusion, aucun push, aucune migration appliquée, aucun build EAS. Branche `fix/juno-06-server-premium` (worktree `C:\temp\juno06`), base `origin/master` = `49832a0` (fermeture JUNO-05/13).

La première passe (v1, 2026-09-22) routait les 11 fonctionnalités par `enforce_premium_feature` et déclarait « 11/11 server enforced ». L'opérateur l'a rejetée comme **correction de sécurité** (acceptée comme amélioration de contrat) au motif qui gouverne tout ce document : *un appel serveur préalable n'est pas une autorisation de sécurité lorsque le résultat premium peut encore être produit intégralement hors ligne.* Deux blocages nommés, tous deux traités ici :

1. **Blocage 1** — les moteurs/corpus restaient dans l'APK : un APK patché supprime l'appel enforce et calcule localement.
2. **Blocage 2** — le « lissage » RevenueCat local après un refus serveur : le téléphone primait le serveur.

## 1. L'inventaire honnête (11 fonctionnalités, 3 classes)

Le vocabulaire est partagé par la table de politique (`enforcement_class`, migration `20260922000001`), le client (`ENFORCEMENT_CLASSES` dans `apps/mobile/services/premiumUsage.ts`), les validateurs et ce runbook. **Les compteurs sont toujours séparés — jamais un « N/N » unique.**

| Feature | Tier | Où le résultat premium peut être produit | Classe | Verdict APK patché |
|---|---|---|---|---|
| weekly-tarot | cosmic | **nulle part hors serveur** — edge `premium-tarot-reading`, artefact `tarot.generated.ts` | `server_enforced_data` | rien à afficher : aucun moteur, aucun corpus |
| monthly-tarot | celestial | idem | `server_enforced_data` | idem |
| natal-chart | celestial | propre `birth_chart` (`get_my_full_profile`) + moteur astro embarqué | `server_metered_ui` | recalcul local possible |
| synastry | celestial | lecture publiée serveur (JUNO-01) MAIS les deux moteurs restent embarqués pour le fallback | `server_metered_ui` | calcul local possible |
| conversation-guide | celestial | corpus coach embarqué (~35 Ko, anglais par conception, les deux plateformes) | `server_metered_ui` | relecture locale du corpus |
| daily-horoscope | celestial | libellés locaux déterministes (seed signe solaire) ; un corpus serveur existe dans `send-daily-horoscope`, non lu par l'écran | `server_metered_ui` | régénération locale |
| monthly-horoscope | cosmic | idem | `server_metered_ui` | idem |
| lucky-days | cosmic | const `WINDOWS` — valeurs de phase **codées en dur**, rien n'est calculé | `server_metered_ui` | relecture littérale |
| date-planner | cosmic | tableaux i18n locaux `PROMPT_KEYS_BY_INTENTION` / `IDEA_KEYS` | `server_metered_ui` | relecture littérale |
| planetary-transits | cosmic | const `THEMES` statique (6 cartes) ; V2 a retiré l'éphéméride | `public_content` | identique à l'expérience payante |
| retrograde-alerts | cosmic | const statique, même forme | `public_content` | idem |

**Comptes : 2/11 `server_enforced_data`, 7/11 `server_metered_ui`, 2/11 `public_content`.** Les 7 metered ont une décision serveur réelle (entitlement + aperçu + quota, dépense enregistrée côté serveur) — ce qui manque est l'extraction-protection. Les 2 public sont décoratifs contre un patch : décision produit assumée de garder la porte pour la majorité honnête, documentée ici comme n'étant **pas** une frontière.

## 2. Blocage 1 — le tarot devient un artefact serveur

- **Edge `supabase/functions/premium-tarot-reading/`** : JWT → `enforce_premium_feature(tarot_cosmic | tarot_monthly)` → **la décision est DANS l'edge, avant toute production**. Refus ⇒ 402 `premium_required` sans octet de lecture ; décision injoignable ⇒ 503 `decision_unavailable` (fail-closed, aucun tirage de secours). Autorisé ⇒ `generateReading({userId: auth.uid(), mode, period, locale})` — l'identité de seed est l'utilisateur authentifié, jamais un paramètre d'appel.
- **L'artefact `tarot.generated.ts`** est généré depuis `packages/shared/src/tarot/edge-entry.ts` par `scripts/build-edge-tarot.mjs` (même contrat que le bundle astrologie JUNO-01 : `npm run build:edge-tarot` écrit, `validate:edge-tarot` compare le sha en CI). Le serveur ne peut pas dériver du moteur que le téléphone utilisait : c'est le même, bundlé depuis l'unique source. La suite `premium-tarot-reading.test.ts` exécute les deux et compare carte à carte.
- **Le mobile** (`services/serverTarot.ts` + `app/premium-screens/tarot.tsx`) : aucun fichier sous `apps/mobile` n'importe `@astro/shared/tarot` (assertion D7 du validateur + test discriminant). L'écran n'est **pas** enveloppé dans `PremiumGate` : l'edge est la décision unique — un wrapper dépenserait un second aperçu pour le même écran (le lecteur gratuit consommerait son aperçu au gate puis recevrait 402 de l'edge). Refus ⇒ `triggerPaywall` ; panne réseau ⇒ état d'erreur honnête + réessai (`tarotServerError`, 8 locales). La bannière « 1 aperçu gratuit » vient du champ `viaFreePreview` renvoyé par l'edge — même contrat d'affichage que les autres surfaces.
- **Build 130 inchangé** : le Play build actuel garde son moteur embarqué et son `PremiumGate` local (ses clés existent, ses quotas restent 1/jour, l'alias `'tarot'` survit). L'edge ne concerne que les clients qui l'appellent (131+).

## 3. Blocage 2 — le flux de synchronisation (le téléphone demande, le serveur vérifie, le serveur décide)

Flux implémenté exactement tel que exigé :

1. le client **demande** une synchronisation (`syncEntitlement()` → edge `sync-entitlement`, JWT, sans paramètre) ;
2. le serveur vérifie auprès de RevenueCat **avec ses propres credentials** (`REVENUECAT_API_KEY`, le même secret que `backfill-revenuecat` ; la clé SDK du téléphone ne prouve rien et ne sort jamais de l'appareil) — le subscriber vérifié est TOUJOURS `auth.uid()` ;
3. le serveur écrit — **deux sortes d'écritures, jamais confondues** :
   - l'**écriture technique** (le claim du throttle 30 s) : table dédiée `entitlement_sync_claims` (`20260922000002` ; `user_id` PK + horodatage, **aucune** donnée de tier/expiration/produit), écrite **AVANT** l'appel RevenueCat et survit à son échec à dessein — c'est elle qui borne la cadence de retry. Deux bras atomiques : `INSERT … ON CONFLICT DO NOTHING` (gagne exactement au premier sync — un compte sans ligne `subscriptions`, c'est-à-dire tout compte gratuit, est couvert et throttlé dès cet instant ; un claim en UPDATE nu matcherait zéro ligne et laisserait une fenêtre de retry non throttlée) puis `UPDATE` conditionnel dont le prédicat (`last_sync_at IS NULL OR < now−30 s`) s'évalue DANS l'instruction, sous le verrou de ligne — de deux claims concurrents, un seul gagne ;
   - l'**écriture vérifiée** : `subscriptions`, uniquement sur réponse RevenueCat vérifiée — upsert borné au jeu de colonnes exact de `backfill-revenuecat` (même `ON CONFLICT (user_id, source)`) ou downgrade `UPDATE` (statut expired). Délai RC de 8 s (`AbortSignal.timeout`) ; **fail-closed sur toute erreur RC** — injoignable, non-2xx, corps illisible ou **ambigu** (un 200 sans `subscriber`, une `expires_date` inanalysable) ⇒ **aucune écriture d'entitlement** : une réponse ambiguë ne rétrograde ni ne promeut personne (l'écriture technique du claim, elle, reste — voir ci-dessus) ; RC 404 = `synced, tier free`, honnête, pas une erreur ; logs = issues seulement (`user/outcome/tier`), jamais de corps RC ni de credential ;
   - **UX du retry** : après un échec RC, le lecteur attend **au plus 30 s** — un retry plus tôt reçoit un 429 honnête (`rate_limited`), le bouton « Vérifier mon abonnement » reste disponible et réussit une fois la fenêtre passée. Preuves comportementales : `supabase/tests/juno06_sync_entitlement_claim.test.sql` (ligne absente, claims concurrents, échec RC après claim, retry après 30 s) ;
4. le client **redemande** la décision (`enforce_premium_feature`) ;
5. **seul le nouveau verdict serveur accorde.**

Les deux edges sont déclarés `verify_jwt = true` dans `supabase/config.toml` (contrôle plateforme en plus du contrôle interne sur l'en-tête Authorization — défense en profondeur).

Sites purgés (chacun pouvait inverser un refus serveur) :

- `PremiumGate` : le grant post-refus gardé par `canAccessFeature` (erreur/`insufficient_tier` + tier local payé ⇒ accordé) devient l'état `sync_available` + bouton « Vérifier mon abonnement » (`subscriptionConfirmTitle/Body/Retry`, 8 locales) qui exécute le flux 1→5. Le catch fait de même. **Aucun chemin de la fonction ne met `granted`.**
- `conversation-guide.tsx` : le raccourci `entitled` (`canAccessFeature` dans `canRead`/`openToReader` — lecture sans même demander au serveur) et le grant post-refus sont supprimés ; même état `sync_available` + même action. La télémétrie abonné passe par le même enforce que tout le monde (quota 100).
- `PremiumContext.initAndListen` : « le serveur dit free, RevenueCat local dit payé ⇒ confiance au device » devient « demander au serveur de vérifier » (`syncEntitlement`) ; si l'appel échoue, le dernier mot du serveur tient.
- Le listener RC : le `setTier(expectedTier)` optimiste (le téléphone écrivant le tier que le serveur serait présumé confirmer) devient une demande de sync ; à défaut, relecture serveur avec retry (le webhook reste le chemin de réconciliation).

**Personne n'est coincé** : un abonné dont le webhook tarde obtient l'accès en un appel edge (~1 s) — plus vite qu'en attendant le webhook — et le bouton de vérification est là à chaque refus. `sync-entitlement` n'accorde JAMAIIS rien (aucun RPC de décision, aucun champ `allowed` — testé structurellement) ; il ne fait pas de CORS (transport RN) ; throttled pour qu'un APK patché ne martèle pas RevenueCat à travers nous.

## 4. Migrations (NON appliquées — découpage M1a/M2/M1c, décisions 2026-09-23)

`supabase/migrations/20260922000001_juno06_server_enforced_features.sql` — **M1a : classification honnête, strictement additive** :

- snapshot Phase 0 pré-encodé (15 lignes tier/quota/preview, sans `updated_at`) vérifié AVANT toute mutation — la migration refuse de courir sur un état divergent ;
- colonne `enforcement_class` (NOT NULL + CHECK sur **cinq** valeurs) + **15 UPDATE littéraux de classification** — les 11 fonctionnalités auditées (2/7/2) PLUS les marqueurs d'inventaire : `tarot` = `legacy_alias` (contrat build 130, jamais compté), 3 graines mortes = `legacy_unused` (jamais présentables comme protégées). **`legacy_alias`/`legacy_unused` ne sont pas des niveaux de sécurité** ;
- **aucun INSERT, aucun DELETE, aucun tier/quota/preview modifié, aucune ligne utilisateur touchée** (comptages premium_usage/subscriptions vérifiés avant/après) ; `synastry.free_preview_quota = 1` conservé (décision produit) ;
- auto-vérification : classes exactes des 15, compteurs audités 2/7/2 (legacy exclus par construction), CHECK validé, snapshot produit identique.

Les mutations produit (6 upserts, 8 previews 1/jour, suppression des graines mortes) sont **M1c : BROUILLON** sous `docs/runbooks/sql/2026-09-juno-06-m1c-product-policies-DRAFT.sql` — interdit jusqu'au build 131 + autorisation produit dédiée ; `validate:premium-gating` refuse tout contenu M1c dans `supabase/migrations` et exige chaque promesse d'aperçu différé dans le brouillon (canaris).

Le contrat client-130 est explicite : mêmes clés, mêmes tiers, mêmes quotas, mêmes previews ; la colonne ajoutée est invisible pour 130 (aucun de ses chemins ne la lit ni ne l'écrit).

`supabase/migrations/20260922000002_sync_entitlement_throttle.sql` (NON appliquée) : table `entitlement_sync_claims` (`user_id` PK → `auth.users`, `last_sync_at`, `created_at`) — l'état du claim du throttle, possédée par `sync-entitlement` seule, sans aucune sémantique produit. RLS activée sans policy (service role seul, il bypass) ; `REVOKE ALL` de `anon`/`authenticated` avec auto-vérification des grants refusés (règle maison 20260903000003 + leçon 20260911000001) et vérification que la PK est bien `user_id` — l'atomicité des deux bras est verrouillée dessus. Contrat comportemental : `supabase/tests/juno06_sync_entitlement_claim.test.sql` (les 4 cas opérateur) et `supabase/tests/juno06_server_enforced_features.test.sql` (C1..C11 : classification, additivité, M2 verrouillée, M1c absente).

## 5. Validateurs et canaris

- `validate:premium-gating` — couverture 11/11, codes de raison alignés (`sync_available` déclaré client-only), **classes exhaustives, compteurs publiés = réalité, accord client↔migration sur la classe la plus forte** ; titre à compteurs séparés.
- `validate:premium-data-sources` — D1–D8 : l'inventaire exécutable (`FEATURE_SOURCES` : où vivent les octets, ce que le serveur possède) doit égaler `ENFORCEMENT_CLASSES` ; D3c/D3d/D4c/D4d refusent toute résurrection du lissage local ; **D7** refuse tout import producteur dans le bundle mobile pour une fonctionnalité `server_enforced_data` ; D7b exige la lecture edge + l'absence de double décision ; D8 refuse toute promesse écrite de protection pour une fonctionnalité `public_content`. Les parseurs ignorent les commentaires (un canary a prouvé la cécité) et les marches ne traversent plus `node_modules`/`.expo`.
- `scripts/canary-premium-validators.mjs` — **9 canaris** : chaque nouvelle règle doit ÉCHOUER sur son défaut (adoption locale du tier, setTier optimiste, grant gardé par canAccessFeature, suppression du sync_available, corpus tarot réimporté, re-wrap PremiumGate, classe mensongère, compteurs gonflés, fonctionnalité sans classe). Restore-on-start si un run est interrompu.

## 6. Tests

- `packages/shared/src/security/__tests__/sync-entitlement.test.ts` (22) — les vrais octets de l'edge via `loadEdgeModule` : `readSubscriberVerdict` (absence de `subscriber` = ambigu ; expiration passée = downgrade vérifié ; lifetime ; premium_plus gagne ; date malformée = ambigu ; ambiguïté sur le palier haut = ambigu pour tout le verdict), `syncCutoff` + budget timeout, invariants structurels (aucun RPC, identité = JWT, claim deux-bras atomique couvrant le compte sans ligne, écriture technique avant l'appel RC, échecs RC sans écriture `subscriptions`, 404 honnête, écritures bornées au jeu de colonnes exact sans colonne de throttle, pas de CORS, logs sans objet erreur brut ni corps RC). Les preuves comportementales des quatre cas de l'opérateur vivent en SQL : `supabase/tests/juno06_sync_entitlement_claim.test.sql`.
- `packages/shared/src/security/__tests__/premium-tarot-reading.test.ts` (10) — **l'artefact EST le moteur partagé** (lecture identique carte à carte, la locale traduit sans redistribuer, fallback EN flaggé pour les 6 non écrites, 78 cartes et les deux corpus intacts, zéro dépendance) ; contrat structurel de l'edge (décision avant production, 402 sans octets, 503 fail-closed, seed = auth.uid, `viaFreePreview`, pas de CORS, import de l'artefact committé).
- `apps/mobile/src/__tests__/premium-reprise-discriminants.test.ts` (16) — le discriminant nommé par l'opérateur : **un faux entitlement après refus reste inaccessible** ; sync échouée ne change rien ; sync réussie n'est pas un grant — seul le nouveau verdict enforce accorde ; patch simulé sur tarot ⇒ aucune lecture (402/réseau/payload malformé) ; aucun import producteur dans le mobile ; le gate ne peut pas accorder après refus ; compteurs 2/7/2 ; contrat 130 (clés, alias `'tarot'`, quotas 1/jour, mapping split).
- `apps/mobile/src/__tests__/premium-server-gate.test.ts` (v1, 10) — les after-proofs structurels de la première passe, toujours verts.
- Suite shared : **1 570 verts** (les deux `orphan-purge` restent l'échec Windows pré-existant, documenté, identique sur master propre). Mobile : 24 verts.

## 7. Séquence de déploiement (quand l'opérateur décide)

1. `supabase db push` **interdit** (JUNO-15) — appliquer `20260922000001` PUIS `20260922000002` par le processus revu ; la première refuse de committer quoi que ce soit d'autre que le catalogue 3/7/2, la seconde crée la table de claim (RLS + grants vérifiés). **Ordre obligatoire** : sans `002`, `sync-entitlement` ne peut pas réclamer son slot et répond `state_unavailable` 503 fail-closed (sûr mais inutile). Puis exécuter `supabase/tests/juno06_sync_entitlement_claim.test.sql` contre la base : les quatre cas (ligne absente, claims concurrents, échec RC après claim, retry après 30 s) doivent finir `4/4 cases green`.
2. Déployer `premium-tarot-reading` **après** la migration (avant elle, l'edge répond `unknown_feature`… non : les clés existent depuis 20260511000002 pour tarot_cosmic/monthly ; la colonne classe n'affecte pas enforce — l'edge est déployable dès que la migration est appliquée, et pas avant pour que le catalogue honnête existe en base).
3. Secrets à vérifier avant deploy : `REVENUECAT_API_KEY` (déjà requis par `backfill-revenuecat` — même secret, aucune rotation), rien de nouveau côté Stripe.
4. Déployer `sync-entitlement` ; `REVENUECAT_API_KEY` absent ⇒ 500 `config_error` fail-closed (aucun état corrompu).
5. Build 131+ : le mobile appelle les edges ; Play notes : aucune promesse « server-enforced » au-delà du tarot.
6. Vérifications post-déploiement : l'edge refuse un compte free (`402 premium_required`, aucune carte) ; `sync-entitlement` 429 au 2e appel < 30 s ; un abonné en retard de webhook accède via « Vérifier mon abonnement » ; les logs `generation=…` n'existent pas ici (contrairement à unsubscribe) — le signal est `premium_usage.reason = 'free_preview'` sur les lectures tarot.

## 8. Décisions produit restantes (hors périmètre de cette reprise)

- **Horoscopes** : un corpus serveur existe déjà (`send-daily-horoscope`, astuces par signe, rotation jour-de-l'année) — brancher les écrans dessus les ferait passer `server_metered_ui` → `server_enforced_data` si les libellés locaux sortent du bundle. Décision à prendre ; le classement actuel est resté honnête plutôt que d'anticiper.
- **Conversation Guide** : le corpus embarqué est une décision de conception (anglais seul, hors locales, les deux plateformes, situation gratuite hors ligne). Le déplacer derrière une edge ferait de même. Décision à prendre.
- **Transits/retrogrades** : décision produit prise = porte conservée, classe `public_content` documentée. Revenir dessus = soit retirer la porte (tout public), soit brancher une vraie source (éphéméride serveur).
- **Natal/synastry** : le moteur astro est embarqué pour le fallback synastrie et le calcul natal propre ; les sortir du bundle est le chantier « éphéméride serveur » de l'audit, hors périmètre.
