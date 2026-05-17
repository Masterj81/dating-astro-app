import type { ProductInput } from "@/types/strategy";

// AstroDating example — a freemium consumer dating app aiming at a
// product launch. Stakeholder-facing demo. Exercises:
//   - freemium business model
//   - launch campaign type (6-window launch calendar with lead-in /
//     warm-up / ramp / peak / echo / tail)
//   - solution-aware audience in a mature market (must niche)
//   - low price tier, freemium offer architecture (trial + guarantee)

export const ASTRO_DATING_EXAMPLE: ProductInput = {
  name: "AstroDating",
  category: "dating app",
  description:
    "A dating app that uses astrology as a shared language, plus values, voice intros, and prompts — not a fortune-telling gimmick. Designed for people who want real conversations, not another inbox of small talk.",
  price: "Free with $9/month premium",
  businessModel: "freemium",
  audience:
    "people in their late twenties and thirties who are tired of shallow swiping and want a partner with depth",
  audiencePain:
    "shallow swiping where matches never become real conversations, profiles that all sound the same, and ghost-after-three-messages fatigue",
  competitors: "Tinder, Hinge, Bumble",
  differentiator:
    "astrology as a language, plus values, voice intros, and prompts that surface who someone actually is — not which selfie filter they pick",
  goal: "launch the iOS web PWA with 1,000 weekly active matchers and a 25% reply rate",
  awareness: "solution-aware",
  sophistication: "mature-market",
  campaignType: "launch",
  offerContext: {
    cogsPercent: 25,
    targetMarginPercent: 25,
    currentAOV: 60,
    targetROAS: 2.5,
  },
};

// Plotline example — a paid subscription B2C writing tool aimed at an
// always-on test/scale cadence. Materially different from AstroDating
// across every input so the side-by-side demo lands clean. Exercises:
//   - subscription business model
//   - always-on campaign type (evergreen test / scale cadence)
//   - problem-aware audience in an amplified-claims market
//   - mid price tier, subscription offer architecture (free trial +
//     guarantee, low stickiness risk)
export const NOTION_LIKE_EXAMPLE: ProductInput = {
  name: "Plotline",
  category: "writing tool",
  description:
    "A focused writing tool for fiction authors who lose momentum in the middle of long projects. Built around a scene-graph that lets you see narrative momentum in one glance, not a wall of folders.",
  price: "$12/month",
  businessModel: "subscription",
  audience:
    "fiction writers stuck in the middle of long drafts — novelists, novella writers, and NaNoWriMo veterans who stall in the saggy middle",
  audiencePain:
    "losing momentum and structure halfway through a novel, rewriting the same chapters forever, and never finishing the draft you spent months opening",
  competitors: "Scrivener, Notion, plain Google Docs",
  differentiator:
    "a scene-graph view that surfaces narrative momentum across a draft in one glance",
  goal: "build evergreen acquisition that compounds — finish a draft you're proud of without rewriting forever",
  awareness: "problem-aware",
  sophistication: "amplified-claims",
  campaignType: "always-on",
  offerContext: {
    cogsPercent: 20,
    targetMarginPercent: 40,
    currentAOV: 144,
    targetROAS: 2.0,
  },
};

// HeirloomBrew example — a one-time-purchase physical consumer product
// running on a seasonal calendar. Provided to round out the demo set
// and exercise the seasonal campaign path (with its 7-window arc,
// peak-window retrospective gate, and promo-3-tier audience
// architecture). Exercises:
//   - one-time business model
//   - seasonal campaign type (lead-in → warm-up → ramp → peak → echo
//     → tail with a retrospective gate on the first peak)
//   - problem-aware audience in a skeptical market
//   - mid-to-high price tier, one-time offer architecture (bundle +
//     discount), with concrete COGS / margin numbers
export const HEIRLOOM_BREW_EXAMPLE: ProductInput = {
  name: "HeirloomBrew",
  category: "specialty coffee",
  description:
    "A single-origin coffee club that ships rare lots from named smallholders, not blends. Each bag includes a one-page tasting card written by the farmer.",
  price: "$48 per 12oz bag",
  businessModel: "one-time",
  audience:
    "specialty-coffee drinkers tired of supermarket blends and curious about origin transparency",
  audiencePain:
    "specialty coffee marketing all sounds the same — every brand claims single-origin and ethical sourcing without naming a farmer or a lot",
  competitors: "Blue Bottle, Trade, Atlas Coffee Club",
  differentiator:
    "every bag is a named lot from a named farmer with a tasting card the farmer wrote — not a roastery's marketing team",
  goal: "hit $180k in holiday gifting revenue with a 3.2x ROAS across November and December",
  awareness: "problem-aware",
  sophistication: "skeptical-market",
  campaignType: "seasonal",
  offerContext: {
    cogsPercent: 35,
    targetMarginPercent: 30,
    currentAOV: 96,
    targetROAS: 3.2,
  },
};
