// catalog.ts — frozen, deterministic registries for the Agency
// Packaging Layer.
//
// Three registries: project templates (campaign-type / business-model
// defaults), role presets (cares / approves / hides), and package
// presets (deliverables / timeline / scope / acceptance). Every entry
// is content-complete: no placeholders, no TODOs. The catalog is read
// by AgencyPanel for selection and by buildDeliverySummary for context.
//
// Pure data + helper getters. No engine coupling. No `Date.now()`.

import type {
  AgencyRoleId,
  PackagePreset,
  PackagePresetId,
  ProjectTemplate,
  ProjectTemplateId,
  RolePreset,
} from "@/types/agency";

// ---- Project templates ------------------------------------------------

export const PROJECT_TEMPLATES: Record<ProjectTemplateId, ProjectTemplate> =
  Object.freeze({
    "app-launch": {
      id: "app-launch",
      label: "App launch",
      summary:
        "Subscription mobile app preparing for a 14-day paid acquisition launch. Optimises for trial starts and first-week subscribes.",
      campaignType: "launch",
      businessModel: "subscription-app",
      defaultProofRequirements: [
        "App Store reviews 4.6+ on 200+ ratings",
        "Founder demo video (60-90s, screen-recorded)",
        "Before / after testimonial from two early users",
        "App-store screenshots showcasing the core flow",
        "Trial-to-subscribe conversion data from the last 30 days",
      ],
      trackingChecklistEmphasis: [
        "trial_start event firing on the install / trial trigger",
        "subscribe event firing on first paid renewal",
        "store-listing UTM parameters present on every paid link",
        "Post-install survey live to capture self-reported source",
      ],
      recommendedOutputSections: [
        "avatars",
        "offer",
        "concepts",
        "hooks",
        "scripts",
        "proof",
        "execution",
      ],
      recommendedReportSections: [
        "strategy-snapshot",
        "offer",
        "calendar",
        "proof",
        "execution",
        "decision-log",
      ],
      reviewApprovalItems: [
        "positioning",
        "offer",
        "proof-assets",
        "first-test-batch",
        "campaign-setup",
        "client-report",
      ],
      defaultPackage: "launch-sprint",
    },
    "ecommerce-seasonal": {
      id: "ecommerce-seasonal",
      label: "E-commerce seasonal",
      summary:
        "Three-tier promo push for a physical-goods store leading into a seasonal peak. Optimises for ROAS and revenue inside a fixed window.",
      campaignType: "promo-3-tier",
      businessModel: "ecommerce",
      defaultProofRequirements: [
        "Product demo video (clean, 30-45s)",
        "UGC clip from a real customer",
        "Customer review screenshots (3-5, recent)",
        "Lifestyle / in-context photos at 1:1 and 4:5",
        "Before / after on the primary outcome the product delivers",
      ],
      trackingChecklistEmphasis: [
        "AddToCart firing on PDP and quick-view",
        "InitiateCheckout firing on checkout-step-1",
        "Purchase event with value + currency",
        "Real-time ROAS readable inside the ad platform",
        "Exclusions wired so re-targeting does not double-spend on the same cohort",
      ],
      recommendedOutputSections: [
        "offer",
        "calendar",
        "concepts",
        "static-briefs",
        "cta-bank",
        "execution",
      ],
      recommendedReportSections: [
        "strategy-snapshot",
        "offer",
        "calendar",
        "execution",
        "decision-log",
      ],
      reviewApprovalItems: [
        "positioning",
        "offer",
        "proof-assets",
        "first-test-batch",
        "campaign-setup",
        "client-report",
      ],
      defaultPackage: "launch-sprint",
    },
    "saas-evergreen": {
      id: "saas-evergreen",
      label: "SaaS evergreen",
      summary:
        "B2B SaaS in evergreen mode optimising for qualified-lead pipeline and trial activation. Memory-driven iteration cadence.",
      campaignType: "evergreen",
      businessModel: "saas",
      defaultProofRequirements: [
        "Case study (1 page, named customer with metric)",
        "Metric screenshot from the live product dashboard",
        "Customer quote with role + company",
        "Side-by-side comparison vs. the closest competitor",
      ],
      trackingChecklistEmphasis: [
        "Lead event firing on the demo / trial form submit",
        "Trial-start event firing inside the product",
        "Activation event firing on the chosen aha-moment action",
        "MQL → SQL hand-off tracked in the CRM",
      ],
      recommendedOutputSections: [
        "avatars",
        "offer",
        "concepts",
        "hooks",
        "scripts",
        "kpi-ladder",
        "execution",
      ],
      recommendedReportSections: [
        "strategy-snapshot",
        "offer",
        "kpi-ladder",
        "execution",
        "decision-log",
      ],
      reviewApprovalItems: [
        "positioning",
        "offer",
        "proof-assets",
        "first-test-batch",
        "tracking-readiness",
        "client-report",
      ],
      defaultPackage: "growth-os-setup",
    },
    "local-service-leadgen": {
      id: "local-service-leadgen",
      label: "Local service lead-gen",
      summary:
        "Local service business running always-on lead-gen with form fills and inbound calls. Optimises for qualified-lead volume at a target cost.",
      campaignType: "always-on",
      businessModel: "local-service",
      defaultProofRequirements: [
        "Before / after photos from real jobs",
        "Local-area testimonial (named neighbourhood / city)",
        "Google reviews aggregate at 4.7+ across 50+ ratings",
        "Owner / technician on-camera intro (30-45s)",
      ],
      trackingChecklistEmphasis: [
        "Lead-form submit event with consent flag",
        "Call event with call-duration threshold",
        "Qualified-lead event flipped manually by the operator",
        "Local-area geo-targeting wired correctly per ad set",
      ],
      recommendedOutputSections: [
        "offer",
        "calendar",
        "static-briefs",
        "cta-bank",
        "tracking",
        "execution",
      ],
      recommendedReportSections: [
        "strategy-snapshot",
        "offer",
        "execution",
        "decision-log",
      ],
      reviewApprovalItems: [
        "positioning",
        "offer",
        "proof-assets",
        "first-test-batch",
        "campaign-setup",
        "client-report",
      ],
      defaultPackage: "strategy-sprint",
    },
    "creator-product-launch": {
      id: "creator-product-launch",
      label: "Creator product launch",
      summary:
        "Creator-led physical or digital product launch leveraging an existing audience plus paid acquisition off the back of the drop.",
      campaignType: "launch",
      businessModel: "creator-product",
      defaultProofRequirements: [
        "Creator story explaining why this product exists",
        "Behind-the-scenes footage of product development",
        "Pre-launch waitlist size with sign-up screenshot",
        "Early-user UGC from beta or pre-order cohort",
      ],
      trackingChecklistEmphasis: [
        "Purchase event with value + currency",
        "Email-signup event for the waitlist",
        "Post-purchase survey live to capture self-reported source",
        "Creator-channel UTMs distinct from paid UTMs",
      ],
      recommendedOutputSections: [
        "avatars",
        "hooks",
        "scripts",
        "concepts",
        "calendar",
        "execution",
      ],
      recommendedReportSections: [
        "strategy-snapshot",
        "calendar",
        "execution",
        "proof",
        "decision-log",
      ],
      reviewApprovalItems: [
        "positioning",
        "offer",
        "proof-assets",
        "first-test-batch",
        "campaign-setup",
        "client-report",
      ],
      defaultPackage: "launch-sprint",
    },
  });

// ---- Role presets -----------------------------------------------------

export const ROLE_PRESETS: Record<AgencyRoleId, RolePreset> = Object.freeze({
  owner: {
    id: "owner",
    label: "Owner",
    cares: ["score", "offer", "calendar", "execution", "workspace"],
    approves: ["positioning", "offer", "client-report"],
    hides: ["creative-qa", "editor-handoff"],
    handoffFormat: "doc-only",
    defaultQuestions: [
      "What's the realistic timeline?",
      "What does success look like at 30 days?",
    ],
  },
  client: {
    id: "client",
    label: "Client",
    cares: ["score", "offer", "proof", "report"],
    approves: ["positioning", "offer", "proof-assets", "client-report"],
    hides: ["editor-handoff", "creative-qa", "tracking"],
    handoffFormat: "meeting",
    defaultQuestions: [
      "Does the angle reflect our brand voice?",
      "What proof do we still need to capture?",
      "When can we go live?",
    ],
  },
  "media-buyer": {
    id: "media-buyer",
    label: "Media buyer",
    cares: ["tracking", "launch-readiness", "execution", "kpi-ladder"],
    approves: ["first-test-batch", "campaign-setup", "tracking-readiness"],
    hides: ["avatars", "hooks", "proof"],
    handoffFormat: "async-comments",
    defaultQuestions: [
      "Are tracking events firing?",
      "Are exclusions wired?",
      "What's the daily budget per ad set?",
    ],
  },
  creator: {
    id: "creator",
    label: "Creator",
    cares: ["hooks", "scripts", "shots", "static-briefs", "editor-handoff", "creative-qa"],
    approves: ["creative-qa"],
    hides: ["tracking", "kpi-ladder", "workspace"],
    handoffFormat: "video-walkthrough",
    defaultQuestions: [
      "Which 3 hooks should I prioritize?",
      "Aspect ratio and length per platform?",
      "Captions or no captions?",
    ],
  },
  strategist: {
    id: "strategist",
    label: "Strategist",
    cares: [
      "score",
      "positioning",
      "audience",
      "offer",
      "calendar",
      "concepts",
      "execution",
      "workspace",
      "review",
    ],
    approves: [],
    hides: [],
    handoffFormat: "meeting",
    defaultQuestions: [
      "What's the one-variable test for batch 1?",
      "What's the kill rule on the weakest cell?",
    ],
  },
});

// ---- Package presets --------------------------------------------------

export const PACKAGE_PRESETS: Record<PackagePresetId, PackagePreset> =
  Object.freeze({
    "strategy-sprint": {
      id: "strategy-sprint",
      label: "Strategy Sprint",
      summary:
        "Tight 5-7 day strategy engagement. Deliver the strategy doc, first-test-batch plan, tracking and proof gap analysis. No campaign build.",
      deliverables: [
        "Strategy doc covering positioning, audience, offer, and channels",
        "Offer + positioning recommendations with rationale",
        "First-test-batch plan with 3-6 cells on the (avatar × hook × format × offer) matrix",
        "Tracking-readiness checklist with gaps highlighted",
        "Proof-asset plan with must-haves before spend",
      ],
      timelineDays: { min: 5, max: 7 },
      priceRangeUsd: { min: 2500, max: 5000 },
      includedModules: [
        "score",
        "offer",
        "avatars",
        "hooks",
        "concepts",
        "tracking",
        "proof",
        "report",
      ],
      clientResponsibilities: [
        "Provide brand assets (logo, fonts, brand guidelines)",
        "Provide product / service details and current pricing",
        "Provide existing customer data or survey insights",
        "Provide competitor list with example ads or landing pages",
      ],
      upsellPath: ["launch-sprint", "growth-os-setup"],
      acceptanceCriteria: [
        "Strategy doc delivered in writing",
        "First-test-batch defined with 3-6 cells, each varying on one axis",
        "Tracking gaps identified with named owner per gap",
        "Proof gaps identified with capture instructions",
        "Client approves positioning and top offer recommendation",
      ],
    },
    "launch-sprint": {
      id: "launch-sprint",
      label: "Launch Sprint",
      summary:
        "10-14 day end-to-end launch package: strategy plus full campaign build, concepts, scripts, statics, editor handoff, and creative QA.",
      deliverables: [
        "Strategy doc covering positioning, audience, offer, and channels",
        "Offer + positioning recommendations with rationale",
        "First-test-batch plan with 3-6 cells, each varying on one axis",
        "Tracking-readiness checklist with gaps highlighted",
        "Proof-asset plan with must-haves before spend",
        "Campaign setup built in the ad account (naming, UTMs, exclusions)",
        "Ad concepts with hooks, scripts, and shot lists per top angle",
        "Static-ad briefs across 1:1, 4:5, 9:16",
        "Editor handoff doc per brief with QA-pass",
      ],
      timelineDays: { min: 10, max: 14 },
      priceRangeUsd: { min: 5000, max: 12000 },
      includedModules: [
        "score",
        "offer",
        "avatars",
        "hooks",
        "concepts",
        "briefs",
        "shots",
        "scripts",
        "static-briefs",
        "cta-bank",
        "creative-qa",
        "editor-handoff",
        "tracking",
        "proof",
        "execution",
        "report",
      ],
      clientResponsibilities: [
        "Provide brand assets (logo, fonts, brand guidelines)",
        "Provide product / service details and current pricing",
        "Provide existing customer data or survey insights",
        "Provide competitor list with example ads or landing pages",
        "Approve hooks within 48h of delivery",
        "Provide raw footage or product photos for editor handoff",
      ],
      upsellPath: ["growth-os-setup"],
      acceptanceCriteria: [
        "Strategy doc delivered in writing",
        "First-test-batch defined with 3-6 cells, each varying on one axis",
        "Tracking gaps identified with named owner per gap",
        "Proof gaps identified with capture instructions",
        "Client approves positioning and top offer recommendation",
        "Campaigns built in the ad account ready to push live",
        "First batch live within 14 days of kickoff",
      ],
    },
    "growth-os-setup": {
      id: "growth-os-setup",
      label: "Growth OS Setup",
      summary:
        "21-30 day deeper engagement: launch plus the iteration cadence, workspace memory, monthly review rhythm, and KPI dashboard handoff.",
      deliverables: [
        "Strategy doc covering positioning, audience, offer, and channels",
        "Offer + positioning recommendations with rationale",
        "First-test-batch plan with 3-6 cells, each varying on one axis",
        "Tracking-readiness checklist with gaps highlighted",
        "Proof-asset plan with must-haves before spend",
        "Campaign setup built in the ad account (naming, UTMs, exclusions)",
        "Ad concepts with hooks, scripts, and shot lists per top angle",
        "Static-ad briefs across 1:1, 4:5, 9:16",
        "Editor handoff doc per brief with QA-pass",
        "Iteration planner cadence configured against the test-results log",
        "Workspace memory initialised with run history and learnings",
        "Monthly review cadence locked with named attendees",
        "KPI dashboard handoff with target ladder per KPI",
      ],
      timelineDays: { min: 21, max: 30 },
      priceRangeUsd: { min: 12000, max: 25000 },
      includedModules: [
        "score",
        "positioning",
        "audience",
        "diagnosis",
        "offer",
        "calendar",
        "concepts",
        "briefs",
        "shots",
        "scripts",
        "static-briefs",
        "cta-bank",
        "creative-qa",
        "editor-handoff",
        "tracking",
        "kpi-ladder",
        "proof",
        "execution",
        "workspace",
        "review",
        "next-iteration",
        "report",
      ],
      clientResponsibilities: [
        "Provide brand assets (logo, fonts, brand guidelines)",
        "Provide product / service details and current pricing",
        "Provide existing customer data or survey insights",
        "Provide competitor list with example ads or landing pages",
        "Approve hooks within 48h of delivery",
        "Provide raw footage or product photos for editor handoff",
        "Weekly 30-min review with the strategist",
      ],
      upsellPath: ["custom-build"],
      acceptanceCriteria: [
        "Strategy doc delivered in writing",
        "First-test-batch defined with 3-6 cells, each varying on one axis",
        "Tracking gaps identified with named owner per gap",
        "Proof gaps identified with capture instructions",
        "Client approves positioning and top offer recommendation",
        "Campaigns built in the ad account ready to push live",
        "First batch live within 14 days of kickoff",
        "Memory-driven iteration plan delivered",
        "Monthly review cadence locked with named attendees",
      ],
    },
    "custom-build": {
      id: "custom-build",
      label: "Custom Build",
      summary:
        "Bespoke 30-90 day engagement scoped to the operator's specifics. Strategy, build, content, and iteration cadence all tailored.",
      deliverables: [
        "Scope of work signed against named milestones",
        "Bespoke strategy and creative scope agreed with the client",
        "Dedicated point-of-contact assigned for the engagement",
        "Per-milestone deliverable list reviewed at kickoff",
        "Acceptance signed on each milestone before invoicing the next",
      ],
      timelineDays: { min: 30, max: 90 },
      priceRangeUsd: { min: 25000, max: 75000 },
      includedModules: [
        "score",
        "positioning",
        "audience",
        "diagnosis",
        "offer",
        "calendar",
        "concepts",
        "briefs",
        "shots",
        "scripts",
        "static-briefs",
        "cta-bank",
        "creative-qa",
        "editor-handoff",
        "tracking",
        "kpi-ladder",
        "proof",
        "execution",
        "workspace",
        "review",
        "next-iteration",
        "report",
      ],
      clientResponsibilities: [
        "Dedicated point-of-contact available for the engagement window",
        "Weekly strategic sync with the lead strategist",
        "Asset turnaround within the agreed SLA per milestone",
      ],
      upsellPath: [],
      acceptanceCriteria: [
        "Scope of work signed before kickoff",
        "Milestones agreed in writing with target dates",
        "Acceptance signed per milestone before progressing",
      ],
    },
  });

// ---- Helpers ----------------------------------------------------------

export function getTemplate(id: ProjectTemplateId): ProjectTemplate {
  return PROJECT_TEMPLATES[id];
}

export function getRole(id: AgencyRoleId): RolePreset {
  return ROLE_PRESETS[id];
}

export function getPackage(id: PackagePresetId): PackagePreset {
  return PACKAGE_PRESETS[id];
}

export function listTemplates(): ProjectTemplate[] {
  return [
    PROJECT_TEMPLATES["app-launch"],
    PROJECT_TEMPLATES["ecommerce-seasonal"],
    PROJECT_TEMPLATES["saas-evergreen"],
    PROJECT_TEMPLATES["local-service-leadgen"],
    PROJECT_TEMPLATES["creator-product-launch"],
  ];
}

export function listRoles(): RolePreset[] {
  return [
    ROLE_PRESETS["owner"],
    ROLE_PRESETS["client"],
    ROLE_PRESETS["media-buyer"],
    ROLE_PRESETS["creator"],
    ROLE_PRESETS["strategist"],
  ];
}

export function listPackages(): PackagePreset[] {
  return [
    PACKAGE_PRESETS["strategy-sprint"],
    PACKAGE_PRESETS["launch-sprint"],
    PACKAGE_PRESETS["growth-os-setup"],
    PACKAGE_PRESETS["custom-build"],
  ];
}
