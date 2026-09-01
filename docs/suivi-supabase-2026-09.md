# Suivi Supabase — après les livraisons du 31 août 2026

**Créé le :** 1ᵉʳ septembre 2026.
**À quoi ça sert :** cinq changements sont partis en production le 31 août.
Aucun ne lève d'erreur s'il échoue — ils échouent en silence, exactement comme
les bugs qu'ils corrigent. Ce fichier dit quoi regarder, quand, et quoi faire
si le chiffre est mauvais.

**Comment s'en servir :** ouvre l'éditeur SQL Supabase, colle un bloc, compare
à la valeur attendue, coche. Toutes les requêtes sont exécutables telles
quelles — pas de `--` en tête de ligne à décommenter, pas de placeholder à
remplacer.

> ⚠️ `auth.uid()` renvoie **NULL** dans l'éditeur SQL Supabase. Aucune requête
> ici ne s'en sert ; si tu en écris une, joins par `id` explicite.

---

## Repères de temps

| Livraison | Quand | Canal |
|---|---|---|
| Trigger de création de profil restauré + backfill | 31 août | migration `20260831000003` |
| `product_events` + attribution | 31 août | migrations `20260831000001/2` |
| Garde d'onboarding (`AppShell`) | 31 août | Vercel, PR #8 |
| Angles sans lieu de naissance | **31 août 21:08 UTC** | edge functions v45 / v16 |
| Maisons et degrés fabriqués | 31 août | Vercel PR #9 + Android **124** |

**Android 124 n'est pas promu sur Play.** Tant qu'il ne l'est pas, les
utilisateurs Android voient encore les maisons et planètes inventées, et les
chiffres mobiles ci-dessous ne bougeront pas. C'est la première case à cocher.

---

## Aujourd'hui — 4 vérifications

### ☐ 1. Aucun ascendant calculé depuis un lieu inventé

**Pourquoi.** Trois chemins substituaient Greenwich ou Montréal quand le lieu
de naissance manquait, puis calculaient un ascendant depuis ce lieu. Corrigé
le 31 août à 21:08 UTC. Si un chemin d'écriture m'a échappé, ce compteur monte.

```sql
SELECT COUNT(*)                                                AS nouveaux,
       COUNT(*) FILTER (WHERE birth_time IS NOT NULL
                          AND (birth_latitude IS NULL
                            OR birth_longitude IS NULL)
                          AND rising_sign IS NOT NULL)         AS ascendant_sans_lieu,
       COUNT(*) FILTER (WHERE birth_time IS NULL
                          AND rising_sign IS NOT NULL)         AS ascendant_sans_heure
  FROM public.profiles
 WHERE created_at >= TIMESTAMPTZ '2026-08-31 21:08:00+00';
```

**Attendu :** `ascendant_sans_lieu = 0` et `ascendant_sans_heure = 0`.
`nouveaux` peut rester à 0 quelques jours — le volume est faible, ça ne valide
rien tant qu'il n'a pas dépassé une dizaine.

**Si `ascendant_sans_lieu > 0`** — un chemin écrit encore un ascendant sans
coordonnées. Trouve lequel :

```sql
SELECT id, email, birth_time, birth_latitude, birth_longitude, rising_sign,
       birth_chart ->> 'confidence' AS confiance,
       birth_chart -> 'warnings'    AS avertissements,
       created_at
  FROM public.profiles
 WHERE created_at >= TIMESTAMPTZ '2026-08-31 21:08:00+00'
   AND birth_time IS NOT NULL
   AND (birth_latitude IS NULL OR birth_longitude IS NULL)
   AND rising_sign IS NOT NULL
 ORDER BY created_at DESC;
```

`avertissements` doit contenir `missing_birth_place`. S'il ne l'a pas, la
ligne vient d'un chemin qui n'appelle ni `calculate-chart` ni le moteur
partagé.

### ☐ 2. Le trigger de création de profil tient

**Pourquoi.** Il était **absent de la production** du 27 avril au 31 août :
143 comptes confirmés sur 245 n'avaient aucune ligne `profiles`, donc étaient
invisibles à `send-email` et à toute requête produit. Restauré et backfillé.

```sql
SELECT (SELECT COUNT(*) FROM auth.users u
          LEFT JOIN public.profiles p ON p.id = u.id
         WHERE p.id IS NULL)                                    AS comptes_sans_profil,
       (SELECT COUNT(*) FROM pg_trigger t
          JOIN pg_class c     ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE NOT t.tgisinternal
           AND n.nspname = 'auth' AND c.relname = 'users'
           AND t.tgname  = 'trigger_create_profile_on_auth_signup'
           AND t.tgenabled IN ('O','A'))                        AS trigger_actif;
```

**Attendu :** `comptes_sans_profil = 0`, `trigger_actif = 1`.

**Si `trigger_actif = 0`** — il a été supprimé ou désactivé. Réapplique
`supabase/migrations/20260831000003_restore_profile_creation_trigger.sql`
depuis l'éditeur Studio (il est idempotent, et il refuse de tourner si un
trigger `INSERT` sur `profiles` pouvait envoyer du mail).

**Si `comptes_sans_profil > 0`** — le trigger existe mais échoue. Il est
enveloppé dans un `EXCEPTION WHEN OTHERS` qui journalise un WARNING plutôt que
de casser l'inscription ; regarde les logs Postgres.

### ☐ 3. La file d'emails n'est pas bloquée

**Pourquoi.** Le backfill des 143 profils ne pouvait pas armer
`trigger_schedule_onboarding_emails` (il est `AFTER UPDATE`, sur la transition
`onboarding_completed` FALSE→TRUE). Vérifie-le plutôt que de me croire.

```sql
SELECT status,
       COUNT(*)                                       AS n,
       MIN(scheduled_for)                             AS plus_ancien,
       COUNT(*) FILTER (WHERE scheduled_for < NOW())  AS en_retard
  FROM public.scheduled_emails
 GROUP BY status
 ORDER BY n DESC;
```

**Attendu :** aucun pic de `pending` daté du 31 août, et `en_retard` proche de
0 pour `pending`.

**Si `en_retard` est élevé** — le cron `send-scheduled-emails` ne tourne plus.
Vérifie la planification dans le dashboard Supabase (Database → Cron Jobs).

### ☐ 4. Promouvoir Android 124 sur Play

Pas une requête, mais c'est ce qui débloque tout le reste côté mobile.
L'AAB : `https://expo.dev/artifacts/eas/-tl_LwY6i0aDjft1VILpSSC0A1d6gdJUBF3plZ8-BDE.aab`

Et le test manuel qui vaut mieux que toutes les requêtes ci-dessus : **crée un
compte sur la PWA avec une heure de naissance mais sans ville.** Tu ne dois
voir **aucun** signe ascendant, et la section des maisons doit afficher
« Votre heure de naissance est enregistrée, mais les maisons dépendent aussi
du lieu ». Deux minutes, et c'est concluant là où le SQL ne l'est pas encore.

---

## J+3 (à partir du 3 septembre) — 2 vérifications

### ☐ 5. La garde d'onboarding a débloqué OAuth

**Pourquoi.** Avant le 31 août, l'onboarding n'avait **qu'un seul point
d'entrée et aucun rattrapage** : rater le redirect du callback une fois était
définitif. Les taux de fin d'onboarding étaient email/mot de passe **58,7 %**,
Google **28,6 %**, Apple **4,2 %**.

```sql
SELECT COALESCE(u.raw_app_meta_data ->> 'provider', '?')      AS methode,
       COUNT(*)                                               AS comptes,
       COUNT(*) FILTER (WHERE p.id IS NULL)                   AS sans_profil,
       COUNT(*) FILTER (WHERE p.onboarding_completed)         AS termines,
       ROUND(100.0 * COUNT(*) FILTER (WHERE p.onboarding_completed)
             / NULLIF(COUNT(*), 0), 1)                        AS taux
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE u.created_at >= DATE '2026-08-31'
   AND split_part(COALESCE(u.email, ''), '@', 2) NOT IN
       ('astrodating.test', 'test.com', 'demo.com', 'example.com')
 GROUP BY 1
 ORDER BY comptes DESC;
```

**Attendu :** `sans_profil = 0` partout (le trigger crée la ligne
maintenant, quoi qu'il arrive). Apple et Google doivent remonter vers les
~59 % d'email/mot de passe.

**Si Apple reste bas** — la panne est ailleurs que dans le rattrapage, et le
test en direct sur iPhone (installer la PWA, se connecter avec Apple, regarder
où on atterrit) redevient la prochaine étape. Je n'ai jamais établi le
mécanisme exact du raté, seulement l'absence de rattrapage.

### ☐ 6. Les maisons s'affichent pour ceux qui le méritent

**Pourquoi.** Savoir combien de comptes sont dans chacun des trois états dit
si la fonctionnalité concerne beaucoup de monde ou presque personne.

```sql
SELECT COUNT(*)                                                  AS onboardes,
       COUNT(*) FILTER (WHERE birth_time IS NULL)                AS etat_A_sans_heure,
       COUNT(*) FILTER (WHERE birth_time IS NOT NULL
                          AND (birth_latitude IS NULL
                            OR birth_longitude IS NULL))         AS etat_B_heure_sans_lieu,
       COUNT(*) FILTER (WHERE birth_time IS NOT NULL
                          AND birth_latitude IS NOT NULL
                          AND birth_longitude IS NOT NULL)       AS etat_C_maisons_reelles
  FROM public.profiles
 WHERE onboarding_completed
   AND split_part(COALESCE(email, ''), '@', 2) NOT IN
       ('astrodating.test', 'test.com', 'demo.com', 'example.com');
```

**Comment le lire.** Si `etat_C` est très minoritaire, la section des maisons
personnalisées ne sert presque personne, et l'effort suivant devrait porter
sur **faire renseigner la ville de naissance** plutôt que sur enrichir les
maisons. Si `etat_B` domine, ce sont des gens qui croyaient avoir tout donné :
ils méritent une relance ciblée.

---

## J+7 (à partir du 7 septembre) — 2 vérifications

### ☐ 7. Les emails de cycle de vie sont cliqués

**Pourquoi.** Avant `product_events`, « personne n'a cliqué » et « tout le
monde a cliqué puis rebondi » produisaient la même ligne de données — et
appellent des correctifs opposés.

```sql
SELECT e.template,
       COUNT(*)                                          AS clics,
       COUNT(*) FILTER (WHERE e.user_id IS NOT NULL)     AS identifies,
       COUNT(DISTINCT e.user_id)                         AS lecteurs_uniques,
       MIN(e.created_at)                                 AS premier,
       MAX(e.created_at)                                 AS dernier
  FROM public.product_events e
 WHERE e.event_name = 'email_clicked'
 GROUP BY 1
 ORDER BY clics DESC;
```

**Attendu :** au moins quelques lignes, et `identifies` non nul. Un
`identifies` à 0 sur plusieurs clics signifie que le rejeu d'attribution
(`attributePendingClick`) ne se déclenche plus.

À croiser avec l'envoi réel :

```sql
SELECT template,
       COUNT(*) FILTER (WHERE status = 'sent')     AS envoyes,
       COUNT(*) FILTER (WHERE status = 'failed')   AS echecs,
       COUNT(*) FILTER (WHERE status = 'pending')  AS en_attente
  FROM public.scheduled_emails
 WHERE created_at >= DATE '2026-08-24'
 GROUP BY 1
 ORDER BY envoyes DESC;
```

Un taux de clic se calcule seulement en rapprochant les deux tableaux.
**Il n'existe aucune ligne pour `welcome`** — voir « Décisions ouvertes ».

### ☐ 8. L'écran natal est ouvert

**Pourquoi.** Tout le chantier du 31 août porte sur un écran. S'il n'est
presque jamais ouvert, l'effort suivant doit aller ailleurs.

```sql
SELECT usage_date,
       COUNT(DISTINCT user_id) AS lecteurs,
       SUM(view_count)         AS ouvertures
  FROM public.premium_usage
 WHERE feature_key = 'natal_chart'
   AND usage_date >= DATE '2026-08-24'
 GROUP BY 1
 ORDER BY 1 DESC;
```

---

## J+14 (à partir du 14 septembre) — 1 vérification

### ☐ 9. Le taux de fin d'onboarding par mois

**Pourquoi.** C'est le chiffre qui a révélé toute cette chaîne. Historique :
février 50 %, mars 43,8 %, avril 66,7 %, mai 41,2 %, **juin 27,4 %** (146
comptes — vraie croissance, pas des bots), juillet 27,3 %, août 56,8 %.

La chute de mai à juillet coïncide avec la disparition du trigger le 27 avril.
Septembre est le premier mois complet avec le trigger **et** la garde
d'onboarding.

```sql
SELECT to_char(u.created_at, 'YYYY-MM')                    AS mois,
       COUNT(*)                                            AS confirmes,
       COUNT(*) FILTER (WHERE p.onboarding_completed)       AS termines,
       ROUND(100.0 * COUNT(*) FILTER (WHERE p.onboarding_completed)
             / NULLIF(COUNT(*), 0), 1)                     AS taux
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE u.email_confirmed_at IS NOT NULL
   AND split_part(COALESCE(u.email, ''), '@', 2) NOT IN
       ('astrodating.test', 'test.com', 'demo.com', 'example.com')
 GROUP BY 1
 ORDER BY 1;
```

**Attendu :** septembre au-dessus de 56,8 %. En dessous, la garde n'a pas
l'effet espéré et il faut chercher plus haut dans le tunnel.

---

## Décisions ouvertes — rien à vérifier, tout à trancher

### ☐ A. Les ascendants historiques calculés depuis un faux lieu

Les comptes créés **avant** le 31 août 21:08 UTC avec une heure de naissance
mais sans ville portent un `rising_sign` calculé depuis Greenwich ou Montréal.
Le trigger de `20260830000001` garantit
`birth_time IS NULL ⟹ rising_sign IS NULL` — **il ne connaît pas le lieu**.

```sql
SELECT COUNT(*)                                     AS concernes,
       COUNT(DISTINCT rising_sign)                  AS signes_distincts,
       MIN(created_at)::date                        AS du,
       MAX(created_at)::date                        AS au
  FROM public.profiles
 WHERE onboarding_completed
   AND birth_time IS NOT NULL
   AND (birth_latitude IS NULL OR birth_longitude IS NULL)
   AND rising_sign IS NOT NULL
   AND created_at < TIMESTAMPTZ '2026-08-31 21:08:00+00';
```

**La décision est produit, pas technique.** Effacer un ascendant que quelqu'un
a vu affiché pendant des mois n'est pas neutre. Trois options :

1. **Effacer** — cohérent avec « ne jamais affirmer ce qu'on ne sait pas »,
   mais le lecteur perd une information sans explication.
2. **Laisser et masquer à l'affichage** — plus doux, mais la colonne reste
   fausse et le prochain développeur la relira.
3. **Demander la ville de naissance** aux comptes concernés, puis recalculer.
   Le plus honnête, le plus lent.

Aucune migration n'est écrite. Dis-moi laquelle et je la fais.

### ☐ B. Le template `welcome` n'est envoyé par rien

Il existe dans `supabase/functions/send-email/templates.ts`, il est dans la
whitelist de `record_product_event`, et **aucun trigger ni appel ne le
déclenche**. Personne n'a jamais reçu de mail de bienvenue.

Le correctif est petit (un trigger sur `profiles` INSERT, ou un appel client
après inscription), mais il demande une décision : à quel moment l'envoyer, et
quoi y mettre pour quelqu'un qui n'a pas encore de thème natal ?

### ☐ C. Le domaine expéditeur chez Apple

À vérifier dans le portail Apple Developer :
**Certificates, Identifiers & Profiles → Services → *Sign in with Apple for
Email Communication* → Configure**, champ « Domains and Associated Email
Addresses », domaine **nu** : `junosynastry.com`.

Sans ça, le relais privé jette silencieusement tout le courrier vers les 28
adresses `privaterelay.appleid.com`. Vérifie d'abord le secret `EMAIL_FROM`
dans Supabase : si Resend envoie depuis un sous-domaine, c'est celui-là qu'il
faut enregistrer, pas l'apex.

Ce n'est **pas** le champ « Server-to-Server Notification Endpoint » de la page
App ID — celui-là attend une URL `https://` vers un endpoint que JUNO n'a pas,
et doit rester vide.

### ☐ D. Nettoyage des comptes de test

`astrodating.test` : **60 comptes, 0 dans le deck Discover, 0 onboardés, 0
conversations.** Suppression sans risque.

`test.com` et `demo.com` : **14 dans le deck, 8 conversations.** À vérifier
avant de toucher :

Le résumé par domaine :

```sql
WITH synthetiques AS (
  SELECT p.id,
         split_part(COALESCE(p.email, ''), '@', 2) AS domaine,
         p.onboarding_completed,
         COALESCE(p.is_active, true)               AS actif,
         (SELECT COUNT(*) FROM public.conversations c
           WHERE c.user_a = p.id OR c.user_b = p.id) AS conversations
    FROM public.profiles p
   WHERE split_part(COALESCE(p.email, ''), '@', 2)
         IN ('astrodating.test', 'test.com', 'demo.com', 'example.com')
)
SELECT domaine,
       COUNT(*)                                                  AS comptes,
       COUNT(*) FILTER (WHERE onboarding_completed)              AS onboardes,
       COUNT(*) FILTER (WHERE actif AND onboarding_completed)    AS dans_le_deck,
       SUM(conversations)                                        AS conversations,
       COUNT(*) FILTER (WHERE conversations > 0)                 AS comptes_qui_ont_parle
  FROM synthetiques
 GROUP BY domaine
 ORDER BY conversations DESC;
```

Et le détail des comptes à ne surtout pas supprimer sans regarder :

```sql
SELECT p.email,
       p.name,
       p.onboarding_completed,
       (SELECT COUNT(*) FROM public.conversations c
         WHERE c.user_a = p.id OR c.user_b = p.id) AS conversations
  FROM public.profiles p
 WHERE split_part(COALESCE(p.email, ''), '@', 2)
       IN ('astrodating.test', 'test.com', 'demo.com', 'example.com')
   AND EXISTS (SELECT 1 FROM public.conversations c
                WHERE c.user_a = p.id OR c.user_b = p.id)
 ORDER BY conversations DESC;
```

Un compte synthétique avec des conversations réelles a parlé à quelqu'un de
vrai. Le supprimer efface l'historique de l'autre personne.

Option durable proposée et non faite : une colonne `is_synthetic BOOLEAN` sur
`profiles`, qui remplacerait le filtrage par motif d'email dans **toutes** les
requêtes de ce fichier.

---

## Ce qui n'a pas besoin d'être surveillé

Pour éviter d'y revenir :

- **Les migrations déjà appliquées** — `20260830000001` (ascendant),
  `20260831000001/2` (events), `20260831000003` (trigger) portent toutes leurs
  propres postconditions et ont échoué bruyamment si quelque chose n'allait
  pas. Elles sont passées.
- **Les validateurs** — `validate:natal-integrity` (117),
  `validate:web-onboarding` (84), `validate:retention-guards` (71) tournent en
  CI sur chaque PR. Ils gardent le code, pas les données.
- **Les tests partagés** — 211 tests vitest sur le moteur astro. Ils ne
  couvrent **pas** les edge functions, qui ont leur propre implémentation
  inline : la correction de `calculate-chart` et `get-profile-chart` repose sur
  la relecture et sur les vérifications structurelles, pas sur un test
  d'exécution. C'est la raison d'être de la vérification n° 1.

---

**Documents liés :** `docs/twelve-houses-audit-2026-08.md`,
`docs/rising-sign-integrity-2026-08.md`,
`docs/retention-measurement-2026-08.md`,
`docs/retention-day2-audit-2026-08.md`.
