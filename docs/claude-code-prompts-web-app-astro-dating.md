# Claude Code Prompts for Astro Dating Web App

Use these prompts with Claude Code when working on the Next.js web app in `apps/web`.

## 1. Bugs / Runtime Stability

```text
Analyse la web app Astro Dating dans apps/web et trouve les causes probables de bugs, erreurs runtime, hydration issues, redirects incorrects, erreurs auth, pages cassées ou états fragiles.

Contexte:
- Stack: Next.js / React / Supabase / next-intl / Vercel
- Zone principale: apps/web
- Objectif: améliorer la stabilité sans casser l’existant
- Inspecte le code concerné avant toute modification
- Priorise les routes auth, app dashboard, discovery, profile, chat, settings, billing et premium

Je veux que tu:
1. identifies les problèmes runtime les plus probables
2. priorises selon impact utilisateur
3. implémentes directement les correctifs sûrs
4. ajoutes des garde-fous pour données invalides, erreurs réseau et états auth inattendus
5. résumes les fichiers modifiés et les risques restants
```

## 2. Premium Web Design

```text
Améliore le design de la web app Astro Dating pour la rendre plus premium, cosmique, moderne et mémorable.

Contexte:
- Stack: Next.js / React
- Zone principale: apps/web/src
- Univers: astrology dating, love compatibility, premium cosmic experience
- Préserve la cohérence du design existant
- Évite les layouts génériques et les styles trop standards
- Optimise desktop et mobile responsive

Je veux que tu:
1. identifies les points faibles visuels de la web app
2. proposes une direction visuelle cohérente avec Astro Dating
3. implémentes directement les améliorations
4. améliores la hiérarchie, les CTA, les sections, les cards, les gradients, les empty states et les pages premium
5. résumes l’impact UX attendu
```

## 3. Landing Page Conversion

```text
Analyse et améliore la landing page marketing de la web app Astro Dating pour augmenter les conversions.

Contexte:
- Zone probable: apps/web/src/app/[locale]/(marketing)/page.tsx et composants marketing
- Objectif: augmenter les clics vers signup, download, app entry ou premium
- Garde une tonalité premium, émotionnelle, astrologique et claire
- Optimise mobile-first mais conserve une belle expérience desktop

Je veux que tu:
1. identifies les faiblesses de conversion sur la landing page
2. améliores le hero, la promesse, les bénéfices, la preuve, les CTA et la structure
3. rends les bénéfices Astro Dating plus concrets et désirables
4. implémentes les changements directement
5. résumes les changements et l’impact attendu
```

## 4. SEO / Metadata / Social Sharing

```text
Analyse et améliore le SEO de la web app Astro Dating.

Contexte:
- Stack: Next.js App Router / next-intl
- Zone principale: apps/web/src/app, apps/web/public, metadata, sitemap, robots, Open Graph
- Objectif: améliorer indexation, CTR social, cohérence multilingue et discoverability

Je veux que tu:
1. vérifies metadata, titles, descriptions, OG tags, Twitter cards, canonical, robots et sitemap
2. identifies les opportunités SEO par page importante
3. implémentes les améliorations sûres
4. tiens compte des locales disponibles
5. résumes les changements et les limites restantes
```

## 5. Auth / Signup / Login

```text
Analyse et améliore les flows auth de la web app Astro Dating.

Contexte:
- Stack: Next.js / Supabase Auth
- Routes probables: auth/login, auth/signup, auth/callback, auth/verify-email
- Objectif: réduire les frictions, corriger les états fragiles, améliorer erreurs et redirects
- La sécurité et la clarté utilisateur sont prioritaires

Je veux que tu:
1. inspectes le flow signup, login, callback et verify email
2. identifies les frictions UX et risques techniques
3. implémentes les correctifs ou améliorations
4. améliores les messages d’erreur, loading states, redirects et edge cases
5. résumes les changements et scénarios couverts
```

## 6. Web Onboarding / Account Setup

```text
Analyse et améliore l’onboarding web et la configuration du compte Astro Dating.

Contexte:
- Zone probable: apps/web/src/app/[locale]/app/setup/page.tsx et AccountSetupForm
- Objectif: réduire l’abandon et rendre la création du profil plus motivante
- Le parcours doit être clair, rassurant, mobile-friendly et premium

Je veux que tu:
1. identifies les frictions dans le setup web
2. améliores microcopies, validation, progression, feedback et empty states
3. sécurises la gestion des données invalides ou manquantes
4. implémentes les changements directement
5. résumes l’impact attendu sur l’activation
```

## 7. Web App Dashboard / Retention

```text
Analyse et améliore le dashboard web de l’application Astro Dating pour augmenter la rétention.

Contexte:
- Zone probable: apps/web/src/app/[locale]/app/page.tsx et DashboardOverview
- Objectif: donner rapidement de la valeur après connexion
- Mettre en avant compatibilité, profils, horoscope, premium features et prochaines actions

Je veux que tu:
1. identifies ce qui manque pour guider l’utilisateur connecté
2. améliores la hiérarchie des actions et la valeur perçue
3. implémentes des améliorations UX concrètes
4. ajoute ou améliore les états vides, loading states et CTA
5. résumes l’impact sur engagement et rétention
```

## 8. Discovery / Matching Web

```text
Analyse et améliore l’expérience discovery/matching sur la web app Astro Dating.

Contexte:
- Zone probable: apps/web/src/app/[locale]/app/discover/page.tsx, DiscoverOverview, ProfileDetail
- Objectif: rendre la découverte plus engageante, claire et orientée action
- La compatibilité astrologique doit être compréhensible et désirable

Je veux que tu:
1. inspectes les composants discovery et profil détaillé
2. identifies les points faibles UX, data et conversion
3. implémentes les améliorations directement
4. améliores cards, CTA, empty states, erreurs et signaux astrologiques
5. résumes les changements
```

## 9. Premium / Billing / Checkout Web

```text
Analyse et améliore les flows premium, billing et checkout de la web app Astro Dating.

Contexte:
- Zone probable: apps/web/src/app/[locale]/app/plans, app/checkout/success, billing APIs, PlansCheckout, MarketingPricingSection
- Objectif: améliorer conversion, clarté, confiance et robustesse
- Vérifie les erreurs de paiement, les états de chargement, les prix, les plans et les redirects

Je veux que tu:
1. inspectes les pages premium, plans et checkout
2. identifies les freins à la conversion ou bugs possibles
3. implémentes les améliorations sûres
4. rends les bénéfices premium plus concrets et les CTA plus convaincants
5. résumes les changements et risques restants
```

## 10. Performance / Core Web Vitals

```text
Analyse les performances de la web app Astro Dating avec un focus Core Web Vitals.

Contexte:
- Stack: Next.js / React / Vercel
- Zone principale: apps/web
- Cherche les problèmes de LCP, CLS, hydration, bundles lourds, images, composants client inutiles, fetchs redondants et CSS excessif
- Évite les optimisations abstraites qui complexifient le code

Je veux que tu:
1. identifies les goulots les plus probables
2. priorises les optimisations à fort impact
3. implémentes les changements sûrs
4. conserve la lisibilité du code
5. résumes les gains attendus
```

## 11. Accessibility / Responsive UX

```text
Analyse et améliore l’accessibilité et le responsive design de la web app Astro Dating.

Contexte:
- Zone principale: apps/web/src
- Objectif: meilleure navigation clavier, contrastes, labels, focus states, sémantique HTML, formulaires accessibles et expérience mobile
- Préserve le style premium/cosmique

Je veux que tu:
1. identifies les problèmes a11y et responsive les plus importants
2. implémentes les correctifs directement
3. améliore boutons, liens, formulaires, modals, états focus et textes alternatifs
4. vérifie les pages marketing et app connectée
5. résumes les changements et limites restantes
```

## 12. Supabase Security / Server Boundaries

```text
Analyse l’intégration Supabase de la web app Astro Dating avec un focus sécurité, server/client boundaries et robustesse.

Contexte:
- Stack: Next.js / Supabase
- Zone principale: apps/web/src/lib, apps/web/src/app/api, routes app
- Objectif: éviter les fuites de données, les appels client dangereux, les erreurs silencieuses et les validations insuffisantes

Je veux que tu:
1. identifies les risques de sécurité ou de séparation client/server
2. expliques brièvement leur impact
3. implémentes les correctifs côté web si possible
4. signales ce qui doit être traité côté RLS, policies, migrations ou edge functions
5. résumes les risques corrigés et restants
```

## 13. Internationalization / Locales

```text
Analyse et améliore l’internationalisation de la web app Astro Dating.

Contexte:
- Stack: next-intl
- Locales présentes: en, fr, es, de, ar, pt, ja, zh
- Zone probable: apps/web/messages, apps/web/src/i18n, routes [locale]
- Objectif: éviter textes hardcodés, clés manquantes, mauvaise navigation locale et contenu incohérent

Je veux que tu:
1. identifies les textes non traduits ou clés fragiles
2. vérifies la cohérence des routes localisées
3. implémentes les corrections prioritaires
4. améliore les fallbacks si nécessaire
5. résumes les changements par zone
```

## 14. Marketing In-App Web

```text
Analyse la web app Astro Dating avec un angle marketing in-app et améliore les moments qui peuvent augmenter rétention, activation et conversion.

Contexte:
- Zone: pages app connectées, dashboard, discovery, profile, premium, empty states
- Objectif: rendre les moments de valeur plus visibles sans être agressif
- Ton: premium, cosmique, émotionnel, clair

Je veux que tu:
1. identifies les opportunités marketing in-app
2. proposes des améliorations concrètes
3. implémentes les changements réalistes
4. améliore microcopies, CTA, success states, empty states et upsells contextuels
5. résumes l’impact attendu
```

## Bonus: Global Web Audit Without Editing

```text
Inspecte la web app Astro Dating dans apps/web et donne-moi un audit priorisé sans modifier de fichiers.

Je veux:
1. les problèmes les plus importants
2. leur impact produit, technique ou business
3. les fichiers ou routes concernés
4. un plan d’action priorisé
5. les quick wins vs chantiers plus lourds
```
