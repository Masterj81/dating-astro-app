# Guide BigAd

BigAd aide a transformer une idee produit en plan marketing exploitable :
positionnement, angles publicitaires, offres, calendrier de lancement,
briefs createurs, scripts video, landing copy, store copy, tracking readiness,
KPI targets et export markdown.

Le bon usage de BigAd n'est pas de copier toute la sortie telle quelle. Le bon
usage est de s'en servir comme poste de pilotage : il montre quoi dire, quoi
tester, quoi produire, et ce qui bloque avant de depenser.

## Demarrage rapide

```bash
cd BigAd
npm install
npm run dev
```

Ouvre ensuite :

```text
http://127.0.0.1:3100
```

Si le serveur local ne reste pas actif depuis un agent, lance la commande dans
le terminal VS Code et garde ce terminal ouvert.

## Workflow recommande

1. Remplis les inputs produit avec des phrases courtes.
2. Charge la strategie et regarde d'abord le score global.
3. Corrige les inputs si le score est faible ou si la copy devient lourde.
4. Lis le `Journey Status` pour savoir si la campagne est prete a spend.
5. Va dans `Audience avatars`, `Angles`, puis `Concepts` pour choisir l'idee a produire.
6. Utilise `Briefs`, `Shots` et `Editor Handoff` pour produire les assets.
7. Va dans `Launch readiness` avant de lancer le budget.
8. Exporte le brief markdown quand tu veux le partager dans Notion, Linear ou avec un monteur.

## Comment remplir les inputs

BigAd fonctionne mieux avec des inputs courts, concrets et propres. Evite les
phrases de 40 mots, parce que le moteur peut les reutiliser dans des hooks,
headlines ou overlays.

### Product name

Utilise le vrai nom public.

Bon :

```text
AstroDating
```

### Category

Nom de categorie simple. Pas de phrase marketing.

Bon :

```text
dating app
```

Moins bon :

```text
the most intentional cosmic dating platform for modern singles
```

### Description

Une phrase qui explique le produit sans vendre trop fort.

Bon :

```text
A dating app that matches singles through birth-chart compatibility,
synastry insights, voice intros, and guided profile prompts.
```

### Price

Utilise un format clair.

Bon :

```text
$9.99/month
```

ou :

```text
$39.99 annual intro offer
```

### Business model

Choisis le modele reel :

- `subscription`
- `freemium`
- `one-time purchase`
- `service`
- `marketplace`

Pour une app comme AstroDating, le plus propre est souvent :

```text
subscription with free trial
```

### Audience

Decris qui achete, pas toute leur psychologie.

Bon :

```text
Astrology-curious singles, 22-38, who want more intentional dating than swipe apps.
```

Encore plus copy-safe :

```text
Astrology-curious singles tired of swipe fatigue.
```

### Core pain

Ecris la douleur en langage client, mais court.

Bon :

```text
Swipe apps feel shallow: weak matches, empty bios, awkward small talk.
```

Encore plus copy-safe :

```text
Swipe apps feel shallow and rarely create real chemistry.
```

### Competitors

Nomme les alternatives que l'audience connait deja.

Bon :

```text
Tinder, Bumble, Hinge
```

### Differentiator

Decris le mecanisme unique. C'est le champ le plus important.

Bon :

```text
Birth-chart compatibility, synastry insights, voice intros, and prompt-led profiles inside the dating flow.
```

Version plus courte :

```text
Birth-chart compatibility and voice-led profiles inside the dating flow.
```

### Goal

Le goal doit etre un objectif marketing mesurable, pas une promesse client.

Bon :

```text
Drive free trial starts and convert them into paid subscriptions.
```

Pour eviter que la copy reprenne le goal trop litteralement, garde aussi en tete
l'outcome client :

```text
Help singles find more compatible matches with less shallow swiping.
```

## Exemple AstroDating propre

Utilise ce set si tu veux generer un brief plus propre pour AstroDating :

```text
Name:
AstroDating

Category:
dating app

Description:
A dating app that matches singles through birth-chart compatibility, synastry insights, voice intros, and guided profile prompts.

Price:
$9.99/month

Business model:
subscription with free trial

Audience:
Astrology-curious singles tired of swipe fatigue.

Core pain:
Swipe apps feel shallow and rarely create real chemistry.

Competitors:
Tinder, Bumble, Hinge

Differentiator:
Birth-chart compatibility, synastry insights, voice intros, and prompt-led profiles inside the dating flow.

Goal:
Drive free trial starts and convert them into paid subscriptions.

Awareness:
solution-aware

Sophistication:
skeptical market

Campaign type:
launch

COGS:
10%

Target margin:
80%

Current AOV:
39.99

Target ROAS:
2.5
```

## Comment lire les tabs

### Score

Le score mesure la qualite des inputs, pas seulement la qualite de la sortie.
Si le score est bas, corrige d'abord audience, pain, differentiator et proof.

Repere surtout :

- `Clarity` : le produit est-il compris en une lecture ?
- `Differentiation` : le mecanisme est-il concret ?
- `Specificity` : est-ce que la copy pourrait aussi appartenir a un concurrent ?
- `Proof strength` : est-ce que le marche va croire la promesse ?
- `Channel fit` : est-ce que le canal recommande colle au produit ?

### Journey Status

C'est le feu de circulation. Tant qu'il dit `ready to spend: no`, ne lance pas
de budget important.

Les warnings les plus importants sont souvent :

- conversion event non mappe
- exclusions audiences non verifiees
- consent banner non teste
- landing mobile lente
- test purchase/test conversion non confirme

### Positioning

Utilise cette section pour clarifier le message principal. Si elle est lourde,
tes inputs sont probablement trop longs.

### Audience Avatars

Sert a choisir le ton et la preuve. Pour un marche sceptique, BigAd va demander
plus de screenshots, demo clips, customer quotes et before/after.

### Offer Architecture

Choisis l'offre a tester. Pour une app subscription, BigAd devrait privilegier :

- free trial
- guarantee si elle est vraie et juridiquement safe
- annual intro offer si la retention est deja solide

Ignore les offres qui ne collent pas au business model, comme free shipping pour
une app.

### Calendar

Utilise le calendrier pour savoir quoi faire avant, pendant et apres le launch.
Ne lis pas seulement les dates : lis les readiness gates.

### Angles

Choisis un angle avant de produire des assets. Pour AstroDating, les meilleurs
angles sont souvent :

```text
Swipe apps match on photos. AstroDating matches on compatibility.
```

```text
Your birth chart says more than another empty bio.
```

```text
Less shallow swiping. More real compatibility.
```

### Concepts

Cette section transforme les angles en concepts publicitaires. Choisis 1 a 3
concepts maximum pour un premier test. Trop de concepts au debut dilue le signal.

### Briefs et Shots

Ce sont les sections pour le createur, le monteur ou toi-meme. Elles doivent
repondre a trois questions :

- Qu'est-ce qu'on filme ?
- Pourquoi cet asset existe ?
- Quelle variable est testee ?

### Launch Readiness

C'est la section la plus importante avant de depenser. Une bonne creative avec
un mauvais tracking donne de mauvaises decisions.

### Landing et App Store

Ce sont des drafts. Edite-les avant publication. BigAd donne une structure, mais
tu dois retirer les phrases trop longues, verifier les claims, et ajouter la
preuve reelle.

### Export Brief

Utilise l'export quand tu veux partager la strategie. C'est le format le plus
pratique pour Notion, Linear, un monteur, un media buyer ou un fondateur.

## Ce qu'il faut toujours verifier avant spend

Avant de lancer une campagne payante, confirme :

- pixel ou SDK actif
- event `trial_start` ou equivalent
- event `subscribe` ou `purchase`
- UTMs fixes au niveau plateforme
- exclusions customers/trialists appliquees
- landing mobile sous 2.5s LCP si possible
- consent banner ne casse pas les events
- test conversion visible dans la plateforme
- offre visible dans la creative
- preuve visible dans les 10 premieres secondes

## Regle de production creative

Pour un premier launch, ne produis pas 20 variations aleatoires.

Produit plutot :

- 3 concepts
- 2 hooks par concept
- 1 proof beat par concept
- 1 CTA clair

Exemple de matrice simple :

| Concept | Hook | Proof | CTA |
| --- | --- | --- | --- |
| Honest contrast | Swipe apps match on photos. AstroDating matches on compatibility. | Screen demo compatibility score | Try AstroDating free |
| Mechanism reveal | Your birth chart says more than another empty bio. | Synastry preview | See your compatibility |
| Small specific win | Set up once. See better-fit matches. | First 90 seconds of onboarding | Start free |

## Si la copy sort trop brute

Symptomes :

- phrases trop longues
- repetition de l'audience complete
- `dating app app`
- ellipses de troncature
- goal business utilise comme promesse client
- offers non pertinentes

Fix rapide :

1. Raccourcis `Audience`.
2. Raccourcis `Core pain`.
3. Raccourcis `Differentiator`.
4. Remplace le goal business par un objectif marketing clair.
5. Regénère.

Inputs plus propres pour AstroDating :

```text
Audience:
Astrology-curious singles tired of swipe fatigue.

Core pain:
Swipe apps feel shallow and rarely create real chemistry.

Differentiator:
Birth-chart compatibility and voice-led profiles inside the dating flow.

Goal:
Increase free trial starts and paid subscription conversions.
```

## Comment juger une sortie BigAd

Une bonne sortie BigAd doit avoir :

- un angle que tu peux dire a voix haute en 3 secondes
- une preuve visible, pas seulement une promesse
- une offre simple
- un CTA court
- un readiness status clair
- une hypothese de test mesurable

Une sortie n'est pas prete si elle depend de phrases comme :

- "revolutionary"
- "game-changing"
- "next level"
- "unlock your potential"
- "best-in-class"

## Guide de decision rapide

Si le score est bas : corrige les inputs.

Si la copy est lourde : raccourcis audience, pain et differentiator.

Si proof strength est faible : ajoute screenshot, demo, customer quote ou case study.

Si tracking readiness est sous 70 : ne scale pas.

Si CTR est bon mais CVR faible : probleme landing/offer.

Si CTR est faible et CPM normal : probleme hook/creative.

Si ROAS est faible avec bons CTR/CVR : probleme economics, price, retention ou attribution.

## Bon usage pour AstroDating

La promesse ne doit pas etre "l'astrologie va trouver l'amour pour toi".

La promesse devrait etre :

```text
AstroDating makes compatibility visible before the conversation starts.
```

Bonnes preuves a ajouter :

- screenshot d'un compatibility score
- preview d'un synastry insight
- demo d'un voice intro
- exemple de profile prompt
- quote utilisateur
- before/after d'une conversation plus facile

Bon CTA :

```text
Try AstroDating free
```

ou :

```text
See your compatibility
```

## Input Assistant et Proof Asset Plan

Deux nouveaux modules aident a juger la qualite des inputs et la maturite de la
preuve avant de depenser.

L'`Input Assistant` est integre en haut du tab `Score`. Il lit les inputs bruts
et emet un score 0-100, des warnings typees (audience trop longue, pain trop
vague, differentiator trop generique, goal traite comme promesse client,
champs offerContext manquants, marche sceptique sans preuve nommee) et des
suggestions de reecriture pour `audience`, `core pain`, `differentiator`,
`goal`. La section `Rewritten hints` affiche un comparatif "tu as ecrit X" vs
"BigAd suggere Y" par champ, et liste les 2 a 4 types de preuves dont le
produit a besoin.

Le tab `Proof` (place apres `Launch readiness`) montre le `Proof readiness
score` et le plan de capture des assets : screenshots, demo videos, customer
quotes, before/after, case studies, app-store reviews et founder stories.
Chaque asset porte une priorite (must-have / should-have / nice-to-have), une
liste de surfaces ou il sert (landing-hero, static-1-1, video-9-16,
store-listing...), une instruction de capture concrete, et l'objection avatar
qu'il adresse. La liste `Missing before spend` regroupe les must-haves a
capturer avant tout budget. Quand le score est sous 50 et que le mix avatar est
sceptique ou mature, `Journey Status` ajoute un warning creative pour bloquer
le go.

## Execution OS

Trois nouveaux modules transforment BigAd d'un generateur de strategie en
cockpit de media buying : `Creative Testing Matrix`, `Campaign Setup Builder`,
et `Next Iteration Planner`. Ils sont reunis dans un nouveau tab `Execution`
place entre `Launch readiness` et `Proof`.

Le `Creative Testing Matrix` calcule 3 a 12 test cells couvrant l'espace
(avatar x concept x hook x format x offer). Le premier batch (3 a 6 cells)
varie sur exactement UN axe par rapport a un baseline, donc chaque cell lit un
seul apprentissage. Chaque cell porte un primary KPI, un secondary KPI, une
kill rule basee sur la tier `starter` du KPI ladder, une scale rule basee sur
la tier `scaling`, et un objectif d'apprentissage. En marche sceptique ou
mature, chaque cell du premier batch doit referencer un asset de preuve
must-have ; un warning `missing-proof` est leve quand le plan en manque.

Le `Campaign Setup Builder` traduit la matrice en specification prete au
launch : convention de nommage `PRODUCT-FUNNEL-COUNTRY-CONCEPT-VARIANT`, une
a trois campagnes (cold acquisition + engaged-60d retargeting + site-90d
retargeting pour les windows promo de launch / seasonal), ad sets avec
exclusions standards (`Existing customers`, `Active trialists` sur le cold),
un UTM template generique, et une pre-launch checklist qui refete les checks
de tracking readiness. Les produits subscription / freemium incluent toujours
les deux conversion events `trial_start` (cold) et `subscribe` (retargeting).

Le `Next Iteration Planner` emet une recommandation par weak-signal :
`winning`, `weak-hook`, `weak-hold`, `weak-click`, `weak-conversion`,
`weak-roas`, `proof-bottleneck`. Chaque recommandation porte un diagnostic
court, 2 a 4 next steps concrets, les prochains assets a produire, et les
prochains angles a tester tires de la hook library non utilisee dans le
premier batch. C'est la carte du "quoi shipper apres" une fois que le premier
batch a parle.

Garde-fou Execution : quand le `trackingReadiness.score` tombe sous 50, le
tab Execution passe en mode "plan only, do not spend" et `Journey Status`
remonte un blocker dedie. Les must-haves manquants du `proofAssetPlan` se
transforment en warnings creative individuels pour la tracabilite.

## Project Workspace

BigAd peut sauvegarder ton travail. Le bandeau en haut de la page expose le
`ProjectSwitcher` : selectionne un projet existant, ou tape un nom et clique
`Save as new project` pour persister les inputs courants. Une fois un projet
actif, le bouton `Save run` snapshot l'input + la strategie generee dans
l'historique du projet, et le bouton `Update inputs` ecrase les inputs
sauvegardes sans toucher aux runs precedents.

Le nouvel onglet `Workspace` (place a la fin du strip de tabs, apres `Export
brief`) affiche trois sections :

- `Run history` liste chaque snapshot avec son timestamp, l'offre de tete et
  le nombre de windows. Le bouton `Compare with latest` ouvre un diff au
  niveau du champ entre la run choisie et la plus recente.
- `Test results log` rend chaque test cell de la run la plus recente comme
  une ligne editable : status (winning / losing / inconclusive / killed-early
  / paused / not-yet-launched), spend, jours, et metriques optionnelles.
- `Learning memory` derive automatiquement des resultats logges. Pattern de
  hook, kind d'offre, format, avatar, audience tier, kill-rule et proof asset
  sont agreges en `Learning` avec une confidence (low / medium / high) selon
  le nombre de resultats supportants.

Tout est stocke dans `localStorage` sous des cles versionnees
(`bigad:projects:v1`, `bigad:runs:v1`, `bigad:test-results:v1`,
`bigad:active-project-id:v1`). Rien ne quitte le navigateur. Le moteur reste
pur : `buildStrategy(input)` est inchange. Quand une learning memory de
confidence `high` existe sur un signal `*-winning`, le `Next Iteration
Planner` ajoute une recommandation `Double down on <subject>` apres les sept
recommandations fixes. Les learnings `-losing` produisent une recommandation
`Retire <subject> from next test batch`. Les sept signaux faibles initiaux
restent au meme index, donc l'UI Execution n'est pas perturbee.

L'`Export brief` ajoute une section `## Campaign Log` qui n'est emise que
quand le projet actif a des runs, des results, ou une learning memory. Elle
montre les 5 dernieres runs avec leur delta de strategie en une ligne, les 10
derniers test results avec leur status et leurs metriques, et le bloc
`Current learnings` groupe par signal.

## Maintenance du guide

Quand BigAd ajoute un nouveau module, mets a jour ce guide si le module change
le workflow utilisateur. Le README peut rester technique ; ce guide doit rester
operator-friendly.
