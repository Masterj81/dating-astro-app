"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const t = useTranslations("webApp");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Check if dismissed before
    if (sessionStorage.getItem("pwa-install-dismissed")) {
      setDismissed(true);
    }

    // Detect iOS
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    setIsIOS(ios);

    // Listen for beforeinstallprompt (Android/Desktop Chrome)
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

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("pwa-install-dismissed", "1");
    setShowIOSGuide(false);
  };

  // Don't show if already installed or dismissed
  if (isStandalone || dismissed) return null;

  // Don't show if no install prompt and not iOS
  if (!deferredPrompt && !isIOS) return null;

  return (
    <>
      {/* Install banner */}
      <div className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/8 px-4 py-3" role="region" aria-label={t("installTitle") || "Install AstroDating"}>
        <span className="text-2xl" aria-hidden="true">📲</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">
            {t("installTitle") || "Install AstroDating"}
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
              onClick={() => setShowIOSGuide(true)}
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

      {/* iOS install guide modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ios-install-title">
          <div className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-[#111624] p-6 sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 id="ios-install-title" className="text-lg font-semibold text-white">
                {t("installIOSTitle") || "Install on iPhone"}
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
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
                  {t("installIOSStep3") || "AstroDating will appear on your home screen like a native app!"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("gotIt") || "Got it"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
