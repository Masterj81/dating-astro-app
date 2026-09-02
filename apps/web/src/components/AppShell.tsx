"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getProfileSetupState, isWebProfileSetupIncomplete } from "@/lib/web-account";
import { getCurrentTier } from "@/lib/web-subscriptions";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NavIcon, type NavIconName } from "@/components/NavIcons";

type AppShellProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  requireAuth?: boolean;
};

type NavLink = {
  href: string;
  label: string;
  icon: NavIconName;
  accent?: "cosmic" | "celestial" | "rose";
};

// Remembers, for this tab only, that a reader has finished onboarding, so the
// guard below costs one query per visit instead of one per navigation. Only
// the COMPLETED state is ever cached: "incomplete" changes the moment they
// save the form, and a stale "incomplete" would bounce them back into setup.
const ONBOARDED_KEY = "juno.onboarded";

function isKnownOnboarded(userId: string): boolean {
  try {
    return sessionStorage.getItem(ONBOARDED_KEY) === userId;
  } catch {
    return false;
  }
}

function rememberOnboarded(userId: string): void {
  try {
    sessionStorage.setItem(ONBOARDED_KEY, userId);
  } catch {
    /* private mode — the guard just re-queries, which is correct if slower */
  }
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // pathname from next-intl already excludes the locale prefix, so use it directly
  const nextPath = pathname.startsWith("/app") ? pathname : "/app";

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
    }).catch((err) => {
      console.error("[AppShell] Failed to get session", err);
      setAuthError(err instanceof Error ? err.message : "Session check failed");
      setLoading(false);
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

  // ── Onboarding guard ──────────────────────────────────────────────────────
  //
  // WHY THIS EXISTS
  // Until this ran, /app/setup had exactly ONE entry point: the single check
  // in auth/callback/page.tsx, executed once, on one page load. Nothing else
  // in the app ever looked at onboarding_completed — this component checked
  // only that a session existed. So a reader who missed that one redirect for
  // any reason landed on /app with no profile row, saw an app with no data,
  // and had no way back: signing in again returned a valid session, /app
  // accepted it, and showed the same empty screen.
  //
  // That is not a hypothesis. auth.audit_log_entries shows accounts firing
  // user_signedup then login, login, login within three minutes, ending with
  // no profiles row — people retrying a door that was already open. 143 of
  // 245 confirmed accounts never got a profile row; 94% of Apple sign-ins and
  // 67% of Google ones, against 30% for email/password.
  //
  // Making onboarding reachable from every /app page turns a single point of
  // failure into a self-healing loop: whatever caused the miss, the next page
  // load recovers. It also rescues the accounts already stranded — their next
  // sign-in now leads somewhere.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!requireAuth || !userId) return;
    // The setup screen itself lives inside this shell. Guarding it would loop.
    if (pathname.startsWith("/app/setup")) return;
    if (isKnownOnboarded(userId)) return;

    let active = true;

    void (async () => {
      try {
        const profile = await getProfileSetupState(userId);
        if (!active) return;
        if (isWebProfileSetupIncomplete(profile)) {
          router.replace("/app/setup");
        } else {
          rememberOnboarded(userId);
        }
      } catch {
        // Fail CLOSED, towards setup. AccountSetupForm sends an already
        // onboarded reader straight back to /app, so guessing wrong here
        // self-corrects in one hop; guessing wrong the other way is what
        // stranded 143 accounts.
        if (active) router.replace("/app/setup");
      }
    })();

    return () => {
      active = false;
    };
  }, [requireAuth, userId, pathname, router]);

  const handleSignOut = async () => {
    try {
      await getSupabaseBrowser().auth.signOut();
    } catch {
      // Sign-out network failures are non-critical; proceed with redirect
    }
    router.replace({
      pathname: "/auth/login",
      query: { next: nextPath },
    });
  };

  const switchLocale = (nextLocale: string) => {
    router.replace(pathname, { locale: nextLocale });
    setLangOpen(false);
  };

  const [userTier, setUserTier] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      const loadTier = async () => {
        try {
          setUserTier(await getCurrentTier(session.user.id));
        } catch {
          setUserTier("free");
        }
      };
      loadTier();
    }
  }, [session]);

  const isFreeUser = userTier === "free" || userTier === null;

  // Conversation-first nav: the Matches tab is gone. Chat is now the primary
  // social inbox. Old /app/matches deep links still resolve via a redirect.
  const mainNav: NavLink[] = [
    { href: "/app", label: t("sidebarDashboard"), icon: "dashboard" },
    { href: "/app/discover", label: t("discoverNav"), icon: "discover", accent: "rose" },
    { href: "/app/chat", label: t("chatNav"), icon: "chat" },
    {
      href: "/app/premium/conversation-guide",
      label: t("conversationGuide"),
      icon: "guide",
      accent: "rose",
    },
    { href: "/app/premium/cosmic", label: t("premiumNav"), icon: "cosmic", accent: "cosmic" },
    { href: "/app/premium/celestial", label: t("natalChartNav"), icon: "celestial", accent: "celestial" },
    { href: "/app/profile", label: t("profileNav"), icon: "profile" },
  ];

  // Bottom tab bar uses a simplified set
  const bottomNav: NavLink[] = [
    { href: "/app/discover", label: t("discoverNav"), icon: "discover", accent: "rose" },
    { href: "/app/chat", label: t("chatNav"), icon: "chat" },
    { href: "/app/premium/cosmic", label: t("premiumNav"), icon: "cosmic", accent: "cosmic" },
    { href: "/app/profile", label: t("profileNav"), icon: "profile" },
  ];

  const isActive = (href: string) => {
    // Exact match for dashboard to avoid matching all /app/* routes
    if (href === "/app") return pathname === "/app";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  if (requireAuth && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] px-6 py-5 text-sm text-text-muted backdrop-blur-md">
          {t("loading")}
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border border-accent/30 bg-accent/10 p-6 text-center">
          <p className="text-sm font-medium text-[#ffd0d7]">{authError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
          >
            {t("refreshProfiles")}
          </button>
        </div>
      </div>
    );
  }

  if (requireAuth && !session) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      {/* ─── Desktop Sidebar ─── */}
      <aside
        aria-label="JUNO"
        className={`sticky top-0 hidden h-screen flex-col border-r border-white/8 bg-[rgba(10,12,20,0.85)] backdrop-blur-2xl transition-all duration-300 lg:flex ${
          sidebarCollapsed ? "w-[72px]" : "w-[240px]"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-5">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/icon-192.png"
              alt="JUNO"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-white/10"
              priority
            />
            {!sidebarCollapsed && (
              <span className="text-sm font-semibold tracking-wide text-white/80">
                JUNO
              </span>
            )}
          </Link>
        </div>

        {/* Nav links */}
        <nav aria-label="App navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {mainNav.map((link) => {
            const active = isActive(link.href);
            let activeBg = "bg-white/10";
            let hoverBg = "hover:bg-white/[0.06]";
            // Bronze for the ordinary entries, gold for Celestial, deep
            // violet for Cosmic. The three used to be pink / blue / bright
            // violet, so the navigation announced three unrelated brands
            // before the reader had opened anything. `rose` here now means
            // "a warm neutral", not "the pink one".
            if (link.accent === "cosmic") {
              activeBg = "bg-[rgba(91,84,168,0.26)]";
              hoverBg = "hover:bg-[rgba(91,84,168,0.14)]";
            } else if (link.accent === "celestial") {
              activeBg = "bg-[rgba(232,199,126,0.16)]";
              hoverBg = "hover:bg-[rgba(232,199,126,0.09)]";
            } else if (link.accent === "rose") {
              activeBg = "bg-bronze";
              hoverBg = "hover:bg-[rgba(216,181,109,0.07)]";
            }

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  active
                    ? `${activeBg} font-medium text-white`
                    : `text-text-muted ${hoverBg}`
                } ${sidebarCollapsed ? "justify-center" : ""}`}
                title={sidebarCollapsed ? link.label : undefined}
              >
                <NavIcon name={link.icon} className="h-5 w-5 shrink-0" />
                {!sidebarCollapsed && <span>{link.label}</span>}
                {active && !sidebarCollapsed && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar upgrade CTA for free users */}
        {session && isFreeUser && !sidebarCollapsed && (
          <div className="mx-3 mb-2">
            <Link
              href="/app/plans"
              className="flex flex-col gap-1 rounded-xl border border-gold-border bg-[linear-gradient(135deg,rgba(232,199,126,0.12),rgba(169,130,61,0.10))] px-3 py-3 transition-all hover:border-[rgba(232,199,126,0.45)] hover:shadow-[0_4px_12px_rgba(232,199,126,0.14)]"
            >
              <span className="text-xs font-semibold text-white">{t("sidebarUpgradeCta")}</span>
              <span className="text-[11px] leading-4 text-text-muted">{t("sidebarUpgradeHint")}</span>
            </Link>
          </div>
        )}
        {session && isFreeUser && sidebarCollapsed && (
          <div className="mx-3 mb-2">
            <Link
              href="/app/plans"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent transition-all hover:bg-accent/20"
              title={t("sidebarUpgradeCta")}
              aria-label={t("sidebarUpgradeCta")}
            >
              <NavIcon name="upgrade" className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Sidebar footer */}
        <div className="border-t border-white/8 px-3 py-3 space-y-2">
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!sidebarCollapsed}
            className="flex w-full items-center justify-center rounded-xl px-3 py-2 text-text-dim transition-colors hover:bg-white/[0.06] hover:text-white"
            title={sidebarCollapsed ? "Expand" : "Collapse"}
          >
            <svg
              viewBox="0 0 16 16"
              className={`h-4 w-4 transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setLangOpen((v) => !v)}
              aria-expanded={langOpen}
              aria-haspopup="listbox"
              aria-label={tLang("label")}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-muted transition-colors hover:bg-white/[0.06] ${sidebarCollapsed ? "justify-center" : ""}`}
            >
              <NavIcon name="globe" className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span>{tLang(locale)}</span>}
            </button>
            {langOpen && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-40 rounded-xl border border-white/10 bg-[#111624]/95 py-1 shadow-xl backdrop-blur-xl" role="listbox" aria-label={tLang("label")}>
                {routing.locales.map((loc) => (
                  <button
                    key={loc}
                    role="option"
                    aria-selected={loc === locale}
                    onClick={() => switchLocale(loc)}
                    className={`block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-white/[0.06] ${
                      loc === locale ? "text-accent" : "text-text-muted"
                    }`}
                  >
                    {tLang(loc)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sign out */}
          {session && !sidebarCollapsed && (
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-dim transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <NavIcon name="signout" className="h-4 w-4 shrink-0" />
              <span>{t("signOut")}</span>
            </button>
          )}
        </div>
      </aside>

      {/* ─── Main content area ─── */}
      <div className="flex min-w-0 flex-1 flex-col pb-[72px] lg:pb-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/8 bg-[rgba(10,12,20,0.9)] px-4 py-3 backdrop-blur-xl lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/icon-192.png"
              alt="JUNO"
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg ring-1 ring-white/10"
              priority
            />
            <span className="text-sm font-semibold text-white/80">JUNO</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* Mobile language */}
            <div className="relative">
              <button
                onClick={() => setLangOpen((v) => !v)}
                aria-expanded={langOpen}
                aria-haspopup="listbox"
                aria-label={tLang("label")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs text-text-muted"
              >
                <NavIcon name="globe" className="h-3.5 w-3.5" />
                {tLang(locale)}
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-xl border border-white/10 bg-[#111624]/95 py-1 shadow-xl backdrop-blur-xl" role="listbox" aria-label={tLang("label")}>
                  {routing.locales.map((loc) => (
                    <button
                      key={loc}
                      role="option"
                      aria-selected={loc === locale}
                      onClick={() => switchLocale(loc)}
                      className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/[0.06] ${
                        loc === locale ? "text-accent" : "text-text-muted"
                      }`}
                    >
                      {tLang(loc)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {session ? (
              <button
                onClick={handleSignOut}
                className="rounded-lg bg-accent/90 px-3 py-1.5 text-xs font-medium text-white"
              >
                {t("signOut")}
              </button>
            ) : (
              <Link
                href={{
                  pathname: "/auth/login",
                  query: { next: nextPath },
                }}
                className="rounded-lg bg-accent/90 px-3 py-1.5 text-xs font-medium text-white"
              >
                {t("signIn")}
              </Link>
            )}
          </div>
        </header>

        {/* Page header (title / subtitle) */}
        {(title || subtitle) && (
          <div className="border-b border-white/6 px-4 py-6 sm:px-6 lg:px-8">
            {title && (
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-1 max-w-2xl text-sm leading-7 text-text-muted">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Install prompt */}
        <div className="px-4 pt-4 sm:px-6 lg:px-8">
          <InstallPrompt />
        </div>

        {/* Content */}
        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {/* ─── Mobile Bottom Tab Bar ─── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[rgba(10,12,20,0.92)] backdrop-blur-2xl lg:hidden" aria-label="App tabs">
        <div className="mx-auto flex max-w-lg items-stretch">
          {bottomNav.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
                  active ? "text-accent" : "text-text-dim"
                }`}
              >
                <NavIcon
                  name={link.icon}
                  className={`h-6 w-6 transition-transform ${active ? "scale-110" : ""}`}
                />
                <span className={active ? "font-semibold" : ""}>{link.label}</span>
                {active && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-gold" aria-hidden="true" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
