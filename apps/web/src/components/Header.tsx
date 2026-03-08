"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { SITE } from "@/lib/constants";

const NAV_LINKS = [
  { key: "features", href: "/#features" },
  { key: "howItWorks", href: "/#how-it-works" },
  { key: "premium", href: "/#premium" },
  { key: "help", href: "/help" },
  { key: "contact", href: "/contact" },
] as const;

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const t = useTranslations("nav");
  const tLang = useTranslations("language");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchLocale(newLocale: string) {
    router.replace(pathname, { locale: newLocale });
    setLangOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold text-white">
          {SITE.name}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className="text-sm text-text-muted transition-colors hover:text-white"
            >
              {t(link.key)}
            </Link>
          ))}

          {/* Language switcher */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-white"
            >
              {tLang(locale)}
              <span className={`text-xs transition-transform ${langOpen ? "rotate-180" : ""}`}>▼</span>
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full mt-2 w-36 rounded-lg border border-border bg-bg-secondary py-1 shadow-xl">
                {routing.locales.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => switchLocale(loc)}
                    className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-card-hover ${
                      loc === locale ? "text-accent" : "text-text-muted"
                    }`}
                  >
                    {tLang(loc)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/#download"
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {tCommon("download")}
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex flex-col gap-1.5 md:hidden"
          aria-label="Toggle menu"
        >
          <span className={`block h-0.5 w-6 bg-white transition-transform ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`block h-0.5 w-6 bg-white transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 w-6 bg-white transition-transform ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="border-t border-border bg-bg px-4 py-4 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block py-2 text-text-muted transition-colors hover:text-white"
            >
              {t(link.key)}
            </Link>
          ))}

          {/* Mobile language selector */}
          <div className="border-t border-border mt-2 pt-2">
            <p className="py-1 text-xs font-semibold uppercase tracking-wider text-text-dim">
              {tLang("label")}
            </p>
            <div className="flex flex-wrap gap-2 py-2">
              {routing.locales.map((loc) => (
                <button
                  key={loc}
                  onClick={() => {
                    switchLocale(loc);
                    setMenuOpen(false);
                  }}
                  className={`rounded-full px-3 py-1 text-sm ${
                    loc === locale
                      ? "bg-accent text-white"
                      : "bg-bg-secondary text-text-muted"
                  }`}
                >
                  {tLang(loc)}
                </button>
              ))}
            </div>
          </div>

          <Link
            href="/#download"
            onClick={() => setMenuOpen(false)}
            className="mt-2 block rounded-full bg-accent px-4 py-2 text-center text-sm font-medium text-white"
          >
            {tCommon("download")}
          </Link>
        </nav>
      )}
    </header>
  );
}
