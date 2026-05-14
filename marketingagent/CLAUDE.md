# AstroDating Marketing Agent

## What is this?
An autonomous marketing agent for AstroDating — a dating app that uses real birth chart astrology (synastry) to match people. The agent generates, scores, evolves, and publishes social media content.

## Brand Voice
- Casual, witty, human — like a friend who's into astrology, not a corporation
- Think Twitter/X energy, not LinkedIn
- Specific to astrology/dating, never generic motivational
- 1-2 emojis max per post
- No hashtags unless trend-specific

## Architecture
- `agent.ts` — Main CLI with generate/post/auto/list commands
- `.pi/extensions/` — Pi extensions for specialized tasks

### Runtime state files (gitignored — NOT in a fresh clone)
`posts.json`, `memory.json`, `evolution-state.json`, `schedule.json` are
mutated by the agent at run time and are **gitignored**. A fresh clone has
none of them — this is expected. Every reader guards with `existsSync` and
falls back to a hard-coded default, and the first write creates the file.
You do not need to seed them. To reset state, just delete the file(s):
- `posts.json` — generated/scheduled/posted posts (default: `[]`)
- `memory.json` — short-term anti-repetition memory (default: empty memory object)
- `evolution-state.json` — `npm run evolve` genetic-loop state (default: rules pool reset)
- `schedule.json` — dashboard `setInterval` queue (default: `[]`)

## Key APIs
- **Anthropic** — Content generation (Claude Sonnet)

- **Blotato** — Publishing to Facebook + Instagram (POST /v2/posts via backend.blotato.com, 1 call per platform)
- **Gemini** — Image generation via `gemini-2.5-flash-image` (requires `GEMINI_API_KEY`; falls back to Pollinations.ai if not set)

## Content Rules
- Max 280 chars for social posts
- NEVER use AI-speak words (see BANNED_WORDS in agent.ts)
- Score must be < 20/100 to pass (0 = human, 100 = AI slop)
- Check memory before generating to avoid repetition

## Target Audience
Women and men 18-35, interested in astrology, tired of shallow dating apps.
Located in Montreal, Toronto, NYC, LA, Chicago, Miami, and other major North American cities.

## Available Topics
- Zodiac compatibility (which signs match)
- Birth chart education (Sun vs Moon vs Rising, Venus in love)
- Dating tips through astrology lens
- Sign-specific humor and relatable content
- App features (compatibility scores, tarot, horoscopes)
- Seasonal astrology (retrogrades, eclipses, sign seasons)
- Zodiac truth (sign-specific personality traits, superpowers, and real struggles)
- Sign love styles (how each sign loves, what they need in a partner, their dating patterns)
- Best cosmic matches (which signs work best together and why — fire+fire, water+earth, etc.)
- Tarot and card readings (daily pulls, love spreads, what the cards say about your love life)
- Planetary placements and transits (Mercury retrograde survival, Venus in signs, Mars energy, moon phases and dating)
