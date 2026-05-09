/**
 * iPhone-frame wrapper around the real Discover screenshot
 * (apps/web/public/screenshots/discover.png). The frame, notch and
 * ambient glow stay CSS-only so the page can render server-side without
 * waiting on the image; the screenshot fills the inner screen via
 * next/image with priority + LCP-friendly sizing.
 *
 * Same component name and props as the previous CSS placeholder so
 * page.tsx doesn't need to change.
 */

import Image from "next/image";

export function PhoneMockupPlaceholder({
  className,
  ariaLabel = "AstroDating Discover screen — Liam, Virgo · Taurus · Capricorn",
}: {
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={`relative mx-auto aspect-[195/422] w-full max-w-[280px] sm:max-w-[320px] ${className ?? ""}`}
    >
      {/* Phone frame */}
      <div className="absolute inset-0 rounded-[42px] border border-white/15 bg-gradient-to-b from-[#1a1825] to-[#0e0c14] shadow-[0_30px_80px_-20px_rgba(232,93,117,0.25)]">
        {/* Notch */}
        <div
          className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black"
          aria-hidden="true"
        />

        {/* Inner screen — real product screenshot */}
        <div className="absolute inset-2 overflow-hidden rounded-[36px] bg-[#0b0a12]">
          <Image
            src="/screenshots/discover.png"
            alt={ariaLabel}
            fill
            priority
            sizes="(max-width: 640px) 264px, 304px"
            className="object-cover"
          />
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
