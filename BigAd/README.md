# BigAd

BigAd is a marketing-strategy workspace for founders, solopreneurs, and marketers. Describe a product on the left; get a complete, copyable marketing strategy on the right — positioning, awareness analysis, offer, ad concepts, landing copy, app store listing, and a starter A/B testing plan.

The first screen is the workspace itself, not a marketing landing page.

## What BigAd does

For any product you describe, BigAd produces:

- A positioning statement and the four components behind it (for whom / category / unlike / unique)
- Notes on the market's **awareness level** (unaware → most-aware) and what that means for tone
- Notes on the market's **sophistication level** (fresh → mature) and what move to make next
- A **central promise** and **unique mechanism** statement
- 10 headlines spanning different copy patterns
- 5 named ad **angles** with hooks and "when to use" rationale
- A complete **landing page** copy block (hero, sub-hero, bullets, CTA, social proof, on-page objection handlers)
- An **App Store / Play Store** listing draft (name, subtitle, promo text, long description, keyword list)
- 3 short-form video scripts (TikTok / Reels)
- 3 Facebook / Meta ad concepts
- 5 starter A/B **experiments** with hypothesis, variants, and the metric to watch

Every output is built from the inputs you provide — name, category, audience, pain, differentiator, goal, awareness, sophistication — so the same prompt never produces identical copy across two different products.

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

The `test:logic` script feeds two materially different inputs (AstroDating + a writing tool) through the engine and asserts that the two strategies are not identical at the level of headlines, angles, positioning, and landing hero — and that each strategy actually mentions the specific things that make it that product.

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
│   │   ├── StrategyView.tsx     Right pane — tabbed strategy output
│   │   └── CopyableCard.tsx     Reusable card with a small copy button
│   ├── lib/
│   │   ├── engine/              Deterministic strategy engine (no API)
│   │   │   ├── index.ts             Entry point: `buildStrategy(input)`
│   │   │   ├── awareness.ts         analyzeAwareness()
│   │   │   ├── sophistication.ts    analyzeSophistication()
│   │   │   ├── positioning.ts       generatePositioning() + promise + mechanism
│   │   │   ├── angles.ts            generateAngles()
│   │   │   ├── headlines.ts         generateHeadlines()
│   │   │   ├── landing.ts           generateLandingCopy()
│   │   │   ├── store.ts             generateStoreCopy()
│   │   │   ├── shorts.ts            generateTiktokScripts() + generateFacebookAds()
│   │   │   └── experiments.ts       generateExperiments()
│   │   ├── example.ts          The "Load example" payload (AstroDating)
│   │   └── llm.ts              Adapter interface for plugging an LLM later
│   └── types/
│       └── strategy.ts         Shared TypeScript types
├── scripts/
│   └── test-logic.ts           `npm run test:logic`
├── public/
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

There is no backend. State lives in React; nothing is persisted between sessions in the MVP.

## How it works (engine model)

BigAd treats every strategy as a function of seven user-provided variables:

1. Product name, category, description, price, business model
2. Audience and their core frustration
3. Competitors and your real differentiator
4. The outcome you are optimizing for
5. The market's awareness level
6. The market's sophistication level
7. (Optional, future) LLM section overrides

The engine then runs deterministic templates that interpolate those values into copy patterns drawn from general direct-response principles: awareness, sophistication, central promise, unique mechanism, objections, and message-market fit. Each section is its own pure function. None of them call an external service.

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
3. Keep returning the deterministic output when the LLM is unavailable, errors out, or returns malformed JSON. The local engine is the safety net, not the warm-up act.

The point of the section-level adapter is that you can ship LLM-generated headlines while still using the local engine for, say, App Store keywords — which are easier to get right with rules than with a model.

## MVP limits

- No persistence — refresh and your inputs go away.
- No real account / multiple workspaces. One workspace per browser tab.
- Headlines, angles, and ads are good first drafts, not finished copy.
- The "App Store / Play Store" draft does not enforce platform character limits at the field level — treat it as a starting point.
- No real LLM integration yet (interface is in place).

## Copyright and source attribution

BigAd is an **original** marketing-strategy agent. It is **inspired by general direct-response principles** — concepts that are common across the discipline, such as:

- audience awareness level
- market sophistication
- central promise
- unique mechanism
- objections and message–market fit

It does **not** copy or paraphrase any specific book, course, or framework. No prose from "Breakthrough Advertising" or any other proprietary source appears in this repository, in the UI, or in the generated outputs. If you fork BigAd, please preserve this guarantee: contribute concept-level guidance phrased in your own words, never quoted passages from third-party materials.

## Future monetization (sketch — not implemented in MVP)

- Hosted workspace with saved projects, version history, and team sharing
- "Brand voice" upload that constrains generated copy to your existing tone
- One-click export to a Notion / Linear / Trello board with the experiments as tasks
- Optional paid LLM tier (BYO key or managed) for sharper, more varied copy
- Strategy diff view across two product positions or two audiences

## License

Source for BigAd lives inside the parent monorepo's history. Treat the code as private to this repository unless the repository's top-level license says otherwise.
