import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "@/lib/env"; // validate env vars at startup
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e94560",
};

export const metadata: Metadata = {
  title: "AstroDating",
  description: "Find your cosmic match",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
