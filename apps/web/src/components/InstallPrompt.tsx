"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { OPEN_INSTALL_GUIDE_EVENT, PhoneInstallIcon } from "@/components/DownloadButtons";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Inline PWA install banner.
 *
 * Shows a persistent banner with:
 *   - Android Chrome: a direct "Install" button that triggers `prompt()`
 *   - iOS Safari: a "How?" button that emits OPEN_INSTALL_GUIDE_EVENT —
 *     the IOSInstallGuideModal mounted at the locale layout root captures
 *     it and renders the Add-to-Home-Screen instruction sheet.
 *
 * The modal itself lives in IOSInstallGuideModal so it survives page
 * transitions and can open from any route (marketing landing, /app, /auth/*).
 */
export function InstallPrompt() {
  const t = useTranslations("webApp");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    if (sessionStorage.getItem("pwa-install-dismissed")) {
      setDismissed(true);
    }

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    setIsIOS(ios);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
      }
    }
  };

  const handleHow = () => {
    window.dispatchEvent(new CustomEvent(OPEN_INSTALL_GUIDE_EVENT));
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  if (isStandalone) return null;
  if (dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/8 px-4 py-3" role="region" aria-label={t("installTitle") || "Install JUNO"}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent" aria-hidden="true">
        <PhoneInstallIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">
          {t("installTitle") || "Install JUNO"}
        </p>
        <p className="text-xs text-text-muted">
          {t("installSubtitle") || "Add to your home screen for the best experience"}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {deferredPrompt ? (
          <button
            type="button"
            onClick={handleInstall}
            className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("installButton") || "Install"}
          </button>
        ) : isIOS ? (
          <button
            type="button"
            onClick={handleHow}
            className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("installHow") || "How?"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="rounded-full border border-white/10 px-3 py-2 text-xs text-text-dim transition-colors hover:bg-white/[0.06]"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
