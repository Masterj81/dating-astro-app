# Plan d'amélioration PWA — JUNO — septembre 2026

**Date : 15 septembre 2026 · Statut : plan VALIDÉ en conversation, amendé par le propriétaire ; aucune implémentation commencée.**
**Portée : PWA/web d'abord. Aucun chantier mobile natif avant présentation et validation du plan PWA.**

Méthode — chaque affirmation porte son étiquette : **[OBS]** observation directe du site déployé
(15 septembre 2026, Chromium embarqué, visiteur non connecté) · **[DÉPÔT]** constat du dépôt ·
**[HYP]** hypothèse · **[REC]** recommandation · **[TEND]** tendance appuyée par une source
externe citée. Les comportements iOS réels n'ont pas été exercés en direct (UA desktop émulé) :
le parcours d'installation iOS est lu dans le dépôt et étiquetté [DÉPÔT].

---

## 1. Décisions produit entérinées (15 septembre 2026)

1. **PWA d'abord.** Le web est le canal iOS ; il porte la priorité produit.
2. **Français : tutoiement uniforme.** Le « tu » est déjà dominant dans JUNO ; éliminer le vouvoiement résiduel (« Votre nom », etc.).
3. **Aperçu de synastrie gratuite — à préparer** : une par jour, contrôlé **exclusivement côté serveur** (quota), selon la procédure de `docs/premium-free-preview.md`. La synastrie est la valeur distinctive : elle doit être démontrable avant le paywall.
4. **Architecture sans service worker MAINTENUE pour l'instant :**
   - PWA installable sans service worker ;
   - fonctionnement principalement connecté ;
   - aucun cache hors ligne sensible ;
   - aucun push web ;
   - **ne pas réintroduire de SW avant** la correction de l'enregistrement des jetons push (suivi A de JUNO-30) et la décision sur le consentement (suivi B).
5. **HSTS preload n'est pas un quick win.** Chantier séparé : inventaire complet des sous-domaines et plan de retour arrière exigés avant toute décision. Le preload engage le domaine et ses sous-domaines pour une longue durée ; une mauvaise configuration peut rendre un sous-domaine inaccessible.
6. **Affirmations vérifiables seulement.** *(Corrigé le 15 sept. : aucune section presse n'existe — le vrai constat était la note « ★ 4.8 » codée en dur.)* Toute affirmation quantitative (note Play, logos presse, citations) ne s'affiche que prouvée contre sa source ; sinon retrait. Un logo seul n'est pas une preuve sociale acceptable.
7. **Liens visibles vers conditions et confidentialité à l'inscription.**
8. **Distinguer trois niveaux** : acceptation contractuelle des conditions · information sur la confidentialité · consentements facultatifs (marketing, notifications). **Aucune prétention qu'une case est juridiquement obligatoire sans analyse territoriale** — la formulation finale doit être validée selon les territoires servis.
9. **Sources primaires complétées** : TikTok Next 2026 et Bumble Dating Trends 2025 ajoutées à Pew/web.dev/WebKit, en séparant données mesurées et discours marketing.
10. **Ne jamais recommander le partage d'une session, d'un cookie ou d'un jeton avec un agent.** (Voir §7.)

---

## 2. Résumé exécutif

La fondation technique web est saine et rapide [OBS : TTFB 16–88 ms, ~199 Ko JS, zéro débordement horizontal, zéro image cassée], et l'architecture PWA est un **choix délibéré et documenté** [DÉPÔT : service worker « kill-switch » depuis le commit `a997da4`, 8 mai 2026 — aucun SW enregistré sur visite fraîche, caches vides, vérifié en production le 15 septembre]. L'installabilité Chrome subsiste sans SW [TEND : web.dev, màj 2024-09-19 — critères : engagement, HTTPS, manifeste].

Les urgences sont en amont du tunnel : **l'entrée mobile est enterrée** (« Get Started Free » à y = 10 013 px sur 12 469 [OBS]) et **l'inscription n'affiche aucun lien conditions/confidentialité** [OBS]. Les leviers différenciants existent déjà dans le produit (synastrie, guide de conversation, vérification) mais sont **invisibles ou derrière le paywall** avant la démonstration de valeur.

La stratégie d'attente est cohérente : **pas de push, aucune jambe push n'étant fonctionnelle** (1 jeton Android pour 289 profils actifs [DÉPÔT, mesuré le 14 septembre] ; push web impossible sans SW). La rétention repose sur le courriel jusqu'à ce que les suivis A/B de JUNO-30 soient tranchés.

---

## 3. État technique PWA (audit du 15 septembre 2026)

### Installation
- **[OBS]** Manifeste `200` : `name "JUNO — Synastry Guide"`, `short_name JUNO`, `display standalone`, `start_url /app/`, `scope /`, `orientation portrait`, thème `#0f0d17`, icônes 192 + 512.
- **[OBS]** Défaut : `"purpose": "any maskable"` **sur le même asset** — rognage imprévisible sur icônes adaptatives Android. [REC] asset maskable dédié (zone de sécurité).
- **[TEND]** `beforeinstallprompt` se déclenche sans SW (critères web.dev). [REC] **Richer Install UI** : captures d'écran + description dans le manifeste — gain d'installation à faible coût.
- **[DÉPÔT]** Parcours iOS : `DownloadButtons.tsx` pose un drapeau `sessionStorage` puis navigue vers `/app`, où `InstallPrompt` ouvre le guide « Ajouter à l'écran d'accueil » — conçu pour que iOS bookmarke l'URL de l'app et non la page d'atterrissage. Code mort : `fireOpenInstallGuide` (lint).

### Service worker — état JUNO-16
- **[OBS]** Visite fraîche : `swRegistrations: []`, `cacheNames: []` — confirmé en production.
- **[DÉPÔT]** Le kill-switch sert à évacuer les SW de l'ancienne PWA Expo (prise de contrôle, purge des caches, auto-désenregistrement, rechargement forcé). Sa condition de retrait est documentée dans le fichier.
- **[DÉPÔT]** **JUNO-16 reste ouvert** : le test comportemental « PWA installée AVANT le dernier déploiement web — l'ancien SW récupère-t-il la version courante ? » n'est pas exécuté (NEXT-STEPS P1). **Il n'est pas fermé et ne le sera pas sans preuve comportementale.**
- **Conséquence assumée [DÉPÔT+TEND]** : sans SW, **push web iOS impossible** (iOS 16.4+ exige une PWA installée avec service worker — annonce WebKit, mars 2023 : webkit.org/blog/13866/ ; lien à re-vérifier d'un clic, la récupération du 15 septembre ayant ramené un billet adjacent du même blog).

### Sécurité web
- **[OBS]** CSP présente mais `unsafe-inline` (`script-src`, `script-src-elem`, `style-src`) — JUNO-13 confirmé en production. HSTS `max-age=31536000; includeSubDomains` **sans `preload`**. XFO `DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` caméra/micro/géo refusés. Pas de COOP/CORP.
- **[DÉPÔT]** Sessions en `localStorage` (JUNO-05) — non observé en visiteur (stockage vide).

### Performance
- **[OBS]** Accueil public (mobile 390) : TTFB **16 ms**, DCL 194 ms, load 201 ms, HTML 93 Ko, JS ~199 Ko, CSS 17 Ko, 20 requêtes. Login : TTFB 88 ms, load 442 ms, HTML 80,6 Ko.
- **Limites déclarées** : Lighthouse inexécutable dans l'environnement de l'audit (chrome-launcher en échec) ; FCP/LCP indisponibles dans le Chromium embarqué. **[REC]** re-mesurer via PageSpeed Insights (labo + terrain CrUX) — seule mesure faisant autorité Core Web Vitals.

---

## 4. Constats UX et parcours (visiteur)

| # | constat | preuve |
|---|---|---|
| P-1 | CTA d'inscription invisible au premier écran mobile ; « Get Started Free » à **y = 10 013 px** sur 12 469 ; le hero (UA desktop) n'offre que « Open Web App » (→ login) et « Google Play » | [OBS] |
| P-2 | Aucun lien conditions/confidentialité sur l'inscription (EN + FR, texte intégral scanné) | [OBS] |
| P-3 | Mélange tu/vous dans le même écran FR (« Crée **ton** compte » / « **Votre** nom ») | [OBS] |
| P-4 | **CORRECTION D'AUDIT (15 sept., avant implémentation)** : la première version de ce plan décrivait des « logos de presse québécois sur /en » — mauvaise lecture de la capture d'écran ; le site n'a **aucune** section presse (vérifié dans le DOM). Le constat réel au même endroit : **« ★ 4.8 on Google Play » codé en dur** dans le bandeau de preuve, sous un commentaire qui promet « no invented stats » — une note jamais vérifiée contre Play Console | [OBS + DÉPÔT] |
| P-5 | Sous-titre login tourné vers l'interne : *« …and future web features »* | [OBS] |
| P-6 | Icônes `"any maskable"` sur le même asset (192/512) | [OBS] |
| P-7 | Propreté : aucun débordement horizontal, 0 image cassée, `lang` correct, FR entièrement traduit | [OBS] |

**Parcours [DÉPÔT + docs]** : accueil → inscription (3 champs) → courriel (lien profond réparé) → garde `AppShell` → setup (nom/genre/date obligatoires ; heure/ville optionnelles) → **révélation du thème** (payoff) → `/app` → Discover → profil → synastry (premium, `402`, aucun aperçu gratuit — `free_preview_quota = NULL`, mesuré le 14 sept) → conversation → retour quotidien → conversion.

**Frictions principales** : (a) entrée mobile faible (P-1) ; (b) la valeur distinctive — la synastrie — n'est **jamais démontrée** avant le paywall ; (c) aucune jambe push (rétention = courriel seul) ; (d) le guide de conversation, qui répond aux deux anxieties mesurées par Pew (femmes submergées, hommes inquiets du silence), vit dans l'onglet premium au lieu du funnel.

---

## 5. Consentement et inscription (distinction à trois niveaux)

[OBS] L'écran d'inscription n'affiche aujourd'hui **aucun** des trois niveaux.

1. **Acceptation contractuelle des conditions** — lien visible vers les conditions d'utilisation au moment de la création de compte. La forme exacte (lien seul, lien + case) **dépend d'une analyse territoriale** (Québec/CACL, territoires servis) qui n'a pas été faite : **ne pas prétendre qu'une case est juridiquement obligatoire sans cette analyse.**
2. **Information de confidentialité** — lien visible vers la politique, avec mention des données particulières collectées (date/heure/ville de naissance).
3. **Consentements facultatifs** — marketing, notifications : opt-in séparés, jamais conditionnants, jamais fusionnés avec le contrat. Reliés au **suivi B** de JUNO-30 (`dailyHoroscope` est `true` par défaut depuis le 24 août — à trancher).

---

## 6. Preuve sociale et affirmations vérifiables

**Correction d'audit (15 sept.)** : il n'existe **aucune section « As featured in »** sur le site —
la première version de ce plan décrivait des logos de presse qui n'existent pas (mauvaise lecture
d'une capture ; vérifié dans le DOM et le code source).

Le constat réel au même endroit : le bandeau de preuve du hero affichait
**« ★ 4.8 on Google Play » codé en dur** (`page.tsx`), alors que son propre commentaire
promettait « qualitative proofs only, no invented stats ». Une note Play non vérifiée est
exactement la statistique inventée que la règle interdit.

**[Règle, appliquée en vague 1 C]** : toute affirmation quantitative (note, nombre
d'utilisateurs, témoignages) ne s'affiche que **vérifiée contre sa source** — pour la note Play,
depuis Play Console → Statistiques. L'implémentation remplace le littéral par
`VERIFIED_PLAY_RATING: number | null = null` : la note ne réapparaîtra que lorsqu'une
valeur vérifiée y sera inscrite. Toute future section presse (logos, citations) suivra la même
règle : uniquement une couverture réelle, prouvée par un lien d'article — un logo seul n'est pas
une preuve sociale acceptable.

---

## 7. Compte synthétique pour l'audit des écrans authentifiés

Les écrans connectés n'ont pas été audités (aucun compte synthétique). **Ne jamais partager une session, un cookie ou un jeton avec un agent.** Méthodes sûres :

1. l'exploitant connecte lui-même le compte synthétique **dans le navigateur de l'agent** (l'agent ne manipule jamais les identifiants) ;
2. création d'un compte **entièrement fictif** (email jetable de test, données de naissance factices cohérentes), **sans conversation avec de vrais membres** — pas de like, pas de message, pas de match ;
3. identifiants modifiés ou supprimés après l'audit.

---

## 8. Tendances sourcées (données mesurées vs discours marketing)

| source (date, lien) | données mesurées | applicable à JUNO |
|---|---|---|
| **Pew Research** — Key findings about online dating in the U.S. (fév. 2023, n = 6 034) [pewresearch.org/short-reads/2023/02/02/key-findings-about-online-dating-in-the-u-s/] | 30 % des adultes ont utilisé une app (53 % des <30) ; 48 % jugent le canal sûr (↘ 53 % en 2019) ; **60 % pour des vérifications obligatoires** ; 56 % des femmes <50 ont reçu du contenu explicite non sollicité ; 35 % ont payé (payeurs plus satisfaits : 58 % vs 50 % ; <30 ans paient moins : 22 %) ; **21 % seulement croient qu'un algorithme peut prédire l'amour** ; femmes submergées (54 %) / hommes anxieux du silence (64 %) ; 44 % cherchent une relation long terme | **Confiance = axe n°1** (rendre la vérification et le signalement visibles) · le « langage, pas oracle » est exactement contre-positionné au scepticisme · démonstration de valeur avant paywall critique pour les <30 · le guide de conversation répond aux deux anxieties |
| **web.dev** — install criteria (màj 2024-09-19) [web.dev/articles/install-criteria] | Installabilité Chrome sans SW : engagement (1 clic + 30 s), HTTPS, manifeste (192+512, start_url, display) ; Richer Install UI recommandé | Manifeste correct aujourd'hui ; gains rapides : maskable dédié + captures |
| **TikTok Next 2026** (récupéré le 15 sept. 2026) [ads.tiktok.com/business/en-GB/next] — **rapport marketing de l'annonceur : thèmes directionnels, études de cas internes (+12 %, +483 %…) = discours, pas mesure indépendante** | Thème « Irreplaceable Instinct » : **Reali-Tea** (l'honnêteté et la communauté priment le poli ; #delulu délaissé) ; **Curiosity Detours** (découverte intentionnelle, « parier sur les petites communautés ») ; **Emotional ROI** (l'impulsivité cède à l'intention ; justifier le « pourquoi » avant l'achat) | Matière première pour `marketingagent` ; « petites communautés de niche » = positionnement astrology-dating ; « pourquoi-payer » renforce l'aperçu gratuit avant abonnement |
| **Bumble Dating Trends 2025** [bumbcdn.com/…/bumble_global_report_dating_trends_2025.pdf] — **fournie par le propriétaire ; PDF non extrait par l'agent le 15 sept.** : à consulter manuellement avant d'en tirer des recommandations | — | À intégrer après lecture ; séparer les données d'enquête du discours de marque |
| WebKit — push web iOS 16.4+ (mars 2023) [webkit.org/blog/13866/] — lien à re-vérifier (récupération partielle) | Push web réservé aux PWAs installées avec SW | Condition technique du chantier vague 3 |

**[HYP] non promues en recommandations** (discours sectoriels sans mesure primaire vérifiée ici) : « fatigue du swipe », « profils guidés », croissance des features IA de conversation. À traiter comme hypothèses jusqu'à source.

---

## 9. Comparaison concurrentielle — [HYP] connaissance générale, non re-vérifiée le 15 sept.

Hinge (invites, « designed to be deleted ») · Bumble (femmes d'abord, vérification) · Tinder (volume, à la carte) · Co–Star / The Pattern / Nebula / Boo (astro individuel). Différenciation réelle de JUNO : **synastrie relationnelle + conversation guidée** — à montrer tôt, pas à raconter. **Aucune fonctionnalité ne doit être copiée parce qu'un concurrent l'a.**

---

## 10. Backlog priorisé

### P0 — confiance et conformité

**10.1 Liens conditions/confidentialité à l'inscription**
- Problème : aucun des trois niveaux (§5) n'est présent [OBS]. Utilisateur : tout inscrit. Recommandation : liens visibles (conditions, confidentialité + mention des données de naissance) ; la forme contractuelle (lien vs case) après analyse territoriale. Pourquoi maintenant : premier geste de confiance, données sensibles collectées. Fichiers probables : `apps/web/src/app/[locale]/auth/signup/page.tsx` + formulaire client ; équivalent mobile. Effort S. Risque faible (liens) / moyen (case, à analyser). Mesure : 100 % des inscriptions exposent les liens. Porte : revue + validation juridique pour la case éventuelle. Retour arrière : trivial.

**10.2 Affirmations vérifiables / preuve sociale honnête — CORRIGÉ puis IMPLÉMENTÉ en vague 1**
- Problème (corrigé après re-vérification) : pas de section presse — le vrai constat était **« ★ 4.8 on Google Play » codé en dur** sans vérification [OBS + DÉPÔT]. Recommandation appliquée : la note ne s'affiche plus que derrière `VERIFIED_PLAY_RATING` (à renseigner depuis Play Console) ; la copie `proofRating` est autonome (« Disponible sur Google Play »). Toute future section presse (logos, citations) : uniquement avec lien d'article prouvant la couverture. Fichiers : `apps/web/src/app/[locale]/(marketing)/page.tsx`, `socialProof.proofRating` ×8. Effort S (fait). Mesure : aucune affirmation quantitative non sourcée à l'écran.

### P1 — activation et conversion

**10.3 CTA d'inscription au premier écran mobile**
- Problème : « Get Started Free » à ~10 013 px ; hero sans inscription [OBS]. Recommandation : CTA primaire « Create account » visible sans scroll sur mobile + hiérarchie hero révisée (inscrire / ouvrir l'app / Play). Fichiers : `apps/web/src/app/[locale]/(marketing)/page.tsx`, `apps/web/src/components/DownloadButtons.tsx` (+ supprimer le code mort `fireOpenInstallGuide`). Effort M. Risque faible. Mesure : scroll-to-CTA → inscriptions commencées, par point d'entrée.

**10.4 Test de l'ancienne PWA (porte JUNO-16 + JUNO-01)**
- Problème : comportement d'une PWA installée avant le dernier déploiement non prouvé [DÉPÔT]. Recommandation : exécuter le test (appareil ayant la PWA d'avant mai, non ouvert depuis) : rechargement forcé par le kill-switch, `Application → Service Workers` vide, synastrie fonctionnelle. Effort S (procédure opérateur). Risque nul (lecture). **Porte : condition de la bascule `PUBLISH_LEGACY_DEGREES`.**

**10.5 Mesure d'adoption Android 130**
- Play Console → Statistiques → Utilisateurs actifs → **quotidien, groupé par version**, 7 derniers jours disponibles (délai 24–48 h) ; export CSV daté ; seuil **≥ 95 % × 7 jours consécutifs** avant bascule. Effort S récurrent. (Un export Play semble déjà téléchargé dans l'environnement — à confirmer.)

**10.6 Aperçu gratuit de synastrie — 1/jour, quota serveur** *(décision entérinée, à implémenter en vague 2)*
- Problème : valeur distinctive jamais démontrée avant paywall [OBS+DÉPÔT `free_preview_quota = NULL`]. Recommandation : appliquer `docs/premium-free-preview.md` de bout en bout : `premium_feature_policy.free_preview_quota = 1` pour `synastry`, correspondance des clés client/serveur, validateurs, refus `free_preview_exhausted` cohérent web+mobile, et **test de non-régression du 402**. Fichiers : migration policy, `packages/shared` (carte des clés), `apps/web/src/components/SynastryOverview.tsx`, `apps/mobile/app/premium-screens/synastry.tsx`. Effort M. Risque moyen (quota) — dépendances : serveur autoritaire uniquement. Mesure : conversions depuis l'aperçu vs paywall direct. Porte : tests + validate:premium-gating verts. Retour arrière : `free_preview_quota = NULL`.

### P2 — qualité et différenciation

**10.7 Tutoiement uniforme** — passe sur les 8 locales (décision prise : **tu**). Fichiers : `apps/web/src/i18n/*.json`, `apps/mobile/locales/*.json` (validate:locales). Effort S-M. Mesure : zéro écran mixte.
**10.8 Sous-titre login** — remplacer « future web features » par un bénéfice utilisateur. Effort S.
**10.9 Icône maskable dédiée + Richer Install UI** — asset avec zone de sécurité ; captures + description dans `apps/web/public/manifest.json`. Mesure : taux d'acceptation d'installation.
**10.10 Guide de conversation dans le funnel** — point d'entrée prémium existant hors hub (dashboard, chip chat [DÉPÔT]) ; ajouter une amorce post-match gratuite côté web. Effort M.
**10.11 Surface confiance/sécurité** — badge vérifié et signalement visibles **avant** le premier message ; page publique « sécurité ». Effort M. Source : Pew (60 % vérifications, harcèlement mesuré).

### Chantiers séparés (pas des quick wins)

**10.12 HSTS preload** — inventaire complet des sous-domaines (app, www, domaines hérités astrodatingapp.com…), exigences de chaque hôte, plan de retour arrière écrit, puis décision. Le preload engage le domaine durablement ; une erreur rend un sous-domaine inaccessible.
**10.13 CSP nonce + `strict-dynamic`** — suit JUNO-13, `Report-Only` d'abord (sans toucher au statut du constat sans preuve).
**10.14 Stratégie service worker / push web** — **réévaluation documentée uniquement après** : suivi A corrigé (jetons), suivi B tranché (consentement), test 10.4 exécuté. Tout nouveau SW devra partitionner son cache par compte, exclure les routes sensibles, et documenter sa mise à jour forcée — les leçons de JUNO-16 sont le cahier des charges.

### P3 — expérimentation
Intentions affichées dans Discover (`connection_intentions` existe [DÉPÔT]) · formats audio (voix existante) · tarification testée — seulement après instrumentation (11.2).

---

## 11. Vagues d'exécution

**Vague 1 (immédiat)** : CTA mobile (10.3) · liens conditions/confidentialité (10.1, partie liens) · tutoiement (10.7) · sous-titre login (10.8) · note Play vérifiable seulement (10.2) · icône maskable (10.9a) · **Richer Install UI** (10.9b) · test ancienne PWA (10.4) · début mesure adoption (10.5).
**Vague 2** : aperçu gratuit synastrie (10.6) · instrumentation du tunnel (événements signup→chart→synastry→paywall — aujourd'hui seuls les vitals Vercel existent [OBS]) · mise en avant du guide de conversation (10.10) · surface confiance (10.11).
**Vague 3** : diagnostic jetons push (suivi A) · décision consentement (suivi B) · **ensuite seulement**, réévaluation documentée d'un service worker et du push web (10.14).

## 12. Métriques
Acceptation d'installation (avant/après Richer UI) · inscriptions commencées par point d'entrée · % onboarding → première synastrie consultée · conversion depuis l'aperçu gratuit · D1/D7 par plateforme (`last_active`, comparable web/mobile) · % comptes vérifiés · (existant) fin d'onboarding mensuelle — septembre 68,8 % vs seuil 56,8 %.

## 13. Risques et dépendances
Tout SW futur dépend de 10.4 + suivis A/B — **ne pas rouvrir un SW avant** (coexistence ancien/nouveau). L'aperçu synastrie dépend d'un quota strictement serveur (le client ne décide jamais). La case de consentement éventuelle dépend de l'analyse territoriale. CSP nonce dépend de JUNO-13. Aucun chantier ne se fait dans une release Android en cours.

## 14. Décisions restant au propriétaire
1. Analyse territoriale du consentement (forme contractuelle exacte). 2. Preuves de couverture presse (garder/retirer chaque logo). 3. Tarification et quotas définitifs de l'aperçu (1/jour confirmé, fenêtre de rejeu ?). 4. Compte synthétique — quelle méthode du §7. 5. Création des tickets/branches des vagues. 6. Après lecture : intégration de Bumble 2025 aux tendances. 7. (Lié) bascule `PUBLISH_LEGACY_DEGREES` quand 10.4 + 10.5 sont verts.

## 15. Liens opérationnels (15 septembre 2026)
- **JUNO-30 FERMÉ (exploitation)** : `active=false`, 0 passage au midi du 15 sept, `dernier_passage = 2026-09-14 12:00:00.059869+00`, 0×401 après repère. Le `passages_apres_repere = 1` brut est un **faux positif documenté** (repère pg_net tronqué à la seconde vs `start_time` à la microseconde — le passage d'hier midi se compte « après » son propre repère par 59,869 ms). Preuve : runbook JUNO-30 §6.
- JUNO-01 : fermé en production avec résiduel temporaire (degrés 0,1°) ; bascule conditionnée par 10.4 + 10.5.
