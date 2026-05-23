# JUNO — App Review pack (Guideline 4.3(b))

Paste-ready material for the JUNO **App Store** resubmission. Four
sections, each meant to be copied verbatim into App Store Connect or the
Resolution Center. For the full store description, keywords and the
technical-identifier list, see [`juno-metadata.md`](./juno-metadata.md) —
this file is the focused **App Review** companion.

**Canonical positioning**

> JUNO is a synastry-led relationship discovery app focused on
> intentional profile browsing and guided conversations — not
> swipe-to-like or swipe-to-pass mechanics.

**Short form:** Synastry-led relationship discovery, with guided
conversation prompts.

**Honesty rule.** JUNO **is** a romantic / relationship product and we do
not hide that. We do **not** claim "JUNO is not a dating app". The
accurate, defensible statement is: *JUNO is not a swipe-first dating
clone — it is a synastry-led relationship discovery experience.*

## Three intentions

JUNO is a synastry-led app for meaningful connections — romantic, social,
and collaborative. The romantic intention remains central and the default.
Users opt into one or more of: **love**, **friendship**,
**business / working chemistry**. The same synastry engine reads the chart
context for each — only the labels and prose around each zone change with
the active reading frame.

Astrology is used as a symbolic framework for reflection. JUNO makes no
predictions and guarantees no outcomes — not romantic, not social, not
professional. We do not promise that two charts will produce a partner, a
friend, or a cofounder. The "Business" intention is about communication
rhythm, trust, pace, and collaboration style — not deal flow, investment
decisions, or any kind of professional advice.

---

## 1. App Review Notes

> Paste into App Store Connect → App Review Information → Notes.
> Do not add "formerly AstroDating" or any prior-name reference.

```
JUNO is a synastry-led relationship discovery app for romantic connection.

What JUNO is:
- A relationship discovery experience built around synastry — the astrological context between two birth charts.
- Users intentionally browse relationship profiles one at a time, review birth-chart and synastry context, and use guided conversation prompts to start a more considered conversation.

What JUNO is not:
- It is not a swipe-first dating clone.
- It does not use swipe-to-like or swipe-to-pass mechanics. There is no "like" or "pass" verdict on a profile, no match queue, and no match-celebration screen.
- It is not a generic horoscope app, and it makes no predictions.

Mechanics, precisely:
- The Discover screen shows one relationship profile at a time. The user moves between profiles with clearly labelled Previous / Next controls, or with a horizontal carousel gesture that is plain navigation — it carries no "like/pass" meaning and nothing is persisted from it.
- Each profile leads with chart context (Sun, Moon, Rising) and a "See synastry" action that opens the compatibility context between two charts.
- Conversations are opened with guided, chart-shaped prompts, not a cold blank message.
- Astrology is used as a symbolic framework for compatibility context and reflection. JUNO does not guarantee romantic outcomes, compatibility, love, or a "soulmate", and it makes no predictions.

A demo account is provided in the App Review credentials fields. The reviewer walkthrough below covers the full experience in about two minutes.
```

---

## 2. Reviewer Walkthrough

> Paste below the App Review Notes, or attach as the review walkthrough.

```
1. Open JUNO. Sign in with the demo account in the App Review credentials fields (the account is pre-onboarded with a birth chart).

2. If prompted, complete birth-chart onboarding — date, time, and place of birth. This is the context the rest of the app is built on.

3. Open the Discover tab. This is a relationship-profile browser, not a swipe deck:
   - one relationship profile is shown at a time;
   - a "Browse with intention" banner and a "Chart context" section (Sun, Moon, Rising) frame the screen;
   - movement is via labelled Previous / View profile / Message / Next controls (a horizontal gesture pages between profiles as plain carousel navigation);
   - there is no like/pass verdict, no red/green overlay, and no match-celebration.

4. Tap "See synastry" on a profile to open the synastry / connection context — the compatibility context between your birth chart and theirs.

5. Open the profile detail and review the guided intro / conversation prompt, which is shaped by the two charts rather than a cold opener.

6. Tap "Message" to start an intentional conversation, or review the relationship-dynamics insight on the synastry screen.

7. (Optional) Open Settings to see the block/report controls and account management (account deletion, data export).
```

---

## 3. Resolution Center reply — Guideline 4.3(b)

> Use only if App Review rejects under 4.3(b) as a dating-clone / spam
> concern. Short, factual, non-adversarial.

```
Thank you for the review.

We understand the 4.3(b) concern and want to clarify how JUNO differs from a swipe-first dating clone.

JUNO is a synastry-led relationship discovery app. It is a romantic / relationship product — we are not claiming otherwise — but its core experience is not built on swipe-to-like or swipe-to-pass mechanics:

- There is no "like" or "pass" verdict on a profile, no match queue, and no match-celebration screen.
- The Discover screen shows one relationship profile at a time; the user moves between profiles with labelled Previous / Next controls (a horizontal gesture is plain carousel navigation and persists nothing).
- Every profile leads with birth-chart context and a synastry reading — the astrological compatibility context between two charts — which the user reviews before deciding whether to start a conversation.
- Conversations begin with guided, chart-shaped prompts rather than a cold opener.
- Astrology is used as a reflective framework for compatibility context; JUNO makes no predictions and guarantees no romantic outcomes.

The differentiating value is the synastry-led context and the guided, intentional conversation flow — not a high-volume swipe loop. We have removed swipe-to-decide visuals (card rotation/throw, like/pass overlays, match-celebration) and reframed the experience as intentional profile browsing.

We would be grateful for reconsideration on the basis of these distinct mechanics. If a specific screen still reads as a swipe-clone pattern, please point us to it and we will address it directly.

Thank you.
```

---

## 4. Store Metadata Safety Checklist

Confirm every row before submitting. Apple hard limits: app name ≤ 30,
subtitle ≤ 30.

| Field | Value | Check |
|---|---|---|
| App name (iOS) | `JUNO — Synastry Guide` | 21 chars ✓ (≤30) |
| Subtitle (iOS) | `Birth Chart Connections` | 23 chars ✓ (≤30) |
| Title (Play Store) | `JUNO — Synastry Guide` | 21 chars ✓ (≤30) |
| Device display name | `JUNO` | ✓ |
| PWA name | `JUNO — Synastry Guide` | ✓ |
| PWA short name | `JUNO` | ✓ |
| Description | Synastry-led, intentional browsing, guided conversations; no swipe/match-clone language | see `juno-metadata.md` |
| Keywords (iOS) | `synastry,birth chart,relationship,connection,natal chart,compatibility,astrology,intentions` | 91/100 ✓ |
| Screenshots / captions | 5-shot synastry narrative; no swipe cards, no "It's a Match", no AstroDating | see `screenshot-seed-notes.md` |
| Category | **Lifestyle** (not Dating — the Dating category invites direct swipe-clone comparison) | ✓ |
| Promotional text (iOS) | Synastry-led framing, no prohibited phrases | see `juno-metadata.md` |

**Prohibited in any store-facing surface** — must be absent from the app
name, subtitle, description, keywords, promo text, screenshots and
marketing assets:

`AstroDating` · `SATURN` · `Tinder` · `Bumble` · `Hinge` ·
`dating clone` · `swipe app` · `swipe left` · `swipe right` ·
`swipe-to-like` · `swipe-to-pass` · `unlimited swipes` · `match rate` ·
`higher match chance` · `It's a Match` · `perfect match` · `soulmate` ·
`guaranteed compatibility` · `find your match` · `find your deeper match`

**Allowed and honest** — JUNO is a romantic product; do not strip these:
`romantic` · `relationship` · `love` · `connection` · `synastry` ·
`birth chart` · `compatibility context` · `conversation` ·
`guided intro`. Defensive phrasing ("not swipe-first", "no swipe-to-like
or swipe-to-pass mechanics") is allowed **inside `docs/app-store/`** App
Review material only.

**Automated guard:** `npm run check:store-metadata` scans the
store-facing config, marketing assets and PWA manifests for the
prohibited list above and verifies the JUNO brand markers. Run it before
every submission.
