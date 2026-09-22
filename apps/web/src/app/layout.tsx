import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "@/lib/env"; // validate env vars at startup
import { CspEnforcementMeta } from "@/components/CspEnforcementMeta";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f0d17",
};

export const metadata: Metadata = {
  title: "JUNO",
  description:
    "Synastry-led relationship discovery — birth-chart context before the conversation.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // The enforced CSP <meta> lives HERE — the one place every rendered HTML
  // document passes through, including the built-in 404 (which renders the
  // root layout but NOT [locale] or the /app layout — measured 2026-09-22:
  // the app-scoped 404 carried 7 inline + 6 external scripts with NO policy
  // once the CSP header moved out of next.config). React hoists it into
  // <head> ahead of the first inline script (measured offsets, runbook
  // §6quater). /app pages keep the nonce'd Report-Only header; marketing
  // pages keep the enforced header — intersecting with this identical meta
  // changes nothing for them.
  return (
    <>
      <CspEnforcementMeta />
      {children}
    </>
  );
}
