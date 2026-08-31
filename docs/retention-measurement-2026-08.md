# Mesurer le funnel JUNO — état, patch, requêtes

**Date :** 31 août 2026.
**Question posée :** avec 9 utilisateurs éligibles Day 1, 8/9 onboardés,
10 emails envoyés et `taux_j1 = 0`, où fuit-on ?

**Réponse courte :** on ne le sait pas encore, et c'est le vrai problème.
Deux des sept étapes du funnel n'étaient pas mesurées, et l'échantillon est
trop petit pour conclure quoi que ce soit. Ce document décrit ce qui a été
réparé et les requêtes qui rendront la réponse lisible dans quelques jours.

---

## 1. Le funnel, étape par étape

```
signup → onboarding_completed → email_sent → email_clicked → app_open
       → value_seen → returned_day1
```

| Étape | Mesurable avant ce patch | Source |
|---|---|---|
| `signup` | ✅ | `auth.users.created_at` |
| `onboarding_completed` | ✅ | `profiles.onboarding_completed` |
| `email_sent` | ✅ | `scheduled_emails.status = 'sent'` |
| **`email_clicked`** | ❌ **rien, nulle part** | — |
| `app_open` | ⚠️ mobile seulement | `profiles.last_active` |
| `value_seen` | ⚠️ partiel | `premium_usage` (surfaces gatées uniquement) |
| `returned_day1` | ⚠️ dérivé de `last_active` | — |

## 2. Les deux défauts qui rendaient le chiffre illisible

### 2.1 `email_clicked` n'existait pas

Les CTA portent `?template=…&utm_source=lifecycle_email&utm_medium=email&utm_campaign=…`
depuis le début (`send-email/templates.ts`, fonction `appLink`), et le
middleware les préserve à travers la redirection `/app` → `/{locale}/app`
(`apps/web/src/middleware.ts` : `request.nextUrl.clone()` conserve la query).

**Personne ne les lisait.** Vérifié : aucune table `product_events` /
`email_events` / `analytics_events` dans les migrations, et aucun composant web
ne lit `template` ni `utm_source`.

Conséquence directe : avec 10 emails envoyés et 0 retour, **« personne n'a
cliqué » et « tout le monde a cliqué puis rebondi » produisaient exactement la
même ligne de données.** Or ces deux diagnostics appellent des correctifs
opposés — réécrire les objets d'email, ou réparer la page d'atterrissage.

### 2.2 `last_active` n'a jamais été écrit côté web

| Écrivain | Arrivé dans | En production ? |
|---|---|---|
| `apps/mobile/services/activity.ts` | `cc927ac`, **build 119** | oui, si 119+ est promu |
| `apps/web/src/lib/web-activity.ts` | `2810075`, mergé le **30 août** | **non — en attente du déploiement Vercel** |

`profiles.last_active` a `DEFAULT NOW()`, donc `last_active = created_at`
signifie « jamais mis à jour depuis la création ». Pour tout utilisateur arrivé
par la PWA — c'est-à-dire tout iOS, puisque JUNO n'y existe que par le web —
**il n'existait aucun code capable de mettre ce champ à jour.**

> **`taux_j1 = 0` est donc, pour une part inconnue, un artefact de mesure et
> non un fait comportemental.** Il faut ré-évaluer après le déploiement, pas
> avant.

### 2.3 Et l'échantillon ne permet pas de conclure

9 utilisateurs. Si la rétention J+1 réelle était de 20 % — un chiffre sain pour
une app de rencontre — la probabilité d'observer **0 retour sur 9** est
`0.8⁹ ≈ 13 %`. Un tirage sur huit.

`taux_j1 = 0` sur n=9 est parfaitement compatible avec une rétention correcte.
Optimiser sur ce chiffre reviendrait à optimiser sur du bruit. Il faut d'abord
la mesure, ensuite le volume, ensuite seulement les conclusions.

## 3. Le patch

### 3.1 `product_events` (migration `20260831000001`)

Une table, un RPC, aucune dépendance tierce.

- **Aucune PII** : ni email, ni token, ni IP, ni user agent, ni referrer.
- **RLS activée, zéro policy** → lecture et écriture directes refusées pour
  `anon` comme pour `authenticated`. Les écritures passent uniquement par
  `record_product_event` (`SECURITY DEFINER`), comme `premium_usage` depuis
  `20260823000001`.
- **Vocabulaire fermé** : le RPC ignore silencieusement tout `event_name` ou
  `template` hors liste blanche. Une faute de frappe dans un build client ne
  peut pas créer un flux d'événements parallèle que personne n'interroge.
- **Le chemin est nettoyé de sa query string** côté RPC *et* côté client. Le
  lien de désinscription porte un HMAC signé ; il ne doit jamais atterrir dans
  une ligne d'analytics.

**`anon` a le droit d'exécuter le RPC, volontairement.** Restreindre à
`authenticated` rendrait un clic qui rebondit sur le mur de connexion
indistinguable d'un clic qui n'a jamais eu lieu — précisément l'ambiguïté que
cette table existe pour lever. La liste blanche borne ce qu'un appelant abusif
peut écrire à quelques valeurs d'énumération sans données personnelles. Si le
volume devient un problème, la mitigation tient en une ligne :

```sql
REVOKE EXECUTE ON FUNCTION public.record_product_event FROM anon;
```

### 3.1 bis — Attribution tardive (migration `20260831000002`)

**Trouvé en vérifiant le patch en production, pas en le concevant.** Le premier
clic de test a produit une ligne correcte à un détail près : `user_id` était
NULL alors que le compte existait.

Le scénario est le suivant, et c'est **le chemin dominant** :

```
ouverture depuis la boîte mail → le navigateur n'a pas de session
                               → ligne écrite, user_id NULL
                               → le lecteur se connecte
                               → l'identité arrive, et rien ne l'enregistre
```

Autrement dit, `user_id` serait resté NULL pour la majorité des vrais clics, et
**toutes les requêtes qui joignent les clics aux profils** — cliqué → actif,
cliqué → a vu son thème, cliqué → revenu à J+1 — **seraient revenues vides**.
Le funnel aurait eu l'air mesuré tout en restant aveugle précisément à la
jointure qui compte.

Correctif : le client frappe un `client_event_id` par (template, session de
navigateur). Le premier appel insère ; un second, déclenché par
`onAuthStateChange` quand la session apparaît, retombe sur le même id et
**met la ligne à jour au lieu d'en créer une seconde**.

Une ligne par clic, dont le `user_id` se remplit si et quand l'identité arrive.
Le `COALESCE` de l'`ON CONFLICT` ne fait que **combler un trou** : il ne
réattribue jamais un clic déjà rattaché à un compte. Et `created_at` reste
l'instant du **clic**, pas de la connexion — c'est ce que compare la requête
« cliqué → actif ».

> L'idempotence a été déplacée de `sessionStorage` vers la base. Un booléen
> côté client bloquait la seule tentative qui pouvait sauver l'attribution.

### 3.2 `EmailLandingTracker`

Monté globalement dans `app/[locale]/layout.tsx`, à côté de
`PreferredLanguageSync` et `WebActivityTracker`. Il enregistre `email_clicked`
dès qu'une page se charge avec un `?template=` reconnu, une fois par template
et par session de navigateur.

Global et non sur `/app` seul : les CTA visent déjà `/app`, `/app/plans` et
`/app/premium/celestial/natal-chart`, et tout futur CTA sera couvert sans avoir
à y penser.

### 3.3 Le CTA du Day 1 pointe enfin vers ce qu'il promet

```diff
- label: "Read my full chart",  url: appLink("/app", "onboarding_day1")
+ label: "Read my full chart",  url: appLink("/app/premium/celestial/natal-chart", "onboarding_day1")
```

Le lecteur cliquait « Read my full chart » et atterrissait sur `/app` — une
grille de cinq cartes de navigation. Il devait trouver son thème lui-même, un
jour après son inscription, sans savoir où il se trouvait.

`natal_chart` est **la seule surface web dotée d'un véritable aperçu gratuit
quotidien** (`premium_feature_policy.free_preview_quota = 1`), donc un compte
gratuit qui clique obtient le thème promis et non un paywall. Le chemin reste
sous le préfixe `/app`, requis par le filtre d'intent Android.

## 4. Les requêtes

### 4.1 Funnel signup → onboarding

```sql
SELECT
  date_trunc('day', u.created_at)::date                                  AS jour,
  COUNT(*)                                                               AS inscriptions,
  COUNT(*) FILTER (WHERE p.onboarding_completed)                         AS onboardes,
  ROUND(100.0 * COUNT(*) FILTER (WHERE p.onboarding_completed)
        / NULLIF(COUNT(*), 0), 1)                                        AS taux_pct
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
GROUP BY 1
ORDER BY 1 DESC;
```

### 4.2 Email envoyé → cliqué, par template

```sql
WITH sent AS (
  SELECT template, COUNT(*) AS envoyes
    FROM public.scheduled_emails
   WHERE status = 'sent'
   GROUP BY template
),
clicked AS (
  SELECT template,
         COUNT(*)                  AS clics,
         COUNT(DISTINCT user_id)   AS lecteurs_identifies,
         COUNT(*) FILTER (WHERE user_id IS NULL) AS clics_anonymes
    FROM public.product_events
   WHERE event_name = 'email_clicked'
   GROUP BY template
)
SELECT
  s.template,
  s.envoyes,
  COALESCE(c.clics, 0)                AS clics,
  COALESCE(c.lecteurs_identifies, 0)  AS lecteurs_identifies,
  COALESCE(c.clics_anonymes, 0)       AS clics_anonymes,
  ROUND(100.0 * COALESCE(c.clics, 0) / NULLIF(s.envoyes, 0), 1) AS taux_clic_pct
FROM sent s
LEFT JOIN clicked c ON c.template = s.template
ORDER BY s.template;
```

> `clics_anonymes` est le chiffre à surveiller, et depuis l'attribution tardive
> (§3.1 bis) il a un sens **fort** : une ligne restée anonyme signifie que le
> lecteur a cliqué et **ne s'est jamais connecté**, pas simplement qu'il est
> arrivé déconnecté. Un taux élevé est donc un correctif de tunnel
> d'authentification, jamais un correctif de contenu d'email.

### 4.3 Cliqué → actif

```sql
SELECT
  e.template,
  COUNT(DISTINCT e.user_id)                                       AS ont_clique,
  COUNT(DISTINCT e.user_id) FILTER (
    WHERE p.last_active > e.created_at + INTERVAL '1 minute'
  )                                                               AS actifs_apres_clic,
  ROUND(100.0 * COUNT(DISTINCT e.user_id) FILTER (
          WHERE p.last_active > e.created_at + INTERVAL '1 minute')
        / NULLIF(COUNT(DISTINCT e.user_id), 0), 1)                AS taux_pct
FROM public.product_events e
JOIN public.profiles p ON p.id = e.user_id
WHERE e.event_name = 'email_clicked'
  AND e.user_id IS NOT NULL
GROUP BY e.template
ORDER BY e.template;
```

### 4.4 Rétention Day 1

```sql
-- Exclut les comptes de moins de 24 h : ils n'ont pas encore EU l'occasion de
-- revenir, et les inclure fait mécaniquement chuter le taux.
SELECT
  date_trunc('day', u.created_at)::date                            AS cohorte,
  COUNT(*)                                                         AS eligibles,
  COUNT(*) FILTER (
    WHERE p.last_active > u.created_at + INTERVAL '24 hours'
  )                                                                AS revenus_j1,
  ROUND(100.0 * COUNT(*) FILTER (
          WHERE p.last_active > u.created_at + INTERVAL '24 hours')
        / NULLIF(COUNT(*), 0), 1)                                  AS taux_j1_pct
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.created_at < NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 1 DESC;
```

> ⚠️ **Ne pas lire cette requête sur des données antérieures au déploiement web
> de `WebActivityTracker`.** Avant lui, `last_active` ne pouvait pas bouger
> pour un utilisateur PWA, donc `taux_j1_pct` y vaut structurellement 0.
> Retenir la date du déploiement et ne comparer qu'à partir de là.

### 4.5 Usage des hooks gratuits

```sql
-- Les surfaces gatées côté serveur écrivent dans premium_usage, ce qui donne
-- l'usage gratuit sans aucune ligne de code client.
SELECT
  usage_date,
  feature_key,
  COUNT(DISTINCT user_id) AS utilisateurs,
  SUM(view_count)         AS ouvertures
FROM public.premium_usage
WHERE feature_key IN ('natal_chart', 'conversation_guide')
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
```

```sql
-- Le chemin complet, pour un template donné : envoyé → cliqué → valeur vue.
WITH clicks AS (
  SELECT DISTINCT user_id, created_at
    FROM public.product_events
   WHERE event_name = 'email_clicked'
     AND template = 'onboarding_day1'
     AND user_id IS NOT NULL
)
SELECT
  COUNT(*)                                            AS clics_identifies,
  COUNT(*) FILTER (WHERE pu.user_id IS NOT NULL)      AS ont_vu_leur_theme,
  ROUND(100.0 * COUNT(*) FILTER (WHERE pu.user_id IS NOT NULL)
        / NULLIF(COUNT(*), 0), 1)                     AS taux_pct
FROM clicks c
LEFT JOIN LATERAL (
  SELECT pu.user_id
    FROM public.premium_usage pu
   WHERE pu.user_id = c.user_id
     AND pu.feature_key = 'natal_chart'
     AND pu.usage_date >= c.created_at::date
   LIMIT 1
) pu ON TRUE;
```

### 4.6 Comparaison avant / après

```sql
-- Remplacer la date par celle du déploiement Vercel de ce patch.
WITH bornes AS (SELECT TIMESTAMPTZ '2026-08-31 00:00:00+00' AS patch)
SELECT
  CASE WHEN u.created_at < b.patch THEN 'avant' ELSE 'apres' END      AS fenetre,
  COUNT(*)                                                            AS eligibles,
  COUNT(*) FILTER (WHERE p.last_active > u.created_at + INTERVAL '24 hours')
                                                                      AS revenus_j1,
  ROUND(100.0 * COUNT(*) FILTER (
          WHERE p.last_active > u.created_at + INTERVAL '24 hours')
        / NULLIF(COUNT(*), 0), 1)                                     AS taux_j1_pct
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
CROSS JOIN bornes b
WHERE u.created_at < NOW() - INTERVAL '24 hours'
  AND u.created_at > b.patch - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;
```

> ⚠️ **Petits échantillons.** À n≈9 par fenêtre, l'intervalle de confiance à
> 95 % sur un taux de 20 % s'étend d'environ 3 % à 56 %. Une variation de
> 0 % à 22 % **n'est pas une preuve**. Attendre ~50 comptes par fenêtre avant
> d'affirmer quoi que ce soit, et se servir d'ici là des chiffres absolus
> (« 3 personnes sur 12 sont revenues ») plutôt que des pourcentages.

## 5. Ce qui reste non mesuré, nommé

| Trou | Pourquoi | Coût du correctif |
|---|---|---|
| **`email_clicked` sur mobile** | le CTA est un App Link ; sur un téléphone avec l'app installée, Android l'ouvre sans passer par le web. `last_active` bouge, mais rien ne l'attribue à l'email. | un build mobile (`record_product_event` depuis le handler de deep link de `_layout.tsx`) |
| **`value_seen` non gaté** | Discover, le fil de conversation, le profil n'écrivent nulle part | le socle P1-9 de l'audit rétention |
| **Ouvertures d'email** | pas de pixel de tracking, choix délibéré | webhook Resend, si un jour souhaité |

## 6. Les deux décisions produit que ce patch n'a pas prises

Elles demandent un arbitrage de monétisation, pas une décision d'ingénierie.

### 6.1 Le CTA du Day 3 promet ce qu'un compte gratuit ne peut pas avoir

`onboarding_day3` dit **« Compare two charts »** et pointe vers `/app`. Le
pointer vers `/app/premium/celestial/synastry` serait cohérent avec la
promesse — mais `synastry` n'a **pas** d'aperçu gratuit
(`free_preview_quota` est NULL), donc un compte gratuit tomberait sur un
paywall. Ce serait pire que le menu actuel.

Deux issues possibles, au choix :

```sql
-- (a) Donner un aperçu quotidien à la synastrie, puis pointer le CTA dessus.
UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'synastry';
-- + ajouter 'synastry': 'synastry' à SERVER_ENFORCED_FEATURES
--   (apps/mobile/services/premiumUsage.ts) — sinon validate:premium-gating échoue.
```

(b) Ou réécrire le CTA pour promettre ce que `/app` livre réellement.

### 6.2 Il n'existe aucune valeur gratuite **quotidienne** sur le web

| Surface | Web | Gratuite ? |
|---|---|---|
| Natal Chart | ✅ | aperçu 1/jour — mais le thème ne change pas d'un jour à l'autre |
| Daily Reflection | ✅ | **verrouillée** Celestial, aucun aperçu |
| Conversation Guide | ❌ | **mobile uniquement** |

Donc rien, sur le web, ne donne une raison de revenir *demain plutôt
qu'aujourd'hui*. C'est probablement la cause structurelle la plus lourde du
J+1 — mais y répondre veut dire soit ouvrir Daily Reflection en aperçu
gratuit, soit porter le Conversation Guide sur le web (P1 de son plan). Les
deux sont des décisions produit, et aucune ne doit être prise avant que la
mesure ci-dessus ait tourné une semaine.

---

**Voir aussi :** `docs/retention-day2-audit-2026-08.md` §8 (plan analytics
d'origine) · `docs/conversation-coach-feature-plan-2026-08.md` §11 (télémétrie
de la feature) · `docs/premium-free-preview.md` (comment étendre un aperçu
gratuit à une autre surface).
