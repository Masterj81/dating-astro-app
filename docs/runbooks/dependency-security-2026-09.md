# Runbook — JUNO-12 : audit et correction maîtrisée des dépendances runtime

**Date de reproduction : 18 septembre 2026 · État : corrigé localement, commit local non poussé — aucune preuve Production tant que le SHA n'est pas déployé sur Vercel.**

## 1. Méthode de reproduction

Le constat historique (« 47 vulnérabilités, dont `next`, `next-intl`, `undici` runtime ») datait de l'audit du 7 septembre 2026. Il a été **reproduit intégralement** le 18 septembre, sans s'y fier :

```
npm audit --json                      # complet
npm audit --omit=dev --json           # runtime seul
npm audit --omit=dev --workspace=@astro/web --json   # par workspace
npm audit --omit=dev --workspace=@astro/mobile --json
npm audit --omit=dev --workspace=@astro/shared --json
```

Gestionnaire : **npm** (workspaces `apps/*` + `packages/*`, lockfile racine unique). `marketingagent/` a son propre manifest et son propre lockfile et **n'est pas un workspace** : aucune commande racine ne le touche. Son lockfile portait des modifications d'un chantier étranger non commité — laissé intact.

Inventaire des versions résolues : `node scripts/audit-runtime-versions.mjs` (lecture seule ; sert aussi à la réévaluation).

## 2. État avant — 18 septembre 2026

| Audit | Total | Low | Moderate | High | Critical |
|---|---:|---:|---:|---:|---:|
| Complet | **50** | 2 | 26 | 18 | 4 |
| Runtime (`--omit=dev`) | **43** | 2 | 21 | 17 | 3 |
| Web runtime | 8 | 1 | 1 | 5 | 1 |
| Mobile runtime | 39 | 0 | 19 | 17 | 2 |
| Shared runtime | 3 | 0 | 0 | 3 | 0 |

## 3. Atteignabilité — vulnérabilités runtime de la chaîne web

| Package | Avant | Avis dominant | Analyse d'atteignabilité | Verdict |
|---|---|---|---|---|
| `next` | 15.5.14 | **Critical** : RCE non authentifié (Image Optimization AVIF), bypass middleware/proxy (App Router, segment-prefetch, i18n Pages Router), cache poisoning RSC, XSS CSP nonces, SSRF (rewrites, Server Actions), DoS Server Components/Actions, divulgation d'endpoints serveur | L'application web de production EST un Next.js App Router sur Vercel : middleware (`middleware.ts` next-intl), routes API, images `/_next/image`. Entrées contrôlables par l'utilisateur partout | **Atteignable** — corrigé |
| `next-intl` | 4.8.3 | **Moderate** : open redirect ; prototype pollution via `experimental.messages.precompile` | `next-intl` exécute le middleware de locale et rend toutes les pages. `precompile` non utilisé (l'open redirect reste) | **Atteignable** — corrigé |
| `sharp` | 0.34.5 | **High** : CVE libvips/libheif (natif) | Chargé par next pour l'Image Optimization (copie racine — vérifié : `next` est hoisted, donc `node_modules/sharp` racine est la copie réellement chargée) | **Atteignable** — corrigé |
| `ws` | 8.19.0 | **High** : divulgation mémoire non initialisée ; DoS par fragments minuscules | Via `@supabase/realtime-js` (graphe prod de `@supabase/supabase-js`, les deux workspaces) | **Probablement atteignable** — corrigé |
| `undici` | 6.24.1 | **High** | Via `@expo/cli` (chaîne Expo, poste de dev) ; la copie `jsdom` 7.29.1 (dev) n'est pas dans la plage | **Non atteignable en prod** — corrigé quand même (en plage) |
| `js-yaml` | 4.1.1 | **High** : DoS CPU quadratique | Via eslint (dev) et `@expo/xcpretty` (build-time) | **Non atteignable en prod** — corrigé quand même (en plage) |
| `brace-expansion` | 1.1.13 / 2.0.3 / 5.0.5 | **High** : DoS expansion | Chaînes eslint (dev) et outils Expo (build-time) | **Non atteignable en prod** — corrigé quand même (en plage) |
| `@anthropic-ai/sdk` | 0.81.0 (racine) | **Moderate** : permissions de fichiers du Memory Tool | Importé **nulle part** dans le dépôt (l'agent marketing est passé à Gemini avec son propre manifeste) : dépendance morte | **Non atteignable** — **retirée** |

## 4. Corrections appliquées (plus petites mises à jour compatibles)

| Package | Avant | Après | Nature | Workspace |
|---|---:|---:|---|---|
| `next` | 15.5.14 | **15.5.25** | patch (dans `^15.1.0`) | `@astro/web` |
| `next-intl` | 4.8.3 | **4.14.5** | mineure compatible (`^4.8.2` ; peers `next ^15` / `react ^19` vérifiés) | `@astro/web` |
| `sharp` | 0.34.5 | **0.35.4** | déclarée explicitement **en racine** (`^0.35.4`, plage que `next@15.5.25` déclare lui-même : `^0.34.3 \|\| ^0.35.4`) + devDep mobile alignée | racine + `@astro/mobile` (dev) |
| `ws` | 8.19.0 | **8.21.3** | en plage (`@supabase/realtime-js ^8.18.2`) | hoist racine |
| `undici` | 6.24.1 | **6.28.1** | en plage (`@expo/cli ^6.18.2`) | hoist racine |
| `js-yaml` | 4.1.1 | **4.3.2** | en plage | hoist racine |
| `brace-expansion` | 1.1.13/2.0.3/5.0.5 | **1.1.21 / 2.1.7 / 5.0.12** | en plage, toutes copies | hoist racine |
| `@anthropic-ai/sdk` | 0.81.0 | **(retirée)** | dépendance morte, aucune import | racine |

Notes d'exécution :
- **`npm audit fix` rejeté** : sa simulation recalculait tout l'arbre (345 suppressions, 158 changements) — inacceptable. Toutes les mises à jour ont été faites par `npm install <pkg>@<version>` ciblé et `npm update <pkg>` en plage.
- **`sharp`, le piège de la double copie** : déclarée d'abord dans `apps/web`, npm a résolu `apps/web/node_modules/sharp` 0.35.4 **et** laissé la copie racine 0.34.5 — or `next` étant hoisted en racine, c'est la copie racine qu'il charge (résolution par proximité). La déclaration a donc été déplacée **en racine**, une entrée de lockfile coincée (`apps/mobile/node_modules/sharp` 0.34.5, devDep mobile) a été retirée puis re-résolue par `npm install` : il ne reste **qu'une copie**, 0.35.4, en racine. Un override racine a été essayé puis **retiré** : npm ne l'applique pas à une entrée optionnelle déjà verrouillée.
- **Aucune mise à jour majeure forcée** (`npm audit fix --force` interdit et non utilisé) ; aucun override ne subsiste.
- **Diff du lockfile** : outre les résolutions listées, `npm dedupe` a relocalisé des blocs entre niveaux de hoist (~300 blocs déplacés). Chaque ajout a été vérifié atteignable depuis les manifestes (`npm ls`) ; `npm ci --dry-run` valide la synchronisation lockfile ↔ manifestes.

## 5. État après — vérification tranchante

| Audit | Avant | Après | Delta |
|---|---:|---:|---:|
| Complet | 50 | **42** | −8 |
| Runtime | 43 | **35** | −8 |
| Runtime critical | 3 | **2** | −1 |
| Runtime high | 17 | **12** | −5 |

Ensembles comparés : **disparus** = `@anthropic-ai/sdk`, `brace-expansion`, `icu-minify`, `js-yaml`, `next-intl`, `sharp`, `undici`, `ws` ; **nouveaux** = **aucun** (aucune vulnérabilité déplacée). `next` n'est plus porteur d'aucun avis propre (critical → absent) ; il n'apparaît plus qu'en **moderate hérité** de son `postcss` imbriqué.

Reproductibilité : `npm ci --dry-run` → `up to date` (lockfile et manifestes synchrones).

## 6. Vulnérabilités résiduelles — documentées, non corrigées ici

### 6.1 `postcss` 8.4.31 imbriqué dans `next` (high, héritée par `next` en moderate)

- **Raison** : `next@15.5.25` épingle `postcss@8.4.31` exactement ; aucun correctif en plage n'existe sans override forcé.
- **Atteignabilité** : **non atteignable en production, avec preuve** — les quatre avis exigent du CSS ou des `sourceMappingURL` **contrôlés par l'attaquant** ; PostCSS ne s'exécute chez JUNO qu'au **build** sur nos propres feuilles de style. Aucune saisie utilisateur n'entre dans PostCSS.
- **Mesures compensatoires** : aucune nécessaire (build-time, entrées internes).
- **Version attendue** : celle que next embarquera (suivre les notes de version 15.5.x/16).
- **Critère de réouverture** : si un jour du CSS fourni par l'utilisateur transite par PostCSS.
- **Réévaluation** : à chaque bump de `next`.

### 6.2 Chaîne Expo SDK 54 (39 findings mobile runtime, dont 2 critical)

- **Concerne** : `expo` 54.0.33, `@expo/cli`, `metro`, `tar` (critical), `shell-quote` (critical), `xcode`, `@bacons/*`, `@xmldom/xmldom`, `lodash`, `image-size`, `browserslist`, `uuid`, `query-string`/`decode-uri-component` (react-navigation), et les packages directs `expo-router`, `expo-constants`, `expo-linking`, `expo-notifications`, `expo-splash-screen`, `expo-auth-session`.
- **Raison** : le correctif proposé par npm est **Expo SDK 57** — trois SDK majeures au-dessus (54→55→56→57). Une telle montée exige `npx expo install --fix`, un rebuild natif EAS, la revalidation Maestro complète : **mise à jour majeure, hors périmètre de ce chantier** (règle §5 de la mission).
- **Atteignabilité**, en deux classes :
  - **Outils de build/CLI/metro** (`@expo/cli`, `metro*`, `tar`, `shell-quote`, `xcode`, `@bacons/*`, `@xmldom/xmldom`, `lodash`, `image-size`, `browserslist`, `uuid`) : **non atteignables en production avec preuve** — ils s'exécutent sur le poste de développement ou le runner EAS au build ; Metro n'empaquette dans l'APK que le JS réellement importé par l'application.
  - **Bibliothèques embarquées dans l'APK** (`expo-router`, `expo-constants`, `expo-linking`, `expo-notifications`, `expo-splash-screen`, `expo-auth-session`, `@react-navigation/core` → `query-string`/`decode-uri-component`) : **probablement atteignables** dans l'app (deep links `astrodating://` → parsing d'URI), sévérité au plus moderate.
- **Mesures compensatoires** : les deep links ne transportent pas de saisie utilisateur arbitraire ; les écrans liés valident leurs paramètres.
- **Version attendue** : Expo SDK 57 (`expo@57.0.24`+).
- **Critère de réouverture** : toute nouvelle advisory high/critical **atteignable** dans l'APK.
- **Échéance de réévaluation** : chantier de montée SDK 57 à planifier ; réexécuter `node scripts/audit-runtime-versions.mjs` + les audits du §1 à chaque bump Expo.

### 6.3 Divers build-time

`@babel/core` (low, chaîne metro), `baseline-browser-mapping` (build-time browserslist) : non atteignables, suivent la chaîne Expo.

## 7. Validations exécutées après correction

| Contrôle | Résultat |
|---|---|
| `npm ci --dry-run` (lockfile reproductible) | `up to date` ✅ |
| Audit runtime après | 35 (−8), critical 3→2, high 17→12 ✅ |
| `npm run test` (turbo) | shared **1602/1602**, web **61/61** (dont Contact/Turnstile, auth callback, CSP, PWA), mobile « No tests yet » ✅ |
| `npm run typecheck` | 3/3 workspaces ✅ |
| `npm run lint` | 0 erreur (19 warnings préexistants) ✅ |
| `npm run build:web` | compilé, 352 pages, middleware 46,6 kB ✅ |
| `validate:web:locales` / `validate:locale-contract` | propres (2 354 clés × 8) ✅ |
| `validate:email-templates` | 1 149 checks ✅ |
| `validate:premium-gating` | propre ✅ |
| `git diff --check` | propre ✅ |

## 8. Correction locale vs preuve Production

Ce runbook prouve l'état **local**. Rien n'est fermé en production tant que :
1. le push n'est pas autorisé ;
2. la CI n'est pas verte ;
3. Vercel n'a pas déployé le SHA exact ;
4. la fumée web de base n'a pas confirmé le site en ligne (une seule passe : marketing, `/app`, `/en/contact` avec widget Turnstile visible).

Après déploiement, re-vérifier côté Vercel que la version déployée embarque bien `next` 15.5.25 (`x-vercel-id` + build logs).
