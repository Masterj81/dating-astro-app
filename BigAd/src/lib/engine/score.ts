import type {
  ProductInput,
  ScoreDimension,
  StrategyScore,
} from "@/types/strategy";

// scoreStrategy — deterministic quality score across 5 dimensions:
//   clarity, differentiation, specificity, proof strength, channel fit
//
// The score is computed from the *inputs the user provided* (and how
// specific they are), not from the generated copy. The intent: a user
// who fills in vague inputs gets a low specificity score with a
// concrete suggestion for how to fix it — which is more useful than
// rating the auto-generated copy that came out of those vague inputs.
//
// Each dimension is 0-100. Overall is a weighted average.

const WEIGHTS: Record<string, number> = {
  clarity: 0.25,
  differentiation: 0.25,
  specificity: 0.2,
  proofStrength: 0.15,
  channelFit: 0.15,
};

export function scoreStrategy(input: ProductInput): StrategyScore {
  const dimensions: ScoreDimension[] = [
    scoreClarity(input),
    scoreDifferentiation(input),
    scoreSpecificity(input),
    scoreProofStrength(input),
    scoreChannelFit(input),
  ];

  let overall = 0;
  for (const d of dimensions) {
    overall += d.score * (WEIGHTS[d.key] ?? 0);
  }

  return {
    overall: Math.round(overall),
    dimensions,
  };
}

// --- per-dimension scorers ---

function scoreClarity(input: ProductInput): ScoreDimension {
  // Clarity = can a stranger understand who the product is for and what
  // it does, in one read of the inputs?
  let s = 50;
  if (wordsOf(input.name) >= 1 && wordsOf(input.name) <= 4) s += 10;
  if (wordsOf(input.category) >= 1 && wordsOf(input.category) <= 5) s += 10;
  if (wordsOf(input.description) >= 8) s += 15;
  if (wordsOf(input.audience) >= 3) s += 10;
  if (/^(a|an|the)\s/i.test(input.description.trim())) s += 5;

  // Generic "platform / solution / tool" without a category noun loses clarity.
  const cat = input.category.toLowerCase();
  if (
    !cat ||
    cat === "platform" ||
    cat === "solution" ||
    cat === "tool" ||
    cat === "app"
  ) {
    s -= 10;
  }

  s = clamp(s);
  return {
    key: "clarity",
    label: "Clarity",
    score: s,
    explanation:
      s >= 75
        ? `A reader can grasp what ${input.name || "this"} is and who it's for from the inputs alone.`
        : `The category and description don't yet make it obvious what ${input.name || "this"} is, in one read.`,
    suggestion:
      s >= 75
        ? `Hold this clarity in every headline — keep "${input.category}" visible early.`
        : `Tighten the category to a concrete noun (e.g. "dating app", "writing tool"), and rewrite the description as one sentence: "${input.name || "Name"} is the X for Y who Z."`,
  };
}

function scoreDifferentiation(input: ProductInput): ScoreDimension {
  let s = 40;
  const diff = (input.differentiator || "").trim();
  if (diff.length >= 12) s += 15;
  if (wordsOf(diff) >= 6) s += 10;
  if (wordsOf(diff) >= 12) s += 10;
  if (input.competitors.trim()) s += 10;
  // Penalise differentiators that match generic words.
  if (/better|faster|easier|smarter|powerful/i.test(diff) && wordsOf(diff) < 8) {
    s -= 15;
  }
  // Bonus if the differentiator references a noun-style mechanism (uses, with, that).
  if (/\b(uses|with|that|via|through|by)\b/i.test(diff)) s += 5;

  s = clamp(s);
  return {
    key: "differentiation",
    label: "Differentiation",
    score: s,
    explanation:
      s >= 75
        ? `"${diff || "Your differentiator"}" reads as a concrete mechanism — not a feature comparison.`
        : `The differentiator sounds close to what competitors already say. The unique mechanism isn't load-bearing yet.`,
    suggestion:
      s >= 75
        ? `Name this mechanism in the hero and in at least one App Store screenshot.`
        : `Replace adjectives ("better", "easier") with a noun-style mechanism: "We use [thing] to do [thing], not [thing]." Compare against ${input.competitors || "your competitors"} by mechanism, not by score.`,
  };
}

function scoreSpecificity(input: ProductInput): ScoreDimension {
  let s = 40;
  const audience = input.audience || "";
  const pain = input.audiencePain || "";
  // Specific audience words like "first-time", "indie", "Series A", a number, a role.
  if (/\b(first-time|indie|solo|series\s?[ab]|founder|engineer|writer|nurse|parent|teacher|student|trader|coach|teen|gen\s?z|millennial)\b/i.test(audience)) {
    s += 15;
  }
  if (wordsOf(audience) >= 5) s += 10;
  if (wordsOf(pain) >= 6) s += 10;
  if (/\d/.test(pain) || /\d/.test(audience)) s += 5;
  if (input.goal && wordsOf(input.goal) >= 4) s += 10;

  // Penalty for "everyone", "anyone", "businesses", "users" alone.
  if (/^\s*(everyone|anyone|businesses|users|people)\s*$/i.test(audience)) {
    s -= 15;
  }

  s = clamp(s);
  return {
    key: "specificity",
    label: "Specificity",
    score: s,
    explanation:
      s >= 75
        ? `The audience and pain are concrete enough to write copy that won't apply to every competitor.`
        : `Audience and pain still read general — generated copy will sound like every other ${input.category || "product"}.`,
    suggestion:
      s >= 75
        ? `Keep this specificity in your ads — name the exact moment the pain shows up.`
        : `Pick one narrower audience slice (a role, a life stage, a tool they use) and one concrete pain ("matches never become real conversations" beats "bad dating experience").`,
  };
}

function scoreProofStrength(input: ProductInput): ScoreDimension {
  // We don't ask for proof in the inputs (yet), so this is mostly a
  // function of business model + sophistication. Skeptical/mature markets
  // need more proof; the score reflects how exposed the strategy is to
  // that without naming actual proof.
  let s = 55;
  if (input.sophistication === "skeptical-market") s -= 15;
  if (input.sophistication === "mature-market") s -= 10;
  if (input.sophistication === "fresh-market") s += 10;
  if (input.businessModel === "freemium" || input.businessModel === "subscription") {
    s += 5; // free trial doubles as proof
  }
  if (input.description.toLowerCase().includes("trial") || input.description.toLowerCase().includes("free")) {
    s += 5;
  }
  s = clamp(s);
  return {
    key: "proofStrength",
    label: "Proof strength",
    score: s,
    explanation:
      s >= 70
        ? `Your market doesn't demand a wall of proof yet — promise + mechanism still carries.`
        : `Your market is skeptical or mature, but no proof asset is named in the inputs.`,
    suggestion:
      s >= 70
        ? `Capture quotes and screenshots from the first 20 users now — you'll need them at the next sophistication step.`
        : `Add at least one named proof asset to the strategy (a customer quote, a screenshot of the mechanism in use, or a short before/after) before scaling ad spend.`,
  };
}

function scoreChannelFit(input: ProductInput): ScoreDimension {
  let s = 60;
  const cat = input.category.toLowerCase();
  const aud = input.audience.toLowerCase();

  // B2C consumer apps with a young/lifestyle audience: TikTok/Meta fit.
  if (
    /(dating|fitness|wellness|astrology|game|game|food|fashion|music|video|social)/.test(
      cat
    ) ||
    /(teen|gen\s?z|millennial|student)/.test(aud)
  ) {
    s += 15;
  }
  // B2B / dev tools: TikTok fit is weaker, Landing + Email matter more.
  if (/(b2b|crm|saas|dev|api|infrastructure|enterprise)/.test(cat)) {
    s -= 5;
  }
  // App Store presence matters for "app" categories
  if (/\bapp\b/.test(cat)) s += 5;
  if (input.businessModel === "marketplace") s += 5;
  if (input.businessModel === "services") s -= 5;
  s = clamp(s);
  return {
    key: "channelFit",
    label: "Channel fit",
    score: s,
    explanation:
      s >= 70
        ? `The category and audience map cleanly onto at least one strong paid channel.`
        : `No single channel is an obvious home for this product yet — channel choice will need testing.`,
    suggestion:
      s >= 70
        ? `Concentrate spend on the top-fit channel before broadening — depth beats breadth at this stage.`
        : `Pick the channel that is closest to where your audience already complains about ${input.audiencePain ? input.audiencePain.split(" ").slice(0, 3).join(" ") : "this problem"}, and start there.`,
  };
}

// --- helpers ---

function wordsOf(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Promising";
  if (score >= 50) return "Workable";
  if (score >= 35) return "Soft";
  return "Generic";
}
