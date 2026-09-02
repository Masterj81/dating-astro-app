# The JUNO palette — celestial gold

Date: 2026-09-02
Guard: `npm run validate:design-tokens`
Sources of truth: `apps/web/src/app/globals.css` (`@theme`) and
`apps/mobile/constants/theme.ts` (`AppTheme.colors`)

## What was actually wrong

Not "not enough gold". Two measurable things, neither visible in a diff.

**The app was painted twice.** `AppTheme.colors.coral` is `#E85D75`. A second
coral, `#E94560`, was in 25 mobile files — **83 hex uses plus 51 more as
`rgba(233, 69, 96, …)`**, which is more call sites than the token it shadowed.
Alongside it ran an older three-stop navy (`#0f0f1a` / `#1a1a2e` / `#16213e`,
56 uses) and a raw Tailwind `purple-600`. None of it looks wrong on screen:
the values are plausible neighbours of the real ones. That is exactly why
nobody noticed.

**Gold was declared and not used.** `premiumGold` had **zero** call sites on
mobile. Web had no gold token at all — three raw hexes in the entire app,
against 425 uses of the coral accent and 54 of purple. An astrology product
read pink, and the premium surfaces looked like Like buttons.

## Second pass, 2 Sep 2026 — coral stops being the accent

The first pass gave gold the identity surfaces and left coral doing everything
else. On the preview it read as **the old pink dating brand with gold stuck on
top**, which is a fair description of what it was: `--color-accent` was still
`#E85D75` and it carried roughly **470 call sites** — every border, tint, link
and button in the app. No amount of gold elsewhere wins that argument.

So the token was redefined rather than its 470 call sites edited:

- `--color-accent` is now **muted rose-gold** `#C98692`. Text, borders and
  tints softened at once.
- The **78 solid `bg-accent` fills** moved to gold with near-black labels.
  They had to move regardless: a light rose fill carries a white label at
  2.3:1. The brief wanted primary CTAs gold anyway, so the constraint and the
  intent pointed the same way.
- True coral survives as `--color-coral`, for a like or a match. Nothing else.
- Errors got `--color-danger`, because a failure that looks like a link is a
  failure nobody reads.
- Cosmic went **deep and desaturated** (`#8B87FF` → `#A79FEA` for text,
  `#5B54A8` for fills). At its old brightness it competed with gold, so the
  two tiers read as noise rather than as a hierarchy.
- **Celestial navigation was blue.** Gold is what "celestial" means here, so
  painting that entry blue was the palette arguing with itself. It is gold now,
  Cosmic is deep violet, and ordinary entries are bronze.

311 raw `rgba` washes moved with them: 179 coral, 124 cosmic, 8 celestial blue.

## The rule

Each family has one job. This is the part that keeps it from becoming confetti.

| Family | Job | Where |
|---|---|---|
| **Gold** | identity, premium, status, primary CTAs, every section marker | tab bar, nav dot, badges, tier pills, hub cards, all primary buttons, zodiac ring, 205 section labels |
| **Rose-gold** | the secondary accent — borders, tints, links, selected chrome | what `accent` now means, ~470 sites |
| **Coral** | rare and hot — a like, a match | `--color-coral`, deliberately not the accent |
| **Purple** | Cosmic tier (`premium_plus`) only, deep and desaturated | Cosmic hub and its cards |

## The palette

| Token (web / mobile) | Hex | Contrast | Use |
|---|---|---|---|
| `--color-gold` / `gold` | `#E8C77E` | 11.4:1 text | The identity colour |
| `--color-gold-soft` / `goldSoft` | `#F2DCA8` | 13.7:1 text | Gradient start, hover |
| `--color-gold-deep` / `goldDeep` | `#C9A24D` | — fill | Gradient end |
| `--color-gold-muted` / `goldMuted` | `#B8A87F` | 7.9:1 text | Section labels |
| `--color-gold-wash` / `goldWash` | `rgba(232,199,126,.10)` | — | Tinted surfaces |
| `--color-gold-border` / `goldBorder` | `rgba(232,199,126,.28)` | — | Gold hairlines |
| `--color-gold-antique` / `goldAntique` | `#A9823D` | 4.8:1 text | Depth: borders, gradient ends |
| `--color-bronze` / `bronze` | `rgba(216,181,109,.14)` | — | Active navigation surface |
| `--color-accent` / `coral` | `#C98692` | 5.9:1 text | Secondary accent — rose-gold |
| `--color-accent-hover` / `coralStrong` | `#B76E79` | 3.8:1 with white | Hover/pressed tint |
| `--color-accent-deep` / `coralDeep` | `#9E5A66` | 5.1:1 with white | Rose fills carrying a label |
| `--color-coral` / `coralVivid` | `#E85D75` | 5.0:1 text | Rare and hot only |
| `--color-danger` | `#F2707F` | 6.0:1 text | Errors, never the accent |
| `--color-purple` / `cosmic` | `#A79FEA` | 7.1:1 text | Cosmic tier, text and icons |
| `--color-purple-deep` / `cosmicDeep` | `#5B54A8` | 4.5:1 with white | Cosmic fills |
| — / `textOnGold` | `#0B0B14` | 12:1 on gold | Anything sitting on gold |

Every value is measured against the card surface as it really composites —
white at 7% over `#0B0B14` — not against the raw background.

## Why the section labels mattered most

144 uppercase letter-spaced eyebrows on web and 61 on mobile. They sit on
nearly every card and they were all grey. Repainting them muted gold is the
single change that warms the whole product, and it costs one regex per
platform rather than 205 hand edits. **Muted** and not full gold on purpose:
205 bright-gold labels is a jewellery shop, not a night sky.

## The two accessibility findings

**White on the coral button is 3.36:1 — below AA, and it predates this work.**
It is unchanged here for 62 hover states and the ordinary primary buttons,
because deepening the brand's action colour is a product decision, not a
palette cleanup. The remediation, when you want it: use `#D2374F` or darker as
the button *fill* while `#E85D75` stays for text, borders and tints.

**A gold gradient with a white label is 1.63:1.** This was introduced during
the work and caught twice — first on the Conversation Guide CTA, then on the
paywall. It is now structurally impossible: any file painting with
`gradients.ctaGold` must name `textOnGold`, and the validator fails otherwise.
A related trap is in the same file: the Guide's "Try again" button reuses the
CTA text style but has **no** fill, so it explicitly restores a light colour.

## Premium CTAs are gold with near-black labels

Unlock, upgrade, see plans, subscribe. Two things at once: the identity lands
on the buttons that sell the product, and the label becomes **the most
readable in the app at 12:1** — against 3.36:1 for the white-on-coral it
replaces. Every other button stays coral.

## What the guard checks

`npm run validate:design-tokens`, 68 checks:

- the seven shared colours are declared on **both** platforms with **identical
  hexes** — one palette means one value, in two files, and nothing else
  checked it;
- the second palette stays dead (eight banned hexes plus the rgba form),
  with comment lines exempt so the history can stay written down;
- contrast is **computed**, and each token is tested the way it is used —
  text against the card, fills against their own label. An earlier version
  tested everything as text and flagged `accent-hover`, which is a background
  62 times out of 65;
- the identity is applied, not just declared: floors on the section-label
  counts, the tab bar tint, the wheel's zodiac ring, and the gold-button rule.

The second pass added a section of its own: `accent` must not be coral, true
coral must still exist under its own name, **no solid `bg-accent` fill may
remain**, and the navigation must be gold/bronze/deep-violet rather than
pink/blue/bright-violet.

Verified by introducing twelve regressions across the two passes — mobile gold
drifting from web, labels below AA, the tab bar reverting to coral, a white
label on a gold button, a legacy hex returning, `accent` going back to coral,
true coral disappearing, the nav dot and nav surface reverting, Celestial
repainted blue, a solid accent fill reappearing, and antique gold pushed below
AA. All twelve were caught.

## Not changed

Layout, spacing, type scale, radii, component structure, copy, i18n keys,
routes, gating, astrology. This is a repaint, not a redesign.

## Still open

- The white-on-coral 3.36:1 above.
- Mobile has no RTL handling (`I18nManager` appears nowhere), so Arabic is
  laid out LTR. Unrelated to colour, and app-wide.
- Nobody has looked at this on a real device yet. Contrast is proven
  arithmetically; warmth, balance and "does it feel premium" are not things a
  validator can answer.
