import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "@/lib/env"; // validate env vars at startup
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
  return children;
}
