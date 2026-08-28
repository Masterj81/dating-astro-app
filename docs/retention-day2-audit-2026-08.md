# Audit rétention Day 1 / Day 2 — JUNO

Établi le 27 août 2026 par lecture du code, branche `master` (HEAD `2cc8ac1`),
arbre de travail inclus. **Aucun fichier applicatif n'a été modifié pour produire
cet audit.**

Ce document **remplace** `docs/retention-audit-2026-08.md` (24 août), conservé
comme trace historique. Tout ce qui reste vrai est repris ici ; ce qui a changé
depuis est signalé.

---

## Convention de lecture

Trois marqueurs sont utilisés partout dans ce document. Ils sont la seule
protection contre la confusion la plus coûteuse de cet audit :

| Marqueur | Signification |
|---|---|
| **CODÉ** | Le code existe dans le repo. Rien ne dit qu'il s'exécute en production. |
| **ACTIF** | Vérifié comme produisant un effet réel aujourd'hui. |
| **INERTE** | Le code existe, s'exécute peut-être, et ne produit aucun effet. |

Chaque constat porte une **preuve** (fichier:ligne) et une **vérification** — la
commande ou la requête qui le confirme ou le réfute. Les hypothèses non
vérifiables depuis le repo sont marquées **[À VÉRIFIER]** et regroupées en §12.

Sur les chiffres : cet audit ne contient **aucune estimation de pourcentage de
rétention**. Il n'existe aucune instrumentation produit (§8), donc aucun taux
n'est mesurable aujourd'hui. L'impact est exprimé en **portée** — la part des
comptes touchés par un défaut, qui elle se déduit de la logique du code.

---

## 1. Résumé exécutif

### Diagnostic principal, en une phrase

> JUNO n'a aucun chemin de retour fonctionnel : le seul canal qui atteint
> l'utilisateur absent — l'email — ne contient **aucun lien cliquable**, et le
> seul canal qui pourrait le rappeler — le push — demande sa permission avant
> qu'il ait vu la moindre valeur.

### Les 5 causes les plus probables

**1. Les emails de cycle de vie ne contiennent aucun lien. INERTE, 100 % des comptes.**

`supabase/functions/send-email/index.ts` — les quatre templates (`welcome`,
`onboarding_day1`, `onboarding_day3`, `onboarding_day5`) contiennent **zéro
balise `<a href>`**. Le texte dit « Open JUNO to explore your full chart » en
texte brut. Il n'existe aucun bouton, aucune URL, aucun deep link. Un
utilisateur qui *veut* revenir doit chercher l'icône à la main.

```
$ grep -c '<a href' supabase/functions/send-email/index.ts
0
```

C'est la cause la plus grave parce qu'elle **invalide silencieusement toute la
correction J+1**. La migration `20260824000001_restore_d1_return_loop.sql` ouvre
la vanne des emails programmés ; si elle est appliquée en l'état, JUNO se met à
envoyer en volume des emails structurellement incapables de ramener qui que ce
soit — et consomme sa réputation d'expéditeur pour rien.

**2. La permission push est demandée au pire moment. Portée : 100 % des comptes Android 13+.**

`apps/mobile/app/_layout.tsx:487` appelle `registerAndSavePushToken(user.id)`
dans un `useEffect` déclenché par `[user]` — donc **immédiatement au `SIGNED_IN`**,
avant l'onboarding, avant le thème natal, avant la moindre valeur perçue. Sur
Android 13+, `POST_NOTIFICATIONS` est une permission runtime : le système
affiche une boîte de dialogue à un instant où l'utilisateur n'a aucune raison
d'accepter.

Un refus est quasi définitif : la seule remédiation est un passage par les
réglages de l'OS (`services/notifications.ts:134-140`). La boucle de retour
quotidienne est donc morte pour cet utilisateur, de façon permanente — y compris
après application de la migration J+1.

**3. La destination du retour quotidien est faible, et hors marque.**

`supabase/functions/send-daily-horoscope/index.ts:7-92` — **5 phrases figées par
signe**, sélectionnées par `dayOfYear % 5` (`:100`). Le même texte revient donc
**tous les 5 jours**, à la virgule près. Il n'y a aucune variabilité de
récompense, ce qui est précisément l'ingrédient qui fait tenir une boucle
d'habitude.

Le ton est en plus contradictoire avec le positionnement :

- `"Creative expression attracts your soulmate."` (pisces) — « soulmate » est
  une **promesse explicitement bannie** par la marque (`marketingagent/CLAUDE.md`,
  `JUNO_BANNED_PROMISES`). Elle part en push, en production.
- `"Shine bright — your match is watching."`, `"take the lead in love"` — le
  contenu est intégralement dating, alors que JUNO se définit comme relationnel
  au sens large (amitié, chimie professionnelle, connaissance de soi).

**4. Day-5 annonce la fin d'un essai gratuit qui n'existe pas.**

`send-email/index.ts:160-187` : *« Your 7-day free trial ends in 2 days »*,
suivi de *« What you'll lose access to »*. Or il n'existe **aucun essai de 7
jours** côté backend. La recherche de `trial` dans `supabase/` ne renvoie que la
fenêtre de grâce de suppression de compte, sans rapport. Le modèle réel est
« 1 aperçu gratuit par jour, indéfiniment » (§7).

Un utilisateur gratuit reçoit donc, au jour 5, l'annonce de la fin d'un essai
qu'il n'a jamais commencé, et la liste de ce qu'il va « perdre » alors qu'il n'y
a jamais eu accès. C'est le seul email de la séquence qui peut activement
détruire la confiance.

**5. Discover est la destination d'atterrissage, et c'est le maillon faible.**

Trois défauts cumulés, tous confirmés dans l'audit précédent et toujours
présents :

- **Piège de filtre.** L'état vide (`app/(tabs)/discover.tsx:540-552`) est rendu
  **avant** les pastilles de filtre (`:654`). Les 60 profils de seed ont tous
  `connection_intentions = ['love']` uniquement. Taper « Friendship » ou
  « Business » garantit zéro résultat, sans aucun moyen à l'écran de revenir sur
  « All ». Portée : les utilisateurs qui touchent un filtre.
- **Photo unique.** `supabase/migrations/20260330000001_seed_profiles.sql` et
  `…_us.sql` n'insèrent **aucune** colonne photo — vérifié, `grep` sur
  `photos|image_url|images` ne renvoie rien. Les 60 profils retombent sur
  `DEFAULT_PROFILE_IMAGE` (`utils/profileImages.ts:1`) : la même photo Unsplash
  d'une femme, y compris sur les profils masculins. Portée : 100 % des comptes
  qui atteignent Discover.
- **Aucune raison astrologique affichée.** Le deck ne dit pas *pourquoi* ce
  profil, alors que c'est la thèse produit.

### Les 5 quick wins, dans l'ordre

| # | Action | Portée | Build requis | Effort |
|---|---|---|---|---|
| 1 | Réécrire les 4 templates email : liens CTA, désabonnement, suppression du faux essai | 100 % | **aucun** — edge function | 2–3 h |
| 2 | Déplacer la demande de permission push après la révélation du thème | 100 % (Android 13+) | mobile | 30 min |
| 3 | Sauter les étapes 1–2 de l'onboarding quand le brouillon pré-signup est complet | ~ tous ceux qui passent par /welcome | mobile | 1 h |
| 4 | Écrire `profiles.last_active` au passage au premier plan | 100 % | mobile | 15 min |
| 5 | Sortie de secours sur le filtre Discover | utilisateurs qui filtrent | mobile | 30 min |

Le n° 1 est seul dans sa catégorie : **il ne nécessite aucun build mobile ni
déploiement web**. Un `supabase functions deploy send-email` suffit, et l'effet
porte immédiatement sur le parc installé. C'est le premier patch recommandé
(§10).

Les n° 2 à 5 partagent un build. `expo-updates` n'étant **pas installé**
(vérifié : absent de `apps/mobile/package.json`), il n'y a pas d'OTA — donc
autant les regrouper dans une seule soumission.

---

## 2. Funnel actuel, reconstruit depuis le code

### 2.1 Le parcours, étape par étape

| # | Étape | Fichier | Données demandées | Valeur rendue |
|---|---|---|---|---|
| 1 | Welcome | `app/welcome/index.tsx:193-313` | date, heure, ville | — |
| 2 | Aperçu de thème | `app/welcome/preview.tsx:144-168` | — | **Soleil / Lune / Ascendant** |
| 3 | Signup | `app/auth/signup.tsx` | nom, email, mot de passe | — |
| 4 | **Mur de vérification email** | `app/auth/verify-email.tsx` | sortie de l'app | — |
| 5 | Splash | `app/index.tsx:96-107` | — | — |
| 6 | Onboarding étape 1 — anniversaire | `birth-info.tsx:914` | date (**déjà donnée**) | — |
| 7 | Onboarding étape 2 — heure + ville | `birth-info.tsx:1014` | heure, ville (**déjà données**) | — |
| 8 | Onboarding étape 3 — genre + préférence | `birth-info.tsx:1123` | genre, showMe | — |
| 9 | Onboarding étape 4 — intentions | `birth-info.tsx:1212` | intentions | — |
| 10 | Calcul du thème, local | `birth-info.tsx:672-814` | — | — |
| 11 | **Révélation** `ChartRevealOverlay` | `birth-info.tsx:225-300` | — | **Soleil / Lune / Ascendant** |
| 12 | Discover | `birth-info.tsx:817` → `(tabs)/discover.tsx` | — | deck de profils |

`(tabs)/index.tsx` est une simple redirection vers `discover` — il n'y a pas
d'écran d'accueil. Les onglets visibles sont **Discover, Chat, Profile,
Premium** ; `matches` est masqué (`href: null`, `(tabs)/_layout.tsx:102`), donc
il n'y a pas d'onglet mort hérité de la retraite des `matches`.

### 2.2 Le problème de forme du funnel

**La valeur personnalisée est atteinte deux fois, et la deuxième est une
répétition.**

L'aperçu de `/welcome/preview` (étape 2) montre déjà Soleil / Lune / Ascendant,
**avant** toute inscription. C'est excellent — c'est exactement le bon design.
Puis l'utilisateur s'inscrit, franchit le mur email, et l'onboarding lui
**redemande les trois mêmes champs** pour lui montrer **la même chose** à
l'étape 11.

Le report de données existe pourtant : `_layout.tsx:311-321` copie le brouillon
pré-signup vers le brouillon utilisateur au `SIGNED_IN`. Les champs sont donc
pré-remplis. Mais `OnboardingDraft.step` n'est jamais posé par le chemin
pré-signup (`utils/onboardingDraft.ts:15-26` — `step` est optionnel et le
welcome ne l'écrit pas), et `birth-info.tsx:543-544` ne restaure `step` que s'il
est présent. **L'écran démarre donc à l'étape 1**, et l'utilisateur re-parcourt
deux écrans qu'il a déjà remplis.

Le compte des interactions réellement nécessaires après signup, pour un
utilisateur venu de /welcome : 2 écrans de pure redite + 2 écrans utiles.
La moitié de l'onboarding post-signup est de la friction pure.

### 2.3 Ce qui déclenche quoi, côté serveur

```
auth.users INSERT
    └─→ (trigger, full_schema.sql:763-781) email 'welcome'         ACTIF

profiles.onboarding_completed  false → true
    └─→ trigger_schedule_onboarding_emails                          ACTIF
          ├─ scheduled_emails: onboarding_day1  (NOW + 24 h)
          ├─ scheduled_emails: onboarding_day3  (NOW + 72 h)
          └─ scheduled_emails: onboarding_day5  (NOW + 120 h)
                    │
                    └─→ cron 'send-scheduled-emails'    ← N'EXISTE PAS
                                                          en production
```

Les lignes s'insèrent correctement et s'accumulent au statut `pending`
indéfiniment. La migration corrective existe dans l'arbre de travail
(`20260824000001_restore_d1_return_loop.sql`) mais est **non suivie par git** et
**[À VÉRIFIER] non confirmée comme appliquée**.

---

## 3. Où l'utilisateur peut abandonner

Classé par portée décroissante.

### 3.1 Le mur de vérification email — ÉLEVÉ, 100 % des comptes

**Preuve :** `supabase/config.toml:205` → `enable_confirmations = true`. Donc
`signUp` ne renvoie pas de session, et la ligne `profiles` n'est créée qu'au
premier `SIGNED_IN` (`_layout.tsx:293-303`).

**Problème :** `app/auth/verify-email.tsx` affiche un spinner permanent et sonde
toutes les 3 s. L'utilisateur doit **quitter l'application**, ouvrir sa
messagerie, cliquer, revenir. Trois à cinq minutes et un changement de contexte
séparent l'intention du payoff.

Pire : le bouton « Back to login » appelle `signOut()` (`:97-100`). Comme la
ligne `profiles` n'existe pas encore à ce stade, l'utilisateur repart de zéro.

**Impact rétention :** c'est le point de sortie le plus mécanique du funnel. Il
tombe entre le moment où l'utilisateur a fourni son mot de passe (engagement
maximal) et le moment où il obtient sa récompense.

**Recommandation :** ne pas supprimer la vérification (elle protège la qualité
du parc), mais **découpler le payoff du mur**. L'aperçu de thème est déjà
calculé côté client à l'étape 2 — l'afficher **sur l'écran de vérification**,
avec le message « ton thème t'attend, confirme ton email pour le garder », rend
l'attente porteuse au lieu d'être vide. Zéro appel réseau supplémentaire : les
données sont dans le brouillon pré-signup.

### 3.2 Les deux écrans d'onboarding redondants — ÉLEVÉ

Voir §2.2. **Preuve :** `utils/onboardingDraft.ts:15-26` (pas de `step` écrit par
le welcome), `birth-info.tsx:543-544` (restauration conditionnelle),
`birth-info.tsx:395` (`useState(1)`).

**Recommandation :** au montage, si le brouillon contient une date complète et
(une heure OU `timeUnknown`) et une ville, positionner `step = 3`. Trois lignes.

### 3.3 Le piège du filtre Discover — CRITIQUE quand il se déclenche

**Preuve :** `discover.tsx:540-552` (état vide rendu tôt, `return` prématuré),
`discover.tsx:654` (pastilles rendues plus bas, jamais atteintes),
`discover.tsx:488-497` (`handleRefresh` relance le même `intentionFilter`),
`20260601000001_add_connection_intentions.sql:32-34`
(`DEFAULT ARRAY['love']` sur les 60 seeds).

**Vérification :**
```sql
select unnest(connection_intentions) as intent, count(*)
  from profiles where id in (select id from profiles limit 60)
 group by 1;
```

**Impact :** cul-de-sac dont la seule sortie est de tuer l'application.

### 3.4 Le silence sur la ville mal saisie — MOYEN, invisible

**Preuve :** `services/geocoding.ts:147` et `:184-186` — une ville non reconnue
bascule silencieusement sur **Montréal**. Le thème est alors faux (ascendant et
maisons dépendent de la longitude), et rien ne le signale.

**Impact rétention :** différé mais toxique. L'utilisateur qui connaît son
ascendant voit une valeur fausse et conclut que l'app est du bruit.

### 3.5 L'ascendant fabriqué — CRITIQUE pour la crédibilité

**Preuve :** `packages/shared/src/astrology/chart.ts:156-164` renvoie
`rising: null` sans heure de naissance. Mais le wrapper mobile substitue une
valeur en dur :

```ts
// apps/mobile/services/astrology.ts:125
placement(chart.rising, { sign: 'Aries', degree: 0, longitude: 0 })
```

L'étape 2 encourage explicitement à sauter l'heure (`birth-info.tsx:1086-1090`,
« Don't worry if you're not sure »). Tout utilisateur sans heure est donc
enregistré avec `profiles.rising_sign = 'Aries'` (`birth-info.tsx:769`) et la
révélation lui annonce « Rising: Aries — How others see you », sans avertissement.

**Impact rétention :** un utilisateur sur douze a réellement un ascendant
Bélier. Pour les onze autres qui vérifient ailleurs, la première information
personnalisée que JUNO leur donne est fausse.

**Aggravant — la même application donne les deux réponses.** L'aperçu
pré-signup, lui, gère le cas **correctement** :

```ts
// apps/mobile/app/welcome/preview.tsx:187
const rising = !time ? null : String(local.rising?.sign || '').toLowerCase();
```

`preview.tsx` appelle `calculateNatalChart` directement depuis le paquet
partagé et contourne donc le repli. Un même utilisateur sans heure de naissance
voit « pas d'ascendant » avant de s'inscrire, puis « Ascendant Bélier » après —
dans la même session, à quelques minutes d'écart.

La cause structurelle est qu'il existe **deux points d'entrée vers le moteur de
thème** : `welcome/preview.tsx` tape le paquet partagé en direct, l'onboarding
passe par `services/astrology.ts` et son repli. Corriger `astrology.ts:125` ne
suffit pas à garantir la cohérence — il faut un seul chemin.

**Vérification :**
```sql
select rising_sign, count(*) from profiles
 where birth_time is null group by 1;
-- attendu si le bug est actif : 'Aries' = 100 %
```

### 3.6 Le splash affiche l'ancienne marque — FAIBLE, mais gratuit à corriger

`app/index.tsx:138` : `<Text style={styles.eyebrow}>ASTRODATING</Text>` — en dur,
hors i18n. C'est le tout premier écran de chaque démarrage à froid, et il
affiche un nom de marque abandonné.

---

## 4. Où l'Aha moment est trop faible ou trop tardif

L'Aha moment existe et il est bien construit : `ChartRevealOverlay`
(`birth-info.tsx:225-300`), révélation en cascade Soleil → Lune → Ascendant.

Quatre faiblesses, par ordre de gravité.

### 4.1 Il est solitaire, alors que la thèse produit est relationnelle

La révélation parle de **vous**. Or JUNO se définit par la synastrie — la
relation entre deux thèmes. Le premier moment de valeur ne démontre donc pas la
proposition de valeur ; il démontre celle d'une app d'astrologie personnelle,
marché où JUNO n'a aucun avantage.

**Aha moment recommandé :** enchaîner la révélation personnelle sur **« voici
trois personnes dont le thème résonne avec le tien, et pourquoi »**, avec la
raison astrologique affichée. Le moteur existe (`services/lib/synastry.ts`,
refondu en v2 au commit `7f49a1b` : orbes, planètes externes, plafond de
confiance, 135 tests). Il n'est simplement pas branché sur l'atterrissage.

### 4.2 Il est vécu deux fois, et la deuxième fois il est plus pauvre

Voir §2.2. La deuxième révélation n'apporte rien de neuf après l'aperçu
pré-signup — elle arrive juste après deux écrans de redite.

### 4.3 Il est séparé de l'intention par un mur email

Voir §3.1.

### 4.4 Il peut être faux

Voir §3.5 (ascendant Bélier) et §3.4 (ville → Montréal).

---

## 5. Empty states détectés

| Écran | Fichier | État | Problème | Correction |
|---|---|---|---|---|
| Discover vide | `(tabs)/discover.tsx:540-552` | `EmptyState` partagé | Refresh relance le même filtre ; pastilles hors d'atteinte | Rendre les pastilles **dans** l'état vide + CTA « Voir toutes les intentions » |
| Fin de deck | `discover.tsx:555-630` | custom | `${n} profiles seen` en anglais en dur (`:623-625`) | Passer par i18n ; proposer une action de repli |
| Conversations vide | `(tabs)/chat.tsx:242-251` | `EmptyState` partagé | **Aucun — c'est le meilleur état vide de l'app** | Le prendre comme modèle |
| Fil de discussion vide | `chat/[id].tsx:486-515` | custom | Masque aussi les **échecs de chargement** : erreur et vide affichent le même « Start the conversation » | Distinguer erreur et vide |
| Premium (gratuit) | `(tabs)/premium.tsx:104` | paywall | Aperçu de compatibilité **fictif** (§7.3) | Brancher sur le thème réel |
| Profil illisible | `(tabs)/profile.tsx:248-287` | custom | Version web en anglais en dur ; erreur et absence confondues | i18n + distinguer |
| Natal chart refusé | `PremiumGate.tsx` | copie par raison | Correct depuis le correctif free preview | — |

**Le bon modèle existe déjà dans le repo.** `(tabs)/chat.tsx:242-251` :

```tsx
<EmptyState
  title={t('emptyChatTitle') || 'No conversations yet'}
  subtitle={t('emptyChatSubtitle') || 'Start with a profile, a prompt, or an icebreaker. The first message is free.'}
  actionLabel={t('emptyChatCta') || 'Discover people'}
  onAction={() => router.push('/(tabs)/discover')}
/>
```

Il nomme la valeur, il lève l'objection prix (« The first message is free »), et
il offre une sortie. Les composants partagés sont dans
`components/ScreenStates.tsx` (`LoadingState`, `ErrorState`, `EmptyState`) —
seuls `discover.tsx` et `chat.tsx` les utilisent ; les autres écrans
réimplémentent à la main, d'où les incohérences ci-dessus.

### Contenu initial : rendre l'app vivante à la première ouverture

Le levier le plus rentable n'est pas un nouvel écran, c'est **de réparer les 60
profils de seed** :

1. **Des photos.** Aucune n'est insérée aujourd'hui. Une même photo de femme sur
   60 profils, hommes compris, est le signal le plus fort possible que l'app est
   vide.
2. **Des intentions variées.** Tous en `['love']`, ce qui crée le piège de
   filtre (§3.3) *et* rend deux des trois onglets d'intention mensongers.
3. **Une raison astrologique par carte.** Le moteur de synastrie v2 est là et
   testé ; afficher « Ta Lune en Cancer et sa Vénus en Scorpion » transforme un
   deck générique en démonstration de la thèse produit.

---

## 6. Audit emails / push / lifecycle

### 6.1 Emails — état des lieux

| Template | Déclencheur | Statut | Défaut |
|---|---|---|---|
| `welcome` | trigger sur `auth.users` INSERT | **ACTIF** | aucun lien ; `privacy@astrodatingapp.com` (domaine hérité) |
| `onboarding_day1` | `onboarding_completed` → true, +24 h | **INERTE** (pas de cron) | aucun lien |
| `onboarding_day3` | idem, +72 h | **INERTE** | aucun lien ; « Start swiping » contredit le positionnement |
| `onboarding_day5` | idem, +120 h | **INERTE** | aucun lien ; **annonce un essai de 7 j inexistant** |

#### Défaut n° 1 — aucun lien, nulle part

Vérifié : `grep -c '<a href' send-email/index.ts` → **0**. `renderEmailShell`
(`:21-79`) n'a pas de paramètre bouton. Les templates passent uniquement des
`<p>`. La ligne d'appel à l'action est du texte mort :

```
'Open JUNO to explore your full chart. You can manage email preferences in Settings > Notifications.'
```

#### Défaut n° 2 — aucun désabonnement, et une promesse fausse

Le footer promet « manage email preferences in Settings > Notifications ». Or
`send-email/index.ts:268` **sélectionne** `notification_preferences`… et ne s'en
sert jamais. Aucune branche du code ne lit cette valeur. Il n'y a donc :

- aucun lien de désabonnement dans l'email,
- aucun respect de la préférence si l'utilisateur la change dans l'app.

**Ce n'est pas seulement un défaut produit.** L'expéditeur est au Québec ; la
**LCAP / CASL** exige un mécanisme d'exclusion fonctionnel dans **tout** message
électronique commercial, et l'adresse postale de l'expéditeur. Ouvrir la vanne
des emails programmés sans corriger ce point augmente une exposition
réglementaire réelle, en plus du risque de plaintes pour spam qui dégraderait la
délivrabilité du domaine.

#### Défaut n° 3 — le faux essai de Day 5

Voir §1. Vérification exhaustive effectuée : aucune notion d'essai de 7 jours
n'existe côté serveur. Les seules occurrences de « 7-day » dans `supabase/`
concernent la fenêtre de grâce de suppression de compte. Côté client,
`PremiumGate.tsx:259` et `PaywallModal.tsx:146` affichent bien « Start 7-Day
Free Trial » — mais c'est de la copie qui renvoie vers la boutique ;
l'entitlement réel vient de RevenueCat / Stripe, **et rien ne démarre d'essai à
l'inscription**.

#### Défaut n° 4 — aucune condition d'annulation

`schedule_onboarding_emails` (`20260329000002:33-81`) insère trois lignes et ne
prévoit **aucune** annulation. Le dispatcher n'annule que dans un seul cas :
profil sans email (`send-scheduled-emails/index.ts:70-76`).

Conséquence : l'email « ton essai se termine » part vers les abonnés payants,
l'email « ton thème t'attend » part vers ceux qui l'ont déjà consulté dix fois,
et rien ne s'arrête quand l'utilisateur est revenu.

#### Défaut n° 5 — l'expéditeur est en transition, non vérifiée

`send-email/index.ts:9-10` a été basculé sur `noreply@junosynastry.com` dans
l'arbre de travail (non commité). Le commentaire d'origine dans
`apps/web/.env.example` disait explicitement de rester sur `astrodatingapp.com`
tant que l'authentification email de `junosynastry.com` n'est pas provisionnée.

**[À VÉRIFIER] : SPF / DKIM / domaine vérifié dans Resend pour
`junosynastry.com`.** Si ce n'est pas fait, déployer la fonction casse *tout*
l'email transactionnel, y compris la vérification de compte — donc l'inscription
elle-même.

### 6.2 Push — état des lieux

| Mécanisme | Fichier | Statut | Défaut |
|---|---|---|---|
| Horoscope quotidien | `send-daily-horoscope/index.ts` | **INERTE** | préférence par défaut `false` (`full_schema.sql:147`) → 0 destinataire |
| Nouveau message | trigger `notify_new_message` | **ACTIF** | dépend d'un tiers qui écrit |
| Match / like | `notify_new_match` | **ACTIF** | — |
| Badge d'icône | — | **absent** | `setBadgeCountAsync` n'est appelé nulle part |
| Streak / progression | — | **absent** | rien dans le code |

Le cron `daily-horoscope-push` tourne bien chaque jour à 12:00 UTC
(`20260419000005_rotate_cron_secrets.sql:103-105`) et journalise
`0 eligible users out of N`. La migration `20260824000001` corrige le défaut
**pour les nouveaux comptes uniquement** — le backfill des comptes existants est
laissé de côté, à juste titre : c'est une décision de consentement.

#### Le routage du push est correct — contrairement à ce que suggère la charge utile

`send-daily-horoscope/index.ts:181` envoie `data: { type: "dailyHoroscope",
screen: "/(tabs)/premium" }`. Le champ `screen` pointe vers l'onglet paywall.

**Mais le client ignore `screen`** et route sur `type`
(`app/_layout.tsx:581-583`) :

```ts
case 'dailyHoroscope':
  router.push('/premium-screens/daily-horoscope');
```

La destination réelle est donc le bon écran. Le champ `screen` est du code mort
trompeur : à supprimer, sinon la prochaine personne qui implémentera un routage
générique enverra les utilisateurs sur le paywall.

#### Le contenu du push est le vrai problème

Voir §1, cause 3 : 5 tips par signe, rotation tous les 5 jours, ton dating
exclusif, promesse bannie (« soulmate »). Ce n'est pas une récompense variable,
c'est une répétition à période courte.

#### La permission est demandée trop tôt

Voir §1, cause 2. `_layout.tsx:482-496`. C'est le défaut le plus rentable à
corriger de tout ce chapitre : 30 minutes de travail, portée totale, et c'est
un **prérequis** pour que la migration J+1 produise le moindre effet côté push.

### 6.3 Deep links — le maillon manquant

**Le handler de deep link valide l'URL puis ne route nulle part.**

`app/_layout.tsx:365-415` : le code vérifie le protocole, l'hôte (allowlist), le
chemin (`ALLOWED_DEEP_LINK_PATHS`), détecte `type=recovery`… puis se termine sur

```ts
// Password recovery handled by Supabase auth state change
} catch {
```

Il n'y a **aucun `router.push`**. Un lien `https://app.junosynastry.com/app/...`
ouvre donc l'application sur sa route par défaut (Discover), jamais sur l'écran
visé.

Deux conséquences pour la conception du lifecycle :

1. **Les CTA email ne peuvent pas viser un écran précis dans l'app aujourd'hui.**
   Ils doivent viser une URL qui fonctionne en l'état — `https://app.junosynastry.com/app`
   — qui ouvre l'app sur Android (App Link vérifié) et la PWA ailleurs. C'est
   très largement suffisant pour commencer, et infiniment mieux que zéro lien.
2. **Le routage par chemin est un P1 qui exige un build.** À faire avec les
   autres corrections mobiles.

**Piège latent à connaître :** `ALLOWED_DEEP_LINK_PATHS` (`_layout.tsx:363`)
contient `'/app/'` **avec barre oblique finale**, alors que le filtre d'intention
Android déclare `pathPrefix: "/app"` **sans** (`app.json:58`). L'URL
`https://app.junosynastry.com/app` ouvrira donc l'app mais échouera au test
`startsWith('/app/')`. Sans effet aujourd'hui (le handler ne route pas), mais
c'est exactement le genre de détail qui fera échouer le routage dès qu'il sera
écrit.

Côté web, les cibles existent : `apps/web/src/app/[locale]/app/` contient
`discover`, `chat`, `premium`, `profile`, `plans`, `settings`, `setup`. Le
middleware réécrit `/app` vers `/${defaultLocale}/app`
(`apps/web/src/middleware.ts:33`), donc l'URL sans locale fonctionne.

### 6.4 Séquence lifecycle recommandée

Principe directeur : **chaque message a une condition d'annulation, et aucun ne
part si l'utilisateur est déjà revenu.**

Cela impose une dépendance qu'il faut énoncer clairement :

> **`profiles.last_active` n'est écrit nulle part.** La seule occurrence dans le
> code est un `SELECT` (`app/chat/[id].tsx:150`). Tant qu'il n'est pas écrit,
> aucun message au-delà de J+1 ne peut être conditionné au retour de
> l'utilisateur — la séquence enverra à tout le monde, y compris aux actifs.

`last_active` n'est donc pas une commodité analytique : c'est le **prérequis
bloquant du lifecycle**. Il est classé P0 pour cette raison.

#### La séquence

| # | Quand | Déclencheur exact | Audience | Objectif |
|---|---|---|---|---|
| A | H+2 | `auth.users.created_at + 2 h` ET `onboarding_completed = false` | onboarding abandonné | terminer le thème |
| B | H+6 | `onboarding_completed_at + 6 h` ET aucune session depuis | thème vu, puis parti | revenir sur une info neuve |
| C | J+1 | `onboarding_completed_at + 24 h` | tous | l'insight du jour, pas le thème générique |
| D | J+2 | `+48 h` ET `last_active < onboarding_completed_at + 2 h` | dormants | une personne compatible, nommée |
| E | J+3 | `+72 h` | tous | expliquer la synastrie (existant, à réécrire) |
| F | J+5 | `+120 h` ET `tier = 'free'` ET ≥1 aperçu consommé | gratuits engagés | valeur premium, **sans faux essai** |
| G | J+7 | `+168 h` ET `last_active < now() - 5 j` | dormants | reconquête |
| H | J+14 | `+336 h` ET `last_active < now() - 10 j` | perdus | dernier contact + désabonnement en clair |

#### Spécification message par message

---

**A — H+2 · Onboarding abandonné**

- **Déclencheur :** `created_at + 2 h`, planifié à l'inscription (nouveau trigger sur `auth.users`).
- **Audience :** compte créé, `onboarding_completed = false`.
- **Objectif :** récupérer un abandon à chaud, quand l'intention est encore présente.
- **Sujet :** `Ton thème est à deux questions d'être complet`
- **Corps :** « Tu as donné ta date de naissance. Il manque deux réponses pour calculer ta Lune et ton Ascendant — la partie qui explique comment tu ressens les choses, et comment les autres te perçoivent. Deux minutes. »
- **CTA :** `Terminer mon thème`
- **Deep link :** `https://app.junosynastry.com/app?e={id}`
- **Condition d'envoi :** `onboarding_completed = false` **au moment de l'envoi** (revérifiée par le dispatcher, pas seulement à la planification).
- **Condition d'annulation :** `onboarding_completed` passe à `true` → statut `cancelled`.

---

**B — H+6 · Thème vu, puis départ**

- **Déclencheur :** `onboarding_completed_at + 6 h`.
- **Audience :** onboarding terminé, `last_active < onboarding_completed_at + 2 h`.
- **Objectif :** transformer une révélation solitaire en promesse relationnelle.
- **Sujet :** `{Prénom}, ton {signe solaire} croise trois thèmes ce soir`
- **Corps :** « Ton thème est calculé. Ce qu'il devient intéressant, c'est en face d'un autre : trois personnes dont les placements résonnent avec les tiens t'attendent, avec la raison astrologique affichée. »
- **CTA :** `Voir qui résonne`
- **Deep link :** `https://app.junosynastry.com/app?e={id}`
- **Condition d'envoi :** aucune session depuis la fin de l'onboarding.
- **Condition d'annulation :** `last_active` postérieur à `onboarding_completed_at + 2 h`.

---

**C — J+1 · L'insight du jour**

Remplace `onboarding_day1`. Le défaut du template actuel n'est pas seulement le
lien manquant : il annonce « ton thème est prêt » alors que l'utilisateur l'a vu
la veille à l'écran. Il n'apporte aucune information neuve.

- **Déclencheur :** `onboarding_completed_at + 24 h`.
- **Audience :** tous ceux qui ont terminé l'onboarding.
- **Objectif :** livrer une information **que l'utilisateur n'a pas encore vue**.
- **Sujet :** `Ta Lune en {signe lunaire} explique cette habitude`
- **Corps :** un paragraphe **spécifique au placement lunaire réel** (déjà en base, `profiles.moon_sign`), pas un texte générique. Puis : « Ton thème complet contient neuf autres placements de ce type. »
- **CTA :** `Lire mon thème complet`
- **Deep link :** `https://app.junosynastry.com/app?e={id}`
- **Condition d'envoi :** `moon_sign IS NOT NULL`. Sinon, repli sur le signe solaire.
- **Condition d'annulation :** compte supprimé, ou désabonnement.

> Note : ce message nécessite un texte par signe lunaire (12 paragraphes). C'est
> exactement le type de contenu que `marketingagent/` sait produire, avec le ton
> de marque et les promesses bannies déjà encodés.

---

**D — J+2 · Une personne, nommée**

C'est le message que la séquence actuelle n'a pas du tout, et c'est le moment
où le décrochage se produit.

- **Déclencheur :** `onboarding_completed_at + 48 h`.
- **Audience :** `last_active < onboarding_completed_at + 2 h` (jamais revenu).
- **Objectif :** montrer une correspondance concrète, pas une catégorie.
- **Sujet :** `{Prénom}, Camille et toi partagez un trigone Vénus–Mars`
- **Corps :** un profil réel, une raison astrologique réelle, une phrase de ce que cet aspect signifie. « Le premier message est gratuit. »
- **CTA :** `Voir son thème`
- **Deep link :** `https://app.junosynastry.com/app?e={id}`
- **Condition d'envoi :** au moins un profil découvrable avec un aspect de synastrie calculable. Sinon, ne pas envoyer — un email vide est pire que pas d'email.
- **Condition d'annulation :** retour de l'utilisateur, ou conversation déjà ouverte.

---

**E — J+3 · Comment la synastrie fonctionne**

Réécriture de `onboarding_day3`. Le template actuel est correct sur le fond
(conjonctions, trigones, carrés, oppositions) mais se termine par **« Start
swiping »** — le seul geste que le positionnement JUNO rejette explicitement.

- **Déclencheur :** `onboarding_completed_at + 72 h`.
- **Audience :** tous.
- **Objectif :** installer le vocabulaire ; c'est le contenu qui différencie JUNO.
- **Sujet :** `Pourquoi deux Balances peuvent ne pas s'entendre`
- **Corps :** conserver le corps existant, remplacer la troisième puce par une invitation à comparer deux thèmes.
- **CTA :** `Comparer deux thèmes`
- **Deep link :** `https://app.junosynastry.com/app?e={id}`
- **Condition d'annulation :** désabonnement.

---

**F — J+5 · La valeur premium, sans mensonge**

Réécriture complète de `onboarding_day5`. **Supprimer toute mention d'essai.**

- **Déclencheur :** `onboarding_completed_at + 120 h`.
- **Audience :** `tier = 'free'` **et** au moins un aperçu gratuit consommé (`premium_usage`). Un utilisateur qui n'a jamais touché une fonctionnalité premium n'a aucune raison de recevoir un argumentaire premium.
- **Objectif :** convertir un usage démontré.
- **Sujet :** `Tu as regardé ton thème 4 fois cette semaine`
- **Corps :** « Chaque jour, tu as droit à une lecture complète de ton thème natal. Tu es allé la chercher {n} fois. Celestial retire la limite et ouvre la synastrie détaillée. »
- **CTA :** `Voir les formules`
- **Deep link :** `https://app.junosynastry.com/app/plans?e={id}`
- **Condition d'envoi :** `tier = 'free'` ET `count(premium_usage) >= 1`, tous deux revérifiés à l'envoi.
- **Condition d'annulation :** l'utilisateur s'abonne → `cancelled`.

---

**G — J+7 · Reconquête**

- **Déclencheur :** `onboarding_completed_at + 168 h`.
- **Audience :** `last_active < now() - interval '5 days'`.
- **Objectif :** un dernier signal utile avant de réduire la fréquence.
- **Sujet :** `{n} personnes ont rejoint JUNO près de {ville} cette semaine`
- **Corps :** court, factuel, une raison concrète de rouvrir. Aucun ton culpabilisant.
- **CTA :** `Voir qui est nouveau`
- **Deep link :** `https://app.junosynastry.com/app?e={id}`
- **Condition d'envoi :** le compte de nouveaux profils est **réel et non nul**. Sinon ne pas envoyer.
- **Condition d'annulation :** retour de l'utilisateur.

---

**H — J+14 · Dernier contact**

- **Déclencheur :** `onboarding_completed_at + 336 h`.
- **Audience :** `last_active < now() - interval '10 days'`.
- **Objectif :** un dernier essai, puis silence. Protège la délivrabilité.
- **Sujet :** `Ton thème reste là si tu reviens`
- **Corps :** deux phrases. Pas d'argumentaire. Le lien de désabonnement est **mis en avant**, pas caché en pied de page.
- **CTA :** `Rouvrir JUNO`
- **Deep link :** `https://app.junosynastry.com/app?e={id}`
- **Condition d'annulation :** retour de l'utilisateur.
- **Après ce message :** ne plus rien envoyer d'automatisé à ce compte.

### 6.5 Opportunités événementielles (hors séquence temporelle)

Ces messages se déclenchent sur un fait, pas sur une horloge. Ils sont
généralement plus performants que le drip, et deux d'entre eux ont déjà leur
infrastructure en place.

| Événement | Message | Infrastructure |
|---|---|---|
| Quelqu'un écrit le premier | push + email si non lu sous 4 h | trigger `notify_new_message` **existe** |
| Aperçu gratuit épuisé | « ton aperçu revient demain » — transforme un refus en rendez-vous | `enforce_premium_feature` renvoie déjà `free_preview_exhausted` |
| Profil complété à 100 % | jalon célébré | `(tabs)/profile.tsx:224-237` calcule déjà la complétion |
| Parrainage accepté | les deux parties notifiées | `claim-referral` **existe** (30 j premium pour les deux) |
| Ville renseignée, 5 nouveaux profils | digest hebdomadaire local | à construire |

Le cas **« aperçu gratuit épuisé »** est le plus élégant : le serveur connaît
déjà le motif exact (`free_preview_exhausted`), et « reviens demain » est un
déclencheur J+1 naturel, mérité, non intrusif — l'inverse d'une notification
poussée.

Le **parrainage** est complètement enterré : 30 jours de premium pour les deux
parties (`claim-referral/index.ts:7`), surfacé uniquement dans
`app/settings/index.tsx:249-330`, atteignable via Profil → Réglages. Aucune
invitation nulle part ailleurs.

---

## 7. Audit premium / free preview

### 7.1 Le paywall n'est pas la cause du décrochage

| Ce qu'un compte gratuit peut faire | Limite | Preuve |
|---|---|---|
| Parcourir Discover | illimité | aucun gate dans `discover.tsx` |
| **Envoyer un message** | **illimité** | `discover.tsx:918-938`, aucun gate |
| Ouvrir une conversation | illimité | `handleStartConversation:430-445` |
| Thème natal complet | 1 / jour | gate serveur, `free_preview_quota = 1` |
| Synastrie | 1 / jour | `consumeTrial`, chemin client |
| Horoscope du jour | 1 / jour | `consumeTrial`, chemin client |

La messagerie — le geste qui crée la rétention — est **entièrement gratuite**.
C'est le bon choix produit, et il est correctement implémenté.

### 7.2 Deux systèmes de quota coexistent

Depuis le correctif du free preview, il y a deux chemins :

- **Chemin serveur** — `SERVER_ENFORCED_FEATURES` (`services/premiumUsage.ts`)
  ne contient qu'une entrée : `'natal-chart' → 'natal_chart'`. Seule
  `natal_chart` a `free_preview_quota = 1`
  (`20260823000001_free_preview_quota.sql:53-56`).
- **Chemin client hérité** — toutes les autres fonctionnalités passent par
  `consumeTrial` (`contexts/PremiumContext.tsx:286-308`), qui lit
  `getFeatureUsageToday` puis appelle le RPC `increment_feature_usage`.

**Vérification faite :** le chemin hérité n'est **pas** cassé par la fermeture
RLS de la migration. `incrementFeatureUsage` passe par le RPC
`increment_feature_usage`, `SECURITY DEFINER`, dont le `GRANT ... TO
authenticated` est toujours en place (`full_schema.sql:620`,
`20260419000002_rpc_auth_guards.sql:260`). L'écriture directe a été retirée, et
c'était bien du code mort. Pas de régression.

Reste que **deux systèmes de quota pour le même produit** est une dette qui
finira par diverger. À solder en migrant les fonctionnalités une par une vers
`free_preview_quota`, comme documenté dans `docs/premium-free-preview.md`.

### 7.3 L'aperçu du paywall est fabriqué

`(tabs)/premium.tsx:224-246` : les barres « Ta compatibilité » — Soleil 78 %,
Lune 65 %, Ascendant 85 % — sont des **littéraux codés en dur** :

```tsx
<View style={[styles.previewBarFill, { width: '78%' }]} />
```

L'utilisateur a son thème réel en base. Lui montrer des chiffres inventés à
l'endroit précis où on lui demande de payer est le pire endroit possible pour
une donnée fausse.

### 7.4 Le paywall arrive-t-il trop tôt ?

Non. Il arrive **au bon endroit** (une fonctionnalité premium précise) et
**après** un aperçu gratuit. Le vrai défaut est ailleurs : le paywall est le
seul écran de l'app qui explique ce que JUNO fait de particulier — synastrie
détaillée, transits, thème complet. Un utilisateur gratuit qui ne touche jamais
une fonctionnalité premium ne rencontre jamais cette explication.

**Recommandation :** ne pas durcir le paywall, mais **déplacer sa pédagogie en
amont**, dans les états vides et l'atterrissage post-révélation.

### 7.5 Le premium peut-il nuire à la rétention J+0 / J+1 ?

Un seul point : l'onglet **Premium** est l'un des quatre onglets visibles, et
pour un compte gratuit il affiche un paywall (`(tabs)/premium.tsx:104`). Un
quart de la navigation principale est donc, pour la majorité des utilisateurs,
une page de vente.

Ce n'est pas critique — le contenu montre la valeur avant le prix — mais c'est
un onglet qui pourrait porter la boucle d'habitude (horoscope du jour, insight
du thème) au lieu de porter la conversion.

---

## 8. Plan analytics

### 8.1 État actuel : zéro

- **Aucune librairie d'analytics.** Vérifié : ni PostHog, ni Amplitude, ni
  Mixpanel, ni Segment, ni Firebase dans `apps/mobile/package.json`.
- **Sentry uniquement**, pour les crashs (`app/_layout.tsx:41-65`), en production
  et hors web. Zéro `addBreadcrumb`, `setTag`, `setContext`.
- **L'identifiant utilisateur Sentry est haché** (`_layout.tsx:425-433`) — les
  données Sentry ne peuvent donc **pas** être rattachées à un compte Supabase.
- **Aucune table d'événements.** Les seules vues KPI
  (`20260326000002_add_kpi_views.sql`) couvrent la facturation et les promos.
- **`profiles.last_active` n'est jamais écrit.**

### 8.2 La contrainte qui structure tout le plan

**Il n'y a pas d'OTA.** `expo-updates` est absent de `apps/mobile/package.json`.
Tout événement côté client exige donc **un build complet et une soumission
Play**. Cela impose de séparer nettement ce qui est mesurable sans build de ce
qui ne l'est pas.

### 8.3 Ce qui est déjà mesurable aujourd'hui, sans une ligne de code

| Événement | Source | Requête |
|---|---|---|
| `signup_started` | — | non mesurable |
| `signup_completed` | `auth.users.created_at` | `select date_trunc('day', created_at), count(*) from auth.users group by 1` |
| `email_verified` | `auth.users.email_confirmed_at` | délai médian signup → confirmation |
| `onboarding_completed` | **proxy** : `scheduled_emails.created_at where template='onboarding_day1'` | inséré exactement au passage à `true` |
| `email_scheduled` | `scheduled_emails` INSERT | par template |
| `email_sent` | `scheduled_emails.status='sent'` | — |
| `trial_preview_consumed` | `premium_usage` | par `feature_key` et `usage_date` |
| `subscription_started` | `subscription_events` | — |
| `first_message_sent` | `messages.created_at` | premier message par utilisateur |

Le proxy d'onboarding mérite d'être souligné : **il n'existe pas de colonne
`onboarding_completed_at`**. La ligne `scheduled_emails` du J+1 est le seul
horodatage d'activation exploitable aujourd'hui. Ajouter la vraie colonne est
une migration triviale et devrait être faite — mais en attendant, la mesure est
possible.

> **Le funnel signup → activation est donc mesurable dès aujourd'hui, en SQL,
> sans build.** C'est le premier chiffre à aller chercher : il dira si le
> décrochage est avant ou après l'onboarding, ce qui change complètement les
> priorités.

```sql
-- Funnel signup → activation, dès maintenant
with s as (select id, created_at, email_confirmed_at from auth.users),
     a as (select user_id, min(created_at) as activated_at
             from scheduled_emails where template = 'onboarding_day1'
            group by 1)
select date_trunc('week', s.created_at)                          as cohorte,
       count(*)                                                  as inscrits,
       count(s.email_confirmed_at)                               as verifies,
       count(a.activated_at)                                     as actives,
       round(100.0 * count(a.activated_at) / nullif(count(*),0), 1) as taux_activation
  from s left join a on a.user_id = s.id
 group by 1 order by 1 desc;
```

### 8.4 Les 18 événements demandés

Socle proposé : une table `product_events` (`user_id`, `name`, `props jsonb`,
`created_at`) + un `services/analytics.ts` minimal en écriture par lots. Motif
délibéré : pas de SDK tiers, pas de revue de confidentialité supplémentaire,
pas de fuite de PII vers un tiers — et les jointures avec `profiles` et
`premium_usage` restent en SQL.

| # | Événement | Où le déclencher | Propriétés | Pourquoi | Ce qu'il diagnostique |
|---|---|---|---|---|---|
| 1 | `signup_started` | `auth/signup.tsx`, soumission | `from_welcome_draft` | seul point où le formulaire est vu | friction du formulaire vs du mur email |
| 2 | `signup_completed` | déjà en base | — | référence du funnel | — |
| 3 | `onboarding_started` | `birth-info.tsx:485`, montage | `draft_restored`, `start_step` | mesure la redite §2.2 | combien re-parcourent 2 écrans |
| 4 | `onboarding_step_completed` | `birth-info.tsx:623,630,643` | `step`, `duration_ms` | granularité par étape | **quelle étape précise perd les gens** |
| 5 | `birth_info_completed` | `birth-info.tsx:757` | `time_known`, `city_typed`, `city_fallback` | qualité des données | portée réelle du repli Montréal (§3.4) |
| 6 | `natal_chart_generated` | `birth-info.tsx:786` | `confidence`, `rising_real` | qualité du thème | **portée réelle du bug Bélier (§3.5)** |
| 7 | `first_value_seen` | `birth-info.tsx:794`, fin de `ChartRevealOverlay` | `seconds_since_signup` | **l'Aha moment** | délai intention → récompense |
| 8 | `discover_viewed` | `(tabs)/discover.tsx`, montage | `profile_count`, `intention_filter` | premier écran post-Aha | — |
| 9 | `discover_empty_seen` | `discover.tsx:540` | `intention_filter`, `is_trap` | **prioritaire** | quantifie le piège de filtre (§3.3) |
| 10 | `profile_viewed` | `profile/[id].tsx`, montage | `position`, `source` | engagement Discover | le deck est-il parcouru ou abandonné |
| 11 | `synastry_viewed` | `premium-screens/synastry.tsx` | `was_free_preview`, `score` | cœur de la thèse produit | combien touchent la valeur centrale |
| 12 | `premium_gate_seen` | `PremiumGate.tsx:129` | `feature`, `reason` | rencontre du paywall | à quel moment du cycle de vie |
| 13 | `trial_preview_consumed` | `PremiumGate.tsx` + `premium_usage` | `feature`, `count_today` | aperçu gratuit consommé | l'aperçu crée-t-il une habitude |
| 14 | `email_scheduled` | déjà en base | — | — | — |
| 15 | `email_sent` | déjà en base | — | — | — |
| 16 | `email_clicked` | **web** : `[locale]/app/page.tsx`, param `?e=` | `scheduled_email_id`, `template` | **efficacité du lifecycle** | mesurable **sans build mobile** |
| 17 | `app_open_day1` | `_layout.tsx`, `AppState` → active | `days_since_signup` | rétention J+1 | la métrique nord |
| 18 | `app_open_day2` / `day7` | idem, dérivés | `days_since_signup` | rétention J+2 / J+7 | courbe de rétention |

**Deux remarques sur ce tableau.**

`email_clicked` (n° 16) est le seul événement client qui se mesure **sans build
mobile** : les CTA portent `?e={scheduled_email_id}`, la page web
`/[locale]/app` enregistre le passage. Un déploiement Vercel suffit. Cela permet
de mesurer l'efficacité de la séquence email dès sa mise en service, sans
attendre la soumission Play.

Les événements 17 et 18 se réduisent tous les deux à **une seule écriture** :
`profiles.last_active` au passage au premier plan. Le hook `AppState` existe
déjà (`_layout.tsx:449`) — il suffit d'y ajouter un `update`. Une ligne, et
J+1 / J+2 / J+7 / DAU deviennent calculables en SQL, rétroactivement à partir du
jour de déploiement.

### 8.5 Ordre d'implémentation

1. **Sans build ni déploiement :** exécuter la requête de funnel §8.3. *Aujourd'hui.*
2. **Déploiement web seul :** `email_clicked` via `?e=`.
3. **Premier build mobile :** `last_active` (n° 17/18) + `discover_empty_seen`
   (n° 9) + `natal_chart_generated` (n° 6). Trois événements qui répondent
   chacun à une question ouverte de cet audit.
4. **Build suivant :** le reste.

---

## 9. Plan d'action priorisé

Chaque action porte : objectif, fichiers, logique produit, risques, critères
d'acceptation, test.

### P0 — immédiat, 0–1 jour

---

**P0-1 · Réparer les emails avant d'ouvrir la vanne**

- **Objectif :** rendre les quatre emails capables de ramener quelqu'un, et légaux.
- **Fichiers :** `supabase/functions/send-email/index.ts` **uniquement**.
- **Logique produit :**
  1. Ajouter un paramètre `ctaLabel` / `ctaUrl` à `renderEmailShell`, rendu en bouton HTML sur table (compatible Outlook).
  2. Ajouter un pied de page avec **lien de désabonnement** et **adresse postale** de l'expéditeur.
  3. Honorer réellement `notification_preferences` — la valeur est déjà lue (`:268`), il suffit de s'en servir pour renvoyer `{ skipped: true }`.
  4. **Supprimer toute mention d'essai de 7 jours** dans `onboarding_day5` ; réécrire selon §6.4-F.
  5. Remplacer `privacy@astrodatingapp.com` (`:102`) par l'adresse JUNO.
  6. Remplacer « Start swiping » (`:151`) par une formulation conforme au positionnement.
- **Risques :**
  - **Expéditeur non vérifié.** Si `junosynastry.com` n'est pas authentifié dans Resend, ce déploiement casse *tout* l'email transactionnel, **y compris la vérification de compte** — donc l'inscription. **Vérifier avant de déployer.** Repli : garder `EMAIL_FROM` sur l'ancien domaine via variable d'environnement.
  - Un email mal formé ne se rattrape pas.
- **Critères d'acceptation :**
  - [ ] `grep -c '<a href' send-email/index.ts` ≥ 5
  - [ ] Aucune occurrence de `trial` dans `onboarding_day5`
  - [ ] Aucune occurrence de `astrodatingapp` dans le fichier
  - [ ] Chaque template contient un lien de désabonnement
  - [ ] Un profil avec `notification_preferences.promotions = false` renvoie `{ skipped: true }` pour les templates marketing
- **Test :** appeler la fonction en local pour les 4 templates, ouvrir le HTML dans un navigateur, cliquer chaque lien. Puis un envoi réel vers une adresse de test avant tout déploiement.

---

**P0-2 · Écrire `profiles.last_active`**

- **Objectif :** débloquer la mesure de rétention **et** les conditions d'annulation du lifecycle.
- **Fichiers :** `apps/mobile/app/_layout.tsx` (hook `AppState` existant, `:449`).
- **Logique produit :** au passage à `active`, si l'utilisateur est connecté, `update profiles set last_active = now() where id = auth.uid()`. Débounce à 5 minutes pour ne pas écrire à chaque bascule.
- **Risques :** une écriture par ouverture. Négligeable au volume actuel. Vérifier que la policy RLS `profiles` autorise l'`update` de sa propre ligne.
- **Critères d'acceptation :**
  - [ ] `last_active` est renseigné après une ouverture
  - [ ] Deux ouvertures à moins de 5 min ne produisent qu'une écriture
  - [ ] Aucune écriture pour un utilisateur déconnecté
- **Test :** `select count(*) from profiles where last_active > now() - interval '1 day';` doit croître.

---

**P0-3 · Déplacer la demande de permission push**

- **Objectif :** demander la permission quand elle a une raison d'être accordée.
- **Fichiers :** `apps/mobile/app/_layout.tsx:482-496`, `app/onboarding/birth-info.tsx` (après `ChartRevealOverlay`).
- **Logique produit :** retirer l'appel du `useEffect` sur `[user]`. Le déclencher après la révélation du thème, précédé d'un écran de contexte (« pré-permission ») qui explique ce que l'utilisateur recevra. Pour les comptes existants déjà autorisés, `getPermissionsAsync` renvoie `granted` et le token se réenregistre sans dialogue.
- **Risques :** un utilisateur qui n'atteint jamais la fin de l'onboarding n'aura pas de token — c'est voulu, il n'aurait rien reçu d'utile de toute façon.
- **Critères d'acceptation :**
  - [ ] Aucune boîte de dialogue système avant la révélation du thème
  - [ ] Le token est enregistré après acceptation
  - [ ] Un utilisateur déjà autorisé ne revoit jamais l'écran de contexte
- **Test :** installation propre sur Android 13+, parcours complet ; vérifier `push_tokens`.

---

**P0-4 · Sortie de secours du filtre Discover**

- **Objectif :** supprimer le seul cul-de-sac sans issue de l'app.
- **Fichiers :** `apps/mobile/app/(tabs)/discover.tsx:540-552`.
- **Logique produit :** dans l'état vide, si `intentionFilter !== 'all'`, remplacer l'action « Refresh » par « Voir toutes les intentions » qui remet le filtre sur `all`. Adapter le sous-titre : « Personne avec cette intention pour l'instant. »
- **Risques :** aucun.
- **Critères d'acceptation :**
  - [ ] Filtre « Friendship » → état vide → l'action ramène le deck complet
  - [ ] Avec `all`, le comportement Refresh est inchangé
- **Test :** Maestro — ajouter un scénario au `.maestro/`.

---

**P0-5 · Appliquer la migration J+1 — *après* P0-1**

- **Objectif :** ouvrir la vanne, une fois qu'elle mène quelque part.
- **Fichiers :** `supabase/migrations/20260824000001_restore_d1_return_loop.sql` (existe déjà).
- **Ordre :** **impérativement après P0-1.** L'inverse consomme la réputation d'expéditeur avec des emails sans lien.
- **Risques :**
  - **Rafale de rattrapage.** Toutes les lignes `pending` accumulées partent au premier passage. **Compter avant**, et marquer `cancelled` tout ce qui a plus de 7 jours de retard — un email « ton thème est prêt » reçu trois semaines après l'inscription est du spam.
  - `cron_scheduled_emails_secret` doit exister dans le vault et correspondre à `SCHEDULED_EMAILS_SECRET`.
- **Critères d'acceptation :**
  - [ ] `select jobname, schedule from cron.job where jobname='send-scheduled-emails';` renvoie une ligne
  - [ ] Sous 15 min, des lignes passent `pending` → `sent`
  - [ ] Aucune ligne de plus de 7 jours n'est envoyée
- **Test :**
  ```sql
  -- AVANT : mesurer la dette
  select template, count(*), min(scheduled_for)
    from scheduled_emails where status='pending' group by 1;
  -- Purger le passé lointain
  update scheduled_emails set status='cancelled'
   where status='pending' and scheduled_for < now() - interval '7 days';
  ```

---

### P1 — 1 à 3 jours

**P1-1 · Sauter les étapes d'onboarding déjà remplies** — `birth-info.tsx:395,527-545`.
Si le brouillon contient date + (heure ou `timeUnknown`) + ville, démarrer à
`step = 3`. **Acceptation :** un utilisateur venu de /welcome ne voit que 2
écrans post-signup.

**P1-2 · Afficher l'aperçu de thème sur l'écran de vérification email** —
`auth/verify-email.tsx`. Les données sont déjà dans le brouillon pré-signup ;
aucun appel réseau. Transforme une attente vide en attente porteuse.

**P1-3 · Supprimer le repli « Bélier », et unifier les deux chemins de calcul** —
`services/astrology.ts:125`. Afficher « Ascendant : heure de naissance requise »
avec un lien pour l'ajouter. Faire passer `welcome/preview.tsx` et l'onboarding
par **le même** point d'entrée, faute de quoi la divergence reviendra (§3.5).
**Risque :** les comptes déjà enregistrés avec un faux `rising_sign` restent
faux ; prévoir un backfill `null` conditionné à `birth_time is null`.

**P1-4 · Photos et intentions variées sur les 60 profils de seed** — nouvelle
migration. Photos cohérentes avec le genre, `connection_intentions` réparties
sur les trois valeurs. Corrige à la fois §1-5 et la cause racine de P0-4.

**P1-5 · Implémenter le routage des deep links** — `_layout.tsx:404-415`.
Ajouter le `router.push` manquant, et corriger `'/app/'` → `'/app'` dans
`ALLOWED_DEEP_LINK_PATHS` (§6.3). Débloque les CTA email ciblés.

**P1-6 · Brancher l'aperçu du paywall sur le thème réel** —
`(tabs)/premium.tsx:224-246`.

**P1-7 · Retirer `is_verified` du calcul de complétion** —
`(tabs)/profile.tsx:224-237`. Aujourd'hui, atteindre 100 % exige de soumettre
une pièce d'identité : le jalon est inatteignable, donc il ne motive personne.

**P1-8 · Corriger le splash** — `app/index.tsx:138`, `ASTRODATING` → i18n.

**P1-9 · Socle analytics** — table `product_events` + `services/analytics.ts` +
les trois événements prioritaires (§8.5). **À embarquer dans le même build que
P0-2, P0-3, P0-4 et les P1 mobiles.**

### P2 — une semaine

**P2-1 · Nouvel atterrissage post-révélation** — trois profils avec la raison
astrologique affichée, à la place du deck brut. Le moteur v2 est prêt.

**P2-2 · Séquence lifecycle complète** (§6.4) — messages A, B, D, G, H + les
conditions d'annulation. Dépend de P0-2 (`last_active`).

**P2-3 · Contenu de l'horoscope quotidien** — remplacer les 5 tips figés par une
génération avec vraie variabilité, ton de marque, sans promesse bannie.
`marketingagent/` est l'outil.

**P2-4 · Ajouter `profiles.onboarding_completed_at`** — supprime le besoin de
proxy (§8.3).

**P2-5 · Surfacer le parrainage** — paywall, états vides, jalon de profil
complété. La mécanique existe déjà.

**P2-6 · Message « ton aperçu revient demain »** — le serveur connaît déjà
`free_preview_exhausted`.

### P3 — plus tard

- Migrer les fonctionnalités restantes vers `free_preview_quota` ; retirer le chemin client hérité.
- Digest hebdomadaire de synastrie.
- Enregistrer le widget Android : le plugin `withAndroidShortcutsAndWidget` n'est pas déclaré dans `app.json`, et son chemin source pointe vers `apps/mobile/android-native`, qui n'existe pas.
- Classement de Discover par compatibilité calculée plutôt qu'ordre de base.
- Boucle de parrainage avec suivi invitations envoyées / acceptées.

---

## 10. Le premier patch recommandé

> **STATUT : implémenté le 27 août 2026, non déployé.** Voir « Ce qui a été
> livré » en fin de section pour les deux écarts assumés par rapport au plan
> ci-dessous.

### P0-1 — réparer les quatre templates email

**Pourquoi celui-ci et pas un autre :**

1. **Il ne nécessite aucun build mobile ni déploiement web.** Un
   `supabase functions deploy send-email` suffit. Il n'y a pas d'OTA sur ce
   projet, donc c'est le seul correctif de cette liste dont l'effet est
   **immédiat sur le parc installé**.
2. **Il conditionne P0-5.** Appliquer la migration J+1 avant de réparer les
   emails, c'est envoyer en volume des messages structurellement incapables de
   ramener quelqu'un — en consommant la réputation du domaine.
3. **Il ferme une exposition réglementaire** (absence de mécanisme de
   désabonnement, LCAP).
4. **Il supprime le seul message qui ment activement à l'utilisateur** (le faux
   essai de 7 jours).
5. **Son effet est mesurable dès la mise en service**, via `?e={id}` et un
   déploiement web — sans attendre une soumission Play.

**Périmètre exact :** un seul fichier,
`supabase/functions/send-email/index.ts`. Aucune migration, aucun changement de
schéma, aucun fichier mobile, aucun asset, aucune métadonnée de store.

**Séquence de déploiement recommandée :**

```
1. [À VÉRIFIER] junosynastry.com authentifié dans Resend (SPF + DKIM)   ← bloquant
2. Réécrire les 4 templates            (P0-1)
3. Test local des 4 rendus + envoi réel vers une adresse de test
4. supabase functions deploy send-email
5. Purger scheduled_emails de plus de 7 jours de retard
6. Appliquer 20260824000001            (P0-5)
7. Surveiller 24 h : taux d'envoi, plaintes, clics
8. Ensuite seulement : le build mobile groupé (P0-2, P0-3, P0-4, P1)
```

### Ce qui a été livré

Implémenté le 27 août 2026. Deux écarts assumés par rapport au plan ci-dessus.

**Écart 1 — le désabonnement est réel, pas un lien de repli.** Le plan
envisageait de pointer vers une page de préférences en attendant un vrai
endpoint. Il a été construit : `supabase/functions/unsubscribe/index.ts`,
même construction de jeton HMAC que `cancel-account-deletion`, avec les deux
chemins d'entrée (GET depuis le pied de page, POST pour le un-clic RFC 8058
appelé par Gmail et Yahoo). Il écrit `notification_preferences.lifecycleEmails`,
annule les envois encore en attente, et propose un « annuler » en un tap. Le
secret se dérive de la clé service-role à défaut de `UNSUBSCRIBE_TOKEN_SECRET`,
donc rien n'est à provisionner avant le premier déploiement.

**Écart 2 — les CTA visent `/app`, pas `/en/app`.** Un chemin préfixé par la
locale ne commence pas par `/app` et ne correspondrait donc **pas** au filtre
d'intention Android (`pathPrefix: "/app"`, `app.json:58`) : le lien ouvrirait
le navigateur au lieu de l'app installée. Vérifié en direct :
`https://app.junosynastry.com/app?utm_source=…` renvoie un 307 vers
`/en/app?utm_source=…` en conservant la chaîne de requête. `/app` est donc
strictement meilleur.

**Fichiers.**

| Fichier | Rôle |
|---|---|
| `supabase/functions/send-email/templates.ts` | **nouveau** — copie et rendu, zéro import, donc testable hors Deno |
| `supabase/functions/send-email/index.ts` | réduit au runtime : auth, lecture profil, jeton, Resend |
| `supabase/functions/unsubscribe/index.ts` | **nouveau** — opt-out GET + POST un-clic |
| `supabase/config.toml` | `[functions.unsubscribe] verify_jwt = false` |
| `scripts/validate-email-templates.mjs` | **nouveau** — rend les templates et vérifie la sortie |
| `.github/workflows/ci.yml`, `package.json` | validateur branché sur CI |

**Au-delà du périmètre demandé, et pourquoi.** Le J+1 lit désormais
`profiles.moon_sign` et livre une observation propre au placement lunaire réel.
L'ancien template annonçait « ton thème est prêt » à quelqu'un qui l'avait vu
la veille à l'écran : il ne portait aucune information neuve, et un lien vers
un contenu déjà consulté ne ramène personne. Sans heure de naissance, aucun
placement n'est inventé — le repli bascule sur le Soleil et invite à ajouter
l'heure, au lieu de reproduire par email le défaut §3.5.

**Validation.** 783 assertions sur le rendu réel, 15 tests négatifs confirmant
que le validateur échoue sur chaque défaut qu'il prétend garder, contrat de
jeton vérifié entre les deux fonctions. `lint` 0 erreur, `typecheck` propre.

**Déployé le 27 août 2026** sur `qtihezzbuubnyvrjdkjd`, après vérification DNS
indépendante de la configuration Resend (DKIM sur `resend._domainkey.junosynastry.com`,
SPF + MX de bounce sur `send.junosynastry.com`). Le cron J+1 n'est toujours pas
planifié : rien ne part en volume.

### Découverte au déploiement — Supabase neutralise le HTML des edge functions

Une réponse envoyée en `text/html; charset=utf-8` par une edge function revient
au client ainsi :

```
Content-Type: text/plain
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none'; sandbox
```

Une réponse JSON d'une fonction voisine conserve `application/json` et ne reçoit
ni CSP ni `nosniff`. C'est donc une politique délibérée de la plateforme —
vraisemblablement pour empêcher que `*.supabase.co` serve des pages
d'hameçonnage. Le déclencheur est le type de contenu, **pas** le code de statut :
une page de confirmation à 200 est neutralisée exactement comme une erreur 400,
et le lecteur voit le balisage brut.

**Corrigé le 27 août 2026.** La page de résultat vit désormais sur le web
(`apps/web/src/app/[locale]/unsubscribe/page.tsx`, 8 locales) et l'edge function
y redirige en 303 avec un simple `status` — `unsubscribed`, `resubscribed`,
`invalid`, `error`, `gone`. Aucun jeton ne franchit la frontière : il finirait
dans l'historique du navigateur, l'en-tête `Referer` et les journaux Vercel.
C'est aussi pourquoi il n'y a pas de bouton « annuler » sur la page — le retour
en arrière passe par le support, qui dispose de `?action=resubscribe`.

Le `POST` un-clic RFC 8058 ne redirige **pas** : il continue de répondre en JSON,
sans quoi Gmail et Yahoo considéreraient le désabonnement comme échoué. La
réponse `text/plain` subsiste comme repli si `APP_BASE_URL` est absent — une
mauvaise configuration doit dégrader vers « moche mais fonctionnel », jamais
vers un lien de désabonnement cassé.

**Conséquence hors périmètre : `cancel-account-deletion` est concernée.** Elle
sert encore du HTML (`htmlResponse`, `:140-154`). La page « Deletion cancelled »
que reçoit un utilisateur ayant cliqué depuis son email d'annulation s'affiche
donc en code source brut. Bug préexistant, non corrigé par ce patch.

**Correctif permanent, pour les deux :** héberger la page de confirmation sur
`app.junosynastry.com` et faire répondre l'edge function par un 302. Demande un
déploiement web ; à décider séparément.

---

## 11. Critères d'acceptation — valider l'amélioration

### Avant toute chose : établir la ligne de base

Aucune amélioration n'est démontrable sans point de départ. **Exécuter la
requête de funnel du §8.3 avant le premier déploiement** et archiver le
résultat. C'est la seule mesure disponible aujourd'hui, et elle ne coûte rien.

### Par jalon

| Jalon | Métrique | Comment la lire | Fenêtre |
|---|---|---|---|
| P0-1 déployé | taux de clic email | `product_events` où `name='email_clicked'` ÷ `scheduled_emails.sent` | 7 j |
| P0-1 déployé | plaintes spam | tableau de bord Resend | 48 h |
| P0-5 appliqué | emails livrés | `select status, count(*) from scheduled_emails group by 1` | 24 h |
| P0-2 déployé | rétention J+1 | part des comptes avec `last_active > created_at + 24 h` | 7 j après build |
| P0-3 déployé | taux d'acceptation push | `count(push_tokens) ÷ count(profiles)` sur les comptes créés après le build | 14 j |
| P0-4 déployé | piège de filtre | `discover_empty_seen` avec `is_trap = true` | 7 j |
| P1-1 déployé | complétion onboarding | `onboarding_step_completed` par étape | 7 j |
| P1-3 déployé | ascendants réels | `select rising_sign, count(*) from profiles where birth_time is null` — ne doit plus être 100 % Bélier | immédiat |

### La métrique nord

**Part des comptes dont `last_active` dépasse `created_at + 24 h`**, par cohorte
hebdomadaire d'inscription.

C'est la seule mesure qui capture la question posée. Elle n'est pas calculable
aujourd'hui — d'où le rang P0 de son unique prérequis, une ligne d'écriture.

```sql
-- Rétention J+1 par cohorte, disponible après P0-2
select date_trunc('week', p.created_at) as cohorte,
       count(*)                         as inscrits,
       count(*) filter (where p.last_active > p.created_at + interval '24 hours') as revenus_j1,
       round(100.0 * count(*) filter (where p.last_active > p.created_at + interval '24 hours')
             / nullif(count(*), 0), 1) as taux_j1
  from profiles p
 group by 1 order by 1 desc;
```

---

## 12. Questions ouvertes et données manquantes

### Bloquant — à vérifier avant tout déploiement

1. **`junosynastry.com` est-il authentifié dans Resend (SPF, DKIM, domaine
   vérifié) ?** Non vérifiable depuis le repo. Si non, le basculement de
   `EMAIL_FROM` (déjà présent dans l'arbre de travail, non commité) casse tout
   l'email transactionnel — **y compris la vérification de compte**, donc
   l'inscription.
   *Où chercher :* tableau de bord Resend → Domains.

2. **La migration `20260823000001_free_preview_quota.sql` est-elle appliquée en
   production ?** Elle est non suivie par git. Elle conditionne le
   fonctionnement du free preview du thème natal.
   *Où chercher :* `select * from supabase_migrations.schema_migrations order by version desc limit 10;`

3. **`cron_scheduled_emails_secret` existe-t-il dans le vault, et correspond-il
   à `SCHEDULED_EMAILS_SECRET` de la fonction ?** Sans cela, la migration J+1
   planifie un cron qui recevra des 401 en silence.
   *Où chercher :* `select name from vault.decrypted_secrets;` et les variables
   d'environnement de la fonction.

### Important — change les priorités

4. **Combien de lignes `scheduled_emails` sont en attente, et depuis quand ?**
   Détermine l'ampleur de la rafale de rattrapage.
   ```sql
   select template, count(*), min(scheduled_for), max(scheduled_for)
     from scheduled_emails where status='pending' group by 1;
   ```

5. **Le décrochage est-il avant ou après l'onboarding ?** La requête du §8.3 y
   répond **aujourd'hui, sans aucun code**. Si le décrochage est majoritairement
   avant l'activation, P1-1 et P1-2 remontent devant P0-3 et P0-4.

6. **Quelle part des comptes a `birth_time IS NULL` ?** Donne la portée réelle
   du bug de l'ascendant fabriqué (§3.5).
   ```sql
   select count(*) filter (where birth_time is null) as sans_heure,
          count(*) as total from profiles;
   ```

7. **Les 60 profils de seed sont-ils réellement en base en production ?** Toute
   l'analyse de Discover en dépend.
   ```sql
   select count(*), count(distinct image_url) from profiles where id in (...);
   ```

### Non vérifiable depuis le repo

8. Statistiques Play Console : installations, désinstallations, ANR, crashs.
9. Taux d'ouverture / clic / plainte historiques dans Resend.
10. Y a-t-il jamais eu un essai gratuit de 7 jours configuré dans RevenueCat ou
    Stripe ? Cela expliquerait le template Day-5, qui serait alors une dette
    plutôt qu'une erreur. Sans configuration active, le constat de §1-4 tient.
11. Répartition géographique et linguistique réelle des comptes — détermine si
    les 8 locales sont un investissement rentable.

---

## Documents liés

- `docs/retention-audit-2026-08.md` — audit du 24 août, **remplacé par ce document**
- `docs/premium-free-preview.md` — architecture du free preview serveur
- `docs/growth-plan.md` — objectifs d'acquisition
- `supabase/SECURITY.md` — posture RLS et RPC `SECURITY DEFINER`
- `marketingagent/TRAINING.md` — l'outil de production du contenu email et push
