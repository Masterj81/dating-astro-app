# BigAd

BigAd is a marketing-strategy workspace for founders, solopreneurs, and marketers. Describe a product on the left; get a complete, copyable marketing strategy on the right — quality score, positioning, awareness analysis, offer diagnosis, ranked ad angles, landing copy, app store listing, a starter A/B testing plan, and a one-press markdown export.

The first screen is the workspace itself, not a marketing landing page.

## What BigAd does

For any product you describe, BigAd produces:

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
- A phased **campaign calendar** with named windows (lead-in / warm-up / ramp / peak / echo / tail, or evergreen test/scale cycles for always-on), each carrying a KPI to watch, a readiness gate that must pass before it opens, a recommended offer kind, and a flag for forecast soft windows
- A set of **creator briefs** — one per top-ranked angle, each with a framing rule, alternate hook openers, a four-section spine (hook / problem / solution-or-proof / CTA), and a campaign-type-aware deliverable list
- A **shot list** per brief — 4 to 8 numbered shots covering every beat, with shot kind, framing, camera angle, duration envelope, props, and sound direction, with the midpoint duration tracking the brief's envelope
- A one-press **export brief** — a clean markdown document that bundles every section above, ready to paste into Notion, Linear, or any doc

Every output is built from the inputs you provide — name, category, audience, pain, differentiator, goal, awareness, sophistication, optional commercial inputs (COGS %, target margin %, current AOV, target ROAS), and a campaign type (launch / seasonal / always-on) — so the same prompt never produces identical copy across two different products.

## Offer Architect

The Offer Architect ranks the seven canonical offer levers — discount, bundle, guarantee, free shipping, free gift, payment plan, free trial — against your business model and price tier. Subscription / freemium products lead with trial and guarantee; high-ticket leads with guarantee and payment plan; one-time leads with bundle and discount. Stickiness risk flags how strongly a given offer trains the audience to wait for the next one. When you fill in COGS % and target margin %, each recommendation also shows the breakeven ROAS at the offer's assumed give-away, so you can re-baseline before launching.

## Campaign Calendar

The Campaign Calendar turns the strategy from a snapshot into a phased plan. Pick a campaign type — launch, seasonal, or always-on — and the engine emits 6–7 windows on a timeline relative to an anchor day. Each window names the KPI to watch, the readiness gate that must pass before it opens, the offer kind that fits, and whether a soft window is forecast inside it (e.g. ramp dips and post-peak hangovers). The shape generalises to non-retail products; the window names stay neutral.

## Creator Briefs

The Creator Brief Generator turns the top-ranked angles into one-page production briefs a creator can shoot from. Each brief consumes the angle name, the input's business model, awareness, price tier, and campaign type, plus the top offer recommendation. It emits a four-section spine (hook → problem → solution / proof → CTA) with a beat, on-camera direction, visual cues, and an anti-pattern list per section. Two to three alternate hook openers are filmed back-to-back so the editor can A/B the opening cut without re-shooting the body. The deliverables list (aspect ratios, durations, source-file expectations) varies with campaign type so the creator is paid against the right cut-down set.

## Shot Lists

The Shot List Generator mirrors each brief 1:1 with a numbered shooting plan. Each list carries four to eight shots covering all four brief beats, with shot kind (talking head / product shot / B-roll / screenshot / UGC selfie / lifestyle), framing note, camera angle, duration envelope, props, and sound direction. The sum of shot-duration midpoints stays within ±2 seconds of the brief's total duration so the cut lands in the right envelope. Output is fully deterministic — same inputs always produce the same list, in the same order.

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

The `test:logic` script feeds two materially different inputs (AstroDating + a writing tool) through the engine and asserts that the two strategies are not identical at the level of headlines, angles, positioning, and landing hero — and that each strategy actually mentions the specific things that make it that product. It also covers the V2 quality engine: scoring, offer diagnosis, angle ranking, awareness-stage variants, generic-copy detection, and the markdown export brief.

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
│   │   ├── StrategyView.tsx     Right pane — tabbed strategy output (Score / Positioning / Awareness / Diagnosis / Offer / Ads / Landing / App Store / Experiments / Offers / Calendar / Briefs / Shots / Export)
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
│   │   │   ├── briefs.ts               generateCreatorBriefs() — Creator Brief Generator
│   │   │   ├── shotlist.ts             generateShotLists() — Shot List Generator
│   │   │   └── export-brief.ts         generateExportBrief() — markdown bundle
│   │   ├── example.ts          The "Load example" payload (AstroDating)
│   │   └── llm.ts              Adapter interface for plugging an LLM later
│   └── types/
│       └── strategy.ts         Shared TypeScript types
├── scripts/
│   └── test-logic.ts           `npm run test:logic` — 147 checks
├── public/
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

There is no backend. State lives in React; nothing is persisted between sessions.

## How it works (engine model)

BigAd treats every strategy as a function of seven user-provided variables:

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

To upgrade BigAd from deterministic templates to LLM-generated sections:

1. Create `src/lib/llm-openai.ts` (or `llm-anthropic.ts`) that implements `LLMAdapter`.
2. In `buildStrategy`, after computing the local fallback for a section, race it against `getLLM().generateSection(input, section)` and prefer the LLM result when non-null and well-shaped.
3. Pipe the LLM output through `detectGenericCopy` before showing it. The guard is a free, deterministic filter that catches the most common ways LLMs default to bland marketing language.
4. Keep returning the deterministic output when the LLM is unavailable, errors out, or returns malformed JSON. The local engine is the safety net, not the warm-up act.

The point of the section-level adapter is that you can ship LLM-generated headlines while still using the local engine for, say, App Store keywords — which are easier to get right with rules than with a model.

## Copyright and source attribution

BigAd is an **original** marketing-strategy agent. It is **inspired by general direct-response principles** — concepts that are common across the discipline, such as:

- audience awareness level
- market sophistication
- central promise
- unique mechanism
- objections and message–market fit
- channel × audience fit

It does **not** copy or paraphrase any specific book, course, or framework. No prose from any proprietary source appears in this repository, in the UI, or in the generated outputs. If you fork BigAd, please preserve this guarantee: contribute concept-level guidance phrased in your own words, never quoted passages from third-party materials.

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

Source for BigAd lives inside the parent monorepo's history. Treat the code as private to this repository unless the repository's top-level license says otherwise.
