# Runbook — JUNO-18 : durcissement de la chaîne CI/CD GitHub

**Date : 18 septembre 2026 · Statut : CORRIGÉ LOCALEMENT — preuve GitHub requise (CI réelle des nouveaux workflows, Dependabot reconnu, CodeQL exécuté) avant fermeture.**

## 1. Reproduction des sous-constats historiques (18 sept 2026, avant correction)

| Sous-constat 2026-09-07 | État réel constaté | Verdict |
|---|---|---|
| Permissions minimales absentes | `permissions: contents: read` déjà en place (vague 2, 8 sept) + `pull_request` (jamais `_target`) | **déjà corrigé avant ce chantier** |
| Actions par tags mutables | `actions/checkout@v4`, `actions/setup-node@v4` | **confirmé, corrigé ici** |
| Audit dépendances absent | aucun step d'audit | **confirmé, corrigé ici** |
| Scanner de secrets absent | `validate:repo-hygiene` scanne le working tree (regex maison), pas l'historique, pas de règles maintenues | **confirmé, corrigé ici** |
| CodeQL absent | default setup `not-configured`, zéro analyse (API vérifiée) | **confirmé, corrigé ici** |
| Dependabot absent | pas de `.github/dependabot.yml` | **confirmé, corrigé ici** |

## 2. Permissions avant/après

| Workflow | Avant | Après |
|---|---|---|
| ci.yml (Quality Gates) | `contents: read` (workflow) — conservé | idem + checkout `persist-credentials: false` |
| gitleaks.yml (nouveau) | — | `contents: read` (workflow), checkout `fetch-depth: 0` + `persist-credentials: false` |
| codeql.yml (nouveau) | — | workflow `contents: read` ; job analyze : `security-events: write` **+** `contents: read` avec commentaire « pourquoi » (seul ce job écrit le SARIF) |

Aucune permission `write` au niveau workflow (refusé par le validateur). `pull_request` partout — les forks ne reçoivent ni secrets ni token en écriture ; CodeQL official saute l'upload SARIF sans token en écriture.

## 3. Actions et SHA épinglés (sources officielles, release → commit SHA 40)

| Action | SHA | Version |
|---|---|---|
| actions/checkout | `11d5960a326750d5838078e36cf38b85af677262` | v4.4.0 (dernière v4.x — drift minimal) |
| actions/setup-node | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 |
| gitleaks/gitleaks-action | `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` | v3.0.0 |
| github/codeql-action init+analyze | `3ea06614dafe36dec890db3446326e0d40ce53d4` | v3.38.1 |

Chaque ligne porte son commentaire `# vX.Y.Z` (exigé par le validateur) — c'est ce qui permet à Dependabot de proposer les SHA suivants.

## 4. Audit de dépendances — politique et baseline

- **Web** : `scripts/audit-web-runtime.mjs` (CI). Parse le JSON de `npm audit --omit=dev --workspace=@astro/web`, échoue sur tout high/critical non couvert par la **baseline versionnée** `scripts/audit-web-runtime-baseline.json`.
- **Baseline actuelle : 1 entrée** — `postcss@8.4.31` au nœud `node_modules/next/node_modules/postcss` (high, 4 advisories GHSA), justification : épinglage interne de next@15.5.25, build-time uniquement, atteignabilité analysée dans dependency-security §6.1 (JUNO-12 fermé). Échéance 2026-12-31.
- **La baseline ne peut pas dériver** : FAIL sur advisory nouveau (≠ listé), advisory disparu (entrée périmée → retirer), version différente (réévaluation), ensemble d'advisories différent (élargissement), échéance dépassée. Prouvé par injections T1/T2/T3 (exit 1 sur chaque, vert après restauration).
- **Mobile/Expo SDK 54** : dette **bornée et documentée** (dependency-security §6.2, chantier SDK 57 séparé) — volontairement hors de cette porte : `npm audit --audit-level=high` à la racine resterait rouge sur des advisories déjà acceptés sans information nouvelle.

## 5. Scan de secrets — Gitleaks

- Action officielle `gitleaks-action@SHA` (dépôt public : ni licence ni secret requis), workflow dédié, `fetch-depth: 0` (l'historique complet est la vraie garantie ; coût mesuré ~1 min).
- Config versionnée `.gitleaks.toml` : `extend useDefault` + **allowlists chirurgicales** pour les 11 faux positifs du scan historique complet (559 commits) :
  - `luckyDaysV2Lens*` / `monthlyWeekBody_N` : identifiants i18n (le « key » de `labelKey/bodyKey` trip la règle generic-api-key) ;
  - l'en-tête PEM **cité en prose** dans `validate-repo-hygiene.mjs` (le garde qui détecte les PEM réels) — l'allowlist exige la phrase « appears inside » qui suit l'en-tête dans le commentaire : un vrai PEM (matériau base64, pas de prose) reste détecté.
- **Preuves locales** (binaire officiel v8.30.1, checksum SHA256 vérifié) : historique complet **0 leak** ; canaris PEM et Stripe **détectés** (exit 1) puis supprimés, arbre final propre. Note upstream : la règle AWS ne se déclenche pas sur les `AKIA…EXAMPLE` documentés (stopword) — comportement gitleaks, pas de notre intégration.
- Aucune exclusion de répertoire ; aucune baseline contenant du vrai matériel.

## 6. Dependabot — `.github/dependabot.yml`

npm (racine `/`, hebdo lundi, 10 PR max, groupe patch+minor ; **majors hors groupe, zéro auto-merge**) + github-actions (hebdo). `marketingagent/` volontairement absent (chantier étranger non stabilisé).

## 7. CodeQL — advanced setup

Default setup vérifié `not-configured` (zéro double analyse). Workflow dédié (push/PR master + hebdo), `javascript-typescript` sans build, périmètre versionné `.github/codeql/codeql-config.yml` : apps/web/src, apps/mobile (app/services/contexts/utils/plugins), packages/shared/src ; ignore `*.generated.*` et tests.

## 8. Comportement sur forks

`pull_request` partout (jamais `_target`) : secrets retirés des runs fork, token read-only. Gitleaks n'a besoin de rien ; CodeQL saute l'upload SARIF sans token en écriture (comportement officiel de l'action épinglée). Aucun secret exposé à du code de PR.

## 9. Tests discriminants (tous exit 1, restauration vérifiée verte)

| Injection | Cible |
|---|---|
| `@v4` au lieu du SHA | validateur (R3) |
| bloc `permissions:` supprimé | R1 |
| `persist-credentials: true` | R4 |
| `pull_request_target` | R2 |
| `contents: write` au niveau workflow | R1/R6 |
| étape audit retirée | R7 |
| workflow gitleaks supprimé | R7 |
| commentaire de version retiré | R3 |
| `${{ github.event.pull_request.title }}` dans `run:` | R5 |
| canaris secrets PEM + Stripe | gitleaks local |
| baseline vidée / entrée morte / advisory retiré | audit-web-runtime |

## 10. Coût CI

- Gitleaks : workflow séparé, ~1 min (historique 18,5 Mo scanné en ~2 s + install). CodeQL : workflow séparé (durée réelle à mesurer au premier run GitHub — estimation minutes pour le scope JS/TS réduit). Quality Gates : inchangé + 2 steps rapides (validateur structural ~1 s, audit web = un `npm audit --workspace` ~15 s). Un seul `npm ci` par workflow.

## 11. Limites

- Validations **locales** : parse YAML (js-yaml), validateurs, audit, gitleaks binaire — l'exécution **GitHub réelle** (actions épinglées chargées, Dependabot reconnu, CodeQL analysé) est la preuve manquante : c'est l'objet du statut.
- Le validateur CI-security est structurel (sous-ensemble YAML ligne/indentation) — assez pour ses règles, prouvé par injection ; pas un parseur YAML complet.

## 12. Rollback

`git revert` des commits du chantier (le validateur CI-security échouerait s'il restait présent sans gitleaks/dependabot — le retirer aussi). Ne jamais « dérouler » en remettant un tag mutable ou `persist-credentials` par commodité : chaque retrait rouvre la porte que le validateur garde fermée.

## 13. Conditions de fermeture

Workflows poussés → PR avec CI verte (Quality Gates + Gitleaks + CodeQL) → Dependabot reconnu (première PR ou vue config) → permissions effectives vérifiées → alors `JUNO-18 FERMÉ`.
