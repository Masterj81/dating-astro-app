"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type AppShellProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  requireAuth?: boolean;
};

type NavLink = {
  href: string;
  label: string;
  accent?: "cosmic" | "celestial";
};

export function AppShell({
  children,
  title,
  subtitle,
  requireAuth = true,
}: AppShellProps) {
  const t = useTranslations("webApp");
  const tLang = useTranslations("language");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(requireAuth);
  const [session, setSession] = useState<Session | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const nextPath = pathname.startsWith(`/${locale}/`) ? pathname : `/${locale}/app`;

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    supabase.auth.getSession().then(({ data }) => {
      const nextSession = data.session;
      setSession(nextSession);
      setLoading(false);

      if (requireAuth && !nextSession) {
        router.replace({
          pathname: "/auth/login",
          query: { next: nextPath },
        });
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);

      if (requireAuth && !nextSession) {
        router.replace({
          pathname: "/auth/login",
          query: { next: nextPath },
        });
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [nextPath, requireAuth, router]);

  const handleSignOut = async () => {
    await getSupabaseBrowser().auth.signOut();
    router.replace("/auth/login");
  };

  const switchLocale = (nextLocale: string) => {
    router.replace(pathname, { locale: nextLocale });
    setLangOpen(false);
  };

  const navLinks: NavLink[] = [
    { href: "/app/discover", label: t("discoverNav") },
    { href: "/app/matches", label: t("matchesNav") },
    { href: "/app/chat", label: t("chatNav") },
    { href: "/app/premium/cosmic", label: t("premiumNav"), accent: "cosmic" },
    { href: "/app/premium/celestial", label: t("natalChartNav"), accent: "celestial" },
    { href: "/app/profile", label: t("profileNav") },
  ];

  const getNavClassName = (link: NavLink) => {
    const active = pathname === link.href || pathname.startsWith(`${link.href}/`);

    if (link.accent === "cosmic") {
      return `rounded-full border px-4 py-2 text-sm text-white transition-colors ${
        active
          ? "border-[rgba(124,108,255,0.42)] bg-[rgba(124,108,255,0.22)]"
          : "border-[rgba(124,108,255,0.28)] bg-[rgba(124,108,255,0.12)] hover:bg-[rgba(124,108,255,0.18)]"
      }`;
    }

    if (link.accent === "celestial") {
      return `rounded-full border px-4 py-2 text-sm text-white transition-colors ${
        active
          ? "border-[rgba(232,93,117,0.38)] bg-[rgba(232,93,117,0.18)]"
          : "border-[rgba(232,93,117,0.22)] bg-[rgba(232,93,117,0.08)] hover:bg-[rgba(232,93,117,0.14)]"
      }`;
    }

    return `rounded-full border px-4 py-2 text-sm text-white transition-colors ${
      active
        ? "border-white/20 bg-white/[0.12]"
        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"
    }`;
  };

  if (requireAuth && loading) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] px-6 py-5 text-sm text-text-muted backdrop-blur-md">
            {t("loading")}
          </div>
        </div>
      </div>
    );
  }

  if (requireAuth && !session) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="relative z-40 mb-8 overflow-visible rounded-[2.2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-7">
          <div className="pointer-events-none absolute inset-0 rounded-[2.2rem] bg-[radial-gradient(circle_at_top_left,rgba(232,93,117,0.16),transparent_24%),radial-gradient(circle_at_80%_0%,rgba(124,108,255,0.18),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_72%)]" />
          <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          <div className="relative space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-3 text-sm uppercase tracking-[0.3em] text-[#b5ab9f]"
                  >
                    <Image
                      src="/icon-192.png"
                      alt="AstroDating"
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-2xl ring-1 ring-white/10 shadow-[0_10px_24px_rgba(232,93,117,0.16)]"
                      priority
                    />
                    <span>AstroDating</span>
                  </Link>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-text-dim">
                    Web app
                  </span>
                </div>
                {title ? (
                  <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#f7f4ee] sm:text-4xl">
                    {title}
                  </h1>
                ) : null}
                {subtitle ? (
                  <p
                    className={`max-w-2xl text-sm leading-7 text-[#c9c2b8] ${
                      title ? "mt-2" : "mt-4"
                    }`}
                  >
                    {subtitle}
                  </p>
                ) : null}
              </div>

              <div className="flex max-w-full flex-wrap items-center justify-end gap-3">
                {session?.user?.email ? (
                  <span className="hidden max-w-[220px] truncate rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-[#c9c2b8] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:inline-flex">
                    {session.user.email}
                  </span>
                ) : null}

                <div className="relative z-50">
                  <button
                    onClick={() => setLangOpen((open) => !open)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]"
                  >
                    <span>{tLang(locale)}</span>
                    <span
                      className={`inline-flex transition-transform ${
                        langOpen ? "rotate-180" : ""
                      }`}
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="M2 4.25L6 8l4-3.75" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>
                  {langOpen ? (
                    <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-2xl border border-white/10 bg-[#111624]/95 py-2 shadow-xl backdrop-blur-xl">
                      {routing.locales.map((loc) => (
                        <button
                          key={loc}
                          onClick={() => switchLocale(loc)}
                          className={`block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-white/[0.06] ${
                            loc === locale ? "text-accent" : "text-text-muted"
                          }`}
                        >
                          {tLang(loc)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {session ? (
                  <button
                    onClick={handleSignOut}
                    className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(232,93,117,0.28)] transition-colors hover:bg-accent-hover"
                  >
                    {t("signOut")}
                  </button>
                ) : (
                  <Link
                    href="/auth/login"
                    className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(232,93,117,0.28)] transition-colors hover:bg-accent-hover"
                  >
                    {t("signIn")}
                  </Link>
                )}
              </div>
            </div>

            <nav className="flex flex-wrap gap-2">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className={getNavClassName(link)}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
