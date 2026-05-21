"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SITE } from "@/lib/constants";

export default function DownloadPage() {
  const locale = useLocale();

  useEffect(() => {
    // Detect platform and redirect to appropriate destination.
    // iOS App Store version was rejected — iOS users go to the web app
    // (PWA install guide is surfaced on the marketing page itself).
    const ua = navigator.userAgent.toLowerCase();
    const isAndroid = ua.includes("android");
    const isIOS = /iphone|ipad|ipod/.test(ua);

    if (isAndroid) {
      window.location.href = SITE.links.playStore;
    } else if (isIOS) {
      window.location.href = `/${locale}/app`;
    } else {
      // Desktop — redirect to web app
      window.location.href = `/${locale}/app`;
    }
  }, [locale]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="mt-4 text-lg text-white">Redirecting to JUNO...</p>
        <p className="mt-2 text-sm text-text-muted">
          Not redirected?{" "}
          <a href={SITE.links.playStore} className="text-accent underline">
            Google Play
          </a>
          {" · "}
          <Link href="/app" className="text-accent underline">
            Web App
          </Link>
        </p>
      </div>
    </div>
  );
}
