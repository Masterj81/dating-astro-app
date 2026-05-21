/**
 * iPhone-frame wrapper around a real product screenshot
 * (apps/web/public/screenshots/*.png). The frame, notch and ambient
 * glow stay CSS-only so the page can render server-side without
 * waiting on the image; the screenshot fills the inner screen via
 * next/image with LCP-friendly sizing.
 *
 * Defaults preserve the original hero behavior byte-for-byte:
 * Discover screenshot, priority loading, 280/320px max width. Callers
 * can override src / alt / priority / sizes / maxWidthClassName to
 * reuse the same frame for the marketing proof strip and other
 * surfaces without duplicating the chrome.
 */

import Image from "next/image";

type PhoneMockupPlaceholderProps = {
  className?: string;
  ariaLabel?: string;
  src?: string;
  alt?: string;
  priority?: boolean;
  maxWidthClassName?: string;
  sizes?: string;
};

export function PhoneMockupPlaceholder({
  className,
  ariaLabel = "JUNO Discover screen — Liam, Virgo · Taurus · Capricorn",
  src = "/screenshots/discover.png",
  alt,
  priority = true,
  maxWidthClassName = "max-w-[280px] sm:max-w-[320px]",
  sizes = "(max-width: 640px) 264px, 304px",
}: PhoneMockupPlaceholderProps) {
  return (
    <div
      className={`relative mx-auto aspect-[195/422] w-full ${maxWidthClassName} ${className ?? ""}`}
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
            src={src}
            alt={alt ?? ariaLabel}
            fill
            priority={priority}
            sizes={sizes}
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
