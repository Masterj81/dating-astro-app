# Runbook — Durcissement `/api/contact` et limites de débit durables (JUNO-07 + JUNO-14)

**Date : 17 septembre 2026 · Statut : CORRIGÉ LOCALEMENT — commit local, non poussé, non déployé ; activation production conditionnée à la configuration Turnstile/HMAC (voir §7).**

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

## 8. Notes résiduelles

- `check_rate_limit` n'a **pas** de `REVOKE … FROM PUBLIC` explicite dans la migration d'origine (défaut PostgreSQL = exécutable) — préexistant, hors périmètre du chantier ; le rappeler au prochain chantier base si on veut le durcir.
- Défaut préexistant observé sans être touché : `ContactForm` envoie la catégorie **traduite** alors que la liste blanche serveur est anglaise — hors périmètre JUNO-07/14, à traiter comme chantier i18n produit.
- Les seuils (5/h origine, 3/h adresse, 3/h suppression) sont des valeurs de départ raisonnées, ajustables côté code après observation des `429`.
