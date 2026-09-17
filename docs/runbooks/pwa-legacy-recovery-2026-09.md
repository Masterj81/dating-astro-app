# Runbook — Récupération des anciennes PWA et stratégie de mise à jour (JUNO-16)

**Date : 17 septembre 2026 · Statut : chantier TERMINÉ et prouvé — la condition « preuve A→B » de la bascule `PUBLISH_LEGACY_DEGREES` est satisfaite (Porte 1).**

Ce document décrit l'architecture retenue pour garantir qu'une PWA JUNO installée avant un déploiement reçoive correctement la version courante, la preuve comportementale exécutée, et les conditions exactes de la bascule `PUBLISH_LEGACY_DEGREES`.

---

## 1. État initial réellement trouvé (inventaire du 17 sept 2026)

| objet | état mesuré | chemin |
|---|---|---|
| Service worker servi | **kill-switch uniquement** : `skipWaiting` à l'install, purge de TOUS les caches, `registration.unregister()`, `clients.matchAll` + `client.navigate(url)` (reload forcé), fetch **pass-through** (aucun `respondWith`, aucune écriture de cache) | `apps/web/public/service-worker.js` (24 lignes actives) |
| Enregistrement du SW par l'app | **AUCUN** — `apps/web/src` ne contient aucune occurrence de `navigator.serviceWorker` ni `serviceWorker.register`. Le kill-switch n'est jamais enregistré par la version courante : il n'est **repris** que par l'update check du navigateur sur les anciennes registrations | vérifié par `validate:pwa-kill-switch` (balayage `apps/web/src`) |
| Ancien SW (celui des vieilles PWA) | cache **`astrodating-v1`**, `cache.addAll(['/','/manifest.json','/icon-192.png','/icon-512.png'])`, runtime **network-first** same-origin (skip `/api/`, `supabase.co`, externe), handlers `push`/`notificationclick` affichant **« AstroDating »** — retiré de l'arbre au commit `f9bc682`→monorepo, kill-switch posé en `a997da4` (8 mai 2026) | `git show f9bc682:public/service-worker.js` |
| Manifeste | `id "/"`, `start_url /app/`, `scope /`, maskable **dédié** (assets séparés), screenshots (Richer Install UI, vague 1), aucun « AstroDating » | `apps/web/public/manifest.json` |
| En-têtes Vercel | **AUCUN header défini** avant ce chantier (`vercel.json` nu) | `vercel.json` |
| Caches applicatifs | aucun — pas de Workbox, pas de `next-pwa`, pas de stockage de responses ; les seuls caches possibles étaient ceux du vieil SW et le cache HTTP du navigateur | — |

**Conséquence de l'architecture** : une PWA installée avant mai 2026 porte le vieil SW à l'URL `/service-worker.js` ; le navigateur re-vérifie ce script **au maximum toutes les 24 h et à chaque navigation dans le scope** (et le script d'un update check contourne le cache HTTP par défaut — `updateViaCache` vaut `imports` : le script principal est toujours re-téléchargé). Le vieil SW est donc remplacé par le kill-switch, qui purge et s'auto-désenregistre. Une PWA installée après mai 2026 n'a jamais eu de SW : chaque ouverture charge depuis le réseau.

## 2. Le mécanisme de reprise, prouvé (JUNO-16 fermé)

`scripts/pwa-legacy-recovery.mjs` — harnais Playwright/Chromium exécuté le 17 sept 2026 : **15/15 PASS**. Il simule la chaîne réelle, pas une assertion de composant :

- **Phase A** : le serveur local sert le **vrai vieil SW** (copie exacte et figée de `f9bc682`, cache `astrodating-v1`) et une page A qui l'enregistre — activation, `clients.claim`, cache rempli, session posée dans `localStorage`.
- **Phase B** : le serveur sert le **kill-switch RÉEL du dépôt** (lu au runtime par le harnais) et une page B identifiable ; une navigation dans le scope contrôlé déclenche l'update check.

**Verdits mesurés** : (1) la page finit sur B, sans mélange A/B ; (2) **zéro** registration restante ; (3) **zéro** cache restant (`astrodating-v1` purgé) ; (4) la **session survit** ; (5) réouverture → B, zéro registration, zéro cache — **aucune boucle de ré-enregistrement** (la page B, comme l'app réelle, n'enregistre rien) ; (6) **hors ligne** après guérison : la navigation échoue honnêtement (aucun cache résiduel ne sert du contenu périmé), retour en ligne → B ; (7) **multi-onglets** : deux clients contrôlés par A finissent tous deux sur B, propres, session intacte dans l'onglet non navigué.

## 3. Architecture finale — matrice des stratégies

**Il n'existe volontairement AUCUN cache applicatif.** La matrice est donc le comportement HTTP observé :

| catégorie | stratégie | justification |
|---|---|---|
| Service worker (`/service-worker.js`) | réseau, **`Cache-Control: public, max-age=0, must-revalidate`** (posé par ce chantier) | la spec contourne déjà le cache HTTP pour le script d'update (`updateViaCache=imports`) ; l'en-tête est la garantie permanente contre toute régression (updateViaCache futur, proxy, mode compat) |
| Manifeste (`/manifest.json`) | réseau, **`max-age=0, must-revalidate`** (posé par ce chantier) | **la spec ne protège PAS le manifeste** : un cache HTTP long gèlerait `start_url`/icônes/screenshots chez les vieux clients |
| HTML / navigations | réseau (routes dynamiques App Router) | jamais cache-first ; impossible de rester indéfiniment périmé |
| Chunks fingerprintés (`/_next/static/*`) | immuables (en-tête Vercel standard) | le fingerprint fait loi : un HTML neuf ne référence que des chunks neufs |
| Images/`public/*` | cache HTTP navigateur standard | pas de couche SW |
| **Réponses API / Supabase / contenus privés** | **JAMAIS mis en cache** — aucun SW pour les intercepter | la confidentialité est garantie par l'absence même du mécanisme : aucun profil, aucune synastrie, aucun jeton ne peut se retrouver dans un Cache Storage |
| Hors ligne | honnête : la navigation échoue | assumé par le plan PWA §1.4 (produit principalement connecté) |

**Défense en profondeur ajoutée** : les deux en-têtes `no-cache` du `vercel.json`. **Aucune nouvelle dépendance** : le kill-switch et le harnais n'utilisent que des primitives natives.

## 4. Cycle A → B (procédure opérateur)

1. Déployer (Vercel). Le nouveau build sert le kill-switch actuel à `/service-worker.js`.
2. Une ancienne PWA, à sa prochaine navigation dans le scope (au pire 24 h), re-télécharge le script → byte-diff → install → `skipWaiting` → activate → purge des caches → `unregister` → reload du/des clients.
3. Après ce cycle : `DevTools → Application → Service Workers` vide, `Cache Storage` vide, la PWA fonctionne en mode réseau pur.
4. Vérification en production : sur un profil ayant connu l'ancienne PWA, constater l'absence de registration et de cache après une navigation.

**Retour arrière** : aucun nécessaire — l'état final est « pas de SW », qui est l'état cible du plan PWA. Si le fichier kill-switch devait un jour être retiré (condition documentée dans le fichier : plus AUCUN SW résident observé en production), le retirer ne casse rien : les registrations déjà évacuées ne reviennent pas ; seules d'éventuelles PWA jamais ouvertes depuis mai 2026 conserveraient le vieil SW — d'où la recommandation de le laisser en place indéfiniment (coût nul : 24 lignes).

## 5. Diagnostic d'une PWA « bloquée »

1. Ouvrir la PWA → DevTools (ou `⋮ → More tools → Web Inspector` selon la plateforme).
2. `Application → Service Workers` : une registration active ? Son scriptURL doit être `/service-worker.js` et son état « activated ». Si c'est le **vieux** SW (`astrodating-v1` visible dans `Cache Storage`) : forcer `Update` (ou rouvrir la PWA) — le kill-switch reprend et purge.
3. `Application → Cache Storage` : après le cycle, vide. Sinon, `Update` puis reload.
4. **Procédure utilisateur non destructive** (aucune donnée locale perdue autre que le cache) : rouvrir la PWA deux fois de suite. Si un contenu semble périmé : recharger explicitement. **Ne jamais demander de « Effacer les données du site »** — cela déconnecterait la session.
5. Cas extrême documenté (échec du SW lui-même) : supprimer la PWA et la réinstaller depuis `app.junosynastry.com` — la session web est conservée par les cookies/localStorage du navigateur si le profil Safari/Chrome n'est pas lui-même nettoyé.

## 6. `PUBLISH_LEGACY_DEGREES` — portes et état

Drapeau : `supabase/functions/get-profile-chart/index.ts` (`const PUBLISH_LEGACY_DEGREES = true`).

- **`true` (état actuel)** : la réponse publique porte `sign` + `degree` quantifié (0,1°) — les builds Android **installés** reconstruisent la synastrie localement (`parseStoredPlacement`) ; retirer les degrés les casserait (hydratation nulle → fallback sign-rhythm) tant qu'ils n'ont pas mis à jour.
- **`false` (cible)** : la réponse porte les signes seuls + la synastrie calculée serveur (`response.synastry`) ; plus aucune précision de placement ne quitte le serveur. Le lecteur (`resolveSynastryView`) préfère déjà la lecture serveur — c'est la seule voie que `false` laisse.
- **Retour arrière** : remettre `true` et redéployer l'edge uniquement.

**Les deux portes avant la bascule** (le validateur `validate:pwa-kill-switch` refuse un `false` sans les deux preuves datées ci-dessous) :

- **Porte 1 — mécanisme PWA ancien → nouveau prouvé : FAITE le 2026-09-17** (harnais `pwa-legacy-recovery.mjs`, 15/15 — section 2). Un ancien client web finit par charger un bundle consommant `response.synastry`.
- **Porte 2 — adoption Android ≥ 95 % pendant 7 jours consécutifs : NON FAITE — c'est la seule dépendance externe restante.** Méthode (consignée au plan PWA §10.5) : Play Console → Statistiques → Utilisateurs actifs → quotidien, groupé par version d'app, export CSV daté ; seuil ≥ 95 % de la base active sur `versionCode 130` pendant 7 jours consécutifs (délai de données Play : 24–48 h). Quand le seuil est atteint : dater la Porte 2 ci-dessous, basculer le drapeau, redéployer l'edge, et `npm run validate:chart-privacy` (qui couvre les deux modes) reste vert par construction.

## 7. Preuves exécutées (17 sept 2026)

- `node scripts/pwa-legacy-recovery.mjs` — **15/15 PASS** (A→B, session, réouverture sans boucle, offline/online, multi-onglets).
- `npm run validate:pwa-kill-switch` — tous verts (structure ci-dessus, portes documentées).
- Validations de non-régression du dépôt : suites web/shared, typecheck, lint, build web, validateurs de locales et de sécurité — exécutées au commit (voir le rapport de session).

## 8. Ce qui reste exclusivement externe

La **mesure d'adoption Android** (Porte 2) : Play Console seul la fournit, avec son délai de 24–48 h ; le dépôt ne peut pas la produire. Tout le reste — mécanisme, preuve, en-têtes, validateur, runbook — est terminé.

## 9. Conditions exactes autorisant `PUBLISH_LEGACY_DEGREES = false`

1. Porte 1 FAITE (elle l'est — datée ci-dessus).
2. Porte 2 datée au runbook après 7 jours consécutifs ≥ 95 % (export Play Console archivé).
3. Alors : basculer le drapeau dans `get-profile-chart/index.ts`, redéployer l'edge seul, observer `validate:chart-privacy` et `validate:pwa-kill-switch` verts (le second exige les deux dates).
