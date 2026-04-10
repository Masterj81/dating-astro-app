"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function CheckoutSuccessCard() {
  const t = useTranslations("webApp");
  const [showConfetti, setShowConfetti] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);

    if (mq.matches) {
      // Skip animation, show content immediately
      setShowConfetti(true);
      return;
    }

    // Trigger celebration animation after mount
    const timer = setTimeout(() => setShowConfetti(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const nextSteps = [
    { icon: "\u2728", label: t("successStepDiscover"), href: "/app/discover" },
    { icon: "\ud83d\udcab", label: t("successStepProfile"), href: "/app/profile" },
    { icon: "\ud83d\udd2e", label: t("successStepPremium"), href: "/app/premium/celestial" },
  ];

  const featureHighlights = [
    { icon: "🪐", label: t("successFeatureHighlight_chart") },
    { icon: "💗", label: t("successFeatureHighlight_compatibility") },
    { icon: "🔮", label: t("successFeatureHighlight_horoscope") },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Main success card */}
      <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card/90 p-8 text-center">
        {/* Celebration glow background */}
        {showConfetti && !prefersReducedMotion && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl transition-opacity duration-1000" />
            <div className="absolute left-1/4 top-8 h-24 w-24 rounded-full bg-purple/10 blur-2xl transition-opacity duration-1000 delay-200" />
            <div className="absolute right-1/4 top-12 h-20 w-20 rounded-full bg-emerald-400/10 blur-2xl transition-opacity duration-1000 delay-300" />
          </div>
        )}

        <div className="relative">
          {/* Animated checkmark */}
          <div
            role="img"
            aria-label={t("checkoutSuccessTitleCelebration")}
            className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/40 bg-emerald-500/10 ${
              prefersReducedMotion
                ? "scale-100 opacity-100"
                : `transition-all duration-700 ${
                    showConfetti ? "scale-100 opacity-100" : "scale-50 opacity-0"
                  }`
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              className="h-10 w-10 text-emerald-400"
              aria-hidden="true"
            >
              <path
                d="M5 13l4 4L19 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h2
            className={`mt-6 text-3xl font-semibold text-white ${
              prefersReducedMotion
                ? "opacity-100"
                : `transition-all duration-500 delay-200 ${
                    showConfetti
                      ? "translate-y-0 opacity-100"
                      : "translate-y-4 opacity-0"
                  }`
            }`}
          >
            {t("checkoutSuccessTitleCelebration")}
          </h2>
          <p
            className={`mx-auto mt-3 max-w-md text-sm leading-7 text-text-muted ${
              prefersReducedMotion
                ? "opacity-100"
                : `transition-all duration-500 delay-300 ${
                    showConfetti
                      ? "translate-y-0 opacity-100"
                      : "translate-y-4 opacity-0"
                  }`
            }`}
          >
            {t("checkoutSuccessBodyCelebration")}
          </p>

          {/* Primary actions */}
          <div
            className={`mt-8 flex flex-wrap justify-center gap-3 ${
              prefersReducedMotion
                ? "opacity-100"
                : `transition-all duration-500 delay-500 ${
                    showConfetti
                      ? "translate-y-0 opacity-100"
                      : "translate-y-4 opacity-0"
                  }`
            }`}
          >
            <Link
              href="/app/discover"
              className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover hover:shadow-[0_0_20px_rgba(232,93,117,0.3)]"
            >
              {t("successCtaPrimary")}
            </Link>
            <Link
              href="/app/profile"
              className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("openProfile")}
            </Link>
          </div>
        </div>
      </div>

      {/* Next steps */}
      <div
        className={`rounded-[2rem] border border-border bg-card/90 p-6 ${
          prefersReducedMotion
            ? "opacity-100"
            : `transition-all duration-500 delay-700 ${
                showConfetti
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0"
              }`
        }`}
      >
        <h3 className="mb-4 text-center text-sm font-medium uppercase tracking-[0.24em] text-text-dim">
          {t("successNextSteps")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {nextSteps.map((step) => (
            <Link
              key={step.href}
              href={step.href}
              className="flex items-center gap-3 rounded-2xl border border-border bg-bg/50 px-4 py-3.5 text-sm text-text-muted transition-colors hover:border-white/15 hover:text-white"
            >
              <span className="text-lg" aria-hidden="true">{step.icon}</span>
              {step.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Feature highlights -- reinforce value of purchase */}
      <div
        className={`rounded-[2rem] border border-[rgba(124,108,255,0.18)] bg-[linear-gradient(135deg,rgba(124,108,255,0.08),rgba(77,159,255,0.04))] p-6 ${
          prefersReducedMotion
            ? "opacity-100"
            : `transition-all duration-500 delay-[900ms] ${
                showConfetti
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0"
              }`
        }`}
      >
        <h3 className="mb-4 text-center text-sm font-medium uppercase tracking-[0.24em] text-[#b4a8ff]">
          {t("successFeatureHighlightTitle")}
        </h3>
        <div className="space-y-2">
          {featureHighlights.map((feature) => (
            <div
              key={feature.label}
              className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-3"
            >
              <span className="text-lg" aria-hidden="true">{feature.icon}</span>
              <span className="text-sm text-white">{feature.label}</span>
              <svg viewBox="0 0 16 16" className="ml-auto h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-text-muted">
          {t("successCosmicIdentity")}
        </p>
      </div>

      {/* Referral CTA -- viral loop */}
      <div
        className={`rounded-[2rem] border border-[rgba(74,222,128,0.18)] bg-[linear-gradient(135deg,rgba(74,222,128,0.06),rgba(74,222,128,0.02))] p-6 text-center ${
          prefersReducedMotion
            ? "opacity-100"
            : `transition-all duration-500 delay-[1100ms] ${
                showConfetti
                  ? "translate-y-0 opacity-100"
                  : "translate-y-4 opacity-0"
              }`
        }`}
      >
        <p className="text-sm font-medium text-white">{t("successShareTitle")}</p>
        <p className="mx-auto mt-2 max-w-sm text-xs text-text-muted">{t("successShareBody")}</p>
        <Link
          href="/app/profile"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[rgba(74,222,128,0.3)] bg-[rgba(74,222,128,0.12)] px-5 py-2.5 text-sm font-semibold text-[#a7f3c0] transition-all hover:bg-[rgba(74,222,128,0.2)]"
        >
          🎁 {t("successShareCta")}
        </Link>
      </div>

      {/* Billing note */}
      <p className="text-center text-xs text-text-dim">
        {t("successBillingNote")}
      </p>
    </div>
  );
}
