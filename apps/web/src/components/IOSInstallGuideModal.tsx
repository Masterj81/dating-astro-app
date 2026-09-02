"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  OPEN_INSTALL_GUIDE_EVENT,
  SHOW_INSTALL_GUIDE_FLAG,
} from "@/components/DownloadButtons";

/**
 * Root-mounted iOS PWA install guide modal.
 *
 * Mounted in [locale]/layout.tsx so it survives across page transitions —
 * including the marketing → /app handoff used by the "Install Web App" CTA.
 *
 * Opens via two channels:
 *   1. sessionStorage flag (SHOW_INSTALL_GUIDE_FLAG) — set by hero/sticky CTAs
 *      before they push to /app, read here on mount of the next route.
 *   2. Custom window event (OPEN_INSTALL_GUIDE_EVENT) — fired by the inline
 *      InstallPrompt banner's "How?" button.
 *
 * Only renders on iOS Safari (where Add-to-Home-Screen is the install path)
 * and never when already running as a standalone PWA.
 */
export function IOSInstallGuideModal() {
  const t = useTranslations("webApp");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    if (!isIOS) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // (1) sessionStorage handoff from the marketing CTA
    try {
      if (sessionStorage.getItem(SHOW_INSTALL_GUIDE_FLAG) === "1") {
        sessionStorage.removeItem(SHOW_INSTALL_GUIDE_FLAG);
        // Defer one tick so the route transition has settled visually
        setTimeout(() => setOpen(true), 50);
      }
    } catch {
      /* sessionStorage may be unavailable in some private modes */
    }

    // (2) Direct event from the inline InstallPrompt banner
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_INSTALL_GUIDE_EVENT, handler);
    return () => window.removeEventListener(OPEN_INSTALL_GUIDE_EVENT, handler);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
    >
      <div className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-[#111624] p-6 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="ios-install-title" className="text-lg font-semibold text-white">
            {t("installIOSTitle") || "Install on iPhone"}
          </h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-text-dim hover:text-white"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="space-y-5">
          <div className="flex items-start gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">1</span>
            <div>
              <p className="text-sm text-white">
                {t("installIOSStep1") || "Tap the Share button"}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {t("installIOSStep1Detail") || "The square with an arrow at the bottom of Safari"}
              </p>
              <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl">
                ⬆️
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">2</span>
            <div>
              <p className="text-sm text-white">
                {t("installIOSStep2") || "Scroll down and tap \"Add to Home Screen\""}
              </p>
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white">
                <span>➕</span> Add to Home Screen
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">✓</span>
            <p className="text-sm text-text-muted">
              {t("installIOSStep3") || "JUNO will appear on your home screen like a native app!"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-6 w-full rounded-full bg-gold py-3 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
        >
          {t("gotIt") || "Got it"}
        </button>
      </div>
    </div>
  );
}
