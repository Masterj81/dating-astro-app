"use client";

import { useEffect } from "react";
import { SITE } from "@/lib/constants";

export default function DownloadPage() {
  useEffect(() => {
    // Detect platform and redirect to appropriate store
    const ua = navigator.userAgent.toLowerCase();
    const isAndroid = ua.includes("android");
    const isIOS = /iphone|ipad|ipod/.test(ua);

    if (isAndroid) {
      window.location.href = SITE.links.playStore;
    } else if (isIOS) {
      window.location.href = SITE.links.appStore;
    } else {
      // Desktop — redirect to web app
      window.location.href = "/app";
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-4xl">🪐</p>
        <p className="mt-4 text-lg text-white">Redirecting to AstroDating...</p>
        <p className="mt-2 text-sm text-text-muted">
          Not redirected?{" "}
          <a href={SITE.links.playStore} className="text-accent underline">
            Google Play
          </a>
          {" · "}
          <a href="/app" className="text-accent underline">
            Web App
          </a>
        </p>
      </div>
    </div>
  );
}
