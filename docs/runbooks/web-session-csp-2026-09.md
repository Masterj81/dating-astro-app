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

## 6. Plan Report-Only → enforcement — HISTORIQUE (remplacé par §6septies)

> **HISTORIQUE DE DIAGNOSTIC (22 sept 2026) — branches `diag/nonce-perpage` et `diag/shell-500`, jamais fusionnées ; PR #65 (architecture méta) ouverte puis CLÔTURÉE sans fusion.** Ce paragraphe et le §6septies distinguent volontairement le diagnostic (preuves, jamais livrées) de la solution finale. (1) Vercel PLIE tout header CSP de réponse — next.config, middleware, vercel.json — dans la requête interne du rendu ; Next 15.5.25 lit `CSP || Report-Only` sans repli ⇒ toute CSP de réponse statique tue l'extraction du nonce (7 variantes déployées en Preview, 0 nonce à chaque fois — déploiements 9e66d14/079a480/37c9df5/271fa1b). (2) L'architecture méta-CSP de #65 couvrait 200/404 mais laissait une **fenêtre mesurée sur le shell 500 pré-hydratation** : ~26 scripts exécutés dès t≈5 ms, injection externe possible à DOMContentLoaded (t≈100-105 ms, seule `disposition=report`), méta insérée par l'hydratation seulement à t≈142-188 ms (déploiements 26cb16c/p3l9p8t7z). (3) La variante « CSP noncée ENFORCÉE en réponse » (déploiement diag 1988f32/hqmsbhpky) a été prouvée AVANT la décision : le pliage devient inoffensif car la politique pliée porte LE MÊME nonce que celui extrait. Décision opérateur du 22 sept : **option A — phase 2 directe (§6septies)**. Détails des essais : runbook de la branche #65 (§6quater-§6sexies).

- **Phase 1 (constatée en production bd61436)** : sessions cookies + Report-Only nonce — le RO a fait son travail : il a EXPOSÉ le défaut de propagation. Remplacée.
- **Phase 2 (§6septies, cette PR)** : CSP noncée ENFORCÉE par header sur /app.

## 6septies. PHASE 2 — CSP noncée ENFORCÉE par header sur /app (architecture retenue, 2026-09-22)

> **FERMÉ EN PRODUCTION le 22 sept 2026** — fusion PR #66 (`d8f8247`, merge `d0044c5`, autorisation opérateur), déploiements Production **Ready** sur les deux projets Vercel. **Fumée Production entièrement verte** sur `app.junosynastry.com` : 26 pages directes (CSP noncée enforcement, 2 nonces distincts par page, tous les scripts inline noncés, `strict-dynamic`, zéro `unsafe-inline` scripts, zéro Report-Only, `private/no-store`, XFO DENY) ; 6 redirections 307 noncées → destinations conformes ; 404 `/app` noncé (14/20) avec UI « Lost in Space » hydratée, 404 marketing CSP statique ; streaming : nonce dès le chunk 0 ; `www.junosynastry.com` marketing/contact : CSP statique + Turnstile intacts (les chemins marketing sur l'hôte `app.` redirigent 307 vers `/app` — comportement conçu, mesuré) ; login → refresh → navigation interne → logout prouvés avec le compte E2E (cookies `__Host-juno.sb`, zéro localStorage legacy, console **sans aucune violation CSP** — `vercel.live`, seule source de violations en Preview, est absent de la production). Aucun 500 réel provoqué pendant la fumée (interdit) — la couverture 500 reste la preuve Preview du jumeau exact (`dfc9ae3`/`ntlpkzyaa`, §6sexies de la branche #65) : header noncé appliqué dès le premier octet, 14/14+5/5 scripts noncés, injection bloquée `enforce` à t≈85 ms.
>
> **Verdicts finaux** : **JUNO-13 CORRIGÉ EN PRODUCTION** (CSP noncée enforcement, prouvée Preview + fumée Production). **JUNO-05 fermé pour son constat initial** (jetons hors du web storage, cookies `__Host-` en production depuis `bd61436`) — **sans être présenté comme équivalent à une architecture BFF/cookies HttpOnly** : les cookies restent lisibles par JavaScript ; un XSS résiduel (script de l'allowlist compromis, dépendance chaînée par `strict-dynamic`) resterait en mesure de les lire. Le résiduel est documenté ci-dessous et reste un chantier distinct (BFF) si l'opérateur le juge nécessaire.

**Forme** : le middleware pose la même politique noncée (`buildAppNonceCsp`) en requête interne (extraction Next) ET en header de réponse **enforcement**. `strict-dynamic` + repli CSP2 (`'self'` + hôts explicites conservés à côté du nonce : CSP3 utilise nonce+strict-dynamic et ignore l'allowlist ; CSP2 replie sur les hôts). Aucun `'unsafe-inline'` dans les directives script. La CSP statique (marketing/auth/callback) vit dans `src/lib/csp-static.ts`, posée par la branche intl du middleware — **jamais** dans next.config headers() ni vercel.json (pliage, cf. §6 historique). Pourquoi cette architecture : un header s'applique **dès le premier octet** de tout document `/app` — y compris le shell `__next_error__` d'un 500 non attrapé (13/13 scripts noncés, mesuré) et, via le catch-all `[...rest]` → not-found de segment, les 404 sans route (13/13 inline + 5/5 ext noncés, statut 404, UI visible — le not-found intégré de Next n'applique PAS le nonce, mesuré 0/13).

**Preuves locales (build prod propre, sonde 200/307/404/500/streaming)** : 26 pages directes OK (enforcement noncé, zéro unsafe-inline scripts, strict-dynamic, 2 GET ⇒ 2 nonces distincts, private/no-cache/no-store, XFO DENY, aucun RO résiduel) ; 6 redirections 307 noncées + destinations conformes ; 404 /app réparé ; 404 marketing = CSP statique inchangée ; 500 simulé (route jetable locale, jamais commitée) : enforcement noncé, 13/13 noncés ; streaming : nonce présent dès le chunk 0 (le header précède tous les chunks) ; marketing/Turnstile/callback inchangés. **Preuves Preview** : matrice complète dans la PR, y compris login/refresh/logout/réouverture et le 500 prouvé sur le jumeau diagnostique du SHA exact (aucune route de diagnostic dans la PR).

**Validateur (canaris prouvés exit≠0 + restauration)** : R5 enforcement noncé en réponse ; R6c N/N pages force-dynamic ; R7 enforcement statique depuis csp-static.ts ; R11/R11b/R11c aucune CSP pliable ; R14 strict-dynamic + repli CSP2 ; R15 aucune méta CSP. Canaris : retrait enforcement (R5), retrait force-dynamic d'une page (R6c), CSP dans next.config (R11), strict-dynamic retiré (R14), méta réintroduite (R15).

**RISQUE RÉSIDUEL ASSUMÉ (JUNO-05)** : les jetons de session vivent dans des cookies **non-HttpOnly** (`__Host-juno.sb*`) — lisibles par JavaScript. La CSP noncée enforcement réduit matériellement la surface XSS (plus d'inline non noncé, plus de source externe non listée), ce qui clôt le constat initial de JUNO-05 (stockage localStorage) ; **elle n'équivaut pas à une architecture BFF/cookies HttpOnly**, où un XSS ne lit rien. JUNO-05 sera fermé pour son constat initial, jamais présenté comme équivalent HttpOnly. Un XSS résiduel (script compromis dans l'allowlist, dépendance chaînée par strict-dynamic) resterait en mesure de lire les cookies.

**Rollback** : `git revert` des commits de cette PR. État de retour = production actuelle (master) : CSP statique partout via next.config headers() (unsafe-inline), sessions cookies intactes (PR #63), nonce Report-Only du middleware master. Aucune donnée à migrer ; les lecteurs connectés ne remarquent rien. Ne jamais « dépanner » en réintroduisant `'unsafe-inline'` dans la politique noncée ou une CSP statique dans next.config (le pliage la réinjecterait dans les requêtes /app et tuerait les nonces).

## 7. Compatibilité

- **Turnstile** : inchangé sur `/contact` (marketing statique, enforcement actuel) ; dans la RO `/app`, Turnstile figure dans script-src/script-src-elem/frame-src — et si le widget n'apparaît que sur `/contact`, il n'est pas concerné par la RO.
- **OAuth PKCE** : redirect pleine page (COOP-compatible) ; code_verifier en cookies (lecture callback prouvée par les tests du callback JUNO-10 existants — ils mockent le client, la forme d'API est inchangée).
- **PWA kill-switch** : `service-worker.js` statique, `worker-src 'self'`, cache-headers vercel.json inchangés.
- **next-intl** : marketing passe toujours par le middleware intl ; le sous-arbre `/app` le court-circupe délibérément (préfixe de locale toujours explicite — rien à négocier) pour posséder la propagation des headers de requête.

## 8. Tests et canaris

- **Suites (vitest)** : `session-storage.test.ts` (4) — TRANCHANT : `setSession` → chunks `juno.sb` dans le cookie jar, **localStorage ET sessionStorage vides** (échouerait contre l'ancien client) ; contrat d'options (Lax, Path=/, Secure prod, `__Host-` prod / pas en dev) ; purge legacy (exactly les clés Supabase, conserve le reste, idempotente) ; aucune clé `sb-*-auth-token` ne réapparaît après login (resetModules = page fraîche). `csp-app.test.ts` (9) : nonces distincts, portés par script-src ET script-src-elem, **aucun `unsafe-inline` dans les directives script**, `unsafe-inline` uniquement dans style-src, trio Turnstile, frame-ancestors/worker-src/object-src/base-uri/form-action stricts, strict-dynamic, périmètre `isAppPath` (accepte `/en/app…`, refuse marketing/auth/contact/SW/manifest), nonce malformé refusé.
- **Validateur structurel** `scripts/validate-web-session-csp.mjs` (câblé `package.json` + CI) — 9 familles de règles ; **canaris par injection (5, tous exit 1, restauration vérifiée)** : retour à `createClient` nu, retrait du Report-Only, retrait de `frame-ancestors`, retrait du `force-dynamic`, `unsafe-inline` dans script-src de la politique app.
- **Preuves runtime** : §5 (nonces par réponse, scripts noncés, no-store, marketing intact).

## 9. Rollback

`git revert` des commits du chantier : le client retombe sur supabase-js nu (localStorage — l'ancien comportement), le middleware redevient intl-pur, `next.config` perd frame-ancestors/worker-src/COOP/CORP, le layout `/app` redevient statique. Les sessions en cookies deviennent illisibles → lecteurs reconnectés une seconde fois. Ne jamais « dépanner » en réactivant `'unsafe-inline'` dans la politique à nonce ou en retitant la purge legacy.

## 10. Fumée Production attendue (après autorisation de déploiement)

1. EN/FR/ES : marketing, login, `/app`, discover, chat, premium, settings, logout.
2. Console : **zéro** violation Report-Only sur `/app`, zéro erreur CSP bloquante.
3. Storage inspector : **aucune** clé `sb-*-auth-token` (localStorage/sessionStorage) après login/refresh/rouverture ; cookies `__Host-juno.sb-*` présents (noms/attributs seulement).
4. Turnstile `/contact` complété ; PWA installable ; re-création de session (refresh) visible dans les cookies.
5. Fumée Play Store du build 130 non affectée (aucun changement mobile).
