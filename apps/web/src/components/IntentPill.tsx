/**
 * Small pill representing a relationship intent.
 *
 * Mirrors the mobile `intentPill` style in
 * apps/mobile/components/profile/ProfilePublicMVPSections.tsx — small
 * rounded chip with a colored leading dot indicating the intent type.
 *
 * On the marketing landing this is used in the "Show your intent" feature
 * card to demo three example intents stacked.
 */

type IntentTone = "longTerm" | "casual" | "friendship";

const TONES: Record<IntentTone, { dot: string; ring: string; bg: string }> = {
  longTerm: {
    dot: "#C98692",
    ring: "rgba(201, 134, 146, 0.35)",
    bg: "rgba(201, 134, 146, 0.08)",
  },
  casual: {
    dot: "#E8C77E",
    ring: "rgba(218, 181, 109, 0.35)",
    bg: "rgba(218, 181, 109, 0.08)",
  },
  friendship: {
    dot: "#7681FF",
    ring: "rgba(91, 84, 168, 0.35)",
    bg: "rgba(91, 84, 168, 0.08)",
  },
};

export function IntentPill({
  label,
  tone = "longTerm",
  size = "md",
}: {
  label: string;
  tone?: IntentTone;
  size?: "sm" | "md";
}) {
  const t = TONES[tone];
  const padding = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border ${padding}`}
      style={{
        backgroundColor: t.bg,
        borderColor: t.ring,
        color: "var(--color-text)",
      }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: t.dot }}
      />
      {label}
    </span>
  );
}
