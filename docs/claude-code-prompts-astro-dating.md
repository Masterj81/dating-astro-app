# Claude Code Prompts for Astro Dating

## 1. Bugs / Crash

```text
Analyse l’application Astro Dating et trouve les causes probables de crash, freeze, erreurs runtime et comportements fragiles.

Contexte:
- Stack: Expo / React Native / Supabase
- Objectif: améliorer la stabilité sans casser l’existant
- Commence par inspecter le code concerné avant de modifier quoi que ce soit
- Priorise les écrans critiques: onboarding, discovery, profile, chat, settings, premium
- Sois défensif face aux données invalides, aux états inattendus et aux erreurs réseau

Je veux que tu:
1. identifies les causes probables des crashs ou bugs
2. priorises les problèmes les plus critiques
3. implémentes directement les correctifs
4. ajoutes des garde-fous simples si nécessaire
5. résumes les fichiers modifiés et les risques restants
```

## 2. Design Premium

```text
Améliore le design de l’application Astro Dating pour qu’elle paraisse plus premium, plus cohérente et plus mémorable, tout en restant compatible avec la base actuelle.

Contexte:
- Univers: astrology dating app
- Cherche un rendu plus luxe, cosmique, émotionnel et moderne
- Préserve les patterns déjà installés quand ils sont bons
- Évite les designs génériques ou interchangeables
- Concentre-toi sur les écrans à fort impact: onboarding, discovery, profile, premium, paywall

Je veux que tu:
1. identifies les points faibles du design actuel
2. proposes une direction visuelle cohérente avec l’univers Astro Dating
3. implémentes directement les améliorations dans le code
4. améliores la typographie, la hiérarchie, les couleurs, les espacements, les CTA et les états visuels
5. résumes les changements et leur impact UX
```

## 3. Onboarding

```text
Analyse et améliore le parcours d’onboarding de l’application Astro Dating pour réduire l’abandon et augmenter l’activation.

Contexte:
- Stack: Expo / React Native / Supabase
- L’onboarding doit rester simple, émotionnel, rassurant et motivant
- Cherche les étapes trop longues, confuses, stressantes ou mal expliquées
- Préserve les données nécessaires au produit mais rends le parcours plus fluide

Je veux que tu:
1. identifies les frictions du parcours d’onboarding
2. proposes les changements les plus utiles pour réduire l’abandon
3. implémentes les améliorations directement
4. améliores les microcopies, les validations, les états de chargement et la progression
5. résumes les gains attendus
```

## 4. Matching / Discovery

```text
Analyse et améliore l’expérience de matching et discovery dans Astro Dating.

Contexte:
- L’objectif est de rendre la découverte plus engageante, plus claire et plus addictive
- Concentre-toi sur la compréhension des profils, la compatibilité astrologique, les actions utilisateur et le rythme du swipe
- Préserve la logique produit actuelle sauf si un changement simple apporte un gain clair

Je veux que tu:
1. identifies les points faibles UX et produit dans discovery
2. améliores la lisibilité des profils et la valeur perçue de la compatibilité astrologique
3. implémentes directement les changements utiles
4. renforces les CTA, les états vides, les feedbacks et la sensation de fluidité
5. résumes les améliorations apportées
```

## 5. Paywall

```text
Analyse et améliore le paywall et les écrans premium de l’application Astro Dating pour augmenter la conversion.

Contexte:
- L’objectif est de mieux vendre la valeur du premium sans casser l’expérience utilisateur
- Cherche les points faibles dans la hiérarchie, le wording, les bénéfices, la preuve de valeur et les CTA
- Garde une tonalité premium, émotionnelle et claire

Je veux que tu:
1. identifies ce qui freine la conversion vers le premium
2. proposes des améliorations produit et UX réalistes
3. implémentes les changements directement
4. rends les bénéfices premium plus concrets et plus désirables
5. résumes les changements et l’impact attendu sur la conversion
```

## 6. Notifications

```text
Analyse et améliore le système de notifications de l’application Astro Dating.

Contexte:
- Stack: Expo / React Native / Supabase
- Cherche les problèmes de fiabilité, d’opt-in, de préférence utilisateur, de timing et de pertinence
- Vérifie autant la partie produit que la partie technique

Je veux que tu:
1. identifies les faiblesses du système de notifications
2. améliores la robustesse technique et la logique utilisateur
3. implémentes les correctifs ou optimisations directement
4. rends les préférences plus claires et les points d’entrée plus cohérents
5. résumes les changements et les risques restants
```

## 7. Profil

```text
Analyse et améliore l’écran de profil et les écrans liés au compte dans Astro Dating.

Contexte:
- L’écran profil doit donner envie, rassurer, et faciliter l’édition du compte
- Vérifie la lisibilité du contenu, l’accès aux réglages, la mise en valeur du profil et la qualité des feedbacks
- Garde une cohérence forte avec l’univers astrology/premium de l’app

Je veux que tu:
1. identifies les points faibles de l’expérience profil
2. proposes des améliorations UX et visuelles utiles
3. implémentes directement les changements
4. améliores la structure, les CTA, les états de chargement et les erreurs
5. résumes les bénéfices utilisateur obtenus
```

## 8. Performances

```text
Analyse les performances de l’application Astro Dating et optimise ce qui apporte le plus de valeur.

Contexte:
- Cherche les re-renders inutiles, calculs coûteux, effets mal structurés, chargements redondants, animations fragiles et listes non optimisées
- Évite les optimisations théoriques qui complexifient le code sans bénéfice clair
- Reste pragmatique et priorise ce qui touche l’expérience utilisateur réelle

Je veux que tu:
1. identifies les goulots de performance les plus probables
2. priorises les optimisations à fort impact
3. implémentes directement les améliorations sûres
4. gardes le code lisible et maintenable
5. résumes les gains attendus
```

## 9. Sécurité Supabase

```text
Analyse l’intégration Supabase de l’application Astro Dating avec un focus sécurité et robustesse.

Contexte:
- Vérifie les accès aux données, les appels critiques, la manipulation des profils, les fonctions edge, les erreurs silencieuses et les hypothèses dangereuses côté client
- Cherche les risques liés aux permissions, à la validation de données et aux usages fragiles des réponses Supabase
- N’introduis pas de complexité inutile

Je veux que tu:
1. identifies les risques de sécurité ou de robustesse les plus importants
2. expliques brièvement pourquoi ils sont risqués
3. implémentes les correctifs raisonnables côté app si possible
4. signales ce qui devrait être traité côté base, policies ou edge functions
5. résumes les risques corrigés et ceux qui restent
```

## 10. Marketing In-App

```text
Analyse l’application Astro Dating avec un angle marketing in-app et améliore les moments qui peuvent augmenter la rétention, l’engagement et la conversion.

Contexte:
- Cherche les opportunités dans l’onboarding, discovery, profil, premium, empty states, succès, moments émotionnels et loops de réengagement
- Garde une expérience élégante, pas agressive
- Les changements doivent rester cohérents avec une app de dating astrologique premium

Je veux que tu:
1. identifies les opportunités marketing in-app les plus utiles
2. proposes des changements concrets orientés rétention et conversion
3. implémentes directement les améliorations réalistes
4. améliores les microcopies, les CTA et les moments d’activation
5. résumes les effets attendus
```

## Bonus: Audit Global Sans Modifier

```text
Inspecte l’application Astro Dating et donne-moi un audit priorisé sans faire de modifications.

Je veux:
1. les problèmes les plus importants
2. leur impact produit ou technique
3. les fichiers concernés
4. un plan d’action concret et priorisé
5. les quick wins vs chantiers plus lourds
```
