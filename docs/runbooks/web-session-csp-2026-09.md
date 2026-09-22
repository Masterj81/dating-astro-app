# Runbook — JUNO-05 + JUNO-13 : sessions web en cookies et durcissement CSP

**Date : 21 septembre 2026 · Statut : PARTIELLEMENT CORRIGÉS (worktree `fix/juno-05-13-web-session-csp`, base `origin/master` `49b8602`) — preuve Production requise (déploiement + fenêtre Report-Only) avant toute fermeture.**
**Verdicts séparés : JUNO-05 « PARTIELLEMENT CORRIGÉ — WEB STORAGE SUPPRIMÉ, FERMETURE CONDITIONNÉE À L'ENFORCEMENT CSP EN PRODUCTION » (les jetons ont quitté localStorage, mais restent lisibles par JavaScript dans des cookies non-HttpOnly : tant que la CSP sans `'unsafe-inline'` est en Report-Only, une extraction XSS n'est PAS encore bloquée) ; JUNO-13 « EN OBSERVATION REPORT-ONLY » (l'enforcement sans `'unsafe-inline'` n'est pas encore appliqué).**

## 1. Reproduction (Phase A, lecture seule)

**JUNO-05** — chaîne complète code→bibliothèque : `supabase-browser.ts` créait le client via `createClient` (supabase-js 2.98) avec `persistSession:true` et **aucun adaptateur** ; la source installée d'auth-js fait alors `this.storage = globalThis.localStorage` (clé `sb-<ref>-auth-token`) : session complète — access **et** refresh token — lisible par tout script injecté. **37 fichiers** appellent `getSupabaseBrowser()`.

**JUNO-13** — 6 surfaces de production mesurées : `'unsafe-inline'` dans `script-src` **et** `script-src-elem`, `frame-ancestors` **absent**, `worker-src` **absent**, COOP/CORP/COEP **absents**. Inventaire du HTML servi de `/en/app` : **15 scripts inline, 100 % machinerie Next** (payload Flight `__next_f` ×11, hints React Compiler, relocalisation favicon) — zéro script/handler/style inline applicatif.

## 2. La porte préalable — nonce vs rendu statique (PoC sur Next 15.5.25 exact)

PoC minimale (`%TEMP%\juno-nonce-poc`, jamais commitée) + doc officielle :

| Question | Réponse mesurée |
|---|---|
| Le middleware à nonce seul déclasse-t-il les pages statiques ? | **Non** — `page-static.html` prérendu conservé |
| Un nonce exige-t-il le rendu par requête ? | **Oui** (doc : « you must use dynamic rendering ») — le HTML prérendu ne peut pas porter un nonce par requête |
| Le nonce s'applique-t-il automatiquement aux scripts Next ? | **Oui** — via le header CSP **de requête** posé par le middleware (Next l'extrait et le pose sur ses scripts) ; PoC runtime : 2 requêtes → 2 nonces différents, scripts inline porteurs |
| SRI/hashes peuvent-ils remplacer le nonce ici ? | **Non** — le SRI expérimental couvre les assets externes, pas le payload Flight **inline** (232 Ko, dynamique par page) |
| Un nonce global convertirait-il les 352 pages en SSR ? | **Oui** → rejeté (SEO, cache CDN, TTFB, coût Vercel) |

**Décision : politique SÉPARÉE.** Marketing : statique, enforcement actuel (renforcé — §6). Sous-arbre `/{locale}/app/**` : rendu par requête + politique à nonce, d'abord en **Report-Only**.

Découverte en route (mesurée) : sur 15.5.25, `export const dynamic = "force-dynamic"` dans un layout n'a **pas** déclassé le sous-arbre (pages client) ; la **lecture `headers()` dans le layout** oui — comportement confirmé au runtime (nonces différents par requête dans le HTML servi, `Cache-Control: private, no-cache, no-store`).

## 3. Sessions — architecture réelle et propriétés HONNÊTES

- `@supabase/ssr@0.12.7` (officiel) + `@supabase/supabase-js@2.114.0` (**exactement le minimum requis** par le peer ; copie unique dans l'arbre ; alternative « zéro bump » ssr 0.6.1 rejetée : un an de correctifs de cookies en moins). Audit runtime après : **identique** à avant (35 global, web = baseline postcss inchangée).
- **Les cookies NE SONT PAS HttpOnly** — le SDK navigateur doit lire/rafraîchir les jetons (écrits via `document.cookie`). C'est la limite documentée, pas une propriété simulée. Ce que la migration achète réellement : sortie de localStorage, `Secure; SameSite=Lax; Path=/`, préfixe `__Host-` en production (contrat navigateur : Secure+Path=/+sans Domain — une mauvaise config échoue à l'écriture, fail-closed), lisibilité serveur (refresh middleware). **L'autre moitié de JUNO-05 — un XSS lisant le stockage — se ferme par le nonce CSP (JUNO-13).** Le véritable modèle HttpOnly = BFF (jetons détenus serveur) : refonte des 37 appelants, chantier séparé, non entrepris.
- Chunking : sessions > 4 Ko → chunks `<base>-0`, `-1`… gérés par l'adaptateur.

### Attributs exacts des cookies (sans valeurs)

| Attribut | Production | Dev (localhost) |
|---|---|---|
| nom de base | `__Host-juno.sb` | `juno.sb` |
| Secure | ✓ | ✗ (localhost ne peut pas) |
| SameSite | Lax | Lax |
| Path | `/` | `/` |
| Domain | (aucun — requis par `__Host-`) | (aucun) |
| HttpOnly | ✗ (voir limite ci-dessus) | ✗ |

### Flux couverts (37 appelants non modifiés — point de bascule unique `getSupabaseBrowser`)

| Flux | Comportement après migration |
|---|---|
| PKCE (Google/Apple/Facebook) | `code_verifier` dans les cookies ; `exchangeCodeForSession` au callback le relit de là |
| Magic link (`?token_hash`) | `verifyOtp` → session en cookies |
| Navigation authentifiée | `getSession` lit les cookies (adaptateur) ; garde AppShell inchangé |
| Refresh | client `autoRefreshToken` (inchangé) **+** middleware `getUser()` (refresh serveur officiel, cookies écrits sur requête ET réponse, jamais écrasés en bloc) |
| Logout | `signOut` purge les cookies via l'adaptateur |
| Multi-onglets | `onAuthStateChange` inchangé ; cookies partagés par construction |
| Redirections | confinées à `/app` (normaliseAuthNext inchangé) |
| API web | **restent Bearer** (aucune surface cookie-auth créée) |

### Sessions legacy localStorage

**Déconnexion contrôlée, pas de migration** : aucun jeton n'est lu ni copié (seuls des NOMS de clés sont inspectés). `clearLegacySupabaseLocalStorage()` retire, à la construction du client : `sb-*-auth-token`, `sb-*-auth-token-code-verifier`, `supabase.auth.token`, `supabase.auth.token-code-verifier` — et rien d'autre. Les lecteurs revenus après déploiement se reconnectent : état honnête après une migration de stockage. Prouvé en test qu'aucune clé ne réapparaît après login (jsdom + `vi.resetModules` = chargement de page frais).

## 4. CSRF

Aujourd'hui : **zéro surface cookie-auth** (les 4 routes API = Bearer ; webhooks = edge functions). `SameSite=Lax` retient déjà le cookie des POST cross-site. Garde préparée : `lib/origin-guard.ts` (`assertSameOriginRequest` — fail-closed : Origin **et** Referer absents → 403 ; correspondance d'origine exacte sur la liste autorisée). Le validateur **refuse** toute future route mutante important un client serveur Supabase sans cette garde.

## 5. CSP — avant/après

**Enforcement (global, statique — `next.config.ts`) :**

| Directive | Avant | Après |
|---|---|---|
| script-src / script-src-elem | `'self' 'unsafe-inline' + hosts` | inchangé (phase 1 — le retrait d'`'unsafe-inline'` est PHASE 2, après la fenêtre Report-Only) |
| frame-ancestors | absent | **`'none'`** |
| worker-src | absent | **`'self'`** (SW kill-switch même origine) |
| object-src / base-uri / form-action | `'none'` / `'self'` / `'self'` | inchangés (déjà en place) |
| COOP | absent | **`same-origin`** (OAuth = redirection pleine page, aucun popup : rien à casser) |
| CORP | absent | **`same-origin`** |
| COEP | absent | **différé volontairement** (exigerait CORP/credentialless sur chaque ressource cross-origin consommée : Supabase, Turnstile, images — non prouvé) |
| Turnstile (script-src + script-src-elem + frame-src) | présent | **conservé** (garde JUNO-07 intacte) |

**Report-Only (sous-arbre `/{locale}/app/**` uniquement, middleware) :** politique à nonce fraîche par requête — `script-src 'self' 'nonce-…' 'strict-dynamic' + hosts`, `script-src-elem 'self' 'nonce-…' + hosts`, `style-src 'unsafe-inline'` (**justification distincte** : les styles ne sont pas exécutables ; Next/third-party injectent des attributs de style), frame-ancestors `'none'`, worker-src `'self'`, object-src `'none'`, base-uri/form-action `'self'`, frame-src Turnstile seul. Le nonce voyage sur le header CSP **de requête** → Next le pose automatiquement sur ses scripts inline pendant le rendu par requête.

**Mesures runtime (worktree, `next start`) :** `/en/app` ×2 → nonces **différents**, 34 tags script porteurs, `Cache-Control: private, no-cache, no-store` (un HTML à nonce n'est **jamais** cacheable publiquement) ; `/en/contact` → aucun Report-Only, enforcement seul ; `/service-worker.js` → CSP statique + `public, max-age=0` (le `must-revalidate` de vercel.json s'ajoute en prod).

**Unique source de vérité enforcement** : le middleware ne pose **pas** de CSP de réponse (aucun doublon de header — deux CSP s'intersectent et l'une bloque toujours plus) ; il ne pose que le Report-Only.

## 6bis. Production au SHA `bd61436` (fusion PR #63, 21 sept 15h40Z) — fumée et DÉFAUT MESURÉ

**Verts (mesurés)** : Report-Only présent sur `/en/app` uniquement, nonce **différent par réponse** ; enforcement global renforcé servi partout (`frame-ancestors 'none'`, `worker-src 'self'`, COOP+CORP same-origin) ; marketing (`/en/contact`) **sans** Report-Only ; `/service-worker.js` CSP correcte + `public, max-age=0, must-revalidate` (vercel.json ajouté) ; `Cache-Control: private, no-store` sur `/en/app`.

**DÉFAUT (la fenêtre Report-Only fait son travail)** : sur la production Vercel, **aucun script inline du HTML servi ne porte le nonce** (0/16), alors que le même build en local en porte 34. Preuves : deux GET → HTML **bit-à-bit identique** (256 360 o) pendant que les headers RO changent à chaque réponse → le runtime sert un rendu **mis en cache** dont les headers sont régénérés ; l'injection de `x-nonce`/CSP côté client n'atteint pas le rendu. Hypothèse principale : le sous-arbre `/app` reste servi comme prérendu revalidé (le `headers()` du layout n'a pas suffi sur ce déploiement), donc Next n'applique jamais la CSP de requête au rendu.

**Conséquence honnête** : la politique RO ne peut PAS être validée en l'état (elle rapporterait des violations fantômes : scripts inline sans nonce sous une politique qui l'exigerait). **La phase 2 (enforcement) est BLOQUÉE jusqu'à correction.**

**Plan correctif (à autoriser)** : garantir le rendu par requête réel du sous-arbre sur Vercel — options mesurables : (a) lire `headers()` dans la **page** `/app` (pas seulement le layout) ; (b) `export const revalidate = 0` + `dynamic` au niveau page ; (c) si Vercel serve un shell prérendu, rendre la lecture de nonce explicite (composant serveur qui consomme `x-nonce`) pour forcer l'opt-in dynamique. Chaque option sera prouvée par la même mesure (HTML ≠ entre deux requêtes ET nonces portés) avant tout changement d'enforcement.

### 6ter. Correctif — cause racine confirmée, variante (b) appliquée (21 sept, local)

**Cause racine exacte (code source Next 15.5.25 inspecté)** : `server/app-render/app-render.js` lit `headers['content-security-policy'] || headers['content-security-policy-report-only']` et en extrait le nonce — **uniquement pendant un rendu**. Notre middleware transmet correctement la CSP de requête (`NextResponse.next({ request: { headers } })`). Mais `generateStaticParams` du layout `[locale]` **prérend tous les chemins, y compris `/app/**`**, et Vercel sert ces prérendus **sans ré-exécuter app-render** : le middleware tourne (header RO présent, nonce frais) mais aucun rendu n'a lieu → 0 nonce injecté. La transmission du header était donc CORRECTE ; le défaut était le **chemin de rendu** (l'hypothèse prioritaire de l'opérateur est confirmée : le cache était la conséquence, pas la cause).

**Variante retenue (une seule modification)** : `export const dynamic = "force-dynamic"` **+** `export const revalidate = 0` au niveau de la **PAGE** `[locale]/app/page.tsx` (le layout seul s'était montré sans effet sur ce déploiement). Le glyphe ● du tableau de build reste trompeur — le juge de paix est l'artefact et le runtime.

**Preuves locales (build propre, `next start`)** : aucun `page.html` prérendu sous `.next/server/app/en/app` ; deux requêtes → **HTML différents** (uniquement par les nonces) ; **nonce A dans le header A et sur les scripts inline de HTML A, nonce B ≠ sur HTML B** ; 34 attributs nonce couvrant les 15 scripts inline ; `Cache-Control: private, no-cache, no-store` ; marketing inchangé (○, prérendus conservés) ; `/service-worker.js` intact.

**Vérification de PORTÉE (exigée avant push)** — le sous-arbre compte 30 pages (toutes les routes imbriquées incluses) ; la config `dynamic` d'une page ne s'applique pas aux sœurs. Mesuré sur un build de production propre (`next start`, sonde sur 31 routes EN + FR/ES) : **31/31 OK** — nonces distincts par réponse, nonce présent sur **tous** les scripts inline de chaque route (y compris routes profondes `premium/cosmic/*`, `chat`, `profile`, `setup`), HTML différents entre deux requêtes, `Cache-Control: private, no-cache, no-store` partout. Fait technique : sur un build **propre**, le `headers()` du layout `/app` couvre à lui seul tout le sous-arbre (aucun prérendu résiduel sous `<locale>/app/` — les mesures antérieures « ● statique » venaient d'un `.next` incrémental) ; le `force-dynamic`/`revalidate=0` de `page.tsx` est conservé en double garde et R6b exige désormais **les deux niveaux**.

**Garde structurelle** : le validateur `validate-web-session-csp` (R6b) **échoue** si `page.tsx` de `/app` perd `dynamic=force-dynamic` + `revalidate=0` — canari prouvé (retrait → exit 1, restauration → exit 0).

**Preuve Preview/Production encore requise** (le défaut était spécifique au rendu Vercel) : PR → déploiement → deux GET sans cache navigateur → nonces différents dans les headers ET portés par chaque script inline → zéro script inline sans nonce → HTML non identique → cache privé → aucune violation RO sur `/en/app` → login/refresh/logout/réouverture → Turnstile `/fr/contact` → EN/FR/ES → callback PKCE/token_hash → SW kill-switch intact.

## 6quater. Campagne du 22 sept — le pliage Vercel, les variantes B1/B2, la solution méta (PREUVE 31/31)

**Historique des essais (branche `diag/nonce-perpage`, jamais fusionnée — les essais ne sont pas une preuve de sécurité ; la preuve finale clôt cette section).**

**Mécanisme, prouvé au niveau header (déploiement `5b4cc65`, page echo `/en/app/csp-diag`)** : sur Vercel, le rendu lit une vue **fusionnée** requête ⊕ headers de réponse, et toute `Content-Security-Policy` de réponse **écrase** la CSP noncée posée en requête par le middleware. Deux sondes l'établissent sans inférence : `x-mw-saw-csp` (copie de la CSP vue à l'ENTRÉE du middleware — absente : les headers de route arrivent après) et `x-mw-res-probe` (marqueur posé en réponse SEULE — **visible du rendu** : pliage réel). Next 15.5.25 (`app-render.js:108`) lit `content-security-policy || content-security-policy-report-only` **sans repli** quand la première existe ; `getScriptNonceFromHeader` scanne la première directive `script-src*`.

**Variantes testées (Preview Vercel, SSO équipe)** :

| variante | déploiement | CSP de réponse `/app` | nonces scripts | verdict |
|---|---|---|---|---|
| f19cb35 (PR #64) | `5mzhytRNH` | header (next.config) | 0/16 | défaut reproduit |
| CSP→middleware | `8gsj828b1` (9e66d14) | header (middleware) | 0 | pliage depuis le middleware |
| CSP→vercel.json | `p8n208m2a` (079a480) | header (route plateforme) | 0 | pliage depuis la route |
| sans CSP réponse | `lo57o2twe` (e3c760a) | aucune | 31/31 ✓ | mais enforcement perdue |
| **B1 séparation** | `jgr6gcv1i` (37c9df5) | header (middleware) ; requête interne RO-seule | 0/16 | le pliage réinjecte même sans CSP interne — le repli RO ne sauve rien |
| **B2 séparation** | `p8x57m7ap` (271fa1b) | header (vercel.json) | 0 | idem ; `x-mw-saw-csp` absent ⇒ pliage APRÈS middleware |
| **B3 méta** | `27x28nnvs` (c4d052d) | **aucune — méta dans le document** | **26/26 directes + 5 redirects métier → destinations OK** | **COEXISTANCE PROUVÉE** |

**B3 — forme finale** : l'enforcement n'est plus un header sur `/app`. Le layout rend `<CspEnforcementMeta />` (React hoisté dans `<head>`, avant le premier script inline — offsets mesurés) : le navigateur applique la CSP (les politiques méta s'intersectent : une méta injectée ne peut que resserrer). Le middleware garde la CSP noncée en requête interne (extraction vivante) et la RO noncée en réponse. `frame-ancestors` est omis de la méta (ignoré par la spec) — **X-Frame-Options: DENY** (next.config, toutes routes) couvre. Marketing : header enforcement via middleware (branche intl), inchangé.

**Preuve Vercel finale (Preview `c4d052d`, 22 sept)** — les 5 objectifs mesurés : (1) CSP appliquée dans la réponse navigateur ✓ (méta, 7/7 directives directrices vérifiées par route ; la console BLOQUE réellement — `vercel.live` refusé par `script-src-elem` sans mention report-only) ; (2) RO noncée dans la réponse ✓ ; (3) nonce au rendu via headers internes sans CSP appliquée concurrente ✓ (`cspHdr` absent des 31 réponses) ; (4) tous les scripts inline noncés, nonce header = nonce scripts ✓ (36/36, 43/43…) ; (5) `Cache-Control: private, no-cache, no-store` ✓. Plus : HTML ≠ par requête ; méta avant premier inline ; marketing `/en` + `/fr/contact` + `/en/auth/login` header enforcement + XFO/COOP/CORP intacts ; **login → refresh → navigation interne → logout prouvés avec un compte E2E** (cookies `__Host-juno.sb`, localStorage legacy vide, cookie supprimé au logout) ; Turnstile sans violation (formulaire désactivé en Preview faute de clé publique — inchangé par B3) ; SW/manifest headers inchangés. Seule violation observée : `vercel.live` (outil interne de Preview, absent en production) — expliquée.

**Limite assumée** : l'encadrement `/app` vit dans le document, pas dans un header — un intermédiaire qui stripperait le `<head>` échapperait à la méta mais aussi à XFO/COOP/CORP (headers, eux, restent). La phase 2 refera les deux en un header enforcement à nonce.

## 6. Plan Report-Only → enforcement

- **Phase 1 (cette forme)** : sessions cookies + Report-Only nonce sur `/app` + **encadrement via méta document** (header CSP interdit sur `/app` — pliage Vercel, §6quater). Aucun blocage nouveau possible.
- **Fenêtre d'observation** : navigations réelles EN/FR/ES sur `/app` (login, discover, chat, premium, settings, logout) — **console ouverte, zéro violation Report-Only attendue**. Pas de collecteur de rapports (aucun endpoint configuré — personne ne prétend le contraire) : l'observation est navigateur + inspection manuelle, selon la mission.
- **Critère de passage** : zéro violation sur les parcours ci-dessus, Turnstile `/contact` toujours fonctionnel, PWA installable.
- **Phase 2 (un changement d'une ligne, documenté ici)** : remplacer l'enforcement du sous-arbre `/app` par la politique à nonce (le middleware devient la source d'enforcement pour `/app`, `next.config` reste la source pour le marketing) — sous nouvelle autorisation, après re-vérification.

## 6quinquies. Revue de sécurité avant fusion — PR #65, SHA `a06045a` (22 sept, Preview `dating-astro-ab9vh1zyi`)

**Checks** : Quality Gates (validateur 13 familles) ✓ · CodeQL ✓ · Gitleaks ✓ · 2× Vercel Deployment completed ✓. Aucune fusion à ce stade.

### Découverte préalable de la revue — les surfaces d'erreur étaient nues (réparées dans `a06045a`)
Mesure locale sur `359e9d9` : le 404 sous `/app/*` rend le layout RACINE seulement → **7 scripts inline + 6 externes sans aucune politique** dès que le header CSP a quitté next.config ; un 5xx non attrapé rend le shell interne `__next_error__` de Next, lui aussi hors layout. **Réparation** : la méta monte dans le **layout racine** (unique boundary que tout document rendu traverse, 404 inclus) ; `global-error.tsx` créé et `error.tsx` racine porte la méta (ils remplacent le document) ; le layout `/app` ne la rend plus (une occurrence par document). Validateurs R10c/R10d/R10e + 3 canaris (retrait racine / retrait error.tsx / doublon /app), tous exit ≠ 0 avec restauration. Simulation 5xx locale : page jetable qui lève (jamais commitée ; piège : un dossier `_*` est privé en App Router et **silencieusement exclu du build** — la première tentative mesurait un 404).

### Matrice mesurée sur la Preview du SHA exact (`a06045a`)

| surface | statut | enforcement | ordre avant 1er script | XFO | RO nonce | cache |
|---|---|---|---|---|---|---|
| 26 pages directes `/app/**` (EN/FR/ES + 2 routes dynamiques) | 200 | **méta** (unique) | ✓ (offsets 3406-4278 < 5064-5936) | DENY | ✓ nonce distinct/requête, tous inline noncés (36-44) | private, no-cache, no-store |
| 6 redirections métier (307, mesurées localement — opaque côté navigateur) | 307 | corps : aucune (voir limites) — **jamais exécuté** (le navigateur suit le Location) | n/a | DENY | ✓ (scripts du corps noncés sous RO) | private |
| → destinations des redirections | 200 | méta | ✓ | DENY | ✓ | private, no-store |
| 404 `/app/*` (3 testés) | 404 | **méta** (1134 < 2627) | ✓ | DENY/COOP/CORP/nosniff | ✓ (scripts du 404 non noncés → bruit RO, voir limites) | public, must-revalidate (aucune donnée) |
| 404 marketing | 404 | **header + méta** | ✓ | DENY | — | public, must-revalidate |
| callback auth (`?code=garbage`) | 200 | header + méta | ✓ | DENY | — | public |
| 5xx simulé (local, page jetable) | 500 | shell `__next_error__` pré-hydratation : **aucune possible** (voir limites) ; post-hydratation : méta (global-error) | shell : scripts bootstrap Next | DENY/COOP/CORP/nosniff | ✓ (bootstrap noncé) | private, no-store |
| marketing `/`, `/fr/contact`, `/en/auth/login`, `/en/auth/callback` | 200 | **header** (Turnstile inclus) | n/a (header) | DENY | — | private/public selon route |
| API `/api/*` (405 GET) / SW / manifeste | 405/200 | aucun header (non-documents : JSON/JS — voir limites) | n/a | DENY | — | public, must-revalidate (SW piné par vercel.json) |

**Streaming (critère 5, mesuré sur le flux brut via getReader, pas le DOM)** : méta dans le **chunk 0** sur les 4 routes testées, avant le premier script inline (même chunk, offset ultérieur). Les ressources précédant la méta (18-23 par page : charset, viewport, stylesheet, preload, chunks externes) sont toutes `/_next/*` ou assets racine — autorisées par la politique elle-même.

**Console** : aucune violation bloquante ni RO inexpliquée ; seule `vercel.live/_next-live/feedback/feedback.js` est bloquée (par la **méta** — preuve qu'elle enforce) : outil interne de Preview, absent en production.

**Turnstile** : header enforcement intact sur `/fr/contact` (trio script-src/script-src-elem/frame-src) ; le widget lui-même ne peut pas s'exécuter en Preview sans clé publique — inchangé par cette PR (déjà prouvé en production sur `bd61436`).

### Limites propres à la méta CSP (assumées, à lire avant fusion)
1. **`frame-ancestors` est inopérant en méta** (spec) : la protection anti-framing de `/app` repose sur `X-Frame-Options: DENY` (header, toutes routes, mesuré partout y compris 404/307/500). Navs modernes + legacy couverts par le duo header+ méta ; la phase 2 refera un header complet.
2. **Le shell `__next_error__` pré-hydratation (500 non attrapé) ne peut pas porter de méta** (généré hors layout par Next) ni de header CSP (tout header CSP de réponse se plie dans la requête du rendu et tue le nonce partout — preuves B1/B2). Mitigations mesurées : XFO/COOP/CORP/nosniff présents, bootstrap noncé sous observation RO, contenu digest-only en production, `global-error` rend la méta dès l'hydratation. Surface : uniquement pendant un crash serveur non attrapé.
3. **Corps des 307** : document de redirection streamé par Next (méta absente, scripts noncés sous RO). Un navigateur n'exécute jamais ce corps (il suit le Location, même origine vérifié) ; un client non-navigateur qui ignorerait le Location s'exécuterait sans CSP appliquée — théorique, documenté.
4. **404 sous `/app`** : les scripts du not-found ne portent pas le nonce (pipeline de rendu distinct) → violations RO en console sur les 404 pendant la fenêtre d'observation — bruit d'observation, pas un trou (l'enforcement est la méta, qui autorise ces scripts).
5. **API/SW/manifeste n'ont plus de header CSP** (le matcher middleware exclut `api` et fichiers ; avant, `next.config '/:path*'` en posait un). Non-documents : aucun effet d'exécution ; toutes les routes API renvoient du JSON. Différence mesurée et acceptée.
6. **`unsafe-inline` reste dans script-src de la méta** (phase 1) : la méta protège des chargements externes et prépare la phase 2, elle ne bloque pas l'inline XSS — c'est précisément ce que le nonce RO observe en vue de la phase 2. JUNO-05 reste « partiellement corrigé » tant que la phase 2 n'est pas déployée.

### Rollback
`git revert` des commits de la PR : la méta disparaît des layouts/boundaries, le middleware intl repose le header partout via… attention : le revert remet next.config headers() CSP + le layout /app sans per-page dynamic — l'état `bd61436` exact. Les sessions cookies restent (PR #63, déjà en production). Ne jamais « dépanner » en retirant la méta sans remettre un header CSP sur `/app`.

## 7. Compatibilité

- **Turnstile** : inchangé sur `/contact` (marketing statique, enforcement actuel) ; dans la RO `/app`, Turnstile figure dans script-src/script-src-elem/frame-src — et si le widget n'apparaît que sur `/contact`, il n'est pas concerné par la RO.
- **OAuth PKCE** : redirect pleine page (COOP-compatible) ; code_verifier en cookies (lecture callback prouvée par les tests du callback JUNO-10 existants — ils mockent le client, la forme d'API est inchangée).
- **PWA kill-switch** : `service-worker.js` statique, `worker-src 'self'`, cache-headers vercel.json inchangés.
- **next-intl** : marketing passe toujours par le middleware intl ; le sous-arbre `/app` le court-circupe délibérément (préfixe de locale toujours explicite — rien à négocier) pour posséder la propagation des headers de requête.

## 8. Tests et canaris

- **Suites (vitest)** : `session-storage.test.ts` (4) — TRANCHANT : `setSession` → chunks `juno.sb` dans le cookie jar, **localStorage ET sessionStorage vides** (échouerait contre l'ancien client) ; contrat d'options (Lax, Path=/, Secure prod, `__Host-` prod / pas en dev) ; purge legacy (exactly les clés Supabase, conserve le reste, idempotente) ; aucune clé `sb-*-auth-token` ne réapparaît après login (resetModules = page fraîche). `csp-app.test.ts` (9) : nonces distincts, portés par script-src ET script-src-elem, **aucun `unsafe-inline` dans les directives script**, `unsafe-inline` uniquement dans style-src, trio Turnstile, frame-ancestors/worker-src/object-src/base-uri/form-action stricts, strict-dynamic, périmètre `isAppPath` (accepte `/en/app…`, refuse marketing/auth/contact/SW/manifest), nonce malformé refusé.
- **Validateur structurel** `scripts/validate-web-session-csp.mjs` (câblé `package.json` + CI) — 13 familles de règles (R1-R9 + R10-R13 : méta rendue, AUCUNE CSP de réponse `/app` — middleware/vercel.json/next.config —, dérivation frame-ancestors, XFO DENY conservé) ; **canaris par injection (9 au total, tous exit ≠ 0, restauration vérifiée)** : retour à `createClient` nu, retrait du Report-Only, retrait du `frame-ancestors`, retrait du `force-dynamic`, `unsafe-inline` dans script-src de la politique app, **méta retirée du layout (R10), CSP de réponse réintroduite dans handleAppRequest (R11), CSP dans vercel.json (R11b), dérivation frame-ancestors cassée (R12)**. Suite vitest `csp-static.test.ts` (5) : encadrement = méta EXACTEMENT l'header moins frame-ancestors, aucun nonce (phase 2 interdite), trio Turnstile, origines Supabase REST+wss.
- **Preuves runtime** : §5 (nonces par réponse, scripts noncés, no-store, marketing intact).

## 9. Rollback

`git revert` des commits du chantier : le client retombe sur supabase-js nu (localStorage — l'ancien comportement), le middleware redevient intl-pur, `next.config` perd frame-ancestors/worker-src/COOP/CORP, le layout `/app` redevient statique. Les sessions en cookies deviennent illisibles → lecteurs reconnectés une seconde fois. Ne jamais « dépanner » en réactivant `'unsafe-inline'` dans la politique à nonce ou en retitant la purge legacy.

## 10. Fumée Production attendue (après autorisation de déploiement)

1. EN/FR/ES : marketing, login, `/app`, discover, chat, premium, settings, logout.
2. Console : **zéro** violation Report-Only sur `/app`, zéro erreur CSP bloquante.
3. Storage inspector : **aucune** clé `sb-*-auth-token` (localStorage/sessionStorage) après login/refresh/rouverture ; cookies `__Host-juno.sb-*` présents (noms/attributs seulement).
4. Turnstile `/contact` complété ; PWA installable ; re-création de session (refresh) visible dans les cookies.
5. Fumée Play Store du build 130 non affectée (aucun changement mobile).
