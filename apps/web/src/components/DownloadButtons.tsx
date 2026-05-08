"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SITE } from "@/lib/constants";
import { Link } from "@/i18n/navigation";

// Set to true when App Store version is approved
const SHOW_APP_STORE = false;

type Device = "ios" | "android" | "desktop";

/**
 * Custom event consumed by InstallPrompt.tsx to open the PWA add-to-home-screen
 * guide directly when an iOS user clicks the primary "Install Web App" CTA.
 */
export const OPEN_INSTALL_GUIDE_EVENT = "astrodating:open-install-guide";

function detectDevice(): Device {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

function PlayStoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35m13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27m3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31M6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z" />
    </svg>
  );
}

function AppStoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PhoneInstallIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M12 7v8M9 12l3 3 3-3" />
    </svg>
  );
}

function WebIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12h8M12 8v8" strokeLinecap="round" />
    </svg>
  );
}

function fireOpenInstallGuide() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_INSTALL_GUIDE_EVENT));
}

export function DownloadButtons({
  size = "md",
  variant = "auto",
}: {
  size?: "sm" | "md";
  /**
   * - "auto" (default): adapts to detected device — single primary CTA + 1-2 secondaries
   * - "all": shows every available button (used on /download or admin pages)
   */
  variant?: "auto" | "all";
}) {
  const t = useTranslations("hero");
  const [device, setDevice] = useState<Device | null>(null);
  const padding = size === "sm" ? "px-4 py-2 text-sm" : "px-6 py-3 text-base";

  useEffect(() => {
    setDevice(detectDevice());
  }, []);

  // Primary white pill (Play Store / App Store)
  const playStoreBtn = (
    <a
      key="play"
      href={SITE.links.playStore}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full bg-white text-black font-medium shadow-lg shadow-white/10 transition-all hover:opacity-90 hover:shadow-white/15 ${padding}`}
    >
      <PlayStoreIcon />
      {t("playStore")}
    </a>
  );

  const appStoreBtn = SHOW_APP_STORE ? (
    <a
      key="appstore"
      href={SITE.links.appStore}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full bg-white text-black font-medium transition-opacity hover:opacity-90 ${padding}`}
    >
      <AppStoreIcon />
      {t("appStore")}
    </a>
  ) : null;

  // iOS primary: Install Web App (triggers the InstallPrompt sheet via custom event)
  const installWebAppBtn = (
    <button
      key="install"
      type="button"
      onClick={fireOpenInstallGuide}
      className={`inline-flex items-center gap-2 rounded-full bg-white text-black font-medium shadow-lg shadow-white/10 transition-all hover:opacity-90 hover:shadow-white/15 ${padding}`}
    >
      <PhoneInstallIcon />
      {t("installWebApp")}
    </button>
  );

  // Secondary outlined: Open Web App (in browser)
  const webAppBtn = (
    <Link
      key="webapp"
      href="/app"
      className={`inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 text-white font-medium backdrop-blur-sm transition-all hover:bg-accent/20 hover:border-accent/60 hover:shadow-[0_0_16px_rgba(232,93,117,0.2)] ${padding}`}
    >
      <WebIcon />
      {t("webApp")}
    </Link>
  );

  // Pre-hydration / variant=all: render every option (no flash, fully accessible without JS)
  if (variant === "all" || device === null) {
    return (
      <div className="flex flex-wrap justify-center gap-3">
        {appStoreBtn}
        {playStoreBtn}
        {webAppBtn}
      </div>
    );
  }

  // Post-hydration auto layout
  if (device === "ios") {
    return (
      <div className="flex flex-wrap justify-center gap-3">
        {installWebAppBtn}
        {webAppBtn}
      </div>
    );
  }

  if (device === "android") {
    return (
      <div className="flex flex-wrap justify-center gap-3">
        {playStoreBtn}
        {webAppBtn}
      </div>
    );
  }

  // desktop
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {webAppBtn}
      {playStoreBtn}
    </div>
  );
}
