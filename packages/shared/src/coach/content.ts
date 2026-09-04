// Conversation Guide — the English content corpus.
//
// PROVENANCE. Every string in this file was written for JUNO. The feature was
// designed from `docs/conversation-coach-sign-concepts-2026-08.md`, which
// records only non-protectable general axes (element, modality, communication
// tempo, common relational tensions). No third-party text is reproduced,
// paraphrased closely, condensed, or reorganised here. The organising axis is
// deliberately the SITUATION the reader wants to move through — not any
// taxonomy of relational roles. See §12.4 of
// `docs/conversation-coach-feature-plan-2026-08.md`, which is normative.
//
// THIS FILE IMPORTS NOTHING, ON PURPOSE.
// `scripts/validate-coach-content.mjs` loads it with `await import()` and
// relies on Node's native TypeScript stripping (Node >= 22.18; CI pins 24).
// Type stripping does not resolve module specifiers, so a single runtime
// import here would break the validator. The shape is still fully
// type-checked — `./contract.ts` asserts it against the types in `./types.ts`
// at compile time.
//
// VOICE RULES (enforced by the validator, not just documented):
//   - Modal, never deterministic: may / often / can / tends to / usually.
//   - No promise of an outcome, no "soulmate", no "perfect match".
//   - Describe a RHYTHM, never a character verdict. No sign is difficult,
//     cold, toxic, or "meant for you".
//   - No clinical vocabulary. This is not therapy and must not read as it.
//   - Nothing whose purpose is to obtain a result by technique. Every card
//     must stay true if the other person reads it over the reader's shoulder.
//
// P0 SCOPE: English only. The long-form guidance deliberately does NOT live in
// `apps/mobile/locales/*.json`, because mobile locale parity is exact — eight
// files would each carry ~100 English strings and the debt would be invisible.
// The UI chrome around this corpus IS localised. See §7 of the plan for the
// migration path when translation is funded.

/** Shown under every card. Never collapsible, never dismissible. */
export const COACH_DISCLAIMER =
  'For reflection, not prediction. JUNO does not guarantee outcomes.';

/**
 * Per-situation framing. `intent` says what the reader is actually doing;
 * `reflect` turns the last word back onto the reader — never onto the other
 * person. That asymmetry is what separates a reflection guide from a script.
 */
export const COACH_SITUATION_FRAMES = {
  start: {
    intent:
      "You're opening a door, not making a case. One clear, specific sentence is usually enough.",
    reflect:
      'What were you actually hoping to hear back? Naming that to yourself first often changes the message.',
  },
  clarity: {
    intent:
      "You're asking for information, not for reassurance. Say what you want to know, and leave room for a real answer.",
    reflect:
      'Is it clarity you want, or a particular answer? Only one of those is a question.',
  },
  repair: {
    intent:
      "You're reopening a conversation, not relitigating it. Name your part, then ask rather than explain.",
    reflect:
      'Do you want to be understood, or to be agreed with? Only the first one can be repaired in a message.',
  },
  boundary: {
    intent:
      "You're stating a limit and keeping the connection. Both halves matter — a limit on its own can read as a verdict.",
    reflect:
      'Is this a boundary about you, or a request that they change? Naming which one it is often changes the wording.',
  },
  feelings: {
    intent:
      "You're naming something tender without asking the other person to manage it. Keep it true, simple, and yours.",
    reflect:
      'What part of the feeling belongs to you before they answer?',
  },
  plan: {
    intent:
      "You're turning interest into a real next step. A concrete option usually makes it easier to answer honestly.",
    reflect:
      'Are you offering a plan you can follow through on, or asking them to carry the shape of it?',
  },
  flirt: {
    intent:
      "You're adding warmth, not pressure. The line works best when it leaves room for them to smile or step back.",
    reflect:
      'Would this still feel kind if they showed it to a friend?',
  },
  slow: {
    intent:
      "You're reducing speed without disappearing. Say what is changing, and name what is still true if it is true.",
    reflect:
      'Are you slowing the pace to protect the connection, or to avoid saying a harder thing?',
  },
};

/**
 * Per-sign guidance plus one sendable line per situation.
 *
 * `rhythm` / `works` / `avoid` describe the energy, not the person.
 * `lines` are first drafts, not scripts — the UI always shows "change the
 * words so they're yours" underneath.
 */
export const COACH_SIGN_CONTENT = {
  aries: {
    rhythm:
      'Aries energy often moves first and asks later. Hesitation can read as disinterest rather than as politeness.',
    works:
      'Say the thing. One clear sentence with a real point in it usually travels further than three careful ones, and leaving them room to decide keeps it from landing as a demand.',
    avoid:
      'Long wind-ups tend to lose them. Hinting and hoping it registers, or testing whether they notice you are upset, can become a longer detour than simply saying so.',
    lines: {
      start:
        "I'll skip the build-up: I liked talking with you, and I'd like to do it again. Open to that?",
      clarity:
        "I'd rather ask than guess — where do you feel this is going?",
      repair:
        'That came out sharper than I meant it. Can we rewind a step?',
      boundary:
        "I want to be straight with you: I can't do this week. I'd still like to find a time that works.",
      feelings:
        'I like you, and I wanted to say it plainly instead of acting cooler than I feel.',
      plan:
        "Let's make this easy: a quick drink Thursday, and if it feels good we can stay longer.",
      flirt:
        'You have a way of making the room feel awake. I noticed.',
      slow:
        'I like the spark here, and I need to take the pace down a notch so I can stay present.',
    },
  },
  taurus: {
    rhythm:
      'Taurus energy tends to trust steadiness over urgency. Confidence here is often built by repetition rather than by intensity.',
    works:
      'Keep the pace calm and the plan simple. Something concrete that you can actually follow through on usually says more than an enthusiastic paragraph.',
    avoid:
      'Sudden changes of direction can unsettle more than they excite. Pushing for a fast decision, or promising something large and vague, may cost more trust than it wins.',
    lines: {
      start:
        'No big plan — just a quiet coffee somewhere you already like. Would that be good?',
      clarity:
        "I'd like to know where we stand, whenever you've had time to think about it.",
      repair:
        "I think I rushed you, and I'd rather slow down than push. Can we take that again?",
      boundary:
        "I need to keep this week light. It isn't a step back from you — it's just my week.",
      feelings:
        "I feel good around you in a way that feels steady, and I wanted you to know.",
      plan:
        'Would you like to choose a place we can actually settle into for a bit?',
      flirt:
        'You make ordinary things feel calmer and better than they should.',
      slow:
        "I like this, and I'd rather let it grow slowly than rush it into something brittle.",
    },
  },
  gemini: {
    rhythm:
      'Gemini energy often connects through curiosity. A good question can open more than a strong statement does.',
    works:
      'Keep it moving and keep it interesting. Humour, a sideways question, and room for spontaneity tend to land better than a fixed script.',
    avoid:
      'Repetition can flatten the exchange quickly. Asking for a firm answer early, or making things heavy before they have warmed up, may close the door you were opening.',
    lines: {
      start:
        "Random question: what's something you could talk about for an hour without getting bored?",
      clarity:
        "I like where this is going, and I'd rather name it than keep it vague. What are you thinking?",
      repair:
        'I think we talked past each other. Can I hear your version before I explain mine?',
      boundary:
        "I'm going to be quiet for a couple of days — that's my head, not you. Talk soon?",
      feelings:
        "I keep wanting to tell you little things from my day. That's usually a sign for me.",
      plan:
        'Want to pick one small adventure this week and leave the rest open?',
      flirt:
        'Talking with you is dangerously easy, in the best possible way.',
      slow:
        "I like the momentum, and I need a little space so I don't turn it into noise.",
    },
  },
  cancer: {
    rhythm:
      'Cancer energy often opens sideways. Warmth tends to arrive before information, and trust well after both.',
    works:
      'Say what you enjoyed, specifically. A small true detail can do more than a large compliment, and leaving the door open usually works better than asking them to walk through it now.',
    avoid:
      "Clipped replies can read as coldness even when they aren't meant that way. Teasing before you know how it lands, or treating a slow answer as a verdict, may close something that was only just opening.",
    lines: {
      start:
        "I keep thinking about what you said about your grandmother's kitchen. It stayed with me.",
      clarity:
        "I'd rather ask than assume: how are you feeling about this so far?",
      repair:
        "I think I read that wrong, and I'd rather fix it than let it sit. What did you actually mean?",
      boundary:
        "I need a slower week, and I want you to know it isn't about you. I'd still like to see you Sunday.",
      feelings:
        'I feel close to you in small moments, and I wanted to say that gently.',
      plan:
        'Would a quiet evening feel good this week, something simple with room to talk?',
      flirt:
        'There is something about your softness that keeps staying with me.',
      slow:
        "I care about this, and I need to move slowly enough that it still feels safe.",
    },
  },
  leo: {
    rhythm:
      'Leo energy tends to respond to being genuinely seen. Warmth offered openly is often returned in kind.',
    works:
      'Be specific about what you appreciated. Recognition usually lands better when it names an actual thing rather than a general quality.',
    avoid:
      'A lukewarm response can register as dismissal. Correcting them in front of other people, or treating their generosity as ordinary, may cost more than the point was worth.',
    lines: {
      start:
        "I liked how alive the conversation felt with you. I'd like more of that — free this week?",
      clarity:
        "I don't want to play this cool. I like you, and I'd like to know where you're at.",
      repair:
        "I think I was careless with something that mattered to you, and I'd like to make it right.",
      boundary:
        'I care about this, and I also need a quieter week. Both are true — could we plan for next week instead?',
      feelings:
        "I like you, and I don't want to hide that behind being casual.",
      plan:
        "I want to plan something that actually feels fun for both of us. What's your kind of night?",
      flirt:
        'You have a bright way of being that is hard not to notice.',
      slow:
        "I like the warmth here, and I need to slow the pace without dimming it.",
    },
  },
  virgo: {
    rhythm:
      'Virgo energy often shows care through usefulness. Attention to one small detail can mean more than a grand gesture.',
    works:
      'Be clear and concrete. A well-defined plan, and room for their questions, tends to build more trust than enthusiasm on its own.',
    avoid:
      'Vagueness can feel like carelessness here. Taking their questions as criticism, or asking them to open up before they are ready, may create the distance you were trying to close.',
    lines: {
      start:
        'Low-pressure idea: coffee at that quiet place you mentioned. Would that work this week?',
      clarity:
        "I'd like to check in rather than guess. Where do you think we are?",
      repair:
        "I got that wrong, and I'd rather say so than explain it away. Can we start over on it?",
      boundary:
        "I can't make evenings work this week. I'd still like to — could we look at the weekend?",
      feelings:
        'I feel more comfortable with you than I expected, and I wanted to name that clearly.',
      plan:
        'I can do Friday after 7 or Sunday afternoon. Would either of those work for you?',
      flirt:
        'I like how carefully you notice things. It makes me want to pay attention too.',
      slow:
        "I like where this is going, and I need to slow down enough to stay honest with it.",
    },
  },
  libra: {
    rhythm:
      'Libra energy often looks for balance in a conversation. An invitation tends to land better than a request that feels like pressure.',
    works:
      'Keep the tone even and name both sides. Making it easy to say yes, and equally easy to say no, usually keeps the exchange comfortable.',
    avoid:
      'Forcing a quick choice can create pressure rather than clarity. Turning a disagreement into a contest, or leaving something unfair unnamed, may close the room you were trying to keep open.',
    lines: {
      start:
        'I enjoyed that conversation more than I expected. Would you be up for continuing it over coffee?',
      clarity:
        "I'd like to understand where we both are — no pressure to have a tidy answer.",
      repair:
        "I'd like to understand both sides of what happened, without either of us being the villain. Can we talk?",
      boundary:
        "I need to say no to this one, and I'd rather say it plainly than go quiet. I'd still like to see you.",
      feelings:
        "I like you, and I'm saying it because I would rather be clear than elegant.",
      plan:
        "Would you like to make a plan that feels easy for both of us, not squeezed in?",
      flirt:
        'You make conversation feel lighter without making it shallow.',
      slow:
        "I like this, and I need the pace to feel mutual rather than automatic.",
    },
  },
  scorpio: {
    rhythm:
      'Scorpio energy often reads sincerity before content. Depth here tends to be earned rather than requested.',
    works:
      'Be honest and unhurried. Saying less and meaning it usually builds more trust than saying more to impress.',
    avoid:
      'A half-truth can be felt long before it is proven. Pushing for a confession, or using lightness to dodge a real subject, may read as evasion rather than as ease.',
    lines: {
      start:
        "I'd rather be honest than clever: I liked talking with you, and I'd like to again.",
      clarity:
        "I don't want to guess or play it cool. Where do we actually stand?",
      repair:
        "I wasn't fully straight with you, and I'd rather own that than smooth it over.",
      boundary:
        "There's a line here I need to hold. It's mine, and it isn't a judgement of you.",
      feelings:
        "I feel something real here, and I'd rather say it simply than dress it up.",
      plan:
        "I'd like to see you somewhere quiet enough that we can actually talk.",
      flirt:
        'You have a presence that makes small talk feel unnecessary.',
      slow:
        "I like the depth here, and I need to move at a pace where trust can keep up.",
    },
  },
  sagittarius: {
    rhythm:
      "Sagittarius energy often responds to openness. Honesty tends to land better when it doesn't arrive as a constraint.",
    works:
      'Be direct without making it heavy. An idea that opens something up, or a plan with movement in it, usually gets a warmer answer.',
    avoid:
      'An implied expectation can feel like a fence. Circling only around the problem, or asking for certainty early, may create the very distance you were hoping to close.',
    lines: {
      start:
        'No pressure at all — want to try somewhere neither of us has been this week?',
      clarity:
        "I'd rather ask straight out than wonder: what is this, for you?",
      repair:
        'I think I made that heavier than it needed to be. Can we reset?',
      boundary:
        "I need some room this week. It isn't a retreat — I'd just rather say it than go quiet.",
      feelings:
        "I like being around you, and I wanted to say it without making it heavy.",
      plan:
        "Want to do something with a little movement in it, then see where the night goes?",
      flirt:
        'You make me curious, which is my favorite kind of trouble.',
      slow:
        "I like this, and I need a little room around it so it keeps feeling free.",
    },
  },
  capricorn: {
    rhythm:
      "Capricorn energy tends to trust what's demonstrated over what's declared. Interest can read as reliability more than as intensity.",
    works:
      'Be concrete and follow through. A real suggestion with a real time in it usually says more than an enthusiastic paragraph, and small kept promises tend to count double.',
    avoid:
      'A large promise with no next step can wear thin quickly. Rearranging plans twice, or reading their reserve as disinterest too early, may cost you the read you were forming.',
    lines: {
      start:
        "I'd like to see you again. Thursday or Sunday both work for me — is either easier?",
      clarity:
        "I'd like to know what you're thinking, whenever it suits. I'd rather have the real answer than a comfortable one.",
      repair:
        "I dropped that, and I'd rather name it than let it pass. Can I make it up on Sunday?",
      boundary:
        "I need slower evenings this week — it's about my capacity, not about you. Sunday still stands if you want it.",
      feelings:
        "I don't say this lightly: I like you, and I respect what this could become.",
      plan:
        'I can make Thursday work if we choose a time now. Would 7 be realistic?',
      flirt:
        'There is something quietly impressive about you, and I keep noticing it.',
      slow:
        "I value this enough to not rush it. I'd rather move carefully than carelessly.",
    },
  },
  aquarius: {
    rhythm:
      'Aquarius energy often needs air in a conversation. Interest tends to land better when it feels chosen rather than assigned.',
    works:
      'Be genuine, and be willing to be unconventional. Curiosity about how they think, plus room to answer in their own time, usually works better than pressure.',
    avoid:
      'Defining things early can feel like a cage. Reading a need for space as rejection, or asking for a calibrated emotional response, may produce exactly the distance you feared.',
    lines: {
      start:
        'I like how your mind works. Want to trade strange theories over coffee sometime?',
      clarity:
        "No agenda behind this — I'd just like to know how you're thinking about us.",
      repair:
        "I think I crowded you. I'd rather say that than pretend I didn't notice.",
      boundary:
        "I need a few days on my own. Nothing is wrong — it's just how I reset.",
      feelings:
        "I like the way your mind meets mine, and that's not a small thing for me.",
      plan:
        'Want to do something a little odd and low-pressure this week?',
      flirt:
        'You are interesting in a way that makes normal flirting feel underqualified.',
      slow:
        "I like the connection, and I need enough space around it to keep choosing it freely.",
    },
  },
  pisces: {
    rhythm:
      'Pisces energy often reads tone before words. Clarity tends to land best when it arrives gently.',
    works:
      'Be kind and be specific. Leaving space for feeling, and saying the true thing softly, usually works better than either bluntness or vagueness.',
    avoid:
      'Irony can land harder than intended here. Cool distance, or a limit delivered as a punishment, may hurt more than the thing you were trying to address.',
    lines: {
      start:
        "That conversation stayed with me. I'd like to keep going, if you would.",
      clarity:
        'I want to be honest and I want to be kind: where are you with this?',
      repair:
        'I think something got lost between us. Can I ask what it felt like from your side?',
      boundary:
        "I want to be honest without being cold: I can't do this week. I'd still like to see you soon.",
      feelings:
        'I feel tender about this, and I wanted to say it without asking you to fix it.',
      plan:
        'Would something quiet and unhurried feel good to you this week?',
      flirt:
        'You have a softness that makes the world feel a little less loud.',
      slow:
        "I like this, and I need to slow down so I don't disappear into the feeling.",
    },
  },
};
