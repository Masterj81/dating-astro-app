# Temple of Zeus planets — source notes for JUNO

Date: 2026-09-01  
Source reviewed: https://templeofzeus.org/Planets.php

## Purpose

This file records a safe, non-verbatim content brief inspired by the public structure of the Temple of Zeus planets index.

It is **not a scrape** and must not be treated as copied content. JUNO should use this only as a directional reference for building original astrology copy, validators, and feature structure.

## Copyright boundary

Do not copy paragraphs, headings beyond generic astrological terms, examples, ordering details, or wording from Temple of Zeus pages into JUNO.

Allowed:

- Use the public fact that the site organizes planet content around signs, houses, and aspects.
- Use standard astrology concepts that are broadly shared across the field.
- Write new JUNO-native interpretations from scratch.
- Cite the source internally as a research reference if needed.

Not allowed:

- Scraping page text into locale files.
- Paraphrasing sentence-by-sentence.
- Reusing their examples, metaphors, or phrasing.
- Building a page that mirrors their exact content layout in detail.

## Useful structure

The page points to planet-specific material grouped around three interpretation layers:

1. Planet in sign
2. Planet in house
3. Planet in aspect

That maps well to JUNO's current natal architecture:

- `birth_chart.planets.<planet>.sign`
- `birth_chart.planets.<planet>.longitude`
- Equal House cusps derived from the trusted Rising degree
- `houseOfLongitude()` for planet-in-house placement
- `detectAspect()` / `computeSynastry()` for aspect geometry

## JUNO content model recommendation

Use four layers per placement, in this order:

1. What the planet represents
2. What the sign colors
3. What the house localizes
4. What the aspect activates, if applicable

Example pattern:

```text
Venus describes how you connect, choose, and value.
In Cancer, that connection may move through care, memory, loyalty, and emotional safety.
In the 10th house, this becomes visible through public role, reputation, vocation, or long-term achievement.
If Venus aspects Saturn, the tone may become more deliberate, cautious, committed, or slow to trust.
```

## Planet meanings — JUNO baseline

These are original JUNO summaries, written as product-safe content seeds.

### Sun

Core identity, vitality, life direction, and the part of someone that wants to be recognized.

Use for:

- identity rhythm
- confidence style
- visible personality
- relationship baseline

Avoid:

- claiming destiny
- reducing the whole person to the Sun sign

### Moon

Emotional needs, instinctive reactions, memory, comfort, attachment rhythm, and what helps someone feel safe.

Use for:

- emotional pacing
- conflict recovery
- intimacy needs
- daily mood language

Avoid:

- diagnosing mental health
- claiming someone is “unstable” or “needy”

### Mercury

Communication, attention, learning, interpretation, humor, and how someone names what they notice.

Use for:

- texting style
- misunderstanding repair
- conversation prompts
- learning and curiosity

Avoid:

- calling someone unintelligent
- ranking communication styles as better or worse

### Venus

Affection, attraction, pleasure, values, bonding style, taste, and how someone gives or receives warmth.

Use for:

- dating preferences
- tenderness
- aesthetic pull
- emotional generosity

Avoid:

- explicit sexual claims
- promises about compatibility

### Mars

Drive, desire, initiative, conflict style, courage, pursuit, and how someone acts when something matters.

Use for:

- momentum
- boundaries
- conflict tone
- pursuit and directness

Avoid:

- violent framing
- implying aggression is inevitable

### Jupiter

Growth, faith, generosity, humor, opportunity, wisdom, and what expands a person's world.

Use for:

- optimism
- shared adventure
- learning together
- long-range encouragement

Avoid:

- lucky-date promises
- guaranteed success language

### Saturn

Structure, limits, commitment, time, responsibility, fear, maturity, and what becomes stronger through patience.

Use for:

- commitment style
- pressure points
- boundaries
- long-term growth

Avoid:

- punitive language
- making hardship sound fated

### Uranus

Change, independence, surprise, awakening, experimentation, and the need for room to breathe.

Use for:

- difference
- novelty
- personal freedom
- unconventional rhythms

Avoid:

- “chaotic person” labels
- deterministic breakup language

### Neptune

Imagination, sensitivity, longing, ideals, compassion, ambiguity, projection, and spiritual or poetic perception.

Use for:

- dreaminess
- empathy
- unclear expectations
- romantic idealization

Avoid:

- deception accusations
- clinical or addiction claims

### Pluto

Intensity, transformation, power, depth, attachment to truth, endings and renewals, and what refuses to stay superficial.

Use for:

- deep bonds
- shadow work as reflection language
- control vs vulnerability
- transformative relationship themes

Avoid:

- trauma claims
- manipulation accusations
- fatalistic “soulmate” framing

## House meanings — JUNO baseline

Use these as house anchors when writing planet-in-house and sign-on-cusp copy.

1. Identity, body, first impression, how life is approached.
2. Money, values, possessions, self-worth, what feels stable.
3. Communication, siblings, local world, daily learning.
4. Home, roots, family pattern, privacy, emotional foundation.
5. Creativity, play, romance, joy, self-expression.
6. Routines, work rhythm, health habits, service, practical care.
7. One-to-one bonds, partnership, mirrors, chosen agreements.
8. Shared resources, intimacy, trust, loss, transformation.
9. Travel, belief, philosophy, study, wider meaning.
10. Career, reputation, public role, achievement, visibility.
11. Friends, groups, networks, future hopes, community.
12. Solitude, dreams, hidden patterns, retreat, surrender.

## Aspect meanings — JUNO baseline

Keep aspects conversational, not predictive.

### Conjunction

Two functions are close together. Their themes amplify, merge, or become difficult to separate.

### Opposition

Two functions face each other. Their themes may create polarity, attraction, projection, or the need for balance.

### Square

Two functions press against each other. Their themes may create friction, motivation, urgency, or a learning edge.

### Trine

Two functions flow easily. Their themes may support each other naturally, sometimes so easily that they go unnoticed.

### Sextile

Two functions cooperate when used intentionally. Their themes may become helpful through curiosity, practice, and invitation.

## Sign modifiers — short reusable language

### Aries

Direct, initiating, bold, fast-moving, honest, energized by action.

### Taurus

Steady, sensual, patient, loyal, grounded, oriented toward trust and consistency.

### Gemini

Curious, verbal, flexible, observant, playful, energized by exchange.

### Cancer

Protective, emotionally attuned, loyal, memory-rich, oriented toward safety and care.

### Leo

Expressive, warm, proud, generous, creative, energized by recognition and heart.

### Virgo

Precise, helpful, discerning, practical, improvement-oriented, attentive to detail.

### Libra

Relational, graceful, balancing, aesthetic, diplomatic, oriented toward mutuality.

### Scorpio

Intense, private, perceptive, loyal, transformative, drawn toward depth and truth.

### Sagittarius

Expansive, frank, adventurous, philosophical, freedom-seeking, meaning-oriented.

### Capricorn

Disciplined, strategic, responsible, enduring, achievement-oriented, respectful of time.

### Aquarius

Independent, future-minded, unconventional, social, principled, oriented toward systems and change.

### Pisces

Imaginative, compassionate, porous, intuitive, romantic, oriented toward feeling and symbol.

## Feature opportunities

### Natal chart

Add richer interpretation cards using this stack:

```text
Planet meaning + sign color + house area + optional aspect note
```

Example UI labels:

- `What this planet describes`
- `How the sign colors it`
- `Where it shows up`
- `What aspects add`

### Twelve Houses

Add sign-on-cusp interpretations:

```text
natalHouseCuspInterpretation_{house}_{sign}
```

Example:

```text
Maison 10 — Cancer sur la cuspide
Your public role may be shaped by care, memory, protection, and emotional trust. You may be noticed for creating safety, preserving what matters, or bringing a human tone into ambitious spaces.
```

### Conversation Guide

Use planet emphasis as premium depth:

- Mercury: how to say it
- Moon: what helps them feel safe
- Venus: what feels warm or valued
- Mars: what helps conflict stay clean
- Saturn: what needs patience and respect

### Synastry

Use aspects as the “jewel” layer:

- Venus-Mars: attraction and momentum
- Moon-Mercury: emotional language
- Sun-Moon: identity and emotional rhythm
- Saturn-Venus: commitment, caution, maturity
- Uranus-Venus: surprise, space, novelty
- Neptune-Moon: empathy, projection, softness
- Pluto-Venus/Mars: intensity, vulnerability, power dynamics

## Writing rules for JUNO

Every interpretation should:

- use “may”, “can”, “often”, “tends to”, or “might”
- describe a pattern, not a fixed identity
- include a constructive reflection angle
- avoid medical, sexual, manipulative, violent, or fatalistic claims
- avoid “soulmate”, “destiny”, “guaranteed”, “must”, “always”, “never”
- stay useful for dating, friendship, and self-reflection

## Validation checklist

Before moving any of this into product/locales:

- No copied text from source pages.
- All 8 locales covered if user-facing.
- No `[missing "..."]` possible.
- No invented houses, degrees, or placements.
- Interpretations hidden if required birth time/place is missing.
- Equal House named where houses are shown.
- MC explained as separate from 10th-house cusp.
- Premium/free boundary clear.

