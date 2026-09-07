# Audit sécurité JUNO — 7 septembre 2026

**Périmètre** : monorepo `dating-astro-app`, branche `feat/geoapify-birth-city`, HEAD `0b4ff38`.
**Méthode** : analyse statique du dépôt + exécution locale non destructive (`npm audit`, validateurs
du dépôt, une PoC de calcul hors ligne). Aucun appel à la production, aucune transaction, aucun
brute force, aucun fichier applicatif modifié.
**Référentiels** : OWASP ASVS 4.0.3, MASVS 2.0 / MASTG, API Security Top 10 (2023), OAuth 2.0
Security BCP (RFC 9700), recommandations Android Security, PCI DSS SAQ-A.

Aucune valeur de secret n'est reproduite, même partiellement. Les secrets sont désignés par leur
type, leur emplacement et leur exposition.

Ce document **complète** `docs/security-audit-2026-09.md` (3 sep 2026) : les constats fermés le
3 septembre ont été re-vérifiés et sont listés en §6 ; les deux constats laissés ouverts sont
re-qualifiés ici avec de nouvelles preuves.

---

## État après la première vague de remédiation — 7 septembre 2026

Cinq constats ont été traités le jour même. Le code et les migrations sont dans le dépôt ;
**rien n'a été déployé, aucune migration n'a été exécutée à distance, aucune clé n'a été
tournée.** Les étapes manuelles restantes sont en fin de section.

| Constat | Statut | Ce qui le prouve |
|---|---|---|
| **JUNO-01** | **Corrigé** (avec un résiduel documenté) | `chart-payload-privacy.test.ts` — 16 tests, dont la PoC d'inversion qui échouait à 0 s d'erreur et ne dispose plus des champs nécessaires |
| **JUNO-02** | **FERMÉ, prouvé en base le 7 sep** | `profile-chart-authz.test.ts` — 23 tests sur la décision réelle, y compris les trois branches fail-closed ; migration `20260907000001` appliquée, 9/9 contrôles verts |
| **JUNO-03** | **Corrigé** | `checkout-coupon.test.ts` — 15 tests ; `couponId` sorti du contrat d'entrée, remise dérivée du `priceId` |
| **JUNO-08** | **FERMÉ, prouvé en base le 7 sep** | migration `20260907000002` appliquée ; 7/7 contrôles verts |
| **JUNO-11** | **Corrigé** | `edge-cors.test.ts` — 39 tests ; `supabase/functions/_shared/cors.ts`, défaut inversé |
| Rate limit `get-profile-chart` | **Corrigé** | fail-closed sur les trois contrôles, prouvé par test |

### État mesuré en base — 7 septembre 2026

`supabase/tests/verify_20260907_remediation.sql` exécuté sur la base de production :
**27 contrôles sur 27, `VERDICT = TOUT EST VERT`.**

| | |
|---|---|
| `20260907000001_chart_access_control` | **appliquée** — `profile_chart_visible` existe et n'est appelable par aucun rôle client ; `can_view_profile_chart` est ouverte à `authenticated`, fermée à `anon`, et sa signature est bien `p_target_id uuid` **sans paramètre viewer** ; les deux épinglent `search_path` ; `get_synastry_candidate_profiles` vérifie l'abonnement et partage le prédicat de visibilité. |
| `20260907000002_messages_immutable` | **appliquée** — aucun privilège mutateur pour un rôle client, `authenticated` garde SELECT + INSERT, `anon` ne détient rien, RLS active, `mark_conversation_messages_read` et le trigger `last_message_at` intacts. |
| Vagues précédentes, re-vérifiées | `conversations`, `discoverable_profiles`, `premium_usage` en lecture seule ; aucun TRUNCATE client ; **aucune colonne PII de `profiles` lisible**, aucun GRANT SELECT au niveau table ; toute fonction `SECURITY DEFINER` épingle `search_path` ; RLS active sur toutes les tables de `public` ; aucune alerte de posture ouverte. |

`20260907000003_synastry_gate_fail_closed` a suivi le même jour (voir plus bas).

**Preuve comportementale, pas seulement de posture.** La requête 3 du même fichier appelle
`profile_chart_visible` sur des échantillons réels de la base — un couple bloqué, une conversation
existante, un profil désactivé — et vérifie ce qu'il répond. **6 scénarios sur 6.**

| scénario | attendu | obtenu |
|---|---|---|
| son propre thème | true | true |
| cible que le lecteur a bloquée | false | false |
| **cible qui a bloqué le lecteur** | **false** | **false** |
| conversation existante, A → B | true | true |
| conversation existante, B → A | true | true |
| cible désactivée | false | false |

La troisième ligne est celle qui justifiait le constat : `get-profile-chart` ne consultait
`blocked_users` dans **aucun** sens. Une personne bloquée conservait l'accès au thème de celle qui
l'avait bloquée. Les deux sens sont désormais refusés, et c'est mesuré, pas déduit.

Reste à faire côté base : rien. Reste à faire côté déploiement : les secrets Stripe, puis
`supabase functions deploy` (§ Étapes manuelles).

### Deux défauts du fichier de vérification, corrigés le jour même

Ils méritent d'être écrits parce que ce sont les deux façons dont un contrôle ment.

**Un contrôle négatif qui se félicite du vide.** Trois lignes (« la fonction n'est PAS appelable
par un client ») rendaient `true` alors que la fonction était *absente* : `bool_or` sur zéro ligne
rend `NULL`, le `COALESCE` le ramène à `false`, et `NOT false` vaut `true`. Elles exigent désormais
que l'objet existe, et `detail` affiche `FONCTION ABSENTE` sinon. Deux lignes `MIGRATION` en tête
de grille disent d'emblée ce qui est appliqué.

**Un contrôle qu'il faut éditer avant de le lancer.** Le spot-check comportemental vivait en
commentaire avec des placeholders `<viewer-uuid>` ; collé tel quel il répondait
`ERROR: 22P02: invalid input syntax for type uuid`. C'est la deuxième occurrence du même défaut
que l'erreur `relation "another" does not exist` — du SQL rangé dans un commentaire. La requête 3
du fichier trouve maintenant ses propres échantillons (un couple bloqué, une conversation, un
profil désactivé) et vérifie ce que le prédicat répond dans les deux sens, sans rien à remplacer.

### `20260907000003` — le garde du picker devait échouer fermé

**Le défaut, introduit par `20260907000001`.** Le garde premium lisait le tier requis en
**argument** de `tier_at_least` :

```sql
IF NOT public.tier_at_least(v_tier,
      (SELECT pf.required_tier FROM premium_feature_policy pf WHERE pf.feature_key = 'synastry'))
```

Ligne absente → `NULL` → `tier_at_least` commence par `WHEN p_required IS NULL … THEN TRUE` → le
garde s'ouvre, sans erreur ni trace. Toute la vague est écrite pour échouer fermé ; c'était le seul
endroit qui faisait l'inverse. Et ce n'est pas théorique : `20260429000001` supprime exactement ce
genre de ligne pour `super_likes`. Portée réelle limitée — l'edge function refusait déjà
(`can_use_premium_feature` rend `unknown_feature`), c'est la *liste* de candidats qui s'ouvrait.

**Un second mode d'échec, créé par la règle d'auto-vérification elle-même.** La première version de
ce correctif s'est **annulée toute seule sur une fausse alarme** :

```sql
IF v_def LIKE '%tier_at_least(%SELECT%' THEN RAISE EXCEPTION …
```

Les jokers `%` de SQL traversent les sauts de ligne : entre `tier_at_least(` et `SELECT`, le `%`
atteignait le `RETURN QUERY SELECT` de la fonction, quarante lignes plus bas. Le motif matchait la
**bonne** version. La migration a refusé de committer — ce qui est le comportement voulu — pour une
raison inexistante.

Un garde qui crie au loup finit supprimé. `npm run validate:rls-contract` **rejoue désormais chaque
assertion `v_def` d'une migration contre le corps de fonction que cette migration définit
elle-même**, et échoue si l'une d'elles lèverait. Traduction SQL `LIKE` → regex, gestion de `~`,
`!~`, `NOT LIKE`. Contre-épreuve faite : le motif bugué réintroduit est attrapé, avec le message qui
nomme le piège.

### Les trois enseignements de cette vague

**1. La quantification seule ne pouvait pas fermer JUNO-01.** Mesuré sur le moteur réel : même à
un pas de 1° — qui détruirait la synastrie — la combinaison des dix corps reconstitue l'instant de
naissance à ±20 min. Il n'existe pas de pas d'arrondi qui protège l'heure de naissance tout en
gardant le produit. C'est pourquoi JUNO-02 est porteur et ne doit jamais être affaibli en
« arrondir davantage ».

| pas | instant | longitude | latitude | Δscore moyen | changements de bande |
|---|---|---|---|---|---|
| 0,01° *(ancien `degree`)* | ± 0,5 min | ± 0,00° | ± 0,01° | 0,005 | 0 / 1200 |
| **0,1° *(retenu)*** | **± 5,2 min** | **± 0,04°** | **± 0,18°** | **0,039** | **4 / 1200** |
| 0,25° | ± 13,0 min | ± 0,12° | ± 0,44° | 0,089 | 12 / 1200 |
| 1° | ± 20,4 min | ± 0,53° | ± 2,10° | 0,303 | 36 / 1200 |

**2. Le calcul de synastrie a été déplacé côté serveur**, parce que le laisser côté client
obligeait à republier les longitudes. `scripts/build-edge-astrology.mjs` génère un bundle Deno
**à partir du moteur partagé lui-même** ; `npm run validate:edge-astrology` le régénère en CI et
échoue sur toute différence. Il n'y a donc pas de troisième copie du modèle de score : il y en a
une, exécutée dans deux runtimes.

**3. La liste d'aspects était un canal à part entière, et il a fallu un second regard pour le
voir.** Le lecteur connaît son propre thème : « votre Soleil trigone leur Lune, orbe 2,34° » place
leur Lune à 0,01°. Pire, `separation` (la distance angulaire exacte entre les deux longitudes)
était publiée brute — et `separation = angle ± orbe` avec `angle` constant, donc arrondir l'un en
publiant l'autre rend le premier. Les deux sont désormais quantifiés à 0,1°, soit exactement ce
que `formatOrb` affiche.

### Résiduel assumé après cette vague

Un lecteur **abonné et autorisé** peut situer jusqu'à cinq placements de sa cible à ±0,05° via la
liste d'aspects, et donc son instant de naissance à quelques minutes. C'est **inhérent au
produit** : une synastrie EST une divulgation contrôlée de géométrie de thème. Ce qui a changé est
qu'elle est désormais contrôlée — abonnement, blocages dans les deux sens, découvrabilité ou
conversation existante, et une limite de débit qui refuse quand elle ne peut pas répondre.

### Étapes manuelles avant déploiement

1. `supabase secrets set STRIPE_ANNUAL_COUPON_ID=<valeur actuelle de EXPO_PUBLIC_STRIPE_ANNUAL_COUPON_ID>`
   **avant** de déployer `create-checkout-session`, sinon le plan annuel perd sa remise.
2. `supabase secrets set STRIPE_PRICE_CELESTIAL_MONTHLY=… STRIPE_PRICE_CELESTIAL_YEARLY=… STRIPE_PRICE_COSMIC_MONTHLY=… STRIPE_PRICE_COSMIC_YEARLY=…`
   si ces variables ne sont pas déjà posées : sans elles la liste blanche des prix est vide et
   **tout** checkout est refusé.
3. Vérifier que `ENVIRONMENT` n'est **pas** posé à `development` en production.
4. Appliquer `20260907000001` puis `20260907000002` dans l'éditeur SQL, dans cet ordre, et lire
   le bloc de vérification de chacune. **`20260907000001` doit être appliquée AVANT le déploiement
   de `get-profile-chart`** : la fonction échoue fermée sans `can_view_profile_chart` et
   répondrait 503 à tout le monde.
5. Déployer `supabase functions deploy get-profile-chart create-checkout-session create-portal-session calculate-chart claim-promo-code claim-referral suggest-birth-cities`.
6. Fumée, dans cet ordre : liste de conversations → ouvrir un fil → **envoyer un message** (ce
   dernier exerce le trigger `last_message_at`, que le REVOKE aurait pu casser) ; puis synastrie
   avec un compte abonné, puis avec un compte gratuit (doit répondre 402).

---

## 1. Résumé exécutif

Le modèle de sécurité de JUNO est, dans l'ensemble, sérieux : RLS partout, `anon` sans SELECT
métier, webhooks signés, PKCE, aucun secret dans git, aucune fonction `SECURITY DEFINER` sans
`search_path`. Le travail de Phase 3-C — retirer aux comptes connectés la lecture de l'email, de
l'heure et des coordonnées de naissance — est la bonne décision, correctement exécutée en base.

Et il est entièrement contourné par une fonction edge. `get-profile-chart` renvoie les longitudes
astronomiques en précision flottante native. Ces nombres sont inversibles : une PoC hors ligne
reconstitue **l'instant de naissance exact à la seconde et les coordonnées de naissance à 1e-13
degré** à partir d'une seule réponse, pour n'importe quel profil actif, avec un compte gratuit. Le
floutage à 0,5° appliqué juste à côté est décoratif. C'est le constat qui domine tout le rapport :
il transforme un contrôle réussi en illusion, et il rend fausse toute déclaration Play Console
affirmant que les données de localisation ne sont pas partagées entre utilisateurs.

Trois autres constats sortent du lot : un `couponId` accepté du client et appliqué à Stripe sans
liste blanche (remise arbitraire), une `SUPABASE_SERVICE_ROLE_KEY` posée en clair dans
`marketingagent/.env` pour un outil qui a besoin de deux tables, et neuf fonctionnalités premium sur
onze encore gatées côté client sur mobile.

**Verdict global : ne pas publier de nouvelle version mobile ni de mise à jour Data Safety avant
correction de JUNO-01.**

---

## 2. Architecture détectée

| Composant | Techno | Rôle | Preuve |
|---|---|---|---|
| `apps/web` | Next.js 15.5.14 (App Router), React 19, next-intl 4.8.3, Tailwind v4 | Site marketing, compte, facturation, **et la PWA — seul canal iOS** | `apps/web/package.json` |
| `apps/mobile` | Expo / React Native, expo-router, Hermes | Application Android | `apps/mobile/app.json` |
| `packages/shared` | TypeScript, `astronomy-engine` | Moteur astrologique, corpus tarot/coach | `packages/shared/src/` |
| `supabase/` | Postgres 17, 110 migrations, 19 edge functions (Deno) | Backend réel : auth, RLS, RPC, webhooks, emails | `supabase/config.toml` |
| `marketingagent/` | Node autonome, hors workspaces | Automatisation marketing (Blotato, Gemini, Anthropic) | `marketingagent/package.json` |
| Hébergement web | Vercel | `vercel.json`, `.vercel/project.json` (non suivi) |
| Paiements | **Stripe** (web) + **RevenueCat** (Android) | réconciliés dans `subscriptions` | `supabase/functions/*-webhook/` |
| Email | Resend (transactionnel + lifecycle + SMTP auth) | `supabase/functions/send-email/` |
| Push | Expo Push | `supabase/functions/send-notification/` |
| Géocodage | Geoapify, **clé côté serveur uniquement** | `supabase/functions/suggest-birth-cities/` |
| Erreurs | Sentry (natif seulement) | `apps/mobile/app.json` plugins |
| Analytics | Vercel Analytics + Speed Insights ; **aucun SDK produit** — table `product_events` | `20260831000001` |

**Non présent** : aucun projet Xcode suivi (`/ios` gitignoré — iOS passe par la PWA), aucun
WebAuthn/passkey, aucun Play Integrity, aucun App Attest, aucun certificate pinning, aucune
géolocalisation d'appareil, aucun stockage de donnée de carte (Stripe Checkout hébergé + RevenueCat
→ périmètre **PCI DSS SAQ-A**).

### Environnements

Un seul projet Supabase est référencé partout (`qtihezzbuubnyvrjdkjd`), y compris dans
`apps/mobile/.env.local`, `apps/web/.env.local`, `marketingagent/.env` et les tests E2E Maestro
(qui créent de vrais comptes). **Il n'existe pas de séparation dev / staging / production
démontrable depuis le dépôt** : les données de test et les données réelles partagent la même base,
les mêmes buckets et les mêmes secrets. Voir JUNO-11 et §8.

---

## 3. Frontières de confiance et flux sensibles

```
                          ╔═══════════════════ NON FIABLE ═══════════════════╗
                          ║                                                  ║
   navigateur / PWA iOS ──╫─► localStorage : access_token + refresh_token    ║  JUNO-05
   (app.junosynastry.com) ║   sessionStorage : next, onboarded, preview      ║
                          ║   CSP script-src 'unsafe-inline'  ───────────────╫─► XSS = ATO
                          ║                                                  ║
   Android (Expo/Hermes) ─╫─► expo-secure-store (Keystore/Keychain)  ✔       ║
                          ║   anon key + clés RevenueCat dans le bundle ✔    ║
                          ║   décision premium prise ICI pour 9/11 features ─╫─► JUNO-06
                          ╚══════════════════════════════════════════════════╝
                                             │ JWT Supabase (RS/HS, 1 h)
             ┌───────────────────────────────┼───────────────────────────────┐
             ▼                               ▼                               ▼
   ┌──────────────────┐          ┌────────────────────────┐      ┌──────────────────────┐
   │ Next API routes  │          │  PostgREST + RPC       │      │  Edge Functions (19) │
   │ 4 routes         │          │  RLS + column grants   │      │  Deno, service_role  │
   │ • contact ⚠ JUNO-07          │  12 SECURITY DEFINER   │      │  verify_jwt sauf     │
   │ • request-deletion           │  exposés authenticated │      │  webhooks signés     │
   │ • confirm-deletion           └───────────┬────────────┘      └──────────┬───────────┘
   │ • billing/prices │                      │                              │
   └────────┬─────────┘                      │                              │
            │  service_role                  │                              │ service_role
            └───────────────┬────────────────┴──────────────────────────────┘
                            ▼
              ╔═════════════════════════════════════════════════════╗
              ║  Postgres — FRONTIÈRE RÉELLE                        ║
              ║  profiles : RLS "toute ligne active est lisible"    ║
              ║   → seuls les GRANT colonne protègent email,        ║
              ║     birth_time, birth_lat/lng, push_token           ║
              ║  messages/conversations : cloisonné par conversation║
              ║  premium_usage, product_events : deny-all + RPC     ║
              ╚═════════════════════════════════════════════════════╝
                            │
                            │  get-profile-chart recalcule le thème
                            ▼
              ┌─────────────────────────────────────────────────────┐
              │  RÉPONSE : sun/moon/planets.longitude (float64),     │
              │  rising.longitude, mc.longitude, houses[12]          │
              │  + coordinates arrondies à 0,5°                      │
              │                                                      │
              │  ►► INVERSIBLE ◄◄  JUNO-01                           │
              │  moon.longitude  → instant UTC exact                 │
              │  mc.longitude    → longitude de naissance exacte     │
              │  rising.longitude→ latitude de naissance exacte      │
              └─────────────────────────────────────────────────────┘

   Webhooks entrants (hors JWT) :
     Stripe ──HMAC constructEventAsync──► stripe-webhook ──begin_webhook_event (idempotent) ✔
     RevenueCat ──HMAC SHA-256 timing-safe──► revenuecat-webhook ✔
     pg_cron ──secret partagé──► send-daily-horoscope, send-scheduled-emails,
                                 publish-scheduled-posts, process-expired-deletions ✔
     Inbox lecteur ──token HMAC non expirant──► unsubscribe (303 → page web) ✔

   Sorties tierces : Resend (email), Expo Push, Geoapify, Stripe API, Blotato, Sentry.
```

**Décisions prises au mauvais endroit** (le fil conducteur du rapport) :
la remise appliquée à un abonnement (JUNO-03), l'accès à 9 fonctionnalités premium sur mobile
(JUNO-06), la limitation du brute force sur les codes promo et referral côté mobile (JUNO-23), et
le floutage des coordonnées de naissance — calculé côté serveur mais rendu inopérant par les
données publiées à côté (JUNO-01).

---

## 4. Tableau des constats

| # | Plateforme | Constat | Sévérité | Confiance | Statut |
|---|---|---|---|---|---|
| **JUNO-01** | Backend / API | Le thème renvoyé par `get-profile-chart` est inversible : heure et coordonnées de naissance exactes de tout profil actif | **Critique** | Haute | **Confirmé (PoC)** |
| **JUNO-02** | Backend / API | `get-profile-chart` et `get_synastry_candidate_profiles` ne vérifient ni le tier, ni les blocages, ni aucune relation | **Haute** | Haute | Confirmé |
| **JUNO-03** | Paiement / API | `couponId` fourni par le client appliqué à Stripe sans liste blanche | **Haute** | Haute | Confirmé |
| **JUNO-04** | Secrets / Infra | `SUPABASE_SERVICE_ROLE_KEY` en clair dans `marketingagent/.env`, JWT valide jusqu'en 2036 | **Haute** | Haute | Confirmé |
| **JUNO-05** | PWA / Web | Jetons de session en `localStorage` + CSP `script-src 'unsafe-inline'` | **Haute** | Haute | Confirmé |
| **JUNO-06** | Mobile | 9 fonctionnalités premium sur 11 gatées côté client uniquement | **Haute** | Haute | Confirmé |
| **JUNO-07** | Web / API | `/api/contact` : relais mail non authentifié, sans limite de débit ni captcha | **Moyenne** | Haute | Confirmé |
| **JUNO-08** | Backend / DB | `messages` : UPDATE accordé + policy sans `WITH CHECK` → réécriture de messages livrés | **Moyenne** | Moyenne | Probable |
| **JUNO-09** | Vie privée | Aucun nettoyage du stockage à la suppression de compte (photos, voix, vidéos de vérification) | **Moyenne** | Haute | Confirmé |
| **JUNO-10** | Web / Auth | Branche implicite résiduelle dans `auth/callback` → fixation de session | **Moyenne** | Moyenne | Probable |
| **JUNO-11** | Infra / CORS | Les listes blanches retombent en mode permissif si `ENVIRONMENT ≠ production` | **Moyenne** | Moyenne | À vérifier dynamiquement |
| **JUNO-12** | Supply chain | 47 vulnérabilités npm ; `next`, `next-intl`, `undici` atteignables à l'exécution | **Moyenne** | Haute | Confirmé |
| **JUNO-13** | Web | CSP sans nonce, `frame-ancestors` absent, pas de COOP/CORP/COEP | **Moyenne** | Haute | Confirmé |
| **JUNO-14** | Web / API | Limitation de débit en mémoire sur du serverless = inopérante | **Moyenne** | Haute | Confirmé |
| **JUNO-15** | Infra / DB | Historique de migrations désynchronisé : l'état réel de la base n'est pas prouvable | **Moyenne** | Haute | Confirmé |
| **JUNO-16** | Service worker | Cache runtime PWA non cloisonné par compte, jamais purgé ; `notificationclick` ouvre une URL du payload | **Moyenne** | Moyenne | À vérifier dynamiquement |
| **JUNO-17** | Android | `allowBackup="true"`, pas de `dataExtractionRules`, pas de Network Security Config | **Moyenne** | Moyenne | Probable |
| **JUNO-18** | CI/CD | Workflow sans bloc `permissions`, actions épinglées par tag, aucun scan de dépendances ni de secrets | **Faible** | Haute | Confirmé |
| **JUNO-19** | Web / Compte | Deux parcours de suppression divergents : le web supprime définitivement sans ré-authentification ni délai de grâce | **Faible** | Haute | Confirmé |
| **JUNO-20** | Dépôt | `apps/mobile/app/appaD.zip` : instantané de 147 Ko du code pré-durcissement, versionné dans le routeur | **Faible** | Haute | Confirmé |
| **JUNO-21** | Secrets | Clé HMAC de désabonnement dérivée de la `SERVICE_ROLE_KEY` | **Faible** | Haute | Confirmé |
| **JUNO-22** | Stockage | Buckets `avatars` et `voice-intros` en lecture publique non authentifiée | **Faible** | Haute | Confirmé |
| **JUNO-23** | Mobile | Limiteur client présenté comme protection anti-brute-force | **Faible** | Haute | Confirmé |
| **JUNO-24** | iOS | Aucun `associatedDomains` / AASA : repli sur le schéma `astrodating://`, revendicable par toute app | **Faible** | Haute | Confirmé |
| **JUNO-25** | Secrets | `generate-secret.js` versionné : identifiants Apple et secret client de 180 jours sans rotation | **Faible** | Haute | Confirmé |
| **JUNO-26** | Web | Pas de `Cache-Control: no-store` sur les réponses authentifiées | **Information** | Haute | Confirmé |
| **JUNO-27** | Tests | Identifiants de comptes E2E réels en clair dans `apps/mobile/.maestro/.env` | **Information** | Haute | Confirmé |

---

## 5. Constats détaillés

### JUNO-01 — Le thème astral publié permet de reconstituer l'heure et le lieu de naissance exacts

| | |
|---|---|
| **Plateforme** | Backend / Edge Function — impacte web **et** mobile |
| **Sévérité** | **Critique** |
| **Confiance** | Haute — démontré par une PoC hors ligne exécutée pendant l'audit |
| **Statut** | **Confirmé** |
| **Référentiels** | ASVS V8.3.4 (minimisation), API Security Top 10 API3:2023 (Broken Object Property Level Authorization), RGPD art. 5.1.c |
| **Priorité / effort** | P0 · ~½ journée |

**Preuve.**

```
supabase/functions/get-profile-chart/index.ts:55-60   getGeocentricLongitude() → float64 brut
supabase/functions/get-profile-chart/index.ts:62-76   calculateAscendant(time, lat, lng)
supabase/functions/get-profile-chart/index.ts:78-90   calculateMidheaven(time, lng)
supabase/functions/get-profile-chart/index.ts:135-148 calculatePlanetPositions() → { longitude: lon, ... }
supabase/functions/get-profile-chart/index.ts:361-372 chart = { sun, moon, rising, mc, houses, planets,
                                                       coordinates: { coarseLat, coarseLng } }
supabase/functions/get-profile-chart/index.ts:366-369 arrondi à 0,5° — appliqué UNIQUEMENT à coordinates
```

Le commentaire aux lignes 353-357 énonce la prémisse à corriger :

> *« These are ASTROLOGICAL OUTPUTS, not raw birth data: they say nothing about the exact minute or
> the exact coordinates »*

C'est faux, et de façon exacte plutôt qu'approximative. Les fonctions publiées sont déterministes,
inversibles et **fournies au client** :

1. `moon.longitude` avance de ~13,18°/jour. En précision flottante native, avec `sun.longitude`
   pour lever l'ambiguïté du jour, l'instant UTC se résout par bissection **à la seconde**.
2. `mc.longitude` ne dépend que de l'instant et de la **longitude** de naissance
   (`lst = gmst + longitude`). Instant connu → longitude exacte.
3. `rising.longitude` ne dépend plus alors que de la **latitude**. → latitude exacte.

L'attaquant n'a pas besoin d'un modèle d'éphémérides concurrent : `astronomy-engine` est une
dépendance publique et le code de la fonction est reproduit à l'identique dans
`packages/shared/src/astrology/chart.ts`, ce que le test `engine-contract.test.ts` garantit.

**PoC exécutée pendant l'audit** (hors ligne, aucune donnée réelle, aucun appel réseau) :

```
Réponse reçue par l'attaquant :
  moon    176.84265409177968
  sun     111.49649422052168
  mc      274.5632901588546
  rising  189.6589093229075
  coordinates { latitude: 45.5, longitude: -73.5 }   ← le "floutage" à 0,5°

ÉTAPE 1  instant reconstitué (UTC) : 1994-07-14T03:47:00.000Z
         instant réel               : 1994-07-14T03:47:00.000Z     erreur : 0 seconde
ÉTAPE 2  longitude reconstituée     : -73.56730000000013
         longitude réelle           : -73.5673                     erreur : 1.3e-13 °
ÉTAPE 3  latitude reconstituée      : 45.50170000000084
         latitude réelle            : 45.5017                      erreur : 8.4e-13 °
```

**Scénario d'exploitation.** Un compte gratuit s'inscrit, récupère son JWT (DevTools sur le web,
ou `expo-secure-store` sur un appareil rooté), énumère les profils via
`get_discoverable_profiles` / `get_synastry_candidate_profiles` (qui renvoient les `id`), puis
boucle :

```
POST /functions/v1/get-profile-chart
Authorization: Bearer <jwt gratuit>
{ "targetUserId": "<uuid>" }
```

La limite de débit est de **100 requêtes/heure** (`index.ts:250-255`) et n'est pas fatale en cas
d'erreur RPC (`index.ts:257-266` : `console.error` puis continuation). À 2 400 profils/jour, une
base de quelques milliers de comptes est moissonnée en une nuit.

**Impact.**
*Technique* : les cinq colonnes que `20260903000003` protège (`email` excepté) —
`birth_time`, `birth_latitude`, `birth_longitude` — redeviennent lisibles pour tout compte connecté,
par un autre chemin. Le travail de Phase 3-C n'est pas contourné à la marge : il est annulé.
*Métier* : une latitude/longitude de naissance est une **donnée de localisation** au sens du RGPD et
de Play Console Data Safety. Si la déclaration Play indique que les données de localisation ne sont
pas partagées avec d'autres utilisateurs, elle est fausse tant que ce constat est ouvert. L'heure de
naissance exacte est par ailleurs un identifiant quasi unique, croisable avec des registres publics.

**Recommandation.** Ne publier que ce que l'écran affiche. L'UI montre un signe et un degré dans le
signe — jamais une longitude écliptique brute.

```ts
// get-profile-chart/index.ts — arrondir à la sortie, pas seulement les coordonnées.
const PRECISION = 2;                       // 0,01° ≈ 36" — au-delà de ce que l'UI rend
const q = (d: number) => Math.round(d * 10 ** PRECISION) / 10 ** PRECISION;

const chart = {
  sun:    { sign: getZodiacSign(sunLong),  degree: q(getDegreeInSign(sunLong))  },
  moon:   { sign: getZodiacSign(moonLong), degree: q(getDegreeInSign(moonLong)) },
  rising: ascLong  != null ? { sign: getZodiacSign(ascLong), degree: q(getDegreeInSign(ascLong)) } : null,
  mc:     mcLong   != null ? { sign: getZodiacSign(mcLong),  degree: q(getDegreeInSign(mcLong))  } : null,
  houses: housesArr?.map((h) => ({ sign: getZodiacSign(h), degree: q(getDegreeInSign(h)) })) ?? null,
  planets: Object.fromEntries(Object.entries(planets).map(([k, p]) => [k,
            { sign: p.sign, degree: q(p.degree) }])),          // plus de `longitude`
  coordinates: { latitude: coarseLat, longitude: coarseLng },
  confidence,
};
```

Trois précautions : (a) **retirer la clé `longitude`**, ne pas seulement l'arrondir — 6 décimales
restent inversibles ; (b) 0,01° sur la Lune laisse encore une fenêtre d'environ une minute, donc
combiner avec JUNO-02 (n'exposer le thème qu'aux tiers autorisés) plutôt que de compter sur
l'arrondi seul ; (c) vérifier les consommateurs — `packages/shared/src/astrology/synastry-view.ts`
et `stored.ts` lisent ce payload ; la synastrie se calcule très bien sur des degrés dans le signe,
mais le changement doit être couvert par `engine-contract.test.ts`.

**Garde-fou à ajouter** : un test qui échoue si une réponse d'edge function contient un nombre à
plus de N décimales dans un champ nommé `longitude`.

---

### JUNO-02 — Les données premium ne vérifient ni l'abonnement, ni les blocages, ni aucune relation

| | |
|---|---|
| **Plateforme** | Backend / Edge Function + RPC |
| **Sévérité** | **Haute** |
| **Confiance** | Haute (preuve par absence, vérifiée par lecture intégrale) |
| **Statut** | **Confirmé** — déjà ouvert au 3 sep, toujours ouvert |
| **Référentiels** | API Security Top 10 API1:2023 (BOLA), API5:2023 (BFLA), ASVS V4.1.1 |
| **Priorité / effort** | P1 · ~1 journée (risque de régression réel) |

**Preuve.** Lecture intégrale de `supabase/functions/get-profile-chart/index.ts` : les seules
occurrences de `tier|premium|enforce` concernent l'authentification. Le contrôle s'arrête à
`index.ts:233` (`auth.getUser`) puis `index.ts:290-293` (`is_active`, `onboarding_completed`).

Il manque trois vérifications :

1. **L'abonnement.** La carte du ciel d'autrui est le produit vendu par l'abonnement Céleste. Elle
   est servie à tout JWT valide.
2. **Le blocage.** `blocked_users` n'est jamais consulté. Une personne bloquée conserve l'accès au
   thème de celle qui l'a bloquée — alors que la policy `messages` (`20260428000002:178-188`) prend
   soin de vérifier le blocage dans les deux sens.
3. **La découvrabilité.** Le filtre genre / `looking_for` de `get_discoverable_profiles` n'est pas
   rejoué : n'importe quel `uuid` de profil actif est acceptable, y compris un profil que
   l'appelant ne pourrait jamais voir dans Discover.

`get_synastry_candidate_profiles` (`20260513000001`) est correctement gardée sur `auth.uid()` et
filtre les blocages, mais ne vérifie aucun tier non plus.

**Scénario.** Identique à JUNO-01 — c'est le même appel. Sans JUNO-01, l'impact se limite au vol de
la valeur premium et au contournement du blocage ; avec, il devient l'extraction de PII de
localisation.

**Recommandation.** Appeler `can_use_premium_feature` (lecture seule) **dans** la fonction edge avec
le JWT de l'appelant, avant de composer la réponse — jamais `enforce_premium_feature`, qui
consomme un aperçu gratuit et reproduirait le bug de double consommation corrigé le 23 août
(`20260823000001`). Ajouter en amont un `EXISTS` sur `blocked_users` dans les deux sens.

```ts
const { data: gate } = await jwtClient.rpc('can_use_premium_feature', { p_feature_key: 'synastry' });
if (!gate?.allowed) return jsonError(403, 'premium_required', allowedOrigin);

const { data: blocked } = await adminClient
  .from('blocked_users').select('blocker_id')
  .or(`and(blocker_id.eq.${caller.id},blocked_id.eq.${targetUserId}),` +
      `and(blocker_id.eq.${targetUserId},blocked_id.eq.${caller.id})`)
  .maybeSingle();
if (blocked) return jsonError(404, 'Profile not available', allowedOrigin);
```

---

### JUNO-03 — Une remise Stripe arbitraire, choisie par le client

| | |
|---|---|
| **Plateforme** | Paiement / Edge Function (web + mobile web-payments) |
| **Sévérité** | **Haute** |
| **Confiance** | Haute |
| **Statut** | **Confirmé** |
| **Référentiels** | ASVS V4.1.3, API Security Top 10 API6:2023 (Unrestricted Access to Sensitive Business Flows) |
| **Priorité / effort** | P0 · ~1 heure |

**Preuve.**

```
supabase/functions/create-checkout-session/index.ts:144   const { priceId, userId, couponId, promoCode, ... } = await req.json();
supabase/functions/create-checkout-session/index.ts:164   allKnownPriceIds.includes(priceId)   ← le priceId EST validé
supabase/functions/create-checkout-session/index.ts:295   if (couponId) { sessionParams.discounts = [{ coupon: couponId }]; }
                                                          ← le couponId ne l'est PAS
apps/web/src/lib/web-checkout.ts:34        couponId: isAnnual && ANNUAL_COUPON_ID ? ANNUAL_COUPON_ID : undefined
apps/mobile/services/webPayments.ts:49-56  même décision, prise dans le client
```

La règle métier « la remise annuelle s'applique aux abonnements annuels » est **entièrement écrite
côté client**. Le serveur valide rigoureusement le prix, puis applique sans contrôle le coupon
qu'on lui tend. Pire : l'identifiant du coupon annuel est publié dans le bundle
(`EXPO_PUBLIC_STRIPE_ANNUAL_COUPON_ID` / `NEXT_PUBLIC_…`), donc l'attaquant n'a même pas à deviner.

**Scénario.**

```
POST /functions/v1/create-checkout-session          Authorization: Bearer <jwt légitime>
{ "priceId": "<prix MENSUEL Celestial>",            ← valide, passe la liste blanche
  "couponId": "<coupon ANNUEL, lu dans le bundle>", ← appliqué tel quel
  "userId": "<le sien>", "successUrl": "...", "cancelUrl": "..." }
```

Stripe crée la session avec la remise. Deux extensions :
(a) tout coupon existant du compte Stripe est applicable à tout prix — un coupon interne, partenaire
ou 100 % créé pour un test devient exploitable ; (b) Stripe renvoie une erreur pour un coupon
inexistant et pas pour un coupon valide : la fonction est un **oracle d'énumération d'identifiants
de coupons**, et `error: 'Something went wrong'` (ligne 329) ne masque pas la différence de code
HTTP (400 vs 200).

**Impact.** Perte de revenu directe et non plafonnée, non détectable dans les webhooks (la session
est légitimement signée). Aucune trace ne distingue une remise abusive d'une remise voulue.

**Recommandation.** Supprimer `couponId` du contrat d'entrée et dériver la remise du prix, côté
serveur.

```ts
// create-checkout-session/index.ts — la remise devient une conséquence du prix.
const LEGACY_ANNUAL_COUPON = Deno.env.get('STRIPE_ANNUAL_COUPON_ID') || '';

const serverCoupon =
  LEGACY_ANNUAL_COUPON && isYearlyPriceId(priceId) ? LEGACY_ANNUAL_COUPON : null;

// ...
if (serverCoupon && !promoCampaign) {
  sessionParams.discounts = [{ coupon: serverCoupon }];
  delete sessionParams.allow_promotion_codes;
}
// `couponId` du body : ignoré. Le client ne choisit plus une remise, il choisit un plan.
```

Retirer ensuite `couponId` de `apps/web/src/lib/web-checkout.ts:34` et
`apps/mobile/services/webPayments.ts:49` — le champ `EXPO_PUBLIC_STRIPE_ANNUAL_COUPON_ID` n'a plus
de raison d'être public.

---

### JUNO-04 — La clé service_role vit en clair dans l'outil marketing

| | |
|---|---|
| **Plateforme** | Secrets / poste de développement + exécution cloud éventuelle |
| **Sévérité** | **Haute** |
| **Confiance** | Haute |
| **Statut** | **Confirmé** |
| **Référentiels** | ASVS V6.4.1, V14.1.4 ; principe du moindre privilège |
| **Priorité / effort** | P0 · ~2 heures |

**Preuve (valeurs masquées, jamais reproduites).**

```
marketingagent/.env  — présent sur le disque, NON suivi par git (vérifié)
  ligne 1   ANTHROPIC_API_KEY          = sk-ant-api03-…[MASQUÉ]
  ligne 3   GEMINI_API_KEY             = AIza…[MASQUÉ]
  ligne 5   SUPABASE_SERVICE_ROLE_KEY  = eyJ…[MASQUÉ]   role=service_role, exp = 2036
  ligne 15  GEMINI_API_KEY             = AIza…[MASQUÉ]   (doublon)
```

**Ce qui va bien, et qui mérite d'être dit** : `git check-ignore` confirme que le fichier est
couvert par `.gitignore:34`, `git log --all --diff-filter=A` sur tout l'historique ne remonte que
des `.env.example`, et le bundle Hermes livré (`apps/mobile/dist/.../entry-*.hbc`) ne contient
**aucune** de ces valeurs — seules la clé anon Supabase et la clé publique RevenueCat Android y
figurent, ce qui est leur place. `.easignore:47` exclut `marketingagent/` de l'archive envoyée à
EAS. Le cloisonnement build est correct.

Ce qui ne va pas est le privilège. `marketingagent` a besoin d'écrire dans
`scheduled_marketing_posts` et de déposer des images dans un bucket :

```
marketingagent/cloud-scheduler.ts:67   process.env.SUPABASE_SERVICE_ROLE_KEY
marketingagent/upload-image.ts:26      process.env.SUPABASE_SERVICE_ROLE_KEY
```

Il détient à la place la clé qui contourne toute la RLS, lit `profiles` en entier, et dont
`unsubscribe/index.ts:34` dérive en plus le secret HMAC de désabonnement (JUNO-21). Le JWT expire
en 2036 et n'a pas de rotation documentée.

**Scénario.** Compromission du poste de développement (infostealer, dépôt d'un tiers, sauvegarde
non chiffrée), ou fuite lors du passage au runner cloud décrit dans `marketingagent/CLOUD-RUNBOOK.md:56`
→ lecture et écriture intégrales de la base : emails, heures et coordonnées de naissance,
conversations, abonnements. Aucune RLS ne s'y oppose, et la table `security_posture_alerts` ne le
verrait pas.

**Recommandation.**
1. **Rotation immédiate** de la `SUPABASE_SERVICE_ROLE_KEY` dans le dashboard Supabase — en
   sachant que cela invalide tous les liens de désabonnement déjà envoyés (JUNO-21), ce qui est
   précisément la raison de découpler les deux secrets d'abord.
2. Créer un rôle Postgres dédié `marketing_bot` (`NOLOGIN` + JWT signé avec ce `role`), avec
   `GRANT INSERT, SELECT ON scheduled_marketing_posts` et une policy storage limitée au bucket
   `marketing-images`. Rien d'autre.
3. Sortir les clés du fichier `.env` : `supabase secrets set` pour la partie edge, et le
   gestionnaire de secrets du runner pour la partie cloud.
4. Auditer l'usage passé de la clé (`Logs Explorer` Supabase, filtre `service_role`) sur la
   fenêtre de rétention disponible.

---

### JUNO-05 — Jetons en localStorage et CSP qui autorise l'inline, sur le canal iOS

| | |
|---|---|
| **Plateforme** | PWA / Web (`apps/web`) — et donc **iOS**, seul canal Apple |
| **Sévérité** | **Haute** |
| **Confiance** | Haute |
| **Statut** | **Confirmé** — connu et documenté par l'équipe (`supabase/SECURITY.md`, risque résiduel n° 2) |
| **Référentiels** | ASVS V3.4, V14.4.3 ; OWASP Session Management CS |
| **Priorité / effort** | P1 · chantier de 3-5 jours (BFF) — ou P0 partiel : la CSP seule, ~1 jour |

**Preuve.**

```
apps/web/src/lib/supabase-browser.ts:32   persistSession: true   → storage par défaut = localStorage
apps/web/next.config.ts:26                script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com
apps/web/next.config.ts:27                script-src-elem 'self' 'unsafe-inline' …
apps/mobile/services/supabase.ts:76-81    la note du fichier reconnaît exactement ce risque
```

Les deux moitiés sont chacune défendables ; ensemble elles composent une chaîne complète. Une XSS
— réfléchie, stockée ou par dépendance — s'exécute (l'`unsafe-inline` la laisse passer), lit
`localStorage`, et exfiltre l'**access token et le refresh token**. Le refresh token vaut une
session renouvelable indéfiniment : révoquer le mot de passe ne suffit pas, il faut invalider la
session côté Supabase.

Ce qui fait passer ce constat de P2 (l'évaluation interne) à Haute : **iOS n'a pas d'autre canal**.
Sur Android la session est dans `expo-secure-store` (Keystore) — vérifié
`apps/mobile/services/supabase.ts:49-72`, et c'est bien fait. Sur iOS, 100 % des utilisateurs sont
sur la surface exposée.

**Recommandation, par ordre de rentabilité.**

1. **Retirer `'unsafe-inline'`** — c'est le maillon le moins coûteux à couper et il ne demande pas
   de BFF. Next.js App Router supporte le nonce par middleware :

```ts
// apps/web/src/middleware.ts
const nonce = btoa(crypto.randomUUID());
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
  `style-src 'self' 'unsafe-inline'`,
  `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
].join('; ');

const headers = new Headers(request.headers);
headers.set('x-nonce', nonce);
const response = intlMiddleware(new NextRequest(request, { headers }));
response.headers.set('Content-Security-Policy', csp);
return response;
```

   `'strict-dynamic'` est ce qui rend l'opération réaliste : les scripts d'hydratation que Next
   injecte héritent de la confiance du script noncé. **Déployer d'abord en
   `Content-Security-Policy-Report-Only`** pendant 48 h — un nonce mal câblé casse la page entière,
   c'est la raison pour laquelle le chantier a été repoussé jusqu'ici.
2. À moyen terme, session portée par cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, via
   `@supabase/ssr` — qui fournit exactement ce découpage et évite d'écrire un BFF maison. Ajouter
   alors une protection CSRF (double-submit ou vérification `Origin`) sur les routes mutantes.

---

### JUNO-06 — Neuf fonctionnalités premium sur onze décidées par le téléphone

| | |
|---|---|
| **Plateforme** | Mobile (Android) |
| **Sévérité** | **Haute** (impact financier direct) |
| **Confiance** | Haute |
| **Statut** | **Confirmé** — ouvert depuis le 3 sep |
| **Référentiels** | MASVS-AUTH-2, ASVS V4.1.1 ; API Security Top 10 API5:2023 |
| **Priorité / effort** | P1 · ~2 jours + validateur |

**Preuve.**

```
apps/mobile/services/premiumUsage.ts:34-50   FEATURE_TIERS : 11 clés
apps/mobile/services/premiumUsage.ts:77-80   SERVER_ENFORCED_FEATURES : 2 clés
                                             ('natal-chart', 'conversation-guide')
apps/mobile/services/premiumUsage.ts:65-67   « Features absent from this map keep the legacy
                                               client-side trial path »
```

Sortie du validateur du dépôt, exécutée pendant l'audit :

```
$ npm run validate:premium-gating
Premium gating contract looks clean: 2 server-enforced feature(s)
(natal-chart→natal_chart, conversation-guide→conversation_guide), 19 policy keys, 8 reason codes aligned.
```

Le validateur passe : il vérifie la cohérence de la table, pas sa couverture. Restent côté client :
`synastry`, `daily-horoscope`, `monthly-horoscope`, `planetary-transits`, `retrograde-alerts`,
`lucky-days`, `date-planner`, `weekly-tarot`, `monthly-tarot`.

Le web est nettement plus avancé : six composants appellent `enforce_premium_feature`
(`NatalChartOverview`, `TarotReadingOverview`, `DatePlannerOverview`, `RetrogradeAlertsOverview`,
`PlanetaryTransitsOverview`, `ConversationGuideOverview`). L'écart web/mobile est le constat, autant
que le gating lui-même.

**Scénario.** Deux chemins, aucun ne demandant de reverse engineering avancé :
(a) l'appel direct — les données de ces écrans viennent de RPC ou de calculs locaux qui ne
vérifient rien ; (b) le patch du bundle — `PremiumContext` détient l'état, et
`apps/mobile/contexts/PremiumContext.tsx:172-175` fait déjà primer l'entitlement RevenueCat local
sur la réponse serveur (« trust the device — the webhook may simply be lagging »), ce qui est un
compromis produit compréhensible mais qui grave dans le code que le device peut surclasser le
serveur.

**Recommandation.** Migrer feature par feature vers `SERVER_ENFORCED_FEATURES`, dans l'ordre de
valeur (synastry, date-planner, tarot d'abord), chacune avec sa `free_preview_quota` dans
`premium_feature_policy`. Ajouter le validateur `validate:premium-data-sources` recommandé au §13
de l'audit du 3 sep : il énumère les sources de données premium et échoue si l'une d'elles ne
vérifie pas de tier. Hors build de publication — une erreur ici ferme une fonctionnalité à des
abonnés payants.

---

### JUNO-07 — `/api/contact` est un relais mail ouvert

| | |
|---|---|
| **Plateforme** | Web / Next.js API route |
| **Sévérité** | **Moyenne** (Haute pour la réputation d'envoi) |
| **Confiance** | Haute |
| **Statut** | **Confirmé** |
| **Référentiels** | ASVS V11.1.4 (anti-automation), API4:2023 (Unrestricted Resource Consumption) |
| **Priorité / effort** | P1 · ~3 heures |

**Preuve.**

```
apps/web/src/app/api/contact/route.ts:68    export async function POST(request: Request) {
                                            ← aucune vérification d'authentification
apps/web/src/app/api/contact/route.ts:121   await resend.emails.send({ from: EMAIL_FROM, to: email, … })
                                            ← `email` vient du corps de la requête
apps/web/src/app/api/contact/route.ts:135   <div>${safeMessage}</div>
                                            ← contenu contrôlé par l'appelant, dans le mail sortant
```

Aucun limiteur de débit (contrairement à `request-deletion/route.ts:6-22`, qui en a un — imparfait,
voir JUNO-14, mais présent), aucun captcha, aucune preuve de possession de l'adresse.

**Ce qui est correct et qu'il ne faut pas casser** : `htmlEscape` (ligne 9) et `sanitizeHeader`
(ligne 16, anti-injection d'en-tête CRLF) sont bien faits, la catégorie est sur liste blanche, le
message est plafonné à 5 000 caractères. Ce n'est pas une injection ; c'est un abus de volume et
d'identité.

**Scénario.** `for addr in liste; do curl -X POST …/api/contact -d "{\"email\":\"$addr\", …}"` —
chaque adresse reçoit un message « We received your message — JUNO » depuis le domaine vérifié
Resend, contenant le texte de l'attaquant. Résultat : (a) campagne de phishing signée SPF/DKIM par
JUNO, (b) plaintes pour spam → dégradation puis suspension de la réputation d'envoi Resend, (c) le
même domaine porte les emails transactionnels : la perte de délivrabilité casse la confirmation
d'inscription et la réinitialisation de mot de passe.

**Recommandation.** Trois mesures, cumulatives :

```ts
// 1. Ne plus écrire à une adresse non prouvée : supprimer le second resend.emails.send.
//    L'accusé de réception part quand la personne est authentifiée, ou pas du tout.
// 2. Limite de débit persistée (voir JUNO-14) — par IP ET par adresse destinataire.
// 3. Captcha : Turnstile est déjà prévu côté Supabase (config.toml, section [auth.captcha]).
const ok = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ secret: requireServerEnv('TURNSTILE_SECRET'), response: body.token }),
}).then((r) => r.json());
if (!ok.success) return NextResponse.json({ error: "Verification failed" }, { status: 400 });
```

---

### JUNO-08 — Un expéditeur peut réécrire ses messages déjà livrés

| | |
|---|---|
| **Plateforme** | Backend / Postgres RLS |
| **Sévérité** | **Moyenne** |
| **Confiance** | Moyenne — le privilège vient du `GRANT ALL` par défaut de Supabase, non prouvé sur la base réelle |
| **Statut** | **Probable** — requête de vérification fournie en §8 |
| **Référentiels** | ASVS V4.2.1, API3:2023 |
| **Priorité / effort** | P1 · ~15 minutes |

**Preuve.**

```
supabase/migrations/00000000000000_full_schema.sql:402
  CREATE POLICY "Users can update own messages" ON messages
    FOR UPDATE USING (auth.uid() = sender_id);        ← pas de WITH CHECK
```

Sans `WITH CHECK`, PostgreSQL réutilise `USING`. La nouvelle ligne doit seulement conserver
`sender_id = auth.uid()` — **`content`, `conversation_id`, `is_read` et `read_at` sont libres**.

Cette policy n'a jamais été supprimée : `grep` sur les 110 migrations ne remonte aucun `DROP POLICY
"Users can update own messages"`, et **aucun `REVOKE … ON public.messages`** n'existe non plus. Le
`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated` par défaut de Supabase tient donc
toujours.

C'est exactement la forme du constat n° 4 du 3 septembre sur `conversations`, corrigé par
`20260903000001` — la même omission, sur la table voisine. L'intention de l'équipe est d'ailleurs
écrite noir sur blanc dans `20260514000001:3` (« Direct client UPDATEs against public.messages can
only update rows allowed by… ») et matérialisée par le RPC `mark_conversation_messages_read`, dont
l'existence même prouve qu'aucun client ne doit avoir besoin d'`UPDATE` : la recherche
`from('messages').update(` ne renvoie **zéro** occurrence dans les deux applications.

**Scénario.**

```
PATCH /rest/v1/messages?id=eq.<un message que j'ai envoyé>
{ "content": "message anodin" }        → USING ok (je suis sender), WITH CHECK ok (sender inchangé)
```

Une personne signalée pour harcèlement réécrit après coup le contenu des messages sur lesquels
repose le signalement. Dans une application de rencontre, la **non-répudiation du fil de
conversation est une fonction de sécurité produit**, pas un détail technique : c'est la preuve que
l'équipe modération et, le cas échéant, les autorités examineront.

Variante secondaire : déplacer un de ses messages d'une conversation A vers une conversation B
(`conversation_id` est libre). L'`uuid` cible est aléatoire et non énumérable, donc l'attaque ne
porte que sur les conversations dont l'attaquant est déjà membre — impact limité, mais le
déplacement transversal devient possible dès qu'un `conversation_id` fuit par ailleurs.

`DELETE` est déjà refusé : aucune policy `FOR DELETE` sur `messages`, et sous RLS l'absence de
policy vaut refus.

**Recommandation.**

```sql
begin;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.messages FROM authenticated, anon;
-- INSERT reste : la policy "Users can send conversation messages" est le chemin d'envoi.
-- La policy UPDATE est laissée en place, inatteignable sans le privilège — même choix
-- éditorial que 20260903000001 sur conversations.
COMMENT ON TABLE public.messages IS
  'INSERT + SELECT pour authenticated. UPDATE révoqué le 2026-09-07 : la policy héritée du schéma
   initial n''avait pas de WITH CHECK, ce qui laissait un expéditeur réécrire content et
   conversation_id après livraison. Les accusés de lecture passent par
   mark_conversation_messages_read (SECURITY DEFINER).';
commit;
```

Vérification de non-régression obligatoire après application : **envoyer un message** (exerce le
trigger `update_conversation_last_message`, `SECURITY DEFINER`, donc insensible au revoke) et
**ouvrir un fil** (exerce `mark_conversation_messages_read`).

---

### JUNO-09 — La suppression de compte laisse les photos, la voix et les vidéos de vérification

| | |
|---|---|
| **Plateforme** | Vie privée / Supabase Storage (les deux plateformes) |
| **Sévérité** | **Moyenne** |
| **Confiance** | Haute (preuve par absence, vérifiée sur les trois chemins) |
| **Statut** | **Confirmé** |
| **Référentiels** | RGPD art. 17 (effacement) ; ASVS V8.3.5 |
| **Priorité / effort** | P1 · ~4 heures |

**Preuve.** Recherche de `storage` dans les trois chemins de suppression : **aucune occurrence**.

```
supabase/functions/delete-account/index.ts               (soft delete + grâce)      → 0
supabase/functions/process-expired-deletions/index.ts:84 auth.admin.deleteUser()    → 0
apps/web/src/app/api/account/confirm-deletion/route.ts:107 auth.admin.deleteUser()  → 0
```

`auth.admin.deleteUser()` propage en cascade sur les tables qui référencent `auth.users`. Il ne
touche pas `storage.objects` : ce sont des lignes d'un autre schéma, sans clé étrangère vers
l'utilisateur — le lien est conventionnel, le premier segment du chemin
(`storage.foldername(name))[1] = auth.uid()::text`).

Survivent donc indéfiniment, sous `<uuid>/…` :

| Bucket | Contenu | Lecture |
|---|---|---|
| `avatars` | photos de profil | **publique, non authentifiée** (`20260419000001:29`) |
| `voice-intros` | enregistrements vocaux | **publique, non authentifiée** (`20260419000001:71`) |
| `verifications` | vidéo/selfie de vérification d'identité | propriétaire seul — mais le propriétaire n'existe plus, donc plus personne… sauf `service_role` |

Le message de confirmation envoyé à la personne (`confirm-deletion/route.ts:121`) affirme :
*« All associated data (profile, matches, messages) has been removed. »* La formulation exclut
techniquement les médias, mais aucun lecteur ne la lira ainsi.

**Impact.** Une demande d'effacement RGPD n'est pas honorée sur la catégorie de données la plus
identifiante du produit — un visage, une voix, et pour `verifications` un document de vérification
d'identité. Les URL `avatars` et `voice-intros` restent servies publiquement après suppression,
donc toute URL déjà partagée, indexée ou mise en cache reste vivante.

**Recommandation.** Purger avant de supprimer l'utilisateur, dans `process-expired-deletions` (le
chemin mobile) **et** dans `confirm-deletion` (le chemin web) :

```ts
async function purgeUserStorage(admin: SupabaseClient, userId: string) {
  for (const bucket of ['avatars', 'voice-intros', 'verifications'] as const) {
    const { data: files, error } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
    if (error) { console.error(`[purge] list ${bucket}`, error.message); continue; }
    if (!files?.length) continue;
    const paths = files.map((f) => `${userId}/${f.name}`);
    const { error: rmError } = await admin.storage.from(bucket).remove(paths);
    if (rmError) console.error(`[purge] remove ${bucket}`, rmError.message);
  }
}
// appeler AVANT auth.admin.deleteUser(userId) — après, l'uuid reste utilisable mais
// l'échec devient silencieux et personne ne repassera derrière.
```

Prévoir un script de rattrapage pour les comptes déjà supprimés : les dossiers orphelins sont ceux
dont le premier segment n'existe plus dans `auth.users`.

---

### JUNO-10 — La branche implicite résiduelle du callback web

| | |
|---|---|
| **Plateforme** | Web / Auth |
| **Sévérité** | **Moyenne** |
| **Confiance** | Moyenne — exploitabilité à confirmer dynamiquement |
| **Statut** | **Probable** |
| **Référentiels** | RFC 9700 §2.1.2 (implicit deprecated), ASVS V3.2.3 ; OAuth 2.0 Login CSRF |
| **Priorité / effort** | P2 · ~1 heure |

**Preuve.**

```
apps/web/src/app/[locale]/auth/callback/page.tsx:106-117
  } else if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
```

Les deux valeurs viennent du fragment d'URL (`page.tsx:67-68`, `hashParams`). Le commentaire de
`apps/web/src/lib/supabase-browser.ts:19-20` la décrit comme « a defensive fallback […] should
normally never fire » — mais elle est atteignable par construction de l'URL, sans passer par
Supabase.

Le mobile a fait le choix inverse, et l'a écrit :

```
apps/mobile/services/socialAuth.ts:96-98
  // SECURITY: Implicit flow removed — PKCE code exchange is required.
```

**Scénario (login CSRF / fixation de session).** L'attaquant obtient une session sur *son* compte,
puis fait ouvrir à la victime :

```
https://app.junosynastry.com/fr/auth/callback#access_token=<le sien>&refresh_token=<le sien>
```

La victime est silencieusement connectée au compte de l'attaquant. Tout ce qu'elle saisit ensuite —
photos, date, heure et **ville de naissance**, conversations, éventuellement un abonnement payé avec
sa carte — atterrit dans un compte que l'attaquant contrôle et pourra rouvrir. Aucun `state`, aucun
`nonce`, aucune vérification d'origine ne s'y oppose sur cette branche.

**Recommandation.** Supprimer la branche. Le flux PKCE est déjà le chemin nominal (`code` →
`exchangeCodeForSession`) et `token_hash` couvre les liens email.

```ts
// apps/web/src/app/[locale]/auth/callback/page.tsx
} else if (accessToken || refreshToken) {
  // Alignement sur mobile (socialAuth.ts:96) : le flux implicite est retiré.
  // Des jetons dans le fragment ne peuvent plus venir que d'une URL fabriquée.
  console.warn("[AuthCallback] implicit tokens rejected");
  setErrorMessage(t("authCallbackUnsupportedLink"));
  setStatus("error");
  return;
}
```

Si un fournisseur d'identité exige encore l'implicite, le maintenir derrière une comparaison de
`state` généré et stocké avant la redirection.

---

### JUNO-11 — Les listes blanches CORS et redirections retombent en mode permissif

| | |
|---|---|
| **Plateforme** | Infrastructure / Edge Functions |
| **Sévérité** | **Moyenne** |
| **Confiance** | Moyenne |
| **Statut** | **À vérifier dynamiquement** |
| **Référentiels** | ASVS V14.5.3, API7:2023 |
| **Priorité / effort** | P1 · ~30 minutes |

**Preuve.** Sept fonctions partagent ce motif :

```
supabase/functions/create-checkout-session/index.ts:24
supabase/functions/create-portal-session/index.ts:24
supabase/functions/calculate-chart/index.ts:531
supabase/functions/get-profile-chart/index.ts:172
supabase/functions/claim-promo-code/index.ts:20
supabase/functions/claim-referral/index.ts:22
supabase/functions/suggest-birth-cities/index.ts:48

  const ALLOWED_ORIGINS = Deno.env.get('ENVIRONMENT') === 'production'
    ? PROD_ORIGINS
    : DEV_ORIGINS;         // = PROD_ORIGINS + localhost:3000, :8081, :19006
```

Le défaut est le mode permissif : variable absente, mal orthographiée ou renommée → `localhost` est
accepté. Or `ENVIRONMENT` **n'apparaît nulle part** en dehors de ces sept fichiers : ni dans
`.env.example`, ni dans `.github/workflows/ci.yml`, ni dans `docs/`. La seule mention est
`docs/marketing/screenshot-seed-notes.md:457`, qui décrit le motif sans dire où la variable est
posée. Rien dans le dépôt ne prouve qu'elle vaut `production` en production.

**Impact si elle ne l'est pas.** `create-checkout-session` valide `successUrl` et `cancelUrl`
contre `ALLOWED_ORIGINS` (`index.ts:151-162`) : un `successUrl` sur `http://localhost:3000`
deviendrait acceptable, et l'`Access-Control-Allow-Origin` renvoyé permettrait à une page servie en
local de lire les réponses avec les identifiants de la victime.

**Recommandation.** Inverser le défaut — c'est plus court, et plus sûr :

```ts
const ALLOWED_ORIGINS =
  Deno.env.get('ENVIRONMENT') === 'development' ? [...PROD_ORIGINS, ...DEV_ORIGINS] : PROD_ORIGINS;
```

Et vérifier l'état réel : `supabase secrets list` doit montrer `ENVIRONMENT`. Consigner la valeur
attendue dans `.env.example`.

---

### JUNO-12 — 47 vulnérabilités npm, dont trois atteignables à l'exécution

| | |
|---|---|
| **Plateforme** | Supply chain (web surtout) |
| **Sévérité** | **Moyenne** |
| **Confiance** | Haute |
| **Statut** | **Confirmé** |
| **Référentiels** | ASVS V14.2.1 ; OWASP A06:2021 |
| **Priorité / effort** | P1 pour les trois runtime · ~½ journée |

**Preuve.** `npm audit --omit=dev --audit-level=low` exécuté à la racine :

```
{"info":0,"low":2,"moderate":24,"high":19,"critical":2,"total":47}
```

Le tri demandé par l'audit précédent (§11 du 3 sep) est fait ici. Trois piles :

**Exploitable sur notre surface — à traiter.**

| Paquet | Version | Avis | Pourquoi ici |
|---|---|---|---|
| `next` | 15.5.14 | GHSA-q4gf-8mx6-v5v3 / GHSA-8h8q-6873-q5fj — DoS via Server Components | Serveur Vercel exposé, non authentifié. `fixAvailable: true`, non majeur. |
| `next-intl` | 4.8.3 | GHSA-8f24-v5vv-gm5j — **open redirect** ; GHSA-4c35-wcg5-mm9h — prototype pollution | `createMiddleware` est sur le chemin de **chaque** requête (`middleware.ts:6`). La redirection ouverte que §4 de l'audit du 3 sep déclarait absente peut revenir par la dépendance. |
| `undici` | 6.24.1 | GHSA-p88m-4jfj-68fv — injection d'en-tête via percent-decoding de `Set-Cookie` | `fetch` côté serveur Next, y compris `api/billing/prices` vers Stripe. |

**Non exploitable ici — à noter, pas à corriger en urgence.** `shell-quote` (critique),
`tar` (critique), `metro*`, `@expo/cli`, `browserslist`, `postcss`, `image-size`, `js-yaml`,
`lodash`, `nanoid`, `@xmldom/xmldom` : outillage de build. Ils s'exécutent sur le poste de dev et
sur EAS, jamais dans un binaire livré ni dans une réponse HTTP. Le risque réel qu'ils portent est
la compromission de la chaîne de build, ce qui renvoie à JUNO-18.

**Cas particulier : `sharp` 0.34.5** (GHSA-f88m-g3jw-g9cj, CVE libvips). Il est déclaré dans
`apps/mobile/package.json:80`, **pas** dans `apps/web` — il ne traite donc pas les photos
utilisateurs : l'optimisation d'images en production est celle de Vercel. Exposition limitée à la
génération d'assets sur le poste de dev. À corriger, sans urgence.

**Recommandation.**

```
npm i next@latest next-intl@latest -w @astro/web
npm audit fix          # remonte undici, brace-expansion, ws, nanoid, tar, shell-quote
npm audit --omit=dev --audit-level=high   # doit revenir vide sur les trois runtime
```

Ajouter l'étape au CI (JUNO-18) pour que la pile « exploitable ici » ne se reconstitue pas en
silence.

---

### JUNO-13 — CSP sans nonce, `frame-ancestors` absent, pas d'isolation d'origine

| | |
|---|---|
| **Plateforme** | Web |
| **Sévérité** | **Moyenne** |
| **Confiance** | Haute |
| **Statut** | **Confirmé** |
| **Référentiels** | ASVS V14.4.1-V14.4.7 |
| **Priorité / effort** | P1 · ~1 jour (voir JUNO-05, même chantier) |

**Preuve** : `apps/web/next.config.ts:18-77`.

**Ce qui est bien fait** et qu'il faut conserver : `object-src 'none'`, `base-uri 'self'`,
`form-action 'self'`, `frame-src 'none'`, `connect-src` restreint à Supabase et aux beacons Vercel,
`img-src` sur liste blanche explicite, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()` (cohérent : aucune géolocalisation
navigateur n'existe dans le code, vérifié), HSTS `max-age=31536000; includeSubDomains`. C'est
au-dessus de la moyenne.

**Manques.**

| Manque | Conséquence | Correctif |
|---|---|---|
| `'unsafe-inline'` sur `script-src` | annule l'essentiel de la valeur anti-XSS de la CSP | nonce + `'strict-dynamic'` (JUNO-05) |
| pas de `frame-ancestors` | `X-Frame-Options: DENY` couvre les navigateurs actuels, mais la directive CSP est la seule normative et la seule qui accepte une liste | `frame-ancestors 'none'` |
| pas de `Cross-Origin-Opener-Policy` | une fenêtre ouverte conserve une référence `window.opener` exploitable | `COOP: same-origin` |
| pas de `Cross-Origin-Resource-Policy` | ressources chargeables cross-site | `CORP: same-origin` |
| HSTS sans `preload` | première visite en HTTP vulnérable au SSL-strip | ajouter `preload` puis soumettre le domaine |
| `worker-src` non déclaré | retombe sur `default-src 'self'` — correct, mais implicite alors qu'un service worker est servi | déclarer `worker-src 'self'` |

---

### JUNO-14 — Une limite de débit en mémoire, sur du serverless

| | |
|---|---|
| **Plateforme** | Web / Next.js API route |
| **Sévérité** | **Moyenne** |
| **Confiance** | Haute |
| **Statut** | **Confirmé** |
| **Référentiels** | ASVS V11.1.4 |
| **Priorité / effort** | P2 · ~2 heures |

**Preuve.**

```
apps/web/src/app/api/account/request-deletion/route.ts:6-22
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_MAX = 3;  const RATE_LIMIT_WINDOW_MS = 3600000;
```

Sur Vercel, chaque invocation peut atterrir sur une instance différente et les instances sont
recyclées : la `Map` est locale à un conteneur éphémère. Un attaquant qui répartit ses requêtes
franchit la limite sans effort, et un utilisateur légitime peut être bloqué arbitrairement selon
l'instance qui le sert. La `Map` n'est par ailleurs jamais purgée : elle croît avec le nombre d'IP
distinctes pour la durée de vie du conteneur.

L'entrée est indexée sur `x-forwarded-for` (ligne 12), en-tête que le client contrôle — derrière
Vercel il est réécrit, donc l'usurpation est bloquée en pratique, mais l'hypothèse doit être
explicite.

**Recommandation.** Réutiliser ce qui existe déjà en base plutôt que d'ajouter Redis : le RPC
`check_rate_limit` (`SECURITY DEFINER`, table `rate_limits` en `FOR ALL USING (false)`) est déjà
appelé depuis les edge functions par `service_role`.

```ts
const admin = getSupabaseAdmin();
const { data: allowed } = await admin.rpc('check_rate_limit', {
  p_user_id: callerUser.id,          // borner sur le compte, pas sur une IP réécrivable
  p_action: 'account_deletion_request',
  p_max_count: 3,
  p_window: '1 hour',
});
if (allowed === false) {
  return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
}
```

Appliquer le même mécanisme à `/api/contact` (JUNO-07), en le bornant sur l'adresse destinataire
puisqu'il n'y a pas de compte.

---

### JUNO-15 — L'historique des migrations ne décrit pas la base

| | |
|---|---|
| **Plateforme** | Infrastructure / base de données |
| **Sévérité** | **Moyenne** (méta-constat : il conditionne la confiance de tout le §3) |
| **Confiance** | Haute |
| **Statut** | **Confirmé** — ouvert depuis le 3 sep |
| **Référentiels** | ASVS V14.1.1 ; NIST SSDF PO.3 |
| **Priorité / effort** | P1 · ~1 journée |

**Preuve.** Quatre migrations portent en en-tête, écrit par leurs auteurs :

```
20260903000001:105  -- NOT DEPLOYED BY THIS FILE. Nine migrations are unrecorded in the remote
                    -- history […] Apply this one statement by statement in the SQL editor.
20260903000002:60   -- NOT DEPLOYED BY THIS FILE. […] Paste this into the SQL editor.
```

Et `20260903000003` documente le cas qui prouve la gravité : un `GRANT SELECT` de niveau table sur
`public.profiles`, **créé hors contrôle de version entre le 2 et le 3 septembre**, qui a rendu
inopérants des `REVOKE` de colonne pourtant syntaxiquement corrects, avec un simple `WARNING` et un
commit réussi.

**Impact sur cet audit.** Toutes les affirmations de ce rapport portant sur les privilèges
(JUNO-08 en particulier, et la fermeture du P0 PII du 3 sep) sont dérivées du dépôt. Le dépôt n'est
pas la base. C'est pourquoi JUNO-08 est classé *Probable* et non *Confirmé*, et pourquoi §8 existe.

**Recommandation.**
1. Audit migration par migration contre le schéma réel, puis
   `supabase migration repair --status applied <version>` pour celles qui sont effectivement
   passées. Tant que ce n'est pas fait, `supabase db push` est interdit : il rejouerait le
   déplacement des ascendants, la mise à NULL des lieux de naissance et la mise en file des emails
   de bienvenue.
2. Committer les migrations appliquées à la main (déjà fait pour les quatre du 3 sep, PR #23).
3. Étendre le principe de `20260903000004` : toute migration de sécurité se **vérifie avant de
   committer**, dans la même transaction, et `RAISE EXCEPTION` si le contrôle échoue. C'est ce qui
   a fait la différence entre le v1 et le v2 du correctif PII.

---

### JUNO-16 — Le service worker de la PWA Expo ne cloisonne pas son cache

| | |
|---|---|
| **Plateforme** | PWA (build `apps/mobile` web) |
| **Sévérité** | **Moyenne** si ce build est encore servi, **Information** sinon |
| **Confiance** | Moyenne |
| **Statut** | **À vérifier dynamiquement** |
| **Référentiels** | ASVS V8.1.1 ; W3C Service Workers §Security |
| **Priorité / effort** | P2 · ~2 heures |

**Preuve.** Deux service workers coexistent dans le dépôt, avec des philosophies opposées.

`apps/web/public/service-worker.js` est un **kill-switch** — il supprime tous les caches, se
désenregistre, ne met jamais rien en cache. Excellent, et il ferme proprement l'héritage. Rien à
signaler.

`apps/mobile/public/service-worker.js` (et sa copie construite `apps/mobile/dist/service-worker.js`)
est un vrai cache :

```
apps/mobile/public/service-worker.js:3     CACHE_VERSION = 'v8'  → caches globaux, non préfixés par compte
apps/mobile/public/service-worker.js:66-73 shouldBypass() : /api/, supabase.co, hot-update, __webpack
apps/mobile/public/service-worker.js:88-96 navigations : mises en RUNTIME_CACHE
apps/mobile/public/service-worker.js:140   clients.openWindow(event.notification?.data?.url || '/')
```

Trois remarques, par ordre d'importance :

1. **Aucune purge à la déconnexion et aucun cloisonnement par compte.** Sur un appareil partagé, le
   `RUNTIME_CACHE` du compte A survit à la connexion du compte B. L'exposition réelle est faible
   ici — `shouldBypass` écarte Supabase et `/api/`, et l'application est une SPA dont les
   navigations ne renvoient qu'un shell — mais la propriété n'est garantie par rien : le jour où
   une route rend du HTML personnalisé, le cache le sert à l'utilisateur suivant.
2. **`clients.openWindow(data.url)` sans validation.** L'URL vient du payload push. Elle est
   normalement émise par `send-notification` (correctement autorisée, voir §6), donc l'exploitation
   suppose déjà de contrôler l'émetteur — mais un `push_token` Expo est un **porteur** : quiconque
   le détient peut pousser via l'API publique d'Expo sans s'authentifier. `push_token` était
   précisément l'une des cinq colonnes lisibles jusqu'au 3 septembre.
3. `enableNavigationPreload` absent, pas de `Clear-Site-Data` au logout.

**Recommandation.**

```js
// 1. N'ouvrir qu'une URL de notre origine.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target = '/';
  try {
    const u = new URL(event.notification?.data?.url || '/', self.location.origin);
    if (u.origin === self.location.origin) target = u.pathname + u.search;
  } catch { /* payload malformé — on reste sur '/' */ }
  event.waitUntil(clients.openWindow(target));
});

// 2. Purger le cache runtime à la déconnexion (message envoyé par l'app après signOut).
self.addEventListener('message', (event) => {
  if (event.origin !== self.location.origin) return;      // valider l'origine du postMessage
  if (event.data?.type === 'PURGE_SESSION_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE));
  }
});
```

**À trancher d'abord** : ce service worker est-il encore servi ? `apps/mobile/services/pwa.ts:18`
l'enregistre depuis `/service-worker.js`, et la PWA de production est celle d'`apps/web` — dont le
SW est un kill-switch. Si le build web d'Expo n'est plus déployé, supprimer
`apps/mobile/public/service-worker.js` et `apps/mobile/services/pwa.ts` plutôt que les corriger.

---

### JUNO-17 — Configuration Android : sauvegarde autorisée, pas de règles d'extraction

| | |
|---|---|
| **Plateforme** | Android |
| **Sévérité** | **Moyenne** |
| **Confiance** | Moyenne — le manifeste fusionné de release est produit par EAS, non inspectable ici |
| **Statut** | **Probable** |
| **Référentiels** | MASVS-STORAGE-2, MASTG-TEST-0009 ; Android `dataExtractionRules` |
| **Priorité / effort** | P2 · ~3 heures |

**Preuve.** Le dossier `android/` local est un artefact de `expo prebuild`, non suivi par git et
exclu de l'archive EAS (`.easignore:15`) — les valeurs ci-dessous décrivent donc **ce que le
prebuild produit à partir de `app.json`**, ce qui est exactement ce qui sera reconstruit sur EAS :

```
android/app/src/main/AndroidManifest.xml
  <application android:allowBackup="true"          ← défaut Expo, jamais surchargé
                                                   ← pas de android:dataExtractionRules (API 31+)
                                                   ← pas de android:fullBackupContent
                                                   ← pas de android:networkSecurityConfig
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/>
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
```

`app.json` ne déclare que `CAMERA` et `RECORD_AUDIO` et bloque explicitement
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` (`app.json:47-52`) — la discipline est là. Les trois permissions
ci-dessus sont donc **injectées par les SDK** lors de la fusion (`SYSTEM_ALERT_WINDOW` vient du
mode debug React Native ; les deux `*_EXTERNAL_STORAGE` d'`expo-image-picker` ou d'`expo-file-system`).
C'est le manifeste fusionné qu'il faut auditer, pas `app.json` — MASTG-TEST-0024.

**Analyse d'`allowBackup`.** Avec `expo-secure-store`, la session est chiffrée par une clé du
Keystore, non exportable : une sauvegarde restaurée sur un autre appareil produit des données
indéchiffrables — le jeton ne fuit pas. Ce qui fuit est le reste : préférences, caches,
`AsyncStorage` si utilisé, et le brouillon d'onboarding (`apps/mobile/utils/onboardingDraft.ts`),
qui peut contenir date, heure et ville de naissance avant l'envoi. Sur Android 12+, sans
`dataExtractionRules`, cela couvre aussi le transfert d'appareil à appareil.

**Recommandation.** Un plugin de config, puisque le manifeste est généré :

```js
// apps/mobile/plugins/withAndroidBackupRules.js
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
// 1. app.manifest.$['android:allowBackup'] = 'false'
//    (ou 'true' + $['android:dataExtractionRules'] = '@xml/data_extraction_rules')
// 2. écrire android/app/src/main/res/xml/data_extraction_rules.xml :
//    <data-extraction-rules>
//      <cloud-backup><exclude domain="sharedpref" path="."/></cloud-backup>
//      <device-transfer><exclude domain="sharedpref" path="."/></device-transfer>
//    </data-extraction-rules>
```

Ajouter également un `network_security_config.xml` avec `cleartextTrafficPermitted="false"` : le
défaut d'Android 9+ le fait déjà, mais l'écrire rend la propriété explicite et résistante à un
`targetSdk` qui baisserait. **Ne pas** ajouter de certificate pinning sans modèle de menace ni
procédure de rotation — le coût opérationnel d'un pin expiré (application morte jusqu'à la
prochaine release) dépasse ici le gain.

**FLAG_SECURE** n'est posé sur aucun écran. Défendable : les captures d'écran sont un usage normal
dans une application de rencontre. À reconsidérer uniquement pour `profile/verify.tsx`.

---

### JUNO-18 à JUNO-27 — Constats faibles et informatifs

**JUNO-18 · CI/CD — `Faible` · Confirmé.** `.github/workflows/ci.yml` n'a **aucun bloc
`permissions`** : le `GITHUB_TOKEN` hérite des droits par défaut du dépôt, souvent en écriture. Les
actions sont épinglées par tag mutable (`actions/checkout@v4`, `actions/setup-node@v4`) et non par
SHA. Aucun `npm audit`, aucun scan de secrets, aucun CodeQL, aucun Dependabot. Le pipeline est
pourtant riche — huit validateurs métier — ce qui rend l'absence d'un neuvième sur la sécurité
d'autant plus visible.
*Correctif* : `permissions: { contents: read }` au niveau workflow ; épingler les actions au SHA ;
ajouter `npm audit --omit=dev --audit-level=high` et `gitleaks detect --no-git` ; activer Dependabot.

**JUNO-19 · Deux suppressions de compte divergentes — `Faible` · Confirmé.** Le mobile passe par
`delete-account` : suppression douce, fenêtre de grâce de N jours, email d'annulation, et une
**barrière de ré-authentification récente** (`delete-account/index.ts:102-125`) — c'est le bon
modèle, conforme à ASVS V4.2.1. Le web passe par
`api/account/request-deletion` + `confirm-deletion` (`AccountDeletionFlow.tsx:67,100`) : code à
6 octets envoyé par email, 5 tentatives, comparaison en temps constant — correct — puis
`auth.admin.deleteUser()` **immédiat, définitif, sans délai de grâce et sans exigence
d'authentification récente**. Une session volée suffit, si l'attaquant a aussi accès à la boîte
mail. La promesse « vous pouvez annuler » n'existe pas sur le canal iOS.
*Correctif* : faire converger le web sur `delete-account` (soft delete + grâce + recent-auth), ou
ajouter la barrière de ré-authentification à `confirm-deletion`.

**JUNO-20 · `appaD.zip` versionné dans le routeur — `Faible` · Confirmé.**
`apps/mobile/app/appaD.zip`, 147 750 octets, suivi par git, contenant un instantané complet de
`app/` daté de mars 2026 : `auth/login.tsx`, `auth/reset-password.tsx`, `onboarding/birth-info.tsx`,
les 12 écrans premium. C'est du code **antérieur à tous les durcissements** de ce dépôt. Vérifié :
il ne contient **aucun secret** (recherche des motifs `eyJhbGciOi`, `sk_live`, `whsec_`,
`service_role`, `appl_`, `goog_`, `re_`, `sntrys` → zéro correspondance) et aucune URL Supabase en
dur. Le risque n'est donc pas la fuite mais la résurrection : un fichier de secours dans le
répertoire de routage invite à restaurer une version vulnérable. Il n'est pas exclu par
`.easignore` et voyage donc jusqu'au builder.
*Correctif* : `git rm apps/mobile/app/appaD.zip`. L'historique git est la sauvegarde.

**JUNO-21 · Clé HMAC dérivée de la clé service_role — `Faible` · Confirmé.**
`unsubscribe/index.ts:32-35` et son pendant dans `send-email` :
`UNSUBSCRIBE_TOKEN_SECRET || \`juno-unsubscribe-v1:${SUPABASE_SERVICE_ROLE_KEY}\``. HMAC-SHA256
étant résistant à la préimage, la clé de service ne fuit pas par les jetons — le problème est
opérationnel : **faire tourner la clé de service (ce que JUNO-04 exige) invalide d'un coup tous les
liens de désabonnement déjà envoyés**, ce qui est un manquement de conformité RFC 8058 auprès de
Gmail et Yahoo. Les deux secrets doivent être indépendants.
*Correctif* : `supabase secrets set UNSUBSCRIBE_TOKEN_SECRET=$(openssl rand -base64 32)` **avant**
la rotation de JUNO-04, et supprimer le repli.

**JUNO-22 · Buckets publics — `Faible` · Confirmé.** `avatars` et `voice-intros` sont en
`FOR SELECT USING (bucket_id = '…')` sans condition d'authentification
(`20260419000001:28-30, 70-72`), et les buckets sont créés `public = true`. Les écritures sont, elles,
correctement bornées au dossier `auth.uid()` — c'est bien fait. Conséquences : (a) toute URL
partagée reste vivante indéfiniment, y compris après suppression du compte (JUNO-09) ; (b) les
noms de fichiers sont partiellement prédictibles (`voice_intro_${Date.now()}.ext`,
`voiceIntroService.ts:108`), donc l'énumération n'est pas hors de portée si l'`uuid` est connu — et
il l'est, Discover le renvoie. Un enregistrement vocal est une donnée biométrique au sens large.
*Correctif* : passer `voice-intros` en privé + URL signées à durée courte
(`createSignedUrl(path, 3600)`). Pour `avatars`, c'est une décision produit — la garder publique est
défendable, mais elle doit être écrite dans la politique de confidentialité.

**JUNO-23 · Limiteur client présenté comme anti-brute-force — `Faible` · Confirmé.**
`apps/mobile/utils/rateLimiter.ts:1-4` : *« Prevents brute force attacks on referral codes, promo
codes, and auth »*. Un état en mémoire dans le processus de l'application ne prévient rien : il
suffit d'appeler l'API. Le fichier voisin `utils/rateLimit.ts:1-2` a la bonne formulation
(« Server-side triggers are the real enforcement; this is for UX »). La bonne nouvelle : le serveur
protège réellement ces deux chemins — `claim-promo-code/index.ts:150-157` et
`claim-referral/index.ts:91-101` appellent `check_edge_rate_limit` (10/heure). Le constat est donc
un **commentaire faux**, ce qui compte : il peut convaincre un futur relecteur qu'une protection
existe là où elle n'existe pas.
*Correctif* : corriger le commentaire. Pour l'authentification, la protection réelle est
`[auth.rate_limit]` côté Supabase, à vérifier dans le dashboard (§8).

**JUNO-24 · Pas de Universal Links iOS — `Faible` · Confirmé.** `apps/web/public/.well-known/`
ne contient que `assetlinks.json` (Android App Links, deux empreintes SHA-256, `autoVerify: true` —
correct). **Aucun `apple-app-site-association`**, et `app.json` ne déclare aucun
`associatedDomains`. Sur iOS, les liens retombent donc sur le schéma personnalisé
`astrodating://` (`app.json:8`, `authRedirect.ts:20`), **revendicable par n'importe quelle
application installée** : une application malveillante peut intercepter
`astrodating://auth/reset-password` et capter le lien de réinitialisation. Le flux PKCE limite les
dégâts (le `code_verifier` reste dans l'app légitime), mais l'interception du lien de récupération
reste une nuisance réelle. Portée limitée : iOS passe par la PWA, il n'y a pas d'app iOS publiée.
*Correctif* : si une app iOS est publiée un jour, AASA + `associatedDomains` sont obligatoires
**avant** la première release.

**JUNO-25 · `generate-secret.js` versionné — `Faible` · Confirmé.** Le fichier expose en clair
`TEAM_ID`, `KEY_ID` et `SERVICES_ID` Apple (non secrets — ils voyagent dans l'en-tête du JWT) et le
**chemin** de la clé privée `.p8` (`C:/SAT/cours/tab 10 p/AuthKey.p8` — hors dépôt, correct). Deux
problèmes : le secret client généré vit **180 jours** sans rotation automatisée (Sign in with Apple
casse silencieusement à l'expiration — un incident de disponibilité, pas de sécurité, mais qui
coûtera des inscriptions), et le chemin révèle qu'une clé de signature Apple est stockée dans un
dossier de cours sur un poste personnel.
*Correctif* : déplacer le `.p8` dans un gestionnaire de secrets ; ajouter un rappel calendaire à
J-150 ; ou automatiser la régénération dans le CI.

**JUNO-26 · Pas de `Cache-Control: no-store` — `Information` · Confirmé.** Aucune réponse
authentifiée ne pose l'en-tête. Next.js marque les routes dynamiques `no-store` par défaut et tout
le contenu sensible est rendu côté client à partir d'appels Supabase, donc l'exposition pratique est
faible. Reste que `/api/account/*` renvoie des réponses liées au compte sans directive explicite.
*Correctif* : `headers: { 'Cache-Control': 'no-store, max-age=0' }` sur les quatre routes `api/`.

**JUNO-27 · Identifiants E2E en clair — `Information` · Confirmé.**
`apps/mobile/.maestro/.env` contient six identifiants (trois comptes, email + mot de passe) de
**comptes réels sur le projet Supabase de production** — un seul projet existe. Le fichier est
ignoré par git (`.gitignore:57`) et n'a jamais été committé (vérifié sur tout l'historique) ; son
contenu est même un artefact de here-string PowerShell, ce qui indique une génération manuelle. Le
constat n'est pas la fuite mais le couplage : des comptes de test avec mots de passe faibles
partagent la base des utilisateurs réels.
*Correctif* : rattaché à la question d'environnement du §8 — un projet Supabase de staging.

---

## 6. Contrôles conformes vérifiés

Ces points ont été audités et sont corrects. Ils sont listés parce qu'un audit qui ne dit pas ce
qui tient ne permet pas de savoir ce qu'on casserait en corrigeant le reste.

### Secrets et build

| Contrôle | Preuve |
|---|---|
| Aucun `.env` dans l'historique git | `git log --all --diff-filter=A --name-only` → uniquement des `.example` |
| Tous les `.env` locaux effectivement ignorés | `git check-ignore -v` sur les cinq fichiers présents |
| **Aucun secret serveur dans le bundle mobile livré** | recherche de `service_role`, `sk-ant-`, `AIzaSy`, `sntrys`, `sk_live`, `sk_test` dans `entry-*.hbc` → 0. Seules la clé anon et la clé publique RevenueCat y figurent, ce qui est leur place. |
| `dist/`, `.vercel/`, `android/`, `ios/` non suivis | `git ls-files` |
| Archive EAS assainie | `.easignore` exclut `android/`, `.gradle/`, `BigAd/`, `marketingagent/`, `*.xlsx`, `store-assets/` — avec le raisonnement écrit en en-tête |
| Clé Geoapify côté serveur uniquement | `suggest-birth-cities/index.ts:1-32` — et le raisonnement (« une clé dans un bundle est publique ; sur un palier gratuit c'est un déni de service contre notre propre onboarding ») est exemplaire |
| Aucune journalisation de secret | les logs de push token sont gardés par `__DEV__` |

### Base de données

| Contrôle | Preuve |
|---|---|
| **Aucune fonction `SECURITY DEFINER` sans `search_path`** | analyse de l'état final des 40 fonctions vivantes sur les 110 migrations (créations, `ALTER … SET search_path`, `DROP` rejoués dans l'ordre) → 0 |
| `anon` sans SELECT métier | Phase 1, `supabase/SECURITY.md` |
| Chat cloisonné par conversation, blocages vérifiés dans les deux sens | `20260428000002:149-188` |
| Insertion directe de conversation refusée | `20260428000002:138` — `WITH CHECK (false)` |
| `premium_usage` non réinscriptible par son sujet | `20260823000001:306-317` — policy SELECT seule + `REVOKE INSERT, UPDATE, DELETE` |
| `enforce_premium_feature` sans paramètre `user_id` | `20260823000001:82` — l'identité vient d'`auth.uid()`, non du client |
| `product_events` : RLS sans policy, écriture par RPC à vocabulaire fermé | `20260831000001:78-95` — et l'en-tête énumère ce qui n'est délibérément pas stocké (ni email, ni IP, ni user-agent, ni jeton) |
| `rate_limits`, `deletion_requests` inaccessibles | `full_schema:421,425` — `FOR ALL USING (false)` |
| Écritures storage bornées au dossier `auth.uid()` sur les trois buckets | `20260419000001` |
| Surveillance de la posture PII | `20260903000004` — `check_profiles_pii_posture()` + `pg_cron` quotidien à 03:17 UTC, avec table d'alertes en RLS sans policy |

### Paiements et webhooks

| Contrôle | Preuve |
|---|---|
| Signature Stripe vérifiée avant tout effet de bord | `stripe-webhook/index.ts:37-43` — `constructEventAsync` |
| Idempotence avant effet de bord | `stripe-webhook/index.ts:52-86` et `revenuecat-webhook/index.ts:534+` — `begin_webhook_event`, doublon → 200 pour arrêter les retries |
| HMAC RevenueCat en temps constant | `revenuecat-webhook/index.ts:454-474` — `timingSafeEqual` |
| `priceId` validé contre une liste blanche serveur | `create-checkout-session/index.ts:163-168` |
| URL de retour validées contre les origines autorisées | `create-checkout-session/index.ts:151-162`, `create-portal-session/index.ts:80-88` |
| Identité vérifiée contre le JWT, pas contre le corps | `create-checkout-session/index.ts:171-181` — `user.id !== userId` → 401 |
| Réclamation de coupon promo atomique sous verrou de ligne | `20260419000003` + appel `claim_promo_campaign_redemption` |
| Aucune donnée de carte ne transite ni n'est stockée | Stripe Checkout hébergé + RevenueCat → périmètre **SAQ-A** |

### Authentification et sessions

| Contrôle | Preuve |
|---|---|
| PKCE des deux côtés | `supabase-browser.ts:30`, `apps/mobile/services/supabase.ts:133` |
| Flux implicite **retiré** sur mobile | `socialAuth.ts:96-98` (le web garde un repli — JUNO-10) |
| Session mobile en stockage matériel | `apps/mobile/services/supabase.ts:49-72` — `expo-secure-store`, échecs remontés à Sentry sous le tag `auth-storage`. *La note « session en AsyncStorage non chiffré » de l'audit du 3 sep est obsolète.* |
| **Aucune redirection ouverte** | `auth-redirect.ts:6-33` — `normalizeAuthNext` force un chemin relatif préfixé `/app` ; `//evil.com` retombe sur `/app`. `middleware.ts:18-50` n'assigne que des constantes. Vérifié par lecture intégrale. |
| Ré-authentification récente avant suppression de compte (mobile) | `delete-account/index.ts:102-125` |
| Comparaison de code de suppression en temps constant, expiration avant incrément | `confirm-deletion/route.ts:59-100` |
| Rotation des refresh tokens activée | `config.toml` — `enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10` *(configuration locale ; à confirmer sur le projet hébergé, §8)* |
| `FORCE_PREMIUM` mort en production | `PremiumContext.tsx:64-65` — `__DEV__ &&` court-circuite à la compilation |

### API et fonctions edge

| Contrôle | Preuve |
|---|---|
| `send-notification` : un JWT ne peut cibler que soi-même | `send-notification/index.ts:98-131` — et le commentaire explique pourquoi la vérification est explicite dans les deux branches |
| `send-email` : idem + templates sur liste blanche | `send-email/index.ts:125-153` |
| `send-report-email`, `send-scheduled-emails`, `process-expired-deletions` : secret partagé en temps constant | `process-expired-deletions/index.ts:49-52` |
| `unsubscribe` : HMAC en temps constant, capacité réduite à un booléen | `unsubscribe/index.ts:97-134` |
| Injection d'en-tête mail bloquée | `api/contact/route.ts:16` — `sanitizeHeader` supprime CR/LF |
| Échappement HTML des champs libres dans les emails | `api/contact/route.ts:9-14` |
| `suggest-birth-cities` : corps reconstruit champ par champ, jamais transféré | `suggest-birth-cities/index.ts:78-104` — IP de l'appelant non relayée au fournisseur |
| CORS sans origine réfléchie | toutes les fonctions renvoient `''` pour une origine inconnue, jamais `*` ni l'origine reçue |

### Web / PWA

| Contrôle | Preuve |
|---|---|
| Une seule injection HTML, sur une constante statique | `[locale]/(marketing)/page.tsx:71` — `JSON.stringify(JSON_LD)`, objet littéral figé. Aucun `innerHTML`, `eval`, `new Function` ni `document.write` dans tout le dépôt. |
| Service worker web : kill-switch, ne met rien en cache | `apps/web/public/service-worker.js` |
| Aucune géolocalisation navigateur ni appareil | recherche de `navigator.geolocation`, `expo-location`, `ACCESS_*_LOCATION` → 0 ; cohérent avec `Permissions-Policy: geolocation=()` |
| `robots.txt` interdit l'espace applicatif | `Disallow: /*/app/` |
| Hôtes d'images sur liste blanche | `next.config.ts:9-14` + `profileImages.ts:11-16` (validation côté client également) |

---

## 7. Éléments non applicables, par plateforme

**iOS (natif)** — *Non applicable au canal livré.* Aucun projet Xcode n'est suivi (`/ios` dans
`.gitignore`), et JUNO ships sur iOS **en tant que PWA** (rejet App Store documenté). Sont donc
sans objet : classes d'accessibilité Keychain, Data Protection, exclusions de sauvegarde iCloud,
exceptions ATS (aucune déclarée — vérifié), `WKWebView` et ses message handlers, App Attest /
DeviceCheck, détection de jailbreak, Privacy Manifest et Required Reason APIs. Deux réserves : la
cible widget (`apps/mobile/targets/widget/index.swift`) existe et partage un App Group
(`group.com.astrodating.app`) — elle n'y écrit que le signe solaire
(`widgetService.ts:21`), donnée non sensible, sans accès réseau ; et JUNO-24 s'appliquerait
immédiatement à une future publication iOS.

**WebAuthn / passkeys** — *Non applicable.* Aucune implémentation. `config.toml` laisse
`[auth.mfa.web_authn]` commenté et `[auth.mfa.totp]` en `enroll_enabled = false`. Il n'y a donc ni
challenge à vérifier, ni politique d'attestation, ni compteur de signature à auditer. **MFA
totalement absente** : ce n'est pas un constat en soi pour une application de rencontre grand
public, mais cela doit être un choix conscient, pas un oubli.

**Play Integrity / App Attest** — *Non applicable.* Absents. Recommandation de principe si un jour
ils sont ajoutés : ni l'un ni l'autre n'est une autorisation, seulement un signal de risque ; ils
doivent porter un challenge serveur lié à l'action, être validés côté serveur, résister au rejeu, et
avoir une politique explicite pour les appareils non compatibles.

**Certificate pinning** — *Non applicable.* Absent, et c'est défendable : sans modèle de menace ni
procédure de rotation, un pin expiré tue l'application jusqu'à la release suivante. Aucun
`TrustManager` ni `HostnameVerifier` permissif n'a été trouvé.

**PCI DSS** — *Périmètre SAQ-A.* Aucune donnée de porteur ne transite par le code : Stripe Checkout
est hébergé, RevenueCat intermédie les achats des stores. Les obligations résiduelles sont
l'intégrité de la page qui redirige vers Checkout (couverte par JUNO-13) et la gestion des clés API
Stripe (couverte par JUNO-04).

**Cordova / Capacitor / Flutter / Godot / Android natif Kotlin-Java** — *Non applicable.* Aucun.
Le dossier `android-native/` ne contient que des ressources de raccourcis et de widget consommées
par les plugins Expo, pas un projet natif.

**Files de messages, microservices, IaC** — *Non applicable.* Il n'y a ni broker, ni Terraform, ni
Kubernetes. La planification passe par `pg_cron` et `scheduled_emails`.

---

## 8. Éléments nécessitant une validation dynamique

À exécuter dans l'éditeur SQL Supabase et le dashboard. Aucune de ces requêtes ne modifie quoi que
ce soit.

**A. Privilèges DML sur `messages` — tranche JUNO-08.**

```sql
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'messages'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;
-- Attendu après correctif : SELECT et INSERT pour authenticated, rien d'autre.
-- Aujourd'hui, très probablement : ALL (héritage du GRANT par défaut Supabase).
```

**B. Posture PII toujours fermée — re-vérifie le P0 du 3 septembre.**

```sql
SELECT * FROM public.check_profiles_pii_posture();
-- Attendu : ok = true, column_level_select_grants = 0, table_level_select_grants = 0
SELECT * FROM public.security_posture_alerts WHERE resolved_at IS NULL;
-- Attendu : 0 ligne. Une ligne ici = le GRANT hors dépôt est revenu.
```

**C. Le balayage TRUNCATE tient-il toujours ?**

```sql
SELECT table_name, grantee
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND privilege_type = 'TRUNCATE'
  AND grantee IN ('anon', 'authenticated');
-- Attendu : 0 ligne.
```

**D. Réconciliation des migrations — JUNO-15.**
`supabase migration list --linked` ; comparer avec `supabase/migrations/`. Les neuf migrations
`20260824000001` → `20260902000001` doivent être tranchées une par une, puis
`supabase migration repair --status applied`.

**E. Réglages d'authentification du projet hébergé.** `config.toml` ne décrit que l'environnement
local. À lire dans *Authentication → Providers / Sessions / Rate limits* :
expiration du JWT, rotation des refresh tokens et intervalle de réutilisation, `sign_in_sign_ups`
et `token_verifications`, longueur et complexité minimales du mot de passe, `secure_password_change`,
captcha, et la liste exacte des **redirect URLs autorisées** (celle-ci conditionne l'exploitabilité
de JUNO-10).

**F. `ENVIRONMENT` — JUNO-11.** `supabase secrets list` : la variable est-elle posée, et à
`production` ?

**G. En-têtes réellement servis.** `curl -sI https://app.junosynastry.com/fr/app` — la
configuration `next.config.ts` est la source, mais Vercel peut ajouter ou remplacer. Vérifier CSP,
HSTS, `X-Frame-Options`, `Permissions-Policy`, et l'absence de `Access-Control-Allow-Origin`
permissif.

**H. Service worker en vie chez les utilisateurs — JUNO-16.** DevTools → Application → Service
Workers, sur un appareil ayant visité le site avant le kill-switch. Le SW d'`apps/mobile` est-il
encore enregistré quelque part ?

**I. Injection HTML par le nom d'utilisateur dans les emails.** Créer un compte nommé
`<img src=x onerror=alert(1)>`, déclencher un email lifecycle, lire la source du message reçu.
`templates.ts` n'importe rien et est rendu par le validateur, mais l'échappement des variables
interpolées n'est pas prouvé par lecture statique.

**J. SPF / DKIM / DMARC.** `dig TXT junosynastry.com` et `dig TXT astrodatingapp.com`, plus le
tableau de bord Resend. Directement lié à JUNO-07 : sans DMARC en `quarantine`/`reject`, l'abus du
relais mail coûte plus cher.

**K. Séparation des environnements.** Existe-t-il un second projet Supabase ? Sinon, les comptes
E2E de JUNO-27, les profils de seed (`20260330000001`, `20260330000002`) et les données réelles
cohabitent.

---

## 9. Plan de remédiation

### Immédiat — 0 à 7 jours

| # | Action | Effort |
|---|---|---|
| 1 | **JUNO-01** — retirer les champs `longitude` des réponses de `get-profile-chart`, arrondir les degrés à 0,01°, adapter `synastry-view.ts` / `stored.ts`, étendre `engine-contract.test.ts` | ½ j |
| 2 | **JUNO-03** — supprimer `couponId` du contrat d'entrée ; dériver la remise du `priceId` côté serveur ; nettoyer les deux clients | 1 h |
| 3 | **JUNO-21 puis JUNO-04** — poser un `UNSUBSCRIBE_TOKEN_SECRET` indépendant, **puis** faire tourner la `SUPABASE_SERVICE_ROLE_KEY` ; sortir les clés de `marketingagent/.env` | 2 h |
| 4 | **JUNO-08** — `REVOKE UPDATE, DELETE, TRUNCATE … ON public.messages`, avec le test de non-régression (envoyer un message, ouvrir un fil) | 15 min |
| 5 | **JUNO-11** — inverser le défaut des sept listes blanches ; vérifier `ENVIRONMENT` en production | 30 min |
| 6 | **§8 A→C** — exécuter les trois blocs de vérification et consigner les sorties dans ce document | 30 min |

### Court terme — 8 à 30 jours

| # | Action | Effort |
|---|---|---|
| 7 | **JUNO-02** — `can_use_premium_feature` + contrôle de blocage dans `get-profile-chart` et les RPC synastry | 1 j |
| 8 | **JUNO-09** — purge du stockage avant `deleteUser`, sur les deux chemins ; script de rattrapage des dossiers orphelins | 4 h |
| 9 | **JUNO-05 + JUNO-13** — CSP à nonce + `strict-dynamic`, d'abord en `Report-Only` 48 h ; ajouter `frame-ancestors`, COOP, CORP, `worker-src` | 1 j |
| 10 | **JUNO-07 + JUNO-14** — supprimer l'accusé de réception non authentifié, limite de débit persistée via `check_rate_limit`, Turnstile | 3 h |
| 11 | **JUNO-12** — monter `next`, `next-intl`, `undici` ; `npm audit --omit=dev --audit-level=high` vide sur la pile runtime | ½ j |
| 12 | **JUNO-10** — retirer la branche implicite du callback web | 1 h |
| 13 | **JUNO-18** — `permissions: contents: read`, actions épinglées au SHA, `npm audit` + `gitleaks` + Dependabot dans le CI | 3 h |
| 14 | **JUNO-15** — réconcilier l'historique des migrations, `migration repair` | 1 j |
| 15 | **JUNO-20, JUNO-23, JUNO-26** — supprimer le zip, corriger le commentaire mensonger, poser `no-store` | 1 h |

### Moyen terme — 31 à 90 jours

| # | Action | Effort |
|---|---|---|
| 16 | **JUNO-06** — migrer les neuf fonctionnalités restantes vers l'application serveur, une par une, hors build de publication | 2 j + suivi |
| 17 | **JUNO-05** — session en cookie `__Host-` / `HttpOnly` via `@supabase/ssr`, plus protection CSRF sur les routes mutantes | 3-5 j |
| 18 | **JUNO-17** — plugin de config Android : `dataExtractionRules`, `network_security_config`, audit du manifeste **fusionné** de release | 3 h |
| 19 | **JUNO-16** — trancher le sort du service worker Expo : le supprimer, ou valider l'origine du `postMessage`, restreindre `openWindow` et purger le cache au logout | 2 h |
| 20 | **JUNO-19** — faire converger les deux parcours de suppression sur le modèle soft-delete + grâce + ré-authentification récente | 1 j |
| 21 | **JUNO-22** — `voice-intros` en privé + URL signées ; décision écrite pour `avatars` | 4 h |
| 22 | **§8 K** — projet Supabase de staging ; y déplacer les comptes E2E (JUNO-27) et les profils de seed | 2 j |
| 23 | **Garde-fous** — `validate:rls-contract`, `validate:premium-data-sources`, et un test refusant toute valeur à plus de N décimales dans un champ `longitude` d'une réponse edge | 2 j |

---

## 10. Verdicts par domaine

| Domaine | Verdict | Justification |
|---|---|---|
| **Backend / API** | **Insuffisant** | Le modèle est bon, mais `get-profile-chart` annule le contrôle le plus important de la base (JUNO-01, JUNO-02). Corrigé, ce domaine passe en Correct. |
| **Authentification / sessions** | **Correct avec réserves** | PKCE, ré-authentification avant suppression, aucune redirection ouverte, aucune donnée invalidée en cache. Réserves : branche implicite web (JUNO-10), jetons en `localStorage` (JUNO-05), MFA absente, réglages du projet hébergé non vérifiés. |
| **Transactions** | **Insuffisant** | Webhooks, idempotence et validation de prix exemplaires — et une remise choisie par le client (JUNO-03). Un seul champ non validé annule le reste. |
| **PWA / Web** | **Correct avec réserves** | En-têtes au-dessus de la moyenne, une seule injection HTML sur une constante, aucune redirection ouverte. Réserves : `unsafe-inline`, stockage des jetons, `/api/contact` ouvert. |
| **Service worker** | **À valider** | Celui d'`apps/web` est un kill-switch exemplaire. Celui d'`apps/mobile` est un vrai cache non cloisonné — reste à établir s'il est encore servi (§8 H). |
| **Android** | **Correct avec réserves** | Session en Keystore, permissions minimales déclarées, App Links vérifiés, `usesCleartextTraffic` non positionné. Réserves : `allowBackup`, absence de `dataExtractionRules`, manifeste fusionné non audité, et surtout le gating premium côté client. |
| **iOS** | **Non applicable / hérite du web** | Pas d'application native livrée. Le canal iOS est la PWA, donc il hérite intégralement du verdict PWA — y compris JUNO-05, qui y touche 100 % des utilisateurs. |
| **Localisation / vie privée** | **Insuffisant** | Aucune géolocalisation d'appareil, `product_events` sans PII, minimisation réfléchie dans `suggest-birth-cities`. Mais les coordonnées de naissance sont récupérables par tout compte (JUNO-01) et le droit à l'effacement n'est pas honoré sur les médias (JUNO-09). |
| **Supply chain / CI-CD** | **Correct avec réserves** | Lockfile présent, aucun secret versionné, archive EAS assainie, huit validateurs métier en CI. Réserves : pas de `permissions`, actions non épinglées, aucun scan, trois vulnérabilités runtime. |

---

## 11. Les cinq corrections qui réduisent le plus le risque

1. **Retirer les longitudes brutes de `get-profile-chart`** (JUNO-01, ½ jour). Rétablit d'un coup
   la protection de l'heure et des coordonnées de naissance de tous les comptes, et rend vraie la
   déclaration Play Console. C'est la seule correction qui change la nature de l'exposition plutôt
   que son ampleur.
2. **Supprimer `couponId` du contrat d'entrée** (JUNO-03, 1 heure). Le meilleur rapport
   effort/risque du rapport : une heure contre une perte de revenu non plafonnée et indétectable.
3. **Découpler puis faire tourner la clé service_role** (JUNO-21 puis JUNO-04, 2 heures). Réduit le
   rayon d'explosion d'une compromission de poste, de la base entière à deux tables. L'ordre
   compte : découpler le secret HMAC d'abord, sinon la rotation casse tous les liens de
   désabonnement déjà envoyés.
4. **CSP à nonce, sans `unsafe-inline`** (JUNO-05/13, 1 jour). Coupe la chaîne XSS → vol de jeton
   sur le seul canal iOS, sans attendre le chantier BFF. À déployer en `Report-Only` d'abord.
5. **`REVOKE UPDATE ON public.messages`** (JUNO-08, 15 minutes). Restaure la non-répudiation du fil
   de conversation — ce sur quoi repose la modération et, le cas échéant, une procédure judiciaire.

---

## 12. Risques résiduels après correction

- **La confiance dans l'état de la base reste dérivée du dépôt.** Tant que JUNO-15 n'est pas
  soldé, chaque affirmation sur un privilège est une inférence. L'incident du `GRANT` hors contrôle
  de version des 2-3 septembre montre que la dérive est réelle et silencieuse. Le job `pg_cron` de
  `20260903000004` couvre les neuf colonnes de `profiles` ; il ne couvre ni `messages`, ni
  `conversations`, ni les buckets.
- **L'arrondi de JUNO-01 est un rideau, pas un mur.** À 0,01°, la Lune laisse encore une fenêtre
  d'environ une minute sur l'instant de naissance. La vraie protection est cumulative :
  arrondi **plus** contrôle de tier et de blocage (JUNO-02) **plus** limite de débit stricte. Ne pas
  clore JUNO-01 sans JUNO-02.
- **Le gating premium mobile restera partiellement client tant que les neuf migrations ne sont pas
  faites**, et `PremiumContext.tsx:172-175` continuera de faire primer l'entitlement local sur le
  serveur — un compromis produit assumé qui reste une porte.
- **La PWA garde ses jetons accessibles au JavaScript** jusqu'au passage aux cookies `HttpOnly`. La
  CSP réduit la probabilité d'XSS ; elle ne change pas ce qu'une XSS obtiendrait.
- **Un seul projet Supabase.** Tant que staging et production sont la même base, tout test, tout
  seed et tout script de rattrapage s'exécute sur les données réelles.
- **Aucune MFA.** Une prise de contrôle de boîte mail reste une prise de contrôle de compte, et sur
  le web elle permet en plus une suppression définitive immédiate (JUNO-19).
- **Détection.** Il n'existe aucune alerte sur un pic d'appels à `get-profile-chart`, sur un usage
  anormal de coupon, ni sur un accès `service_role` inhabituel. Le moissonnage décrit en JUNO-01
  passerait aujourd'hui sans laisser autre chose que des lignes dans `rate_limits`.

---

## 13. Artefacts manquants pour compléter l'audit

Ce qui suit n'a pas pu être établi depuis le dépôt et détermine la confiance de plusieurs constats.

| Artefact | Pourquoi il manque / ce qu'il tranche |
|---|---|
| **Contrat OpenAPI** | Aucun. Les 19 fonctions edge et les 12 RPC ont été énumérées par lecture ; un contrat permettrait de prouver l'exhaustivité plutôt que de l'affirmer. |
| **Sortie des blocs de vérification §8 A-C** | Tranche JUNO-08 (Probable → Confirmé/Fermé) et re-prouve la fermeture du P0 PII du 3 sep. |
| **`supabase migration list --linked`** | Tranche JUNO-15 et, avec lui, la fiabilité de tout le §3. |
| **En-têtes HTTP réellement observés en production** | `curl -I` sur `app.junosynastry.com` et `www.junosynastry.com`. Vercel peut compléter ou remplacer `next.config.ts`. |
| **Réglages Authentication du projet hébergé** | Expiration JWT, rotation des refresh tokens, détection de réutilisation, limites de débit, politique de mot de passe, captcha, **liste des redirect URLs** — tout cela est hors dépôt et conditionne JUNO-10. |
| **`supabase secrets list`** | Tranche JUNO-11 (`ENVIRONMENT`) et confirme la présence de `STRIPE_WEBHOOK_SECRET`, `REVENUECAT_WEBHOOK_SECRET`, `EXPIRED_DELETIONS_SECRET`, `GEOAPIFY_API_KEY`. |
| **Manifeste Android fusionné d'un build release** | `aapt2 dump xmltree` sur l'AAB. Seul document qui tranche JUNO-17 et révèle les permissions injectées par les SDK. |
| **Déclaration Data Safety du Play Console** | À confronter à JUNO-01 : si elle indique que la localisation n'est pas partagée entre utilisateurs, elle doit être corrigée ou le constat fermé avant la prochaine soumission. |
| **Configuration Vercel** | Variables d'environnement de production, domaines, règles de cache et d'invalidation, protection DDoS/WAF. |
| **Configuration du runner cloud de `marketingagent`** | Où la clé service_role vit-elle réellement en dehors du poste de dev ? Détermine l'ampleur de JUNO-04. |
| **Politique de conservation et de suppression écrite** | Combien de temps sont gardés `product_events`, `rate_limits`, `webhook_events`, `scheduled_emails`, les objets de storage, les logs Sentry ? Aucune politique n'existe dans le dépôt. |
| **Flux détaillé du prestataire de paiement** | Diagramme Stripe (coupons existants, produits, essais) et RevenueCat (entitlements, offres). Détermine l'ampleur réelle de JUNO-03 : quels coupons existent aujourd'hui dans le compte ? |
| **DNS mail** | `dig TXT` pour SPF/DKIM/DMARC sur les deux domaines expéditeurs. Conditionne l'impact de JUNO-07. |
| **Journal Postgres, fenêtre 2-3 septembre, motif `GRANT`** | Identifierait l'origine du privilège créé hors contrôle de version — la question ouverte la plus importante du §7 de l'audit précédent. |

---

*Audit statique. Aucun fichier applicatif n'a été modifié, aucune requête n'a été émise vers la
production, aucune transaction n'a été déclenchée. La PoC de la §JUNO-01 s'exécute hors ligne sur
une date de naissance fictive et n'a touché aucune donnée réelle.*
