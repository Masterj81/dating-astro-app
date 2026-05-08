/**
 * Voice intro demo block.
 *
 * Visual stand-in for the mobile VoiceIntroPlayer — a play button + an
 * animated waveform of vertical bars. No actual audio playback (the file
 * doesn't exist on the marketing landing); the bars animate via CSS
 * keyframes (.voice-bar in globals.css) to give a sense of motion.
 *
 * Used in the "Hear their voice" feature card.
 */

const BAR_HEIGHTS = [40, 70, 100, 60, 85, 95, 65, 35, 80, 100, 55, 75, 30];

export function VoiceIntroDemo({
  duration = "0:18",
  className = "",
}: {
  duration?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 ${className}`}
      role="img"
      aria-label="Voice intro demo"
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="var(--color-accent)"
          stroke="none"
        >
          <polygon points="6 4 20 12 6 20" />
        </svg>
      </span>
      <div className="flex h-6 flex-1 items-center gap-[3px]">
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="voice-bar w-[2px] rounded-full bg-white/55"
            style={{
              height: `${h}%`,
              animationDelay: `${i * 75}ms`,
            }}
          />
        ))}
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-white/55">
        {duration}
      </span>
    </div>
  );
}
