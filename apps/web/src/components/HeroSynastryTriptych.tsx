/**
 * HeroSynastryTriptych — the landing-page hero visual.
 *
 * Three "phone screen" mockups, one per JUNO reading frame:
 *   - Center: Love (slightly larger, in front)
 *   - Left:   Friendship (scaled down, hinged via rotateY)
 *   - Right:  Business / working chemistry (scaled down, hinged via rotateY)
 *
 * All three show the same profile pair and the same synastry score-band,
 * but switch labels and zone language — which is JUNO's actual product
 * differentiator ("same chart, different lens"). The visual sells the
 * three intentions before the copy has to explain them.
 *
 * Responsiveness:
 *   - <md: show only the center (Love) phone. The side phones add nothing
 *     at narrow widths, and stacking three full phones would make the
 *     hero scroll forever.
 *   - md+: show all three with a soft perspective hinge.
 *
 * Server-renderable. No client JS. Translation lookup lives here so the
 * SynastryFrameMockup component itself stays presentational.
 */

import { useTranslations } from "next-intl";

import { SynastryFrameMockup, type FrameKey } from "@/components/SynastryFrameMockup";

interface FrameSpec {
  key: FrameKey;
  /** Frame-specific synastry score for the demo profile pair. */
  score: number;
  /** One zone we surface on this phone (mirrors the real Synastry surface). */
  zoneKey: "emotional" | "communication" | "attraction" | "stability";
  zoneScore: number;
  /** Frame-specific zone label key inside the webApp namespace. */
  zoneLabelKey: string;
  /** Exploration-question key (lives in webApp namespace) to show as
   * the bottom "Question to explore" prompt. Ties the hero visual to the
   * actual feature shipped inside the Synastry surface. */
  questionKey: string;
  /** Soft hinge rotation for the side phones; center stays flat. */
  rotateY: number;
  /** Variant — center is primary, sides are secondary. */
  variant: "primary" | "secondary";
  /** Tailwind wrapper class for triptych layout (overlap + z-index). */
  wrapper: string;
}

const FRAMES: readonly FrameSpec[] = [
  {
    key: "friendship",
    score: 72,
    zoneKey: "communication",
    zoneScore: 78,
    zoneLabelKey: "synastryZone_communication_friendship",
    questionKey: "exploration_communication_high",
    rotateY: 16,
    variant: "secondary",
    // Negative right-margin pulls the center phone in to overlap; hidden
    // on mobile so only Love renders below md.
    wrapper:
      "z-10 hidden md:block md:-mr-14 md:translate-y-6 lg:-mr-20",
  },
  {
    key: "love",
    score: 78,
    zoneKey: "emotional",
    zoneScore: 82,
    zoneLabelKey: "synastryZone_emotional_love",
    questionKey: "exploration_emotional_high",
    rotateY: 0,
    variant: "primary",
    wrapper: "relative z-20",
  },
  {
    key: "business",
    score: 64,
    zoneKey: "communication",
    zoneScore: 68,
    zoneLabelKey: "synastryZone_communication_business",
    questionKey: "exploration_overall_mid_4",
    rotateY: -16,
    variant: "secondary",
    wrapper:
      "z-10 hidden md:block md:-ml-14 md:translate-y-6 lg:-ml-20",
  },
] as const;

// Demo profile pair shown on every phone. The signs are chosen to be
// believable but unambiguous — same as the existing hero's ariaLabel.
const DEMO_PROFILE_NAME = "Liam";
const DEMO_PROFILE_SIGNS = "Virgo · Taurus · Capricorn";

export function HeroSynastryTriptych() {
  const intents = useTranslations("intentionsSection");
  const wa = useTranslations("webApp");

  return (
    <div
      className="relative mx-auto w-full max-w-[820px]"
      style={{ perspective: "1400px" }}
    >
      {/* Outer ambient glow — softer than per-phone glows, ties the
          composition into the hero's existing radial-gradient. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-12 bottom-12 -z-10 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(232,93,117,0.10),transparent_70%)] blur-3xl"
      />

      {/* Triptych row — flexbox with negative margins to overlap. Each
          phone gets its natural width from max-w-* on the mockup itself.
          On mobile this collapses to a single centered phone via the
          `hidden md:block` rules on the side wrapper classes. */}
      <div
        className="relative mx-auto flex items-center justify-center"
        style={{ transformStyle: "preserve-3d" }}
      >
        {FRAMES.map((spec) => {
          const frameLabel =
            spec.key === "love"
              ? intents("loveTitle")
              : spec.key === "friendship"
                ? intents("friendshipTitle")
                : intents("businessTitle");
          const frameDescription =
            spec.key === "love"
              ? intents("loveDesc")
              : spec.key === "friendship"
                ? intents("friendshipDesc")
                : intents("businessDesc");

          return (
            <div key={spec.key} className={spec.wrapper}>
              <SynastryFrameMockup
                frame={spec.key}
                score={spec.score}
                frameLabel={frameLabel}
                frameDescription={frameDescription}
                profileName={DEMO_PROFILE_NAME}
                profileSigns={DEMO_PROFILE_SIGNS}
                zoneLabel={wa(spec.zoneLabelKey)}
                zoneScore={spec.zoneScore}
                questionCaption={wa("exploration_title")}
                questionBody={wa(spec.questionKey)}
                variant={spec.variant}
                rotateY={spec.rotateY}
              />
            </div>
          );
        })}
      </div>

      {/* Caption — single line that names what the visual is actually
          showing. Stays small so it never competes with the h1 above. */}
      <p className="mt-6 text-center text-xs uppercase tracking-[0.24em] text-gold-muted">
        {intents("badge")} · {intents("loveTitle")} · {intents("friendshipTitle")} · {intents("businessTitle")}
      </p>
    </div>
  );
}
