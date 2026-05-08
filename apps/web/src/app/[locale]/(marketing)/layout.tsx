import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { StickyDownloadBar } from "@/components/StickyDownloadBar";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>
      <Header />
      <main id="main-content" className="flex-1">{children}</main>
      <Footer />
      {/* StickyDownloadBar is mobile-only and position:fixed.
          The pb-20 below ensures the footer never gets covered. */}
      <div className="pb-20 md:pb-0" aria-hidden="true" />
      <StickyDownloadBar />
    </>
  );
}
