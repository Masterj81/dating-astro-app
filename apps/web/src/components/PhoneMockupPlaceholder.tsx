/**
 * SVG/CSS phone-frame placeholder for the hero.
 * Designed to be replaced by real screenshots in apps/web/public/screenshots/
 * once captured. Only depicts features that are actually shipped today:
 *   - profile depth (prompt + voice intro)
 *   - compatibility score (synastry) — uses the same CompatibilityDotsArc
 *     as the mobile app and the marketing Compatibility feature card
 *   - icebreaker chat bubble
 *
 * No invented copy, no fake user names.
 */

import { CompatibilityDotsArc } from "@/components/CompatibilityDotsArc";

export function PhoneMockupPlaceholder({
  className,
  ariaLabel = "AstroDating profile preview",
}: {
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={`relative mx-auto aspect-[9/19] w-full max-w-[280px] sm:max-w-[320px] ${className ?? ""}`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Phone frame */}
      <div className="absolute inset-0 rounded-[42px] border border-white/15 bg-gradient-to-b from-[#1a1825] to-[#0e0c14] shadow-[0_30px_80px_-20px_rgba(232,93,117,0.25)]">
        {/* Notch */}
        <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden="true" />

        {/* Inner screen */}
        <div className="absolute inset-2 overflow-hidden rounded-[36px] bg-[#0b0a12] p-4">
          {/* Status bar */}
          <div className="mb-3 flex items-center justify-between text-[10px] text-white/70">
            <span>9:41</span>
            <span aria-hidden="true">●●●</span>
          </div>

          {/* Compatibility arc — same component used in the marketing feature card */}
          <div className="mb-4 flex items-center gap-3">
            <CompatibilityDotsArc
              percentage={75}
              size={56}
              showScore
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">Compatibility</p>
              <p className="truncate text-[10px] text-white/55">Synastry · 7 aspects</p>
            </div>
          </div>

          {/* Prompt card */}
          <div className="mb-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3">
            <p className="mb-1 text-[9px] uppercase tracking-wider text-white/45">Profile prompt</p>
            <p className="text-[11px] leading-relaxed text-white/85">
              &ldquo;A meaningful date for me looks like a long walk and a slow conversation.&rdquo;
            </p>
          </div>

          {/* Voice intro chip */}
          <div className="mb-3 flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E94560]/20">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="#E94560" strokeWidth="2" aria-hidden="true">
                <polygon points="6 4 20 12 6 20" fill="#E94560" />
              </svg>
            </span>
            <div className="flex flex-1 items-center gap-[2px]">
              {[6, 10, 14, 8, 12, 16, 10, 6, 12, 18, 9, 14, 7, 11, 5].map((h, i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full bg-white/45"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
            <span className="text-[9px] text-white/55">0:18</span>
          </div>

          {/* Values pills */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {["Family", "Growth", "Honesty"].map((v) => (
              <span
                key={v}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-[3px] text-[9px] text-white/75"
              >
                {v}
              </span>
            ))}
          </div>

          {/* Icebreaker bubble */}
          <div className="rounded-2xl rounded-bl-md border border-[#E94560]/25 bg-[#E94560]/10 p-2.5">
            <p className="mb-0.5 text-[8px] uppercase tracking-wider text-[#E94560]/85">Icebreaker</p>
            <p className="text-[11px] leading-relaxed text-white/90">
              You both value slow mornings — what does yours look like?
            </p>
          </div>
        </div>
      </div>

      {/* Soft ambient glow behind the phone */}
      <div
        className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(232,93,117,0.18),transparent_70%)] blur-2xl"
        aria-hidden="true"
      />
    </div>
  );
}
