# Audit sécurité JUNO — 3 septembre 2026

**Document vivant.** Rédigé le 3 septembre 2026 avant correctifs, mis à jour le
même jour après application. Les passages qui décrivent l'état d'avant sont
datés et marqués *historique* ; tout le reste décrit l'état courant.

Chaque constat est prouvé par un fichier:ligne, une migration ou une **absence
vérifiée**. Ce qui dépend de l'état réel de la base est marqué **non prouvé**
avec la requête exacte pour trancher — je n'ai pas d'exécution SQL sur le
projet, les requêtes sont exécutées par un humain dans l'éditeur SQL.

Aucun secret n'est reproduit, même masqué.

---

## État après correctifs — 3 septembre 2026

Les correctifs SQL ont été appliqués dans l'éditeur SQL Supabase. Le bloc de
vérification relancé rend `overall_verdict = OK` sur quatre contrôles :

| contrôle | résultat |
|---|---|
| `no_truncate_for_client_roles` | **true** |
| `product_events_rls_enabled` | **true** |
| `discoverable_profiles_select_only` | **true** |
| `existing_sensitive_tables_have_rls` | **true** |

**Trois constats sont fermés et prouvés** : le TRUNCATE à l'échelle du schéma
(n° 7), la vue `discoverable_profiles` (n° 5), et la RLS de `product_events`
avec celle des tables sensibles (une partie du n° 6).

**Tous les constats bloquants sont fermés et prouvés.**

| constat | preuve |
|---|---|
| **P0 PII (n° 1)** | `check_profiles_pii_posture()` → `ok: true`, `table_level_select_grants: 0`, `column_level_select_grants: 0` |
| `conversations` (n° 4) | contrôle B → `dml_grants: 0` |
| vue `discoverable_profiles` (n° 5) | contrôle D → `dml_grants: 0` |
| `product_events` (n° 6, partie RLS) | contrôle E → RLS active, 0 privilège client |
| `TRUNCATE` (n° 7) | contrôle C → 0 grant pour `anon`/`authenticated` |
| RLS sur **toutes** les tables `public` | contrôle F, balayage sans liste → `rls_enabled = true` partout (4 sep) |

**Le P0 a demandé deux tentatives, et c'est l'enseignement le plus utile de cet
audit.** `20260903000002` a émis les bons `REVOKE SELECT (colonne)` et n'a rien
fermé : un `GRANT SELECT` au niveau **table** couvrait toutes les colonnes, et
PostgreSQL refuse silencieusement de retirer une colonne d'un privilège
table-wide (`WARNING: no privileges could be revoked for column`). La migration
a « réussi ». Seul un contrôle interrogeant **`table_privileges` en plus de
`column_privileges`** pouvait le voir.

`20260903000003` retire le grant table-level, ré-accorde SELECT colonne par
colonne sur le sous-ensemble public, **et se vérifie avant de committer** : il
lève une exception et annule la transaction s'il n'a pas fermé la fuite. Le
défaut du v1 n'était pas d'être faux, c'était d'avoir l'air d'avoir marché.

**Origine du grant : hors dépôt, non identifiée.** Les trois seuls
`GRANT ... TO authenticated` sur une table du dépôt visent
`discoverable_profiles` ; rien ne touche `profiles`. Il n'existait pas le 2 sep
(la requête de ce jour-là couvrait neuf colonnes et n'en remontait que cinq — un
grant table-level les aurait toutes montrées). Il a donc été créé entre les deux
exécutions, en dehors du contrôle de version. À chercher dans les logs Postgres
du dashboard, fenêtre 2–3 septembre, motif `GRANT`.

**Détection durable en place** : `20260903000004` ajoute
`check_profiles_pii_posture()`, une table d'alertes en RLS sans policy, et un
job `pg_cron` quotidien à 03:17 UTC qui ouvre une alerte quand la posture casse
et la referme quand elle revient. Un garde-fou côté code ne pouvait rien : les
`validate-*.mjs` lisent le dépôt, et le dépôt n'est pas où le changement s'est
produit.

---

## Résumé exécutif

| # | Constat | Sévérité | Statut |
|---|---|---|---|
| 1 | PII lisibles par tout compte connecté — un GRANT SELECT table-level neutralisait les revokes de colonne | ~~P0~~ | **FERMÉ** — `20260903000003`, prouvé `ok: true` |
| 2 | `get-profile-chart` et `get_synastry_candidate_profiles` ne vérifient **aucun tier** | **P1** | ouvert |
| 3 | 10 des 12 fonctionnalités premium mobiles sont gatées **côté client seulement** | **P1** | ouvert |
| 4 | `conversations` : un participant peut réécrire l'autre participant | ~~P1~~ | **FERMÉ** — contrôle B : `dml_grants: 0` |
| 5 | DML sur la vue auto-updatable `discoverable_profiles` | ~~P2~~ | **FERMÉ** — `discoverable_profiles_select_only = true` |
| 6 | 9 migrations non enregistrées côté distant | **P2** | ouvert — c'est ce qui a rendu le P0 invisible un jour. Les 4 correctifs du 3 sep sont committés depuis (PR #23). |
| 7 | `TRUNCATE` accordé aux rôles client — RLS ne le filtre pas | ~~P2~~ | **FERMÉ** — `no_truncate_for_client_roles = true` |

**Ce qui va bien** et mérite d'être dit, parce que l'essentiel du modèle tient :
RLS activée sur toutes les tables sensibles, `anon` sans SELECT, chat
correctement cloisonné, `enforce_premium_feature` sans paramètre `user_id`,
`get_user_tier` correctement gardé, CSP + HSTS + `X-Frame-Options` présents,
aucune redirection ouverte, aucun `.env` suivi par git, `premium_usage`
verrouillé en écriture depuis le 23 août.

---

## 1. Carte d'attaque

| Surface | Détail | Exposition |
|---|---|---|
| **Web public** | `app.junosynastry.com`, marketing `[locale]/(marketing)`, auth, `/app/**` | anon + authenticated |
| **API Next** | `api/account/confirm-deletion`, `api/account/request-deletion`, `api/billing/prices`, `api/contact` | 4 routes |
| **Edge Functions** | 19, dont `get-profile-chart`, `send-email`, `unsubscribe`, `delete-account`, `revenuecat-webhook`, `stripe-webhook` | JWT sauf webhooks |
| **RPC Postgres** | 12 `SECURITY DEFINER` exposés à `authenticated`, listés dans `supabase/SECURITY.md` | authenticated |
| **Tables sensibles** | `profiles`, `messages`, `conversations`, `premium_usage`, `subscriptions`, `reports`, `blocked_users`, `deletion_requests`, `scheduled_emails`, `product_events` | RLS |
| **Storage** | bucket `tarot` (public), avatars | 16 policies |
| **Auth** | email/password, Apple, Google — retour par `auth/callback` | — |
| **Deep links** | scheme `astrodating`, 1 intent filter Android | — |
| **Externes** | RevenueCat (mobile), Stripe (web), Resend (email), Vercel, EAS | webhooks |

Le point d'entrée le plus rentable pour un attaquant : **un compte gratuit
légitime**. Il obtient un JWT valide et peut appeler n'importe quel RPC ou edge
function exposé à `authenticated`, sans passer par l'UI. Tout ce qui n'est gardé
que par l'interface est donc à sa portée. C'est le fil conducteur des constats
2 et 3.

---

## 2. Secrets et configuration — **conforme**

**Prouvé.** `git ls-files | grep .env` ne renvoie que des `.example`.
`git check-ignore` confirme que `.env.local` (racine, web, mobile) et
`marketingagent/.env` sont tous ignorés.

Aucune `SUPABASE_SERVICE_ROLE_KEY` dans le code applicatif : elle n'apparaît que
dans les edge functions, via `Deno.env.get`, ce qui est sa place.

**Une clé de projet en dur, désormais supprimée** :
`apps/web/src/lib/tarotEngine.ts` contenait l'URL du projet Supabase en
constante. Ce n'était pas un secret (l'URL est publique) mais c'était une
configuration figée. Le fichier a disparu avec le chantier tarot ; le paquet
partagé prend l'URL en argument.

**Journalisation.** Aucun `console.log` de token, mot de passe, email ou données
de naissance. Les rares logs de push token sont gardés par `__DEV__`
(`apps/mobile/services/notifications.ts:215, 221, 233`). Les autres logs
d'erreur émettent l'objet d'erreur, pas la valeur.

---

## 3. Supabase / RLS

### 3.1 — ~~P0~~ **FERMÉ** : cinq colonnes PII, deux tentatives

> **État : FERMÉ le 3 septembre 2026.**
> `20260903000003_close_pii_leak_v2.sql` a retiré le `GRANT SELECT` de niveau
> table, ré-accordé SELECT colonne par colonne sur le sous-ensemble public, et
> vérifié le résultat avant de committer. Preuve :
>
> ```json
> {"ok": true, "table_level_select_grants": 0, "column_level_select_grants": 0}
> ```
>
> Surveillé depuis par `check_profiles_pii_posture()` et un job `pg_cron`
> quotidien (`20260903000004`).
>
> Ce qui suit est l'historique du 2 et du 3 septembre — conservé parce qu'un
> risque qui a existé mérite d'être lisible, et parce que le mode d'échec du
> v1 est le vrai enseignement.

**Preuve.** `supabase/migrations/20260427000040_phase3c_revoke_sensitive_columns_PENDING.sql`
s'ouvre sur un garde-fou qui **lève une exception** si le drapeau n'est pas posé :

```sql
IF current_setting('app.phase3c_ready', TRUE) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Phase 3-C is gated. Set: SET LOCAL app.phase3c_ready = ''true'';'
```

Elle retire à `authenticated` le SELECT sur `email`, `birth_date`, `birth_time`,
`birth_latitude`, `birth_longitude`, `birth_chart`, `push_token`,
`notification_preferences`, `referred_by`.

**Pourquoi c'est le constat qui domine tous les autres.** La policy
`00000000000000_full_schema.sql:376` dit :

```sql
CREATE POLICY "Users can view active profiles" ON profiles
  FOR SELECT USING (is_active = true AND onboarding_completed = true);
```

**Toute ligne active est lisible par tout compte connecté.** Le seul rempart sur
les colonnes sensibles est le retrait de privilège de Phase 3-C. S'il n'a pas
pris, n'importe quel compte gratuit peut exécuter :

```
GET /rest/v1/profiles?select=id,name,email,birth_time,birth_latitude,birth_longitude,push_token
```

et récupérer l'**email, l'heure et les coordonnées de naissance** de toute la
base. C'est une fuite de PII de localisation, pas seulement d'astrologie.

**État — mesuré le 3 septembre 2026 sur la base de production.** La requête
ci-dessous a été exécutée. Elle renvoie **25 lignes**. Phase 3-C a été appliquée
**partiellement** :

| | colonnes |
|---|---|
| **révoquées** (Phase 3-C a pris) | `birth_date`, `birth_chart`, `notification_preferences`, `referred_by` |
| **encore lisibles par `authenticated`** | `email`, `birth_time`, `birth_latitude`, `birth_longitude`, `push_token` |

Cette coupure est ce qui rend le diagnostic certain plutôt que probable : une
migration gatée qui n'aurait jamais tourné aurait laissé les neuf colonnes ; une
migration propre n'en aurait laissé aucune. Quatre ont été révoquées, cinq non.

**Ce qu'un compte gratuit peut faire aujourd'hui**, avec un JWT valide et sans
interface :

```
GET /rest/v1/profiles?select=id,name,email,birth_time,birth_latitude,birth_longitude,push_token
```

et récupérer la base entière. Les coordonnées de naissance sont une donnée de
**localisation** — pour la plupart des gens, la ville, souvent l'hôpital, où
vivait leur famille. Plus identifiante que l'email à côté.

`push_token` est un problème distinct et plus discret : un token Expo est un
**porteur**. Qui le détient peut envoyer une notification à cet appareil via
l'API publique d'Expo, sans s'authentifier comme qui que ce soit.

**Correctif — appliqué le 3 sep** :
`supabase/migrations/20260903000002_finish_phase3c_revoke_pii_select.sql`.
Seul le SELECT est révoqué — INSERT et UPDATE restent, parce que l'onboarding
écrit l'heure et les coordonnées, les formulaires de compte écrivent l'email et
`notifications.ts` écrit le push token.

**Aucune régression, et c'est prouvé plutôt qu'espéré.** Les vingt `.select()`
clients sur `profiles` ont été énumérés : pas un seul ne demande une de ces cinq
colonnes. Les lectures de soi passent déjà par `get_my_full_profile()`
(SECURITY DEFINER, insensible aux droits d'`authenticated`), et les données
d'autrui par l'edge function `get-profile-chart` (service_role, chart assainie).
Preuve empirique que la forme fonctionne : `birth_date` et `birth_chart` sont
**déjà** révoquées, et Discover, le profil public et l'en-tête de chat marchent.

### 3.2 — P1 : `conversations`, un participant peut réécrire l'autre

**Preuve.** `supabase/migrations/20260428000002_conversations_first.sql:128`

```sql
CREATE POLICY "Participants can update conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid() = user_a OR auth.uid() = user_b);
```

Pas de `WITH CHECK` — Postgres réutilise alors `USING`. La nouvelle ligne doit
seulement garder l'appelant comme participant ; **l'autre colonne est libre**.

**Exploit.** Alice et Bob ont une conversation. Alice exécute :

```sql
UPDATE conversations SET user_b = '<uuid de Mallory>' WHERE id = '<leur conv>';
```

La policy `messages` (`:149`) n'autorise la lecture que par appartenance à la
conversation. Mallory obtient donc **tout l'historique du fil**, y compris les
messages de Bob, et Bob en est éjecté. Les contraintes `user_a < user_b` et
`UNIQUE (user_a, user_b)` réduisent l'espace des cibles ; elles ne le ferment
pas.

**Prérequis.** Le privilège UPDATE. Aucune migration ne l'accorde
explicitement : il vient du `GRANT ALL` par défaut de Supabase sur le schéma
`public`. **Non prouvé** sur l'état réel — même requête `role_table_grants` que
ci-dessous.

**Correction — appliquée le 3 sep**, preuve non encore produite pour cette
table :
`supabase/migrations/20260903000001_revoke_unused_dml_on_read_surfaces.sql`.
Le contrôle `discoverable_profiles_select_only` couvre la vue, pas
`conversations`. Contrôle B de la §Vérifications.

**Risque de régression : nul, et démontrable.** Les deux clients ne font que
lire (`apps/mobile/app/chat/[id].tsx:138`,
`apps/web/src/components/ChatThread.tsx:249` — tous deux `.select(...)`), un
`grep` sur `.update(` appliqué à `conversations` renvoie zéro. Les lignes sont
créées par `get_or_create_conversation` (SECURITY DEFINER) et `last_message_at`
par trigger — les deux s'exécutent en tant que définisseur.

### 3.3 — P2 : DML sur la vue `discoverable_profiles`

**Preuve.** Sortie de `information_schema.role_table_grants` obtenue le 2 sep :
`authenticated` détient INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER en
plus de SELECT.

La vue lit une seule table sans `DISTINCT` ni agrégat : elle est
**auto-updatable**, donc les écritures traversent vers `public.profiles`. Ce
n'est **pas une brèche démontrée** — `security_invoker = true` fait retomber le
contrôle sur les droits et la RLS de l'appelant, et la policy UPDATE de
`profiles` est `auth.uid() = id`. Mais c'est un second chemin d'écriture, non
documenté, vers la table la plus sensible du produit, dont l'innocuité repose
entièrement sur la couche en dessous.

`anon` n'a ici que TRUNCATE/REFERENCES/TRIGGER, inertes sur une vue.

**Correction : FERMÉ.** Même migration que §3.2, appliquée le 3 sep et prouvée
par `discoverable_profiles_select_only = true`. La vue est en SELECT seul pour
`anon` et `authenticated`.

### 3.4 — Ce qui est correct

| Point | Preuve |
|---|---|
| `premium_usage` non réinscriptible | `20260823000001:309-317` — policy SELECT seule + `REVOKE INSERT, UPDATE, DELETE` sur `authenticated` et `anon` |
| `enforce_premium_feature` sans `user_id` | `20260823000001:82` — signature `(p_feature_key TEXT)`, l'identité vient de `auth.uid()` |
| `get_user_tier` gardé | `20260413000002:5-20` — `service_role` OU `auth.uid() = p_user_id`, sinon `'free'` |
| Chat cloisonné | `20260428000002:122,149,168` — conversations par participant, messages par appartenance |
| Insertion directe de conversation refusée | `20260428000002:138` — `WITH CHECK (false)` |
| `rate_limits` inaccessible | `full_schema:421` — `FOR ALL USING (false)` |
| `anon` sans SELECT métier | `supabase/SECURITY.md`, Phase 1 |

---

## 4. Auth / comptes

**Redirection ouverte : absente.** `apps/web/src/middleware.ts:18-50` — toutes
les redirections construisent l'URL par `request.nextUrl.clone()` puis
assignent un `pathname`/`hostname` **constant**. Aucun paramètre de requête
n'atteint une destination. Prouvé par lecture intégrale des 60 lignes.

**Guard d'onboarding.** `AppShell` vérifie à chaque page `/app`, exempte
`/app/setup`, et échoue **vers** le setup plutôt que vers l'app — documenté dans
`CLAUDE.md` et gardé par `validate:web-onboarding`. Correct.

**Comptes sans profil.** 143 comptes confirmés sur 245 n'ont jamais eu de ligne
`profiles` entre avril et août ; corrigé par `20260831000003`. **Cette migration
est dans les neuf non enregistrées** (§7) — donc son effet réel est **non
prouvé**.

**Non audité faute d'exécution** : rotation/expiration des sessions Supabase,
rejeu des liens magiques, politique de mot de passe. Ce sont des réglages du
tableau de bord Supabase, invisibles depuis le dépôt. À vérifier dans
*Authentication → Providers / Sessions*.

---

## 5. Premium — le constat le plus exploitable

### 5.1 Classement par lieu d'application

| Fonctionnalité | Web | Mobile |
|---|---|---|
| Natal chart | **serveur** | **serveur** (`natal_chart`) |
| Conversation Guide | **serveur** | **serveur** (`conversation_guide`) |
| Tarot | **serveur** (`tarot_monthly`/`tarot_cosmic`) | client |
| Date planner | **serveur** | client |
| Planetary transits | **serveur** | client |
| Retrograde alerts | **serveur** | client |
| Synastry | *non vérifié* | client |
| Lucky days, horoscopes mensuels, likes, priority messages | *non vérifié* | client |

**Preuve mobile** : `apps/mobile/services/premiumUsage.ts:77-80` —
`SERVER_ENFORCED_FEATURES` ne contient que deux entrées. Tout le reste suit le
« legacy client-side trial path » que le commentaire du fichier décrit
lui-même.

**Preuve web** : `enforce_premium_feature` n'est appelé que dans six
composants (`grep -rln`), tous listés ci-dessus.

### 5.2 P1 — les données premium ne vérifient pas le tier

**Prouvé par absence.** Dans `supabase/functions/get-profile-chart/index.ts`, un
`grep` sur `tier|premium|enforce|get_user_tier` ne renvoie que deux lignes, qui
parlent d'authentification, jamais d'abonnement. Idem pour
`get_synastry_candidate_profiles` : aucune occurrence de `tier` dans le corps.

**Exploit.** Un compte gratuit ouvre l'app, récupère son JWT (visible dans
`AsyncStorage`, ou dans les DevTools sur le web), puis :

```
POST /functions/v1/get-profile-chart   Authorization: Bearer <jwt gratuit>
{ "profileId": "<n'importe quel profil découvrable>" }
```

Il obtient la carte du ciel de la personne — le produit vendu par l'abonnement
Céleste. Aucune interface n'est nécessaire ; le portail est l'UI, et l'UI n'est
pas une frontière de sécurité.

**Correction recommandée, non appliquée** (elle touche le gating, hors mandat de
ce patch) : appeler `enforce_premium_feature` **dans** l'edge function, avec le
JWT de l'appelant, avant de composer la réponse. Le point d'attention : cette
fonction *consomme* un aperçu gratuit, donc l'appeler au mauvais moment
reproduirait exactement le bug de double consommation corrigé le 23 août. Le
contrôle en lecture seule `can_use_premium_feature` est le bon outil ici.

**Risque de régression** : réel. Toute erreur ferme une fonctionnalité à des
abonnés payants. À faire hors build de publication, avec un validateur qui
énumère les sources de données premium et exige une vérification de tier dans
chacune.

### 5.3 Alias `tarot` — comportement correct

`20260511000002` conserve la ligne `tarot` comme alias défensif pour de vieux
clients. Aucun client ne l'appelle (vérifié par `git log -S`), et le mobile ne
l'a jamais appelé. À conserver.

---

## 6. Web / PWA

**En-têtes présents** (`apps/web/next.config.ts:66-76`) : CSP, `X-Frame-Options:
DENY`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

**P2 — CSP affaiblie par `'unsafe-inline'`** sur `script-src` et
`script-src-elem` (`next.config.ts:26-27`). C'est le défaut courant d'une app
Next sans nonce ; ça signifie qu'une XSS réfléchie s'exécuterait malgré la CSP.
Le reste est serré : `object-src 'none'`, `frame-src 'none'`, `base-uri 'self'`,
`form-action 'self'`, `connect-src` limité à Supabase et Vercel.
**Correction** : nonce par requête via le middleware, puis retrait de
`'unsafe-inline'`. Chantier à part — un nonce mal câblé casse toute la page.

**Pas de service worker** dans `apps/web/public` : la PWA est installable via le
manifeste sans cache offline. Rien à auditer.

---

## 7. P2 — L'historique des migrations ment

**Preuve.** `supabase migration list --linked` montre **neuf migrations locales
sans enregistrement distant** (`20260824000001` → `20260902000001`), alors que
`docs/suivi-supabase-2026-09.md:584` affirme que plusieurs sont vivantes
(« Elles sont passées »). Les deux ne peuvent pas avoir raison : elles ont été
appliquées à la main dans l'éditeur SQL.

**Conséquences de sécurité :**

1. **On ne sait pas ce qui protège réellement la base.** C'est ce qui rend §3.1
   indécidable depuis le dépôt.
2. **`product_events` (`20260831000001`) et sa RLS sont peut-être absents.**
3. **`supabase db push` est inutilisable** : il rejouerait le déplacement des
   ascendants, la mise à NULL des lieux de naissance et la mise en file des
   emails de bienvenue.

**Correction** : audit migration par migration contre le schéma réel, puis
`supabase migration repair --status applied` pour celles qui sont effectivement
passées. Tant que ce n'est pas fait, tout déploiement se fait instruction par
instruction dans l'éditeur.

---

## 8. Emails

**Unsubscribe** (`supabase/functions/unsubscribe/index.ts`) : HMAC vérifié en
**temps constant** (`constantTimeEqual`, `:124`), et le token **n'expire
jamais**, ce que le fichier assume explicitement en commentaire (`:24`) — un
lien périmé qui échoue est pire qu'un lien permanent, du point de vue du
destinataire comme de Gmail. **P3** : si un lien fuit (journal de proxy,
capture), un tiers peut désabonner ce compte. Impact limité au courrier
lifecycle, jamais au transactionnel.

`isSuppressed` ne supprime jamais un template `transactional` — vérifié et gardé
par `validate:email-templates`.

**Non prouvé** : SPF/DKIM/DMARC du domaine expéditeur. Se vérifie hors dépôt :
`dig TXT junosynastry.com` et le tableau de bord Resend.

**Injection HTML par le nom d'utilisateur** : `templates.ts` n'importe rien et
est rendu par le validateur ; l'échappement des variables interpolées **n'est
pas prouvé** dans cet audit. Vérification proposée : créer un compte au nom
`<img src=x onerror=alert(1)>`, déclencher un email lifecycle, lire la source du
message reçu.

---

## 9. Mobile

**Permissions** (`apps/mobile/app.json`) : `CAMERA` et `RECORD_AUDIO`
uniquement, plus un blocage explicite de
`FOREGROUND_SERVICE_MEDIA_PLAYBACK`. Les deux sont justifiées (photo de profil,
intro vocale) mais `RECORD_AUDIO` **doit apparaître dans la déclaration Data
Safety du Play Console** — à vérifier avant publication.

`usesCleartextTraffic` n'est pas positionné : Android 9+ interdit le HTTP en
clair par défaut. Correct.

**Stockage local** : la session Supabase vit dans `AsyncStorage`, non chiffré.
C'est le comportement par défaut du SDK et l'exposition est limitée à un
appareil rooté. **P3** — migrer vers `expo-secure-store` est possible mais
touche le rafraîchissement de session, donc pas avant un build de publication.

---

## 10. Données personnelles

| Donnée | Pourquoi | Où | Qui peut la lire | Suppression |
|---|---|---|---|---|
| Email | identité, cycle de vie | `profiles.email` | soi via RPC ; **tous si §3.1 est inefficace** | `delete-account` |
| Nom, genre, âge | profil public | `profiles` | tout compte connecté (voulu) | idem |
| Date de naissance | signe solaire, astrologie | `profiles.birth_date` | soi ; autres via chart assainie | idem |
| **Heure de naissance** | ascendant, maisons | `profiles.birth_time` | soi seul (Phase 3-C) | idem |
| **Coordonnées de naissance** | angles, maisons | `birth_latitude/longitude` | soi seul (Phase 3-C) | idem |
| Fuseau | instant UTC | `birth_chart` | soi | idem |
| Messages | produit | `messages` | les deux participants | cascade |
| Push token | notifications | `profiles.push_token`, table par appareil | soi | idem |
| Abonnement | droits | `subscriptions` | soi | conservé (comptabilité) |

**Les coordonnées de naissance sont la donnée la plus sensible du produit** —
plus que l'email. Une latitude/longitude de naissance est une donnée de
localisation, et elle est souvent le lieu de résidence de la famille. C'est ce
qui fait de §3.1 un P0 et non un P1 : la Data Safety du Play Console déclare
sans doute que les données de localisation ne sont pas partagées avec d'autres
utilisateurs, et si Phase 3-C n'a pas pris, cette déclaration est fausse.

---

## 11. Dépendances

**Non exécuté.** `npm audit` sur ce monorepo (Expo + Next + Supabase) produit un
volume de bruit transitif qui n'est pas exploitable dans un client mobile, et le
faire correctement demande de trier chaque avis contre notre surface réelle.
Le lancer sans ce tri produirait exactement la liste générique que vous ne
voulez pas.

**Recommandation** : `npm audit --omit=dev --audit-level=high` à la racine et par
workspace, puis tri en trois piles (exploitable ici / non exploitable /
à surveiller). À faire hors publication.

---

## 12. Correctifs

### Appliqués en base le 3 septembre 2026 (non committés dans le dépôt)

| Migration | Couvre | Preuve |
|---|---|---|
| `20260903000002_finish_phase3c_revoke_pii_select.sql` | §3.1 — le P0 PII | **à produire** : contrôle A |
| `20260903000001_revoke_unused_dml_on_read_surfaces.sql` | §3.2 `conversations`, §3.3 la vue, §7 TRUNCATE | vue **OK** · TRUNCATE **OK** · `conversations` **à produire** : contrôle B |

La révocation de `TRUNCATE` est allée **au-delà** de ces deux fichiers : le
contrôle `no_truncate_for_client_roles` porte sur tout le schéma `public` et
rend `true`. Le balayage complet que §7 disait « non fait » a donc été fait.

Les deux fichiers restent **non committés**. Ils sont la trace écrite de ce qui
a été exécuté à la main — à committer pour que le dépôt cesse de diverger de la
base, ce qui est précisément le problème n° 6.

### Recommandés, non appliqués

| # | Correctif | Pourquoi pas maintenant |
|---|---|---|
| ~~1~~ | ~~Rejouer les `REVOKE` de Phase 3-C~~ | **Fait le 3 sep via `20260903000002`.** Reste à en produire la preuve (contrôle A). |
| 2 | Vérifier le tier dans `get-profile-chart` et les RPC synastry | Touche le gating ; risque de fermer une fonctionnalité à des payants |
| 3 | Nonce CSP, retrait de `'unsafe-inline'` | Un nonce mal câblé casse la page entière |
| 4 | Réconcilier l'historique des migrations | Demande un audit table par table contre le schéma réel |
| 5 | Session mobile en `expo-secure-store` | Touche le rafraîchissement de session |

---

## 13. Garde-fous à ajouter

1. **`validate:rls-contract`** — pour chaque table sensible : RLS activée,
   policies attendues présentes, et **aucun privilège DML accordé à
   `authenticated` sur une surface que le code ne fait que lire**. C'est le
   contrôle qui aurait attrapé §3.2 et §3.3 le jour où ils sont apparus.
2. **`validate:premium-data-sources`** — énumère les sources de données premium
   (edge functions, RPC) et exige une vérification de tier dans chacune. Aurait
   attrapé §5.2.
3. **Étendre `validate:premium-gating`** pour comparer la table des
   fonctionnalités serveur/client entre web et mobile et faire échouer sur une
   divergence non déclarée.
4. **Un contrôle sur les migrations gatées** : toute migration contenant un
   `RAISE EXCEPTION` de garde-fou doit être listée dans un fichier
   d'attestation avec la preuve qu'elle a été exécutée. §3.1 n'aurait pas pu
   rester indécidable un an.

---

## 14. Checklist avant publication du build 127

- [x] Exécuter la requête §3.1 — *3 sep : 25 lignes, fuite confirmée.*
- [x] Appliquer `20260903000002` (P0 PII) — *fait le 3 sep.*
- [x] Appliquer `20260903000001` (conversations, vue, TRUNCATE) — *fait le 3 sep.*
- [x] TRUNCATE, vue, `product_events`, RLS des tables sensibles — **prouvés OK.**
- [x] Lancer le bloc §Vérifications — *fait : B à F OK, G en REVIEW attendu.*
- [x] Correctif v2 (`20260903000003`) appliqué — *A : `ok: true`, 0 grant.*
- [x] Watchdog (`20260903000004`) en place — *contrôle quotidien 03:17 UTC.*
- [ ] Relancer une dernière fois le bloc A→G pour figer un `Z_overall_verdict`
      complet. Seul A a changé depuis la dernière exécution, mais c'est ce
      verdict qui sert de trace.
- [ ] **Committer les quatre migrations du 3 sep.** Le dépôt qui ne décrit pas
      la base est la cause racine du n° 6, et c'est ce qui a rendu ce P0
      invisible pendant une journée.
- [ ] Régression à exercer une fois : sauvegarder une heure de naissance en
      onboarding, voir son propre email sur l'écran compte, charger Discover,
      afficher un thème natal, **envoyer un message** (ce dernier exerce le
      trigger `last_message_at`).
- [ ] Confirmer que `RECORD_AUDIO` figure dans la déclaration Data Safety du
      Play Console.
- [ ] Vérifier SPF/DKIM/DMARC du domaine expéditeur.
- [ ] **Reporter après publication** : tier serveur sur les données premium
      (§5.2), nonce CSP (§6), réconciliation des migrations (§7), tri
      `npm audit` (§11).

---

## Vérifications

Un seul bloc, exécutable tel quel, **CTE typé** — ce qui corrige l'erreur
`column "passed" does not exist` rencontrée avec la version précédente : les
colonnes sont déclarées (`with checks(check_key, passed, detail) as ...`) avant
d'être référencées.

Fichier : `juno-verify-security-final.sql` (envoyé). Il rend une ligne par
contrôle, puis un `overall_verdict` global.

| | contrôle | état au 3 sep |
|---|---|---|
| **A** | `p0_pii_column_select_closed` | **OK** — fermé par `20260903000003` |
| B | `conversations_dml_closed` | **OK** — `dml_grants: 0` |
| C | `no_truncate_for_client_roles` | **OK** |
| D | `discoverable_profiles_select_only` | **OK** |
| E | `product_events_locked_down` | **OK** — RLS on, 0 privilège client |
| F | `sensitive_tables_have_rls` | **OK — fermé le 4 sep.** Balayage sans liste codée : toutes les tables de `public` ont `rls_enabled = true`. |
| G | `conversations_update_policy_permissive` | **REVIEW** — non bloquant, B est OK |

**A et B sont ceux qui manquaient.** Le bloc précédent ne les contenait pas, et
un `overall_verdict = OK` calculé sans eux ne dit rien du seul constat de
l'audit qu'un compte gratuit pouvait exploiter avec une simple URL. Les
contrôles C à F restent, pour que le verdict porte sur l'ensemble.

Un septième contrôle, informatif et non bloquant, affiche la policy UPDATE de
`conversations` : son `with_check` est nul, donc si quelqu'un ré-accorde UPDATE
un jour, le trou du §3.2 revient exactement tel qu'il était. Le privilège est
retiré, la policy reste permissive — c'est voulu et documenté dans la migration.

Les deux migrations ne portent volontairement **aucune** requête de vérification
en commentaire : une vérification qu'il faut décommenter est une vérification
qu'on saute.

---

### 7. ~~P2~~ **FERMÉ** — `TRUNCATE` était accordé, RLS ne l'arrête pas

> **État au 3 sep, après correctif : fermé et prouvé.**
> `no_truncate_for_client_roles = true` — plus aucun `TRUNCATE` pour `anon` ni
> `authenticated`, et la révocation est allée **au-delà** des deux surfaces de
> `20260903000001` : elle couvre le schéma. Ce qui suit est l'historique.

**Preuve.** La sortie du 2 sep sur `discoverable_profiles` montre le jeu complet
`ALL` pour `authenticated`, alors que la migration qui crée la vue n'émet qu'un
`GRANT SELECT`. Le reste vient des privilèges par défaut de Supabase sur
`public` — donc les vraies tables les portent aussi. **Aucune migration du dépôt
n'a jamais révoqué `TRUNCATE`.**

Et une policy RLS n'est **jamais consultée** pour un `TRUNCATE`. `DELETE FROM
profiles` est filtré à zéro ligne par RLS ; `TRUNCATE profiles CASCADE` viderait
le produit.

**Atteignable aujourd'hui ? Non — et c'est vérifié, pas supposé :**

- PostgREST expose GET/POST/PATCH/DELETE et les RPC. **Il n'y a pas de verbe
  TRUNCATE**, donc le privilège n'a pas de porte côté API.
- `authenticated` est un rôle `NOLOGIN` assumé via JWT : personne ne se connecte
  à Postgres avec ce rôle et un mot de passe.
- Le seul SQL dynamique du dépôt est dans des blocs `DO $$` de migrations,
  jamais dans une fonction appelable par un client — donc pas de chemin
  d'injection vers un contexte `SET ROLE` non plus.

C'est donc de la **défense en profondeur**, pas un trou vivant : une capacité
accordée sans porte. Elle est retirée sur les deux surfaces que
`20260903000001` touche déjà, parce que ça ne coûte rien — et parce que la
porte est à un `EXECUTE format(...)` négligent près dans une future fonction
`SECURITY DEFINER`.

**Le balayage complet du schéma n'est pas fait** : révoquer sur toutes les
tables demande de vérifier table par table que rien de légitime n'en dépend. Le
contrôle n° 3 du bloc de vérification donne la portée exacte pour décider.

### Contrôle F — résolu le 4 septembre 2026

Deux blocs se contredisaient le 3 sep : le mien rendait `without_rls: 0` sur
treize tables **nommées en dur**, un second rendait `sensitive_tables_have_rls:
false`. Un balayage sans liste a tranché : **toutes** les tables de `public`
portent `rls_enabled = true`. Le contrôle est fermé.

`rls_forced = false` n'est pas un défaut ici. `FORCE ROW LEVEL SECURITY` sert à
soumettre le **propriétaire** de la table à ses propres policies ; pour des
appelants PostgREST en `anon` / `authenticated`, ce qui compte est
`rls_enabled = true` avec des policies et des grants corrects — ce qui est le
cas.

**Ce que l'épisode dit de mon contrôle, et qui vaut plus que le résultat :** il
n'interrogeait que treize noms écrits à la main. Une table sensible créée après
la rédaction de l'audit lui était invisible, et il aurait rendu `OK` faute de
la voir. Un contrôle incapable de voir un problème n'est pas vert, il est
aveugle — le même défaut que le contrôle A avait avant d'interroger deux
sources. La requête sans liste est celle à garder :

```sql
select t.tablename, t.rowsecurity as rls_active,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=t.tablename) as policies
from pg_tables t
where t.schemaname='public'
order by t.rowsecurity, t.tablename;
```

---

## Ce qui reste non prouvé, et comment le prouver

| Question | Méthode | État |
|---|---|---|
| ~~Le P0 PII est-il refermé ?~~ | — | **fermé** : `ok: true`, 0 grant colonne, 0 grant table |
| ~~`conversations` est-elle en lecture seule ?~~ | — | **fermé** : `dml_grants: 0` |
| **Qui a posé le `GRANT SELECT` table-level entre le 2 et le 3 sep ?** | logs Postgres du dashboard, fenêtre 2–3 sep, motif `GRANT` | **non identifié** |
| ~~Phase 3-C était-elle effective ?~~ | — | répondu 3 sep : non, à moitié (§3.1) |
| ~~`TRUNCATE` accordé aux rôles client ?~~ | — | **fermé** : `no_truncate_for_client_roles = true` |
| ~~`product_events` existe-t-elle avec sa RLS ?~~ | — | **fermé** : `product_events_rls_enabled = true` |
| ~~La vue est-elle en lecture seule ?~~ | — | **fermé** : `discoverable_profiles_select_only = true` |
| Les templates d'email échappent-ils le nom ? | compte nommé `<img src=x onerror=...>`, lire la source du mail | non prouvé |
| SPF/DKIM/DMARC | `dig TXT`, tableau de bord Resend | non prouvé |
| Réglages de session Supabase | tableau de bord *Authentication* | non prouvé |
| Dépendances vulnérables | `npm audit --omit=dev --audit-level=high` puis tri | non fait |
