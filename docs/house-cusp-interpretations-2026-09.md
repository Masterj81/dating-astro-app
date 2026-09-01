# Sign-on-cusp interpretations

Date: 2026-09-01
Status: shipped on web and mobile, all 8 locales
Brief: `docs/temple-of-zeus-planets-source-notes-2026-09.md`

## What the reader gets

The Twelve Houses section used to show three things per house: the house number
and name, the sign on its cusp, and a meaning that is **identical for every
chart on earth** ("Career, public image, achievement, your visible role").

A reader who saw "Cancer on the cusp — Maison 10" was told two true facts and
left to connect them alone. That connection is the entire value of a house
cusp, and it was the one thing missing.

Each house card now carries a fourth block, titled *What this sign colors here*
/ *Ce que ce signe colore ici*:

> **House 10 — Cancer on the cusp**
> Your public life may be coloured by care, loyalty and the wish to create a
> sense of safety. At work or in reputation, you may be noticed for protecting,
> for gathering people, or for bringing a human tone into places that run cold.

144 texts per language: 12 houses x 12 signs, no gaps and no combinations that
fall back to something generic.

## Where the corpus lives, and why not in `locales/*.json`

`packages/shared/src/astrology/house-cusps/`

```
types.ts             HouseCuspKey as a template literal type — the 144 keys, typed
content-en.ts        144 English entries, written by hand. Imports nothing.
content-fr.ts        144 French entries, written by hand. Imports nothing.
content-localized.ts es/pt/de/ja/zh/ar — 144 each, COMPOSED (see below)
contract.ts          all 8 corpora checked against Record<HouseCuspLocale, HouseCuspCorpus>
index.ts             resolveHouseCuspInterpretation(s) — the only public surface
```

### Two tiers of content, and they are not the same thing

This matters more than the coverage number, so it is stated first.

**English and French are written.** 144 texts each, composed individually: the
opening varies, the second sentence carries a reflective angle specific to that
house-and-sign pair, and no two share a skeleton.

**The other six are composed.** `content-localized.ts` holds, per language, 12
house phrases, 12 sign phrases, 12 reflection lines and **12 opening frames —
one per house** — and builds each entry as `frame(house)(house-phrase,
sign-phrase) + reflection(sign)`.

What a reader actually sees, and why that is the number that matters: equal-house
cusps always land on twelve **consecutive, distinct** signs, so opening the
chart shows twelve cards carrying twelve different signs. Two consequences:

- The reflection is keyed on the sign, so it **never repeats for an individual
  reader** — each of their twelve cards has a different sign. The repetition
  exists in the corpus, not on anyone's screen.
- The opening frame was the repetition that *was* visible: one frame per
  language meant the same sentence twelve times on one screen. It is now one
  frame per house, so all twelve cards open differently in every language.

That leaves a real but narrower gap against EN/FR: within a language, the twelve
readings of one house share a sentence skeleton, which only shows up if two
people compare charts. Those six languages get a correct, safe, on-voice reading
rather than an individually authored one. Replacing any of them with a written
corpus is a drop-in: add `content-<locale>.ts` and point `contract.ts` at it.

**Grammar defects found and fixed in the composed languages** (2026-09-01
audit), each of which affected all 144 readings of its language:

- `es` — every house phrase is a list of nouns, so the subject is plural. The
  frame said `se exprese`. Fixed by construction: the frames use plural verbs.
- `pt` — same defect, `se expresse`.
- `de` — the frame used `durch` (accusative) while the sign phrases are written
  in the dative (`langfristigem Aufbau`, `dem Bedürfnis nach Sicherheit`). The
  frames now use `von` / `mit` / `an`, which is the case the table was written
  for, and the house phrases stay nominative subjects. One table entry was also
  the odd nominative out: `schnelle Bewegung` → `schneller Bewegung`.
- `ar` — Arabic verbs agree with their subject, and the house phrases switch
  gender (`المهنة` feminine, `البيت` masculine), so any frame with a leading
  verb agreeing with the interpolated phrase is wrong for about half the
  houses. Every frame keeps a fixed subject instead (`هذا البيت`, `أثر`,
  `الأمر`, `لغة`).

144 keys x 8 locales x 2 platforms is **2304 entries**. Mobile locale parity is
exact (`npm run validate:mobile:locales`), so shipping English strings into
eight files to satisfy the parity check would make the translation debt
invisible: eight files that all look complete, seven of them lying. This is the
same trade already made and documented for the Conversation Guide corpus
(`packages/shared/src/coach/content.ts`), for the same reason.

Here the debt is legible: a language is one file, and `HOUSE_CUSP_LOCALES` is
the single list saying which languages are real.

The **key naming asked for in the brief is preserved exactly** —
`natalHouseCuspInterpretation_{house}_{sign}`, e.g.
`natalHouseCuspInterpretation_10_cancer`. If the corpus is ever moved into the
locale files, no key has to change.

### The 144 keys are a compile-time obligation

```ts
type HouseCuspKey = `natalHouseCuspInterpretation_${HouseNumber}_${HouseCuspSign}`;
type HouseCuspCorpus = Record<HouseCuspKey, string>;
```

A corpus missing `natalHouseCuspInterpretation_7_pisces` does not compile. The
hole is caught by `tsc`, before a test, before a validator, and long before a
reader sees a blank.

**For the composed languages this guarantee works differently, and it is worth
being precise.** `build()` fills an object in a loop, and TypeScript cannot
prove a loop covered every key of a mapped type — the function ends in
`{} as HouseCuspCorpus`, which is an assertion, not a proof. The guarantee was
therefore moved to the **inputs**, where it can be proved:

```ts
type Twelve<T> = readonly [T, T, T, T, T, T, T, T, T, T, T, T];
const HOUSE: Record<GeneratedLocale, Twelve<string>>
const SIGN: Record<GeneratedLocale, Record<HouseCuspSign, string>>
const REFLECTION: Record<GeneratedLocale, Twelve<string>>
const FRAME: Record<GeneratedLocale, Twelve<Frame>>
```

An eleven-entry house table is now a compile error. Before the audit these
tables were `as const` with no annotation, so a short table interpolated the
string `undefined` into twelve readings and shipped silently. The key builder
also lost its assertion: with `house: HouseNumber` and `sign: HouseCuspSign` the
template literal *is* a `HouseCuspKey`, so `key(13, 'ophiuchus')` no longer
type-checks. The output is checked at runtime by the test suite and by
`validate-natal-integrity`, which imports the module and counts.

## What it refuses to do

The resolver returns `null` — and `null` renders as nothing — when:

- the house is not an integer 1-12,
- the sign is not one of the twelve,
- either is missing,
- the cusp array is not exactly 12 long (`resolveHouseCuspInterpretations`).

There is **no default interpretation**. A default here would be precisely the
class of bug the natal-integrity work spent months removing: a plausible value
substituted for an absent one, raising no error. See
`docs/twelve-houses-audit-2026-08.md`.

### The one fallback that exists is linguistic

All 8 app locales now have a corpus, so `isFallback` is false for every reader
today. The mechanism stays, and stays wired to the UI, because a 9th locale
would otherwise ship blank: an unknown language tag gets the English text,
`isFallback: true`, and a line under the block saying so. The web renderer also
sets `lang` on the paragraph, so a screen reader does not read English prose in
the page's voice.

Language is a translation gap. A sign is data. Only the first is safe to
substitute, and it is substituted out loud.

## Gating: no reading without a real chart

The block renders only when `cuspSigns` is non-null, which is the existing
twelve-houses gate and requires **the birth time and the birthplace**
(`areHousesTrustworthy`, strictly stronger than `isRisingTrustworthy`). The
three display states are unchanged:

| Birth data | Houses section |
|---|---|
| Time + place | 12 cusp signs, 12 interpretations, planets per house |
| Time, no place | general house meanings only, notice + CTA to add the birth city |
| No time | general house meanings only, notice + CTA to add the birth time |

Nothing about the calculation changed. Equal House, cusps at `ASC + 30i`, MC as
a separate angle — all untouched.

## Equal House is now named where the houses are

It was named only in the MC copy (`natalMidheavenNotTenthCusp`), which lives in
the right-hand column on web and renders only when an MC exists. So a reader
could see twelve cusps with no idea which system produced them.

New key `natalHousesSystemNote`, in all 8 locales, both platforms, shown
whenever the cusps are shown:

> JUNO uses the Equal House system: the twelve cusps are spaced 30° apart,
> starting from your Ascendant.

## Voice rules

Enforced for **all 8 languages** by
`packages/shared/src/astrology/__tests__/house-cusps.test.ts` (107 tests) and
again by `npm run validate:natal-integrity`:

- Every entry hedges, in its own language: may / can / often / tends to —
  peut / pouvez / souvent — puede / a menudo — kann / oft — かもしれません —
  可能 / 常常 — قد / يمكن.
- Banned per language: always, never, destiny, soulmate, guaranteed, perfect
  match — toujours, jamais, destin, garanti — siempre, nunca, destino —
  immer, nie, Schicksal — 運命, 必ず — 命运, 注定 — القدر, مضمون.
- Matching is **word-anchored** for the five latin-script languages, substring
  for ja/zh/ar. A plain `includes` failed German *Harmonie* on the banned
  "nie"; the test now anchors at a word start and stays open at the end, so
  inflections are still caught ("garanti" finds "garantie") and innocent words
  are not.
- No clinical vocabulary: diagnosis, disorder, depression, anxiety, trauma,
  therapy, addiction, toxic, narcissist.
- No planet name and no degree symbol. A sign on a cusp says nothing about
  where Mars is; naming it would describe data this corpus was never handed.
- One to three sentences (`。！？` counted too), 400 characters maximum, and 75
  words maximum where the language has spaces — the word cap alone is vacuous
  for Japanese and Chinese, which tokenise to one.
- No entry repeats another within a language, and no entry in any language is
  identical to its English twin (which would mean a forgotten translation).
- At least 10 distinct openings per language, and at least 10 distinct openings
  across the twelve houses of any single sign — the corpus cannot collapse back
  to one frame per language without failing the build.
- Hedge matching strips accents on both sides. It did not, which meant the
  Portuguese entry `as vezes` could never match the `às vezes` in the text: a
  list entry that reads like coverage and provides none.

## Copyright

Every string was written for JUNO. The design brief
(`docs/temple-of-zeus-planets-source-notes-2026-09.md`) records only
non-protectable general astrology — house life-areas and sign qualities — and
states its own boundary. No third-party text is reproduced, paraphrased
sentence by sentence, condensed or reorganised, and no example, metaphor or
phrasing from any source page is reused.

## French uses "vous", not "tu"

The brief's example was written with "tu". The same screen already says *"Votre
ascendant façonne les premières impressions"* and *"Votre MC indique la
direction publique"*, so 144 texts in "tu" would have put both registers on one
page. Switching the whole screen to "tu" remains open — it is a product
decision about the natal screen, not about this corpus, and it would touch
roughly a dozen existing keys as well as these 144.

## Premium policy: unchanged

The natal chart screen is premium on both platforms and gates exactly as it did
before this change (`PremiumGate` on mobile, the server-authoritative free
preview on web). No new gate, no new tier, no price change. The interpretations
sit inside a screen the reader has already been granted.

## Remaining work

**Upgrade the six composed languages to written ones.** They are complete and
safe, not rich — see "Two tiers" above. Each upgrade is:

1. `content-<locale>.ts`, 144 written entries, importing nothing.
2. Point `contract.ts` at it instead of `build('<locale>')`.

Nothing else. Every test and validator check is parameterised over
`HOUSE_CUSP_LOCALES`, so the replacement is immediately held to the full
standard — banned vocabulary, hedging, scope, sentence count, uniqueness — and
a **half-finished** corpus fails the build rather than shipping holes.

Priority order, by account volume: `es`, `pt`, `de`, then `ja`, `zh`, `ar`.

**A native-speaker proofread of all six.** They were written by the same author
as the English, which is the weakest link in the chain for `ja`, `zh` and `ar`
in particular.

**A note on the validator.** It now loads `content-localized.ts` with a dynamic
`import()` to run the builder, because a text scan cannot see composed output.
That import is why the report block sets `process.exitCode` instead of calling
`process.exit()`: tearing the process down with the module handle still closing
trips a libuv assertion on Windows and exits 127 with every check green, about
every other run.

**Not done, and deliberately out of scope here:** planet-in-house and
planet-in-sign long-form text (the brief's other two layers), and aspect
interpretation copy. The brief sketches all three; this shipped the one the
product priority named.

## Risks

- **The six composed languages are still composed.** Within a language, the
  twelve readings of one house share a sentence skeleton. An individual reader
  does not see that (their twelve cards are twelve different houses AND twelve
  different signs), but two people comparing charts would.
- **The six composed languages have not been proofread by native speakers.**
  The 2026-09-01 audit found a systematic grammar defect in three of them that
  no test caught, because no test can check agreement. `ja`, `zh` and `ar` are
  the least verifiable by the author and the most likely to still hold one.
- **Tone is subjective.** 288 written texts in one pass share an author. They
  were varied deliberately (openings, structure, the reflective second
  sentence), but a reader going through all twelve houses may notice a rhythm.
  Worth re-reading a sample after real use.
- **The corpus is not reviewed by a French native speaker other than its
  author.** The English is the source; the French was written, not translated,
  but a proofread is cheap and has not happened.
- **Sentence counting in the test is naive** (`[.!?]` followed by space or
  end). It would miscount an abbreviation; there are none today.
