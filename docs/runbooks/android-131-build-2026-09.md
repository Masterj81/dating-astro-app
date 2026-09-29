# Runbook — Build Android 131 (JUNO-06) — portes de livraison

**Objet :** construire, prouver puis (sous décision distincte) publier le build Android 131 — le premier binaire qui appelle réellement les deux Edges JUNO-06 (`sync-entitlement`, `premium-tarot-reading`).

**État de référence (2026-09-28) :** dernier build Android production = **versionCode 130** (EAS, lecture seule : profil `production`, `appBuildVersion` 130, version 2.1.1, commit `50e8e6d`, FINISHED). `eas.json` : `appVersionSource: "remote"`, profil `production` `autoIncrement: true` → **le prochain build production doit être versionCode 131**. Aucun build n'est lancé dans la préparation de ce runbook.

**Règles d'arrêt (à toute porte) :**

- si EAS produit un `versionCode` autre que 131 → **ARRÊT** ;
- si le build ne correspond pas au merge SHA autorisé → **ARRÊT** ;
- si un E2E échoue → **aucune soumission** ;
- **aucune correction directe sur `master`** (une correction = nouvelle PR + nouvelle revue) ;
- **aucun second build automatique** (chaque build est un acte explicite) ;
- **aucune soumission automatique** — la soumission Play est une décision distincte après la porte 13, jamais une conséquence du build ;
- **aucun nettoyage des preuves DB après les smokes** sans décision explicite (les lignes `premium_usage` / claims créés par les comptes de test sont des preuves jusqu'à décision contraire).

---

## Les quinze portes

### Porte 1 — État Git propre et merge SHA autorisé
Le worktree/le dépôt est propre ; le commit à construire est le merge SHA autorisé pour 131 (rapporté ici au moment de la décision). Noter le SHA complet — il doit être celui du build EAS (porte 6).

### Porte 2 — CI verte
Tous les workflows GitHub Actions du SHA sont `success` (CI/Quality Gates, Gitleaks, CodeQL). Un check rouge ou absent → ARRÊT.

### Porte 3 — Lecture du prochain `versionCode` (lecture seule) et décision de version commerciale
```
npx eas-cli build:list --platform android --non-interactive --limit 3 --json
```
Le dernier `appBuildVersion` production doit être **130** (donc prochain = **131** par `autoIncrement`). Tout autre valeur → ARRÊT avant build.
**Version commerciale :** la décision `versionName` (conserver `2.1.1` ou bump) appartient à l'opérateur à cette porte — le dépôt ne fixe pas de règle semver par build ; historique EAS : 2.0.0→124-127, 2.1.0→128-129, 2.1.1→130. Le présent runbook ne préjuge pas de la valeur.

### Porte 4 — Variables et secrets (noms uniquement)
Le binaire n'exige que les variables **publiques** déjà câblées : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_STRIPE_PRICE_*`, `EXPO_PUBLIC_PROJECT_ID`. Vérifier leur présence EAS **par leur nom** — jamais afficher une valeur. Aucun secret serveur n'est requis par le client (garde G7 du validateur).

### Porte 5 — Lancement unique du build Production
```
cd apps/mobile && npx eas-cli build --profile production --platform android --non-interactive
```
Un seul lancement. `autoIncrement` attribue 131. Aucun retry automatique : un échec se diagnostique puis se relance par décision explicite.

### Porte 6 — Vérification d'association
Depuis `eas-cli build:list`/`build:view` : le build porte le **SHA de la porte 1**, le profil `production`, `appBuildVersion` **131**, et la `versionName` décidée en porte 3. Toute divergence (SHA, profil, versionCode ≠ 131) → ARRÊT.

### Porte 7 — Téléchargement de l'artefact
Télécharger l'AAB depuis EAS. Noter taille + URL EAS.

### Porte 8 — Vérification statique (avant tout appareil)
```
node scripts/inspect-android-artifact.mjs <artefact.aab> --json
```
Doit produire : `versionCode=131`, `package=com.astrodatingapp.mobile`, SHA-256 (à consigner), présence des appels `sync-entitlement` + `premium-tarot-reading`, **aucun** marqueur corpus/moteur/secret (`major-00`, `generateReading`, `tarot.generated`, noms `SUPABASE_SERVICE_ROLE*`/`REVENUECAT_API_KEY`). Échec → ARRÊT.

### Porte 9 — Installation sur appareil de test
Installer l'AAB (ou l'APK `production-apk` équivalent) sur l'appareil/émulateur de test dédié. Jamais sur un appareil personnel.

### Porte 10 — E2E free (scénario A)
`.maestro/18-tarot-free-402.yaml` (compte free par env) : 402 → paywall visible, **aucune carte/lecture/signification**, aucun fallback local. (Comptage d'invocation : couvert en déterministe — voir Annexe.)

### Porte 11 — E2E payé (scénario B)
`.maestro/19-tarot-paid-200.yaml` (compte Celestial de test) : lecture serveur rendue, exactement 3 cartes (monthly), révélation par carte, aucune seconde invocation involontaire (postcondition DB porte 12).

### Porte 12 — Postconditions DB bornées (lecture seule)
Après les smokes : `premium_usage` du compte payé a exactement **une** ligne `tarot_monthly` de plus (`view_count=1`), aucune ligne `tarot_cosmic` ; `entitlement_sync_claims`/`subscriptions` inchangés sauf opération explicite. Toute écriture inexpliquée → ARRÊT + enquête. Aucun nettoyage sans décision (règle ci-dessus).

### Porte 13 — Décision distincte de soumission Play
Rassemble : SHA, versionCode 131, versionName, SHA-256 de l'artefact, résultats des portes 10-12, notes de version (500 caractères max/langue, `docs/app-store/`). La soumission (`eas submit` ou Play Console) est **un acte décisionnel séparé** — aucune soumission automatique, quel que soit l'état des portes précédentes.

### Porte 14 — Suivi du rollout
Après soumission : suivre la revue Play, puis le rollout par paliers ; surveiller Sentry (`EXPO_PUBLIC_SENTRY_DSN`) et les logs edge (`sync-entitlement` : `outcome=throttled` attendu en hausse modérée ; `premium-tarot-reading` : aucun 5xx en rafale).

### Porte 15 — Critères de rollback / arrêt
- pics d'erreurs 5xx edge ou crash-rate Play anormal → geler le rollout (Play Console), enquêter ;
- comportement tarot local détecté sur un appareil (contenu sans réseau) → geler (cela contredit la preuve de bundle) ;
- consommation `premium_usage` anormale (multiplications de lignes par ouverture) → geler ;
- retour arrière produit = Play Console (halt rollout) ; **jamais** de correction chaude hors-processus (pas d'OTA : pas d'`expo-updates` dans ce projet) — une correction = nouveau build 132 par ce même runbook.

---

## Annexe — Couverture déterministe des scénarios A→F

| Scénario | Niveau déterministe (CI, sans Production) | Niveau smoke (binaire 131 réel) |
|---|---|---|
| A — free tarot monthly : 402, paywall, zéro contenu | `tarot-client.test.ts` (402 → `premium_required/insufficient_tier`, aucun octet premium) | `.maestro/18-tarot-free-402.yaml` (porte 10) |
| B — payé monthly : 200, 3 cartes, `viaFreePreview=false` | `tarot-client.test.ts` (200 valide, mapping monthly verbatim) | `.maestro/19-tarot-paid-200.yaml` (porte 11) |
| C — double action / concurrence inter-paramètres | `tarot-client.test.ts` — comptage transport : 1 invocation (double tap, mode, période, locale, Try Again) ; pas d'appel différé ; pas de relance auto | `.maestro/20-tarot-double-tap.yaml` (sanity visuelle) |
| D — sync free : 429, temporisation 30 s, pas de boucle | `sync-entitlement-client.test.ts` + `SyncCooldown` (bornes 0/29 999/30 000 ms, faux timers, aucun appel à l'échéance) | Nécessite l'état « appareil payé / serveur free » (webhook en retard) — à exécuter sur staging quand il existera ; non provoquable sur Production |
| E — session expirée : 401 borné, second 401 terminal | `tarot-client.test.ts` + `sync-entitlement-client.test.ts` (≤1 refresh, ≤1 ré-invocation, budget `renewalSpent`) | Mock/interception uniquement — jamais simulé contre Production |
| F — réseau / 5xx : refus honnête, retry explicite seul | `tarot-client.test.ts` (500/503/réseau → `config_error`/`decision_unavailable`/`network`, aucun fallback) | Mode avion sur l'appareil de test : écran d'erreur, aucun contenu, bouton Try Again |

**Comptes de test :** uniquement via variables d'environnement (`TEST_USER_*`, `TEST_CELESTIAL_*` — voir `.maestro/config.yaml` / `docs/E2E.md`). Aucun identifiant dans Git. Les smokes 131 utilisent des comptes de test dédiés, jamais des comptes réels.

**Hors périmètre constants :** M1c, décision natale 1/7 jours, branchement des sept `server_metered_ui` — aucun changement de politique produit n'accompagne le build 131.
