// Tarot — the English corpus. 78 names, 312 meanings.
//
// PROVENANCE. Every meaning in this file was written for JUNO. The card NAMES
// are the traditional English titles of the 78-card tarot structure (Rider-
// Waite-Smith, 1909, long in the public domain); they are the deck's shared
// vocabulary, not anyone's copyrightable prose. None of the interpretations
// are reproduced, condensed, paraphrased or reorganised from a published
// source. The organising axis is what a reader might NOTICE about themselves,
// which is why the same card reads differently in the love and general lenses.
//
// THIS FILE IMPORTS NOTHING BUT TYPES, ON PURPOSE. `validate-tarot-content.mjs`
// loads it with `await import()` under Node's type stripping, which erases
// `import type` but does not resolve extensionless runtime specifiers. A single
// runtime import here breaks the validator, and the validator is the only thing
// standing between this corpus and a card that says nothing.
//
// VOICE. Tarot in JUNO is a reflection surface, not a forecast. Cards describe
// a pattern the reader might recognise; they do not report events. So the
// grammar here is deliberately hedged — "may", "can", "often", "tends to",
// "notice", "worth asking" — and the vocabulary excludes prediction
// ("will happen", "guaranteed"), fatalism ("destined", "fate", "inevitable",
// "bad luck"), clinical and pop-clinical labels ("toxic"), instruction
// ("you must"), and absolutes ("never"). `validate-tarot-content.mjs` fails
// the build on any of them, which is what keeps the voice from drifting one
// well-meaning edit at a time. It is also what keeps the feature reviewable:
// an app that tells a stranger their relationship is doomed is an App Store
// problem before it is an editorial one.
//
// The reversed meanings are the part most corpora get wrong. A reversal here
// is never a punishment or a worse version of the card — it is the same theme
// seen from its underside, and it is written so a reader finding it can do
// something with it.
import type { TarotCorpus } from './types';

export const NAMES_EN: TarotCorpus['names'] = {
  'major-00': 'The Fool',
  'major-01': 'The Magician',
  'major-02': 'The High Priestess',
  'major-03': 'The Empress',
  'major-04': 'The Emperor',
  'major-05': 'The Hierophant',
  'major-06': 'The Lovers',
  'major-07': 'The Chariot',
  'major-08': 'Strength',
  'major-09': 'The Hermit',
  'major-10': 'Wheel of Fortune',
  'major-11': 'Justice',
  'major-12': 'The Hanged Man',
  'major-13': 'Death',
  'major-14': 'Temperance',
  'major-15': 'The Devil',
  'major-16': 'The Tower',
  'major-17': 'The Star',
  'major-18': 'The Moon',
  'major-19': 'The Sun',
  'major-20': 'Judgement',
  'major-21': 'The World',

  'cups-01': 'Ace of Cups',
  'cups-02': 'Two of Cups',
  'cups-03': 'Three of Cups',
  'cups-04': 'Four of Cups',
  'cups-05': 'Five of Cups',
  'cups-06': 'Six of Cups',
  'cups-07': 'Seven of Cups',
  'cups-08': 'Eight of Cups',
  'cups-09': 'Nine of Cups',
  'cups-10': 'Ten of Cups',
  'cups-11': 'Page of Cups',
  'cups-12': 'Knight of Cups',
  'cups-13': 'Queen of Cups',
  'cups-14': 'King of Cups',

  'wands-01': 'Ace of Wands',
  'wands-02': 'Two of Wands',
  'wands-03': 'Three of Wands',
  'wands-04': 'Four of Wands',
  'wands-05': 'Five of Wands',
  'wands-06': 'Six of Wands',
  'wands-07': 'Seven of Wands',
  'wands-08': 'Eight of Wands',
  'wands-09': 'Nine of Wands',
  'wands-10': 'Ten of Wands',
  'wands-11': 'Page of Wands',
  'wands-12': 'Knight of Wands',
  'wands-13': 'Queen of Wands',
  'wands-14': 'King of Wands',

  'swords-01': 'Ace of Swords',
  'swords-02': 'Two of Swords',
  'swords-03': 'Three of Swords',
  'swords-04': 'Four of Swords',
  'swords-05': 'Five of Swords',
  'swords-06': 'Six of Swords',
  'swords-07': 'Seven of Swords',
  'swords-08': 'Eight of Swords',
  'swords-09': 'Nine of Swords',
  'swords-10': 'Ten of Swords',
  'swords-11': 'Page of Swords',
  'swords-12': 'Knight of Swords',
  'swords-13': 'Queen of Swords',
  'swords-14': 'King of Swords',

  'pents-01': 'Ace of Pentacles',
  'pents-02': 'Two of Pentacles',
  'pents-03': 'Three of Pentacles',
  'pents-04': 'Four of Pentacles',
  'pents-05': 'Five of Pentacles',
  'pents-06': 'Six of Pentacles',
  'pents-07': 'Seven of Pentacles',
  'pents-08': 'Eight of Pentacles',
  'pents-09': 'Nine of Pentacles',
  'pents-10': 'Ten of Pentacles',
  'pents-11': 'Page of Pentacles',
  'pents-12': 'Knight of Pentacles',
  'pents-13': 'Queen of Pentacles',
  'pents-14': 'King of Pentacles',
};

export const MEANINGS_EN: TarotCorpus['meanings'] = {
  // ---------------------------------------------------------------- majors
  'major-00': {
    love: {
      upright: "Something here is unproven, and that may be the point. Beginning without certainty is its own kind of courage.",
      reversed: "A leap can be avoidance wearing good clothes. Worth asking what you would be stepping away from, not only what you would be stepping toward.",
    },
    general: {
      upright: "A beginning with no map yet. Not knowing the shape of it is normal at this stage, and often necessary.",
      reversed: "Either the leap is rushed or the hesitation has outlived its usefulness. Notice which one this actually is.",
    },
  },
  'major-01': {
    love: {
      upright: "You have more to work with here than you are counting. Attention, honesty and timing are usually the whole toolkit.",
      reversed: "A gap may be opening between what is shown and what is meant — yours or theirs. Easier to name now than later.",
    },
    general: {
      upright: "The pieces are already in your hands. This card is about using them rather than gathering more.",
      reversed: "Capability without direction, or a story told more convincingly than it is lived. Worth checking which.",
    },
  },
  'major-02': {
    love: {
      upright: "Something is understood here without being said. Trust the reading, and consider saying it out loud anyway.",
      reversed: "You may be talking yourself out of something you already sense. The quiet signal is information too.",
    },
    general: {
      upright: "The answer is closer to intuition than analysis right now. Give it a quiet room.",
      reversed: "Noise has crowded out the inner read. Less input, not more, tends to help here.",
    },
  },
  'major-03': {
    love: {
      upright: "Warmth and care, and being fed by a connection rather than drained by it. Notice what actually nourishes.",
      reversed: "Giving may have tipped past generosity into self-erasure. Care that empties you is hard to sustain.",
    },
    general: {
      upright: "Growth, comfort and creative fullness. Let something be enjoyed rather than optimised.",
      reversed: "Depletion, or a creative block that is really a rest deficit. Refill before pushing.",
    },
  },
  'major-04': {
    love: {
      upright: "Structure makes room for softness. Clear agreements often let a connection relax.",
      reversed: "Control can pose as stability. Where has the structure stopped serving the people inside it?",
    },
    general: {
      upright: "Boundaries, order and follow-through. A frame built now can hold weight later.",
      reversed: "Rigidity, or the absence of any frame at all. Both leave you carrying more than you should.",
    },
  },
  'major-05': {
    love: {
      upright: "Shared values, and inherited scripts about how love is supposed to look. Some of them are worth keeping.",
      reversed: "A rule you did not choose may be running things. It can be examined.",
    },
    general: {
      upright: "Tradition, mentorship, and the wisdom of a path already walked. Borrowing is allowed.",
      reversed: "The convention no longer fits. Departing from it is a choice, not a failure.",
    },
  },
  'major-06': {
    love: {
      upright: "Alignment — of values as much as attraction. What you agree about matters as much as what you feel.",
      reversed: "A pull in two directions, or values quietly out of step. Naming the mismatch is kinder than working around it.",
    },
    general: {
      upright: "A choice that asks who you actually are, not only what you want.",
      reversed: "A decision made to avoid discomfort tends to come back. Worth looking at what is being dodged.",
    },
  },
  'major-07': {
    love: {
      upright: "Moving toward what you want with your eyes open. Direction matters more than intensity here.",
      reversed: "Effort without agreement is pushing rather than pursuing. Worth checking you are both going the same way.",
    },
    general: {
      upright: "Momentum and focus. The obstacle is usually attention, not ability.",
      reversed: "Scattered energy, or force applied where patience would do more.",
    },
  },
  'major-08': {
    love: {
      upright: "Steadiness without hardness. Staying gentle under pressure is the harder and better skill.",
      reversed: "Self-doubt may be doing the talking. It tends to overstate the danger.",
    },
    general: {
      upright: "Courage that looks quiet from the outside. Patience is part of it.",
      reversed: "Depleted patience, or force where softness would have worked. Rest is not a detour.",
    },
  },
  'major-09': {
    love: {
      upright: "Distance can be clarifying. Knowing what you want alone tends to make you clearer with someone else.",
      reversed: "Solitude may have curdled into avoidance. Notice the difference between choosing space and hiding in it.",
    },
    general: {
      upright: "A step back to hear yourself. The answer often arrives in the quiet.",
      reversed: "Isolation past its usefulness. One conversation may do more than another week of thinking.",
    },
  },
  'major-10': {
    love: {
      upright: "A turn in the pattern. Something may be shifting that you did not arrange, and meeting it tends to cost less than bracing against it.",
      reversed: "The timing feels off. Patience often costs less here than pushing.",
    },
    general: {
      upright: "Cycles and turning points. A shift may be asking for your attention rather than your resistance.",
      reversed: "Resisting a change you can already feel. This phase moves; notice what it is showing you.",
    },
  },
  'major-11': {
    love: {
      upright: "Fairness, and the relief of being straight with each other. Honesty tends to steady a bond.",
      reversed: "An imbalance neither of you has said out loud. It rarely settles on its own.",
    },
    general: {
      upright: "Accountability and clear seeing. Weigh it honestly, including your own part.",
      reversed: "Avoiding a consequence, or judging a situation on incomplete information.",
    },
  },
  'major-12': {
    love: {
      upright: "A pause that changes the angle. Not acting is sometimes the most useful thing available.",
      reversed: "Stalling dressed up as patience. Worth asking what the waiting is protecting you from.",
    },
    general: {
      upright: "Suspension, and a shift in perspective. The view is genuinely different from here.",
      reversed: "Stuck rather than still. A sacrifice that helps no one can be put down.",
    },
  },
  'major-13': {
    love: {
      upright: "An ending that makes room. What closes here was probably already finished.",
      reversed: "Holding on past the point where it helps. Letting go is a slow skill.",
    },
    general: {
      upright: "Transformation through release. Something completes so something else can start.",
      reversed: "Resisting a change already underway. The delay often costs more than the change would.",
    },
  },
  'major-14': {
    love: {
      upright: "Proportion. Neither too much nor too withheld — the middle is doing real work here.",
      reversed: "Extremes, or a blend that has not found its ratio yet. Adjust slowly.",
    },
    general: {
      upright: "Balance and patience. Combining opposites takes time, and it is going fine.",
      reversed: "Overcorrection in one direction. Small adjustments tend to beat dramatic ones.",
    },
  },
  'major-15': {
    love: {
      upright: "Intensity and attachment, and the question of what keeps you here. Pull is not the same as fit.",
      reversed: "A pattern loosening its hold. Seeing the mechanism is most of the work.",
    },
    general: {
      upright: "What binds you — habit, comfort, appetite. Look at the shape of it without shame.",
      reversed: "Loosening a hold you have been under. Freedom here tends to arrive gradually.",
    },
  },
  'major-16': {
    love: {
      upright: "A sudden clarity that rearranges things. Uncomfortable, and it may clear space for honesty.",
      reversed: "Avoiding a break that has been building. Truth tends to surface when it is ready, not before.",
    },
    general: {
      upright: "A structure gives way and reveals what it was holding up. Collapse can be information.",
      reversed: "Postponing a change that wants to happen. The delay is its own decision.",
    },
  },
  'major-17': {
    love: {
      upright: "Hope that has recovered its footing. Something gentle is being rebuilt.",
      reversed: "Faith running low. It tends to return, usually quietly and not on schedule.",
    },
    general: {
      upright: "Replenishment and clarity after strain. Keep going gently.",
      reversed: "Discouragement. Worth naming rather than performing optimism over.",
    },
  },
  'major-18': {
    love: {
      upright: "Not everything here is visible yet. Some of what you feel may be memory rather than the present.",
      reversed: "Fog lifting. What frightened you may look smaller in daylight.",
    },
    general: {
      upright: "Uncertainty and projection. Hold conclusions loosely for now.",
      reversed: "Clarity emerging. Worth separating what was fear from what was fact.",
    },
  },
  'major-19': {
    love: {
      upright: "Warmth without effort. Being seen and liking it — worth enjoying rather than analysing.",
      reversed: "Brightness dimmed, or expectation doing the work joy should. It passes.",
    },
    general: {
      upright: "Vitality and plain good feeling. Let it be simple.",
      reversed: "A temporary flatness. Not a verdict on anything.",
    },
  },
  'major-20': {
    love: {
      upright: "A reckoning with a pattern, and the chance to answer it differently this time.",
      reversed: "Replaying an old verdict on yourself. The evidence may be out of date.",
    },
    general: {
      upright: "Awakening and honest review. What have you actually learned?",
      reversed: "Self-criticism standing in for reflection. They are not the same activity.",
    },
  },
  'major-21': {
    love: {
      upright: "A sense of completeness — a cycle closing well rather than dramatically.",
      reversed: "Almost finished. The last step tends to be the one that is easiest to skip.",
    },
    general: {
      upright: "Wholeness, and a chapter reaching its end. Worth marking before starting the next.",
      reversed: "A loose end keeping the door open. It can be closed deliberately.",
    },
  },

  // ------------------------------------------------------------------ cups
  'cups-01': {
    love: {
      upright: "A feeling opening up, still new and a little unguarded. Let it be tender.",
      reversed: "Feeling held back, possibly for good reason. Notice what makes it hard to open.",
    },
    general: {
      upright: "An emotional beginning. Something wants to be felt before it is understood.",
      reversed: "Blocked feeling, or a cup you are keeping covered. It keeps.",
    },
  },
  'cups-02': {
    love: {
      upright: "Mutual recognition. Two people meeting each other rather than an idea of each other.",
      reversed: "One side may be carrying more of the connection. Worth saying out loud.",
    },
    general: {
      upright: "Partnership on equal footing. Reciprocity is the theme.",
      reversed: "An exchange out of balance. Naming it usually helps more than compensating for it.",
    },
  },
  'cups-03': {
    love: {
      upright: "Love in company — friends, celebration, being glad together.",
      reversed: "Too much noise around the connection, or a circle you have drifted from.",
    },
    general: {
      upright: "Community and shared joy. Being among people is the point.",
      reversed: "Overextended socially, or quietly outside the circle. Both are worth noticing.",
    },
  },
  'cups-04': {
    love: {
      upright: "A flatness where interest used to be. Something may be in front of you, unregistered.",
      reversed: "Interest returning after a dull stretch. Worth looking up.",
    },
    general: {
      upright: "Contemplation edging into apathy. Worth asking what stopped landing.",
      reversed: "Appetite coming back. The pause did its work.",
    },
  },
  'cups-05': {
    love: {
      upright: "Grief for what did not happen. What remains is easy to overlook while you are looking at what spilled.",
      reversed: "Turning toward what is still standing. Slow, and real.",
    },
    general: {
      upright: "Loss and disappointment. Give it room, then count what is left.",
      reversed: "Acceptance beginning. Not resolution, but movement.",
    },
  },
  'cups-06': {
    love: {
      upright: "Sweetness with a memory in it. The past can be warm without being where you live.",
      reversed: "Nostalgia doing more work than the present. Compare gently.",
    },
    general: {
      upright: "Memory, innocence, a kindness returned. Let it be simple.",
      reversed: "An idealised past crowding out what is here.",
    },
  },
  'cups-07': {
    love: {
      upright: "Many possibilities, not all of them real. Choose something you can actually touch.",
      reversed: "Clarity after a stretch of imagining. One option is becoming the option.",
    },
    general: {
      upright: "Options and fantasy. Ground one of them before choosing.",
      reversed: "Focus arriving. The fog was doing something for you — worth noticing what.",
    },
  },
  'cups-08': {
    love: {
      upright: "Walking away from something that no longer feeds you. Brave, and often quiet.",
      reversed: "Staying past your own knowing. Worth asking honestly what leaving would cost.",
    },
    general: {
      upright: "Leaving something incomplete because it is not yours to finish.",
      reversed: "Drifting rather than deciding. A direction would help.",
    },
  },
  'cups-09': {
    love: {
      upright: "Contentment. Wanting what you have is its own achievement.",
      reversed: "Satisfaction on the surface with something unmet underneath.",
    },
    general: {
      upright: "A wish met. Enjoy it before moving the goalpost.",
      reversed: "Having a lot and feeling little. Worth investigating rather than fixing.",
    },
  },
  'cups-10': {
    love: {
      upright: "Belonging, and the ordinary happiness that does not photograph well.",
      reversed: "A gap between the picture and the feeling. Worth saying the quiet part.",
    },
    general: {
      upright: "Harmony at home and among your people. This is the good part.",
      reversed: "Friction under a settled surface. Small, and not nothing.",
    },
  },
  'cups-11': {
    love: {
      upright: "A tender, unpolished message or gesture. Sincerity tends to beat smoothness.",
      reversed: "Feeling running ahead of what has actually happened. Let it catch up.",
    },
    general: {
      upright: "Curiosity and a creative nudge. Follow it without a plan.",
      reversed: "Sensitivity with nowhere to put it. Worth making something.",
    },
  },
  'cups-12': {
    love: {
      upright: "Romantic momentum — someone leading with feeling, and reading as sincere.",
      reversed: "Charm outpacing substance, or an idea of love larger than the person.",
    },
    general: {
      upright: "Following your heart somewhere. Keep one eye open.",
      reversed: "Mood steering the wheel. A day's distance may help.",
    },
  },
  'cups-13': {
    love: {
      upright: "Emotional steadiness — someone who can hold feeling without being swept by it.",
      reversed: "Absorbing everyone's weather. Boundaries are a form of care.",
    },
    general: {
      upright: "Compassion and depth. Feeling and thinking are cooperating.",
      reversed: "Merged with other people's states. Where do you end?",
    },
  },
  'cups-14': {
    love: {
      upright: "Warmth with a keel. Feeling expressed without flooding anyone.",
      reversed: "Calm on the surface, unspoken underneath. Composure is not the same as honesty.",
    },
    general: {
      upright: "Emotional maturity and diplomacy. You can hold this.",
      reversed: "Feeling managed rather than felt. It tends to come out somewhere.",
    },
  },

  // ----------------------------------------------------------------- wands
  'wands-01': {
    love: {
      upright: "A spark — early, energetic, and not yet a story.",
      reversed: "Energy stalled or misfired. Waiting for a real one costs little.",
    },
    general: {
      upright: "Inspiration arriving. Start before it is fully formed.",
      reversed: "A false start, or motivation that has not found its object.",
    },
  },
  'wands-02': {
    love: {
      upright: "Considering a bigger version of your life, and whether someone is in it.",
      reversed: "Hesitating at the edge of a decision. The map is unlikely to get more certain.",
    },
    general: {
      upright: "Planning with real ambition. Choose the direction, not just the wish.",
      reversed: "Playing small, or planning as a substitute for starting.",
    },
  },
  'wands-03': {
    love: {
      upright: "Widening horizons. Love with room in it.",
      reversed: "Plans delayed. The wait may be doing something useful.",
    },
    general: {
      upright: "Progress you can see from here. Keep going.",
      reversed: "Foresight in short supply. Worth looking further than the next step.",
    },
  },
  'wands-04': {
    love: {
      upright: "A milestone worth marking — stability that feels like celebration.",
      reversed: "Home feels unsettled. Small repairs tend to matter more than big gestures.",
    },
    general: {
      upright: "Arrival, homecoming, a good moment among people.",
      reversed: "Foundations wobbling. Worth attending to the base.",
    },
  },
  'wands-05': {
    love: {
      upright: "Friction, and not necessarily the bad kind. Difference tests a bond honestly.",
      reversed: "Conflict avoided rather than resolved. It waits.",
    },
    general: {
      upright: "Competition and clashing views. Useful while it stays about the work.",
      reversed: "Tension held internally. Some of it could come out.",
    },
  },
  'wands-06': {
    love: {
      upright: "Being chosen, publicly or quietly. Let it land.",
      reversed: "Needing recognition more than connection. Worth noticing the hunger.",
    },
    general: {
      upright: "Recognition earned. Take the win properly.",
      reversed: "A win that did not satisfy, or one you are still waiting for.",
    },
  },
  'wands-07': {
    love: {
      upright: "Holding your position. Some things are worth defending calmly.",
      reversed: "Defending out of habit. Worth checking whether anyone is actually attacking.",
    },
    general: {
      upright: "Standing your ground under pressure. You have the higher position.",
      reversed: "Worn down by holding on. Consider which of these are yours to fight.",
    },
  },
  'wands-08': {
    love: {
      upright: "Things moving quickly. Enjoy the pace without mistaking it for depth.",
      reversed: "Messages crossed, momentum stalled. Slower and plainer tends to help.",
    },
    general: {
      upright: "Rapid movement. Ride it while it is here.",
      reversed: "Scattered speed. One thing at a time.",
    },
  },
  'wands-09': {
    love: {
      upright: "Tired and still here. Resilience is unglamorous and real.",
      reversed: "Guardedness outliving the threat. Worth asking what you are still bracing for.",
    },
    general: {
      upright: "Nearly through, and worn. Rest counts as strategy.",
      reversed: "Defensive without needing to be. Something can be put down.",
    },
  },
  'wands-10': {
    love: {
      upright: "Carrying more of the relationship than you have admitted. The weight can be shared.",
      reversed: "Setting something down. Relief may arrive slowly.",
    },
    general: {
      upright: "Overloaded. Some of this belongs to someone else.",
      reversed: "Delegating, or dropping what is not yours. Good.",
    },
  },
  'wands-11': {
    love: {
      upright: "Enthusiasm, news, someone keen. Let it be light.",
      reversed: "Interest that fizzles fast. Not everything has to become more.",
    },
    general: {
      upright: "Exploration and appetite. Follow the curiosity.",
      reversed: "Impatience with the slow part. That part is the work.",
    },
  },
  'wands-12': {
    love: {
      upright: "Passion with movement. Exciting, and worth watching for staying power.",
      reversed: "Heat without follow-through. Worth noticing the pattern before investing.",
    },
    general: {
      upright: "Bold action and momentum. Go, and steer.",
      reversed: "Impulsiveness. A day's delay costs little.",
    },
  },
  'wands-13': {
    love: {
      upright: "Confident warmth. Attractive partly because it is not performing.",
      reversed: "Insecurity showing up as intensity. Be gentle with yourself.",
    },
    general: {
      upright: "Vitality and self-possession. You know what you are about.",
      reversed: "Comparison draining the fire. Worth coming back to your own work.",
    },
  },
  'wands-14': {
    love: {
      upright: "Vision and generosity. Someone who makes room for your ambition.",
      reversed: "Expectation delivered as instruction. Asking works better.",
    },
    general: {
      upright: "Leadership with a long view. People follow this.",
      reversed: "Directing more than listening. The plan improves with input.",
    },
  },

  // ---------------------------------------------------------------- swords
  'swords-01': {
    love: {
      upright: "A clear thought about what you actually want. Say it simply.",
      reversed: "Clarity used as a blade, or confusion posing as nuance.",
    },
    general: {
      upright: "A breakthrough in understanding. Worth writing down.",
      reversed: "Sharp thinking, badly aimed. Slow the delivery.",
    },
  },
  'swords-02': {
    love: {
      upright: "A decision being avoided by keeping both options open.",
      reversed: "Information arriving. The choice is getting easier to see.",
    },
    general: {
      upright: "Stalemate. You may know more than you are admitting.",
      reversed: "Too much input. Decide with what you have.",
    },
  },
  'swords-03': {
    love: {
      upright: "Hurt, plainly. Naming it accurately is the beginning of it easing.",
      reversed: "The sharp edge dulling. Healing is not linear, and it is happening.",
    },
    general: {
      upright: "Painful clarity. It hurts because it is true, not because it is final.",
      reversed: "Recovery underway. Be unhurried about it.",
    },
  },
  'swords-04': {
    love: {
      upright: "Rest from relating. Withdrawal that restores rather than punishes.",
      reversed: "Back too soon. The pause was not finished.",
    },
    general: {
      upright: "Recovery and quiet. Nothing has to be decided today.",
      reversed: "Restlessness where rest belongs.",
    },
  },
  'swords-05': {
    love: {
      upright: "Winning an argument and losing something. Worth counting the whole cost.",
      reversed: "Repair becoming possible. Someone has to move first.",
    },
    general: {
      upright: "A hollow victory, or a fight not worth its price.",
      reversed: "Making amends, or walking away without a last word.",
    },
  },
  'swords-06': {
    love: {
      upright: "Moving toward calmer water. Bring less with you than you think you need.",
      reversed: "Still carrying the old weather. It travels.",
    },
    general: {
      upright: "Transition. The hard part is mostly behind.",
      reversed: "Circling the same ground. What keeps you here?",
    },
  },
  'swords-07': {
    love: {
      upright: "Something withheld — yours or theirs. Partial truth has a cost.",
      reversed: "Coming clean. Uncomfortable, then lighter.",
    },
    general: {
      upright: "Strategy shading into evasion. Worth checking your own footing.",
      reversed: "Truth surfacing. Meeting it beats managing it.",
    },
  },
  'swords-08': {
    love: {
      upright: "Feeling stuck. The restriction may be more mental than actual.",
      reversed: "A limit loosening. One small move is enough to test it.",
    },
    general: {
      upright: "Trapped by a story about your options. It can be tested.",
      reversed: "Perspective returning. There was a door.",
    },
  },
  'swords-09': {
    love: {
      upright: "Worry at three in the morning. It exaggerates — that is what it does.",
      reversed: "The worst of it passing. Daylight helps.",
    },
    general: {
      upright: "Anxiety with the volume up. Naming it lowers it a little.",
      reversed: "Relief arriving. Be kind about how long it took.",
    },
  },
  'swords-10': {
    love: {
      upright: "A painful ending. Rock bottom is also a floor you can build from.",
      reversed: "Slow improvement. The recovery is less dramatic than the ending was.",
    },
    general: {
      upright: "Something finishes hard. It is finished, which is its own mercy.",
      reversed: "Getting up. Gradual counts.",
    },
  },
  'swords-11': {
    love: {
      upright: "Curiosity and questions. Honest ones open more than clever ones.",
      reversed: "Watching rather than asking. Saying it works better.",
    },
    general: {
      upright: "Alertness and new information. Stay curious.",
      reversed: "Talk outrunning action, or too much of it second-hand.",
    },
  },
  'swords-12': {
    love: {
      upright: "Direct and fast. Refreshing, as long as it is not careless.",
      reversed: "Words landing harder than intended. Slow the tempo.",
    },
    general: {
      upright: "Decisive action. Move while it is clear.",
      reversed: "Haste. Worth rereading before sending.",
    },
  },
  'swords-13': {
    love: {
      upright: "Clear boundaries held without coldness. That combination is rare.",
      reversed: "Distance as protection. It works, and it costs.",
    },
    general: {
      upright: "Unsentimental clarity. You can see this plainly.",
      reversed: "Sharpness turned inward. Worth easing up.",
    },
  },
  'swords-14': {
    love: {
      upright: "Fair, principled, straight with you. Easy to trust.",
      reversed: "Being right prioritised over being close. Both are available.",
    },
    general: {
      upright: "Authority grounded in truth. Use it lightly.",
      reversed: "Judgement hardening into criticism.",
    },
  },

  // -------------------------------------------------------------- pentacles
  'pents-01': {
    love: {
      upright: "A beginning with substance. Slow, concrete, real.",
      reversed: "An opening missed, or a good thing measured by the wrong scale.",
    },
    general: {
      upright: "A tangible start. Plant it and be patient.",
      reversed: "Timing off, or foundations not laid yet.",
    },
  },
  'pents-02': {
    love: {
      upright: "Juggling love with everything else. Flexibility is doing the work.",
      reversed: "Too many plates. Something is getting the leftovers.",
    },
    general: {
      upright: "Adapting between demands. You are managing.",
      reversed: "Overcommitted. Something can be subtracted.",
    },
  },
  'pents-03': {
    love: {
      upright: "Building something together with actual effort. Collaboration, not merger.",
      reversed: "Different blueprints. Worth comparing them before building further.",
    },
    general: {
      upright: "Skill, teamwork, and visible progress.",
      reversed: "Effort without alignment. Agree on the plan first.",
    },
  },
  'pents-04': {
    love: {
      upright: "Wanting to keep what is good. Holding it with open hands works better.",
      reversed: "Loosening a grip. Security returns in a different form.",
    },
    general: {
      upright: "Conservation and security. Reasonable, up to a point.",
      reversed: "Letting go of control. Uncomfortable and useful.",
    },
  },
  'pents-05': {
    love: {
      upright: "Hardship pressing on the connection. This is circumstance, not verdict.",
      reversed: "Support appearing. Asking for it is allowed.",
    },
    general: {
      upright: "Scarcity and feeling outside. It is a season.",
      reversed: "Help arriving, or found. Worth taking.",
    },
  },
  'pents-06': {
    love: {
      upright: "Generosity flowing both ways. Balance in what is given.",
      reversed: "Giving with conditions attached. Worth naming them.",
    },
    general: {
      upright: "Sharing and fair exchange.",
      reversed: "An imbalance in who gives and who receives.",
    },
  },
  'pents-07': {
    love: {
      upright: "Patience while something grows. Not everything shows progress weekly.",
      reversed: "Impatience with a slow return. Check the timeline rather than the plant.",
    },
    general: {
      upright: "Long-term work, mid-stretch. Assess without pulling it up.",
      reversed: "Effort going into the wrong field. Worth reassessing honestly.",
    },
  },
  'pents-08': {
    love: {
      upright: "Practising at love — attention, repair, showing up. It is a skill.",
      reversed: "Going through motions, or perfectionism where warmth belongs.",
    },
    general: {
      upright: "Craft and repetition. Mastery is mostly this.",
      reversed: "Boredom, or standards that have stopped helping.",
    },
  },
  'pents-09': {
    love: {
      upright: "Self-sufficient and open at the same time. A good place to meet from.",
      reversed: "Independence as armour. Needing someone is allowed.",
    },
    general: {
      upright: "Earned comfort. Enjoy the result.",
      reversed: "Achievement without company.",
    },
  },
  'pents-10': {
    love: {
      upright: "Long-horizon love — family, continuity, the ordinary future.",
      reversed: "Old family patterns showing up in a new connection.",
    },
    general: {
      upright: "Stability, legacy, and things that outlast you.",
      reversed: "Inherited strain. It can be examined and set down.",
    },
  },
  'pents-11': {
    love: {
      upright: "Someone reliable and unhurried. Promising in a quiet way.",
      reversed: "Plans without follow-through. Watch what is done, not said.",
    },
    general: {
      upright: "Studying, starting, learning the trade.",
      reversed: "Procrastination, or a plan that stays a plan.",
    },
  },
  'pents-12': {
    love: {
      upright: "Steady, dependable, a little slow. Consistency is underrated.",
      reversed: "Routine without warmth. Something could be added.",
    },
    general: {
      upright: "Methodical progress. Dull and effective.",
      reversed: "Stuck in the groove. Worth changing one variable.",
    },
  },
  'pents-13': {
    love: {
      upright: "Practical care — the kind that shows up as meals and lifts rather than speeches.",
      reversed: "Caretaking crowding out being cared for.",
    },
    general: {
      upright: "Grounded abundance, and comfort you can share.",
      reversed: "Providing while running low yourself.",
    },
  },
  'pents-14': {
    love: {
      upright: "Solid, generous, and unbothered by small things. Easy ground to build on.",
      reversed: "Security valued above closeness. Both are available.",
    },
    general: {
      upright: "Resourceful leadership and long stability.",
      reversed: "Holding on tightly. Nothing here is as scarce as it feels.",
    },
  },
};

export const CORPUS_EN: TarotCorpus = {
  names: NAMES_EN,
  meanings: MEANINGS_EN,
};
