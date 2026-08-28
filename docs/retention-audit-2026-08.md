# Audit rétention post-signup — JUNO mobile

> **REMPLACÉ le 27 août 2026 par `docs/retention-day2-audit-2026-08.md`.**
> Ce document est conservé comme trace historique. Le diagnostic y reste
> globalement valide, mais il lui manque trois constats découverts depuis, dont
> un qui invalide son quick win : les emails de cycle de vie ne contiennent
> **aucun lien cliquable**, la permission push est demandée avant tout onboarding,
> et l'email J+5 annonce un essai gratuit qui n'existe pas. Se référer au
> document courant.

Établi le 24 août 2026 par lecture du code, branche `master`. Aucun fichier
applicatif n'a été modifié pour produire cet audit.

**Question posée :** les utilisateurs s'inscrivent mais ne restent pas. Où
décrochent-ils, et quoi corriger en premier ?

**Réponse courte :** le paywall n'est pas le problème. Il n'existe aujourd'hui
aucun déclencheur de retour à J+1, pour 100 % des nouveaux comptes — et deux des
trois filtres de découverte sont des culs-de-sac sans sortie.

---

## 1. Parcours réel après inscription

| # | Étape | Fichier | Risque |
|---|---|---|---|
| 1 | Welcome — thème calculé **avant** inscription | `apps/mobile/app/welcome/index.tsx:134`, `welcome/preview.tsx:213` | faible |
| 2 | Signup — nom, email, mot de passe strict | `apps/mobile/app/auth/signup.tsx:101` | moyen |
| 3 | **Mur de vérification email** | `apps/mobile/app/auth/verify-email.tsx` | **élevé** |
| 4 | Splash + garde de routage | `apps/mobile/app/index.tsx:96-107` | moyen |
| 5 | Onboarding — 4 étapes en un seul écran | `apps/mobile/app/onboarding/birth-info.tsx` | moyen |
| 6 | Calcul du thème, en local | `apps/mobile/app/onboarding/birth-info.tsx:672-814` | faible |
| 7 | Révélation « The Stars Have Spoken! » | `apps/mobile/app/onboarding/birth-info.tsx:225-300` | faible |
| 8 | **Discover** — première destination | `birth-info.tsx:817` → `apps/mobile/app/(tabs)/discover.tsx` | **élevé** |

Détails structurants :

- Le drapeau qui décide du routage est **`profiles.onboarding_completed`**, pas
  la présence d'une date de naissance (`apps/mobile/app/index.tsx:96-107`).
- Une erreur ou un timeout sur le fetch profil (`apps/mobile/app/_layout.tsx:106-111`)
  laisse `onboardingCompleted = false` → un utilisateur déjà onboardé est renvoyé
  **dans** l'onboarding.
- `apps/mobile/app/(tabs)/_layout.tsx` ne contient **aucune garde** : un deep link
  ou une notification pointant vers un onglet court-circuite tout l'onboarding.
- L'email est obligatoire (`supabase/config.toml:205`, `enable_confirmations = true`)
  donc `signUp` ne renvoie pas de session, et la ligne `profiles` n'est créée
  qu'au premier `SIGNED_IN` (`_layout.tsx:144-199`).
- Onboarding = ~8 taps + 3 pickers, 60 à 120 s. Une seule écriture en base, tout
  à la fin (`birth-info.tsx:757-776`).
- Le thème est calculé **sur l'appareil** (`services/astrology.ts` →
  `packages/shared/src/astrology/chart.ts`), pas via l'edge function
  `calculate-chart`, qui n'est jamais appelée par le mobile.
- **Aucune étape photo, bio ou prompt.** Un compte est visible et messageable dès
  `onboarding_completed = true` — `get_discoverable_profiles` n'a aucun prédicat
  sur les photos (`supabase/migrations/20260601000001_add_connection_intentions.sql:271-286`).

---

## 2. Aha moment

Il existe : `ChartRevealOverlay` (`birth-info.tsx:225-300`), Soleil / Lune /
Ascendant en cascade. Trois faiblesses.

### 2.1 L'ascendant est fabriqué — CRITIQUE

L'étape 2 (heure + ville) est totalement facultative et encourage à la sauter
(« Don't worry if you're not sure », `birth-info.tsx:1086-1090`).

Sans heure, le moteur partagé renvoie `rising: null`
(`packages/shared/src/astrology/chart.ts:156-164`), mais le wrapper mobile
substitue une valeur en dur :

```ts
// apps/mobile/services/astrology.ts:125
placement(chart.rising, { sign: 'Aries', degree: 0, longitude: 0 })
```

Conséquence : tout utilisateur sans heure de naissance est enregistré avec
`profiles.rising_sign = 'Aries'` (`birth-info.tsx:769`) et la révélation lui
annonce « Rising: Aries — How others see you ». Aucun avertissement.

**Correction recommandée :** supprimer le fallback, afficher « Ascendant :
heure de naissance requise » avec un lien pour l'ajouter.

### 2.2 Il arrive après un mur email

3 à 5 minutes et un changement d'application entre l'intention et la récompense.

### 2.3 Il est solitaire

La révélation parle de *vous* ; la thèse produit de JUNO est la synastrie.
Aha moment recommandé : **« voici trois personnes dont le thème résonne avec le
tien, et pourquoi »**.

---

## 3. Pourquoi ils décrochent — par gravité

### 3.1 Zéro déclencheur de retour à J+1 — CRITIQUE, 100 % des comptes

Deux systèmes existent, aucun ne produit d'effet.

**Push horoscope quotidien.** Le cron `daily-horoscope-push` tourne bien tous les
jours à 12:00 UTC (`supabase/migrations/20260419000005_rotate_cron_secrets.sql:103-105`).
Mais `supabase/functions/send-daily-horoscope/index.ts:150-153` ne garde que les
utilisateurs dont `notification_preferences.dailyHoroscope === true`, et le défaut
en base est **`false`** :

```sql
-- supabase/migrations/00000000000000_full_schema.sql:147
notification_preferences JSONB DEFAULT '{"newMatches": true, "messages": true,
  "likes": true, "superLikes": true, "dailyHoroscope": false, "promotions": false}'::jsonb
```

Le cron s'exécute chaque jour et ne notifie personne.

**Emails J+1 / J+3 / J+5.** Le trigger `trigger_schedule_onboarding_emails`
(`supabase/migrations/20260329000002_onboarding_email_sequence.sql:33-81`) insère
bien trois lignes dans `scheduled_emails` à la fin de l'onboarding, et les trois
templates sont écrits (`supabase/functions/send-email/index.ts:107-187`).

Mais **aucun cron n'appelle jamais `send-scheduled-emails`**. Les six jobs pg_cron
existants sont : `cleanup-rate-limits`, `daily-horoscope-push`,
`publish-scheduled-posts`, `process-expired-deletions`, `cleanup-edge-rate-limits`.
Les lignes s'accumulent en `pending` indéfiniment.

Par ailleurs : aucun streak, aucun badge d'icône (`setBadgeCountAsync` n'est
appelé nulle part), aucun compteur « nouveaux profils ». Et **`profiles.last_active`
n'est jamais écrit par l'app** — la seule référence est un SELECT
(`apps/mobile/app/chat/[id].tsx:150`).

### 3.2 Le piège du filtre Discover — CRITIQUE, 2 filtres sur 3

L'état vide retourne à `apps/mobile/app/(tabs)/discover.tsx:540-552`, **avant** le
rendu des pastilles de filtre situées à `discover.tsx:654`. Le seul contrôle
disponible est « Refresh » → `handleRefresh` (`discover.tsx:488-497`), qui relance
la même requête avec le même `intentionFilter`.

Or les 60 profils de seed ont tous `connection_intentions = ['love']` uniquement
(colonne ajoutée avec `DEFAULT ARRAY['love']`,
`supabase/migrations/20260601000001_add_connection_intentions.sql:32-34`).

Donc taper « Friendship » ou « Business » renvoie **zéro profil garanti**, et il
n'existe plus aucun moyen à l'écran de revenir sur « All ». L'utilisateur est
enfermé jusqu'à redémarrage de l'app.

### 3.3 Tous les profils partagent la même photo — CRITIQUE

`supabase/migrations/20260330000001_seed_profiles.sql:61-66` et
`20260330000002_seed_profiles_us.sql:51-55` n'insèrent **aucune** colonne `photos`
ni `image_url`. Tous retombent donc sur `DEFAULT_PROFILE_IMAGE`
(`apps/mobile/utils/profileImages.ts:1`), une unique photo Unsplash d'une femme —
affichée aussi sur les profils masculins.

### 3.4 Le mur de vérification email — ÉLEVÉ

`apps/mobile/app/auth/verify-email.tsx` : spinner permanent, sondage toutes les
3 s, l'utilisateur doit quitter l'app. Le bouton « Back to login » appelle
`signOut()` (`:97-100`), et comme la ligne `profiles` n'existe pas encore, il
repart de zéro.

### 3.5 Les échecs silencieux — MOYEN

- Ville mal orthographiée → bascule silencieuse sur **Montréal**
  (`apps/mobile/services/geocoding.ts:147`, `:184-186`). Le thème est faux, personne
  ne le sait.
- Échec de chargement des messages indiscernable d'une conversation vide : les
  deux affichent « Start the conversation » (`apps/mobile/app/chat/[id].tsx:181-190`).
- La complétion de profil compte `is_verified` parmi 7 champs
  (`apps/mobile/app/(tabs)/profile.tsx:224-237`) : impossible d'atteindre 100 %
  sans soumettre une pièce d'identité.
- Discover : le fetch des tags du viewer ignore `error`
  (`discover.tsx:174-186`).

---

## 4. Paywall et valeur gratuite — ce n'est pas le problème

| Ce qu'un compte gratuit peut faire | Limite | Où |
|---|---|---|
| Envoyer un message | illimité | `discover.tsx:918`, aucun gate |
| Voir une synastrie | 1 / jour | `consumeTrial`, `PremiumGate.tsx` |
| Horoscope du jour | 1 / jour | `consumeTrial` |
| Thème natal complet | 1 / jour | gate serveur, `supabase/migrations/20260823000001_free_preview_quota.sql` |
| Parcourir Discover | illimité | aucun gate |

L'onglet Premium est un mur dur en navigation (`apps/mobile/app/(tabs)/premium.tsx:104`)
mais son contenu montre la valeur avant le prix.

**Seul vrai défaut :** l'aperçu de compatibilité du paywall est truqué. Les barres
Soleil 78 %, Lune 65 %, Ascendant 85 % sont des littéraux codés en dur
(`apps/mobile/app/(tabs)/premium.tsx:224-246`), pas les données de l'utilisateur —
alors que son thème réel est en base.

---

## 5. Écrans vides et culs-de-sac

| Écran | Fichier | Problème | Correction |
|---|---|---|---|
| Discover vide | `discover.tsx:540` | Refresh relance le même filtre ; pastilles inaccessibles | Rendre les pastilles dans l'état vide + CTA « Voir toutes les intentions » |
| Fin de deck | `discover.tsx:555-630` | Compteur `${n} profiles seen` en anglais codé en dur (`:623-625`) | Passer par i18n |
| Chat vide | `(tabs)/chat.tsx:242` | Aucun — meilleur état vide de l'app | Titre d'écran absent (header dans la liste) |
| Fil vide | `chat/[id].tsx:486-515` | Masque aussi les échecs de chargement | Distinguer erreur et vide |
| Premium gratuit | `(tabs)/premium.tsx:104` | Aperçu chiffré fictif | Brancher sur le thème réel |
| Profil illisible | `(tabs)/profile.tsx:248-287` | Version web en anglais codé en dur | i18n + distinguer erreur / absence |

Composants partagés : `apps/mobile/components/ScreenStates.tsx` exporte
`LoadingState`, `ErrorState`, `EmptyState`. Seuls `discover.tsx` et `chat.tsx`
utilisent `ErrorState` / `EmptyState` ; les autres écrans réimplémentent à la main.

---

## 6. Première action sociale

Le bon geste existe déjà et il est gratuit : depuis une carte Discover, le bouton
**Message** ouvre une conversation sans paywall (`discover.tsx:918-938` →
`handleStartConversation` `:430-445`), et le fil vide propose trois brise-glaces
qui pré-remplissent le champ (`chat/[id].tsx:501-513`).

Ce qui manque, c'est l'incitation. Rien ne signale que c'est gratuit, et le
parrainage — **30 jours de premium pour les deux parties**
(`supabase/functions/claim-referral/index.ts:7`) — n'est surfacé que dans
`apps/mobile/app/settings/index.tsx:249-330`, accessible uniquement via
Profil → Réglages. Aucune invitation ailleurs.

---

## 7. Boucle J+1 — état des lieux

| Mécanisme | Existe | Actif à J+1 | Pourquoi |
|---|---|---|---|
| Push horoscope | oui | **non** | préférence par défaut `false` |
| Email J+1 | oui | **non** | aucun cron n'appelle le dispatcher |
| Email de bienvenue | oui | non (J+0) | trigger direct, `full_schema.sql:763-781` |
| Push message | oui | si quelqu'un écrit | trigger `notify_new_message` |
| Streak | **non** | — | rien dans le code |
| Badge d'icône | **non** | — | `setBadgeCountAsync` jamais appelé |
| Parrainage | oui | non | aucune surface proactive |
| Widget iOS | oui | si ajouté manuellement | `apps/mobile/targets/widget/index.swift` |
| Widget Android | code seul | **non** | plugin `withAndroidShortcutsAndWidget` non déclaré dans `app.json`, et son chemin source pointe vers `apps/mobile/android-native` qui n'existe pas |

---

## 8. Instrumentation

**Aucun événement produit.** Sentry (`@sentry/react-native ~7.2.0`) est la seule
librairie, configurée pour les crashs uniquement
(`apps/mobile/app/_layout.tsx:41-65`), en production et hors web. Zéro
`addBreadcrumb`, `setTag`, `setContext`. L'identifiant utilisateur est **haché**
(`_layout.tsx:433`) — les données Sentry ne peuvent pas être rattachées à un
compte Supabase.

Aucune table `events`, aucun service de tracking, aucun script de reporting. Les
seules vues KPI (`supabase/migrations/20260326000002_add_kpi_views.sql`) couvrent
la facturation et les promos.

### Plan d'événements minimal

| Événement | Où l'ajouter | Propriétés | Statut |
|---|---|---|---|
| `signup_completed` | — | — | déjà : `auth.users.created_at` |
| `email_verified` | — | — | déjà : `email_confirmed_at` |
| `onboarding_started` | `birth-info.tsx:485` | `draft_restored` | à ajouter |
| `birth_info_completed` | `birth-info.tsx:757` | `time_known`, `city_typed` | à ajouter |
| `chart_calculated` | `birth-info.tsx:786` | `confidence`, `rising_real` | partiel : `profiles.birth_chart` |
| `activation_moment_viewed` | `birth-info.tsx:794` | — | à ajouter |
| `first_profile_viewed` | `discover.tsx:908` | `position` | à ajouter |
| `discover_empty_seen` | `discover.tsx:540` | `intention_filter` | **prioritaire** |
| `first_synastry_viewed` | `premium-screens/synastry.tsx` | `was_free_preview` | partiel : `premium_usage` |
| `first_message_sent` | `chat/[id].tsx` | `from_icebreaker` | déjà : `messages.created_at` |
| `paywall_viewed` | `PremiumGate.tsx:129` | `feature`, `reason` | à ajouter |
| `free_preview_consumed` | `PremiumGate.tsx:61` | `feature` | partiel : `premium_usage` |
| `subscription_started` | — | — | déjà : `subscription_events` |
| `day_1_returned` | `_layout.tsx` (foreground) | `days_since_signup` | écrire `last_active` |

Le plus urgent n'est pas l'outil, c'est **d'écrire `profiles.last_active` au
passage au premier plan**. Une ligne, et la rétention J+1 / J+7 / DAU devient
mesurable en SQL.

Proxy utile en attendant : `scheduled_emails.created_at WHERE template =
'onboarding_day1'` est inséré exactement au moment où `onboarding_completed`
passe à `true` — c'est un horodatage d'activation exploitable, puisqu'il n'existe
pas de colonne `onboarding_completed_at`.

---

## 9. Plan d'action priorisé

### Niveau 1 — aujourd'hui, moins d'une journée

1. **Restaurer la boucle J+1** — quick win retenu, patch en §10.
2. **Débloquer le piège Discover** — rendre les pastilles de filtre dans l'état
   vide de `discover.tsx:540-552`, ou ajouter un CTA qui remet `intentionFilter`
   sur `all`.
3. **Écrire `profiles.last_active`** au passage au premier plan — débloque toute
   mesure de rétention.
4. **Supprimer le fallback Aries** (`services/astrology.ts:125`) et afficher
   l'absence d'ascendant honnêtement.
5. **Retirer `is_verified`** du calcul de complétion (`(tabs)/profile.tsx:224-237`).

### Niveau 2 — un à trois jours

1. Donner de vraies photos aux 60 profils de seed, cohérentes avec le genre, et
   diversifier leurs `connection_intentions`.
2. Réorienter l'atterrissage post-révélation vers trois profils avec contexte de
   thème plutôt qu'un deck à balayer.
3. Brancher l'aperçu du paywall sur le thème réel (`(tabs)/premium.tsx:224-246`).
4. Surfacer le parrainage sur le paywall et dans les états vides.
5. Poser le socle analytics : table `product_events` + `services/analytics.ts`.

### Niveau 3 — plus ambitieux

1. Notification synastrie hebdomadaire.
2. Enregistrer le widget Android (plugin existant, non déclaré, chemin erroné).
3. Boucle de parrainage avec suivi invitations envoyées / acceptées.
4. Recommandation par compatibilité calculée plutôt qu'ordre de base.

---

## 10. Quick win retenu — restaurer la boucle J+1

**Pourquoi celui-ci :** il touche 100 % des nouveaux comptes (le piège Discover ne
concerne que ceux qui tapent un filtre), il ne modifie aucune interface, il ne
nécessite aucun rebuild mobile — l'effet est immédiat pour les utilisateurs déjà
installés — et il est mesurable dès le lendemain.

Fichier à créer : `supabase/migrations/20260824000001_restore_d1_return_loop.sql`

```sql
begin;

-- 1) Le dispatcher d'emails programmés n'a jamais été planifié : les lignes
--    onboarding_day1/3/5 s'accumulent en 'pending' depuis la mise en service.
--    Même motif que 20260419000005 (secret via vault, appel via pg_net).
DO $$
DECLARE
  v_url      TEXT;
  v_secret   TEXT;
  v_anon_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', TRUE)
           || '/functions/v1/send-scheduled-emails';

  v_secret := public._load_cron_secret(
    'cron_scheduled_emails_secret',
    'app.settings.scheduled_emails_secret'
  );

  v_anon_key := COALESCE(current_setting('app.settings.supabase_anon_key', TRUE), '');

  PERFORM cron.unschedule('send-scheduled-emails')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-scheduled-emails');

  PERFORM cron.schedule(
    'send-scheduled-emails',
    '*/15 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-scheduled-emails-secret', %L,
          'Authorization', 'Bearer ' || %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_url, v_secret, v_anon_key
    )
  );

  RAISE NOTICE 'Scheduled send-scheduled-emails every 15 minutes';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron/pg_net/vault indisponible — planifier manuellement (%)', SQLERRM;
END $$;

-- 2) Le cron horoscope tourne tous les jours à 12:00 UTC mais ne notifie
--    personne : la préférence est à false par défaut. Les nouveaux comptes sont
--    désormais inscrits ; l'autorisation OS reste évidemment requise.
ALTER TABLE public.profiles
  ALTER COLUMN notification_preferences
  SET DEFAULT '{"newMatches": true, "messages": true, "likes": true,
                "superLikes": true, "dailyHoroscope": true,
                "promotions": false}'::jsonb;

commit;
```

Le nom d'en-tête `x-scheduled-emails-secret` est vérifié dans
`supabase/functions/send-scheduled-emails/index.ts:13`.

### Backfill des comptes existants — décision produit, volontairement séparée

Réactiver une préférence de notification déjà enregistrée est une décision de
consentement, pas une correction de bug. À exécuter seulement si assumé :

```sql
UPDATE public.profiles
   SET notification_preferences =
       jsonb_set(notification_preferences, '{dailyHoroscope}', 'true')
 WHERE notification_preferences->>'dailyHoroscope' = 'false';
```

### Avant / après

| | Avant | Après |
|---|---|---|
| Push J+1 | jamais envoyé | 12:00 UTC, vers l'horoscope (1 vue gratuite/jour) |
| Email J+1 | `pending` à vie | envoyé dans les 15 min suivant l'échéance |
| Emails J+3 / J+5 | `pending` à vie | envoyés, dont la relance d'essai à J+5 |

### Risques

- **Rafale de rattrapage** : tous les emails en attente partiront au premier
  passage. Compter le volume avant ; au besoin marquer les plus anciens
  `skipped`.
- **Expéditeur obsolète** : `supabase/functions/send-email/index.ts:9-10` envoie
  depuis `AstroDating <noreply@astrodatingapp.com>`. À corriger avant d'ouvrir
  les vannes.
- **Secret vault** : `cron_scheduled_emails_secret` doit exister dans le vault et
  correspondre à `SCHEDULED_EMAILS_SECRET` côté fonction.
- **Dette push** : `send-daily-horoscope/index.ts:141-143` lit encore la colonne
  héritée `profiles.push_token` et jamais la table `push_tokens`. Fonctionne
  aujourd'hui (le client écrit les deux, `services/notifications.ts:252-255`),
  mais à solder avant de retirer la colonne.

### Checklist de validation

- [ ] Compter avant : `select template, count(*) from scheduled_emails where status='pending' group by 1;`
- [ ] Appliquer la migration
- [ ] `select jobname, schedule from cron.job where jobname='send-scheduled-emails';`
- [ ] Après 15 min, vérifier que des lignes passent à `sent`
- [ ] Créer un compte de test, terminer l'onboarding, confirmer 3 lignes `scheduled_emails`
- [ ] Confirmer `dailyHoroscope: true` sur ce compte
- [ ] Le lendemain 12:00 UTC : réception du push, ouverture sur l'horoscope
- [ ] Confirmer que l'horoscope est consultable gratuitement (1 vue/jour)
- [ ] Une semaine plus tard : part des comptes avec `last_active > created_at + 24h`

---

## Documents liés

- `docs/growth-plan.md` — objectifs d'acquisition et fonctionnalités livrées
- `docs/premium-free-preview.md` — architecture du free preview serveur
- `supabase/SECURITY.md` — posture RLS et RPC `SECURITY DEFINER`
