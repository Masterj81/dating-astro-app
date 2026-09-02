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

## The rule

Each family has one job. This is the part that keeps it from becoming confetti.

| Family | Job | Where |
|---|---|---|
| **Gold** | identity, premium, status, every section marker | tab bar, badges, tier pills, hub cards, paywall and unlock CTAs, zodiac ring, 205 section labels |
| **Coral** | emotional **actions** — like, message, send | buttons inside Discover and Chat, never decoration |
| **Purple** | Cosmic tier (`premium_plus`) only | Cosmic hub and its cards |

## The palette

| Token (web / mobile) | Hex | Contrast | Use |
|---|---|---|---|
| `--color-gold` / `gold` | `#E8C77E` | 11.4:1 text | The identity colour |
| `--color-gold-soft` / `goldSoft` | `#F2DCA8` | 13.7:1 text | Gradient start, hover |
| `--color-gold-deep` / `goldDeep` | `#C9A24D` | — fill | Gradient end |
| `--color-gold-muted` / `goldMuted` | `#B8A87F` | 7.9:1 text | Section labels |
| `--color-gold-wash` / `goldWash` | `rgba(232,199,126,.10)` | — | Tinted surfaces |
| `--color-gold-border` / `goldBorder` | `rgba(232,199,126,.28)` | — | Gold hairlines |
| `--color-accent` / `coral` | `#E85D75` | 5.5:1 text | Actions |
| `--color-accent-hover` / `coralStrong` | `#D93C5A` | 4.4:1 with white | Pressed/hover fill |
| `--color-purple` / `cosmic` | `#8B87FF` | 6.2:1 text | Cosmic tier |
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

`npm run validate:design-tokens`, 46 checks:

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

Verified by introducing five regressions — mobile gold drifting from web,
section labels below AA, the tab bar reverting to coral, a white label on a
gold button, and a legacy hex returning. All five were caught.

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
