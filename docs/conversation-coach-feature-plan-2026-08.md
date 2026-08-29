# JUNO — Conversation Guide : plan produit & technique

**Statut :** proposition d'implémentation. Rien n'est codé.
**Date :** 28 août 2026.
**Source d'inspiration conceptuelle :** `docs/conversation-coach-sign-concepts-2026-08.md`.
**Portée de l'audit :** premium mobile + web, free preview serveur, données
astrologiques du profil, `packages/shared`, edge functions, navigation
`expo-router`, i18n (8 locales), conformité store.

> **Note de provenance / droit d'auteur.** La fiche de concepts a été rédigée
> à partir d'un ouvrage tiers utilisé **uniquement** comme repère d'axes
> généraux (styles de communication par signe, besoins émotionnels, tensions
> relationnelles courantes). Aucune phrase, aucun plan de chapitre, aucune
> taxonomie de rôles issue de cet ouvrage n'est reprise. Les règles précises
> qui rendent cette indépendance vérifiable sont en **§12.4** — elles sont
> normatives, pas décoratives, et doivent être lues avant d'écrire la
> première ligne de contenu.

---

## État d'implémentation — P0 livré le 28 août 2026

Le P0 est **codé et validé**. Trois décisions ont dévié du plan tel qu'écrit
plus bas ; elles sont listées ici pour qu'aucun agent ne parte du plan sans
savoir ce que le code fait réellement.

| Point | Plan (ci-dessous) | Livré | Pourquoi |
|---|---|---|---|
| **Contenu long** | ≈ 110 clés i18n dans `apps/mobile/locales/*.json` × 8 (§7.3) | corpus **anglais uniquement** dans `packages/shared/src/coach/content.ts`, hors i18n. Seul le chrome (33 clés) est traduit × 8 | Décision produit : P0 anglais. Or `validate-mobile-locales.js` exige une **parité exacte** — 7 fichiers auraient porté ~100 chaînes anglaises, et cette dette serait devenue invisible (une locale « complète » remplie d'anglais passe le validateur). Le corpus hors i18n rend l'anglais explicite, et l'écran l'annonce (`conversationGuideEnglishNote`). Migration vers i18n = déplacer les chaînes, la structure est déjà par clé. |
| **Ligne premium par ton** | `coachLineTone_<situation>_<element>` (§7.2) | non livré | Couche premium = P1. Le P0 ne contient aucune personnalisation planétaire. |
| **Clé de fonctionnalité** | `conversation-guide` / `conversation_guide` (§3.3) | identique | — |

Ce qui a été livré, en une ligne : **12 signes × 4 situations, dont une
gratuite et illimitée, un gate serveur qui ne se déclenche qu'au tap, deux
entrées hors du hub premium, 20 tests unitaires, un validateur de contenu à 8
modes d'échec vérifiés, et un flow Maestro.**

Télémétrie : voir [conversation-guide-telemetry.md](./conversation-guide-telemetry.md)
— aucun SDK d'analytics n'a été ajouté, le repli SQL via `premium_usage` est
documenté et suffisant pour décider du P1.

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Positionnement produit](#2-positionnement-produit)
3. [Nom recommandé](#3-nom-recommandé)
4. [Modèle freemium / premium](#4-modèle-freemium--premium)
5. [Situations de coaching supportées](#5-situations-de-coaching-supportées)
6. [Modèle astrologique recommandé](#6-modèle-astrologique-recommandé)
7. [Structure du contenu](#7-structure-du-contenu)
8. [Exemples de contenu original](#8-exemples-de-contenu-original--aries-cancer-capricorn)
9. [Architecture technique](#9-architecture-technique)
10. [Données et stockage](#10-données-et-stockage)
11. [Analytics et rétention](#11-analytics-et-rétention)
12. [Store compliance & safety](#12-store-compliance--safety)
13. [Plan d'implémentation priorisé](#13-plan-dimplémentation-priorisé)
14. [Première recommandation exécutable](#14-première-recommandation-exécutable)
- [Annexe A — inventaire des fichiers audités](#annexe-a--inventaire-des-fichiers-audités)
- [Annexe B — ce qui reste à vérifier](#annexe-b--ce-qui-reste-à-vérifier)

---

## 1. Résumé exécutif

### 1.1 Pourquoi cette feature est pertinente pour JUNO

JUNO vend déjà une thèse : « Conversation map, not prediction » — c'est
littéralement le sous-titre de l'écran Synastry
([synastry.tsx:437](../apps/mobile/app/premium-screens/synastry.tsx#L437)).
Mais l'app s'arrête au diagnostic. Elle dit **comment deux personnes
fonctionnent**, jamais **quoi écrire dans les trente secondes qui suivent**.

Trois preuves que le manque est structurel, pas théorique :

| Surface existante | Ce qu'elle donne | Ce qui manque |
|---|---|---|
| Synastry — section « How to talk » ([synastry.tsx:402-417](../apps/mobile/app/premium-screens/synastry.tsx#L402-L417)) | 3 prompts choisis par l'**élément** du Mercure / de la Lune / de la Vénus de l'autre | 3 lignes, une seule personne à la fois, gate Celestial, aucune notion de situation |
| Exploration questions ([exploration.ts](../packages/shared/src/astrology/exploration.ts)) | 10 questions à se poser **à deux** | des questions, pas des formulations ; suppose que la conversation a déjà lieu |
| Daily Reflection ([daily-horoscope.tsx](../apps/mobile/app/premium-screens/daily-horoscope.tsx)) | 1 « conversation prompt » par jour et par signe solaire | générique, non adressé à une personne, gate Celestial |

Aucune de ces trois surfaces ne répond à « je veux écrire à quelqu'un et je ne
sais pas comment tourner ma phrase ». C'est pourtant la seule requête que les
utilisateurs formulent réellement entre deux sessions.

### 1.2 Pourquoi elle peut améliorer rétention et conversion

**Rétention.** `docs/retention-day2-audit-2026-08.md` §4.1 pose le diagnostic
central : « l'Aha moment est solitaire, alors que la thèse produit est
relationnelle ». Le thème natal se consomme une fois. Le Conversation Guide se
consomme **à chaque interaction avec une personne réelle** — donc plusieurs
fois par semaine, sans dépendre du deck Discover ni d'une réponse de l'autre.
C'est le premier objet de l'app dont la valeur ne s'épuise pas au premier
écran.

**Conversion.** Le paywall n'a aujourd'hui qu'un seul échantillon gratuit
(`natal_chart`, `free_preview_quota = 1`,
[20260823000001_free_preview_quota.sql](../supabase/migrations/20260823000001_free_preview_quota.sql)).
Le Conversation Guide est un meilleur échantillon que le thème natal pour une
raison mesurable : sa valeur est **immédiatement vérifiable** — on copie une
phrase, on l'envoie, on voit si elle marche. La montée en premium n'a plus
besoin d'être argumentée ; elle est demandée.

**Coût marginal.** Contenu statique. Aucun appel IA, aucun coût par lecture,
aucune edge function nouvelle en P0 (§9, §10).

### 1.3 Où elle s'insère

Trois points d'entrée, par ordre de priorité :

1. **[app/chat/[id].tsx:458-476](../apps/mobile/app/chat/[id].tsx#L458-L476)** —
   la barre de chips du fil contient déjà « View profile » et « Compare
   charts ». `conversationInfo` expose `other_user_sun_sign`
   ([conversations.ts:49](../apps/mobile/services/conversations.ts#L49)).
   Une troisième chip « Ways to say it » qui deep-linke sur le signe de
   l'interlocuteur, c'est **la feature au moment exact du besoin**.
2. **[app/(tabs)/profile.tsx:524-542](../apps/mobile/app/(tabs)/profile.tsx#L524-L542)** —
   l'encart « Today's Cosmic Energy » est le hook de ré-engagement déjà en
   place. Un second encart y donne l'accès sans passer par le premium.
3. **[app/(tabs)/premium.tsx](../apps/mobile/app/(tabs)/premium.tsx) +
   [constants/premiumCatalog.ts](../apps/mobile/constants/premiumCatalog.ts)** —
   carte dans `CELESTIAL_FEATURES` pour la version complète.

> ⚠️ **Piège vérifié.** [premium.tsx:100](../apps/mobile/app/(tabs)/premium.tsx#L100) :
> pour `tier === 'free'`, l'onglet Premium **rend un paywall plein écran** au
> lieu du Cosmic Hub. Un utilisateur gratuit ne voit donc **jamais** la grille
> de cartes. Une feature dont l'unique entrée est le Cosmic Hub est invisible
> pour 100 % de la population qu'elle est censée convertir. Les entrées 1 et 2
> ne sont pas des bonus : elles sont la condition d'existence de la feature
> côté gratuit.

### 1.4 Risques à éviter

| Risque | Pourquoi il est réel ici | Parade |
|---|---|---|
| **Promesse romantique** | « Coach » + astrologie glisse vite vers « voici comment le/la séduire » | §2, §3, §12.2 |
| **Ton thérapeutique** | « parler d'émotions », « réparer une tension » sont à un mot du conseil clinique | §12.1, §12.3 |
| **Manipulation** | « quoi dire pour obtenir X » est le mode d'échec par défaut du genre | §12.3 |
| **Paywall trop tôt** | si la 1re situation est gatée, l'Aha n'a jamais lieu | §4.3 |
| **Stéréotypes durs par signe** | « les Scorpions sont toxiques » = 1★ et signalements | §12.3 |
| **Ascendant fabriqué** | bug **encore actif** : [astrology.ts:125](../apps/mobile/services/astrology.ts#L125) substitue `Aries` quand l'heure manque | §6.4 |
| **Proximité avec la source** | reproduire une grille de rôles relationnels | §12.4 |
| **Explosion i18n** | 8 locales × signes × situations | §7.4, §10 |

---

## 2. Positionnement produit

### 2.1 Ce que la feature **est**

- **Un guide de formulation.** Passer d'une intention floue (« je veux savoir
  où on en est ») à une phrase réellement envoyable.
- **Une aide à la réflexion.** Chaque fiche se termine par une question posée
  au lecteur sur *sa propre* intention — jamais sur l'autre.
- **Un vocabulaire relationnel.** L'astrologie fournit des nuances (rythme,
  registre, tempo), exactement comme Synastry V2 l'utilise déjà.
- **Non prédictive.** Aucune affirmation sur ce qui *va* se passer. Mode
  verbal `may / often / can / tends to`, jamais `will / always / never`.

### 2.2 Ce que la feature **n'est pas**

| N'est pas | Formulation interdite | Formulation retenue |
|---|---|---|
| Une garantie romantique | « ça marchera avec un Bélier » | « ça ouvre souvent une porte plus nette » |
| Une thérapie | « voici comment gérer son anxiété d'attachement » | « voici une façon de nommer ce que tu ressens » |
| Une prédiction | « il/elle va se fermer » | « ce ton **peut** être reçu comme de la pression » |
| Un diagnostic psychologique | « les Vierges sont anxieuses » | « l'énergie Vierge se rassure souvent par le concret » |
| Un script de séduction | « la phrase qui fait craquer » | « une façon d'être clair sans forcer » |
| Une condensation d'un livre | plan par rôles (patron / ex / colocataire) | plan par **situations que l'utilisateur veut traverser** |

### 2.3 La phrase de positionnement interne

> **Le Conversation Guide aide quelqu'un à mieux dire les choses. Il ne vend
> aucune certitude sur la personne d'en face.**

Toute copy, tout écran, toute notification qui ne passe pas ce test est hors
périmètre. C'est le critère d'acceptation qualitatif de §13.

---

## 3. Nom recommandé

Cinq candidats, évalués contre l'existant du repo — pas dans l'abstrait.

### 3.1 Comparatif

| Nom | Avantage | Inconvénient | Fit JUNO |
|---|---|---|---|
| **Cosmic Conversation Coach** | évocateur, mémorable | **collision de tier fatale** : « Cosmic » est le nom public du tier `premium_plus` (`cosmicTier`, `cosmicMember`, `COSMIC_FEATURES`, `/premium-screens/plus`). Une feature gratuite nommée « Cosmic » se lit comme réservée au tier le plus cher. « Coach » implique en plus une autorité professionnelle. | ✗ à écarter |
| **Sign Communication Coach** | descriptif, bon pour le SEO store | froid, jargon produit ; « Sign » réduit la feature au solaire alors que le premium tient sur Lune / Mercure / Vénus / Mars | ✗ |
| **JUNO Conversation Coach** | rassurant | préfixer la marque **à l'intérieur de sa propre app** est redondant ; aucune autre feature ne le fait | ~ |
| **Talk by Sign** | court, honnête, aucune promesse | registre léger, proche du contenu horoscope grand public ; sous-vend la couche premium ; se traduit mal (FR « Parler par signe ») | ~ |
| **Communication Guide** | sobre, aucune promesse, aucun sous-entendu clinique | générique ; ne dit pas qu'il s'agit de dire *quelque chose à quelqu'un* | ✓ |

### 3.2 Recommandation finale

**Nom public : « Conversation Guide ».**
**Sous-titre : « Ways to say it, by sign. »**

Trois justifications vérifiables dans le repo :

1. **Cohérence avec la famille de noms V2.** Les renommages sobres sont déjà
   la doctrine : *Daily Reflection*, *Transit Reflection*, *Planning Windows*,
   *Date Reflection*, *Synastry Reflection*
   ([premiumCatalog.ts:26-37](../apps/mobile/constants/premiumCatalog.ts#L26-L37),
   [PremiumGate.tsx:146-153](../apps/mobile/components/PremiumGate.tsx#L146-L153)).
   « Guide » appartient à cette famille ; « Coach » non.
2. **La marque store dit déjà « Guide ».** Le nom App Store est **« JUNO —
   Synastry Guide »** ([check-store-metadata.mjs](../scripts/check-store-metadata.mjs),
   bloc `DOC_CHECKS`). « Conversation Guide » est le même mot appliqué à la
   surface voisine.
3. **« Coach » est le seul mot qui crée un risque de revue.** Il suggère une
   relation professionnelle d'accompagnement — exactement ce que §2.2 s'engage
   à ne pas être.

*Parmi les 5 imposés*, le gagnant est **Communication Guide** ; « Conversation
Guide » n'en est que l'ajustement d'un mot, plus proche du geste réel. Si
l'équipe tient à « Coach » pour des raisons marketing, c'est défendable — mais
**jamais** avec le préfixe « Cosmic ».

### 3.3 Identifiants techniques dérivés (à figer maintenant)

| Élément | Valeur | Motif |
|---|---|---|
| Route mobile | `/premium-screens/conversation-guide` | même dossier que les autres surfaces astro |
| Route web | `/[locale]/app/premium/celestial/conversation-guide` | parité PWA (canal iOS) |
| `FeatureKey` client | `'conversation-guide'` | convention hyphenée ([premiumUsage.ts:20-31](../apps/mobile/services/premiumUsage.ts#L20-L31)) |
| `premium_feature_policy.feature_key` | `'conversation_guide'` | convention soulignée côté SQL |
| Clé catalogue / i18n de la carte | `conversationGuide` | résolue par `t(feature.key)` |
| Préfixe des clés i18n de contenu | `coach…` | raccourci interne, **jamais visible** ; court et sans collision (0 occurrence de `coach` dans les 8 locales mobile **et** les 8 fichiers `apps/web/messages` — vérifié) |
| `type` de push | `conversationGuide` | switch [_layout.tsx:594-624](../apps/mobile/app/_layout.tsx#L594-L624) |

---

## 4. Modèle freemium / premium

### 4.1 Le principe directeur

> **Le gratuit doit livrer une fiche complète, pas un teaser flouté.**

Le paywall de l'app fait déjà l'erreur inverse ailleurs : l'aperçu de
compatibilité de [premium.tsx:225-247](../apps/mobile/app/(tabs)/premium.tsx#L225-L247)
affiche « Sun 78 % » et deux barres cadenassées — des chiffres **fabriqués**,
codés en dur (`width: '78%'`), pointés par l'audit rétention §7.3. Cette
mécanique ne doit pas être reproduite ici. Une fiche tronquée ne prouve rien ;
une fiche entière prouve tout, et c'est elle qui vend la suivante.

### 4.2 Le découpage

#### Version gratuite — **sans aucun gate**

- Sélecteur des 12 signes.
- **1 situation complète et illimitée : « Start a conversation ».**
- Fiche complète : *Their rhythm* · *What usually works* · *What to avoid* ·
  *Try saying* (copiable) · *A question for you*.
- Le bandeau premium reste visible mais **non bloquant**.

Ce bloc n'appelle **jamais** `enforce_premium_feature`. Il n'est pas décompté.
C'est le socle d'habitude.

#### Version gratuite — **aperçu quotidien serveur (1 / jour)**

- Les 3 autres situations P0 (`Ask for clarity`, `Repair a misunderstanding`,
  `Set a boundary`) déverrouillent **toutes ensemble** pour la journée au
  premier tap, via `enforce_premium_feature('conversation_guide')` avec
  `free_preview_quota = 1`.
- Le lendemain, l'aperçu revient. C'est exactement la promesse déjà affichée :
  `freePreviewAvailable` = « 1 free preview per day »
  ([PremiumGate.tsx:317](../apps/mobile/components/PremiumGate.tsx#L317)).

> **Pourquoi « toutes ensemble » et pas « une situation par jour ».** Le RPC
> est atomique : il décide **et** comptabilise en un appel
> ([premiumUsage.ts:85-118](../apps/mobile/services/premiumUsage.ts#L85-L118)).
> Décompter par situation exigerait 3 clés de policy distinctes ou un compteur
> applicatif — soit exactement la double-comptabilité qui a produit le bug
> corrigé par la migration `20260823000001`. Un déverrouillage global par jour
> est plus simple, plus généreux, et tient dans le contrat existant.

#### Version premium (Celestial)

| Bloc | Contenu |
|---|---|
| Toutes les situations | 8 situations (§5), sans limite quotidienne |
| Personnalisation | couches Lune / Mercure / Vénus / Mars du destinataire (§6) |
| *Their communication rhythm* | dérivé de Mercure |
| *Emotional subtext* | dérivé de la Lune |
| *Best tone* / *Words to try* / *Words to avoid* | dérivés de Vénus |
| *If tension appears* | dérivé de Mars |
| *Synastry note* | comparaison des éléments des deux thèmes, réutilise `getElement` |
| *One message you can send* | variante adaptée au ton, copiable |

**Premium Plus (Cosmic) : rien de spécifique.** Ajouter un troisième palier
ici fragmenterait une feature dont l'intérêt est la continuité. Cosmic hérite
par inclusion descendante
([PremiumContext.tsx:245-258](../apps/mobile/contexts/PremiumContext.tsx#L245-L258)).

### 4.2 bis — Le découpage en un coup d'œil

| | **Gratuit, illimité** | **Aperçu gratuit (1×/jour)** | **Celestial** |
|---|:--:|:--:|:--:|
| Sélecteur des 12 signes | ✅ | ✅ | ✅ |
| *Start a conversation* | ✅ | ✅ | ✅ |
| *Ask for clarity* / *Repair* / *Set a boundary* | ✗ | ✅ (les 3 ensemble) | ✅ |
| 4 situations P1 (*feelings*, *plan*, *flirt*, *slow*) | ✗ | ✗ | ✅ |
| Fiche complète, non tronquée | ✅ | ✅ | ✅ |
| Phrase copiable | ✅ | ✅ | ✅ |
| Couches Lune / Mercure / Vénus / Mars du destinataire | ✗ | ✗ | ✅ |
| *Synastry note* | ✗ | ✗ | ✅ |
| Message adapté au ton (`coachLineTone`) | ✗ | ✗ | ✅ |
| Appelle `enforce_premium_feature` | **jamais** | 1× par jour | 1× par ouverture |

Une seule règle à retenir : **le gratuit n'est jamais tronqué, il est plus
étroit.** On ne floute rien, on n'ampute aucune fiche — on en offre moins.

### 4.3 Comment éviter que le paywall arrive trop tôt

Quatre garde-fous, tous vérifiables mécaniquement :

1. **L'écran n'est pas enveloppé par `PremiumGate`.** `PremiumGate` gate
   l'écran **entier** et déclenche l'appel RPC au montage
   ([PremiumGate.tsx:37-119](../apps/mobile/components/PremiumGate.tsx#L37-L119)).
   L'utiliser ici brûlerait l'aperçu du jour à la simple ouverture, avant
   toute lecture, et rendrait la situation gratuite inaccessible le reste de
   la journée. Le Conversation Guide appelle donc `enforcePremiumFeature`
   **lui-même, une seule fois, au premier tap sur une situation verrouillée**.
2. **Un seul appel par session.** Mémoriser la décision dans un `useRef` et ne
   jamais rappeler le RPC dans le même montage. C'est la règle « un seul appel
   par écran » de [docs/premium-free-preview.md](./premium-free-preview.md).
3. **Rejeu local dans la journée.** Après un `free_preview` accordé, écrire
   `coach_preview_date = <YYYY-MM-DD>` dans AsyncStorage. Au retour le même
   jour, réafficher le contenu **sans rappeler le RPC**. La fenêtre de rejeu
   serveur ne dure que 15 minutes (`c_replay_window`) ; sans ce cache, un
   utilisateur qui revient 2 h plus tard verrait un paywall après avoir déjà
   « payé » son aperçu. Le cache ne peut **jamais** accorder le premier
   déverrouillage — uniquement rejouer un accord déjà obtenu ce jour-là.
4. **Le refus est honnête.** `free_preview_exhausted` → « Ton aperçu du jour
   est utilisé. Reviens demain, ou passe en Celestial. » Jamais un message
   générique qui laisse croire que l'utilisateur n'a rien reçu.

### 4.4 Utiliser la feature comme preview premium temporairement gratuite

Le mécanisme existe déjà et ne demande **aucun build mobile** :

```sql
-- Ouvrir 3 aperçus par jour pendant une opération (Saint-Valentin, lancement…)
UPDATE public.premium_feature_policy
   SET free_preview_quota = 3, updated_at = NOW()
 WHERE feature_key = 'conversation_guide';

-- Retour à la normale
UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'conversation_guide';
```

C'est un levier de croissance **piloté en SQL**, réversible en une seconde,
sans soumission Play — ce qui compte énormément puisque `expo-updates` est
absent d'[apps/mobile/package.json](../apps/mobile/package.json) : **il n'y a
pas d'OTA sur ce projet** et toute correction client attend une revue Play.

> ⚠️ Le client doit donc **lire** `currentCount` et ne pas coder en dur « 1 par
> jour » dans la copy. Prévoir `t('coachPreviewRemaining', { count })`.

### 4.5 Ce qui doit rester gratuit, en une phrase

**« Start a conversation », pour les 12 signes, pour toujours, sans compteur.**
C'est le seul bloc qui ne doit jamais être touché par une opération de
monétisation : c'est lui qui crée l'habitude que le reste monétise.

---

## 5. Situations de coaching supportées

### 5.1 La taxonomie

Huit situations au total ; **quatre en P0**. L'axe d'organisation est le
**geste que l'utilisateur veut poser** — pas le rôle de la personne en face.
Ce choix est aussi la principale défense structurelle en matière de droit
d'auteur (§12.4).

| Clé | Libellé EN | Objectif utilisateur | Type de réponse | Exemple de résultat court | Niveau |
|---|---|---|---|---|---|
| `start` | Start a conversation | ouvrir sans banalité | 1 ouverture + 1 relance | « Random question, but it's been on my mind since we talked: … » | **Free, illimité** |
| `clarity` | Ask for clarity | savoir où on en est, sans mettre sous pression | 1 phrase directe + 1 phrase douce | « I'd rather ask than guess — where do you feel this is going? » | Aperçu / Premium |
| `repair` | Repair a misunderstanding | revenir sur une tension sans rejouer le conflit | 1 reconnaissance + 1 ouverture | « I think I read that wrong. Can I ask what you actually meant? » | Aperçu / Premium |
| `boundary` | Set a boundary | poser une limite sans punir | 1 limite + 1 réassurance | « I need slower evenings this week. It's not about you. » | Aperçu / Premium |
| `feelings` | Talk about feelings | nommer sans surcharger | 1 phrase en « je » + 1 invitation | « This mattered more to me than I let on. » | Premium (P1) |
| `plan` | Plan something together | proposer concrètement | 1 proposition + 1 alternative | « Thursday or Sunday — either works for me. » | Premium (P1) |
| `flirt` | Flirt gently | montrer de l'intérêt sans pression | 1 compliment spécifique + 1 sortie honorable | « I liked how you told that story. No pressure — I just wanted to say it. » | Premium (P1) |
| `slow` | Slow things down | ralentir sans rejeter | 1 ralentissement + 1 réassurance | « I'm interested. I'm also slow. Both are true. » | Premium (P1) |

### 5.2 Pourquoi ces quatre-là en P0

- **`start`** — le besoin le plus fréquent, donc le meilleur hameçon gratuit.
- **`clarity`** — la douleur la plus universelle du début de relation, et
  celle où une bonne formulation change réellement l'issue.
- **`repair`** — la plus différenciante : aucune app de rencontre ne l'offre,
  et c'est l'usage qui ramène quelqu'un un mardi soir.
- **`boundary`** — **argument de conformité autant que de produit.** Une app
  relationnelle qui apprend à poser une limite se défend seule en revue store.
  À mettre en avant dans les notes de revue (§12.5).

`flirt` et `slow` sont volontairement repoussés : ce sont les deux situations
qui, mal écrites, ressemblent le plus à un script de séduction. Elles arrivent
en P1, une fois la charte de ton (§12.3) rodée sur des sujets plus sobres.

### 5.3 Règle de forme, commune à toutes les situations

Chaque résultat contient **exactement une phrase copiable**, jamais un menu de
cinq répliques. Un menu transforme l'outil en générateur de pick-up lines ;
une phrase unique en garde le statut de suggestion. Le bouton est libellé
« Copy » et l'écran affiche sous la phrase : *« Change les mots pour qu'ils
soient les tiens. »*

---

## 6. Modèle astrologique recommandé

### 6.1 Ce que chaque placement apporte

| Placement | Rôle dans la feature | Niveau | Source de données |
|---|---|---|---|
| **Soleil** | énergie générale, tempo par défaut | Free | `profiles.sun_sign` (TEXT, fiable) |
| **Lune** | sécurité émotionnelle → *Emotional subtext* | Premium | `profiles.moon_sign` (TEXT, fiable) |
| **Mercure** | style de communication → *Their communication rhythm* | Premium | `birth_chart.planets.mercury.sign` |
| **Vénus** | registre d'affection → *Best tone*, *Words to try / avoid* | Premium | `birth_chart.planets.venus.sign` |
| **Mars** | friction et initiative → *If tension appears* | Premium | `birth_chart.planets.mars.sign` |
| **Ascendant** | première impression | Premium, **conditionnel** | `birth_chart.rising` — **jamais** `profiles.rising_sign` (§6.4) |

### 6.2 Comment lire ces données (chemins vérifiés)

- **Soi-même** : RPC `get_my_full_profile` — déjà utilisé par
  [synastry.tsx:240-253](../apps/mobile/app/premium-screens/synastry.tsx#L240-L253)
  et [NatalChartOverview.tsx:212](../apps/web/src/components/NatalChartOverview.tsx#L212).
- **Une autre personne** : edge function `get-profile-chart` — la **seule**
  voie autorisée (`supabase/SECURITY.md`). Elle renvoie un thème assaini,
  coordonnées arrondies à 0,5°, jamais `birth_time` ni `birth_date`, limitée à
  100 lectures/heure par appelant. C'est déjà le chemin de
  [synastry.tsx:166-199](../apps/mobile/app/premium-screens/synastry.tsx#L166-L199).
- **Mercure / Vénus / Mars ne sont pas des colonnes.** Vérifié : `profiles`
  n'a que `sun_sign`, `moon_sign`, `rising_sign`, `birth_chart JSONB`
  ([full_schema.sql:117-125](../supabase/migrations/00000000000000_full_schema.sql#L117-L125)).
  Le reste vit dans le JSONB, à lire avec le helper tolérant aux deux formes
  historiques (`birth_chart.planets.x.sign` **et** `birth_chart.x.sign`) :
  `pickPlanetSign()`,
  [lib/synastry.ts:226-241](../apps/mobile/lib/synastry.ts#L226-L241).
  **Réutiliser ce helper, ne pas en réécrire un.**

### 6.3 Niveaux de personnalisation et données requises

| Niveau | Données nécessaires | Ce qui s'affiche | Repli si absent |
|---|---|---|---|
| **L0 — Free** | signe solaire du destinataire (choisi à la main ou déduit du fil de chat) | fiche par signe + situation | aucun : le sélecteur manuel marche toujours |
| **L1 — Premium de base** | + Lune du destinataire | *Emotional subtext* | section omise, aucun texte de remplacement |
| **L2 — Premium complet** | + Mercure / Vénus / Mars du destinataire | rythme, ton, mots, tension | chaque section omise indépendamment |
| **L3 — Synastry** | thèmes des **deux** personnes (élément de la Lune / Mercure / Vénus de chacune) | *Synastry note* | section omise |
| **L4 — Ascendant** | heure de naissance **réelle** du destinataire | première impression | **omis par défaut**, voir §6.4 |

### 6.4 ⚠️ L'ascendant : la règle absolue

**Ne jamais lire `profiles.rising_sign` dans cette feature.**

Preuve, encore active au moment de l'audit :

```ts
// apps/mobile/services/astrology.ts:125
rising: placement(chart.rising, { sign: 'Aries', degree: 0, longitude: 0 }),
```

Le moteur partagé renvoie correctement `rising: null` sans heure de naissance
([chart.ts](../packages/shared/src/astrology/chart.ts)), mais le wrapper
mobile substitue **Bélier en dur**. L'onboarding encourage explicitement à
sauter l'heure. Résultat : tout compte sans heure de naissance est enregistré
avec `rising_sign = 'Aries'`. Le sujet est documenté comme **CRITIQUE** en
`docs/retention-day2-audit-2026-08.md` §3.5.

Conséquences pour le Conversation Guide :

1. La couche Ascendant est **désactivée par défaut**, même en premium.
2. Elle ne s'active que si `birth_chart.rising` est un objet non nul **et**
   que le thème ne porte pas `missing_birth_time` dans ses `warnings`
   ([types.ts](../packages/shared/src/astrology/types.ts), `ChartWarning`).
3. En l'absence de la donnée, **la section disparaît**. Pas de « Ascendant :
   inconnu », pas de valeur par défaut, pas de texte de remplacement. Le repli
   honnête, ici, c'est le silence.

Le même principe s'applique à Mercure / Vénus / Mars : un thème `v1` stocké
avant l'ajout des planètes externes peut ne pas les contenir
([stored.ts](../packages/shared/src/astrology/stored.ts)). `pickPlanetSign`
renvoie `null` — la section est omise, jamais remplie par le Soleil en douce.

> **Exception assumée, à documenter dans le code :** la section *Synastry
> note* (L3) peut retomber sur l'élément **solaire** quand la Lune ou Vénus
> manque, parce que Synastry V2 le fait déjà et l'affiche
> (`source: 'sun-fallback'`, [lib/synastry.ts:39-44](../apps/mobile/lib/synastry.ts#L39-L44)).
> Le repli doit alors être **visible** à l'écran, comme là-bas.

---

## 7. Structure du contenu

### 7.1 Sortie gratuite (5 blocs, ~90 mots)

```
┌─ Talking with a Cancer · Start a conversation ─────────┐
│                                                        │
│  THEIR RHYTHM                                          │
│  <coachSign_cancer_rhythm>            1 phrase         │
│                                                        │
│  WHAT USUALLY WORKS                                    │
│  <coachSign_cancer_works>             1–2 phrases      │
│                                                        │
│  WHAT TO AVOID                                         │
│  <coachSign_cancer_avoid>             1–2 phrases      │
│                                                        │
│  TRY SAYING                              [ Copy ]      │
│  “<coachLine_cancer_start>”           1 phrase         │
│  Change the words so they're yours.                    │
│                                                        │
│  A QUESTION FOR YOU                                    │
│  <coachSituation_start_reflect>       1 question       │
│                                                        │
│  ── For reflection, not prediction. ──                 │
└────────────────────────────────────────────────────────┘
```

### 7.2 Sortie premium (jusqu'à 9 blocs)

Les 5 blocs gratuits, **plus** — chacun affiché seulement si sa donnée existe :

| Bloc | Clé | Dérivé de |
|---|---|---|
| *Their communication rhythm* | `coachMercury_<signeMercure>` | Mercure |
| *Emotional subtext* | `coachMoon_<signeLune>` | Lune |
| *Best tone* | `coachVenus_<signeVenus>` | Vénus |
| *Words to try / Words to avoid* | `coachVenusWords_<élémentVenus>` | élément de Vénus |
| *If tension appears* | `coachMars_<signeMars>` + `coachTension_<signeSoleil>` | Mars |
| *Synastry note* | `coachSynastry_<élémentSoi>_<élémentAutre>` | les deux thèmes |
| *One message you can send* | `coachLine_<signe>_<situation>` **+** `coachLineTone_<situation>_<élémentVenus>` | combinaison |

**La ligne premium n'est pas une seconde chaîne rédigée à part.** C'est la
ligne de base **suivie** d'une adaptation de ton. Ce choix divise le corpus par
douze : `coachLineTone` compte 8 situations × 4 éléments = **32 clés**, contre
12 × 8 = 96 si chaque paire signe/situation avait sa variante. Le rendu reste
personnalisé parce que la combinaison, elle, est unique.

### 7.3 Nommage des clés i18n

```
coachSign_<sign>_rhythm | _works | _avoid          # 12 × 3 = 36
coachSituation_<situation>                          # libellé
coachSituation_<situation>_intent                   # « ce que tu es en train de faire »
coachSituation_<situation>_reflect                  # la question au lecteur
coachLine_<sign>_<situation>                        # la phrase copiable
coachMoon_<sign> | coachMercury_<sign>
  | coachVenus_<sign> | coachMars_<sign>            # 12 × 4 = 48   (premium)
coachTension_<sign>                                 # 12           (premium)
coachVenusWords_<element>                           # 4            (premium)
coachLineTone_<situation>_<element>                 # 32           (premium)
coachSynastry_<element>_<element>                   # 16           (premium)
```

`<sign>` en minuscules (`aries`…`pisces`) — c'est déjà la convention des
familles `dailyHoroscopeMoodV2_*` et la liste `SIGNS` du validateur
([validate-mobile-i18n-usage.mjs:33](../scripts/validate-mobile-i18n-usage.mjs#L33)).
`<element>` ∈ `fire | earth | air | water`.

### 7.4 Budget de contenu, chiffré

| Palier | Clés EN | Traductions (× 7 locales) |
|---|---|---|
| **P0** — 12 signes × 4 situations | 36 + 12 + 48 + ~14 de chrome = **≈ 110** | ≈ 770 |
| **P1** — premium + 4 situations | 12 + 48 + 48 + 12 + 4 + 32 + 16 = **≈ 172** | ≈ 1 204 |
| **Total P1** | **≈ 282** | **≈ 1 974** |

C'est le vrai coût de la feature, et il est en **rédaction**, pas en code.
Deux conséquences opérationnelles :

- `npm run validate:locales` **échoue** dès qu'une locale a une clé de moins
  ([validate-mobile-locales.js](../scripts/validate-mobile-locales.js)). Les 8
  locales doivent atterrir dans le **même commit**.
- La copie EN est dupliquée entre `apps/mobile/locales/en.json` et
  `apps/web/messages/en.json` — c'est le précédent posé par `exploration.ts`
  (« all wording lives in apps/*/locales|messages »). Voir §9.8 pour le garde-
  fou croisé à ajouter.

---

## 8. Exemples de contenu original — Aries, Cancer, Capricorn

Contenu **entièrement original**, écrit pour valider le format. Trois signes
seulement, comme demandé. Le reste s'écrit sur ce gabarit.

### 8.1 Aries

**FREE — Start a conversation**

> **Their rhythm** — Aries energy moves first and asks later. It reads
> hesitation as disinterest more often than as politeness.
>
> **What usually works** — Say the thing. One clear sentence with an actual
> point in it will travel further than three careful ones. Leaving room for
> them to decide keeps it from feeling like a demand.
>
> **What to avoid** — Long wind-ups. Hinting and hoping it lands. Testing
> whether they'll notice you're upset instead of saying you are.
>
> **Try saying** — *"I'll skip the build-up: I liked talking to you and I'd
> like to do it again. Open to that?"*
>
> **A question for you** — What were you actually hoping to hear back? Try
> naming that first, to yourself.

**PREMIUM — Ask for clarity, personnalisé** (Lune Cancer · Mercure Bélier ·
Vénus Taureau · Mars Bélier)

> **Their communication rhythm** *(Mercury in Aries)* — Fast, headline-first.
> They often answer before finishing the thought, then refine. A reply that
> arrives in ten seconds is not carelessness; it's their default speed.
>
> **Emotional subtext** *(Moon in Cancer)* — Under the speed there's a softer
> read of tone. Directness lands well; coldness does not. The two are easy to
> confuse in writing.
>
> **Best tone** *(Venus in Taurus)* — Warm and unhurried. Say what you want,
> then stop. Don't stack three qualifiers behind it.
>
> **Words to try** — *honestly · I'd rather ask · where you're at · no rush on
> the answer*
> **Words to avoid** — *maybe we should probably · I don't want to bother you
> but · just wondering if perhaps*
>
> **If tension appears** *(Mars in Aries)* — Heat comes quickly and passes
> quickly. Answering the heat with more heat locks it in. Answering it an hour
> later, plainly, usually dissolves it.
>
> **One message you can send** — *"I'd rather ask than guess: where do you
> feel this is going? Take your time — I'd just like to actually know."*
>
> **A question for you** — Is it clarity you want, or reassurance? They're
> different messages, and only one of them is answerable.

**⚠️ Warning de rédaction — Aries** — Ne jamais écrire « soyez agressif »,
« montrez qui commande », « ils aiment la conquête ». Ce sont des conseils de
domination déguisés en astrologie. La direction correcte est **la clarté**,
jamais **la pression**.

### 8.2 Cancer

**FREE — Start a conversation**

> **Their rhythm** — Cancer energy opens sideways. Warmth arrives before
> information, and trust arrives well after both.
>
> **What usually works** — Say what you enjoyed, specifically. A small true
> detail does more than a large compliment. Let the door stay open instead of
> asking them to walk through it now.
>
> **What to avoid** — Dry one-word replies. Teasing before you know how it
> lands. Treating a slow answer as a verdict.
>
> **Try saying** — *"I keep thinking about the thing you said about your
> grandmother's kitchen. It stayed with me."*
>
> **A question for you** — Are you offering warmth, or asking for it? Both are
> fine — but the message reads differently depending which one it is.

**PREMIUM — Repair a misunderstanding, personnalisé** (Lune Vierge · Mercure
Cancer · Vénus Gémeaux · Mars Balance)

> **Their communication rhythm** *(Mercury in Cancer)* — They remember the
> tone of a message longer than its content. Rephrasing gently often works
> better than explaining what you originally meant.
>
> **Emotional subtext** *(Moon in Virgo)* — Hurt tends to come out as a
> correction of details rather than as "that hurt". If the reply is suddenly
> about facts, the feeling is usually underneath it.
>
> **Best tone** *(Venus in Gemini)* — Light but sincere. Humour helps here,
> as long as it isn't aimed at the thing that went wrong.
>
> **Words to try** — *I think I misread that · that's on me · can I ask what
> you meant*
> **Words to avoid** — *you're overreacting · I already explained · that's not
> what I said*
>
> **If tension appears** *(Mars in Libra)* — Conflict rarely arrives loudly.
> It arrives as politeness with the warmth removed. Naming it kindly is
> usually more effective than waiting for it to pass.
>
> **One message you can send** — *"I think I read that wrong, and I'd rather
> fix it than let it sit. Can I ask what you actually meant?"*
>
> **A question for you** — Do you want to be understood, or do you want to be
> agreed with? Only the first one is repairable in a message.

**⚠️ Warning de rédaction — Cancer** — Interdire « ils sont susceptibles »,
« il faut les ménager », « ils font du chantage affectif ». C'est un
diagnostic, pas une nuance. Écrire la **sensibilité au ton** comme une
information utile, jamais comme une fragilité à manœuvrer.

### 8.3 Capricorn

**FREE — Start a conversation**

> **Their rhythm** — Capricorn energy tends to trust what's demonstrated over
> what's declared. Interest reads as reliability more than as intensity.
>
> **What usually works** — Be concrete. A real suggestion with a real time in
> it says more than an enthusiastic paragraph. Following through on the small
> thing counts double.
>
> **What to avoid** — Big promises with no next step. Rearranging plans twice.
> Reading their reserve as disinterest before you've given it a week.
>
> **Try saying** — *"I'd like to see you again. Thursday or Sunday both work
> for me — either easier?"*
>
> **A question for you** — Can you actually do the thing you're about to
> propose? With this energy, the offer and the follow-through are read as one
> message.

**PREMIUM — Set a boundary, personnalisé** (Lune Poissons · Mercure Verseau ·
Vénus Scorpion · Mars Capricorne)

> **Their communication rhythm** *(Mercury in Aquarius)* — They process by
> stepping back. Silence after a serious message is often thinking, not
> withdrawal. Give the sentence room instead of sending a second one.
>
> **Emotional subtext** *(Moon in Pisces)* — Under the composure, tone lands
> deeply. A boundary said flatly can be heard as a verdict, so the reassurance
> isn't decoration here — it's the half that makes it survivable.
>
> **Best tone** *(Venus in Scorpio)* — Direct and private. Say it once,
> clearly, without softening it into ambiguity. Half-said things read as
> withholding.
>
> **Words to try** — *I need · this isn't about you · I'd still like*
> **Words to avoid** — *you always · never mind, forget it · if you really
> cared*
>
> **If tension appears** *(Mars in Capricorn)* — Friction shows up as
> withdrawal into work or logistics. Pushing for an emotional response usually
> extends it. A short, calm restatement a day later usually doesn't.
>
> **One message you can send** — *"I need slower evenings this week — it's
> about my capacity, not about you. I'd still like to see you Sunday if that
> works."*
>
> **A question for you** — Is this a boundary, or a request for them to change?
> Naming which one it is, first to yourself, changes the whole message.

**⚠️ Warning de rédaction — Capricorn** — Bannir « froids », « carriéristes »,
« émotionnellement indisponibles ». Écrire la **réserve** comme un rythme, pas
comme un défaut. Et ne jamais suggérer d'impressionner par le statut, l'argent
ou la réussite : c'est du conseil de performance sociale, pas de communication.

### 8.4 Ce que ces trois fiches valident

- Le gabarit tient en 90 mots (free) et 200 mots (premium) — lisible sans
  scroll interminable sur un téléphone.
- Chaque section premium est **omissible** indépendamment : si Vénus manque,
  la fiche reste cohérente.
- La question finale porte toujours sur **le lecteur**, jamais sur l'autre.
  C'est ce qui distingue un guide de réflexion d'un manuel de manipulation.
- Aucune phrase ne promet un résultat. Vérifier chaque ligne au grep de §12.6.

---

## 9. Architecture technique

### 9.1 Fichiers à créer

| Fichier | Rôle |
|---|---|
| `packages/shared/src/coach/types.ts` | `CoachSign`, `CoachSituation`, `CoachLevel`, `CoachSection`, `CoachResult` |
| `packages/shared/src/coach/situations.ts` | `SITUATIONS` (métadonnées : clé, niveau, ordre) |
| `packages/shared/src/coach/select.ts` | `buildCoachResult(input): CoachResult` — **sélecteur pur et déterministe**, ne renvoie que des clés i18n |
| `packages/shared/src/coach/index.ts` | barrel |
| `packages/shared/src/coach/__tests__/select.test.ts` | vitest — déterminisme, omissions, aucune clé hors pool |
| `apps/mobile/app/premium-screens/conversation-guide.tsx` | l'écran |
| `apps/mobile/components/ui/ConversationGlyph.tsx` | glyphe de carte (optionnel — voir §9.3) |
| `apps/web/src/components/ConversationGuideOverview.tsx` | équivalent web |
| `apps/web/src/app/[locale]/app/premium/celestial/conversation-guide/page.tsx` | route web |
| `supabase/migrations/<ts>_conversation_guide_policy.sql` | ligne de policy + quota d'aperçu |
| `scripts/validate-coach-content.mjs` | lint de conformité du contenu (§12.6) |

### 9.2 Fichiers à modifier

| Fichier | Modification | Obligatoire ? |
|---|---|---|
| [packages/shared/src/index.ts](../packages/shared/src/index.ts) | rien — exporter via un sous-chemin, comme `astrology` | — |
| [packages/shared/package.json](../packages/shared/package.json) | ajouter `"./coach": "./src/coach/index.ts"` dans `exports` | ✅ |
| [apps/mobile/services/premiumUsage.ts](../apps/mobile/services/premiumUsage.ts) | `FeatureKey` += `'conversation-guide'` ; `FEATURE_TIERS` += `'premium'` ; `SERVER_ENFORCED_FEATURES` += `'conversation-guide': 'conversation_guide'` | ✅ |
| [apps/mobile/app/premium-screens/_layout.tsx](../apps/mobile/app/premium-screens/_layout.tsx) | `<Stack.Screen name="conversation-guide" />` | ✅ |
| [apps/mobile/constants/premiumCatalog.ts](../apps/mobile/constants/premiumCatalog.ts) | `CELESTIAL_FEATURES` += `{ key: 'conversationGuide', route: '/premium-screens/conversation-guide' }` | ✅ |
| [apps/mobile/components/ui/PremiumCardGlyph.tsx](../apps/mobile/components/ui/PremiumCardGlyph.tsx) | `case 'conversationGuide':` dans le switch (`:127`). Le `default:` retombe sur `PremiumGlyph`, donc rien ne casse — mais trois cartes portent déjà ce glyphe générique et la nouvelle serait visuellement indistinguable | recommandé |
| [apps/mobile/components/PremiumGate.tsx](../apps/mobile/components/PremiumGate.tsx) | `getFeatureDisplayName` : le `Record<FeatureKey, string>` est **exhaustif**, ajouter la clé sinon **erreur TypeScript** (`:143-156`) | ✅ |
| [apps/mobile/app/chat/[id].tsx](../apps/mobile/app/chat/[id].tsx) | 3e chip dans `headerActions` (`:458-476`) | ✅ (P0) |
| [apps/mobile/app/(tabs)/profile.tsx](../apps/mobile/app/(tabs)/profile.tsx) | encart d'entrée près de `dailyNudge` (`:524-542`) | ✅ (P0) |
| [apps/mobile/app/(tabs)/discover.tsx](../apps/mobile/app/(tabs)/discover.tsx) | entrée dans l'état « deck épuisé » (`:614-632`) | recommandé |
| `apps/mobile/locales/{en,fr,es,pt,de,ja,ar,zh}.json` | ≈ 110 clés × 8 | ✅ |
| `apps/web/messages/{…}.json` | idem, namespace `webApp` | ✅ (P1) |
| [scripts/validate-mobile-i18n-usage.mjs](../scripts/validate-mobile-i18n-usage.mjs) | **ajouter la famille dynamique `coach*`** — sinon le script signale un call site dynamique non reconnu et **échoue** | ✅ |
| [apps/web/src/components/AppShell.tsx](../apps/web/src/components/AppShell.tsx) | lien de nav (`:118-135`) | ✅ (P1) |
| [apps/mobile/app/_layout.tsx](../apps/mobile/app/_layout.tsx) | `case 'conversationGuide':` dans le switch de push (`:594-624`) | ✅ (P2) |
| [package.json](../package.json) | `"validate:coach-content"` + l'agréger dans `validate:locales` ou la CI | ✅ |

### 9.3 Structure de l'écran mobile

```tsx
// apps/mobile/app/premium-screens/conversation-guide.tsx
//
// PAS de <PremiumGate> autour de l'écran. Voir §4.3 du plan : PremiumGate
// consomme l'aperçu au montage, ce qui brûlerait la situation gratuite.

export default function ConversationGuideScreen() {
  // 1. params : ?sign=cancer & ?situation=start & ?profileId=<uuid>
  // 2. état : signe sélectionné, situation sélectionnée, décision du gate
  // 3. si profileId → get-profile-chart pour la couche premium
  // 4. buildCoachResult({ signe, situation, placements, tier, previewGranted })
  // 5. rendu des sections, chaque section nullable
}
```

Séquence du gate, à implémenter **exactement** ainsi :

```
tap sur une situation
  ├─ situation.level === 'free'              → afficher, aucun appel réseau
  ├─ canAccessFeature('conversation-guide')  → afficher (abonné)
  ├─ AsyncStorage.coach_preview_date === today → afficher (rejeu du jour)
  └─ sinon, UNE SEULE FOIS par montage :
       enforcePremiumFeature('conversation_guide')
         ├─ allowed && reason==='free_preview' → afficher + écrire la date + bandeau
         ├─ allowed && reason==='ok'           → afficher
         ├─ 'free_preview_exhausted'           → carte « reviens demain / passe Celestial »
         ├─ 'insufficient_tier'|'error' && canAccessFeature() → afficher
         │    (même politique optimiste que PremiumGate.tsx:66-77 : ne jamais
         │     paywaller quelqu'un qui paie réellement)
         └─ autre                              → carte d'upsell
```

### 9.3 bis — Contrat de paramètres, stockage local, presse-papier

**Paramètres de route** (`useLocalSearchParams`, même motif que
[synastry.tsx:110-119](../apps/mobile/app/premium-screens/synastry.tsx#L110-L119),
qui gère déjà `profileId` avec repli `matchId`) :

| Param | Type | Origine | Défaut |
|---|---|---|---|
| `sign` | `aries`…`pisces`, minuscules | chip de chat, deep link, push | `undefined` → écran de sélection |
| `situation` | `start`\|`clarity`\|`repair`\|`boundary` | deep link, push | `start` |
| `profileId` | UUID | chip de chat, fiche profil | `undefined` → aucune couche premium |

**Validation obligatoire** : `sign` et `situation` viennent de l'extérieur
(deep link, notification). Les valider contre les listes exportées par
`packages/shared/src/coach` et retomber sur le défaut en cas de valeur inconnue
— jamais rendre un `t()` construit avec une entrée non validée, sinon l'écran
affiche `[missing "…" translation]` à un utilisateur.

**Clé AsyncStorage** : `coach:preview-date` → `"YYYY-MM-DD"`.
Une seule clé, pas une par situation (§4.2). Effacée au `SIGNED_OUT`, comme
`resetActivityThrottle()` l'est déjà dans
[_layout.tsx](../apps/mobile/app/_layout.tsx) — sans quoi l'aperçu du compte
précédent fuit sur le compte suivant du même appareil.

**Presse-papier** : `expo-clipboard` est **déjà une dépendance** (`~8.0.8`,
utilisé en [settings/index.tsx:261](../apps/mobile/app/settings/index.tsx#L261)).
Aucune dépendance à ajouter. `Clipboard.setStringAsync()` fonctionne aussi sur
l'export web. Accompagner la copie d'un retour haptique via
[services/haptics.ts](../apps/mobile/services/haptics.ts).

**Export web du bundle mobile** : chaque écran premium porte des branches
`Platform.OS === 'web'` (hauteurs `100vh`, `WebTabWrapper`). Reprendre le
motif de `daily-horoscope.tsx` pour que l'écran ne casse pas la mise en page de
l'export web, même si la vraie surface web est `apps/web` (§ Annexe B, point 4).

### 9.4 Le sélecteur partagé

Contrat, calqué sur `exploration.ts` (même doctrine : logique partagée, prose
dans les fichiers de langue) :

```ts
export interface CoachInput {
  sign: CoachSign;                  // signe solaire du destinataire
  situation: CoachSituation;
  placements?: {                    // absent = niveau L0
    moon?: string | null;
    mercury?: string | null;
    venus?: string | null;
    mars?: string | null;
  } | null;
  selfPlacements?: { … } | null;    // pour la note de synastrie
  risingAllowed?: boolean;          // false par défaut — voir §6.4
  tier: 'free' | 'premium' | 'premium_plus';
  previewGranted?: boolean;
}

export interface CoachSection {
  id: 'rhythm'|'works'|'avoid'|'line'|'reflect'
    | 'mercury'|'moon'|'venus'|'words'|'mars'|'synastry';
  translationKey: string;
  toneKey?: string;                 // second segment pour 'line' en premium
  premium: boolean;
  order: number;
}

export function buildCoachResult(input: CoachInput): {
  sections: CoachSection[];
  level: 'L0'|'L1'|'L2'|'L3';
  copyableKey: string;              // la clé de la phrase à copier
  omitted: string[];                // ce qui a été retiré faute de donnée
};
```

Propriétés garanties par les tests :

- **Déterminisme** : même entrée → même sortie ordonnée (le test de
  `exploration.test.ts` fait exactement ça).
- **Aucune clé hors pool** : `allCoachKeys()` exporté, et le lint i18n valide
  que le pool ⊆ `en.json`.
- **Omission, jamais invention** : une donnée absente retire la section ; elle
  ne déclenche jamais un repli implicite (sauf `synastry`, explicite).
- **Pas d'aléatoire, pas d'horloge.** Si une rotation quotidienne est ajoutée
  plus tard, la seed doit être passée en paramètre — comme le fait déjà
  `pickLevel(seed, axis)` dans `daily-horoscope.tsx`.

### 9.5 Migration Supabase

```sql
-- supabase/migrations/<timestamp>_conversation_guide_policy.sql
begin;

INSERT INTO public.premium_feature_policy
  (feature_key, required_tier, daily_quota, free_preview_quota)
VALUES
  ('conversation_guide', 'celestial', 100, 1)
ON CONFLICT (feature_key) DO UPDATE
  SET required_tier      = EXCLUDED.required_tier,
      daily_quota        = EXCLUDED.daily_quota,
      free_preview_quota = EXCLUDED.free_preview_quota,
      updated_at         = NOW();

commit;
```

Trois précisions vérifiées :

- `required_tier` prend `'celestial'` / `'cosmic'`, **pas** `'premium'` /
  `'premium_plus'` — c'est la valeur du seed
  ([20260419000006_premium_server_gating.sql:95-108](../supabase/migrations/20260419000006_premium_server_gating.sql#L95-L108)).
- `free_preview_quota = 1` est **obligatoire**, pas optionnel :
  [validate-premium-gating.mjs](../scripts/validate-premium-gating.mjs) échoue
  si une feature de `SERVER_ENFORCED_FEATURES` n'a pas de quota d'aperçu
  (check n° 2). C'est précisément le garde-fou qui a été écrit après le bug de
  l'aperçu perdu.
- `daily_quota = 100` pour les abonnés : généreux mais borné, cohérent avec
  `priority_messages` (100) et `daily_horoscope` (50).

**Aucune nouvelle edge function n'est nécessaire en P0.** `get-profile-chart`
et `get_my_full_profile` couvrent tous les besoins de lecture.

### 9.6 Contenu statique ou backend ?

**Statique, dans le bundle.** Détail en §10. Deux conséquences à assumer dès
maintenant :

1. **Pas d'OTA.** Une coquille dans une fiche attend le build suivant et la
   revue Play. D'où le lint de contenu (§12.6) et la relecture humaine des 8
   locales **avant** le build.
2. **Le contenu n'est pas un secret.** Le gate serveur rend la **décision** et
   la **comptabilité** fiables ; il ne rend pas les chaînes inaccessibles à
   qui inspecte le bundle. C'est la limite déjà documentée en
   [docs/premium-free-preview.md](./premium-free-preview.md#limite-connue), et
   elle est acceptable ici : la valeur perçue est la présentation
   contextualisée, pas le texte brut.

### 9.7 i18n — les pièges à connaître avant d'écrire

- **Schéma plat.** Mobile = clés plates dans `locales/*.json` avec i18n-js et
  placeholders `{{var}}`. Web = namespaces next-intl (`webApp.*`) avec `{var}`.
  **Les deux syntaxes ne sont pas interchangeables**, et
  `validate-mobile-locales.js` vérifie l'égalité des ensembles de placeholders
  entre EN et chaque locale.
- **Clé manquante ≠ chaîne vide.** i18n-js renvoie
  `[missing "xx.key" translation]` — une chaîne **truthy**. Le pattern
  `t('k') || 'fallback'` ne protège donc pas. Le repo a déjà un helper pour ça,
  `resolveOptional()`
  ([natal-chart.tsx:31-45](../apps/mobile/app/premium-screens/natal-chart.tsx#L31-L45)).
  **Le réutiliser** — c'est la seule façon correcte d'omettre une section
  optionnelle.
- **Les clés dynamiques doivent être déclarées.**
  `` t(`coachSign_${sign}_works`) `` est invisible au scanner statique. La
  famille doit être ajoutée à `FAMILIES` dans
  [validate-mobile-i18n-usage.mjs](../scripts/validate-mobile-i18n-usage.mjs)
  avec l'ensemble **exhaustif** des suffixes, sinon le script « reports
  unrecognized dynamic call sites » et la CI casse.
- **RTL.** `ar` fait partie des 8 locales. Une phrase copiable entourée de
  guillemets typographiques doit être testée en RTL.

### 9.8 Garde-fou croisé mobile ↔ web

La copie EN existe en deux exemplaires (mobile `locales/en.json`, web
`messages/en.json` → `webApp`). Rien aujourd'hui ne vérifie qu'ils sont
d'accord. Ajouter dans `scripts/validate-coach-content.mjs` :

> pour chaque clé `coach*` de `apps/mobile/locales/en.json`, la clé
> correspondante doit exister dans `apps/web/messages/en.json` sous `webApp`,
> **et porter exactement la même chaîne**.

Sans ce contrôle, les deux surfaces divergeront en trois mois, et la surface
qui divergera est celle du canal iOS — c'est-à-dire la seule que l'App Store
peut voir.

### 9.9 Analytics — branchement

Voir §11. Résumé du branchement : **aucune ligne d'analytics client en P0.**
La table `premium_usage` fournit gratuitement les ouvertures gatées, les
retours J+1 et l'épuisement des aperçus. Les événements clients arrivent avec
le socle `product_events` planifié en P1-9 de l'audit rétention.

---

## 10. Données et stockage

### 10.1 Comparatif des quatre options

| Critère | **A. Statique versionné** | **B. Table Supabase** | **C. Génération IA live** | **D. Hybride (A + IA hors-ligne)** |
|---|---|---|---|---|
| Coût de build | rédaction seule | + migration + RPC + RLS | ~0 en code | rédaction assistée |
| Coût à l'usage | **0** | 1 requête / ouverture | **$ par lecture, non borné** | 0 |
| Latence | instantanée | 100–400 ms | 2–8 s | instantanée |
| Hors-ligne | ✅ | ✗ | ✗ | ✅ |
| Correction sans build | ✗ (pas d'OTA) | ✅ | ✅ | ✗ |
| Traduction | fichiers de locale, validés en CI | 8 lignes / clé en base, **non validées** | à chaque appel, non déterministe | idem A |
| Cohérence de ton | **totale** (relue) | totale | **non garantie** | totale (relue) |
| Risque de conformité | contrôlable en CI | contrôlable | **non contrôlable a priori** | contrôlable |
| Risque copyright | nul (rédigé) | nul | **modèle pouvant restituer du texte protégé** | audité à la relecture |
| Modération / signalement | inutile | inutile | **obligatoire** | inutile |

### 10.2 Recommandation

**Option A pour P0 et P1. Pas d'IA live. Point.**

Quatre raisons, dans l'ordre où elles feraient mal :

1. **Conformité.** Un texte généré à la volée ne peut pas être relu avant
   d'atteindre l'utilisateur. Sur une surface qui parle d'émotions, de limites
   et de tension relationnelle, c'est le seul chemin par lequel l'app peut
   produire un conseil manipulateur ou quasi-thérapeutique — les deux motifs
   de rejet identifiés en §12.
2. **Droit d'auteur.** L'ouvrage source existe. Un modèle sollicité sur
   « comment parler à un Bélier » peut restituer des formulations proches
   d'un texte protégé. Le contenu rédigé à la main est la seule preuve
   d'indépendance dont on dispose.
3. **Coût.** Sans borne. Une feature dont on espère plusieurs ouvertures par
   semaine et par utilisateur ne doit pas avoir de coût marginal par lecture
   tant que le revenu par utilisateur n'est pas établi.
4. **Cohérence de ton.** La voix JUNO est une contrainte forte (§12.3). Elle
   se tient mieux dans 282 chaînes relues que dans un prompt.

### 10.3 Où l'IA a sa place

**Hors ligne, comme outil d'auteur** — pour proposer des brouillons de fiches
que quelqu'un relit, réécrit et fait passer par le lint de §12.6 avant de les
committer. Le repo a déjà exactement ce motif : `marketingagent/` est un outil
de génération **hors du build de l'app**, avec son propre `package.json`.

Si un jour la génération live est reconsidérée, la condition d'entrée est une
**edge function** (jamais un appel client — la clé fuirait), avec cache par
`(sign, situation, locale)`, modération en sortie, et un bouton de
signalement. Ce n'est ni P0 ni P1.

### 10.4 Où le contenu vit exactement

```
packages/shared/src/coach/          → structure, ordre, sélection   (0 prose)
apps/mobile/locales/<loc>.json      → prose mobile, 8 locales
apps/web/messages/<loc>.json        → prose web, 8 locales, sous webApp
supabase/…                          → RIEN, sauf la ligne de policy
```

C'est le découpage exact de `exploration.ts`, et il permet à `fr.json` d'être
une vraie traduction éditoriale plutôt qu'un calque de l'anglais — ce qui
compte : les nuances de ton demandées ici ne se traduisent pas mot à mot.

---

## 11. Analytics et rétention

### 11.1 Point de départ : il n'y a rien

Vérifié : ni PostHog, ni Amplitude, ni Mixpanel, ni Segment, ni Firebase dans
[apps/mobile/package.json](../apps/mobile/package.json). Sentry uniquement,
avec un identifiant utilisateur **haché** (`_layout.tsx`), donc non rattachable
à un compte Supabase. La table `product_events` et
`apps/mobile/services/analytics.ts` sont **planifiées** (audit rétention §8.4,
P1-9) mais **n'existent pas** — grep confirmé, zéro occurrence.

Et il n'y a **pas d'OTA** : chaque événement client coûte un build + une revue
Play. Le plan est donc en deux voies.

### 11.2 Voie A — mesurable sans une ligne de code client

Enregistrer la feature dans `premium_feature_policy` suffit à obtenir, dès le
premier jour, une télémétrie réelle via `premium_usage`. **C'est l'argument
décisif pour router la feature par le gate serveur même si le gratuit n'est pas
gaté.**

```sql
-- 1. Ouvertures gatées par jour
SELECT usage_date,
       COUNT(DISTINCT user_id) AS users,
       SUM(view_count)         AS opens
  FROM premium_usage
 WHERE feature_key = 'conversation_guide'
 GROUP BY 1 ORDER BY 1 DESC;

-- 2. Retour le lendemain SUR LA FEATURE (proxy de conversation_coach_returned_next_day)
WITH d AS (
  SELECT DISTINCT user_id, usage_date
    FROM premium_usage WHERE feature_key = 'conversation_guide'
)
SELECT a.usage_date,
       COUNT(DISTINCT a.user_id)                                        AS day0,
       COUNT(DISTINCT b.user_id)                                        AS returned_d1,
       ROUND(100.0 * COUNT(DISTINCT b.user_id)
             / NULLIF(COUNT(DISTINCT a.user_id), 0), 1)                 AS pct
  FROM d a
  LEFT JOIN d b ON b.user_id = a.user_id AND b.usage_date = a.usage_date + 1
 GROUP BY 1 ORDER BY 1 DESC;

-- 3. Conversion : aperçu consommé, puis abonnement dans les 7 jours
WITH preview AS (
  SELECT DISTINCT u.user_id, MIN(u.usage_date) AS first_preview
    FROM premium_usage u
   WHERE u.feature_key = 'conversation_guide'
   GROUP BY u.user_id
)
SELECT COUNT(*)                                              AS previewed,
       COUNT(*) FILTER (WHERE s.user_id IS NOT NULL)         AS converted_7d,
       ROUND(100.0 * COUNT(*) FILTER (WHERE s.user_id IS NOT NULL)
             / NULLIF(COUNT(*), 0), 1)                       AS pct
  FROM preview p
  LEFT JOIN LATERAL (
    SELECT se.user_id FROM subscription_events se
     WHERE se.user_id = p.user_id
       AND se.created_at >= p.first_preview
       AND se.created_at <  p.first_preview + INTERVAL '7 days'
       AND se.tier IN ('premium', 'premium_plus')
     LIMIT 1
  ) s ON TRUE;

-- 4. Comparaison avec l'échantillon existant : le Guide bat-il le thème natal ?
SELECT feature_key,
       COUNT(DISTINCT user_id) AS users,
       SUM(view_count)         AS opens
  FROM premium_usage
 WHERE feature_key IN ('conversation_guide', 'natal_chart')
   AND usage_date >= CURRENT_DATE - 30
 GROUP BY 1;
```

La requête n° 4 est **le verdict de l'expérience** : si le Conversation Guide
génère plus d'ouvertures répétées que `natal_chart` sur le même quota d'aperçu,
la thèse de §1.2 est validée par les données, pas par l'intuition.

### 11.3 Voie B — les 8 événements clients

Dépendance : la table `product_events` + `apps/mobile/services/analytics.ts`
(audit rétention P1-9). À embarquer **dans le même build** que la feature —
sinon la voie B glisse d'une revue Play entière.

| Événement | Emplacement probable | Propriétés | Pourquoi c'est utile |
|---|---|---|---|
| `conversation_coach_opened` | `conversation-guide.tsx`, montage | `source` (`chat`\|`profile`\|`hub`\|`discover`\|`push`\|`deeplink`), `tier`, `has_target_profile` | Dit **par quelle porte** on entre. Si `chat` domine, l'entrée contextuelle est la vraie feature et le hub est décoratif. |
| `conversation_coach_sign_selected` | handler du sélecteur | `sign`, `preselected` (bool), `source` | Distingue « je consulte pour quelqu'un de précis » de « je butine ». Le second n'a aucune valeur de rétention. |
| `conversation_coach_situation_selected` | handler des onglets | `situation`, `level` (`free`\|`gated`), `sign` | Le vrai classement des besoins. Sert à choisir les 4 situations de P1 **par les données**, pas à l'instinct. |
| `conversation_coach_result_viewed` | après rendu, une fois par (signe, situation) | `sign`, `situation`, `level` (`L0`…`L3`), `sections_shown`, `sections_omitted` | `sections_omitted` mesure **la couverture réelle des données** : combien de fiches premium sont amputées faute de `birth_chart`. Impossible à deviner autrement. |
| `conversation_coach_message_copied` | handler de « Copy » | `sign`, `situation`, `level`, `chars` | **L'événement nord de la feature.** Copier ≠ lire : c'est l'intention d'envoyer. À suivre en taux `copied / result_viewed`. |
| `conversation_coach_premium_gate_seen` | branche de refus | `reason` (le `PremiumGateReason` brut), `situation`, `days_since_signup` | Dit si le paywall arrive trop tôt dans le cycle de vie. Réutiliser le code de raison, pas un booléen. |
| `conversation_coach_preview_used` | `reason === 'free_preview'` | `situation`, `count_today`, `days_since_signup` | L'aperçu crée-t-il une habitude ou est-il consommé une fois puis oublié ? Recoupable avec la voie A. |
| `conversation_coach_returned_next_day` | **dérivé en SQL, pas émis** | — | Ne jamais l'émettre côté client : le client ne sait pas ce qu'il a fait hier. C'est la requête n° 2 de §11.2. |

### 11.4 Les deux nombres qui décident

1. **`message_copied / result_viewed`.** Sous ~15 %, le contenu est joli mais
   pas utilisable — c'est la copy qu'il faut réécrire, pas la feature qu'il
   faut abandonner.
2. **Retour J+1 sur la feature** (requête n° 2). C'est la seule preuve que
   l'objet crée une habitude. À comparer au J+1 global de l'app.

Si le premier est bon et le second mauvais : le contenu marche, il manque le
rappel → P2 (push / email). Si le premier est mauvais : ne pas construire P1,
réécrire les fiches.

---

## 12. Store compliance & safety

### 12.1 Cartographie des risques

| Risque | Gravité | Où il se matérialiserait | Mitigation |
|---|---|---|---|
| Promesse relationnelle | **haute** | « Try saying » vendu comme une phrase qui marche | interdiction de toute promesse d'issue (§12.3) |
| Conseil quasi-thérapeutique | **haute** | `feelings`, `repair`, `boundary` | pas de vocabulaire clinique ; pas d'instruction sur ce qu'il **faut** ressentir |
| Conseil manipulateur | **haute** | « quoi dire pour obtenir X » | orienter vers la clarté, jamais vers l'obtention |
| Contenu sexuel / trop mature | moyenne | `flirt` | aucune allusion sexuelle ; classification store inchangée |
| Stéréotype négatif par signe | moyenne | « What to avoid » | interdiction des étiquettes de caractère (§12.3) |
| Dépendance émotionnelle | moyenne | usage compulsif avant chaque message | une seule phrase par fiche, pas de menu, pas de streak |
| Mineurs | **haute** | — | déjà couvert : `20260325000001_enforce_adult_profiles.sql` (18+ au niveau base) ; ne rien ajouter qui contourne |

### 12.2 Le vocabulaire déjà interdit dans le repo

[scripts/check-store-metadata.mjs](../scripts/check-store-metadata.mjs) bannit
notamment : `soulmate`, `perfect match`, `guaranteed compatibility`,
`prediction`, `find your match`, `it's a match`, `dating app`, `swipe-to-like`.

> ⚠️ **Trou de couverture à combler.** Ce script scanne la config store, les
> assets marketing, les emails transactionnels et la copy marketing **web** —
> il ne scanne **pas** `apps/mobile/locales/*.json`, explicitement (« NOT i18n
> prose »). Le contenu du Conversation Guide serait donc **le plus gros corpus
> de prose non contrôlé de l'app**. D'où §12.6.

### 12.3 Charte de contenu (normative)

**Modalité.**
- Toujours `may / often / can / tends to / usually`.
- Jamais `will / always / never / guaranteed / meant to be`.
- Jamais de deuxième personne prescriptive sur l'émotion : écrire « une façon
  de dire ceci est… », pas « tu dois lui dire que… ».

**Personnes.**
- Le destinataire est désigné par `they / them`. Aucun genre supposé.
- Aucun signe n'est décrit comme difficile, toxique, immature, froid,
  instable, ou « fait pour toi ».
- Décrire un **rythme**, jamais un **caractère**. « L'énergie Capricorne fait
  souvent davantage confiance à ce qui est démontré » ✅ / « les Capricornes
  sont froids » ✗.

**Manipulation — la ligne rouge.**
- Interdit : toute formulation dont l'objet est d'obtenir une réponse, une
  concession ou un rendez-vous par la technique. Pas de « ce qui la fera
  craquer », pas de « la phrase qui obtient toujours une réponse », pas de
  silence stratégique, pas de jalousie provoquée.
- Autorisé : dire clairement ce qu'on veut, et laisser l'autre libre.
- Toute fiche doit rester vraie si l'autre personne la lit par-dessus l'épaule.
  **C'est le test opérationnel.**

**Consentement et limites.**
- La situation `boundary` doit toujours contenir : la limite **et** la
  réassurance que ce n'est ni une punition ni un ultimatum.
- Toute situation qui touche au ralentissement (`slow`) affirme que « non »
  est une réponse complète.

**Santé mentale.**
- Aucun terme clinique : anxiété, attachement évitant, trauma, narcissique,
  dépression, thérapie, guérison.
- Aucun conseil sur ce qu'il **faut** ressentir. Uniquement des façons de
  **nommer** ce qui est déjà là.
- Si une fiche approche d'une détresse réelle, elle s'arrête et invite à
  parler à une personne de confiance. Elle ne propose pas de phrase.

**Disclaimer permanent.**
- Chaque résultat porte, non repliable : *« For reflection, not prediction.
  JUNO doesn't guarantee outcomes. »* — même registre que
  `onboardingIntentionsFootnote` (« Synastry is a lens, not a promise. JUNO
  does not guarantee outcomes. ») et que le pied de l'écran Synastry.

### 12.4 Règles droit d'auteur (normatives)

Six règles. Les trois premières sont structurelles — elles suffisent à elles
seules à rendre l'œuvre indépendante.

1. **Axe d'organisation différent.** La source organise par **rôles
   relationnels** (patron, employé, premier rendez-vous, ex, colocataire,
   parent, enfant). JUNO organise par **situations que l'utilisateur veut
   traverser** (`start`, `clarity`, `repair`, `boundary`…). N'introduire
   **aucune** grille de rôles, jamais — pas même en P2.
2. **Pas de grille signe × contexte.** Aucune section « en amour / au travail
   / en amitié » par signe. La deuxième dimension de JUNO est la situation, et
   c'est la seule.
3. **Pas de couverture exhaustive par paires.** Ne pas produire de matrice
   des 78 (ou 144) combinaisons signe × signe. La note de synastrie passe par
   les **éléments** (16 combinaisons), ce qui est un modèle astrologique
   standard et non protégeable.
4. **Zéro reprise de phrase.** Aucune formulation de la source, ni traduite,
   ni reformulée de près. Les exemples de §8 sont écrits pour ce document.
5. **Aucune citation, aucune attribution.** L'ouvrage n'est nommé nulle part
   dans l'app, les métadonnées store, le marketing, ni le code. Sa seule
   mention est cette ligne de documentation interne.
6. **Traçabilité de rédaction.** Chaque fiche est écrite depuis les axes
   généraux (élément, modalité, planète maîtresse, besoin communicationnel) —
   des notions astrologiques de domaine public — puis relue contre §12.3.
   Ajouter en tête de `packages/shared/src/coach/index.ts` un commentaire
   d'origine renvoyant à ce paragraphe.

### 12.5 Notes de revue store

Ajouter à [docs/app-store/juno-app-review-notes.md](./app-store/) un
paragraphe court, dans la section walkthrough :

> **Conversation Guide.** A static, editorially written communication guide.
> The user picks a zodiac sign and a situation (starting a conversation,
> asking for clarity, repairing a misunderstanding, setting a boundary) and
> receives a short reflection card with one suggested sentence they can edit
> and send. Nothing is generated at runtime, nothing is predicted, and no
> outcome is promised. The "Set a boundary" card exists specifically to help
> users say no clearly and kindly. Every card carries the standard "For
> reflection, not prediction" footer.

`check-store-metadata.mjs` fait des vérifications de **marqueurs positifs** sur
ce fichier (`DOC_CHECKS`) : ajouter du texte ne casse rien, en retirer oui.

### 12.6 Le lint de contenu — `scripts/validate-coach-content.mjs`

À écrire **avant** la première fiche, pas après. Il scanne toutes les clés
`coach*` des 8 locales mobile et des 8 fichiers web.

```
1. LEXIQUE INTERDIT (par locale, EN + traductions)
   soulmate · perfect match · guaranteed · will make them · always works
   he will / she will / they will (futur d'issue) · destined · meant to be
   manipulate · make them jealous · play hard to get
   anxiety · attachment style · narcissist · trauma · therapy · diagnose
   → FAIL, avec locale, clé et terme.

2. MODALITÉ (clés coachSign_*_works / *_avoid / coachMoon_* / … en EN)
   doit contenir au moins un hedge : may|often|can|tends to|usually|generally
   → FAIL sinon.

3. ÉTIQUETTES DE CARACTÈRE (EN)
   /\b(they|<sign>s) are (cold|difficult|toxic|needy|clingy|jealous|lazy)\b/i
   → FAIL.

4. LONGUEUR
   coachLine_*  ≤ 220 caractères (une phrase envoyable)
   coachSign_*  ≤ 320 caractères
   → FAIL.

5. COUVERTURE
   pour chaque situation active, les 12 signes doivent avoir une clé
   coachLine_<sign>_<situation> — pas 11.
   → FAIL (évite le « Bélier n'a pas de fiche » silencieux).

6. PARITÉ CROISÉE MOBILE ↔ WEB
   toute clé coach* de apps/mobile/locales/en.json existe dans
   apps/web/messages/en.json sous webApp, avec la MÊME chaîne.
   → FAIL (§9.8).

7. DISCLAIMER
   coachDisclaimer présent dans les 8 locales mobile et les 8 web.
   → FAIL.
```

Câblage : `"validate:coach-content": "node scripts/validate-coach-content.mjs"`
dans [package.json](../package.json), puis **une étape dédiée** dans
[.github/workflows/ci.yml](../.github/workflows/ci.yml) — le workflow enchaîne
déjà une étape par validateur (`validate:locales`, `validate:premium-gating`,
`validate:email-templates`, `validate:retention-guards`, puis lint → typecheck
→ test). Une étape séparée nomme la cause de l'échec dans l'UI GitHub ; un
agrégat dans `validate:locales` la noierait dans un rapport de parité.

**Sans OTA, un lint qui tourne en CI est moins cher qu'une correction qui
attend une revue Play.** C'est le même raisonnement que celui écrit en tête de
`validate-mobile-retention-guards.mjs`.

---

## 13. Plan d'implémentation priorisé

### P0 — prototype utile (12 signes × 4 situations)

**Objectif :** savoir si les gens ouvrent, copient et reviennent. Rien d'autre.

**Fichiers**

```
CRÉER
  packages/shared/src/coach/{types,situations,select,index}.ts
  packages/shared/src/coach/__tests__/select.test.ts
  apps/mobile/app/premium-screens/conversation-guide.tsx
  supabase/migrations/<ts>_conversation_guide_policy.sql
  scripts/validate-coach-content.mjs

MODIFIER
  packages/shared/package.json                         exports["./coach"]
  apps/mobile/services/premiumUsage.ts                 3 ajouts (§9.2)
  apps/mobile/components/PremiumGate.tsx               getFeatureDisplayName (exhaustif)
  apps/mobile/app/premium-screens/_layout.tsx          Stack.Screen
  apps/mobile/constants/premiumCatalog.ts              CELESTIAL_FEATURES
  apps/mobile/components/ui/PremiumCardGlyph.tsx       case 'conversationGuide'
  apps/mobile/app/chat/[id].tsx                        3e chip (entrée n° 1)
  apps/mobile/app/(tabs)/profile.tsx                   encart (entrée n° 2)
  apps/mobile/locales/*.json                           ≈ 110 clés × 8
  scripts/validate-mobile-i18n-usage.mjs               famille dynamique coach*
  package.json                                         validate:coach-content
  .github/workflows/ci.yml                             y brancher le lint
```

**Effort :** 1,5 j de code + **2–3 j de rédaction/traduction** (le poste
dominant). Le code n'est pas le chemin critique.

**Risques**
- La rédaction déborde → livrer 4 situations bien écrites plutôt que 8 tièdes.
- Oubli de la famille i18n dynamique → CI rouge, diagnostic non évident
  (le message parle de « unrecognized dynamic call site »).
- Oubli du `free_preview_quota` → `validate:premium-gating` rouge.
- `getFeatureDisplayName` oublié → **erreur de typecheck**, pas d'exécution :
  le `Record<FeatureKey, string>` est exhaustif.

**Critères d'acceptation**
1. Un compte gratuit ouvre l'écran, lit *Start a conversation* pour les 12
   signes, **sans aucun appel à `enforce_premium_feature`** (vérifiable au
   log réseau et par l'absence de ligne `premium_usage`).
2. Le premier tap sur une situation verrouillée en accorde **trois** pour la
   journée et écrit **exactement une** ligne `premium_usage`
   (`feature_key='conversation_guide'`, `view_count=1`).
3. Quitter et rouvrir l'écran le même jour ne crée pas de seconde ligne.
4. Le lendemain, l'aperçu est de nouveau disponible.
5. Un compte Celestial n'est jamais bloqué, même RPC en erreur (politique
   optimiste).
6. Une chip « Ways to say it » est présente dans le fil de chat et
   pré-sélectionne le signe de l'interlocuteur.
7. `npm run lint`, `npm run typecheck`, `npm run validate:locales`,
   `npm run validate:premium-gating`, `npm run validate:coach-content`
   passent tous.
8. Le test vitest de `buildCoachResult` couvre : déterminisme, omission
   Lune/Mercure/Vénus/Mars, ascendant jamais inclus sans heure de naissance,
   aucune clé hors pool.

### P1 — premium personnalisé + parité web

**Objectif :** transformer l'habitude en abonnement, et couvrir le canal iOS.

**Fichiers**

```
packages/shared/src/coach/select.ts        couches L1–L3
apps/mobile/app/premium-screens/conversation-guide.tsx
                                           lecture get-profile-chart via ?profileId
apps/mobile/lib/synastry.ts                réutiliser pickPlanetSign / getElement (aucune modif)
apps/mobile/locales/*.json                 ≈ 172 clés × 8
apps/web/src/components/ConversationGuideOverview.tsx        NOUVEAU
apps/web/src/app/[locale]/app/premium/celestial/conversation-guide/page.tsx  NOUVEAU
apps/web/src/components/AppShell.tsx       lien de nav
apps/web/messages/*.json                   miroir sous webApp
apps/mobile/services/analytics.ts          NOUVEAU (socle P1-9 de l'audit rétention)
supabase/migrations/<ts>_product_events.sql  NOUVEAU (idem)
```

**Effort :** 2 j de code + 4–5 j de rédaction/traduction.

**Risques**
- **Fiches amputées.** Beaucoup de profils n'ont pas de `birth_chart` complet.
  → instrumenter `sections_omitted` (§11.3) **dès P1**, et prévoir une carte
  « complète ton heure de naissance » plutôt qu'une fiche à trous.
- **Divergence mobile/web.** → §9.8, contrôle croisé obligatoire.
- **Rate limit** `get-profile-chart` : 100/h par appelant. Un utilisateur qui
  parcourt vingt profils s'en approche. → mettre en cache le thème par
  `profileId` pour la durée de la session.
- **Ascendant.** Ne pas céder à la tentation de l'ajouter parce que « la
  colonne existe » (§6.4).

**Critères d'acceptation**
1. Un compte Celestial ouvrant le Guide depuis un fil de chat voit les
   sections Mercure / Lune / Vénus / Mars **du destinataire**.
2. Un destinataire sans `birth_chart` produit une fiche L0 **cohérente** —
   pas une fiche avec des blocs vides.
3. Aucune section Ascendant n'apparaît pour un profil sans heure de naissance
   (test : un compte de test avec `birth_time IS NULL`).
4. La page web rend le même contenu que mobile pour un même
   (signe, situation) — vérifié par le contrôle croisé du lint.
5. `conversation_coach_result_viewed` porte `sections_omitted`.

### P2 — lifecycle et rétention

**Objectif :** créer le rappel. À ne construire que si le taux de copie de
§11.4 est bon.

**Fichiers**

```
supabase/functions/send-notification/          push « Today's way to say it »
apps/mobile/app/_layout.tsx                    case 'conversationGuide' (switch :594-624)
supabase/functions/send-email/templates.ts     template lifecycle (catégorie 'lifecycle')
apps/web/src/app/[locale]/app/…                cible de deep link, préfixe /app OBLIGATOIRE
supabase/migrations/<ts>_…_cron.sql            si envoi programmé
```

**Contraintes non négociables, déjà documentées dans CLAUDE.md**
- Les CTA d'email doivent rester sur le préfixe `/app` — `/en/app` **ne
  correspond pas** au filtre d'intent Android App Link.
- Un email de cycle de vie porte `category: 'lifecycle'` (désabonnable). Ne
  **jamais** le conditionner à `notification_preferences.promotions`, qui vaut
  `false` par défaut.
- Le push doit respecter une préférence dédiée. `notification_preferences`
  contient déjà `dailyHoroscope` ; ajouter `conversationGuide` avec un défaut
  **explicite**, et l'ajouter au `DEFAULT` de la colonne (précédent :
  `20260824000001_restore_d1_return_loop.sql`).
- Un seul rappel par semaine au maximum. Un guide de conversation qui notifie
  tous les jours devient exactement la dépendance émotionnelle listée en §12.1.

**Effort :** 1–2 j. **Risques :** fatigue de notification, désabonnements en
chaîne sur les autres lifecycle mails.

**Critères d'acceptation**
1. Le tap sur le push ouvre `/premium-screens/conversation-guide` (chemin
   froid **et** chaud).
2. Un compte ayant désactivé la préférence ne reçoit rien.
3. `npm run validate:email-templates` passe.
4. La période d'aperçu élargi (`free_preview_quota = 3`) est activable et
   réversible **en SQL seul**, sans build.

---

## 14. Première recommandation exécutable

### 14.1 Le plus petit patch utile

**Construire P0 sans la couche premium, sans le web, sans analytics client.**

Concrètement : **12 signes × 4 situations**, dont **une entièrement gratuite et
illimitée**, avec le gate serveur branché uniquement pour compter — parce que
compter est gratuit et que ne pas compter rend l'expérience ininterprétable.

### 14.2 Ordre exact des gestes

| # | Geste | Fichier | Vérification |
|---|---|---|---|
| 1 | Migration de policy | `supabase/migrations/<ts>_conversation_guide_policy.sql` | `npm run validate:premium-gating` |
| 2 | Clé client + map serveur | `apps/mobile/services/premiumUsage.ts` | idem (les deux moitiés doivent atterrir ensemble) |
| 3 | Nom d'affichage du gate | `apps/mobile/components/PremiumGate.tsx` | `npm run typecheck` |
| 4 | Sélecteur partagé + tests | `packages/shared/src/coach/*` | `npm run test --workspace=@astro/shared` |
| 5 | Lint de contenu | `scripts/validate-coach-content.mjs` | doit échouer sur un corpus vide, puis passer |
| 6 | Corpus EN (≈ 110 clés) | `apps/mobile/locales/en.json` | `validate:coach-content` |
| 7 | Famille i18n dynamique | `scripts/validate-mobile-i18n-usage.mjs` | `npm run validate:mobile:i18n-usage` |
| 8 | Les 7 autres locales | `apps/mobile/locales/*.json` | `npm run validate:locales` |
| 9 | L'écran | `app/premium-screens/conversation-guide.tsx` + `_layout.tsx` | manuel |
| 10 | Les trois entrées | `chat/[id].tsx`, `(tabs)/profile.tsx`, `premiumCatalog.ts` + `PremiumCardGlyph.tsx` | manuel |
| 11 | CI | `package.json`, `.github/workflows/ci.yml` | pipeline verte |

Étapes 1 → 3 dans **le même commit** : la migration seule ou la clé client
seule laisse `validate:premium-gating` en échec (c'est le but du garde-fou).

### 14.3 Contenu minimal à écrire

- 12 × `coachSign_<sign>_rhythm` / `_works` / `_avoid` — **36 chaînes**
- 12 × 4 `coachLine_<sign>_<situation>` — **48 chaînes**
- 4 × `coachSituation_<s>` + `_intent` + `_reflect` — **12 chaînes**
- ~14 chaînes de chrome (titre, sous-titre, disclaimer, boutons, copies du
  gate, bandeau d'aperçu)

**≈ 110 chaînes EN.** Les fiches de §8 en couvrent déjà 3 signes × 2
situations : le gabarit est validé, il reste à le dérouler.

### 14.4 L'expérience utilisateur cible

1. L'utilisateur est dans un fil de chat. Il ne sait pas quoi répondre.
2. Il tape la chip **« Ways to say it »**.
3. L'écran s'ouvre **déjà sur le signe de l'interlocuteur**, situation
   *Start a conversation*, contenu complet, aucun paywall.
4. Il lit 90 mots. Il tape **Copy**. Il revient au fil et colle.
5. Il voit trois autres situations. La première qu'il tape se déverrouille —
   avec les deux autres — pour la journée. Le bandeau dit la vérité :
   « aperçu du jour utilisé ».
6. Le lendemain, l'aperçu revient. Au bout de quelques jours, l'abonnement
   n'a plus besoin d'être vendu.

### 14.5 Comment mesurer le succès (sans une ligne d'analytics)

Deux semaines après la mise en production, exécuter les requêtes de §11.2 :

| Signal | Seuil de succès | Décision |
|---|---|---|
| Utilisateurs distincts touchant l'aperçu (req. 1) | ≥ 25 % des actifs | poursuivre |
| Retour J+1 sur la feature (req. 2) | ≥ 20 % | construire P2 |
| Conversion à 7 j après aperçu (req. 3) | > `natal_chart` | construire P1 |
| Ouvertures vs `natal_chart` (req. 4) | supérieur | la thèse §1.2 est validée |

Si les quatre sont sous les seuils, la réponse n'est ni P1 ni P2 : c'est
réécrire les 48 phrases `coachLine_*`. **Le produit, ici, c'est la copy.**

### 14.6 Comment éviter une refonte plus tard

Six décisions prises maintenant, chacune coûtant peu aujourd'hui et beaucoup
si on les repousse :

1. **Le sélecteur vit dans `packages/shared` dès P0**, même appelé par un seul
   consommateur. Le porter au web après coup imposerait de dupliquer la
   logique ou de la déplacer en cassant deux surfaces.
2. **`CoachInput` accepte `placements` dès P0**, même toujours `null`. Ajouter
   un paramètre plus tard change la signature et tous les call sites.
3. **La feature est enregistrée dans `premium_feature_policy` dès P0**, même
   si le bloc gratuit ne la consulte pas. C'est ce qui rend la voie A de §11
   possible sans build, et ce qui permet d'ouvrir/fermer les aperçus en SQL.
4. **`CoachSection` porte `order` et `premium` dès P0.** Ajouter des sections
   premium en P1 devient une extension du tableau, pas une réécriture du
   rendu.
5. **Le lint de contenu existe avant le contenu.** Écrire 282 chaînes puis
   découvrir qu'un tiers viole la charte est le pire scénario de ce plan —
   sans OTA, il se paie en semaines.
6. **Les clés i18n sont nommées pour 8 situations dès P0**, même si 4 sont
   écrites. Renommer une famille de clés en cours de route casse les 8 locales
   d'un coup.

---

## Annexe A — inventaire des fichiers audités

**Premium / gating**
[services/premiumUsage.ts](../apps/mobile/services/premiumUsage.ts) ·
[components/PremiumGate.tsx](../apps/mobile/components/PremiumGate.tsx) ·
[contexts/PremiumContext.tsx](../apps/mobile/contexts/PremiumContext.tsx) ·
[constants/premiumCatalog.ts](../apps/mobile/constants/premiumCatalog.ts) ·
[app/(tabs)/premium.tsx](../apps/mobile/app/(tabs)/premium.tsx) ·
[app/premium-screens/index.tsx](../apps/mobile/app/premium-screens/index.tsx) ·
[app/premium-screens/_layout.tsx](../apps/mobile/app/premium-screens/_layout.tsx) ·
[20260419000006_premium_server_gating.sql](../supabase/migrations/20260419000006_premium_server_gating.sql) ·
[20260823000001_free_preview_quota.sql](../supabase/migrations/20260823000001_free_preview_quota.sql) ·
[docs/premium-free-preview.md](./premium-free-preview.md)

**Surfaces astro**
[premium-screens/natal-chart.tsx](../apps/mobile/app/premium-screens/natal-chart.tsx) ·
[premium-screens/synastry.tsx](../apps/mobile/app/premium-screens/synastry.tsx) ·
[premium-screens/daily-horoscope.tsx](../apps/mobile/app/premium-screens/daily-horoscope.tsx) ·
[lib/synastry.ts](../apps/mobile/lib/synastry.ts) ·
[services/astrology.ts](../apps/mobile/services/astrology.ts) ·
[utils/zodiac.ts](../apps/mobile/utils/zodiac.ts) ·
[utils/zodiacElements.ts](../apps/mobile/utils/zodiacElements.ts)

**Partagé**
[packages/shared/src/astrology/types.ts](../packages/shared/src/astrology/types.ts) ·
[stored.ts](../packages/shared/src/astrology/stored.ts) ·
[exploration.ts](../packages/shared/src/astrology/exploration.ts) ·
[packages/shared/package.json](../packages/shared/package.json)

**Backend**
[00000000000000_full_schema.sql](../supabase/migrations/00000000000000_full_schema.sql) (profils, `premium_usage`) ·
[20260312_unified_subscriptions.sql](../supabase/migrations/20260312_unified_subscriptions.sql) ·
[functions/get-profile-chart/index.ts](../supabase/functions/get-profile-chart/index.ts) ·
[functions/send-email/templates.ts](../supabase/functions/send-email/templates.ts) ·
[functions/send-daily-horoscope/index.ts](../supabase/functions/send-daily-horoscope/index.ts)

**Navigation / entrées**
[app/_layout.tsx](../apps/mobile/app/_layout.tsx) (deep links `:364-425`, push `:594-624`) ·
[app/(tabs)/_layout.tsx](../apps/mobile/app/(tabs)/_layout.tsx) ·
[app/chat/[id].tsx](../apps/mobile/app/chat/[id].tsx) ·
[app/(tabs)/profile.tsx](../apps/mobile/app/(tabs)/profile.tsx) ·
[app/(tabs)/discover.tsx](../apps/mobile/app/(tabs)/discover.tsx) ·
[app.json](../apps/mobile/app.json) (intent filters)

**Web**
[components/AppShell.tsx](../apps/web/src/components/AppShell.tsx) ·
[components/NatalChartOverview.tsx](../apps/web/src/components/NatalChartOverview.tsx) ·
`apps/web/src/app/[locale]/app/premium/**` · `apps/web/messages/*.json`

**Garde-fous / CI**
[validate-premium-gating.mjs](../scripts/validate-premium-gating.mjs) ·
[validate-mobile-i18n-usage.mjs](../scripts/validate-mobile-i18n-usage.mjs) ·
[validate-mobile-locales.js](../scripts/validate-mobile-locales.js) ·
[validate-locale-contract.mjs](../scripts/validate-locale-contract.mjs) ·
[validate-mobile-retention-guards.mjs](../scripts/validate-mobile-retention-guards.mjs) ·
[check-store-metadata.mjs](../scripts/check-store-metadata.mjs)

**Docs**
[retention-day2-audit-2026-08.md](./retention-day2-audit-2026-08.md) ·
[app-store/juno-metadata.md](./app-store/juno-metadata.md) ·
[conversation-coach-sign-concepts-2026-08.md](./conversation-coach-sign-concepts-2026-08.md) ·
[../CLAUDE.md](../CLAUDE.md)

---

## Annexe B — ce qui reste à vérifier

Points qu'une lecture du code ne tranche pas. Chacun porte **comment** le
vérifier.

1. **Couverture réelle de `birth_chart`.** Détermine si la couche premium (L2)
   sera visible ou majoritairement amputée. Sans ce chiffre, P1 est un pari.
   ```sql
   SELECT COUNT(*)                                                       AS total,
          COUNT(*) FILTER (WHERE birth_chart IS NOT NULL)                AS has_chart,
          COUNT(*) FILTER (WHERE birth_chart -> 'planets' -> 'venus' IS NOT NULL) AS has_venus,
          COUNT(*) FILTER (WHERE birth_time IS NOT NULL)                 AS has_time
     FROM profiles;
   ```
2. **Ampleur du bug de l'ascendant fabriqué** (§6.4). Confirme qu'il faut lire
   `birth_chart.rising` et jamais `profiles.rising_sign`.
   ```sql
   SELECT rising_sign, COUNT(*) FROM profiles
    WHERE birth_time IS NULL GROUP BY 1 ORDER BY 2 DESC;
   -- 'Aries' ≈ 100 % ⇒ bug actif.
   ```
3. **Volume de l'aperçu `natal_chart`.** Le dénominateur de la requête n° 4 de
   §11.2. À relever **avant** la mise en production pour disposer d'une base
   de comparaison.
4. **Le canal iOS.** `CLAUDE.md` indique que l'iOS passe par la PWA, mais
   `apps/mobile/app.json` porte encore des `intentFilters`/config iOS et
   `docs/app-store/juno-metadata.md` parle d'une soumission App Store. **À
   confirmer avec le propriétaire du produit** : si l'iOS est bien la PWA, la
   parité web de P1 n'est pas un confort, c'est la moitié de l'audience.
5. **Le budget de traduction.** ≈ 1 974 chaînes traduites au terme de P1
   (§7.4). Traduction machine relue ? Traducteurs ? Le mode retenu change le
   planning de P0 plus que le code.
6. **L'ordre relatif de P1-9 (socle analytics).** Si `product_events` glisse
   après le build de P0, la voie B de §11 glisse d'une revue Play entière. À
   arbitrer **avant** de figer le contenu du build.
7. **Le nom définitif.** §3.2 recommande « Conversation Guide ». Décision
   produit à acter avant l'étape 6 de §14.2 — le nom apparaît dans les clés de
   chrome et dans les 8 locales.
