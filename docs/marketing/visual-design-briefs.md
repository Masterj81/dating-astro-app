# AstroDating Visual Design Briefs

## Brand Guidelines

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Deep Space | #0f0f1a | Primary background |
| Cosmic Purple | #1a1a2e | Secondary background |
| Nebula Purple | #4a3f6b | Accent, gradients |
| Stellar Pink | #E94560 | Primary CTA, hearts, likes |
| Cosmic Rose | #FF6B8A | Secondary accent |
| Starlight | #FFFFFF | Primary text |
| Moonlight | #B8B8C7 | Secondary text |
| Gold Star | #FFD700 | Premium features, stars |
| Celestial Blue | #4A90D9 | Links, info elements |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Headlines | SF Pro Display / Inter | Bold (700) | 28-48px |
| Subheadlines | SF Pro Display / Inter | Semibold (600) | 18-24px |
| Body | SF Pro Text / Inter | Regular (400) | 14-16px |
| Captions | SF Pro Text / Inter | Regular (400) | 12px |
| CTAs | SF Pro Display / Inter | Bold (700) | 16-18px |

### Visual Elements

- **Stars:** 4-pointed and 6-pointed sparkles
- **Constellations:** Subtle line patterns connecting dots
- **Gradients:** Purple to pink (45° angle)
- **Zodiac symbols:** Clean, modern line versions
- **Glow effects:** Soft pink/purple glows behind key elements

---

## Facebook Cover Photo

### Specifications
- **Dimensions:** 820 x 312 px (desktop), safe area 640 x 312 px (mobile crop)
- **Format:** PNG or JPG
- **File size:** Under 100KB for fast loading

### Design Brief

```
Layout (Left to Right):
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   [Constellation       [APP MOCKUP]        [Tagline + Badges]       │
│    Pattern]            iPhone showing      "Love Written            │
│                        compatibility       in the Stars"            │
│    Subtle stars        screen with         ────────────             │
│    and sparkles        94% match           [App Store] [Play Store] │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Background:
- Gradient from #0f0f1a (left) to #1a1a2e (right)
- Constellation pattern at 10% opacity
- Scattered 4-pointed stars (white, 20-40% opacity)
- Soft pink glow behind phone mockup

Phone Mockup:
- iPhone 14/15 frame (space black)
- Screen showing compatibility result:
  - Two profile photos in circles
  - "94% Compatible" in large text
  - Hearts/stars animation suggestion
- Slight 3D rotation (5-10° left tilt)
- Drop shadow for depth

Right Side:
- "Love Written" in Stellar Pink (#E94560)
- "in the Stars" in White
- Font: Bold, 32-36px
- App Store and Google Play badges below
- Badges at 60% size, horizontal layout

Do NOT include:
- Text in the left 20% (gets cropped on mobile)
- Important elements in bottom 40px (profile photo overlap)
```

### Midjourney v6.1 -- Background Asset

Use this prompt to generate the constellation/nebula background, then composite the phone mockup and text in Figma:

```
/imagine ultra-wide panoramic deep space background, dark navy blue to
indigo gradient, delicate constellation lines connecting scattered
bright stars, faint pink and purple nebula wisps, ethereal celestial
atmosphere, clean minimalist design, horizontal banner composition
--ar 82:31 --s 300 --style raw --v 6.1 --no text words letters
```

### Mockup Reference
```
[Visual representation]

     ✧  ·  ✦        ┌─────────┐
  ·    ✧      ·     │  📱     │     Love Written
    ·    ✦   ·      │ [94%]   │     in the Stars
  ✧  ·    ·  ✧      │ compat  │     ─────────────
     ✦  ·   ✧       └─────────┘     [⬇️ App Store]
  ·     ✧   ·            ↓          [▶️ Play Store]
                    soft glow
```

---

## Profile Picture

### Specifications
- **Dimensions:** 170 x 170 px (displays at 170 x 170)
- **Format:** PNG with transparency or JPG
- **Shape:** Displays as circle

### Design Brief

```
Option A - App Icon Style:
┌───────────────────┐
│                   │
│    ✦  Gradient    │
│       background  │
│    4-pointed      │
│    star with      │
│    heart center   │
│                   │
└───────────────────┘

- Background: Gradient #1a1a2e to #4a3f6b
- Central icon: 4-pointed star in white/gold
- Small heart shape in center of star
- Soft outer glow

Option B - Logomark:
┌───────────────────┐
│                   │
│      "AD"         │
│   stylized with   │
│   star accents    │
│                   │
└───────────────────┘

- "A" and "D" interlinked
- Stars incorporated into letterforms
- Gradient fill matching brand colors
```

---

## Ad Creatives

### Ad Creative 1: App Introduction (Single Image)

**Dimensions:** 1080 x 1080 px (square) or 1080 x 1920 px (story)

```
Layout:
┌────────────────────────────────────┐
│                                    │
│  "Your Birth Chart              ✦  │
│   Knows Your Type"                 │
│                                    │
│        ┌─────────────┐             │
│        │   📱        │             │
│        │  [Natal     │             │
│        │   Chart     │             │
│        │   Screen]   │             │
│        └─────────────┘             │
│              ↓                     │
│         soft glow                  │
│                                    │
│  ♈♉♊♋♌♍♎♏♐♑♒♓                      │
│                                    │
│  ┌──────────────────────────────┐  │
│  │     Download Free →          │  │
│  └──────────────────────────────┘  │
│                                    │
└────────────────────────────────────┘

Elements:
- Headline: White, Bold, 36px, centered
- Phone: Centered, showing natal chart wheel
- Zodiac symbols: Row below phone, pink color, 24px
- CTA button: Stellar Pink (#E94560), rounded corners
- Background: Deep Space with subtle stars
- Constellation lines connecting some stars
```

### Midjourney v6.1 -- Ad Background (square)

```
/imagine dark cosmic background, deep navy and indigo tones,
scattered small bright white stars, faint constellation line
patterns, subtle pink-purple nebula glow in center, clean and
minimal, suitable for social media ad background --ar 1:1
--s 250 --style raw --v 6.1 --no text words letters
```

### Midjourney v6.1 -- Ad Background (story 9:16)

```
/imagine vertical dark cosmic background, rich deep navy and
indigo gradient, scattered tiny white stars, delicate constellation
lines, soft pink-purple nebula glow radiating from center, clean
minimal celestial atmosphere --ar 9:16 --s 250 --style raw
--v 6.1 --no text words letters
```

### Ad Creative 2: Compatibility Feature (Carousel)

**Dimensions:** 1080 x 1080 px per card (5 cards)

```
Card 1 - Hook:
┌────────────────────────────────────┐
│                                    │
│      "Are You Actually            │
│       Compatible?"                 │
│                                    │
│         [Two profile               │
│          circles with              │
│          question mark             │
│          between them]             │
│                                    │
│      Swipe to find out →          │
│                                    │
└────────────────────────────────────┘

Card 2 - Sun Sign:
┌────────────────────────────────────┐
│                                    │
│      ☀️ Sun Sign                   │
│      "Your core identity"          │
│                                    │
│      [Circular chart segment       │
│       highlighting sun             │
│       position]                    │
│                                    │
│      Match: 85%                    │
│      ████████░░                    │
│                                    │
└────────────────────────────────────┘

Card 3 - Moon Sign:
┌────────────────────────────────────┐
│                                    │
│      🌙 Moon Sign                  │
│      "Emotional compatibility"     │
│                                    │
│      [Chart segment with           │
│       moon highlighted]            │
│                                    │
│      Match: 92%                    │
│      █████████░                    │
│                                    │
└────────────────────────────────────┘

Card 4 - Venus Sign:
┌────────────────────────────────────┐
│                                    │
│      💕 Venus Sign                 │
│      "How you love"                │
│                                    │
│      [Chart segment with           │
│       Venus highlighted]           │
│                                    │
│      Match: 78%                    │
│      ███████░░░                    │
│                                    │
└────────────────────────────────────┘

Card 5 - CTA:
┌────────────────────────────────────┐
│                                    │
│      "94% Overall                  │
│       Compatibility"               │
│                                    │
│      [Full synastry chart          │
│       with both people]            │
│                                    │
│  ┌──────────────────────────────┐  │
│  │   Find Your Match →          │  │
│  └──────────────────────────────┘  │
│                                    │
└────────────────────────────────────┘

Design Notes:
- Consistent header position across cards
- Progress bars use gradient fill
- Subtle animation arrows between cards
- Final card has strongest CTA
```

### Midjourney v6.1 -- Carousel Card Backgrounds

Generate a consistent set by using the same seed (`--seed 2024`) across all five prompts:

```
/imagine minimal dark cosmic background, deep indigo, very subtle
scattered pinpoint stars, warm golden sun glow diffused from top
center, clean and uncluttered, social media card background --ar 1:1
--s 200 --style raw --seed 2024 --v 6.1 --no text words letters
```

```
/imagine minimal dark cosmic background, deep indigo, very subtle
scattered pinpoint stars, cool silver crescent moon glow diffused
from top center, clean and uncluttered, social media card background
--ar 1:1 --s 200 --style raw --seed 2024 --v 6.1
--no text words letters
```

```
/imagine minimal dark cosmic background, deep indigo, very subtle
scattered pinpoint stars, soft pink venus glow diffused from top
center, clean and uncluttered, social media card background --ar 1:1
--s 200 --style raw --seed 2024 --v 6.1 --no text words letters
```

### Ad Creative 3: Zodiac-Specific (Template)

**Dimensions:** 1080 x 1080 px

```
Template Layout:
┌────────────────────────────────────┐
│                                    │
│  [ZODIAC SYMBOL]  ✦  ✧             │
│      large, centered               │
│                                    │
│  "[Sign Name],"                    │
│  "Your Match is Waiting"           │
│                                    │
│  ─────────────────────             │
│                                    │
│  [Sign-specific message            │
│   2-3 lines centered]              │
│                                    │
│  ┌──────────────────────────────┐  │
│  │     Download Free →          │  │
│  └──────────────────────────────┘  │
│                                    │
│        AstroDating logo            │
│                                    │
└────────────────────────────────────┘

Color Variations by Element:

Fire Signs (Aries, Leo, Sagittarius):
- Accent: #FF6B4A (warm orange-red)
- Gradient: #E94560 to #FF8C42

Earth Signs (Taurus, Virgo, Capricorn):
- Accent: #7CB342 (earthy green)
- Gradient: #4A7C59 to #8BC34A

Air Signs (Gemini, Libra, Aquarius):
- Accent: #64B5F6 (sky blue)
- Gradient: #4A90D9 to #81D4FA

Water Signs (Cancer, Scorpio, Pisces):
- Accent: #7E57C2 (deep purple)
- Gradient: #5C6BC0 to #9575CD
```

### Midjourney v6.1 -- Zodiac Element Backgrounds

**Fire signs:**
```
/imagine dark cosmic background, deep navy black, fiery orange and
crimson nebula wisps swirling softly in center, scattered bright
ember-like stars, warm dramatic glow, clean minimal composition,
social media post background --ar 1:1 --s 250 --style raw --v 6.1
--no text words letters
```

**Earth signs:**
```
/imagine dark cosmic background, deep navy black, soft emerald green
and moss-toned nebula wisps in center, tiny crystalline stars
scattered, organic earthy celestial glow, clean minimal composition,
social media post background --ar 1:1 --s 250 --style raw --v 6.1
--no text words letters
```

**Air signs:**
```
/imagine dark cosmic background, deep navy black, ethereal sky blue
and silver nebula wisps in center, fine scattered bright stars,
breezy light celestial glow, clean minimal composition, social media
post background --ar 1:1 --s 250 --style raw --v 6.1
--no text words letters
```

**Water signs:**
```
/imagine dark cosmic background, deep navy black, rich violet and
deep indigo nebula wisps in center, scattered shimmering stars like
light through water, fluid mystical celestial glow, clean minimal
composition, social media post background --ar 1:1 --s 250
--style raw --v 6.1 --no text words letters
```

### Ad Creative 4: Story/Reel Format

**Dimensions:** 1080 x 1920 px (9:16)

```
Frame 1 (0-3 sec) - Hook:
┌─────────────────────┐
│                     │
│                     │
│   "POV: Dating      │
│    apps finally     │
│    understand       │
│    astrology"       │
│                     │
│   [Your face or     │
│    phone screen]    │
│                     │
│                     │
│                     │
└─────────────────────┘

Frame 2 (3-6 sec):
┌─────────────────────┐
│                     │
│   "Enter your       │
│    birth time"      │
│                     │
│   ┌───────────────┐ │
│   │ Birth Info    │ │
│   │ ────────────  │ │
│   │ Date: [____]  │ │
│   │ Time: [____]  │ │
│   │ Place: [____] │ │
│   └───────────────┘ │
│                     │
│                     │
└─────────────────────┘

Frame 3 (6-9 sec):
┌─────────────────────┐
│                     │
│   "Get your full    │
│    chart"           │
│                     │
│   [Animated natal   │
│    chart wheel      │
│    drawing itself]  │
│                     │
│                     │
│                     │
│                     │
│                     │
└─────────────────────┘

Frame 4 (9-12 sec):
┌─────────────────────┐
│                     │
│   "See compatibility│
│    scores"          │
│                     │
│   [Profile card     │
│    with percentage] │
│                     │
│   ┌───┐             │
│   │87%│ ♥           │
│   └───┘             │
│                     │
│                     │
└─────────────────────┘

Frame 5 (12-15 sec) - End Card:
┌─────────────────────┐
│                     │
│   ✦ AstroDating ✦   │
│                     │
│   "Love Written     │
│    in the Stars"    │
│                     │
│   ┌───────────────┐ │
│   │ Download Free │ │
│   └───────────────┘ │
│                     │
│   [App Store icons] │
│                     │
└─────────────────────┘

Animation Notes:
- Smooth transitions (0.3s fade/slide)
- Text appears with subtle scale-up
- Stars twinkle throughout
- Chart wheel rotates slowly
- Compatibility number counts up
```

### Midjourney v6.1 -- Story/Reel End Card Background

```
/imagine vertical dark cosmic background, deep navy and purple
gradient, centered soft radial pink-gold glow, scattered sparkling
four-pointed stars, elegant celestial atmosphere, premium feel,
clean and minimal --ar 9:16 --s 300 --style raw --v 6.1
--no text words letters
```

---

## Social Post Templates

### Template 1: Daily Horoscope

**Dimensions:** 1080 x 1350 px (4:5 portrait)

```
┌────────────────────────────────────┐
│  ✦ Daily Horoscope ✦    [date]    │
├────────────────────────────────────┤
│                                    │
│         [ZODIAC SYMBOL]            │
│              ♈                     │
│           "Aries"                  │
│                                    │
│  ─────────────────────────────     │
│                                    │
│  "Bold moves lead to exciting      │
│   discoveries today. Trust your    │
│   instincts — they're aligned      │
│   with the stars."                 │
│                                    │
│  ─────────────────────────────     │
│                                    │
│  Lucky Number: 7                   │
│  Best Match Today: Leo ♌           │
│  Energy Level: ████████░░ 80%      │
│                                    │
│  ─────────────────────────────     │
│                                    │
│        🌙 Waxing Crescent          │
│                                    │
│       [AstroDating logo]           │
└────────────────────────────────────┘

Design Notes:
- Create 12 versions (one per sign)
- Zodiac symbol large and centered (120px)
- Message text in elegant serif or display font
- Stats section with icons
- Moon phase indicator at bottom
- Subtle constellation pattern in background
```

### Midjourney v6.1 -- Horoscope Post Background (4:5)

```
/imagine dark celestial background, deep indigo to black vertical
gradient, very subtle constellation line patterns at low opacity,
scattered dim pinpoint stars, soft diffused purple glow in upper
third, elegant minimal astronomy aesthetic, portrait composition
--ar 4:5 --s 200 --style raw --v 6.1 --no text words letters
```

### Template 2: Compatibility Post

**Dimensions:** 1080 x 1080 px (square)

```
┌────────────────────────────────────┐
│                                    │
│     ♈         ❤️         ♐        │
│   Aries      +      Sagittarius   │
│                                    │
│  ════════════════════════════════  │
│                                    │
│          "Fire + Fire"             │
│                                    │
│     Compatibility: 91%             │
│     ███████████████████░           │
│                                    │
│  ────────────────────────────────  │
│                                    │
│  🔥 Passion: High                  │
│  💬 Communication: Excellent       │
│  🎯 Long-term: Very Strong         │
│                                    │
│  ────────────────────────────────  │
│                                    │
│  "Two adventurers who never        │
│   run out of things to explore     │
│   together."                       │
│                                    │
│        [AstroDating logo]          │
└────────────────────────────────────┘

Design Notes:
- Signs on either side with heart/plus between
- Compatibility bar with gradient fill
- Three key metrics with emoji icons
- Short quote describing the pairing
- Background: Split gradient matching element colors
```

### Midjourney v6.1 -- Compatibility Post Background

```
/imagine dark cosmic background split vertically, warm fiery
orange-crimson nebula glow on left side, cool icy blue nebula glow
on right side, blending softly in center, scattered tiny stars,
symmetrical composition, social media post background --ar 1:1
--s 250 --style raw --v 6.1 --no text words letters
```

### Template 3: Engagement/Poll Post

**Dimensions:** 1080 x 1080 px (square)

```
┌────────────────────────────────────┐
│                                    │
│  ✦ Which sign gives the           │
│    BEST advice? ✦                  │
│                                    │
│  ┌──────────┐    ┌──────────┐     │
│  │    ♍     │    │    ♏     │     │
│  │  Virgo   │ vs │ Scorpio  │     │
│  └──────────┘    └──────────┘     │
│                                    │
│  ┌──────────┐    ┌──────────┐     │
│  │    ♑     │    │    ♒     │     │
│  │Capricorn │ vs │ Aquarius │     │
│  └──────────┘    └──────────┘     │
│                                    │
│  ─────────────────────────────     │
│                                    │
│  Drop your answer in the           │
│  comments! 👇                      │
│                                    │
│        [AstroDating logo]          │
└────────────────────────────────────┘

Design Notes:
- 2x2 grid of sign options
- Each in a rounded box with zodiac symbol
- Question in bold at top
- Interactive prompt at bottom
- Can also create as Instagram poll sticker format
```

### Template 4: Sign Meme/Humor

**Dimensions:** 1080 x 1350 px (4:5)

```
┌────────────────────────────────────┐
│                                    │
│  "How each sign texts back"        │
│                                    │
│  ┌────────────────────────────┐    │
│  │ ♈ Aries                    │    │
│  │ "omw" (sent 2 hours ago)   │    │
│  ├────────────────────────────┤    │
│  │ ♉ Taurus                   │    │
│  │ [typing...] for 45 minutes │    │
│  ├────────────────────────────┤    │
│  │ ♊ Gemini                   │    │
│  │ 47 messages in 30 seconds  │    │
│  ├────────────────────────────┤    │
│  │ ♋ Cancer                   │    │
│  │ "are you mad at me?"       │    │
│  ├────────────────────────────┤    │
│  │ ♌ Leo                      │    │
│  │ Voice memo (3:47)          │    │
│  ├────────────────────────────┤    │
│  │ ♍ Virgo                    │    │
│  │ Perfectly punctuated essay │    │
│  └────────────────────────────┘    │
│                                    │
│  (continue for all 12 signs        │
│   or split into 2 posts)           │
│                                    │
│  Tag someone! 👇                   │
│        [AstroDating logo]          │
└────────────────────────────────────┘

Design Notes:
- List format mimicking text messages
- Each sign has its own row
- Humor should be relatable, not mean
- Encourage tagging in caption
- Use message bubble styling
```

---

## Story Templates

### Story 1: Quick Poll

**Dimensions:** 1080 x 1920 px

```
┌─────────────────────┐
│                     │
│                     │
│  "What's your       │
│   Moon sign?"       │
│                     │
│  ┌───────────────┐  │
│  │ Fire 🔥       │  │
│  │ ────────────  │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Earth 🌿      │  │
│  │ ────────────  │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Air 💨        │  │
│  │ ────────────  │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Water 🌊      │  │
│  │ ────────────  │  │
│  └───────────────┘  │
│                     │
│  [AstroDating]      │
└─────────────────────┘

Design Notes:
- Use native poll sticker over designed background
- Each option is an element group
- Results reveal most common moon element in audience
```

### Midjourney v6.1 -- Story Poll Background

```
/imagine vertical dark cosmic background, deep midnight blue, large
luminous crescent moon softly glowing in upper portion, scattered
tiny bright stars, dreamy celestial atmosphere, clean minimal
composition, space for overlay content in lower two-thirds --ar 9:16
--s 300 --style raw --v 6.1 --no text words letters
```

### Story 2: This or That

**Dimensions:** 1080 x 1920 px

```
┌─────────────────────┐
│                     │
│  "This or That"     │
│   Zodiac Edition    │
│                     │
│  ┌───────┬───────┐  │
│  │ Stay  │  Go   │  │
│  │  in   │  out  │  │
│  │       │       │  │
│  │ ♋♉♍♑ │ ♈♌♐♊ │  │
│  └───────┴───────┘  │
│                     │
│  [Slider sticker]   │
│                     │
│  Tap your vibe! 👆  │
│                     │
│  [AstroDating]      │
└─────────────────────┘
```

### Story 3: Countdown/Reminder

**Dimensions:** 1080 x 1920 px

```
┌─────────────────────┐
│                     │
│  ⚠️ Mercury         │
│  Retrograde         │
│  Incoming ⚠️        │
│                     │
│  ┌───────────────┐  │
│  │  COUNTDOWN    │  │
│  │  ──────────   │  │
│  │  3 DAYS       │  │
│  └───────────────┘  │
│                     │
│  Survival tips:     │
│  • Back up data     │
│  • Avoid new        │
│    relationships    │
│  • Double-check     │
│    messages         │
│                     │
│  Get alerts in app →│
│                     │
│  [AstroDating]      │
└─────────────────────┘
```

### Midjourney v6.1 -- Mercury Retrograde Story Background

```
/imagine vertical dark cosmic background, deep navy and charcoal,
small glowing planet with orbital rings tilted and reversed, chaotic
swirling faint nebula trails, scattered dim stars, ominous yet
beautiful celestial atmosphere, dramatic moody lighting, clean
composition --ar 9:16 --s 300 --style raw --v 6.1
--no text words letters
```

---

## Instagram Highlights Covers

**Dimensions:** 1080 x 1920 px (display in circle)

### Design System

```
Consistent Elements:
- Background: Solid #1a1a2e
- Icon: White, centered, 400px
- Subtle outer glow matching category

Covers to Create:

1. "Horoscopes" ☀️
   - Sun icon
   - Gold glow

2. "Compatibility" 💕
   - Two hearts interlinked
   - Pink glow

3. "Tips" ✨
   - Sparkle/star icon
   - White glow

4. "Signs" ♈
   - Zodiac wheel outline
   - Purple glow

5. "App" 📱
   - Phone icon with star
   - Pink glow

6. "Community" 👥
   - People icon
   - Blue glow

7. "FAQ" ❓
   - Question mark
   - Teal glow

8. "Reviews" ⭐
   - Star icon
   - Gold glow
```

---

## Video Specifications

### Short-Form (Reels/Stories/TikTok)

| Spec | Value |
|------|-------|
| Dimensions | 1080 x 1920 px |
| Aspect Ratio | 9:16 |
| Duration | 15-60 seconds |
| Frame Rate | 30 fps |
| Format | MP4 (H.264) |
| Audio | AAC, stereo |

### Feed Video

| Spec | Value |
|------|-------|
| Dimensions | 1080 x 1080 px (square) or 1080 x 1350 px (4:5) |
| Duration | Up to 60 minutes |
| Frame Rate | 30 fps |
| Format | MP4 (H.264) |

### Ad Video

| Spec | Value |
|------|-------|
| Dimensions | 1080 x 1080 px (feed), 1080 x 1920 (story) |
| Duration | 15 seconds (optimal for ads) |
| Frame Rate | 30 fps |
| Text | Keep in safe zone (top/bottom 250px clear) |

---

## Asset Checklist

### Logos & Icons
- [ ] App icon (1024 x 1024 px, various sizes)
- [ ] Wordmark logo (white, pink versions)
- [ ] Logomark only (star icon)
- [ ] Favicon (various sizes)

### Social Profiles
- [ ] Facebook cover (820 x 312 px)
- [ ] Facebook profile (170 x 170 px)
- [ ] Instagram profile (320 x 320 px)
- [ ] Twitter/X header (1500 x 500 px)
- [ ] Twitter/X profile (400 x 400 px)

### Ad Creatives
- [ ] Single image ads (1080 x 1080, 1080 x 1350)
- [ ] Carousel cards (1080 x 1080, 5-10 cards)
- [ ] Story ads (1080 x 1920)
- [ ] Video ads (15 sec, 30 sec versions)

### Content Templates
- [ ] Daily horoscope (12 sign variations)
- [ ] Compatibility posts (template)
- [ ] Engagement posts (poll, quiz)
- [ ] Story templates (poll, slider, quiz)
- [ ] Highlight covers (8 icons)

### App Store Assets
- [ ] Screenshots iPhone 6.7" (1290 x 2796 px, 5-10)
- [ ] Screenshots iPhone 6.5" (1242 x 2688 px, 5-10)
- [ ] Screenshots iPad 12.9" (2048 x 2732 px, optional)
- [ ] App preview video (optional)
- [ ] Feature graphic Android (1024 x 500 px)

---

## Design Tools Recommendations

### Primary Design
- **Figma** - Collaborative design, templates, prototyping
- **Canva Pro** - Quick social content, templates

### Photo/Image
- **Adobe Photoshop** - Complex image editing
- **Remove.bg** - Background removal

### AI Image Generation
- **Midjourney v6.1** - Cosmic/celestial backgrounds, nebula textures
- **Workflow:** Generate background in Midjourney, composite text/mockups in Figma

### Video
- **CapCut** - Short-form video editing
- **Adobe Premiere** - Professional video editing

### Animation
- **After Effects** - Motion graphics
- **Lottie** - Lightweight animations for app/web

### Mockups
- **Previewed** - Device mockups
- **Smartmockups** - Quick mockup generation
