# CampaignOS, formerly BigAd

CampaignOS is a marketing-strategy workspace for founders, solopreneurs, and marketers. Describe a product on the left; get a complete, copyable marketing strategy on the right — quality score, positioning, awareness analysis, offer diagnosis, ranked ad angles, landing copy, app store listing, a starter A/B testing plan, and a one-press markdown export.

The first screen is the workspace itself, not a marketing landing page.

Source lives under `BigAd/` (the folder path is kept as-is from the previous codename).

For day-to-day use, see the operator guide: [`docs/user-guide.md`](docs/user-guide.md).

## What CampaignOS does

For any product you describe, CampaignOS produces:

- A **strategy quality score** across five dimensions (clarity, differentiation, specificity, proof strength, channel fit) with an explanation and a concrete suggestion for each
- An **offer diagnosis** — strongest promise, weakest claim, missing proof, biggest objection, and the proof asset most likely to move the needle (screenshots / demo video / customer quote / case study / before/after / app store reviews / founder story)
- A positioning statement and the four components behind it (for whom / category / unlike / unique)
- Notes on the market's **awareness level** (unaware → most-aware) and what that means for tone
- Notes on the market's **sophistication level** (fresh → mature) and what move to make next
- A **central promise** and **unique mechanism** statement
- 10 headlines spanning different copy patterns
- 5 named ad **angles**, each with a deterministic score (0-100), a best-fit channel (TikTok / Meta / Landing / App Store / Email), an awareness stage, the objection it addresses, and a one-line "why it could work" — sorted so the safest bet is #1
- **Copy variants by awareness stage** — one headline, one short ad hook, and one landing-section angle for each of the five stages, so you can plan a funnel from cold to hot
- A complete **landing page** copy block (hero, sub-hero, bullets, CTA, social proof, on-page objection handlers)
- An **App Store / Play Store** listing draft (name, subtitle, promo text, long description, keyword list)
- 3 short-form video scripts (TikTok / Reels)
- 3 Facebook / Meta ad concepts
- 5 starter A/B **experiments** with hypothesis, variants, and the metric to watch
- A **generic-copy guard** that scans the generated strategy for hollow phrases ("boost your business", "take it to the next level", "revolutionary", "game-changing", "unlock your potential", "seamless solution", "world-class", "synergy", "best-in-class", "cutting-edge", "leverage the power of", "next-generation", "one-stop shop") and proposes a specific replacement seeded from your inputs
- A ranked **offer architecture** — 7 canonical offer levers (discount, bundle, guarantee, free shipping, free gift, payment plan, free trial) ordered by fit to your business model and price tier, each with a stickiness risk, an awareness fit, and (when you fill in COGS % and target margin %) the breakeven ROAS the offer implies
- A phased **campaign calendar** with named windows (lead-in / warm-up / ramp / peak / echo / tail, or evergreen test/scale cycles for always-on), each carrying a KPI to watch, a readiness gate that must pass before it opens, a recommended offer kind, a typed list of **dip forecasts** for the soft windows inside it (mechanism + severity + day offset), a recommended **audience architecture** (single-tier prospecting outside a promo push, three-tier prospecting + engagement + site retargeting inside one, with a budget split hint), and on the first peak of a seasonal campaign an eight-question **retrospective gate**
- A set of **creator briefs** — one per top-ranked angle, each with a framing rule, alternate hook openers, a four-section spine (hook / problem / solution-or-proof / CTA), and a campaign-type-aware deliverable list
- A **shot list** per brief — 4 to 8 numbered shots covering every beat, with shot kind, framing, camera angle, duration envelope, props, and sound direction, with the midpoint duration tracking the brief's envelope
- A one-press **export brief** — a clean markdown document that bundles every section above, ready to paste into Notion, Linear, or any doc. Section order follows the stakeholder reading flow: Product snapshot → Journey Status → Audience Avatars → Positioning → Offer Architecture → Campaign Calendar → Ad Concept Cards → Hook Library → Creator Briefs / Video Scripts / Shot Lists → Creative QA / Tracking Readiness / KPI ladder / KPI diagnosis / Ad Review Checklist / Applied Ad Reviews → Editor Handoff. Secondary reference sections (score, awareness diagnosis, headlines, landing, store, experiments, CTA bank, static briefs, ad variants, TikTok / Meta scripts) follow after.

Every output is built from the inputs you provide — name, category, audience, pain, differentiator, goal, awareness, sophistication, optional commercial inputs (COGS %, target margin %, current AOV, target ROAS), and a campaign type (launch / seasonal / always-on) — so the same prompt never produces identical copy across two different products.

## Offer Architect

The Offer Architect ranks the seven canonical offer levers — discount, bundle, guarantee, free shipping, free gift, payment plan, free trial — against your business model and price tier. Subscription / freemium products lead with trial and guarantee; high-ticket leads with guarantee and payment plan; one-time leads with bundle and discount. Stickiness risk flags how strongly a given offer trains the audience to wait for the next one. When you fill in COGS % and target margin %, each recommendation also shows the breakeven ROAS at the offer's assumed give-away, so you can re-baseline before launching.

## Campaign Calendar

The Campaign Calendar turns the strategy from a snapshot into a phased plan. Pick a campaign type — launch, seasonal, or always-on — and the engine emits 6–7 windows on a timeline relative to an anchor day. Each window names the KPI to watch, the readiness gate that must pass before it opens, and the offer kind that fits. The shape generalises to non-retail products; the window names stay neutral.

Three enrichments sit on every window:

- **`dipForecasts: DipForecast[]`** — a typed list of forecasted soft windows (replaces the old `expectedDip` boolean). Each forecast carries a `mechanism` (`warm-cohort-saturation` / `warm-cohort-exhaustion` / `urgency-collapse` / `post-peak-reset`), a `severity` (`soft` / `notable` / `hard`), a `rationale`, and an `expectedAroundDayOffset` relative to the window's start. Peak windows forecast a post-peak reset; echo windows forecast warm-cohort saturation; tail windows forecast warm-cohort exhaustion; long ramp windows in seasonal campaigns forecast an urgency-collapse soft day before the anchor.
- **`recommendedArchitecture: CampaignArchitecture`** — the audience structure for the window. Outside a promo push (always-on calendars in full, and non-promo windows in seasonal/launch) every window is `single-tier` with one cold-broad prospecting tier. Promo windows in launch and seasonal campaigns (peak / ramp / echo) jump to `promo-3-tier`: cold broad + engaged retargeting (last 60 days) + site retargeting (last 90 days), with a per-window `budgetSplitHint` (e.g. `50/30/20 cold/engaged/site` for a seasonal peak).
- **`retrospectiveGate?: RetrospectiveGate`** — populated only on the first peak of a seasonal campaign. Eight prompts (one per topic: prior winning creative, prior offer performance, list quality, returning-customer angle, landing bottleneck, shipping-deadline constraint, margin guardrail, next-cycle learning), each with a one-sentence question and a one-sentence "why it matters". Render-collapsed by default in the UI so it stays out of the way until peak prep starts.

## Creator Briefs

The Creator Brief Generator turns the top-ranked angles into one-page production briefs a creator can shoot from. Each brief consumes the angle name, the input's business model, awareness, price tier, and campaign type, plus the top offer recommendation. It emits a four-section spine (hook → problem → solution / proof → CTA) with a beat, on-camera direction, visual cues, and an anti-pattern list per section. Two to three alternate hook openers are filmed back-to-back so the editor can A/B the opening cut without re-shooting the body. The deliverables list (aspect ratios, durations, source-file expectations) varies with campaign type so the creator is paid against the right cut-down set.

## Shot Lists

The Shot List Generator mirrors each brief 1:1 with a numbered shooting plan. Each list carries four to eight shots covering all four brief beats, with shot kind (talking head / product shot / B-roll / screenshot / UGC selfie / lifestyle), framing note, camera angle, duration envelope, props, and sound direction. The sum of shot-duration midpoints stays within ±2 seconds of the brief's total duration so the cut lands in the right envelope. Output is fully deterministic — same inputs always produce the same list, in the same order.

## Hook Critic

The Hook Critic scores a draft hook line on demand against eight axes — length, opener strength, stakes, specificity, payoff placement, passive voice, category-blandness, and tone-vs-awareness. The 0-100 score starts at 100 and subtracts per flag (-20 / -10 / -5 by severity), then proposes one concrete rewrite seeded from the product's category, audience pain, differentiator, and name. The critic is on-demand — exposed via `critiqueHook(draft, input)` — and runs entirely in the browser. No data leaves the page.

## Video Script Generator

The Video Script Generator turns each creator brief into a numbered line-level script. For every brief section it emits two-to-three lines mixing VO, on-camera, on-screen text, and SFX cues, each carrying a start time and a duration. Per-section duration sums stay within ±1 second of the brief section's envelope, and the total duration stays within ±2 seconds of the brief total — same envelope discipline the Shot List uses. Fully deterministic and parameterised on `input.product`, `input.audience`, and the brief's source angle.

## Ad Variant Spinner

The Variant Spinner takes a base concept (hook / hold / proof / CTA / offer) and emits exactly five variants — one per axis — where the named axis differs from the base and the other four are byte-identical. Hook swap rotates archetypes (question / contrarian / stat / before-after). Hold swap rotates pacing edits. Proof swap rotates modality (testimonial / before-after / demo / data callout). CTA swap rotates framing (commit / explore / save). Offer swap pulls from the recommendation set. Each variant carries a one-sentence rationale.

## Tracking Readiness

The Tracking Readiness Score is a deterministic 0-100 check against ten measurement pre-flight items (pixel, conversion events, exclusions, permissions, naming, UTMs, landing speed, consent, post-purchase survey, test purchase). Each check resolves from the inputs to passed / warning / blocker / unknown. Score is `floor(100 × passed / total) - 10 × blockers - 5 × warnings`, clamped to [0, 100], with a status of `ready` / `almost` / `not-ready`. This is the gate the Journey Status block reads before flipping to ready-to-spend.

## KPI Target Ladder

The KPI Target Ladder emits 24 targets — 8 KPIs (CTR, CPC, CPM, CPA, CVR, ROAS, hook rate, hold rate) × 3 tiers (starter / healthy / scaling). Each target carries two thresholds: `breakeven` (below this kills the test) and `scaling` (above this scales). Defaults vary by price tier, business model, campaign type, and the optional commercial context (target ROAS, COGS %, margin %, current AOV). Higher-better KPIs have `scaling >= breakeven`; lower-better KPIs have `scaling <= breakeven`.

## KPI Diagnosis

The KPI Diagnosis Engine takes a snapshot of measured KPIs, compares each value against the healthy-tier envelope of the ladder, and walks a deterministic decision tree — high CPM + low CTR → creative, normal CPM + high CTR + low CVR → landing-page or offer, healthy upper funnel + low ROAS → offer or audience, and so on. When `buildStrategy` runs, the engine synthesises a default near-breakeven snapshot so the UI has content; the Launch tab lets the user enter real numbers to re-run the diagnosis client-side via `diagnoseKpi(snapshot, ladder, input)`.

## Ad Review Checklist

The Ad Review Checklist is a 15-axis pre-handoff list — hook clarity, first-3s payoff, claim specificity, proof strength, offer visibility, CTA clarity, platform fit, tone match, awareness fit, pacing, visual hierarchy, captions / overlay, audio quality, brand presence, and a tracking-readiness reference. Each axis has a weight (1, 2, or 3) that varies with campaign type and price tier so the operator's attention lands where the run actually fails.

`applyAdReview(target, input, checklist)` evaluates a target — either a `CreatorBrief` (paired with its optional `VideoScript`) or a `BaseConcept` — against the checklist and returns an `AppliedAdReview`: per-axis `AdReviewFinding`s (verdict ∈ passed / partial / missing / unknown, an evidence sentence, an optional fix, the weight, and the score contribution), a `totalScore` and `maxScore`, an integer `scorePercent`, and a verdict pill (`ready` ≥ 80% / `almost` 50–79% / `not-ready` < 50%). `buildStrategy()` computes one applied review per brief and exposes the array on `Strategy.appliedAdReviews`. The Briefs tab renders each evaluation under its brief card, and the export brief includes a per-brief `## Applied Ad Reviews` table.

## Journey Status

The Journey Status block sits above the tab strip and shows where the strategy is on a six-stage spine: strategy-drafted → creative-planned → tracking-ready → KPI-aligned → review-passed → ready-to-spend. The block synthesises Tracking Readiness, KPI Ladder, KPI Diagnosis, Ad Review, Creator Briefs, Shot Lists, Video Scripts, and Variant Sets into one current stage plus a single concrete next step. Blockers and warnings surface as chips — both arrays are typed `JourneyBlocker[]` carrying `kind` (tracking / kpi / review / creative / scope), severity, message, and an optional `sourceCheck` for traceability back to the underlying readiness check, review axis, or KPI diagnosis category. Ready-to-spend flips green when every gate passes.

The Tracking Readiness check structure is exposed as `TrackingReadinessCheck` / `TrackingReadinessCheckKind` (the previous `ReadinessCheck` names were renamed for cohesion with the rest of the tracking module).

## CTA Bank

`buildCtaBank(input, offers, campaignType)` emits a deterministic bank of concise CTA variants across five styles (direct / curious / time-boxed / proof-led / low-pressure) and five surfaces (Meta feed / Meta reels / TikTok / landing primary / email). Each variant is seeded from product name, audience, pain, and the top offer kind. Reels and TikTok variants stay under seven words; landing-primary variants stay under eight; feed and email under ten. Each variant carries a one-sentence rationale and is exposed on `Strategy.ctaBank`.

## First-Frame Static Brief

`buildStaticAdBriefs(briefs, input, ctaBank)` emits a designer-actionable first-frame brief for each top-3 creator brief in all three sizes (1:1, 4:5, 9:16). Each brief carries a headline overlay, optional sub overlay, hero element, proof element, CTA badge, a 3-5 zone layout plan, and a one-sentence reading-order note. Headlines pull from the brief's first alt-hook (label stripped) and CTA badges pull from the CTA bank, matching reels for 9:16 and feed for 1:1 / 4:5.

## Creative QA Checklist

`runCreativeQA(args)` evaluates the strategy against twelve deterministic rules — hook clarity, proof visibility, offer visibility, CTA clarity, first-frame clarity, format coverage, runtime coherence, one-variable testing, visual hierarchy, message-angle alignment, audience-pain present, differentiation present — and returns one `CreativeQA` per brief plus one aggregate. Each finding carries a severity (ok / warning / blocker), a one-sentence message, and a concrete suggestion when not ok. Blocker / warning counts surface as chips under each brief, and a tripwire summary sits above the brief list.

## Editor Handoff Brief

`buildEditorHandoffs(args)` builds a self-contained markdown handoff for each brief — concept thesis, target audience, hook + alt-hooks, video script table, shot list table, static briefs by size, top three CTA picks, offer context, QA findings table, applied-review snapshot, variant axis info, and a 4-8 item asset checklist tuned to the campaign type. The Briefs tab exposes a copy button and an expand toggle on each handoff; the markdown export bundles every handoff into a `## Editor Handoff` section.

## Audience Avatar Builder

`buildAudienceAvatars(input)` emits 2-3 deterministic personas tied to the input's business model, price tier, and awareness level. Each avatar carries a buying trigger, a paraphrased core pain, a desired outcome, 3-4 typed objections (kind / statement / reframe), 2-4 failed alternatives, 3-6 emotional-language phrases, 2-4 proof types, and a one-line best-channel angle. The Audience tab renders one card per avatar and the export brief bundles them under `## Audience Avatars`. Two different inputs always produce visibly different avatar sets.

## Hook Pattern Library

`buildHookLibrary(input, avatars, rankedAngles)` emits 16-24 hooks across eight patterns — pain-first, outcome-first, contrarian, proof-led, curiosity, comparison, mistake, before-after — at 2-3 hooks per pattern. Each item carries awareness-stage fit, avatar-id fit (subset of the avatars), and a one-sentence risk note. The library proposes hooks; the Hook Critic evaluates user-typed drafts. They are complementary and kept in separate files — `hook-library.ts` does not import from `hook-critic.ts`. The Ads tab renders the library as a collapsed disclosure (it's a reference bank, not the primary surface).

## Ad Concept Cards

`buildAdConceptCards(args)` produces 3-6 concept cards covering different (avatar × pattern × offer) combinations. Each card carries a target avatar id, a hook drawn from the library, a one-sentence promise, a proof angle keyed off the avatar's proof needs, an offer tie-in referencing one of the recommended offer kinds, a designer-facing visual idea, 2-4 format fits, a test hypothesis, and a next-variant suggestion that names one of the five Variant Spinner axes. The Ads tab surfaces these above the Hook Critic / Variant Spinner / CTA Bank sections so the operator picks a concept before drilling into variants.

## Input Assistant

`assessInputQuality(input)` reads the raw `ProductInput` and emits a deterministic quality assessment: a 0-100 score, a `weak` / `okay` / `strong` status, a typed list of warnings (audience too long, pain too vague, differentiator too generic, goal-as-promise, missing offer context, no proof for skeptical market, and more) each with a concrete fix, per-field suggestions, and a `rewrittenHints` block that proposes sharper values for `audience`, `corePain`, `differentiator`, `goal`, plus the 2-4 proof types this product needs. The Score tab surfaces the assessment inline so the operator can tighten the inputs before reading any generated copy.

## Proof Asset Planner

`buildProofAssetPlan({ input, audienceAvatars, adConceptCards, offers, diagnosis })` emits a concrete, ranked plan of 4-10 proof assets the operator should capture before spend. Each asset carries a priority (`must-have` / `should-have` / `nice-to-have`), a typed proof shape (screenshot, demo-video, customer-quote, before-after, case-study, app-store-review, founder-story), actionable capture instructions, the surfaces it belongs on (landing-hero, static-1-1, video-9-16, store-listing, …), the avatar objection it addresses, and a `readinessImpact` score. The Proof tab surfaces the plan, a `proofReadinessScore`, and a "missing before spend" list. Journey Status raises a creative-kind warning when the score is below 50 and the avatar mix reads as skeptical or mature.

## Creative Testing Matrix

`buildCreativeTestingMatrix({ input, adConceptCards, hookLibrary, variantSets, ctaBank, proofAssetPlan, campaignCalendar, kpiLadder, audienceAvatars, offers })` emits 3-12 test cells that walk the (avatar x concept x hook x format x offer) space. The first batch (3-6 cells) varies on exactly ONE axis from a baseline, so every cell reads a single learning. Each cell carries a primary KPI, secondary KPI, a kill rule keyed off the KPI ladder's starter-tier breakeven, a scale rule keyed off the scaling-tier threshold, an estimated run length (3-14 days), and a learning goal. Skeptical / mature markets force a `proofAssetRequired` reference on every first-batch cell; missing must-have proof assets surface a `missing-proof` testing warning.

## Campaign Setup Builder

`buildCampaignSetup({ input, campaignCalendar, trackingReadiness, creativeTestingMatrix, audienceAvatars, offers })` turns the testing matrix into a launch-ready spec: a `PRODUCT-FUNNEL-COUNTRY-CONCEPT-VARIANT` naming convention, one to three campaigns (cold acquisition + engaged-60d retargeting + site-90d retargeting for launch/seasonal promo windows), ad sets with standard exclusions (`Existing customers`, `Active trialists` on cold), a generic UTM template, the standard reporting columns (Spend, Impressions, CTR, CPC, CPM, CVR, CPA, ROAS, hookRate, holdRate), and a pre-launch checklist that mirrors the tracking-readiness checks. Subscription / freemium products always include both `trial_start` (cold) and `subscribe` (retargeting) conversion events.

## Next Iteration Planner

`buildNextIterationPlan({ input, kpiLadder, creativeTestingMatrix, proofAssetPlan, hookLibrary, adConceptCards })` emits one `IterationRecommendation` per `WeakSignal` (`winning`, `weak-hook`, `weak-hold`, `weak-click`, `weak-conversion`, `weak-roas`, `proof-bottleneck`). Each recommendation carries a diagnosis sentence, 2-4 concrete next steps, the next proof assets to produce, and the next hook angles to try — pulled from the hook library entries not used in the first batch. The Execution tab renders the plan as the "what to ship next" companion to the testing matrix.

## Project Workspace

CampaignOS is stateful when you want it to be. The Project Workspace adds saved projects, run history, a test-results log, and a learning memory derived from real outcomes — all in `localStorage` under versioned keys (`bigad:projects:v1`, `bigad:runs:v1`, `bigad:test-results:v1`, `bigad:active-project-id:v1`). Nothing leaves your browser. The engine itself stays pure: `buildStrategy(input)` is unchanged. The new persistence shell sits on top, and the iteration planner optionally consumes the derived `LearningMemory` to append "double down on X" / "retire X from next batch" recommendations after the seven fixed weak-signal recommendations. The export brief gains an optional `## Campaign Log` section (recent runs, recent test results, current learnings) that only renders when workspace state is non-empty.

## Client-Ready Report

`buildClientReport({ project, runs, testResults, learningMemory, toggles?, generatedAt? })` produces a single deterministic document a marketer hands to a founder or stakeholder. The report bundles ten toggleable sections — executive summary (≤12 bullets, ≤24 words each), strategy snapshot, input quality, proof plan, execution plan, campaign setup, test results, learning memory, decision log, and next actions. `renderClientReportMarkdown(report)` emits the same content as a printable markdown file. The deliverable lives at the dedicated `/report` route: a single-column, print-friendly page that reads from `localStorage`, exposes per-section checkboxes (hidden in print), and a "Print / Save as PDF" button wired to the browser's native `window.print()` — no PDF dependency. Same inputs always produce a byte-identical report; `generatedAt` is derived from `max(updatedAt)` across the included runs and results so two builds with identical history match exactly.

## Agency Packaging Layer

CampaignOS adds an Agency Packaging Layer that wraps a run for delivery without touching the engine — `buildStrategy(input)` is byte-identical regardless of which template, role, or package the operator picks. Three frozen registries drive the tab: five **project templates** (`app-launch`, `ecommerce-seasonal`, `saas-evergreen`, `local-service-leadgen`, `creator-product-launch`) carrying default proof requirements, tracking emphasis, recommended output/report sections, review approval items, and a suggested package; five **role presets** (`owner`, `client`, `media-buyer`, `creator`, `strategist`) carrying cares / approves / hides chips, a handoff format, and 2-5 default questions; and four **package presets** (`strategy-sprint`, `launch-sprint`, `growth-os-setup`, `custom-build`) carrying deliverables, timeline range in days, USD price range, included modules, client responsibilities, an upsell path, and acceptance criteria. `buildDeliverySummary(input)` is pure and deterministic — it reads the strategy plus any selected template/role/package plus the live review board and learning memory and emits six grouped fields: what was decided, what needs approval, what will launch first, missing assets, what the client needs to provide, and the next meeting agenda. `derivedAt` is the max of every caller-supplied timestamp across the board, memory, and strategy — never `Date.now()`. The export brief gains an optional `## Agency Delivery Pack` section when any agency field is supplied; without it, the brief is byte-identical to the pre-agency build. Selection persists per project in `localStorage` under the versioned key `bigad:agency-selection:v1`. The dedicated `Agency` tab in the workspace surfaces the three selector groups, the delivery summary, a deduped client-responsibilities list, and the package's acceptance criteria.

## Playbook Library

CampaignOS adds a Playbook Library that wraps the engine with ten opinionated, frozen recipes for the most common CampaignOS-ready archetypes — `saas-free-trial-launch`, `mobile-app-launch`, `dating-app-launch`, `ecommerce-seasonal-promo`, `local-service-leadgen`, `creator-product-drop`, `waitlist-launch`, `retargeting-rescue`, `landing-cro-sprint`, and `agency-strategy-sprint`. Each playbook carries a category, best-for / not-for phrasing, business-model + campaign-type + awareness + sophistication fit, channel mix, ordered recommended modules, required ProductInput fields, 3-6 concrete proof requirements, 6-10 ordered execution steps with optional gates, 3-6 launch gates, a default test plan (cell-count range, formats, one-variable-at-a-time, budget / kill / scale rule hints), reporting-focus KPIs, review approval kinds, an estimated timeline range, and 2-5 risk notes. `recommendPlaybooks(input, strategy, agencySelection?)` is a pure deterministic recommender that scores every playbook against the inputs: business-model match (+25), campaign-type match (+15), awareness match (+10), sophistication fit (+8 or -5), category coherence (+10), channel overlap (+3 each, cap +9), proof / tracking readiness alignment (+5 each), required-inputs presence (+2 each, cap +10), an anti-fit penalty for retargeting-rescue when no retargeting pool exists (-20), and a +5 nudge when the agency template nominates the playbook. Scores clamp to 0-100 and ties break by playbook id ascending — stable for any input. `derivedAt` is the max of strategy / input timestamps when present; otherwise zero. Never `Date.now()`. The export brief gains an optional `## Playbook Recommendation` section when a `recommendation.topPlaybook` or an `applied` playbook is supplied; absent or empty → byte-identical. Selection persists per project in `localStorage` under `bigad:applied-playbook:v1`. The dedicated `Playbooks` tab (between `Agency` and `Report`) surfaces the recommended playbook with its fit score and why-it-fits bullets, suggested next actions, top alternatives, the recommended-modules order, an execution checklist derived from the playbook fields, required proof with capture indicators, launch gates with pass / fail when computable, the default test plan, the reporting-focus KPIs, and the risk notes. Applying a playbook never mutates `ProductInput` — it only sets the local applied-playbook record and feeds context to the UI and export.

## Unit Economics / Offer Lab

CampaignOS adds a Unit Economics / Offer Lab layer that turns the ProductInput plus the engine's ranked offers into a deterministic profitability summary. `buildUnitEconomics(input)` resolves the commercial inputs (price, AOV, COGS %, target margin %, target ROAS, with sensible defaults — 30% COGS, 30% target margin, 10% monthly churn, 40% trial-to-paid, target ROAS at breakeven × 1.4 — that are surfaced as warnings so the operator can override) and emits a `UnitEconomicsSummary` carrying gross margin, contribution margin, expected LTV, allowable CAC, breakeven CPA, breakeven ROAS, target ROAS, ROAS cushion, payback months, and a typed warnings array. Subscription / freemium products also get a dedicated `subscription` block — monthly price, expected months retained (1 / churn, clamped to [1, 48]), trial-adjusted LTV, and payback months. One-time / services / lead-gen products use a single-transaction contribution model. The classifier returns `viable` / `tight` / `unviable` / `incomplete` — unviable for any blocker warning (e.g. target ROAS below breakeven), tight for 2+ warnings or a thin ROAS cushion or a long payback or a sub-$10 allowable CAC on a subscription with a trial, incomplete when no price is resolvable, viable otherwise. `buildOfferScenarioResults(input, offers)` returns one row per `OfferRecommendation` — price, AOV, gross margin, breakeven CPA, breakeven ROAS, allowable CAC, viability, and a one-sentence risk note — so the offer architect's ranked list reads next to the math that makes each option live. Journey-status integration is opt-in: when `unitEconomics` is passed, the journey block emits an `economics`-kind entry (warning for `tight`, blocker for `unviable`) and `ready-to-spend` requires `status !== 'unviable'` on top of every existing gate. The engine itself stays byte-identical: `buildStrategy(input)` adds two deterministic fields (`unitEconomics`, `offerScenarios`) but `derivedAt` is always 0 and no `Date.now()` call is ever made. The export brief gains a `## Unit Economics / Offer Lab` section (status, summary, subscription details, offer scenarios table, assumptions, warnings, recommended action) between Offer Architecture and Campaign Calendar.

## Benchmarks / Calibration Layer

CampaignOS adds a Benchmarks / Calibration Layer that sits AFTER the Scenario Simulator and BEFORE the Campaign Calendar. It is pure derivation: `buildBenchmarkCalibration(strategy)` reads `strategy.forecast` + `strategy.unitEconomics` + the engine's input dimensions (businessModel, campaignType, awareness, sophistication, channel signal, category) and emits a `BenchmarkCalibration` whose `derivedAt` is always 0 (no `Date.now()`, no `Math.random`). **Every built-in number is a planning benchmark, not real-time data** — the catalog ships 10 sensible 2026 planning profiles spanning subscription apps, SaaS, ecommerce, local services, creator products, and B2B services across Meta, TikTok, LinkedIn, Google Search, and Google PMax. No scraping, no live API, no third-party benchmark feed.

`selectBenchmarkProfiles(strategy)` scores every profile against the input dimensions (`businessModel` +25, `campaignType` +20, `channel` +15, `awareness` +10, `marketSophistication` +10, `category` +10) and returns the top 1-3 fits sorted by `fitScore` desc, ties broken by id asc for stable ordering. The calibration layer then synthesizes consensus ranges (median-of-medians for the median, min-of-lows and max-of-highs for the range) across the selected profiles and compares the forecast's resolved values (CPM / CTR / CPC / CVR / CPA / ROAS / AOV / LTV / trial-to-paid / monthly churn) against them. Each comparison carries a status — `within-range`, `below-range`, `above-range`, `far-below-range` (value < low × 0.5), `far-above-range` (value > high × 1.5), or `no-benchmark` — plus a signed delta and a delta percent. Recommendations fall out of comparisons that land outside the range, ordered `must-do` (far) → `should-do` (near) → `nice-to-have`, each carrying the metric, the current value, the suggested median, and a one-sentence rationale. The calibration layer is **display-only** — recommendations never modify the forecast or simulator outputs.

Warnings cover `no-matching-profile` (no profile matched the inputs), `forecast-far-from-benchmark` (top three outliers across the comparisons), `low-calibration-confidence` (selected fits + built-in confidence are weak), `no-forecast-to-compare` (info), and `high-spend-uncalibrated` (blocker — emitted when total test budget > $5000 AND status is `uncalibrated`). Confidence rolls up from the selected profiles' built-in confidence weighted by fit. Status classifies to `calibrated` (≥4 usable comparisons, avg fit ≥60, zero non-info warnings), `partially-calibrated`, `uncalibrated` (no profile matched but forecast / economics present), or `incomplete` (neither forecast nor economics).

Journey-status integration is opt-in: when `benchmarkCalibration` is passed, the journey block emits a `benchmark`-kind blocker for `high-spend-uncalibrated`, a `benchmark`-kind warning for low calibration confidence, and a `benchmark`-kind warning when ≥1 comparison is far-below or far-above the range (listing the top 2 outlier metrics). Only the high-spend blocker gates `ready-to-spend`; low confidence and outliers surface as warnings but do not block. Benchmark blockers are excluded from `operationalBlockersCount` — they only gate the final ready-to-spend hop, mirroring the review / asset / economics / forecast / simulator pattern.

Manual / client-history overrides live in a versioned `bigad:benchmark-profiles:v1` localStorage namespace via `createBrowserBenchmarkStore()` (SSR-safe — empty list and no-op writes when `window` is undefined). A second `createMemoryBenchmarkStore()` adapter shares the same `BenchmarkStore` interface for tests. Manual profiles are surfaced ONLY in the `Benchmarks` tab UI — they are deliberately NOT threaded into `buildStrategy()` so engine purity is preserved (byte-identical output for identical input).

The export brief gains a `## Benchmarks / Calibration` section (status + confidence, selected planning benchmarks, metric comparison table, recommended assumption adjustments, warnings, planning-benchmark disclosure line) between the Scenario Simulator and Campaign Calendar sections. The dedicated `Benchmarks` tab (after Simulator at index 10, before Angles) renders the same data plus a manual benchmark form with a metric select, low / median / high numeric inputs, a source-label text field, and a "Save local override" button; saved overrides list inline with a delete button.

## Results / Forecast Accuracy Loop

CampaignOS adds a Results / Forecast Accuracy Loop that sits ABOVE the engine — `buildStrategy(input)` is byte-identical regardless of which campaign actuals have been logged. `analyzeCampaignResults({ strategy, actualResults })` is pure and deterministic: it reads the strategy's `creativeTestingMatrix.recommendedFirstBatch` and the base `forecast` scenario to build a per-cell forecast snapshot (equal-split across the first batch, mirroring the Forecast layer's allocation), compares the actuals against it across CPM / CTR / CPC / CVR / CPA / ROAS, emits per-cell decision recommendations (scale / iterate / pause / needs-more-data) using deterministic thresholds against the forecast and `forecast.budget.minimumLearningBudget`, classifies the overall accuracy (on-target / better-than-forecast / worse-than-forecast / mixed / insufficient-data) from the weighted totals, and surfaces import issues (`cell-id-not-in-strategy`, `inconsistent-totals`, `no-spend-no-data`, `missing-cell-id`, `duplicate-cell-id`, `invalid-number`) so the operator sees bad inputs before they trust the report. `derivedAt` is always 0 — no `Date.now()`, no `Math.random` — so the same actuals always yield byte-identical output. Decision thresholds: ROAS > forecast × 1.2 with ≥5 conversions AND spend above the per-cell learning gate (×0.4) → `scale` (must-do); ROAS between 0.7-1.2 × forecast → `iterate` (should-do); ROAS < forecast × 0.6 → `pause` (must-do); spend below the gate or missing ROAS signal → `needs-more-data` (should-do). Overall accuracy classifies to `insufficient-data` when total spend hasn't cleared the minimum learning budget × 0.4, `better-than-forecast` when the weighted ROAS exceeds forecast × 1.1, `worse-than-forecast` when below × 0.9, and `on-target` within ±10%. `parseCsvResults(csvText, projectId, runId)` ingests pasted CSV with a `cellId,spend,impressions,clicks,conversions,revenue,status,notes,daysRun` header (revenue / notes / daysRun optional), preserves quoted commas in notes, and emits the same `ResultImportIssue` shape so CSV-parse-time and analysis-time issues read identically.

State persists per browser under the versioned `bigad:campaign-actuals:v1` localStorage key via `createBrowserResultsStore()` (SSR-safe — empty list and no-op writes when `window` is undefined). A `createMemoryResultsStore()` adapter shares the same `ResultsStore` interface for tests and SSR fallbacks. Result ids are stable (`${projectId}:${runId}:${cellId}`) so upserting the same cell overwrites the previous row instead of duplicating. The store is the ONLY layer allowed to stamp `createdAt` / `updatedAt` from `Date.now()`; analysis never reads those fields. Journey-status integration is opt-in: when `campaignResults` is passed (`hasSavedRuns: boolean`, `hasResults: boolean`, optional `daysSinceFirstRun`), the journey block emits a `results`-kind warning when a run has been saved but no actuals have been logged — post-launch quality only, never blocks `ready-to-spend`. The export brief gains an optional `## Results / Forecast Accuracy` section (overall accuracy, total spend / conversions / revenue, weighted CPA + ROAS vs forecast, `### Latest results` table of the 10 most recent rows, `### Decision recommendations` list, `### Import issues` list, local-only disclosure) when the caller passes the campaignResults context and `report.perCell.length > 0`; absent or empty → byte-identical to the pre-results build. The dedicated `Results` tab (after `Benchmarks` at index 11) renders a header pill (overall accuracy + ready-to-decide count), a per-cell manual results form with inline save / clear, a CSV paste import panel that parses + previews + applies in one click, a forecast-vs-actual table with per-metric chips (`far-better` / `better` / `on-target` / `worse` / `far-worse`), decision recommendation cards, and a flagged import-issues list.

## Scenario Simulator / What-if Lab

CampaignOS adds a Scenario Simulator / What-if Lab layer that sits AFTER the Forecast / Budget Planner and stress-tests the base plan across deterministic what-if scenarios. `buildScenarioSimulatorPlan(strategy)` is pure — it reads `strategy.unitEconomics` + `strategy.forecast` + `strategy.offers` and emits a `ScenarioSimulatorPlan` whose `derivedAt` is always 0 (no `Date.now`, no `Math.random`). The plan always carries exactly 5 scenarios in stable order — `base`, `higher-cpm` (CPM × 1.30), `lower-cvr` (CVR × 0.70), then either `better-trial` (trial-to-paid × 1.40, capped at 65%) when the funnel is subscription+trial, or `better-cvr` (CVR × 1.30) when it isn't, followed by `higher-aov-annual` (AOV × 1.40 + churn × 0.85 + `annual-plan-discount` offer). Each scenario carries the resolved assumption set, an outcome block (impressions, clicks, conversions, trial starts + paid conversions when applicable, revenue, gross profit, CPA, paid CAC, ROAS, LTV, LTV:CAC ratio, payback months), a one-sentence risk note, and a viability tag: `unviable` when ROAS is below breakeven OR paid CAC exceeds LTV OR LTV:CAC < 1; `tight` when ROAS is below target OR LTV:CAC < 3 OR payback > 12 months; `viable` otherwise. The sensitivity engine runs every numeric lever (`price`, `currentAov`, `grossMargin`, `targetRoas`, `trialToPaidRate` when applicable, `monthlyChurnRate` when applicable, `cpm`, `ctr`, `cvr`, `totalBudget`, `durationDays`) at deterministic -20% / -10% / +10% / +20% steps plus a qualitative `offerKind` row covering three candidate offers (`free-trial-7d`, `free-trial-14d`, `annual-plan-discount`); each lever's sensitivityScore (0-100) is `max(|ΔCAC| / baseCAC, |ΔROAS| / baseROAS, |ΔPayback| / basePayback) × 100` rounded and clamped, with the result set sorted by score desc and lever name asc for stable ordering. Up to 5 deterministic recommendations land — raise price when price sensitivity > 30 AND LTV:CAC > 4, test 14-day trial when subscription + trial sensitivity > 25 AND trial-to-paid < 30%, refresh creative when CPM or CTR is the top lever, lock conservative budget when `lower-cvr` is unviable, offer an annual plan when subscription payback > 9 months — each ordered must-do → should-do → nice-to-have. Plan-level warnings cover `only-base-viable` (≥3 non-base scenarios tight or unviable while base is viable), `fragile-to-cvr-drop`, `fragile-to-cpm-rise`, `fragile-to-trial-drop`, `no-economics` / `no-forecast` (info), and `no-base-assumptions` (blocker, when neither economics nor forecast is present). Status classification mirrors the established pattern: `unviable` for any blocker OR base scenario unviable, `incomplete` when assumptions couldn't be derived, `tight` for base tight or ≥2 non-info warnings, `viable` otherwise. Journey-status integration is opt-in: when `simulator` is passed, the journey block emits a `simulator`-kind entry (warning for `tight`, blocker for `unviable`, plus an always-on warning chip for `only-base-viable`) and `ready-to-spend` requires `status !== 'unviable'` on top of every existing gate. Simulator blockers are excluded from `operationalBlockersCount` — they only gate the final ready-to-spend hop, mirroring the review/asset/economics/forecast pattern. The engine itself stays byte-identical: `buildStrategy(input)` adds a single deterministic optional field (`scenarioSimulator`) but `derivedAt` is always 0 and no `Date.now()` call is ever made. The export brief gains a `## Scenario Simulator / What-if Lab` section (status + base viability, base assumptions, scenario comparison table, top 5 sensitive levers, recommendations, warnings) between Forecast and Campaign Calendar. The dedicated `Simulator` tab (after Forecast at index 9) renders the same data with editable base assumptions — edits live in component state only and never mutate Strategy.

## Forecast / Budget Planner

CampaignOS adds a Forecast / Budget Planner that turns the engine's existing modules (`unitEconomics`, `kpiTargetLadder`, `creativeTestingMatrix`, `campaignSetup`, `trackingReadiness`) into a deterministic budget recommendation, a three-scenario forecast (conservative / base / aggressive), a spend allocation hierarchy (campaign / ad-set / test-cell), Day 1 / Day 3 / Day 5 / end-of-test decision checkpoints, and a status + confidence classification. `buildForecastPlan(strategy)` is pure — it reads only the deterministic outputs of upstream engine modules and emits a `ForecastPlan` whose `derivedAt` is always 0. Scenarios mutate the base assumptions deterministically: conservative is CTR × 0.7, CVR × 0.7, CPM × 1.2; aggressive is CTR × 1.3, CVR × 1.3, CPM × 0.85; base sits at × 1.0. CPM, CTR, CVR baselines are pulled from the KPI ladder's starter tier when present, else business-model defaults (subscription / freemium → $20 CPM, ecommerce / one-time → $15, services → $25, lead-gen → $12; cold-CTR default 1.2%, retargeting default 2.5%; CVR default per business model). AOV / revenue is pulled from `economics.resolvedAov` → `subscription.trialAdjustedLtv` → `expectedLtv`. The budget block computes `minimumLearningBudget = max(expectedCpa × 5 conv/cell × cellCount, cellCount × $15/day × 3 days)`, `recommendedDailyBudget = cellCount × clamp(expectedCpa × 1.5, $10/day, $30/day)`, `recommendedTestDurationDays = clamp(max(3, smallest cell estimatedRunDays, ceil(minLearning / dailyBudget)), 3, 14)`, `totalTestBudget = dailyBudget × durationDays`. When economics is missing OR no test cells exist, the planner falls back to $50/day × 7 days × $500 floor and emits the corresponding warning. Allocation rows split campaigns and ad-sets by their `budgetSplit` percent when `campaignSetup` is present, then split the total budget across every cell in `recommendedFirstBatch` equally for one-variable-at-a-time discipline — the sum of test-cell rows always equals `totalTestBudget` within ±$0.01 rounding tolerance. Decision checkpoints emit Day 1 (hook attention: kill below CTR × 0.4, iterate 0.4-0.7, scale above × 1.3), Day 3 (conversion signal: same pattern at CVR), Day 5 (ROAS check against `targetRoas`), and an end-of-test decision (promote / iterate / pause). Warnings cover `budget-below-learning-minimum` (blocker), `expected-cpa-above-allowable-cac` (blocker), `conservative-roas-below-target` (warning), `conservative-roas-below-breakeven` (blocker — worst case can't break even), `tracking-not-ready` (warning when tracking < 70), `no-test-cells` / `no-economics` / `no-kpi-targets` (input completeness), and `low-confidence-no-history` (info, always emitted until workspace memory results land). Confidence is `high` when economics + KPI targets + tracking >= 70 + 3+ test cells AND zero blockers; `medium` when at least 2 of those hold with no blocker; `low` otherwise. Status is `unviable` for any blocker, `incomplete` when both economics and test cells are missing, `tight` for 2+ non-info warnings or low confidence, `viable` otherwise. Journey-status integration is opt-in: when `forecast` is passed, the journey block emits a `forecast`-kind entry (warning for `tight`, blocker for `unviable`) and `ready-to-spend` requires `status !== 'unviable'` on top of every existing gate. The engine itself stays byte-identical: `buildStrategy(input)` adds a single deterministic optional field (`forecast`) but `derivedAt` is always 0 and no `Date.now()` call is ever made. The export brief gains a `## Forecast / Budget Planner` section (status + confidence, budget summary, scenario table, spend allocation list, decision checkpoints, warnings, recommended operator action) between Unit Economics and Campaign Calendar.

## Asset Production Manager

CampaignOS adds an Asset Production Manager that sits ABOVE the engine — `buildStrategy(input)` is byte-identical regardless of which assets are in flight. `buildAssetProductionPlan({ runId, strategy, proofAssetPlan?, creativeTestingMatrix?, selectedPlaybook?, reviewSummary?, existingAssetState?, nowOffsetDays? })` is pure and deterministic: it walks the proof-asset plan, creator briefs, static briefs, video scripts (each script also pairs a production asset with a script → production dependency), first-batch and queued test cells, the campaign setup's ad slots, and a single client-report asset, and emits a `ProductionAsset[]` whose ids follow `<sourceKind>:<sourceRefId>:<format>` so two calls with identical input return byte-identical assets and existing per-asset state (status, file link, notes, quality-check `done` flags) can be merged in by id. Each asset carries a priority (must-have / should-have / nice-to-have), an owner role (creator / designer / copywriter / client / owner / producer / editor / media-buyer), a deterministic `dueWindow` (per-priority slices of the selected playbook's `estimatedTimelineDays.min`, offset by `nowOffsetDays`), linked test-cell ids, linked proof-asset ids, dependencies (test cells link to their `proofAssetRequired`), `whereUsed` placements (test-cell / campaign-ad / landing-page / report / proof-block), and a quality-check matrix — universal checks (`format-matches-placement`, `file-link-present`, `brand-present`, `no-unsupported-claim`), video-only (`captions-included`, `export-size-noted`, `aspect-ratio-noted`), static-only (`export-size-noted`, `aspect-ratio-noted`), cold-acquisition-only (`proof-visible`, `cta-visible`), and quote / case-study (`proof-visible`). Derived selectors are pure: `readinessScore` adds per-asset status points (0–10) plus 0.5 per done required check, divided by `(mustHave + shouldHave) × 10 + Σ requiredChecks × 0.5`, clamped to 0-100; `missingBlockers` enumerates every pending must-have, every shipped asset with an undone required check, and every test-cell asset whose proof-asset dependency isn't approved/shipped; `summarizeAssetProductionPlan(plan)` returns the must-have totals + pending ids + shipped count + readiness score. Journey-status integration is opt-in: when `assetSummary` is passed, the journey block emits an `asset`-kind warning (escalating to `blocker` when `readinessScore < 30`) for pending must-haves, and `ready-to-spend` requires `readinessScore >= 70` with no pending must-haves on top of every existing gate. State persists per browser under the versioned keys `bigad:assets:v1` (assets keyed by runId) and `bigad:asset-files:v1` (file-link metadata); SSR-safe browser and memory store adapters share the same `AssetStore` interface. The export brief gains an optional `## Asset Production Plan` section (readiness score, must-have list, should-have / nice-to-have list, owner workload, quality-check progress, missing blockers) when the caller passes the asset-production context and the plan has assets; absent or empty → byte-identical to the pre-asset build. The dedicated `Assets` tab in the workspace surfaces six sections — production queue with inline status switcher / owner picker / file-link input / quality-check toggles, missing blockers banner, by-owner workload grid, by-status kanban (7 columns), per-asset quality checklist, and a where-used grouped view.

## First-Run Onboarding & Demo Projects

CampaignOS adds a first-run onboarding surface plus three fully-populated demo projects that get a new operator from cold start to a complete run in under five minutes. The Welcome panel renders ABOVE the input panel when zero projects exist and the user has not dismissed it; once any project exists, a compact strip carrying a `NextBestActionCard` and a `ProgressChecklistCard` lives at the top of the Workspace tab. There is **no new top-level tab** — onboarding sits inside the existing workspace.

The layer is built from four pieces:

- A frozen catalog of **seven goals** — `launch-app` → `mobile-app-launch`, `launch-saas-trial` → `saas-free-trial-launch`, `launch-ecom-promo` → `ecommerce-seasonal-promo`, `always-on-leadgen` → `local-service-leadgen`, `fix-tracking-or-proof` → `landing-cro-sprint`, `agency-deliverable` → `agency-strategy-sprint`, `just-exploring` → `agency-strategy-sprint`. Each goal carries a 3-6 word label, a one-sentence description, a recommended playbook id, and 3-5 primary CampaignOS section ids the operator should focus on first.
- A frozen catalog of **seven canonical steps** in order — `pick-goal` → `create-or-load-project` → `review-strategy` → `capture-proof-or-confirm` → `approve-critical-items` → `plan-first-test-batch` → `export-or-handoff`. Each step carries a label, a description, an optional `linkTo` for the CTA, and an estimated time in minutes (1-3 typical).
- A **pure deterministic recommender** `recommendGoalPlaybook(goalId, input?)` that returns the goal's recommended playbook by default but applies a small set of input-aware overrides (e.g. `just-exploring` + a subscription-app input flips to `mobile-app-launch`). `buildProgressChecklist(ctx)` and `getNextBestAction(ctx)` are pure functions of the workspace context — same context in, byte-identical output. Neither calls `Date.now()`.
- A **demo project registry** of three fully-shaped projects — `astro-dating-launch` (mobile-app-launch playbook, skeptical-market dating app), `saas-free-trial-launch` (saas-free-trial-launch playbook, B2B SaaS for creative agencies), `ecom-seasonal-promo` (ecommerce-seasonal-promo playbook, mature-market skincare fall promo). Each demo carries a complete `ProductInput`, 4-8 sample test results bound to real cell ids, 6-10 sample review statuses covering every critical kind, and 2-5 short learning notes. `buildDemoLoadPlan(demo, opts)` is a pure function: given the same `projectId`, `runId`, and `nowMs`, the plan is byte-identical and contains zero orphan cell references (every `testResult.cellId` matches a cell on the run's `creativeTestingMatrix`).

State persists per-browser under two new versioned keys — `bigad:onboarding:v1` (goal + completed step ids + dismissed flag) and `bigad:demo-loaded:v1` (which demos have been loaded). The export brief gains an optional one-line **Onboarding goal** sentence at the top of the `## Campaign Log` section when a goal is set; absent → byte-identical. The engine itself is unchanged — `buildStrategy(input)` produces the same output regardless of which goal the user has picked or which demo they have loaded.

## Review & Approval Layer

CampaignOS adds a Review & Approval Layer that sits above `buildStrategy()` — the engine itself stays pure. Each saved run gets a `ReviewBoard` of ten reviewable items: six **critical** items that block approval (positioning, offer, proof assets, first test batch, campaign setup, client report) and four **non-critical** reviewable items (tracking readiness, creative QA, launch readiness, next iteration plan). Item titles and summaries are derived from the run's strategy at seed time and persisted under versioned localStorage keys (`bigad:review-items:v1`, `bigad:review-comments:v1`); nothing leaves your browser. `summarizeReviewBoard(board)` is pure and deterministic — given the same item statuses and comment timestamps, the output is byte-identical. The approval score (0-100) starts at zero, adds 12 per approved critical and 5 per approved non-critical, subtracts 10 per blocked critical and 5 per critical needing changes, subtracts 2 per unresolved comment (cap 20), and adds an 8-point clean-board bonus when every critical is approved and no comments are open. Readiness is `ready` when every critical is approved with zero unresolved comments and zero blocked items; `not-ready` when any critical is still pending or blocked; `partial` otherwise. When a `reviewSummary` is passed to `buildJourneyStatus()`, the journey-status block raises a `review`-kind entry whenever readiness is not `ready` — severity escalates to `blocker` when any critical is blocked or pending, and `ready-to-spend` requires `approvalReadiness === "ready"` on top of every existing gate. The export brief gains an optional `## Approval Pack` section when the caller passes a non-empty board; without it, the brief is byte-identical to the pre-review build. The dedicated `Review` tab in the workspace surfaces a `ClientHandoffPanel` (items assigned to the client + open client comments), an approval-score header, and a per-author filter chip strip; per-item cards expose the status switcher, the assigned-to selector, an inline comments thread with resolve/delete, and a quick-approve-as-author shortcut.

## Running it

```bash
cd BigAd
npm install
npm run dev
# open http://localhost:3100
```

## Other scripts

```bash
npm run build       # production Next.js build
npm run typecheck   # tsc --noEmit
npm run test:logic  # zero-framework engine correctness check
```

The strategy engine is **fully deterministic** — no API calls, no LLM, no external data fetching. Identical inputs always produce an identical strategy, including offer rankings and the campaign calendar. The `test:logic` script verifies that property explicitly alongside its other assertions.

The `test:logic` script feeds three materially different inputs (AstroDating, a writing tool, and a single-origin coffee club) through the engine and asserts that the three strategies are not identical at the level of headlines, angles, positioning, and landing hero — and that each strategy actually mentions the specific things that make it that product. It also covers the V2 quality engine: scoring, offer diagnosis, angle ranking, awareness-stage variants, generic-copy detection, and the markdown export brief — plus the stakeholder-flow ordering of the export, the StrategyView tab labels (unique, no legacy duplicates), and one-to-one coverage between every `Strategy` field and an export-brief section header.

## How the score works

`scoreStrategy(input)` returns a weighted overall (0-100) plus five dimensions:

| Dimension          | Weight | What it measures                                                                                                  |
| ------------------ | ------ | ----------------------------------------------------------------------------------------------------------------- |
| Clarity            | 25%    | Can a reader grasp what this is and who it's for from the inputs in one read?                                     |
| Differentiation    | 25%    | Is the differentiator a concrete mechanism or just adjectives ("better", "faster")?                                |
| Specificity        | 20%    | Is the audience and pain narrow enough that the copy can't apply to every competitor in the category?              |
| Proof strength     | 15%    | How exposed is the strategy to a sophisticated / skeptical market without naming a proof asset?                    |
| Channel fit        | 15%    | Does the category × audience map onto at least one strong paid channel?                                            |

The score is computed from the *inputs you wrote*, not from the auto-generated copy. Tighten the inputs and the score moves immediately. Each dimension carries a one-line explanation and a one-line suggestion that references your category, audience, pain, and differentiator — never boilerplate.

The pill in the header turns green at 75+, amber at 55-74, and red below 55, so a quick glance tells you whether the inputs are doing their job before you copy any output.

## Copy normalization layer

`deriveCopyLabels(input, offers)` runs once at the top of `buildStrategy()` and produces a small set of short noun-phrase labels — `audienceLabel`, `painLabel`, `mechanismLabel`, `outcomeLabel`, `categoryLabel`, `competitorLabel`, `offerLabel` — that every customer-facing builder downstream (headlines, hooks, briefs, scripts, static briefs, CTAs, store copy, landing copy, ad concepts, variants) uses instead of raw `input.audience` / `input.audiencePain` / `input.differentiator` / `input.goal` interpolations. The labels keep generated copy short and on-voice: no "dating app app", no full audience sentences leaking into a single hook, no ellipsis-truncated phrases, and no offers that don't fit the business model. A companion `checkCopyIssues(strategy, input)` validator surfaces residual problems on `Strategy.copyIssues`, and the export brief renders a `## Copy Quality Flags` section.

## Anti-generic guard

`detectGenericCopy(strategy, input)` scans every customer-facing string in the generated strategy (headlines, angle hooks, landing copy, store copy, ad copy, TikTok scripts) for a fixed list of banned phrases. Each hit produces a flag with:

- The field where the phrase was found (`headline[3]`, `landing.hero`, etc.)
- The banned phrase that matched
- The full offending sentence
- A concrete rewrite seeded from the product's actual category, audience, pain, and differentiator

The deterministic engine is written to avoid these phrases — so a clean run on the AstroDating example returns zero flags. The guard is there as a tripwire for future contributions and for the LLM hook described below.

## Architecture

```
BigAd/
├── src/
│   ├── app/                Next.js App Router pages
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── page.tsx        Workspace UI (split panel: inputs / strategy)
│   ├── components/
│   │   ├── InputPanel.tsx       Left rail — Product / Audience / Market / Competitors / Goal
│   │   ├── StrategyView.tsx     Right pane — Journey Status banner + tabbed strategy output. Tabs follow the stakeholder reading flow: Score → Positioning → Awareness → Audience avatars → Diagnosis → Offer architecture → Calendar → Angles → Concepts (concept cards + hook library + hook critic + variant spinner + CTA bank + static briefs + TikTok / Meta scripts) → Briefs (+ QA + applied review + editor handoff) → Shots → Launch readiness → Execution → Assets → Proof → Landing → App store → Experiments → Export brief → Workspace → Review → Agency → Playbooks → Report.
│   │   ├── ReviewPanel.tsx      `useReviewBoard()` hook + `ReviewBoardTab` + `ClientHandoffPanel` — Review & Approval Layer UI
│   │   ├── AgencyPanel.tsx      `useAgencySelection()` hook + `AgencyTab` — Agency Packaging Layer UI
│   │   ├── PlaybookPanel.tsx    `usePlaybookSelection()` hook + `PlaybookTab` + `deriveChecklist()` — Playbook Library UI
│   │   ├── AssetPanel.tsx       `useAssetProduction()` hook + `AssetTab` — Asset Production Manager UI
│   │   ├── EconomicsPanel.tsx   `useUnitEconomics()` hook + `EconomicsTab` — Unit Economics / Offer Lab UI
│   │   ├── ForecastPanel.tsx    `ForecastTab` — Forecast / Budget Planner UI (status + confidence pills, 6 summary cards, 3-scenario table, allocation hierarchy, decision checkpoint cards, warnings, operator action)
│   │   ├── SimulatorPanel.tsx   `SimulatorTab` — Scenario Simulator / What-if Lab UI (status + base viability pills, editable base assumptions in local state, 5-scenario comparison table, sensitivity table sorted by score, recommendation cards, warnings)
│   │   ├── BenchmarkPanel.tsx   `BenchmarkTab` + `useBenchmarkProfiles()` — Benchmarks / Calibration Layer UI (status + confidence pills, selected profile cards, metric comparison table, recommended assumption adjustments, warnings, manual override form with local-only persistence)
│   │   ├── ResultsPanel.tsx     `ResultsTab` + `useCampaignResults()` — Results / Forecast Accuracy Loop UI (overall accuracy pill, per-cell manual results form, CSV paste import, forecast-vs-actual table with per-metric chips, decision recommendation cards, import-issue list)
│   │   ├── OnboardingWelcomePanel.tsx  `useOnboarding()` hook + `OnboardingWelcomePanel` + `OnboardingGoalPill` — first-run onboarding UI
│   │   ├── NextBestActionCard.tsx      Compact card surfacing `getNextBestAction()` — used in the Workspace tab strip
│   │   ├── ProgressChecklistCard.tsx   7-row onboarding-progress card surfacing `buildProgressChecklist()`
│   │   └── CopyableCard.tsx     Reusable card with a small copy button
│   ├── lib/
│   │   ├── engine/              Deterministic strategy engine (no API)
│   │   │   ├── index.ts                Entry point: `buildStrategy(input)`
│   │   │   ├── awareness.ts            analyzeAwareness()
│   │   │   ├── sophistication.ts       analyzeSophistication()
│   │   │   ├── positioning.ts          generatePositioning() + promise + mechanism
│   │   │   ├── angles.ts               generateAngles() + rankAngles() + scoreAngle()
│   │   │   ├── headlines.ts            generateHeadlines()
│   │   │   ├── landing.ts              generateLandingCopy()
│   │   │   ├── store.ts                generateStoreCopy()
│   │   │   ├── shorts.ts               generateTiktokScripts() + generateFacebookAds()
│   │   │   ├── experiments.ts          generateExperiments()
│   │   │   ├── score.ts                scoreStrategy() — 5-dimension quality score
│   │   │   ├── diagnosis.ts            diagnoseOffer() — strongest / weakest / missing / objection / asset
│   │   │   ├── awareness-variants.ts   generateAwarenessVariants() — 5 stages × 3 outputs
│   │   │   ├── generic-guard.ts        detectGenericCopy() + BANNED_PHRASES
│   │   │   ├── breakeven.ts            computeBreakevenROAS() — pure unit-economics math
│   │   │   ├── offers.ts               recommendOffers() — Offer Architect
│   │   │   ├── calendar.ts             buildCalendar() — Campaign Calendar
│   │   │   ├── calendar-dips.ts        forecastDips() — per-window DipForecast list
│   │   │   ├── promo-tiers.ts          recommendArchitecture() + buildRetrospectiveGate()
│   │   │   ├── briefs.ts               generateCreatorBriefs() — Creator Brief Generator
│   │   │   ├── shotlist.ts             generateShotLists() — Shot List Generator
│   │   │   ├── hook-critic.ts          critiqueHook() — on-demand hook critic
│   │   │   ├── scripts-line.ts         generateVideoScripts() — line-level scripts per brief
│   │   │   ├── variants.ts             generateVariantSets() / spinAdVariants() — one-axis-swap variants
│   │   │   ├── tracking-readiness.ts   assessTrackingReadiness() — 10-check pre-flight score
│   │   │   ├── kpi-ladder.ts           buildKpiLadder() — 8 × 3 KPI targets
│   │   │   ├── kpi-diagnosis.ts        diagnoseKpi() — decision-tree diagnosis
│   │   │   ├── ad-review.ts            buildAdReviewChecklist() — 15-axis pre-handoff list
│   │   │   ├── journey-status.ts       buildJourneyStatus() — 6-stage journey synthesis
│   │   │   ├── cta-bank.ts             buildCtaBank() — 5 styles × 5 surfaces CTA bank
│   │   │   ├── static-brief.ts         buildStaticAdBriefs() — first-frame designer briefs
│   │   │   ├── creative-qa.ts          runCreativeQA() — 12-rule creative checklist
│   │   │   ├── editor-handoff.ts       buildEditorHandoffs() — markdown handoff per brief
│   │   │   ├── audience-avatar.ts      buildAudienceAvatars() — 2-3 typed audience personas
│   │   │   ├── hook-library.ts         buildHookLibrary() — 8 patterns × 2-3 hooks
│   │   │   ├── ad-concept-cards.ts     buildAdConceptCards() — 3-6 (avatar × pattern × offer) cards
│   │   │   ├── copy-normalize.ts       deriveCopyLabels() + checkCopyIssues() — short noun-phrase labels and anti-bad-copy validator
│   │   │   ├── testing-matrix.ts       buildCreativeTestingMatrix() — Execution OS: 3-12 test cells with kill / scale rules
│   │   │   ├── campaign-setup.ts       buildCampaignSetup() — Execution OS: campaign / ad-set / exclusions / UTM / pre-launch checklist
│   │   │   ├── iteration-planner.ts    buildNextIterationPlan() — Execution OS: one recommendation per weak-signal
│   │   │   └── export-brief.ts         generateExportBrief() — markdown bundle
│   │   ├── review/             Review & Approval Layer (above the engine)
│   │   │   ├── review-board.ts         initialItemsForRun() / summarizeReviewBoard() / unresolvedCommentCountByItem() / criticalBlockingMessages() — pure deterministic derivation
│   │   │   └── review-store.ts         createBrowserReviewStore() / createMemoryReviewStore() — versioned localStorage persistence
│   │   ├── agency/             Agency Packaging Layer (above the engine)
│   │   │   ├── catalog.ts              PROJECT_TEMPLATES / ROLE_PRESETS / PACKAGE_PRESETS — frozen registries (5 templates, 5 roles, 4 packages)
│   │   │   ├── delivery-summary.ts     buildDeliverySummary() — pure deterministic six-field summary, derivedAt never reads Date.now()
│   │   │   └── agency-store.ts         createBrowserAgencyStore() / createMemoryAgencyStore() — versioned localStorage persistence
│   │   ├── playbook/           Playbook Library (above the engine)
│   │   │   ├── catalog.ts              PLAYBOOKS — 10 frozen playbooks (launch / always-on / seasonal / leadgen / rescue / cro / service)
│   │   │   ├── recommend.ts            recommendPlaybooks() — pure deterministic fit-score recommender, derivedAt never reads Date.now()
│   │   │   └── playbook-store.ts       createBrowserPlaybookStore() / createMemoryPlaybookStore() — versioned localStorage persistence under bigad:applied-playbook:v1
│   │   ├── assets/             Asset Production Manager (above the engine)
│   │   │   ├── asset-production.ts     buildAssetProductionPlan() / summarizeAssetProductionPlan() / criticalBlockingAssetMessages() — pure deterministic derivation, derivedAt never reads Date.now()
│   │   │   └── asset-store.ts          createBrowserAssetStore() / createMemoryAssetStore() — versioned localStorage persistence under bigad:assets:v1
│   │   ├── economics/          Unit Economics / Offer Lab (threaded into the engine)
│   │   │   └── unit-economics.ts       buildUnitEconomics() / buildOfferScenarioResults() / calculateSubscriptionLtv() / calculateAllowableCac() / classifyEconomicsReadiness() — pure deterministic derivation, derivedAt is always 0
│   │   ├── forecast/           Forecast / Budget Planner (threaded into the engine)
│   │   │   └── budget-forecast.ts      buildForecastPlan() / buildForecastScenarios() / allocateBudgetAcrossTestCells() / buildDecisionCheckpoints() / classifyForecastReadiness() — pure deterministic derivation, derivedAt is always 0
│   │   ├── simulator/          Scenario Simulator / What-if Lab (threaded into the engine)
│   │   │   └── scenario-simulator.ts   buildScenarioSimulatorPlan() / buildDefaultAssumptionSet() / simulateScenario() / buildSensitivityResults() / buildSimulatorRecommendations() — pure deterministic derivation, derivedAt is always 0
│   │   ├── benchmarks/         Benchmarks / Calibration Layer (threaded into the engine; manual profiles UI-only)
│   │   │   ├── catalog.ts              BUILT_IN_BENCHMARK_PROFILES (10 frozen planning-benchmark profiles) + getBenchmarkProfile() / listBenchmarkProfiles(). Every caveat opens with "Planning benchmark, not real-time data."
│   │   │   ├── calibration.ts          buildBenchmarkCalibration() / selectBenchmarkProfiles() / buildBenchmarkWarnings() / calibrateForecastAssumptions() — pure deterministic derivation, derivedAt is always 0
│   │   │   └── benchmark-store.ts      createBrowserBenchmarkStore() / createMemoryBenchmarkStore() — versioned localStorage persistence under bigad:benchmark-profiles:v1 (UI-only — never re-enters the engine)
│   │   ├── results/            Results / Forecast Accuracy Loop (above the engine)
│   │   │   ├── results-analysis.ts     analyzeCampaignResults() / compareActualsToForecast() / buildResultDecisionRecommendations() / parseCsvResults() — pure deterministic derivation, derivedAt is always 0
│   │   │   └── results-store.ts        createBrowserResultsStore() / createMemoryResultsStore() — versioned localStorage persistence under bigad:campaign-actuals:v1 (the only layer allowed to stamp createdAt / updatedAt)
│   │   ├── onboarding/         First-run onboarding & demo projects (above the engine)
│   │   │   ├── onboarding.ts           getOnboardingGoals() / getOnboardingSteps() / recommendGoalPlaybook() / buildProgressChecklist() / getNextBestAction() — pure deterministic derivation, never reads Date.now()
│   │   │   ├── demo-projects.ts        DEMO_PROJECTS (3 demos) + buildDemoLoadPlan() — pure loader, deterministic for same projectId / runId / nowMs
│   │   │   └── onboarding-store.ts     createBrowserOnboardingStore() / createMemoryOnboardingStore() — versioned localStorage persistence under bigad:onboarding:v1 + bigad:demo-loaded:v1
│   │   ├── example.ts          Three demo payloads — AstroDating (freemium launch), Plotline (subscription always-on), HeirloomBrew (one-time seasonal) — used by the "Load example" button and by `test:logic` to prove materially different inputs produce materially different outputs.
│   │   └── llm.ts              Adapter interface for plugging an LLM later
│   └── types/
│       ├── strategy.ts         Shared TypeScript types
│       ├── workspace.ts        Project / run / test-result / learning types
│       ├── review.ts           Review & Approval Layer types — ReviewItem / ReviewComment / ReviewBoardSummary
│       ├── agency.ts           Agency Packaging Layer types — ProjectTemplate / RolePreset / PackagePreset / DeliverySummary / AgencySelection
│       ├── playbook.ts         Playbook Library types — Playbook / PlaybookFitScore / PlaybookRecommendation / AppliedPlaybook
│       ├── onboarding.ts       Onboarding & Demo Projects types — OnboardingGoal / OnboardingStep / OnboardingState / DemoProject / NextBestAction / ProgressChecklistItem
│       ├── assets.ts           Asset Production Manager types — ProductionAsset / AssetProductionPlan / AssetProductionSummary / AssetQualityCheck / AssetStatus / AssetFormat / AssetOwnerRole
│       ├── economics.ts        Unit Economics / Offer Lab types — UnitEconomicsSummary / UnitEconomicsInput / SubscriptionEconomics / OfferScenarioResult / EconomicsWarning / EconomicsReadinessStatus
│       ├── forecast.ts         Forecast / Budget Planner types — ForecastPlan / ForecastScenario / ForecastOutcome / BudgetRecommendation / SpendAllocation / DecisionCheckpoint / ForecastWarning / ForecastReadinessStatus
│       ├── simulator.ts        Scenario Simulator / What-if Lab types — ScenarioSimulatorPlan / SimulatorAssumptionSet / SimulatorScenarioResult / SimulatorOutcome / SimulatorSensitivityResult / SimulatorRecommendation / SimulatorWarning / SimulatorViability / SimulatorLever
│       ├── benchmarks.ts       Benchmarks / Calibration Layer types — BenchmarkCalibration / BenchmarkProfile / BenchmarkProfileFit / BenchmarkComparison / BenchmarkRecommendation / BenchmarkWarning / BenchmarkMetric / BenchmarkRange / BenchmarkReadinessStatus / BenchmarkSourceKind / BenchmarkChannel / BenchmarkFitRule
│       └── results.ts          Results / Forecast Accuracy Loop types — CampaignActualResult / ResultStatus / ForecastAccuracyReport / ActualVsForecastMetric / ResultDecisionRecommendation / ResultImportIssue / ResultImportIssueKind
├── scripts/
│   └── test-logic.ts           `npm run test:logic` — 1724 checks
├── public/
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

There is no backend. State lives in React; nothing is persisted between sessions.

## How it works (engine model)

CampaignOS treats every strategy as a function of seven user-provided variables:

1. Product name, category, description, price, business model
2. Audience and their core frustration
3. Competitors and your real differentiator
4. The outcome you are optimizing for
5. The market's awareness level
6. The market's sophistication level
7. (Optional, future) LLM section overrides

The engine then runs deterministic templates that interpolate those values into copy patterns drawn from general direct-response principles: awareness, sophistication, central promise, unique mechanism, objections, message-market fit, channel fit. Each section is its own pure function. None of them call an external service.

## Local engine limits

The deterministic engine is reliable, fast, and free — but it has real limits you should know about before treating its output as finished work:

- **It cannot rewrite your inputs.** If your differentiator is a string of adjectives ("better, faster, easier"), the output will too be a string of adjectives. The score and diagnosis tabs will tell you so, but the engine cannot invent a mechanism that isn't there.
- **It uses templates, not models.** Two products in the same category with similar inputs will share the *shape* of their copy. The interpolated variables make them non-identical, but a model-generated alternative would have more rhetorical variety.
- **No real-world data.** The engine doesn't know your competitor's headlines, your industry's current ad CPMs, or which TikTok format is converting this month. Treat the channel-fit dimension as a starting heuristic, not a media plan.
- **No keyword research.** The App Store keyword list is derived from the input, not from search-volume APIs.
- **No persistence.** Refresh and your inputs go away. One workspace per browser tab.
- **No platform character-limit enforcement.** The App Store listing draft does not auto-truncate per field — treat it as a starting point.

## Plugging in an LLM later

`src/lib/llm.ts` defines an `LLMAdapter` interface:

```ts
interface LLMAdapter {
  id: string;
  generateSection<K extends StrategySection>(
    input: ProductInput,
    section: K
  ): Promise<Strategy[K] | null>;
}
```

To upgrade CampaignOS from deterministic templates to LLM-generated sections:

1. Create `src/lib/llm-openai.ts` (or `llm-anthropic.ts`) that implements `LLMAdapter`.
2. In `buildStrategy`, after computing the local fallback for a section, race it against `getLLM().generateSection(input, section)` and prefer the LLM result when non-null and well-shaped.
3. Pipe the LLM output through `detectGenericCopy` before showing it. The guard is a free, deterministic filter that catches the most common ways LLMs default to bland marketing language.
4. Keep returning the deterministic output when the LLM is unavailable, errors out, or returns malformed JSON. The local engine is the safety net, not the warm-up act.

The point of the section-level adapter is that you can ship LLM-generated headlines while still using the local engine for, say, App Store keywords — which are easier to get right with rules than with a model.

## Copyright and source attribution

CampaignOS is an **original** marketing-strategy agent. It is **inspired by general direct-response principles** — concepts that are common across the discipline, such as:

- audience awareness level
- market sophistication
- central promise
- unique mechanism
- objections and message–market fit
- channel × audience fit

It does **not** copy or paraphrase any specific book, course, or framework. No prose from any proprietary source appears in this repository, in the UI, or in the generated outputs. If you fork CampaignOS, please preserve this guarantee: contribute concept-level guidance phrased in your own words, never quoted passages from third-party materials.

## Roadmap — SaaS direction

The current build is a single-browser-tab workspace. The direction beyond that:

- **Saved projects.** Persist inputs and generated strategies in an account so you can come back to a brief, compare two positions, and version your copy over time.
- **Competitor scraping.** Pull live ad creative and store listings from named competitors and let the engine compare your differentiator against what they actually say, not just against what you typed in.
- **LLM-backed generation.** Section-level adapters that swap any deterministic section for a model-generated one (BYO key or managed), with the generic-copy guard always running on top.
- **PDF / slide export.** Beyond the markdown brief, a designed PDF and a 5-slide pitch-deck export keyed off the same strategy.
- **Team accounts.** Workspaces, shared brand voice files, comments on individual cards.
- **Template marketplace.** Curated input templates for common product types (B2C app, B2B SaaS, marketplace, info product) so a new user can prefill the workspace in two clicks.
- **Strategy diff view.** Compare two positions side by side — same product, two audiences; or same audience, two differentiators.

None of the above is implemented in this build. The point of the roadmap is to be honest about where the product can go without inventing capabilities it doesn't yet have.

## License

Source for CampaignOS lives inside the parent monorepo's history (under `BigAd/`). Treat the code as private to this repository unless the repository's top-level license says otherwise.
