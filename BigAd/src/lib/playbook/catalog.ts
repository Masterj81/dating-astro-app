// catalog.ts — frozen, deterministic registry for the Playbook Library.
//
// Ten playbooks covering launch, always-on, seasonal, leadgen, rescue,
// CRO, and service archetypes. Every entry is content-complete: no
// placeholders, no TODOs. Pure data + helper getters. No engine
// coupling. No `Date.now()`.

import type { Playbook, PlaybookId } from "@/types/playbook";

// ---- Registry ---------------------------------------------------------

export const PLAYBOOKS: Record<PlaybookId, Playbook> = Object.freeze({
  "saas-free-trial-launch": {
    id: "saas-free-trial-launch",
    name: "SaaS free-trial launch",
    category: "launch",
    bestFor: [
      "B2B or prosumer SaaS with a self-serve trial",
      "Solution-aware to product-aware audiences",
      "Skeptical or competitive markets that need case studies",
      "Companies optimising trial_start, activation, and paid subscribe",
    ],
    notFor: [
      "Pure-consumer apps without a website-driven trial",
      "Brand-new categories with zero proof to show",
      "Hardware or one-time-purchase products",
    ],
    businessModels: ["saas"],
    campaignTypes: ["launch", "evergreen"],
    awarenessStages: ["problem-aware", "solution-aware", "product-aware"],
    sophistication: ["competitive-market", "skeptical-market"],
    channels: ["meta", "linkedin", "google-search", "youtube"],
    recommendedModules: [
      "avatars",
      "offer",
      "hooks",
      "scripts",
      "concepts",
      "proof",
      "tracking",
      "review",
      "execution",
      "report",
    ],
    requiredInputs: [
      "audience",
      "audiencePain",
      "differentiator",
      "businessModel",
      "sophistication",
      "offerContext",
    ],
    proofRequirements: [
      "Named-customer case study with one outcome metric",
      "Product dashboard screenshot showing the aha-moment",
      "Trial-to-paid conversion data from the last 30 days",
      "Side-by-side comparison against the closest competitor",
      "Founder or PM short video explaining the unique mechanism",
      "Two named-customer quotes with role + company",
    ],
    executionSteps: [
      {
        order: 1,
        module: "avatars",
        title: "Lock the target avatars",
        description:
          "Define 2-3 avatars with the trial trigger, deepest objection, and the activation moment they want to reach inside the product.",
      },
      {
        order: 2,
        module: "offer",
        title: "Shape the trial offer",
        description:
          "Decide trial length, what unlocks during trial, and what is gated behind paid. Pin a single primary CTA across all paid touchpoints.",
      },
      {
        order: 3,
        module: "hooks",
        title: "Draft proof-led hooks",
        description:
          "Lead with named-customer outcomes, not features. Pair each hook with the objection it disarms.",
      },
      {
        order: 4,
        module: "scripts",
        title: "Write trial-walkthrough scripts",
        description:
          "Hook → problem framing → product demo of the aha-moment → trial offer. Keep video under 60 seconds.",
      },
      {
        order: 5,
        module: "tracking",
        title: "Wire trial and subscribe events",
        description:
          "Confirm trial_start fires on the trial trigger and subscribe fires on first paid renewal. Match the ad-platform event to the CRM lifecycle.",
        gate: "trackingReadiness.score >= 70",
      },
      {
        order: 6,
        module: "review",
        title: "Approve positioning, offer, and first batch",
        description:
          "Stakeholder sign-off on positioning, the trial offer, and the first 4-6 test cells before any paid spend.",
        gate: "reviewBoard.approvalReadiness === 'ready'",
      },
      {
        order: 7,
        module: "execution",
        title: "Launch a 4-6 cell first batch",
        description:
          "One-variable-at-a-time: hook, proof asset, audience tier. Hold the offer constant in batch one to read creative cleanly.",
      },
      {
        order: 8,
        module: "report",
        title: "Report against payback, not impressions",
        description:
          "Spotlight trial_start cost, activation rate, subscribe rate, and payback period — not CTR or CPM.",
      },
    ],
    launchGates: [
      "trackingReadiness.score >= 70 with trial_start firing",
      "proofAssetPlan minimumProofSet captured (case study + dashboard screenshot)",
      "creativeTestingMatrix has >= 3 cells with one-variable discipline",
      "creativeQa has no blocker findings",
      "reviewBoard.approvalReadiness === 'ready' covering positioning + offer",
      "ROAS proxy plan agreed (trial_start cost * activation rate * LTV)",
    ],
    defaultTestPlan: {
      cellCount: { min: 4, max: 6 },
      formats: ["video-9-16", "video-1-1", "static-1-1", "static-4-5"],
      oneVariableAtATime: true,
      budgetGuidance:
        "Start at 2-3x your target trial_start cost per cell per day so each cell reaches statistical signal within 5-7 days.",
      killRuleHint:
        "Kill a cell when trial_start cost exceeds 2x target after the kill-spend threshold (e.g. $200) with no activation.",
      scaleRuleHint:
        "Duplicate winners into a scaling campaign once trial_start cost stays below target for 48h with activation rate at or above baseline.",
    },
    reportingFocus: [
      "trial_start_cost",
      "activation_rate",
      "subscribe_rate",
      "payback_period_days",
      "cac",
      "blended_roas_proxy",
    ],
    reviewRequirements: [
      "positioning",
      "offer",
      "first-test-batch",
      "client-report",
    ],
    estimatedTimelineDays: { min: 14, max: 21 },
    riskNotes: [
      "Trial offers can mask a weak activation flow — fix activation before spending hard.",
      "Skeptical SaaS buyers ignore feature lists; without a named-customer case study the hook will fall flat.",
      "Long sales cycles distort ROAS — agree on a payback-period proxy up front.",
    ],
  },
  "mobile-app-launch": {
    id: "mobile-app-launch",
    name: "Mobile app launch",
    category: "launch",
    bestFor: [
      "Consumer subscription apps with a 7-14 day paid push",
      "App Store reviews >= 4.5 with 100+ ratings ready",
      "Solution-aware audiences that need a quick proof beat",
      "Teams optimising install → trial_start → subscribe",
    ],
    notFor: [
      "Apps with no live App Store listing or under 10 ratings",
      "B2B SaaS without a mobile-first experience",
      "Pure web tools without an iOS or Android binary",
    ],
    businessModels: ["subscription-app"],
    campaignTypes: ["launch"],
    awarenessStages: ["problem-aware", "solution-aware"],
    sophistication: ["competitive-market", "skeptical-market"],
    channels: ["meta", "tiktok", "youtube"],
    recommendedModules: [
      "avatars",
      "offer",
      "hooks",
      "scripts",
      "concepts",
      "proof",
      "tracking",
      "review",
      "execution",
      "report",
    ],
    requiredInputs: [
      "audience",
      "audiencePain",
      "differentiator",
      "businessModel",
      "offerContext",
    ],
    proofRequirements: [
      "App Store reviews 4.6+ on 200+ ratings (screen-recorded)",
      "Founder demo video 60-90s with screen recording of the core flow",
      "Before / after testimonial from two early users",
      "App Store screenshots showcasing the first-session value",
      "Trial-to-subscribe conversion data from the last 30 days",
      "On-camera UGC from one real user describing the core outcome",
    ],
    executionSteps: [
      {
        order: 1,
        module: "avatars",
        title: "Define 2-3 install-ready avatars",
        description:
          "Pin the buying trigger, the first-session expectation, and the top objection per avatar (price, trust, fit).",
      },
      {
        order: 2,
        module: "offer",
        title: "Set the trial / paywall shape",
        description:
          "Trial length, what unlocks during trial, and what the paywall surfaces immediately after the aha-moment.",
      },
      {
        order: 3,
        module: "hooks",
        title: "Stack hooks against objections",
        description:
          "One hook per objection, each leading with proof or a concrete outcome. Avoid category clichés.",
      },
      {
        order: 4,
        module: "scripts",
        title: "Write 9:16 scripts for TikTok and Reels",
        description:
          "Hook in the first second. Pay off the curiosity by 3s. Demo the aha-moment, then call to install.",
      },
      {
        order: 5,
        module: "proof",
        title: "Capture must-have proof",
        description:
          "App Store screenshots, founder demo, and at least one named-user UGC clip before any paid spend.",
        gate: "proofAssetPlan.minimumProofSet captured",
      },
      {
        order: 6,
        module: "tracking",
        title: "Wire SKAdNetwork + post-install events",
        description:
          "Confirm install, trial_start, and subscribe events fire on the platform and the MMP. Match the ad-set optimization event.",
        gate: "trackingReadiness.score >= 70",
      },
      {
        order: 7,
        module: "review",
        title: "Approve positioning, offer, proof, batch",
        description:
          "Critical sign-off on positioning, offer, the proof set, and the first 4-6 test cells.",
        gate: "reviewBoard.approvalReadiness === 'ready'",
      },
      {
        order: 8,
        module: "execution",
        title: "Launch a 4-6 cell video-first batch",
        description:
          "Video 9:16 prospecting on Meta and TikTok. One variable per cell: hook, format, or audience tier.",
      },
    ],
    launchGates: [
      "trackingReadiness.score >= 70 with install + subscribe firing",
      "proofAssetPlan.minimumProofSet captured (reviews + demo)",
      "creativeTestingMatrix has >= 4 cells across at least 2 hooks",
      "creativeQa has no blocker findings on hook clarity or first-frame",
      "reviewBoard.approvalReadiness === 'ready'",
      "SKAdNetwork / privacy permissions confirmed",
    ],
    defaultTestPlan: {
      cellCount: { min: 4, max: 6 },
      formats: ["video-9-16", "video-1-1", "static-4-5"],
      oneVariableAtATime: true,
      budgetGuidance:
        "Budget 1.5-2x your target trial_start cost per cell per day with a 5-day learning window before any kill or scale call.",
      killRuleHint:
        "Kill a cell when CPI exceeds 2.5x target after $100 spend with no subscribe events.",
      scaleRuleHint:
        "Duplicate a cell into a scale campaign once CPI stays under target for 48h with a subscribe rate at or above baseline.",
    },
    reportingFocus: [
      "install",
      "cpi",
      "trial_start",
      "subscribe",
      "d7_retention",
      "blended_payback",
    ],
    reviewRequirements: [
      "positioning",
      "offer",
      "proof-assets",
      "first-test-batch",
      "campaign-setup",
      "client-report",
    ],
    estimatedTimelineDays: { min: 14, max: 21 },
    riskNotes: [
      "Without 4.6+ App Store ratings, install cost will inflate after the first cohort burns out.",
      "Privacy attribution gaps (iOS SKAdNetwork) make subscribe-rate signal noisy in week one.",
      "Underwhelming first-session activation will torpedo the funnel regardless of creative quality.",
    ],
  },
  "dating-app-launch": {
    id: "dating-app-launch",
    name: "Dating app launch",
    category: "launch",
    bestFor: [
      "Consumer dating apps in a mature category",
      "Skeptical or mature-market audiences expecting safety claims",
      "Subscription-app business models with profile_completion as activation",
      "Teams that have a founder story or differentiator to lean on",
    ],
    notFor: [
      "Apps without age-gating or safety review complete",
      "Categories with no observable differentiator vs. Tinder / Hinge / Bumble",
      "Teams without a real user UGC pipeline to fuel iteration",
    ],
    businessModels: ["subscription-app"],
    campaignTypes: ["launch"],
    awarenessStages: ["problem-aware", "solution-aware"],
    sophistication: ["skeptical-market", "mature-market"],
    channels: ["tiktok", "meta", "reddit"],
    recommendedModules: [
      "avatars",
      "offer",
      "hooks",
      "scripts",
      "concepts",
      "proof",
      "tracking",
      "review",
      "execution",
      "report",
    ],
    requiredInputs: [
      "audience",
      "audiencePain",
      "differentiator",
      "businessModel",
      "sophistication",
    ],
    proofRequirements: [
      "Founder story explaining why this app exists, 45-60s on camera",
      "Before / after profile example showing depth vs. shallow swipes",
      "Safety / moderation claim with concrete steps (verified profiles, reporting flow)",
      "Two real-user testimonials about a first-match or first-conversation",
      "Screen recording of the matching flow in under 30 seconds",
      "Aggregate review or rating screenshot when available",
    ],
    executionSteps: [
      {
        order: 1,
        module: "avatars",
        title: "Define real-singles avatars",
        description:
          "Pin two avatars: the swipe-fatigued late-20s user and the values-first early-30s user. Capture the deep pain in their voice.",
      },
      {
        order: 2,
        module: "offer",
        title: "Shape the free → paid path",
        description:
          "Free core matching, paid for compatibility depth. Define exactly what is gated and why it is worth paying for.",
      },
      {
        order: 3,
        module: "hooks",
        title: "Lead with anti-shallow hooks",
        description:
          "Hooks call out the swipe-fatigue pain by name. Pair each with a concrete answer the app provides — not a category cliché.",
      },
      {
        order: 4,
        module: "scripts",
        title: "Write founder-led 9:16 scripts",
        description:
          "Founder on camera, pain in the first 2s, mechanism in the next 4s, and one concrete proof beat before the install CTA.",
      },
      {
        order: 5,
        module: "proof",
        title: "Capture safety + depth proof",
        description:
          "Founder story, two real-user testimonials, and the screen recording of the matching flow. Confirm safety claims have evidence.",
        gate: "proofAssetPlan.proofReadinessScore >= 60",
      },
      {
        order: 6,
        module: "tracking",
        title: "Wire install + profile_completion + subscribe",
        description:
          "Match the optimization event to the activation moment, not to install. Add a post-install survey to capture source.",
        gate: "trackingReadiness.score >= 70",
      },
      {
        order: 7,
        module: "review",
        title: "Approve positioning, offer, proof, batch",
        description:
          "Sign-off on positioning, offer, the proof set, and the first 3-5 test cells before paid spend.",
        gate: "reviewBoard.approvalReadiness === 'ready'",
      },
      {
        order: 8,
        module: "execution",
        title: "Launch on TikTok-first with Meta echo",
        description:
          "TikTok 9:16 with founder UGC drives prospecting. Meta echoes the winners. Reddit as a values-led discovery channel.",
      },
    ],
    launchGates: [
      "Age-gating and platform-policy compliance confirmed",
      "proofAssetPlan.proofReadinessScore >= 60 with founder story captured",
      "trackingReadiness.score >= 70 with install + subscribe firing",
      "creativeTestingMatrix has >= 3 cells across at least 2 hooks",
      "reviewBoard.approvalReadiness === 'ready' covering positioning + offer + proof",
    ],
    defaultTestPlan: {
      cellCount: { min: 3, max: 5 },
      formats: ["video-9-16", "video-1-1"],
      oneVariableAtATime: true,
      budgetGuidance:
        "Budget 1.5x target CPI per cell per day; expect a 5-7 day learning window because TikTok creative variance is high.",
      killRuleHint:
        "Kill a cell when CPI exceeds 2x target after $150 spend with profile_completion below 40%.",
      scaleRuleHint:
        "Duplicate a cell to a scale campaign once CPI holds under target for 72h with profile_completion at or above baseline.",
    },
    reportingFocus: [
      "install",
      "cpi",
      "profile_completion",
      "first_match",
      "trial_start",
      "subscribe",
    ],
    reviewRequirements: [
      "positioning",
      "offer",
      "proof-assets",
      "first-test-batch",
      "client-report",
    ],
    estimatedTimelineDays: { min: 14, max: 28 },
    riskNotes: [
      "Platform policy on dating ads is strict — vague body or appearance claims will be rejected.",
      "Category sophistication is mature; without a named mechanism the hook will read like every other dating app.",
      "Safety claims without evidence draw a higher-than-usual rejection and trust-cost.",
      "Profile_completion activation gap is the hidden killer; fix activation before scaling paid spend.",
    ],
  },
  "ecommerce-seasonal-promo": {
    id: "ecommerce-seasonal-promo",
    name: "E-commerce seasonal promo",
    category: "seasonal",
    bestFor: [
      "Physical-goods stores with a clear seasonal peak window",
      "Three-tier promo: cold prospecting + engaged retargeting + site retargeting",
      "Brands with at least 50 reviews and one UGC clip ready",
      "Teams that can read ROAS in-platform inside 48h",
    ],
    notFor: [
      "Brands with a sub-15% gross margin where discounts kill payback",
      "Stores without AddToCart or Purchase events firing reliably",
      "Pure-launch products with no existing customer pool",
    ],
    businessModels: ["ecommerce"],
    campaignTypes: ["promo-3-tier", "seasonal"],
    awarenessStages: ["problem-aware", "solution-aware", "product-aware"],
    sophistication: ["competitive-market", "skeptical-market"],
    channels: ["meta", "google-pmax", "tiktok", "email"],
    recommendedModules: [
      "offer",
      "calendar",
      "concepts",
      "static-briefs",
      "cta-bank",
      "proof",
      "tracking",
      "execution",
      "report",
    ],
    requiredInputs: [
      "audience",
      "differentiator",
      "businessModel",
      "offerContext",
    ],
    proofRequirements: [
      "Product demo video, 30-45s clean cut",
      "UGC clip from a real customer using the product",
      "Customer review screenshots (3-5, recent, named)",
      "Star-rating aggregate (Yotpo / Trustpilot / Google) at 4.5+",
      "Lifestyle / in-context photos at 1:1 and 4:5",
      "Before / after on the primary outcome the product delivers",
    ],
    executionSteps: [
      {
        order: 1,
        module: "offer",
        title: "Pick the promo shape",
        description:
          "Discount tier, bundle, or free-gift threshold. Validate breakeven ROAS against COGS + ad cost before locking the offer.",
      },
      {
        order: 2,
        module: "calendar",
        title: "Map the 3-tier promo calendar",
        description:
          "Lead-in → warm-up → ramp → peak → echo → tail. Pin the peak window and confirm the retrospective gate plan.",
      },
      {
        order: 3,
        module: "concepts",
        title: "Ship 3-5 concept cards",
        description:
          "Each concept pairs a hero proof element with a CTA badge and a clear visual hierarchy.",
      },
      {
        order: 4,
        module: "static-briefs",
        title: "Brief static creative across 1:1, 4:5, 9:16",
        description:
          "First-frame clarity, proof strip near the hero, a CTA chip, and a price anchor when the promo is a discount.",
      },
      {
        order: 5,
        module: "tracking",
        title: "Wire AddToCart, InitiateCheckout, Purchase",
        description:
          "Verify Purchase fires with value + currency. Wire exclusions so retargeting does not double-spend on converters.",
        gate: "trackingReadiness.score >= 70",
      },
      {
        order: 6,
        module: "execution",
        title: "Launch 3-tier audience architecture",
        description:
          "Cold prospecting + engaged retargeting + site retargeting, with a 60/25/15 budget split as the starting point.",
      },
      {
        order: 7,
        module: "report",
        title: "Report on ROAS, AOV, Purchase",
        description:
          "Spotlight ROAS, AOV, add_to_cart rate, and Purchase volume. Note frequency on retargeting tiers.",
      },
    ],
    launchGates: [
      "trackingReadiness.score >= 70 with Purchase firing with value",
      "AddToCart firing on PDP and quick-view",
      "Breakeven ROAS computed and the promo tier is above it",
      "creativeTestingMatrix has >= 4 cells with both static and video",
      "reviewBoard covers offer + first-test-batch + campaign-setup",
    ],
    defaultTestPlan: {
      cellCount: { min: 4, max: 8 },
      formats: ["static-4-5", "video-9-16", "carousel", "static-1-1"],
      oneVariableAtATime: true,
      budgetGuidance:
        "Budget per cell at 3-5x target CPA per day; promo windows compress learning so be ready to act in 48h.",
      killRuleHint:
        "Kill a cell when ROAS stays below 0.7x breakeven after spend reaches 3x target CPA.",
      scaleRuleHint:
        "Raise budget by 20% on cells with ROAS at or above target for 48h, with frequency under 2.0 on retargeting tiers.",
    },
    reportingFocus: [
      "roas",
      "aov",
      "ctr",
      "add_to_cart_rate",
      "purchase",
      "frequency",
    ],
    reviewRequirements: [
      "offer",
      "proof-assets",
      "first-test-batch",
      "campaign-setup",
    ],
    estimatedTimelineDays: { min: 7, max: 14 },
    riskNotes: [
      "Discounting below margin discipline turns ROAS into a vanity metric.",
      "Purchase events lag clicks; do not kill cells before the lag clears.",
      "Site retargeting will saturate fast; rotate creative or watch frequency climb.",
    ],
  },
  "local-service-leadgen": {
    id: "local-service-leadgen",
    name: "Local service lead-gen",
    category: "leadgen",
    bestFor: [
      "Local service businesses with a defined service area",
      "Owner / operator businesses with before-after evidence to show",
      "Always-on cadence targeting cost-per-qualified-lead",
      "Teams with a phone or form intake they can answer fast",
    ],
    notFor: [
      "National brands without a clear geo target",
      "Service categories with no measurable outcome to show",
      "Operators without a way to qualify leads inside 24 hours",
    ],
    businessModels: ["local-service"],
    campaignTypes: ["always-on"],
    awarenessStages: ["problem-aware", "solution-aware"],
    sophistication: ["competitive-market", "skeptical-market"],
    channels: ["meta", "google-search", "google-pmax"],
    recommendedModules: [
      "offer",
      "calendar",
      "concepts",
      "static-briefs",
      "cta-bank",
      "proof",
      "tracking",
      "execution",
      "report",
    ],
    requiredInputs: [
      "audience",
      "audiencePain",
      "differentiator",
      "businessModel",
    ],
    proofRequirements: [
      "Before / after photos from at least three real jobs",
      "Local-area testimonial naming a neighborhood or city",
      "Google reviews aggregate at 4.7+ across 50+ ratings",
      "Owner or technician on-camera intro, 30-45s",
      "Service area map with the geo footprint highlighted",
    ],
    executionSteps: [
      {
        order: 1,
        module: "offer",
        title: "Shape the lead magnet",
        description:
          "Free quote, free inspection, or first-visit discount. Pin the call-to-action that fits the service category.",
      },
      {
        order: 2,
        module: "concepts",
        title: "Build before-after concept cards",
        description:
          "Hero element is a real job, not a stock photo. Proof element is the named local-area testimonial.",
      },
      {
        order: 3,
        module: "static-briefs",
        title: "Brief 1:1 and carousel statics",
        description:
          "1:1 for feed, carousel for proof walk-through. Keep the local-area name visible above the fold.",
      },
      {
        order: 4,
        module: "tracking",
        title: "Wire lead-form, call, and qualified-lead",
        description:
          "Form submit event with consent flag, call event with duration threshold, and a manual qualified-lead flip from the operator.",
        gate: "trackingReadiness.score >= 70",
      },
      {
        order: 5,
        module: "execution",
        title: "Launch geo-targeted prospecting",
        description:
          "Tight geo radius around the service area on Meta plus a branded + service-keyword campaign on Google Search.",
      },
      {
        order: 6,
        module: "review",
        title: "Approve offer, batch, and tracking",
        description:
          "Stakeholder sign-off on the offer, the first batch of cells, and that tracking + qualified-lead flow are live.",
      },
      {
        order: 7,
        module: "report",
        title: "Report on CPL and booked appointments",
        description:
          "Spotlight cost-per-lead, qualified-lead rate, booked appointments, and show rate.",
      },
    ],
    launchGates: [
      "trackingReadiness.score >= 70 with lead-form + call events firing",
      "Qualified-lead flip flow defined and the operator is committed to it",
      "Local-area geo-targeting wired correctly per ad set",
      "creativeTestingMatrix has >= 3 cells across at least 2 angles",
      "reviewBoard covers offer + first-test-batch",
    ],
    defaultTestPlan: {
      cellCount: { min: 3, max: 5 },
      formats: ["static-1-1", "carousel", "video-9-16"],
      oneVariableAtATime: true,
      budgetGuidance:
        "Budget per cell at 2-3x target CPL per day; allow 7-10 days because local-service decisions are slower.",
      killRuleHint:
        "Kill a cell when CPL exceeds 2x target after 5 days with qualified-lead rate below 25%.",
      scaleRuleHint:
        "Broaden the geo radius or raise budget by 20% once CPL holds under target for a week with qualified-lead rate at or above baseline.",
    },
    reportingFocus: [
      "cpl",
      "lead_quality",
      "booked_appointments",
      "show_rate",
      "cost_per_booked_job",
    ],
    reviewRequirements: ["offer", "first-test-batch", "tracking-readiness"],
    estimatedTimelineDays: { min: 10, max: 21 },
    riskNotes: [
      "Lead volume without qualified-lead discipline burns ad budget on tire-kickers.",
      "Geo over-broadening dilutes spend and inflates CPL within a week.",
      "Slow response times will collapse show rate even when lead volume looks healthy.",
    ],
  },
  "creator-product-drop": {
    id: "creator-product-drop",
    name: "Creator product drop",
    category: "launch",
    bestFor: [
      "Creators with an engaged organic following dropping a product",
      "Behind-the-scenes content and a pre-launch waitlist",
      "Launches where the creator story is the central differentiator",
      "Teams with one shot at a launch window — no soft launch",
    ],
    notFor: [
      "Brands without an existing creator-led audience",
      "Categories where the product cannot be demoed visually",
      "Drops that lack a clear launch date or scarcity hook",
    ],
    businessModels: ["creator-product"],
    campaignTypes: ["launch"],
    awarenessStages: ["solution-aware", "product-aware", "most-aware"],
    sophistication: ["competitive-market", "skeptical-market"],
    channels: ["organic-social", "meta", "tiktok", "email"],
    recommendedModules: [
      "avatars",
      "hooks",
      "scripts",
      "concepts",
      "calendar",
      "proof",
      "tracking",
      "execution",
      "report",
    ],
    requiredInputs: [
      "audience",
      "differentiator",
      "businessModel",
      "offerContext",
    ],
    proofRequirements: [
      "Creator story explaining why this product exists, 60-90s",
      "Behind-the-scenes footage of product development",
      "Pre-launch waitlist size with a screenshot of the sign-up count",
      "Early-user UGC from the beta or pre-order cohort",
      "Founder-on-camera unboxing or first-use video",
    ],
    executionSteps: [
      {
        order: 1,
        module: "avatars",
        title: "Define the creator's superfan + adjacent buyer",
        description:
          "Two avatars: the superfan who buys on day one, and the adjacent buyer who needs proof before clicking checkout.",
      },
      {
        order: 2,
        module: "calendar",
        title: "Map the drop calendar",
        description:
          "Lead-in (pre-launch waitlist) → warm-up → ramp → peak (drop day) → echo. Pin the peak day and the scarcity mechanism.",
      },
      {
        order: 3,
        module: "hooks",
        title: "Lead with creator-story hooks",
        description:
          "Hooks pull from the creator's voice, not a brand-marketing tone. Pair each with a concrete product beat.",
      },
      {
        order: 4,
        module: "scripts",
        title: "Write 9:16 founder-led scripts",
        description:
          "Founder on camera. Story → behind-the-scenes → product reveal → scarcity beat → CTA.",
      },
      {
        order: 5,
        module: "proof",
        title: "Capture story + waitlist proof",
        description:
          "Creator story, behind-the-scenes, and the waitlist screenshot. Add one UGC clip if the beta cohort is ready.",
        gate: "proofAssetPlan.minimumProofSet captured",
      },
      {
        order: 6,
        module: "tracking",
        title: "Wire email signup + Purchase",
        description:
          "Email-signup event for the waitlist, Purchase event with value + currency. UTMs distinct between paid and creator channels.",
        gate: "trackingReadiness.score >= 70",
      },
      {
        order: 7,
        module: "execution",
        title: "Launch creator + paid amplification",
        description:
          "Organic from the creator channel drives the launch; paid amplifies the highest-engagement clips into prospecting and retargeting.",
      },
    ],
    launchGates: [
      "Waitlist size meets the agreed minimum (e.g. 1000 signups)",
      "trackingReadiness.score >= 70 with Purchase firing",
      "proofAssetPlan.minimumProofSet captured (creator story + waitlist)",
      "creativeTestingMatrix has >= 3 cells with at least 2 hooks",
      "reviewBoard covers positioning + offer + proof",
    ],
    defaultTestPlan: {
      cellCount: { min: 3, max: 5 },
      formats: ["video-9-16", "video-1-1", "static-4-5"],
      oneVariableAtATime: true,
      budgetGuidance:
        "Front-load budget in the 48h around the drop day; lead-in spend stays light to protect the launch-day moment.",
      killRuleHint:
        "Kill a cell when CPM stays above 2.5x baseline after $200 spend with no purchase events.",
      scaleRuleHint:
        "Raise budget on the cell that drives the highest waitlist → purchase rate as soon as the drop window opens.",
    },
    reportingFocus: [
      "waitlist_signups",
      "purchase",
      "aov",
      "creator_channel_share",
      "blended_roas",
    ],
    reviewRequirements: [
      "positioning",
      "offer",
      "proof-assets",
      "first-test-batch",
    ],
    estimatedTimelineDays: { min: 14, max: 28 },
    riskNotes: [
      "Drop launches are one-shot — a weak waitlist signal pre-drop will not magically lift on drop day.",
      "Creator voice and brand voice are not the same; brand-tone hooks will under-perform.",
      "Scarcity without genuine inventory limits erodes trust the next time around.",
    ],
  },
  "waitlist-launch": {
    id: "waitlist-launch",
    name: "Waitlist launch",
    category: "launch",
    bestFor: [
      "Products in pre-launch needing demand validation",
      "Teams without a paid product yet — capturing email + intent",
      "Categories where early-access screenshots tell the story",
      "Founders building a list before activating paid for a real launch",
    ],
    notFor: [
      "Products already live with a paid funnel ready to spend",
      "Categories where the email list cannot translate to buyers",
      "Teams without a lead-magnet or clear early-access promise",
    ],
    businessModels: ["saas", "subscription-app", "creator-product"],
    campaignTypes: ["launch"],
    awarenessStages: ["unaware", "problem-aware", "solution-aware"],
    sophistication: ["green-market", "competitive-market"],
    channels: ["meta", "tiktok", "reddit", "x"],
    recommendedModules: [
      "avatars",
      "offer",
      "hooks",
      "scripts",
      "concepts",
      "proof",
      "tracking",
      "execution",
      "report",
    ],
    requiredInputs: ["audience", "audiencePain", "differentiator"],
    proofRequirements: [
      "Early-access product screenshots showing the core flow",
      "Founder story explaining the problem and the why-now",
      "Problem statement validated against 5+ target users",
      "Lead-magnet asset (PDF, template, calculator) the audience values",
    ],
    executionSteps: [
      {
        order: 1,
        module: "avatars",
        title: "Pin the early-adopter avatar",
        description:
          "Define the early-adopter who will give an email for early access — and the deeper pain they want solved first.",
      },
      {
        order: 2,
        module: "offer",
        title: "Shape the early-access offer",
        description:
          "What do they get for joining? Early access, a discount, a lead magnet, or a guaranteed slot. Pin the trade.",
      },
      {
        order: 3,
        module: "hooks",
        title: "Lead with the problem in the audience's voice",
        description:
          "Hooks restate the pain in plain language. Avoid product-aware framing — most of this audience is problem-aware.",
      },
      {
        order: 4,
        module: "scripts",
        title: "Write short-form story-led scripts",
        description:
          "Problem → why now → early-access promise → CTA. Sub-30s for 9:16, 1 sentence for static.",
      },
      {
        order: 5,
        module: "tracking",
        title: "Wire email-signup + landing events",
        description:
          "Email-signup as the primary conversion event. Track landing time-on-page so cell quality is readable beyond signups.",
        gate: "trackingReadiness.score >= 70",
      },
      {
        order: 6,
        module: "execution",
        title: "Launch a 3-5 cell prospecting batch",
        description:
          "Static and 9:16 cells. One variable per cell: hook, lead-magnet, or visual. Keep the landing identical across cells.",
      },
      {
        order: 7,
        module: "report",
        title: "Report on CPL and list-to-buyer proxy",
        description:
          "Spotlight cost-per-signup, waitlist size, and the list-to-buyer rate proxy once the launch window opens.",
      },
    ],
    launchGates: [
      "Lead-magnet or early-access promise ready",
      "trackingReadiness.score >= 70 with email-signup firing",
      "creativeTestingMatrix has >= 3 cells across at least 2 hooks",
      "Landing page conversion rate above 5% on warm traffic before scaling",
    ],
    defaultTestPlan: {
      cellCount: { min: 3, max: 5 },
      formats: ["static-1-1", "static-4-5", "video-9-16"],
      oneVariableAtATime: true,
      budgetGuidance:
        "Budget per cell at 1.5-2x target CPL per day; the goal is signal on hooks, not maximum signup volume.",
      killRuleHint:
        "Kill a cell when CPL exceeds 2x target after $100 spend with landing CVR below 5%.",
      scaleRuleHint:
        "Raise budget on the cell with the highest landing CVR once CPL holds under target for 48h.",
    },
    reportingFocus: [
      "cpl",
      "waitlist_size",
      "landing_cvr",
      "list_to_buyer_rate_proxy",
    ],
    reviewRequirements: ["positioning", "offer"],
    estimatedTimelineDays: { min: 7, max: 14 },
    riskNotes: [
      "A big list with no buyer intent is a vanity metric — qualify the lead magnet.",
      "Waitlist hype can over-promise; an underwhelming launch day erodes trust hard.",
      "If the landing CVR is below 5% on warm traffic, cell-level signal is unreliable.",
    ],
  },
  "retargeting-rescue": {
    id: "retargeting-rescue",
    name: "Retargeting rescue",
    category: "rescue",
    bestFor: [
      "Brands with a 60-day site retargeting pool of 1000+ visitors",
      "Active campaigns that lost ROAS in the last 14 days",
      "Categories where star ratings + risk-reversal + scarcity move the needle",
      "Teams that can rotate creative weekly to fight frequency",
    ],
    notFor: [
      "Cold launches with no existing retargeting pool",
      "Brands without Purchase / Lead events firing reliably",
      "Categories where retargeting is policy-restricted (health, finance)",
      "Pools under 1000 visitors that cannot support stable optimization",
    ],
    businessModels: ["ecommerce", "saas", "subscription-app"],
    campaignTypes: ["always-on"],
    awarenessStages: ["product-aware", "most-aware"],
    sophistication: ["competitive-market", "skeptical-market", "mature-market"],
    channels: ["meta", "google-pmax"],
    recommendedModules: [
      "concepts",
      "static-briefs",
      "cta-bank",
      "proof",
      "tracking",
      "execution",
      "report",
    ],
    requiredInputs: ["businessModel", "audience"],
    proofRequirements: [
      "Star-rating aggregate (4.5+) with review count visible",
      "Customer review screenshots with named purchaser",
      "Risk-reversal copy: refund, guarantee, or trial extension",
      "Scarcity beat: low stock, time-limited bonus, cohort-based onboarding",
      "Comparison artifact vs. the closest alternative",
    ],
    executionSteps: [
      {
        order: 1,
        module: "concepts",
        title: "Build risk-reversal + scarcity cards",
        description:
          "Concepts lead with proof aggregate, lean on guarantees, and pair with a scarcity beat the user can verify.",
      },
      {
        order: 2,
        module: "static-briefs",
        title: "Brief 1:1 statics and carousel",
        description:
          "1:1 for feed, carousel walking review screenshots, the guarantee, and the comparison artifact.",
      },
      {
        order: 3,
        module: "cta-bank",
        title: "Refresh CTAs for warm audiences",
        description:
          "Direct, time-boxed, and proof-led CTAs. Avoid first-touch curiosity hooks — the audience already knows the product.",
      },
      {
        order: 4,
        module: "tracking",
        title: "Confirm exclusions + conversion events",
        description:
          "Exclude converters and recent purchasers. Confirm Purchase / Lead events fire with value so frequency optimization works.",
        gate: "trackingReadiness.score >= 70",
      },
      {
        order: 5,
        module: "execution",
        title: "Launch retargeting tiers with frequency caps",
        description:
          "Site retargeting 60d, video viewers 25%+, engagers 90d. Frequency cap below 3.0 to fight ad fatigue.",
      },
      {
        order: 6,
        module: "report",
        title: "Report on ROAS, frequency, view-to-purchase",
        description:
          "Spotlight ROAS, frequency, and view_content → purchase ratio. Watch fatigue weekly.",
      },
    ],
    launchGates: [
      "Retargeting pool >= 1000 visitors in the 60-day window",
      "Exclusion audiences wired so converters are not re-targeted",
      "trackingReadiness.score >= 70 with Purchase / Lead firing",
      "creativeTestingMatrix has >= 3 fresh cells to fight fatigue",
      "Frequency cap configured at the ad-set level",
    ],
    defaultTestPlan: {
      cellCount: { min: 3, max: 5 },
      formats: ["static-1-1", "carousel", "static-4-5"],
      oneVariableAtATime: true,
      budgetGuidance:
        "Budget at 1-2x target CPA per day per cell — retargeting pools saturate fast so do not over-spend.",
      killRuleHint:
        "Kill a cell when ROAS stays below 1x breakeven for 5 days with frequency above 3.0.",
      scaleRuleHint:
        "Rotate creative weekly; raise budget only when ROAS holds above target with frequency below 2.5.",
    },
    reportingFocus: [
      "roas",
      "frequency",
      "view_content_to_purchase",
      "cpa",
      "fatigue_signal",
    ],
    reviewRequirements: ["offer", "campaign-setup"],
    estimatedTimelineDays: { min: 5, max: 10 },
    riskNotes: [
      "Retargeting on a thin pool fatigues users and burns ad spend on a re-circulating cohort.",
      "Without exclusions, recent converters see ads they should not — wasted spend and trust hit.",
      "Frequency above 3.0 corrodes ROAS and brand affinity within a week.",
      "Not for cold launches — needs an existing pool of 1000+ qualified visitors.",
    ],
  },
  "landing-cro-sprint": {
    id: "landing-cro-sprint",
    name: "Landing CRO sprint",
    category: "cro",
    bestFor: [
      "Funnels where the bottleneck is the landing page, not the ad",
      "Brands with a baseline conversion rate measurable inside 7 days",
      "Above-fold proof + headline-clarity testing on warm traffic",
      "Teams that can ship landing variants quickly",
    ],
    notFor: [
      "Funnels with under 1000 weekly landing visitors (signal is too thin)",
      "Brands without baseline conversion-rate data to compare against",
      "Categories where the landing page is not a controllable surface (App Store, marketplace)",
    ],
    businessModels: ["saas", "ecommerce", "subscription-app", "creator-product"],
    campaignTypes: ["always-on", "evergreen"],
    awarenessStages: ["solution-aware", "product-aware", "most-aware"],
    sophistication: ["competitive-market", "skeptical-market"],
    channels: ["meta", "google-search"],
    recommendedModules: [
      "positioning",
      "offer",
      "concepts",
      "proof",
      "tracking",
      "execution",
      "report",
    ],
    requiredInputs: ["audience", "differentiator", "goal"],
    proofRequirements: [
      "Above-fold customer quote with a named purchaser",
      "Star-rating aggregate or trust badge near the hero",
      "Concrete outcome metric (% lift, $ saved, hours back)",
      "Comparison or before-after element above the fold",
      "Risk-reversal (guarantee, trial extension, refund clarity)",
    ],
    executionSteps: [
      {
        order: 1,
        module: "positioning",
        title: "Audit the headline for clarity",
        description:
          "Read the headline cold. Does it name the audience, the outcome, and the unique mechanism in one sentence?",
      },
      {
        order: 2,
        module: "proof",
        title: "Pull proof above the fold",
        description:
          "Above-fold proof: customer quote, star rating, or comparison artifact. Anything below the fold is invisible to most of the traffic.",
      },
      {
        order: 3,
        module: "concepts",
        title: "Brief 2 landing variants",
        description:
          "Variant A: headline clarity test. Variant B: above-fold proof test. One variable at a time, identical CTA.",
      },
      {
        order: 4,
        module: "tracking",
        title: "Wire conversion + scroll + time-on-page",
        description:
          "Conversion event fires reliably. Scroll depth and time-on-page give you quality signal beyond conversions.",
        gate: "trackingReadiness.score >= 70",
      },
      {
        order: 5,
        module: "execution",
        title: "Run the A/B for 7-14 days",
        description:
          "Drive warm traffic to both variants from the same paid source. Hold all upstream creative constant.",
      },
      {
        order: 6,
        module: "report",
        title: "Report on lift, not gross conversions",
        description:
          "Spotlight conversion-rate lift between variants, plus scroll depth and time-on-page deltas.",
      },
    ],
    launchGates: [
      "Baseline conversion-rate data exists from the prior 14 days",
      "trackingReadiness.score >= 70 with conversion event firing",
      "Two landing variants ready with one variable changed",
      "creativeTestingMatrix paired creative is aligned to landing variants",
    ],
    defaultTestPlan: {
      cellCount: { min: 2, max: 4 },
      formats: ["static-1-1", "static-4-5"],
      oneVariableAtATime: true,
      budgetGuidance:
        "Budget enough to hit 100 conversions per variant in 14 days; under that, signal is unreliable.",
      killRuleHint:
        "Kill a variant after 100 conversions with a confidence interval that does not exclude zero lift.",
      scaleRuleHint:
        "Promote the winning variant to the default landing once lift is at or above target with 14 days of data.",
    },
    reportingFocus: [
      "conversion_rate",
      "lift_vs_baseline",
      "time_on_page",
      "scroll_depth",
      "bounce_rate",
    ],
    reviewRequirements: ["positioning", "offer"],
    estimatedTimelineDays: { min: 7, max: 14 },
    riskNotes: [
      "Without baseline conversion data, variant comparison is anecdote, not evidence.",
      "Multi-variable variants make the result unreadable; one variable per test or it doesn't count.",
      "Traffic volume gates significance — 100 conversions per variant is the floor for actionable signal.",
    ],
  },
  "agency-strategy-sprint": {
    id: "agency-strategy-sprint",
    name: "Agency strategy sprint",
    category: "service",
    bestFor: [
      "Agencies onboarding a new client inside 5-7 days",
      "Engagements that deliver strategy + offer + first-test-batch, not live ads",
      "Teams that need positioning, proof gap analysis, and a campaign blueprint",
      "Clients in B2B services, SaaS, or established e-commerce categories",
    ],
    notFor: [
      "Engagements that require campaign go-live inside the same sprint",
      "Clients who have not committed to a strategy-first workflow",
      "Direct-to-consumer launches needing creative production from day one",
    ],
    businessModels: ["b2b-services", "saas", "ecommerce"],
    campaignTypes: ["always-on"],
    awarenessStages: ["problem-aware", "solution-aware", "product-aware"],
    sophistication: ["competitive-market", "skeptical-market"],
    channels: ["linkedin", "google-search", "email"],
    recommendedModules: [
      "avatars",
      "positioning",
      "offer",
      "concepts",
      "proof",
      "tracking",
      "review",
      "report",
    ],
    requiredInputs: ["audience", "differentiator", "goal", "businessModel"],
    proofRequirements: [
      "Agency case study with named client and outcome metric",
      "Client logo wall with three or more named brands",
      "Metric screenshot from a prior engagement",
      "Process diagram showing how the strategy sprint runs",
      "Named-strategist bio with relevant tenure",
    ],
    executionSteps: [
      {
        order: 1,
        module: "avatars",
        title: "Kickoff: gather inputs",
        description:
          "Working session to gather audience, pain, differentiator, goal, sophistication, and any commercial context.",
      },
      {
        order: 2,
        module: "positioning",
        title: "Deliver positioning recommendation",
        description:
          "Recommend a single positioning statement with rationale. Walk the client through it for sign-off.",
      },
      {
        order: 3,
        module: "offer",
        title: "Recommend the top offer + breakeven",
        description:
          "Top offer with rationale, breakeven ROAS computed against COGS / margin, and a stickiness-risk note.",
      },
      {
        order: 4,
        module: "proof",
        title: "Deliver the proof gap analysis",
        description:
          "List must-have proof assets the client owns vs. the ones still to capture. Assign owners and capture instructions.",
      },
      {
        order: 5,
        module: "concepts",
        title: "Define the first-test-batch",
        description:
          "3-6 cells on the (avatar × hook × format × offer) matrix. Each varies on a single axis with a named learning goal.",
      },
      {
        order: 6,
        module: "review",
        title: "Client review and sign-off",
        description:
          "Stakeholder approval on positioning, offer, proof plan, and the first-test-batch before the engagement closes.",
        gate: "reviewBoard.approvalReadiness === 'ready'",
      },
      {
        order: 7,
        module: "report",
        title: "Deliver the strategy doc",
        description:
          "Single-document deliverable bundling positioning, offer, proof plan, first-test-batch, tracking gaps, and next-step recommendations.",
      },
    ],
    launchGates: [
      "Client kickoff session complete with inputs captured",
      "Strategy doc delivered in writing",
      "First-test-batch defined with named learning goals per cell",
      "Proof gap analysis delivered with named owners per gap",
      "reviewBoard covers positioning + offer + proof-assets + first-test-batch + client-report",
    ],
    defaultTestPlan: {
      cellCount: { min: 3, max: 6 },
      formats: ["static-1-1", "static-4-5", "video-9-16"],
      oneVariableAtATime: true,
      budgetGuidance:
        "No live ad budget inside the sprint — the deliverable is the strategy doc and the first-batch plan.",
      killRuleHint:
        "Kill the engagement scope creep when a request lands outside the sprint deliverable list.",
      scaleRuleHint:
        "Scale into a launch-sprint or growth-os-setup once the client signs off on the strategy doc.",
    },
    reportingFocus: [
      "strategy_doc_delivered",
      "first_batch_defined",
      "client_approvals",
      "proof_gaps_resolved",
      "tracking_gaps_resolved",
    ],
    reviewRequirements: [
      "positioning",
      "offer",
      "proof-assets",
      "first-test-batch",
      "client-report",
    ],
    estimatedTimelineDays: { min: 5, max: 7 },
    riskNotes: [
      "Strategy sprints fail when the client cannot commit to a strategy-first cadence.",
      "Inputs gathered in one session are partial — leave time for two follow-up rounds.",
      "Scope creep into creative production blows the timeline if it is not pushed into the next engagement.",
    ],
  },
});

// ---- Helpers ----------------------------------------------------------

export function getPlaybook(id: PlaybookId): Playbook {
  return PLAYBOOKS[id];
}

export function listPlaybooks(): Playbook[] {
  return [
    PLAYBOOKS["saas-free-trial-launch"],
    PLAYBOOKS["mobile-app-launch"],
    PLAYBOOKS["dating-app-launch"],
    PLAYBOOKS["ecommerce-seasonal-promo"],
    PLAYBOOKS["local-service-leadgen"],
    PLAYBOOKS["creator-product-drop"],
    PLAYBOOKS["waitlist-launch"],
    PLAYBOOKS["retargeting-rescue"],
    PLAYBOOKS["landing-cro-sprint"],
    PLAYBOOKS["agency-strategy-sprint"],
  ];
}
