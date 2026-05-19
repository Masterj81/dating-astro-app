# Guide CampaignOS (formerly BigAd)

CampaignOS aide a transformer une idee produit en plan marketing exploitable :
positionnement, angles publicitaires, offres, calendrier de lancement,
briefs createurs, scripts video, landing copy, store copy, tracking readiness,
KPI targets et export markdown.

Le bon usage de CampaignOS n'est pas de copier toute la sortie telle quelle. Le bon
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

CampaignOS fonctionne mieux avec des inputs courts, concrets et propres. Evite les
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

Sert a choisir le ton et la preuve. Pour un marche sceptique, CampaignOS va demander
plus de screenshots, demo clips, customer quotes et before/after.

### Offer Architecture

Choisis l'offre a tester. Pour une app subscription, CampaignOS devrait privilegier :

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

Ce sont des drafts. Edite-les avant publication. CampaignOS donne une structure, mais
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

## Comment juger une sortie CampaignOS

Une bonne sortie CampaignOS doit avoir :

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
"CampaignOS suggere Y" par champ, et liste les 2 a 4 types de preuves dont le
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

Trois nouveaux modules transforment CampaignOS d'un generateur de strategie en
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

CampaignOS peut sauvegarder ton travail. Le bandeau en haut de la page expose le
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

## Rapport client (Client-Ready Report)

Quand tu veux remettre un livrable a un fondateur ou un stakeholder, ouvre la
route `/report` (lien `Open client report` dans l'onglet `Report` de la vue
Strategy, ou directement `http://127.0.0.1:3100/report`). Le rapport synthetise
le projet actif, sa run la plus recente (et jusqu'a deux runs precedents pour
la comparaison), les test results loggees et la learning memory derivee, en un
document imprimable a une seule colonne.

Le rapport contient dix sections toggleables :

- `Executive Summary` (≤12 puces, ≤24 mots chacune)
- `Strategy Snapshot` (positionnement, top angle, top offer, fenetre courante, audience, 6-10 KV)
- `Input Quality` (score, warnings, suggestions, rewritten hints)
- `Proof Plan` (assets prioritaires + manquants avant spend)
- `Execution Plan` (recommended first batch + iteration recommendations)
- `Campaign Setup` (naming convention, campagnes, ad sets, UTM, reporting columns)
- `Test Results` (statut, spend, jours, metrique cle)
- `Learning Memory` (learnings groupees par signal avec confidence)
- `Decision Log` (decisions triees blocker → warning → info)
- `Next Actions` (max 10, classees blockers puis produce → test → decide → measure → operate)

Les cases a cocher en haut de la page activent ou desactivent chaque section.
Le bouton `Print / Save as PDF` utilise le dialogue natif du navigateur — aucune
dependance PDF tierce. Le bouton `Download Markdown` exporte le meme contenu
en `.md` pour Notion, Linear ou un doc partage. Les regles `@media print`
cachent la barre de toggles et les boutons, et empechent les tableaux de se
couper entre deux pages.

Le builder est pur et deterministique : meme inputs → rapport byte-identique.
Le timestamp `generatedAt` est derive de `max(updatedAt)` sur les runs et
results inclus, jamais `Date.now()`, donc deux builds successifs sur le meme
historique produisent exactement le meme document.

## Review & Approval Layer

Once a project has at least one saved run, the new `Review` tab (placed
between `Workspace` and `Report` in the tab strip) opens the Review &
Approval board. The board seeds ten reviewable items from the active
run's strategy: six **critical** items that block approval (positioning,
offer, proof assets, first test batch, campaign setup, client report)
and four **non-critical** reviewable items (tracking readiness, creative
QA, launch readiness, next iteration plan). Each item has a status
(pending / approved / needs-changes / blocked), an optional `assignedTo`
author (owner / client / media-buyer / creator), and a comments thread.

At the top of the tab sits an **approval score** (0-100) and a
readiness pill (`not-ready` / `partial` / `ready`). The score adds 12
per approved critical, 5 per approved non-critical, subtracts 10 per
blocked critical, 5 per critical needing changes, and 2 per unresolved
comment (cap 20). When every critical is approved and no comments are
open, an 8-point bonus pushes the score to 100. Readiness flips to
`ready` only when every critical is approved, no critical is blocked,
and zero comments are unresolved.

A compact `Client handoff` panel sits at the top of the tab — it
filters down to items assigned to the client and open client comments,
so the owner can scan the open thread before diving into the full
board. The full board exposes a per-author filter chip strip
(all / owner / client / media-buyer / creator), and each item card
shows the status switcher, the assigned-to selector, a quick approve
shortcut, and an inline comments thread with resolve and delete.

When the Review board is non-empty, the markdown `Export brief` gains
an `## Approval Pack` section: approval score line, critical approvals
counter, unresolved comments counter, the critical and non-critical
items lists with their status / approver / unresolved counts, and the
open comments grouped by author and item. When the board is empty or
absent, the section is omitted entirely — the rest of the brief is
byte-identical to the pre-review build.

The Journey Status block above the tab strip reads the same board:
when readiness is not `ready`, the block raises a `review`-kind entry
(severity escalates to `blocker` when any critical is blocked or still
pending) and `ready-to-spend` requires approval on top of every
existing gate.

Everything persists in `localStorage` under versioned keys
(`bigad:review-items:v1`, `bigad:review-comments:v1`). Nothing leaves
the browser. The engine itself stays pure: `buildStrategy(input)` is
unchanged, and every derived selector (`summarizeReviewBoard`,
`unresolvedCommentCountByItem`, `criticalBlockingMessages`) reads
caller-supplied timestamps only — never `Date.now()` — so two reads
of the same board produce byte-identical output.

## Agency Packaging Layer

The `Agency` tab (placed between `Review` and `Report` in the tab strip)
packages a CampaignOS run for an agency-style delivery. It is a thin client
layer over the engine — the engine itself never sees the agency
selection, so `buildStrategy(input)` stays byte-identical regardless of
which template, role, or package is picked.

Three registries drive the tab:

- **Project templates** — five presets (`app-launch`,
  `ecommerce-seasonal`, `saas-evergreen`, `local-service-leadgen`,
  `creator-product-launch`). Picking one shows its campaign type and
  business model, the default proof requirements that block paid spend,
  the tracking events the operator should make sure are firing, the
  recommended output and report sections, the review approvals that
  matter for this template, and a suggested package.
- **Role presets** — five views (`owner`, `client`, `media-buyer`,
  `creator`, `strategist`). Selecting a role surfaces what that role
  cares about, what they typically approve, what's safe to hide from
  them, the natural handoff format (meeting / video walkthrough /
  doc-only / async comments), and 2-5 default questions that role
  usually opens.
- **Package presets** — four scopes (`strategy-sprint`,
  `launch-sprint`, `growth-os-setup`, `custom-build`). Each carries a
  summary, deliverables list, timeline range in days, USD price range
  (operator-side reference), the CampaignOS modules included, the client's
  responsibilities, an upsell path, and the acceptance criteria the
  engagement is signed off against. Selecting an upsell card swaps the
  current package selection so the operator can walk a client up the
  ladder in place.

Below the three selectors sits a **delivery summary** that is derived
from the active strategy plus any selected template / role / package
plus the live review board / learning memory. It groups output into
six sections: what was decided, what needs approval, what will launch
first, missing assets, what the client needs to provide, and the next
meeting agenda. The summary is pure: same input twice produces
byte-identical output. `derivedAt` is the max of every caller-supplied
timestamp across the board, memory, and strategy — never `Date.now()`.

Below the summary sit a deduped **client responsibilities** list
(union of package and template) and a flat **acceptance criteria**
list (from the package). The markdown `Export brief` gains an
`## Agency Delivery Pack` section when any agency field is present —
with the selected template, package, role-based handoff notes, the
delivery summary, the deduped responsibilities, and the acceptance
criteria. When no agency context is supplied (or every nested field is
undefined), the section is omitted entirely so the rest of the brief
is byte-identical to the pre-agency build.

Selection state persists in `localStorage` under the versioned key
`bigad:agency-selection:v1`, scoped per project. Nothing leaves the
browser.

## Playbook Library

The `Playbooks` tab (placed between `Agency` and `Report` in the tab
strip) wraps the engine with ten opinionated, frozen recipes for the
most common CampaignOS-ready archetypes:

- `saas-free-trial-launch` — self-serve SaaS optimising trial_start,
  activation, and subscribe.
- `mobile-app-launch` — consumer subscription app paid push with
  install / trial_start / subscribe events.
- `dating-app-launch` — consumer dating app launch in a mature
  category, leaning on founder story and safety claims.
- `ecommerce-seasonal-promo` — three-tier promo on a seasonal calendar
  with prospecting + engaged + site retargeting.
- `local-service-leadgen` — always-on geo-targeted lead generation
  optimising CPL and qualified leads.
- `creator-product-drop` — creator-led product drop leveraging an
  existing waitlist plus paid amplification.
- `waitlist-launch` — pre-launch demand validation that captures
  email + intent ahead of the real launch.
- `retargeting-rescue` — ROAS rescue on an existing 60-day pool, with
  exclusions and frequency discipline.
- `landing-cro-sprint` — landing-page A/B sprint with one-variable
  discipline and warm-traffic measurement.
- `agency-strategy-sprint` — 5-7 day strategy + first-test-batch
  deliverable for new agency clients.

Each playbook carries a category, best-for / not-for phrasing, the
business model + campaign type + awareness + sophistication it
expects, channel mix, ordered recommended modules, required input
fields, 3-6 concrete proof requirements, 6-10 ordered execution steps,
3-6 launch gates, a default test plan (cell-count range, formats,
one-variable-at-a-time, budget / kill / scale rule hints), reporting
KPIs, review approval kinds, an estimated timeline range, and 2-5
risk notes.

The tab opens with a **recommended playbook** card showing the fit
score, why-it-fits bullets, and an "Apply playbook" button. The
recommender is pure and deterministic: it scores every playbook
against `business-model match (+25)`, `campaign-type match (+15)`,
`awareness match (+10)`, `sophistication fit (+8 / -5)`, `category
coherence (+10)`, `channel overlap (up to +9)`, `proof / tracking
readiness alignment (+5 each)`, `required-inputs presence (up to
+10)`, an `anti-fit penalty (-20)` for `retargeting-rescue` when no
retargeting pool exists, and a `+5 nudge` when the agency template
nominates the playbook. Ties break by playbook id ascending — stable
for any input. `derivedAt` is the max of strategy / input timestamps
when present; it is never `Date.now()`.

Applying a playbook does **not** mutate `ProductInput`. It only sets
the local applied-playbook record under `localStorage`
(`bigad:applied-playbook:v1`) and feeds context to the UI and to the
markdown `Export brief`, which gains an optional
`## Playbook Recommendation` section with the selected playbook, the
execution checklist, the launch gates with pass / fail markers when
computable, the default test plan, the reporting focus, and the risk
notes. With no playbook context, the brief is byte-identical to the
pre-playbook build.

Below the recommended card sit:

- A **suggested next actions** panel with the next three execution
  steps from the active playbook.
- A **top alternatives** grid showing playbooks ranked 2-5 with their
  fit score and one or two reasons.
- The **recommended modules** chip strip in generation order — these
  are the CampaignOS tabs the playbook expects the operator to lean on
  first.
- The **execution checklist** derived from the playbook fields
  (inputs, proof, creative, tracking, review, launch).
- The **required proof** list, with green checkmarks when a matching
  asset appears in the strategy's proof asset plan.
- The **launch gates** list with pass / fail markers for tracking and
  proof readiness when computable.
- The **default test plan** with cell-count range, formats, budget
  guidance, kill rule hint, and scale rule hint.
- The **reporting focus** chips.
- The **risk notes** bullet list.

The engine itself never sees the playbook selection — `buildStrategy(
input)` is byte-identical regardless of which playbook the operator
applies.

## Maintenance du guide

Quand CampaignOS ajoute un nouveau module, mets a jour ce guide si le module change
le workflow utilisateur. Le README peut rester technique ; ce guide doit rester
operator-friendly.

Le `Review & Approval Layer` (onglet `Review` du strip, entre `Workspace` et
`Report`) ajoute un board d'approbation par run sauvegardee : six items
critiques (positionnement, offre, proof assets, premier batch de tests, setup
campagne, rapport client) et quatre items non-critiques reviewables (tracking
readiness, creative QA, launch readiness, next iteration plan). Chaque item
porte un statut (pending / approved / needs-changes / blocked), un assignataire
(owner / client / media-buyer / creator), et un fil de commentaires; un
sous-panneau `Client handoff` filtre les items assignes au client et les
commentaires ouverts du client; un score d'approbation (0-100) et une pastille
de readiness (`not-ready` / `partial` / `ready`) chapeautent l'onglet; l'export
markdown gagne une section `## Approval Pack` quand le board contient au moins
un item, et le `Journey Status` exige `ready` avant de passer `ready-to-spend`.
Tout est stocke dans `localStorage` sous les cles versionnees
`bigad:review-items:v1` et `bigad:review-comments:v1` — rien ne quitte le
navigateur, et le moteur reste pur.

Le `Agency Packaging Layer` (onglet `Agency`, entre `Review` et `Report`)
emballe le run pour une livraison de type agence : cinq templates de projet
(app-launch, ecommerce-seasonal, saas-evergreen, local-service-leadgen,
creator-product-launch), cinq vues de role (owner, client, media-buyer,
creator, strategist) et quatre packages (strategy-sprint, launch-sprint,
growth-os-setup, custom-build) chacun avec ses deliverables, sa fourchette
de duree, sa fourchette de prix, les modules CampaignOS inclus, les
responsabilites client et les criteres d'acceptation. En dessous, un
**delivery summary** deterministe regroupe ce qui a ete decide, ce qui
attend approbation, ce qui partira en premier, les assets manquants, ce
que le client doit fournir et l'ordre du jour de la prochaine reunion;
l'export markdown gagne une section `## Agency Delivery Pack` lorsqu'au
moins un champ agency est fourni. La selection est stockee dans
`localStorage` sous la cle versionnee `bigad:agency-selection:v1` —
encore une fois, le moteur reste pur et rien ne quitte le navigateur.
La `Playbook Library` (onglet `Playbooks`, entre `Agency` et `Report`)
propose dix recettes deterministes (saas-free-trial-launch,
mobile-app-launch, dating-app-launch, ecommerce-seasonal-promo,
local-service-leadgen, creator-product-drop, waitlist-launch,
retargeting-rescue, landing-cro-sprint, agency-strategy-sprint) avec
pour chacune le business-model attendu, le campaign-type, l'awareness,
la sophistication, les canaux, les modules recommandes, les inputs
requis, les exigences de proof, 6-10 etapes ordonnees, les launch gates,
un test-plan par defaut (cellules, formats, budget / kill / scale), les
KPIs de reporting et les risques. Le recommander pur classe les dix
playbooks via un fit-score 0-100 (business-model +25, campaign-type
+15, awareness +10, sophistication +/-, channel overlap, readiness
alignment, inputs presents, anti-fit retargeting -20, nudge agency
+5); les egalites cassent par id ascendant et `derivedAt` ne lit jamais
`Date.now()`. Appliquer un playbook ne mute jamais le ProductInput —
ca pose juste la selection dans `localStorage`
(`bigad:applied-playbook:v1`) et l'export gagne une section
`## Playbook Recommendation` avec la checklist d'execution, les gates,
le test-plan, le reporting et les risques.

## First-Run Onboarding & Demo Projects

When you open CampaignOS for the first time (zero saved projects), a
**Welcome panel** appears above the input panel. It walks you through
two quick steps:

1. **Pick a goal** — one of seven options (Launch an app, Launch a
   SaaS trial, Run an e-com promo, Stand up always-on lead-gen, Fix
   tracking or proof gaps, Package an agency deliverable, Just
   exploring). Each goal nominates the playbook CampaignOS recommends
   and the 3-5 strategy modules to focus on first. The pick persists.
2. **Load a demo project** — three fully-shaped projects ship with
   CampaignOS:
   - `AstroDating` — values-first dating app launch with founder-story
     hooks and an open proof-gap comment from the client.
   - `Loopwork` — B2B SaaS 14-day trial launch with case-study-led
     hooks and a tracking handoff still in progress.
   - `Clearmark` — mature-market skincare fall promo with a 3-tier
     audience architecture and a near-clean review board.
   Loading a demo seeds a project, a saved run, 4-8 test results, the
   review board (with sample comments), and the recommended playbook
   — so you can see every CampaignOS surface populated end-to-end
   before swapping in your own inputs.

If you would rather start clean, the "Create empty project" button
keeps the input panel empty and dismisses the welcome panel. The "Skip
onboarding" link dismisses it without choosing.

Once at least one project exists, the welcome panel is gone and a
compact **Next Best Action + Progress Checklist** strip lives at the
top of the Workspace tab. The Next Best Action card surfaces the
single highest-priority thing to do — pick a goal, load a demo, fill
inputs, fix tracking, capture proof, approve criticals, plan the
first batch, or export the report — with a one-sentence rationale
grounded in the current numbers (tracking score, proof readiness,
critical approvals). The Progress Checklist mirrors the seven canonical
onboarding steps with green / grey dots and a short status sentence
per row.

The Welcome panel and the Workspace strip are **not** a new top-level
tab. Onboarding sits inside the existing workspace. State persists
per-browser under two new versioned keys — `bigad:onboarding:v1` (goal
+ completed steps + dismissed flag) and `bigad:demo-loaded:v1` (which
demos have been loaded). The export brief gains an optional one-line
`**Onboarding goal:**` sentence at the top of the `## Campaign Log`
section when a goal is set; absent → byte-identical. `buildStrategy(
input)` is unchanged.

En francais : la couche `Onboarding & Demo Projects` ajoute un panneau
de bienvenue au premier lancement (sept buts a choisir, trois projets
de demo entierement remplis a charger), et une bande compacte
`Prochaine action + Checklist` en haut de l'onglet Workspace une fois
qu'au moins un projet existe. Aucun nouvel onglet — l'onboarding vit
dans l'espace de travail existant. Tout est stocke en local
(`bigad:onboarding:v1` + `bigad:demo-loaded:v1`); le moteur reste
deterministe et `buildStrategy(input)` ne change pas.

## Asset Production Manager

The Asset Production Manager turns the strategy into a tracked
production sprint. Every proof asset, creator brief, static brief,
video script (script + paired production cut), first-batch and queued
test cell, campaign-ad slot, and the client report shows up as a
single `ProductionAsset` row with a stable id (`<sourceKind>:<refId>:<format>`),
a priority chip (must-have / should-have / nice-to-have), an owner
role (creator / designer / copywriter / client / owner / producer /
editor / media-buyer), a status (requested → scripted → in-production
→ in-review → approved → shipped, with a rejected escape), a due
window in days from today (driven by the applied playbook's
`estimatedTimelineDays.min` — must-haves land in days 0-40% of the
sprint, should-haves in 30-70%, nice-to-haves in 50-100%), and a
quality-check matrix (file-link / brand-present / no-unsupported-claim
/ format-matches-placement everywhere; captions / aspect-ratio /
export-size for video; aspect-ratio / export-size for static;
proof-visible / cta-visible for cold-acquisition cells; proof-visible
for quotes and case studies). Test cells with `proofAssetRequired`
get a dependency entry pointing at the matching proof-asset row, so
the missing-blockers banner can call out "Test cell X blocked by
proof asset dependency" the moment the proof row isn't approved.

Two derived signals matter for launch:

- **Readiness score (0-100)** — sum of per-asset status points (0–10)
  plus 0.5 per done required check, divided by `(must-have +
  should-have) × 10 + Σ required checks × 0.5`. 100 means every
  must-have and should-have is shipped with every required quality
  check done. The Journey Status block reads this — if you pass an
  `assetSummary`, `ready-to-spend` is gated behind score ≥ 70 with no
  pending must-haves, and any pending must-have with score < 30
  escalates the warning into a blocker chip.
- **Missing blockers** — surfaces three reason kinds: every must-have
  that is not approved/shipped, every shipped asset still missing a
  required quality check, and every test-cell asset whose proof
  dependency is not approved/shipped.

State persists per run in `bigad:assets:v1`; re-deriving the plan
merges by id so the existing status, file link, notes, and quality-check
done flags survive. Loading a different run swaps the queue; nothing
leaves your browser.

The dedicated `Assets` tab in the workspace (between Execution and
Proof) surfaces six sections: a production queue with inline status
switcher / owner picker / file-link input / quality-check toggles, a
missing-blockers banner, a by-owner workload grid (count + ready
chip per role), a by-status kanban with seven columns (requested →
shipped), a per-asset quality checklist with required vs optional
chips, and a where-used grouped view (test cell / campaign ad /
landing page / report / proof block).

The export brief gains an optional `## Asset Production Plan` section
(readiness score, must-have list with status + due window, should-have
/ nice-to-have list, owner workload, quality-check progress per kind,
missing blockers) when the caller passes the asset-production
context and the plan has assets. Absent or empty → byte-identical.

En francais : le `Asset Production Manager` ajoute un onglet `Assets`
(entre Execution et Proof) qui suit chaque livrable creatif issu de la
strategie comme une seule ligne — id stable, priorite, role
proprietaire, statut (requested → shipped), fenetre due en jours,
checklist qualite et dependances. Le score de readiness (0-100) et la
liste `missingBlockers` viennent gater `ready-to-spend` quand on les
passe au Journey Status. L'export `## Asset Production Plan` est
optionnel, byte-identique en son absence. Persistance locale sous
`bigad:assets:v1`; le moteur reste deterministe.

## Unit Economics / Offer Lab

The Unit Economics / Offer Lab turns the ProductInput plus the engine's
ranked offers into a profitability summary the operator reads
side-by-side with the offer architecture. The new `Economics` tab
(between Calendar and Angles) carries a viability pill — `viable`
(green), `tight` (amber), `unviable` (red), `incomplete` (grey) — plus
six summary cards (AOV, gross margin, expected LTV, allowable CAC,
breakeven ROAS, target ROAS with the cushion vs. breakeven), a
subscription block when the business model is subscription or freemium
(monthly price, expected months retained, trial-adjusted LTV, payback
months), and a per-offer scenario table with the breakeven CPA, the
breakeven ROAS at the offer's discount, the allowable CAC, a viability
pill, and a one-sentence risk note.

The math is deterministic and runs entirely in the browser. Gross
margin is `1 - cogsPercent`; breakeven ROAS is `1 / grossMargin`;
allowable CAC is `LTV × targetMargin` for one-time products and
`trialAdjustedLtv × targetMargin` for subscriptions. Subscription LTV
is `monthlyPrice × grossMargin × expectedMonthsRetained`, where
expected months is `1 / monthlyChurnRate` (default 10% monthly churn,
clamped to [1, 48] months). When a free trial is present, LTV is
multiplied by the trial-to-paid rate (default 40%). Payback months is
`breakevenCpa / (monthlyPrice × grossMargin)`, clamped to [0.5, 48].
Every default the engine falls back on emits a warning so the operator
sees exactly which value is an assumption versus a measured input.

Warnings cover the common ways the math can fail in production:
`missing-price` (blocker — engine cannot run), `target-roas-below-
breakeven` (blocker — no path to profit at the assumed margin),
`incoherent-price-business-model` (warning — a $300/mo subscription
or a sub-$5 single unit), `gross-margin-too-low` (warning — < 30%),
`payback-too-long` (warning — > 12 months), `cac-window-tight`
(warning — allowable CAC < $5 or < 15% of breakeven CPA), and a
missing-trial-to-paid / missing-churn / missing-cogs / missing-aov
trio that surfaces every default that was applied. The Recommended
action panel rolls everything up to one sentence — `Reprice or reduce
COGS before spend` (unviable), `Define kill rules tight; one-variable
testing only` (tight), `Cleared for testing — proceed to creative
production` (viable), `Provide missing inputs: ...` (incomplete).

Journey-status integration is automatic: the engine threads the
economics summary into `buildJourneyStatus` so `unviable` raises a
blocker chip in the journey block and blocks the final hop to
`ready-to-spend`, while `tight` raises a warning chip but does not
block. The export brief gains a `## Unit Economics / Offer Lab`
section between Offer Architecture and Campaign Calendar covering the
status, summary, subscription details, offer scenarios table,
assumptions list (every default that was applied), warnings, and the
recommended action. `buildStrategy(input)` stays byte-identical for
identical input — the new fields are pure derivations and
`derivedAt` is always `0`.

En francais : l'onglet `Economics` (entre Calendar et Angles) calcule
la marge brute, la LTV attendue, le CAC autorise, le CPA et le ROAS de
breakeven, et le payback en mois — purement deterministes, derives de
ProductInput. Une pastille de viabilite (`viable` / `tight` /
`unviable` / `incomplete`) chapeaute six cartes resume, un bloc
abonnement quand le modele est subscription ou freemium, et un tableau
par offre montrant le CPA / ROAS de breakeven et le CAC autorise pour
chaque levier recommande. Le bloc d'avertissements liste chaque defaut
applique (COGS 30%, churn 10%, trial-to-paid 40%) pour que l'operateur
voie ce qui est mesure versus suppose. Le journey-status emet un
chip `economics` (warning pour `tight`, blocker pour `unviable`) et
`ready-to-spend` exige `status !== 'unviable'`. L'export gagne une
section `## Unit Economics / Offer Lab`; le moteur reste deterministe
et `derivedAt` est toujours `0`. L'onglet `Forecast` qui suit
immediatement reprend ces memes economics pour proposer un budget de
test concret, trois scenarios (conservatif / base / aggressif), une
repartition par campagne / ad-set / cellule, des checkpoints Day 1 /
Day 3 / Day 5 / fin-de-test, et une action operateur d'une phrase —
sans appeler `Date.now()` et sans toucher l'output deterministe du
moteur.

## Forecast / Budget Planner

The Forecast / Budget Planner sits between Unit Economics and the
Execution-related tabs. It reads the engine's existing modules
(`unitEconomics`, `kpiTargetLadder`, `creativeTestingMatrix`,
`campaignSetup`, `trackingReadiness`) and emits a deterministic budget
plan plus a three-scenario forecast. The new `Forecast` tab carries a
status pill (`viable` / `tight` / `unviable` / `incomplete`), a
confidence pill (`low` / `medium` / `high`), six summary cards
(recommended test budget, daily budget, duration, expected
conversions at the base scenario, expected CPA, expected ROAS), a
scenario table with conservative / base / aggressive rows and the
funnel math (impressions, clicks, conversions, CPA, ROAS, revenue),
a spend allocation table grouped by campaign / ad-set / test-cell
with the share-of-total and one-sentence rationale per row, decision
checkpoint cards for Day 1 / Day 3 / Day 5 / end-of-test with kill
(red) / iterate (amber) / scale (green) conditions, a warnings panel,
and a one-sentence recommended operator action.

Scenario assumptions vary the base deterministically: conservative is
CTR × 0.7, CVR × 0.7, CPM × 1.2; base is × 1.0 each; aggressive is
CTR × 1.3, CVR × 1.3, CPM × 0.85. Base CPM / CTR / CVR come from the
KPI ladder's starter tier when present, otherwise from business-model
defaults (subscription / freemium → $20 CPM, ecommerce / one-time →
$15, services → $25, lead-gen → $12; CTR default 1.2% cold, 2.5%
retargeting; CVR default per business model). AOV / revenue is
pulled from `economics.resolvedAov`, then `subscription.trialAdjustedLtv`,
then `expectedLtv`. The budget block computes a minimum learning
budget (`expectedCpa × 5 conv/cell × cellCount`, floored at
`cellCount × $15 × 3 days`), a recommended daily budget
(`cellCount × clamp(expectedCpa × 1.5, $10, $30)`), and a duration
(`clamp(max(3, smallest cell estimatedRunDays, ceil(minLearning /
daily)), 3, 14)`). When economics or test cells are missing, the
planner falls back to $50/day × 7 days × $500 floor and emits the
matching warning.

The spend allocation table groups by campaign and ad-set when
`campaignSetup` is present (parsed `budgetSplit` percent applied
proportionally), then always splits the total budget evenly across
every cell in `recommendedFirstBatch` — the sum of test-cell rows
always equals `totalTestBudget` within ±$0.01 rounding tolerance.
That one-variable-at-a-time split is the discipline the planner
enforces: even a winning hook does not jump the test queue without
sharing the spend per cell.

Decision checkpoints anchor the kill / scale loop: Day 1 reads CTR
against base × 0.4 (kill) / 0.7 (iterate) / 1.3 (scale), Day 3 reads
CVR with the same thresholds gated by `spend > minLearning / 2`,
Day 5 reads ROAS against the target × 0.4 / 0.7 / 1.3, and the
end-of-test card promotes winners (ROAS ≥ target AND CVR ≥ target),
queues iteration for mid-tier cells, and pauses losers. Each
checkpoint references the full `cellsAffected` list so the operator
knows exactly which cells the gate applies to.

Warnings cover the common failure modes: `budget-below-learning-minimum`
(blocker — the test won't reach 5 conv/cell), `expected-cpa-above-
allowable-cac` (blocker — base scenario doesn't pay back),
`conservative-roas-below-target` (warning — the worst case fails the
profit bar), `conservative-roas-below-breakeven` (blocker — worst
case loses money on every conversion), `tracking-not-ready` (warning
when tracking < 70), `no-test-cells` / `no-economics` / `no-kpi-
targets` (input completeness), and `low-confidence-no-history` (info,
always emitted until workspace memory results land). Confidence is
`high` when all four positive signals hold (economics resolved + KPI
targets present + tracking ≥ 70 + ≥ 3 test cells) and there are zero
blocker warnings; `medium` when at least two hold with no blocker;
`low` otherwise. The status classifier returns `unviable` for any
blocker warning, `incomplete` when both economics and test cells are
missing, `tight` for 2+ non-info warnings or low confidence, `viable`
otherwise.

Journey-status integration is automatic: the engine threads the
forecast plan into `buildJourneyStatus` so `unviable` raises a
`forecast`-kind blocker chip in the journey block and blocks the
final hop to `ready-to-spend`, while `tight` raises a warning chip
but does not block. The export brief gains a `## Forecast / Budget
Planner` section (status + confidence, budget summary, scenario
table, spend allocation list, decision checkpoints, warnings,
recommended operator action) between Unit Economics and Campaign
Calendar. `buildStrategy(input)` stays byte-identical for identical
input — the new `forecast` field is a pure derivation and `derivedAt`
is always `0`.

En francais : l'onglet `Forecast` (entre Economics et Angles) lit les
sorties du moteur (economics, ladder KPI, matrice de test, campagnes,
tracking) et propose un budget de test concret avec trois scenarios
deterministes (conservatif / base / aggressif), une repartition
campagne / ad-set / cellule, des checkpoints Day 1 / Day 3 / Day 5 /
fin-de-test, et une action d'une phrase pour l'operateur. La somme
des budgets par cellule egale toujours le budget total a ±$0.01
pres — un seul variable testee a la fois, par discipline. Le
journey-status emet un chip `forecast` (warning pour `tight`,
blocker pour `unviable`) et `ready-to-spend` exige
`status !== 'unviable'`. L'export gagne une section `## Forecast /
Budget Planner`; le moteur reste deterministe et `derivedAt` est
toujours `0`. L'onglet `Simulator` qui suit immediatement
reprend ces sorties pour stresser le plan de base contre cinq
scenarios (base, CPM en hausse, CVR en baisse, lift trial ou CVR,
AOV annuel) et classer chaque levier par sensibilite — une
sandbox `what-if` sans toucher l'output deterministe du moteur.

## Scenario Simulator / What-if Lab

The Scenario Simulator / What-if Lab sits AFTER Forecast / Budget
Planner and BEFORE the Execution-related tabs. It reads the engine's
already-resolved outputs (`unitEconomics`, `forecast`, `offers`) and
emits a deterministic stress-test of the base plan. The new
`Simulator` tab carries a plan status pill, a base viability pill,
an editable base assumptions card (12 levers as numeric / select
inputs), a 5-row scenario comparison table, a sensitivity table
sorted by score, recommendation cards, and a warnings list. Edits
live in component state only — they never mutate the engine output,
and a small "Edited (local only)" badge surfaces while edits exist.
A "Reset to forecast assumptions" button drops back to the engine
default.

The plan always contains exactly 5 scenarios in stable order: `base`
(forecast + economics assumptions), `higher-cpm` (CPM × 1.30, "30%
CPM rise"), `lower-cvr` (CVR × 0.70, "30% CVR drop"), then either
`better-trial` (trial-to-paid × 1.40, capped at 65%) when the funnel
is subscription with a free trial, or `better-cvr` (CVR × 1.30) when
it isn't — exactly one of the two always appears — and finally
`higher-aov-annual` (AOV × 1.40, churn × 0.85, offer flipped to
`annual-plan-discount`). Each scenario carries an assumption set, an
outcome block (impressions, clicks, conversions, trial starts +
paid conversions when applicable, revenue, gross profit, CPA, paid
CAC, ROAS, LTV, LTV:CAC, payback months), a one-sentence risk note,
and a viability tag computed by the same classifier the Economics
layer uses (unviable when ROAS below breakeven OR paid CAC > LTV OR
LTV:CAC < 1; tight when ROAS below target OR LTV:CAC < 3 OR payback
> 12; viable otherwise).

The sensitivity engine sweeps every numeric lever (price, AOV, gross
margin, target ROAS, trial-to-paid when applicable, monthly churn
when applicable, CPM, CTR, CVR, total budget, duration days) at
-20% / -10% / +10% / +20% and computes per-step deltas in CAC,
ROAS, and payback. `sensitivityScore` is the max abs normalized
delta across the four steps × 100, clamped to [0, 100]; results sort
by score descending, then by lever name ascending for stable
ordering. A qualitative `offerKind` row tests three candidate offers
(`free-trial-7d`, `free-trial-14d`, `annual-plan-discount`) and is
ranked alongside the numeric levers.

Recommendations follow a deterministic rule set — raise price 10-15%
when price sensitivity > 30 AND base LTV:CAC > 4, test a 14-day
trial when subscription + trial sensitivity > 25 AND trial-to-paid
< 30%, refresh creative when CPM or CTR is the top lever, lock the
budget at 70% of forecast when `lower-cvr` is unviable, and offer
an annual plan when subscription payback > 9 months — capped at five
and ordered must-do → should-do → nice-to-have. Warnings cover
`only-base-viable` (≥3 non-base scenarios tight / unviable while
base is viable), `fragile-to-cvr-drop`, `fragile-to-cpm-rise`,
`fragile-to-trial-drop`, plus info-severity `no-economics` /
`no-forecast` and a blocker-severity `no-base-assumptions` when
neither input layer is present.

Journey-status integration is automatic: the engine threads the
simulator plan into `buildJourneyStatus` so `unviable` raises a
`simulator`-kind blocker chip and blocks the final hop to
`ready-to-spend`, `tight` raises a warning chip but does not block,
and `only-base-viable` always surfaces as a warning chip when
present (even when overall status stays viable). The export brief
gains a `## Scenario Simulator / What-if Lab` section (status +
base viability, base assumptions list, scenario comparison table,
top 5 sensitive levers, recommendations, warnings) between the
Forecast and Campaign Calendar sections. `buildStrategy(input)`
stays byte-identical for identical input — the new
`scenarioSimulator` field is a pure derivation and `derivedAt` is
always `0`.

En francais : l'onglet `Simulator` (apres `Forecast`, avant les
onglets Execution) lit les sorties du moteur (economics, forecast,
offres) et stresse le plan de base contre cinq scenarios
deterministes — base, CPM en hausse de 30%, CVR en baisse de 30%,
lift trial-to-paid de 40% (ou CVR +30% quand le funnel n'a pas de
trial), et plan annuel a AOV × 1.40 — puis classe chaque levier
par sensibilite (-20% / -10% / +10% / +20% pour les leviers
numeriques, trois offres candidates pour l'offre). Les
recommandations (jusqu'a cinq) sont ordonnees must-do → should-do
→ nice-to-have. Le journey-status emet un chip `simulator`
(warning pour `tight`, blocker pour `unviable`, plus un chip
permanent `only-base-viable` quand le plan ne tient que dans le
scenario de base) et `ready-to-spend` exige
`status !== 'unviable'`. Les modifications dans l'onglet sont
locales — elles ne touchent jamais l'output deterministe du
moteur. L'export gagne une section `## Scenario Simulator / What-if
Lab`; le moteur reste deterministe et `derivedAt` est toujours `0`.
Une couche `Benchmarks` (apres `Simulator`) compare ensuite la
prevision aux fourchettes de planification : il s'agit de
**reperes de planification, pas de donnees temps reel**, et les
profils manuels saisis dans l'UI restent locaux — ils n'entrent
jamais dans le moteur.

## Benchmarks / Calibration Layer

The Benchmarks / Calibration Layer sits AFTER the Scenario Simulator
and BEFORE the Execution-related tabs. It is pure derivation:
`buildBenchmarkCalibration(strategy)` reads the engine's
already-resolved outputs (`forecast`, `unitEconomics`) plus the input
dimensions (businessModel, campaignType, awareness, sophistication,
channel signal, category) and selects the top 1-3 planning-benchmark
profiles from a frozen 10-entry catalog. The selected profiles drive
consensus ranges that the forecast's resolved values are compared
against — CPM, CTR, CPC, CVR, CPA, ROAS, AOV, LTV, trial-to-paid,
and monthly churn each get a comparison row carrying a status
(`within-range`, `below-range`, `above-range`, `far-below-range`,
`far-above-range`, or `no-benchmark`), a signed delta, and a delta
percent.

**Built-in numbers are planning benchmarks, not real-time data.**
The catalog ships sensible 2026 planning ranges spanning subscription
apps, SaaS, ecommerce, local services, creator products, and B2B
services across Meta, TikTok, LinkedIn, Google Search, and Google
PMax. Each profile's `caveat` field opens with the literal phrase
"Planning benchmark, not real-time data." so the disclosure rides
along with every recommendation downstream. No scraping, no live API,
no third-party benchmark feed.

Recommendations land for comparisons that fall outside the range —
must-do for `far-below-range` / `far-above-range`, should-do for
near misses, each carrying the metric, the current forecast value,
the suggested median, and a one-sentence rationale. The calibration
layer is display-only: recommendations never modify the forecast or
simulator outputs. The new `Benchmarks` tab carries a status pill
(`calibrated` / `partially-calibrated` / `uncalibrated` /
`incomplete`), a confidence pill, top-3 profile cards (label, fit
score, matched-dimension chips, confidence, caveat), the comparison
table, recommendation cards, a warnings list, and a manual benchmark
form. Saving a manual override writes to a versioned
`bigad:benchmark-profiles:v1` localStorage namespace and surfaces
the entry below the form with a delete button. Manual profiles are
**never threaded into the engine** — they're local annotations
only.

Journey-status integration is automatic: the engine threads the
calibration into `buildJourneyStatus` so the `high-spend-uncalibrated`
warning (emitted when total test budget > $5000 and the calibration
is `uncalibrated`) escalates to a `benchmark`-kind blocker that
blocks the final hop to `ready-to-spend`. Low calibration confidence
raises a `benchmark`-kind warning chip but does not block. Far-below
or far-above comparisons surface a `benchmark`-kind warning naming
the top 2 outlier metrics. Benchmark blockers are excluded from the
operational-blocker count, mirroring the review / asset / economics /
forecast / simulator pattern. The export brief gains a
`## Benchmarks / Calibration` section (status + confidence, selected
planning benchmarks, metric comparison table, recommended assumption
adjustments, warnings, planning-benchmark disclosure line) between
the Scenario Simulator and Campaign Calendar sections.
`buildStrategy(input)` stays byte-identical for identical input —
the new `benchmarkCalibration` field is a pure derivation and
`derivedAt` is always `0`.

En francais : l'onglet `Benchmarks` (apres `Simulator`, avant les
onglets Execution) compare la prevision aux fourchettes de
planification d'un catalogue de 10 profils figes (subscription
apps, SaaS, ecommerce, services locaux, produits createurs, B2B sur
Meta, TikTok, LinkedIn, Google Search, Google PMax). Chaque profil
porte la formule "Planning benchmark, not real-time data" parce que
**ce ne sont pas des donnees temps reel** — ce sont des reperes de
planification 2026. Les recommandations (must-do / should-do /
nice-to-have) ne modifient jamais l'output du moteur. Les
overrides manuels saisis dans le formulaire restent locaux
(`bigad:benchmark-profiles:v1`) et ne touchent pas
`buildStrategy`. Le journey-status emet un chip `benchmark`
(blocker pour `high-spend-uncalibrated`, warning pour la confiance
faible et pour les ecarts `far-below-range` /
`far-above-range`); seul le blocker `high-spend-uncalibrated`
bloque `ready-to-spend`. L'export gagne une section
`## Benchmarks / Calibration` entre le Scenario Simulator et le
Campaign Calendar; le moteur reste deterministe et `derivedAt`
est toujours `0`.
