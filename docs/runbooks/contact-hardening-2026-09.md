# Runbook — Durcissement `/api/contact` et limites de débit durables (JUNO-07 + JUNO-14)

**Date : 17 septembre 2026 · Statut : FERMÉ EN PRODUCTION le 18 septembre 2026 — fumées anglaise et françaises réussies (voir §9 et §10).**

## 1. Constats (audit 2026-09-07) et reproduction

- **JUNO-07** : `/api/contact` envoyait DEUX courriels — l'un à la boîte JUNO, l'autre (accusé de réception) **à l'adresse fournie par l'appelant**, sans preuve de possession, sans limite durable, sans anti-automatisation : un relais de contenu contrôlé depuis le domaine JUNO. Reproduit par lecture et couvert par les tests (l'ancien code échouerait à « un seul envoi », « jeton absent → 400 », « limites avant tout envoi »).
- **JUNO-14** : `request-deletion` gardait son limiteur dans une `Map` en processus — par instance serverless (redémarrage = remise à zéro ; instances parallèles = comptes indépendants), sans purge, et clés sur la **première** entrée de `x-forwarded-for` (contrôlable par le client). Reproduit structurellement ; un garde lit désormais la source et refuse tout retour d'un `new Map`.

## 2. Architecture des limites — mécanismes PostgreSQL existants, AUCUNE migration

- **`check_edge_rate_limit(text, integer, integer)`** (20260420000004, copie conforme 20260908000002) : compteur à fenêtre tombante, **une seule instruction atomique** (`INSERT … ON CONFLICT DO UPDATE … RETURNING`), persistant, partagé entre instances, purgé par le cron quotidien `cleanup_edge_rate_limits` (> 2 jours, pour investigation d'abus). `REVOKE … FROM PUBLIC` ; accordée à `service_role` (et `authenticated` — voir §6). → utilisée par `/api/contact`.
- **`check_rate_limit(uuid, text, integer, interval)`** (full_schema §15) : `SELECT … FOR UPDATE` + mise à jour — atomique par verrou de ligne, persistant, par compte. Appelée via le client **service-role** existant (`getSupabaseAdmin`). → utilisée par `request-deletion`.
- **Aucune migration créée** : les deux mécanismes couvrent toutes les exigences (atomicité, persistance, purge, clé adaptée, secret hors de la clé). Vérifié migration par migration avant décision.

## 3. `/api/contact` — barrières dans l'ordre, envoi unique

1. **Parsing borné + validation** (types, catégorie en liste blanche, message ≤ 5 000, nom ≤ 200).
2. **Turnstile** (`verifyTurnstile`, `lib/contact-protection.ts`) : `siteverify` officiel, timeout 5 s, `remoteip` si l'origine est une IP valide. Fail-closed intégral : secret absent → 503 ; jeton absent/invalide/expiré/déjà utilisé → 400 ; endpoint injoignable → 503. Le jeton n'est jamais journalisé.
3. **Limites durables** via service-role : `contact:origin:<hmac>` **5/heure** (une IP qui change d'adresse reste bornée ; un humain qui réessaie passe) puis `contact:addr:<hmac>` **3/heure** (l'abuseur qui vise N boîtes doit nommer chacune). Erreur RPC → 503 ; refus → 429 + `Retry-After: 3600`.
4. **Envoi unique** vers `SUPPORT_INBOX` (constante serveur — le corps ne désigne jamais la destination), `replyTo` = adresse du visiteur, `htmlEscape`/`sanitizeHeader` conservés.

**L'accusé de réception public est supprimé**, sans remplacement équivalent. Côté client : `ContactForm` rend le widget Turnstile (uniquement si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` est présent — pas de faux CAPTCHA ; sinon le formulaire est désactivé avec un message honnête), transmet le seul jeton, remappe les codes serveur (`rate_limited`, `captcha_invalid`, `unavailable`) en messages localisés (×8 locales) et réarme le défi à l'échec.

### Adresse et origine réseau — confidentialité

- Origine : **dernière** entrée de `x-forwarded-for` (celle ajoutée par le proxy le plus proche — l'edge Vercel ; la partie contrôlée par le client est à gauche). Absente/invalide → bucket de secours unique `origin:unknown`, toujours limité + Turnstile : aucune prétention d'une protection IP qui ne peut pas être établie.
- Adresse : normalisée (trim + minuscules), puis **HMAC-SHA256** (`CONTACT_HASH_SECRET`, ≥ 32 caractères, serveur seul) tronqué à 32 hex. Ni l'adresse ni l'IP ne touchent `edge_rate_limits` ou un log ; le salage interdit aussi à un appelant direct de la RPC (accordée à `authenticated`) de **calculer — donc de brûler — le bucket d'une victime**. Secret absent → 503 (jamais d'empreinte non salée : les adresses sont à faible entropie, un hash nu vaut un dictionnaire).

## 4. `request-deletion` — limite par compte vérifié

La `Map` est **supprimée**. Ordre : parsing → validation → **vérification d'identité** (jeton + `userId` concordants, 401 sinon) → `check_rate_limit(userId, 'web_deletion_request', 3, '1 hour')` → suite inchangée. La limite est consommée **après** l'authentification : un appelant non authentifié ne brûne rien, et personne ne peut dépenser le quota d'un autre (la clé est l'identité vérifiée, jamais l'IP). Erreur RPC → 503 fail-closed.

## 5. Tests (23 nouveaux, tous verts ; aucun courriel ni CAPTCHA réel)

- `apps/web/src/app/api/contact/route.test.ts` (17) : envoi unique vers la boîte interne ; destination non contrôlable par le corps ; échappement HTML + CRLF neutralisé (l'injection d'en-tête exige un CRLF — strippé) ; catégorie/message/champs invalides → 400 sans ressource consommée ; jeton absent/invalide → 400 ; siteverify injoignable ou secret absent → 503 ; limites origin/addr dépassées → 429 sans envoi ; erreur RPC → 503 ; clés HMAC vérifiées **exactement** (y compris multi-entrées XFF = dernière, et absence = bucket de secours) ; `CONTACT_HASH_SECRET` absent → 503 sans empreinte ; logs sans adresse/message/jeton ; erreur Resend sans détail interne.
- `apps/web/src/app/api/account/request-deletion/route.test.ts` (6) : 401 non authentifié **sans consommer** la limite ; 401 sur `userId` d'autrui ; clé = identité vérifiée (jamais l'IP) ; 3 demandes puis 429 sans upsert ni courriel ; erreur RPC → 503 ; **garde structurelle : plus aucun `new Map` dans la route**.
- Atomicité structurelle : `check_edge_rate_limit` est une instruction unique atomique ; `check_rate_limit` verrouille la ligne (`FOR UPDATE`) — vérifié par lecture des définitions (aucune fenêtre de concurrence).

## 6. Variables, secrets et configuration externe

| variable | où | rôle | sans elle |
|---|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | client (publique) | rend le widget | formulaire désactivé + notice honnête |
| `TURNSTILE_SECRET_KEY` | serveur | vérifie le jeton | **503 — jamais permissif** |
| `CONTACT_HASH_SECRET` (≥ 32 car.) | serveur | HMAC des buckets | **503 — jamais d'empreinte non salée** |

Clés de test officielles Cloudflare (documentées dans `.env.example`) : site `1x00000000000000000000AA` / secret `1x0000000000000000000000000000000AA` (passent toujours) ; variantes `2x…` (bloquent toujours) pour exercer les refus. **Aucun secret n'a été créé ou modifié à distance** — c'est la configuration Vercel restante.

## 7. État d'activation — 17 septembre 2026 : BLOQUÉ (accès externes manquants)

Mission d'activation exécutée le 17 sept : **le commit `328f22c` n'est PAS poussé, volontairement** — la configuration Vercel doit précéder le push (sinon le déploiement rend le formulaire honnêtement indisponible : widget absent + API 503, par conception fail-closed).

**Vérifié ce jour** : CI de `6714f58` **verte** (run 35236003646, `pull_request`, success) ; `328f22c` local, origin à `6714f58`, écart 1 ; le commit ne contient **aucun secret réel** (uniquement les clés de test officielles et un espace réservé `generate-a-random-…`) ; l'environnement de l'agent ne détient **ni** CLI `vercel`, **ni** CLI `wrangler`, **ni** token Cloudflare/Vercel (env + coffre d'identifiants inspectés) — la création du widget Turnstile et la pose des variables Vercel sont donc des **opérations opérateur**.

### Procédure opérateur exacte (puis reprendre l'agent pour la suite)

1. **Cloudflare** (dashboard, compte autorisé) → Turnstile → Add widget : mode *Managed* ; hostname `junosynastry.com` ; conserver le **sitekey** (publique) et le **secret** (jamais dans le dépôt, un ticket ou un rapport). Option : second widget Preview (ou clés de test `1x…` si le Preview est strictement contrôlé).
2. **Générer `CONTACT_HASH_SECRET`** (PowerShell, RNG cryptographique — jamais `Get-Random`, pas un mot de passe réutilisé) :
   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
   ```
   (à saisir directement dans Vercel, sans le consigner ailleurs)
3. **Vercel** → projet JUNO → Settings → Environment Variables — Production : `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (vraie clé), `TURNSTILE_SECRET_KEY` (vrai secret), `CONTACT_HASH_SECRET` (valeur de l'étape 2). Preview : mêmes noms, valeurs Preview/test + un `CONTACT_HASH_SECRET` propre au Preview.
4. **Redéployer** après configuration (`NEXT_PUBLIC_*` est injecté au build).
5. Autoriser le push de `328f22c` ; CI ; déploiement Production **du SHA exact** ; puis la fumée du §7 ci-dessous.

## 7bis. Ordre de déploiement (à exécuter sur autorisation) et rollback

1. Configurer dans Vercel : `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `CONTACT_HASH_SECRET` (production + preview).
2. Pousser la branche, fusionner, laisser Vercel déployer le web. (Aucune migration à appliquer ; l'edge n'est pas concerné.)
3. **Fumée sans données sensibles** (clés de test) : soumettre le formulaire avec le jeton de test `1x…AA` → 200 et UN seul courriel interne attendu (vérifiable côté support) ; rejouer immédiatement ×4 → 429 ; sans jeton → 400 ; secret retiré en preview → 503.
4. Surveillance : `429` (pics = abus bloqué ou seuil à ajuster), `503` (limiteur/CAPTCHA indisponible — ne doit jamais être permanent), erreurs Resend.

**Rollback** : redéployer la révision précédente ; les compteurs `edge_rate_limits`/`rate_limits` sont sans danger (fenêtres tombantes d'une heure). Aucune donnée à nettoyer.

## 7ter. Blocage CSP découvert au smoke Preview (17 sept 2026) et correction

L'opérateur a exécuté la procédure du §7 (widget Turnstile créé, variables Vercel posées, Preview déployé). Le smoke a alors révélé un **défaut dans notre CSP** — pas dans la barrière elle-même :

- le script du widget `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` était **refusé** par `script-src-elem 'self' 'unsafe-inline' https://va.vercel-scripts.com` (l'origine Turnstile n'était autorisée nulle part) ;
- `frame-src 'none'` aurait refusé l'iframe du défi à l'étape suivante.

**Correction (minimale, documentée Cloudflare)** — `apps/web/next.config.ts` :

1. constante unique `TURNSTILE_ORIGIN = "https://challenges.cloudflare.com"` ;
2. `TURNSTILE_ORIGIN` ajouté à `script-src` **et** `script-src-elem` ;
3. `frame-src` passe de `'none'` à `TURNSTILE_ORIGIN` **seul** (aucun autre origine, aucun wildcard) ;
4. **aucune** entrée `connect-src` : `siteverify` est appelé **côté serveur** (`contact-protection.ts`), le navigateur ne parle jamais à Cloudflare au-delà du script et de l'iframe ;
5. `X-Frame-Options: DENY` **conservé** : il régit qui peut nous cadrer ; `frame-src` régit ce que **nous** cadrons. Les deux coexistent par conception.

**Test structurel** : `apps/web/src/lib/__tests__/csp-turnstile.test.ts` (7 tests) échoue si l'une des trois autorisations disparaît, si `frame-src` s'élargit au-delà de l'origine seule, si un wildcard apparaît, si l'origine fuit dans `connect-src`, ou si `X-Frame-Options: DENY` saute. Vérifié discriminant : **5 échecs** sur `next.config.ts` d'origine, **7 réussites** après correction.

**Validation** : suite web 47/47 ; `validate:web:locales` + `validate:locale-contract` propres ; `tsc --noEmit` et lint sans erreur ; `build:web` compilé (15,5 s, deux warnings préexistants hors périmètre) ; `git diff --check` propre.

**Smoke à reprendre sur la nouvelle Preview** (après push autorisé + Preview Ready) : widget visible ; envoi valide → 200 et un seul courriel interne ; aucun accusé public ; jeton manquant → 400 ; journaux sans données sensibles.

## 7quater. Défaut fonctionnel post-fusion : catégories localisées rejetées (17 sept 2026, soir)

**Contexte** : PR #39 fusionnée dans `master` (`722c677`). Fumée **anglaise** réussie : Turnstile visible, CSP corrigée, validation acceptée, envoi Resend fonctionnel, **exactement un** courriel reçu dans `support@junosynastry.com`.

**Défaut observé** : `/en/contact` fonctionne ; `/fr/contact` retourne HTTP 400 `{"error":"invalid_request"}`.

**Cause racine** : `ContactForm.tsx` rendait `<option value={t(key)}>{t(key)}</option>` — la **traduction servait de valeur HTML**, donc le navigateur soumettait `Question générale` alors que la liste blanche de la route n'accepte que les valeurs canoniques anglaises. **Toutes les locales non anglaises** étaient rejetées avant même la validation Turnstile. (Ce défaut était déjà noté en §8 comme « hors périmètre i18n » ; la fumée production l'a promu en défaut bloquant.)

**Correction — contrat canonique / étiquettes localisées** :

1. nouveau module partagé **sans dépendance** `apps/web/src/lib/contact-categories.ts` : table `CONTACT_CATEGORIES` (`value` canonique + `labelKey` de traduction), `CONTACT_CATEGORY_VALUES` et `isContactCategory()` dérivés — jamais redéclarés ailleurs ;
2. `ContactForm.tsx` : `<option key={value} value={value}>{t(labelKey)}</option>` — l'étiquette visible est localisée, la valeur soumise est canonique ;
3. `route.ts` : la liste locale `VALID_CATEGORIES` est supprimée, la validation passe par `isContactCategory` — le formulaire et l'API lisent **la même table**, divergence redevient impossible ;
4. l'API **continue de rejeter** toute chaîne localisée (« Question générale » → 400) : le contrat reste indépendant de la langue ;
5. tout le reste est inchangé : liste blanche serveur, Turnstile, limites de débit, échappement HTML, neutralisation CRLF, envoi unique vers `support@junosynastry.com` (jamais contrôlable par la catégorie), `replyTo` = adresse du visiteur.

**Tests** (discriminants, prouvés) : `ContactForm.test.tsx` — 10 **échecs** contre l'ancien rendu (`git stash`), 11 réussites après : FR affiche « Question générale » / valeur « General Question » / soumission `category: "General Question"` (200 avec CAPTCHA et dépendances mockés) ; les 8 locales rendent 7 étiquettes non vides avec les 7 valeurs canoniques exactes, aucune traduction comme valeur. `route.test.ts` +3 : chaque valeur canonique acceptée avec destinataire **toujours** la boîte interne ; « Question générale » soumis tel quel → 400 ; les étiquettes localisées des 8 locales rejetées quand elles diffèrent du canonique. Aucun contact réel (Resend/Cloudflare/Supabase mockés).

**Validations** : suite web 61/61 ; transactional-emails 34/34 ; `validate:email-templates` 1 149 ; locales + contrat propres ; `tsc` + lint ciblés sans erreur ; `build:web` compilé ; `git diff --check` propre ; recherche finale : plus aucun `value={t(` dans les composants.

**Fermeture JUNO-07/JUNO-14** : les fumées anglaise **et** française ont réussi — voir §10 pour la preuve de production du 18 septembre 2026.

## 8. Notes résiduelles

- `check_rate_limit` n'a **pas** de `REVOKE … FROM PUBLIC` explicite dans la migration d'origine (défaut PostgreSQL = exécutable) — préexistant, hors périmètre du chantier ; le rappeler au prochain chantier base si on veut le durcir.
- Défaut préexistant observé sans être touché : `ContactForm` envoie la catégorie **traduite** alors que la liste blanche serveur est anglaise — hors périmètre JUNO-07/14, à traiter comme chantier i18n produit.
- Les seuils (5/h origine, 3/h adresse, 3/h suppression) sont des valeurs de départ raisonnées, ajustables côté code après observation des `429`.

## 9. Fumée française après déploiement du correctif catégories

Après push autorisé, CI verte et déploiement Production du nouveau SHA :

1. ouvrir `/fr/contact` ;
2. utiliser une adresse contrôlée **différente** de `support@junosynastry.com` ;
3. sélectionner `Question générale` ;
4. compléter Turnstile ;
5. envoyer **un seul** message identifié comme test ;
6. confirmer HTTP 200 ;
7. confirmer **exactement un** courriel dans `support@junosynastry.com` ;
8. confirmer **zéro** courriel à l'adresse du visiteur ;
9. confirmer que **Répondre** cible l'adresse du visiteur ;
10. vérifier les logs sans afficher de données sensibles.

Ne pas provoquer volontairement le rate limit lors de cette fumée.

## 10. Preuve de fermeture en production — 18 septembre 2026

Fumées exécutées en production par l'opérateur après le déploiement du merge
`3abc3eb` (PR #40, contenant `2365ca5` — CSP Turnstile — et `0c39391` —
catégories canoniques). Aucune donnée personnelle n'est consignée ici.

| Point contrôlé | Résultat |
|---|---|
| Date du test production | 18 septembre 2026 |
| SHA déployé | merge `3abc3eb` (PR #40), inclut `0c39391` + `2365ca5` |
| `/en/contact` — widget Turnstile | visible et validé ✅ |
| `/fr/contact` — catégorie « Question générale » | envoi réussi ✅ |
| Courriels reçus dans `support@junosynastry.com` | **exactement un** ✅ |
| Courriel accusé au visiteur | **zéro** ✅ |
| `replyTo` du courriel interne | adresse du visiteur ✅ |
| Journaux | sans secret ni donnée sensible ✅ |

**JUNO-07 et JUNO-14 sont fermés en production.** Les seuils de débit
(5/h origine, 3/h adresse) restent sous surveillance via les `429`.
