"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { SITE } from "@/lib/constants";
import { SHOW_INSTALL_GUIDE_FLAG } from "@/components/DownloadButtons";

type Device = "ios" | "android" | "desktop";

function detect(): Device {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

/**
 * Mobile-only sticky bar with a single device-aware primary CTA.
 * Hidden on desktop (md: and above) and after the user scrolls back to the very top.
 */
export function StickyDownloadBar() {
  const t = useTranslations("hero");
  const router = useRouter();
  const [device, setDevice] = useState<Device | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setDevice(detect());

    // Hide while the hero is in view; reveal once the user has scrolled past it.
    const onScroll = () => {
      setHidden(window.scrollY < 320);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleIOSInstall() {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(SHOW_INSTALL_GUIDE_FLAG, "1");
      } catch {
        /* sessionStorage may be unavailable in some private modes */
      }
    }
    router.push("/app");
  }

  if (device === "desktop" || device === null) return null;

  const isIOS = device === "ios";

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-bg/85 backdrop-blur-md transition-transform duration-300 md:hidden ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-hidden={hidden}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">JUNO</p>
          <p className="truncate text-[11px] text-text-muted">
            {isIOS ? t("iOSInstallHint") : t("badge")}
          </p>
        </div>
        {isIOS ? (
          <button
            type="button"
            onClick={handleIOSInstall}
            className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg shadow-white/10 transition-opacity hover:opacity-90"
          >
            {t("installWebApp")}
          </button>
        ) : (
          <a
            href={SITE.links.playStore}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg shadow-white/10 transition-opacity hover:opacity-90"
          >
            {t("playStore")}
          </a>
        )}
        <Link
          href="/app"
          className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-white"
          aria-label={t("webApp")}
        >
          {t("webApp")}
        </Link>
      </div>
    </div>
  );
}
