/**
 * Tarot Engine for Web — 78-card deck with seed-based deterministic draws.
 * Ported from apps/mobile/services/tarotEngine.ts (cannot import across app boundaries).
 */

const SUPABASE_STORAGE_URL =
  "https://qtihezzbuubnyvrjdkjd.supabase.co/storage/v1/object/public/tarot";

// --- Types ---

export type TarotSuit = "major" | "cups" | "wands" | "swords" | "pents";
export type ReadingMode = "love" | "general";
export type SpreadPosition = "past" | "present" | "future" | "advice";

export type TarotCard = {
  id: string;
  name: string;
  suit: TarotSuit;
  number: number;
  imageFile: string;
  reversed: boolean;
  meanings: {
    love: { upright: string; reversed: string };
    general: { upright: string; reversed: string };
  };
};

export type TarotReading = {
  mode: ReadingMode;
  cards: Array<{
    position: SpreadPosition;
    card: TarotCard;
  }>;
  seed: string;
  generatedAt: string;
};

// --- Major Arcana ---

const MAJOR_ARCANA: Array<{
  number: number;
  name: string;
  love: { upright: string; reversed: string };
  general: { upright: string; reversed: string };
}> = [
  {
    number: 0,
    name: "The Fool",
    love: {
      upright:
        "A new romantic adventure awaits. Take a leap of faith in love — spontaneity brings magic.",
      reversed:
        "Fear of commitment or recklessness in love. Slow down before jumping into something new.",
    },
    general: {
      upright:
        "New beginnings and unlimited potential. Trust the journey even without a clear map.",
      reversed:
        "Reckless decisions or fear of the unknown. Look before you leap.",
    },
  },
  {
    number: 1,
    name: "The Magician",
    love: {
      upright:
        "You have all the tools to manifest the love you desire. Confidence is magnetic.",
      reversed:
        "Manipulation or illusion in love. Make sure intentions are genuine.",
    },
    general: {
      upright:
        "Manifestation power is strong. You have everything you need to succeed.",
      reversed:
        "Untapped potential or deception. Are you using your gifts wisely?",
    },
  },
  {
    number: 2,
    name: "The High Priestess",
    love: {
      upright:
        "Trust your intuition about a romantic interest. Hidden feelings may surface.",
      reversed:
        "Ignoring your inner voice in love. Secrets or miscommunication.",
    },
    general: {
      upright:
        "Deep intuition and inner wisdom. The answers are within — listen quietly.",
      reversed: "Disconnected from intuition. Information is being withheld.",
    },
  },
  {
    number: 3,
    name: "The Empress",
    love: {
      upright:
        "Abundant love and nurturing energy. A deeply sensual and caring connection blossoms.",
      reversed: "Codependency or neglecting self-care in relationships.",
    },
    general: {
      upright:
        "Fertility, abundance, and creative flow. Nature and beauty surround you.",
      reversed:
        "Creative blocks or lack of self-worth. Reconnect with what nourishes you.",
    },
  },
  {
    number: 4,
    name: "The Emperor",
    love: {
      upright:
        "Stability and structure in love. A partner who provides security and commitment.",
      reversed:
        "Controlling or rigid behavior in relationships. Loosen the grip.",
    },
    general: {
      upright:
        "Authority, discipline, and solid foundations. Lead with strength.",
      reversed:
        "Tyranny, rigidity, or lack of discipline. Balance power with compassion.",
    },
  },
  {
    number: 5,
    name: "The Hierophant",
    love: {
      upright:
        "Traditional values in love — commitment, loyalty, and shared beliefs unite you.",
      reversed:
        "Challenging conventions in love. An unconventional relationship path.",
    },
    general: {
      upright:
        "Tradition, mentorship, and spiritual guidance. Seek wisdom from trusted sources.",
      reversed:
        "Rebellion against structure. Question the rules that no longer serve you.",
    },
  },
  {
    number: 6,
    name: "The Lovers",
    love: {
      upright:
        "Deep soul connection and alignment. A significant romantic choice brings harmony.",
      reversed: "Disharmony or difficult choices in love. Misaligned values.",
    },
    general: {
      upright:
        "Important choices and partnerships. Alignment between heart and mind.",
      reversed:
        "Inner conflict or poor choices. Avoid decisions made from fear.",
    },
  },
  {
    number: 7,
    name: "The Chariot",
    love: {
      upright:
        "Determination in love pays off. Pursue what your heart wants with confidence.",
      reversed: "Forcing a relationship or losing direction in love.",
    },
    general: {
      upright:
        "Willpower, victory, and forward momentum. Stay focused on your goal.",
      reversed: "Lack of direction or aggression. Control without purpose.",
    },
  },
  {
    number: 8,
    name: "Strength",
    love: {
      upright:
        "Gentle courage in love. Inner strength helps you navigate emotional challenges.",
      reversed: "Self-doubt or emotional overwhelm in relationships.",
    },
    general: {
      upright:
        "Courage, patience, and inner power. Tame challenges with compassion, not force.",
      reversed: "Weakness, self-doubt, or raw emotional reactions.",
    },
  },
  {
    number: 9,
    name: "The Hermit",
    love: {
      upright:
        "Time for reflection on what you truly need in love. Solitude brings clarity.",
      reversed:
        "Isolation or withdrawal from love. Don't shut people out.",
    },
    general: {
      upright:
        "Soul-searching and inner guidance. Withdraw to find your truth.",
      reversed:
        "Loneliness or excessive isolation. It's time to reconnect.",
    },
  },
  {
    number: 10,
    name: "Wheel of Fortune",
    love: {
      upright:
        "A turning point in your love life. Fate brings an unexpected romantic opportunity.",
      reversed:
        "Resisting change in love. Bad luck in timing — patience is needed.",
    },
    general: {
      upright:
        "Destiny, cycles, and turning points. Change is coming — embrace it.",
      reversed:
        "Bad luck or resisting inevitable change. This too shall pass.",
    },
  },
  {
    number: 11,
    name: "Justice",
    love: {
      upright:
        "Fairness and balance in relationships. Honesty strengthens your bond.",
      reversed:
        "Unfairness or dishonesty in love. Unresolved past actions catch up.",
    },
    general: {
      upright:
        "Truth, fairness, and accountability. The right outcome will prevail.",
      reversed: "Injustice, dishonesty, or avoiding consequences.",
    },
  },
  {
    number: 12,
    name: "The Hanged Man",
    love: {
      upright:
        "Pause and see love from a new perspective. Surrender control for deeper connection.",
      reversed:
        "Stalling in love or refusing to see things differently.",
    },
    general: {
      upright:
        "Suspension, new perspectives, and letting go. Sometimes inaction is the answer.",
      reversed: "Stalling, resistance, or unnecessary sacrifice.",
    },
  },
  {
    number: 13,
    name: "Death",
    love: {
      upright:
        "Transformation in love — an ending that creates space for something better.",
      reversed:
        "Resisting necessary change in a relationship. Holding on too tightly.",
    },
    general: {
      upright:
        "Endings, transformation, and rebirth. Let go of what no longer serves you.",
      reversed:
        "Resisting change, stagnation, or fear of transformation.",
    },
  },
  {
    number: 14,
    name: "Temperance",
    love: {
      upright:
        "Balance and patience in love. A harmonious relationship built on mutual respect.",
      reversed: "Imbalance or excess in relationships. Find your center.",
    },
    general: {
      upright:
        "Balance, moderation, and patience. Blend opposing forces with grace.",
      reversed: "Imbalance, excess, or lack of patience.",
    },
  },
  {
    number: 15,
    name: "The Devil",
    love: {
      upright:
        "Intense attraction and passion, but beware of unhealthy attachments or obsession.",
      reversed:
        "Breaking free from a toxic relationship pattern. Liberation.",
    },
    general: {
      upright:
        "Shadow self, bondage, and temptation. What chains are you choosing to wear?",
      reversed: "Breaking free from addiction or unhealthy patterns.",
    },
  },
  {
    number: 16,
    name: "The Tower",
    love: {
      upright:
        "A sudden upheaval reveals the truth. Painful but necessary relationship revelation.",
      reversed:
        "Avoiding an inevitable breakdown. The truth will come out.",
    },
    general: {
      upright:
        "Sudden change, upheaval, and revelation. Destruction clears the way for truth.",
      reversed: "Avoiding disaster or delaying inevitable change.",
    },
  },
  {
    number: 17,
    name: "The Star",
    love: {
      upright:
        "Hope and healing in love. A beautiful, soul-nourishing connection is forming.",
      reversed: "Losing faith in love. Don't give up — hope returns.",
    },
    general: {
      upright:
        "Hope, inspiration, and renewal. After the storm, stars appear.",
      reversed:
        "Hopelessness or disconnection from purpose. Faith will return.",
    },
  },
  {
    number: 18,
    name: "The Moon",
    love: {
      upright:
        "Hidden emotions and illusions in love. Trust your intuition, not appearances.",
      reversed: "Clarity after confusion. Fears about love are dissolving.",
    },
    general: {
      upright:
        "Illusion, fear, and the subconscious. Not everything is as it seems.",
      reversed: "Release of fear and clarity emerging from confusion.",
    },
  },
  {
    number: 19,
    name: "The Sun",
    love: {
      upright:
        "Joy, warmth, and radiant love. A relationship that makes you feel truly alive.",
      reversed:
        "Temporary sadness or unrealistic expectations in love.",
    },
    general: {
      upright:
        "Success, vitality, and joy. Everything is illuminated — enjoy this moment.",
      reversed:
        "Temporary setbacks or dimmed optimism. The sun will shine again.",
    },
  },
  {
    number: 20,
    name: "Judgement",
    love: {
      upright:
        "A relationship awakening. Forgiveness and a higher calling in love.",
      reversed:
        "Self-doubt or refusing to learn from past relationships.",
    },
    general: {
      upright: "Awakening, renewal, and answering a higher calling.",
      reversed:
        "Self-doubt, refusal to learn, or avoiding self-reflection.",
    },
  },
  {
    number: 21,
    name: "The World",
    love: {
      upright:
        "Fulfillment and completion in love. A relationship that feels whole and destined.",
      reversed:
        "Feeling incomplete or seeking closure. The final step is near.",
    },
    general: {
      upright:
        "Completion, accomplishment, and wholeness. A major cycle reaches its peak.",
      reversed:
        "Incompletion or shortcuts. Take the final step to finish what you started.",
    },
  },
];

// --- Minor Arcana ---

type MinorMeanings = {
  love: { upright: string; reversed: string };
  general: { upright: string; reversed: string };
};

const SUIT_MEANINGS: Record<
  string,
  { theme: string; loveTheme: string; names: string[] }
> = {
  cups: {
    theme: "emotions, relationships, and intuition",
    loveTheme: "emotional connection, romance, and heartfelt bonds",
    names: [
      "",
      "Ace of Cups",
      "Two of Cups",
      "Three of Cups",
      "Four of Cups",
      "Five of Cups",
      "Six of Cups",
      "Seven of Cups",
      "Eight of Cups",
      "Nine of Cups",
      "Ten of Cups",
      "Page of Cups",
      "Knight of Cups",
      "Queen of Cups",
      "King of Cups",
    ],
  },
  wands: {
    theme: "passion, creativity, and ambition",
    loveTheme: "passion, attraction, and adventurous romance",
    names: [
      "",
      "Ace of Wands",
      "Two of Wands",
      "Three of Wands",
      "Four of Wands",
      "Five of Wands",
      "Six of Wands",
      "Seven of Wands",
      "Eight of Wands",
      "Nine of Wands",
      "Ten of Wands",
      "Page of Wands",
      "Knight of Wands",
      "Queen of Wands",
      "King of Wands",
    ],
  },
  swords: {
    theme: "intellect, truth, and conflict",
    loveTheme: "communication, honesty, and mental clarity in love",
    names: [
      "",
      "Ace of Swords",
      "Two of Swords",
      "Three of Swords",
      "Four of Swords",
      "Five of Swords",
      "Six of Swords",
      "Seven of Swords",
      "Eight of Swords",
      "Nine of Swords",
      "Ten of Swords",
      "Page of Swords",
      "Knight of Swords",
      "Queen of Swords",
      "King of Swords",
    ],
  },
  pents: {
    theme: "material world, stability, and resources",
    loveTheme: "stability, commitment, and building a future together",
    names: [
      "",
      "Ace of Pentacles",
      "Two of Pentacles",
      "Three of Pentacles",
      "Four of Pentacles",
      "Five of Pentacles",
      "Six of Pentacles",
      "Seven of Pentacles",
      "Eight of Pentacles",
      "Nine of Pentacles",
      "Ten of Pentacles",
      "Page of Pentacles",
      "Knight of Pentacles",
      "Queen of Pentacles",
      "King of Pentacles",
    ],
  },
};

const MINOR_MEANINGS: Record<string, Record<number, MinorMeanings>> = {
  cups: {
    1: { love: { upright: "A new wave of love and emotional fulfillment washes over you.", reversed: "Blocked emotions or repressed feelings. Open your heart." }, general: { upright: "New emotional beginnings and overflowing intuition.", reversed: "Emotional emptiness or blocked creativity." } },
    2: { love: { upright: "A beautiful partnership forming — mutual attraction and deep connection.", reversed: "Imbalance in a relationship. One side gives more." }, general: { upright: "Partnership, unity, and mutual respect.", reversed: "Disconnection or imbalanced relationships." } },
    3: { love: { upright: "Celebration of love with friends and community. Joyful social connections.", reversed: "Overindulgence or gossip affecting your love life." }, general: { upright: "Celebration, friendship, and community joy.", reversed: "Overindulgence or isolation from your circle." } },
    4: { love: { upright: "Apathy or taking love for granted. A new opportunity may be right in front of you.", reversed: "Renewed interest in love after a period of stagnation." }, general: { upright: "Contemplation and missed opportunities. Look around you.", reversed: "Motivation returns after a period of apathy." } },
    5: { love: { upright: "Grief or loss in love, but not all is lost. Focus on what remains.", reversed: "Acceptance and moving forward after heartbreak." }, general: { upright: "Loss and grief, but hope remains. Don't dwell on what's spilled.", reversed: "Recovery, acceptance, and finding peace." } },
    6: { love: { upright: "Nostalgia and innocent love. A past connection may resurface.", reversed: "Living in the past or idealizing old relationships." }, general: { upright: "Nostalgia, childhood memories, and innocence.", reversed: "Stuck in the past or unrealistic nostalgia." } },
    7: { love: { upright: "Many romantic options but beware of illusion. Choose with clarity.", reversed: "Clarity about what you truly want in love." }, general: { upright: "Fantasy, choices, and wishful thinking. Ground your dreams.", reversed: "Clarity of purpose after confusion." } },
    8: { love: { upright: "Walking away from a love that no longer fulfills you. Brave but necessary.", reversed: "Fear of leaving a stagnant relationship." }, general: { upright: "Leaving behind what doesn't serve you. A difficult but brave choice.", reversed: "Fear of change or aimless drifting." } },
    9: { love: { upright: "Emotional satisfaction and wish fulfillment in love. Contentment.", reversed: "Complacency or superficial happiness in love." }, general: { upright: "Wishes coming true and emotional satisfaction.", reversed: "Dissatisfaction despite having everything." } },
    10: { love: { upright: "Harmonious family life and lasting love. Emotional fulfillment at its peak.", reversed: "Family discord or broken harmony in relationships." }, general: { upright: "Harmony, happiness, and emotional fulfillment.", reversed: "Broken harmony or dysfunctional dynamics." } },
    11: { love: { upright: "A sweet, imaginative romantic gesture or message. Young love energy.", reversed: "Emotional immaturity or unrealistic romantic fantasies." }, general: { upright: "Creative inspiration, curiosity, and intuitive messages.", reversed: "Emotional immaturity or creative blocks." } },
    12: { love: { upright: "A romantic, charming pursuer. Follow your heart's calling.", reversed: "Moodiness or unrealistic romantic expectations." }, general: { upright: "Following your heart, charm, and romantic idealism.", reversed: "Moodiness, jealousy, or emotional manipulation." } },
    13: { love: { upright: "Compassionate, nurturing love. Deep emotional intelligence in relationships.", reversed: "Emotional codependency or insecurity." }, general: { upright: "Compassion, calm, and emotional depth.", reversed: "Insecurity, codependency, or emotional manipulation." } },
    14: { love: { upright: "Emotionally mature and generous partner. Wisdom in love.", reversed: "Emotional volatility or manipulation in relationships." }, general: { upright: "Emotional balance, generosity, and diplomacy.", reversed: "Emotional manipulation or moodiness." } },
  },
  wands: {
    1: { love: { upright: "A passionate new beginning in love. Spark of attraction ignites.", reversed: "Delays in love or lack of passion." }, general: { upright: "Inspiration, new ventures, and creative spark.", reversed: "Delays, lack of motivation, or false starts." } },
    2: { love: { upright: "Planning your romantic future. Big decisions about where love takes you.", reversed: "Fear of commitment or indecision in love." }, general: { upright: "Planning, progress, and future vision.", reversed: "Fear of the unknown or poor planning." } },
    3: { love: { upright: "Your love life expands. Progress and exploration in romance.", reversed: "Delays or frustration in romantic plans." }, general: { upright: "Expansion, foresight, and overseas opportunities.", reversed: "Obstacles to progress or lack of foresight." } },
    4: { love: { upright: "Celebration of love — engagement, marriage, or a joyful milestone.", reversed: "Lack of harmony at home or cancelled celebrations." }, general: { upright: "Celebration, harmony, and homecoming.", reversed: "Instability or lack of support." } },
    5: { love: { upright: "Disagreements or competition in love. Healthy debate strengthens bonds.", reversed: "Avoiding conflict or inner tension in relationships." }, general: { upright: "Competition, conflict, and diverse opinions.", reversed: "Avoiding conflict or inner struggles." } },
    6: { love: { upright: "Public recognition of your love. Victory in romantic pursuits.", reversed: "Ego clashes or lack of recognition in love." }, general: { upright: "Victory, recognition, and self-confidence.", reversed: "Ego, arrogance, or fall from grace." } },
    7: { love: { upright: "Standing your ground in love. Defend what matters to you.", reversed: "Feeling overwhelmed or giving up too easily." }, general: { upright: "Perseverance, defense, and holding your position.", reversed: "Overwhelm, giving up, or paranoia." } },
    8: { love: { upright: "Rapid progress in romance. Things move fast — enjoy the ride.", reversed: "Delays or miscommunication in love." }, general: { upright: "Swift action, rapid changes, and momentum.", reversed: "Delays, frustration, or scattered energy." } },
    9: { love: { upright: "Resilience in love after challenges. You're stronger than you think.", reversed: "Exhaustion or stubbornness in relationships." }, general: { upright: "Resilience, persistence, and courage under pressure.", reversed: "Exhaustion, stubbornness, or defensive walls." } },
    10: { love: { upright: "Carrying too much in love. Share the emotional load with your partner.", reversed: "Learning to delegate and release burdens in love." }, general: { upright: "Heavy burdens and responsibilities. Delegate or simplify.", reversed: "Releasing burdens and finding relief." } },
    11: { love: { upright: "Exciting news about love. An enthusiastic admirer appears.", reversed: "Impatience or superficial attraction." }, general: { upright: "Enthusiasm, exploration, and exciting news.", reversed: "Hasty decisions or lack of direction." } },
    12: { love: { upright: "A passionate, adventurous lover enters your life.", reversed: "Impulsiveness or short-lived passion." }, general: { upright: "Energy, passion, and adventurous spirit.", reversed: "Impulsiveness, haste, or scattered energy." } },
    13: { love: { upright: "Confident, vibrant, and warmly passionate love energy.", reversed: "Jealousy or demanding behavior in love." }, general: { upright: "Confidence, determination, and vibrant energy.", reversed: "Jealousy, selfishness, or temperamental behavior." } },
    14: { love: { upright: "A natural leader in love — bold, visionary, and inspiring.", reversed: "Domineering or setting unrealistic expectations." }, general: { upright: "Vision, leadership, and bold action.", reversed: "Impulsiveness, tyranny, or high expectations." } },
  },
  swords: {
    1: { love: { upright: "Clarity and truth in love. A breakthrough in understanding your needs.", reversed: "Confusion or harsh truths in relationships." }, general: { upright: "Mental clarity, truth, and breakthroughs.", reversed: "Confusion, brutality, or misuse of power." } },
    2: { love: { upright: "A difficult romantic decision. Trust your intuition to choose wisely.", reversed: "Information overload or avoidance of a love decision." }, general: { upright: "Difficult decisions and stalemate. Weigh options carefully.", reversed: "Indecision, information overload, or avoidance." } },
    3: { love: { upright: "Heartbreak or painful truth in love. Necessary pain leads to growth.", reversed: "Recovery from heartbreak. Healing begins." }, general: { upright: "Sorrow, heartbreak, and painful truth.", reversed: "Recovery, forgiveness, and moving forward." } },
    4: { love: { upright: "Rest and recovery after emotional turmoil. Take time to heal.", reversed: "Restlessness or returning to love too soon." }, general: { upright: "Rest, recovery, and contemplation. Recharge your energy.", reversed: "Restlessness, burnout, or forced recovery." } },
    5: { love: { upright: "Conflict or betrayal in love. Win the battle but consider the cost.", reversed: "Reconciliation or learning from past conflicts." }, general: { upright: "Conflict, defeat, or hollow victory.", reversed: "Reconciliation, making amends, or moving on." } },
    6: { love: { upright: "Moving on from a difficult love situation. Calmer waters ahead.", reversed: "Stuck in emotional turbulence. Unresolved issues." }, general: { upright: "Transition, moving on, and calmer waters.", reversed: "Stuck in a situation or unresolved baggage." } },
    7: { love: { upright: "Deception or secrecy in love. Not everything is as it seems.", reversed: "Coming clean or exposing dishonesty." }, general: { upright: "Deception, strategy, and getting away with something.", reversed: "Truth revealed, confession, or conscience." } },
    8: { love: { upright: "Feeling trapped in a relationship. The restrictions are often self-imposed.", reversed: "Breaking free from limiting beliefs about love." }, general: { upright: "Feeling restricted or trapped. The bonds are often mental.", reversed: "Freedom, release, and new perspectives." } },
    9: { love: { upright: "Anxiety and fear about love keeping you up at night. Face the worry.", reversed: "Hope and recovery from romantic anxiety." }, general: { upright: "Anxiety, nightmares, and overwhelming worry.", reversed: "Recovery from anxiety and finding hope." } },
    10: { love: { upright: "A painful ending in love. Rock bottom — but the only way is up.", reversed: "Recovery and rising from a devastating love experience." }, general: { upright: "Painful ending, rock bottom, and betrayal.", reversed: "Recovery, resilience, and inevitable improvement." } },
    11: { love: { upright: "Curious and communicative energy in love. Honest conversations.", reversed: "Gossip or spying in relationships." }, general: { upright: "Curiosity, vigilance, and new ideas.", reversed: "Gossip, deception, or all talk no action." } },
    12: { love: { upright: "Quick-witted and direct communication in love. Fast-moving romance.", reversed: "Hurtful words or rushing into love recklessly." }, general: { upright: "Ambition, action, and quick thinking.", reversed: "Impulsiveness, aggression, or carelessness." } },
    13: { love: { upright: "Independent and perceptive in love. Clear boundaries and self-respect.", reversed: "Coldness, bitterness, or emotional distance in love." }, general: { upright: "Independence, clear thinking, and unbiased judgment.", reversed: "Coldness, cruelty, or bitterness." } },
    14: { love: { upright: "Intellectual authority in love — clear, fair, and principled.", reversed: "Manipulative or overly critical behavior in relationships." }, general: { upright: "Authority, truth, and intellectual power.", reversed: "Manipulation, cruelty, or abuse of power." } },
  },
  pents: {
    1: { love: { upright: "A solid new beginning in love. Building something real and lasting.", reversed: "Missed romantic opportunity or materialism over love." }, general: { upright: "New financial or material opportunity. Plant the seed.", reversed: "Missed opportunity or poor planning." } },
    2: { love: { upright: "Balancing love with other priorities. Flexibility keeps romance alive.", reversed: "Overcommitted or neglecting your love life." }, general: { upright: "Balancing priorities and adapting to change.", reversed: "Overcommitted, disorganized, or overwhelmed." } },
    3: { love: { upright: "Teamwork in love. Building a relationship through shared effort and growth.", reversed: "Lack of teamwork or misaligned goals in love." }, general: { upright: "Collaboration, learning, and implementation.", reversed: "Lack of teamwork or mediocre effort." } },
    4: { love: { upright: "Security in love, but beware of possessiveness. Hold with open hands.", reversed: "Letting go of control in love. Generosity returns." }, general: { upright: "Security, conservation, and control.", reversed: "Greed, hoarding, or letting go of control." } },
    5: { love: { upright: "Financial or emotional hardship straining your relationship.", reversed: "Recovery from hardship. Support appears when needed." }, general: { upright: "Hardship, loss, and isolation.", reversed: "Recovery, spiritual growth, and finding support." } },
    6: { love: { upright: "Generous and giving love. A balanced exchange of affection.", reversed: "One-sided giving or power imbalance in love." }, general: { upright: "Generosity, charity, and sharing resources.", reversed: "Debt, selfishness, or strings attached." } },
    7: { love: { upright: "Patience in love. The seeds you planted are growing — trust the process.", reversed: "Impatience or frustration with slow romantic progress." }, general: { upright: "Long-term vision, patience, and sustainable growth.", reversed: "Impatience, poor returns, or short-term thinking." } },
    8: { love: { upright: "Dedication and mastery in love. Investing in your relationship skillfully.", reversed: "Perfectionism or boredom in routine love." }, general: { upright: "Mastery, skill development, and dedication.", reversed: "Perfectionism, boredom, or lack of passion." } },
    9: { love: { upright: "Self-sufficient and luxurious love energy. You attract quality.", reversed: "Loneliness despite success or over-reliance on yourself." }, general: { upright: "Abundance, luxury, and self-sufficiency.", reversed: "Over-investment in work or financial setbacks." } },
    10: { love: { upright: "Legacy, family, and long-term romantic stability. Lasting love.", reversed: "Family conflict or financial stress affecting love." }, general: { upright: "Wealth, inheritance, and long-term success.", reversed: "Family disputes or loss of legacy." } },
    11: { love: { upright: "A reliable, grounded admirer. New beginnings with practical foundations.", reversed: "Lack of progress or unrealistic plans in love." }, general: { upright: "Ambition, desire to learn, and new opportunities.", reversed: "Lack of progress or procrastination." } },
    12: { love: { upright: "A steady, dependable partner. Slow but deeply committed romance.", reversed: "Stagnation or laziness in your love life." }, general: { upright: "Hard work, routine, and methodical progress.", reversed: "Stagnation, laziness, or feeling stuck." } },
    13: { love: { upright: "Nurturing abundance in love. A partner who creates warmth and security.", reversed: "Neglecting relationships for material pursuits." }, general: { upright: "Nurturing abundance, practical wisdom, and comfort.", reversed: "Insecurity or neglecting what matters." } },
    14: { love: { upright: "A stable, wealthy, and generous partner. Love built on solid ground.", reversed: "Materialism or stubbornness in relationships." }, general: { upright: "Wealth, business acumen, and disciplined leadership.", reversed: "Greed, stubbornness, or materialism." } },
  },
};

// --- Build Full Deck ---

function buildDeck(): Omit<TarotCard, "reversed">[] {
  const deck: Omit<TarotCard, "reversed">[] = [];

  for (const card of MAJOR_ARCANA) {
    deck.push({
      id: `major-${String(card.number).padStart(2, "0")}`,
      name: card.name,
      suit: "major",
      number: card.number,
      imageFile: `major-${String(card.number).padStart(2, "0")}.jpg`,
      meanings: { love: card.love, general: card.general },
    });
  }

  for (const [suit, data] of Object.entries(SUIT_MEANINGS)) {
    for (let i = 1; i <= 14; i++) {
      const meanings = MINOR_MEANINGS[suit]?.[i];
      if (!meanings) continue;
      deck.push({
        id: `${suit}-${String(i).padStart(2, "0")}`,
        name: data.names[i],
        suit: suit as TarotSuit,
        number: i,
        imageFile: `${suit}-${String(i).padStart(2, "0")}.jpg`,
        meanings,
      });
    }
  }

  return deck;
}

const FULL_DECK = buildDeck();

// --- Seed-Based Random ---

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  return () => {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    return hash / 0x7fffffff;
  };
}

// --- Public API ---

export function getCardImageUrl(imageFile: string): string {
  return `${SUPABASE_STORAGE_URL}/${imageFile}`;
}

export function generateReading(
  userId: string,
  mode: ReadingMode,
  period: "weekly" | "monthly"
): TarotReading {
  const now = new Date();
  let periodKey: string;

  if (period === "weekly") {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(
      ((now.getTime() - startOfYear.getTime()) / 86400000 +
        startOfYear.getDay() +
        1) /
        7
    );
    periodKey = `${now.getFullYear()}-W${weekNum}`;
  } else {
    periodKey = `${now.getFullYear()}-M${now.getMonth() + 1}`;
  }

  const seed = `${userId}-${mode}-${period}-${periodKey}`;
  const rng = seededRandom(seed);

  const shuffled = [...FULL_DECK].sort(() => rng() - 0.5);

  const positions: SpreadPosition[] = ["past", "present", "future", "advice"];
  const cards = positions.map((position, i) => {
    const baseCard = shuffled[i];
    const reversed = rng() < 0.3;
    return {
      position,
      card: { ...baseCard, reversed },
    };
  });

  return {
    mode,
    cards,
    seed: periodKey,
    generatedAt: now.toISOString(),
  };
}

export function getCardMeaning(card: TarotCard, mode: ReadingMode): string {
  const meanings = card.meanings[mode];
  return card.reversed ? meanings.reversed : meanings.upright;
}

export function getPositionLabel(position: SpreadPosition): string {
  switch (position) {
    case "past":
      return "Past";
    case "present":
      return "Present";
    case "future":
      return "Future";
    case "advice":
      return "Cosmic Advice";
  }
}

export { FULL_DECK };
