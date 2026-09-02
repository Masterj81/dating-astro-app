import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

// Result page for the lifecycle-email opt-out.
//
// The mutation itself happens in supabase/functions/unsubscribe, which then
// 302s here with a `status`. The work is deliberately split that way: Supabase
// neutralises HTML served by an edge function (it downgrades the response to
// text/plain and applies a sandbox CSP, presumably so *.supabase.co cannot host
// phishing pages), so a confirmation page rendered there is shown to the reader
// as raw markup. See docs/retention-day2-audit-2026-08.md §10.
//
// Two invariants for anything edited here:
//
//   1. NO TOKEN REACHES THIS PAGE. The edge function redirects with `status`
//      only. A token in a Vercel URL would land in browser history, referrer
//      headers and access logs. That is also why there is no "resubscribe"
//      button — undoing requires the token, so it goes through support
//      instead. The capability still exists on the function
//      (`?action=resubscribe`) for support to use.
//
//   2. `status` is never echoed. It is looked up in a fixed record and falls
//      back to `invalid`, so an attacker cannot put text of their choosing on
//      a junosynastry.com page.

type Status = "unsubscribed" | "resubscribed" | "invalid" | "error" | "gone";

const STATUSES: Record<
  Status,
  {
    titleKey: string;
    bodyKey: string;
    glyph: string;
    tone: "calm" | "warn";
    /** Reassure that account + security mail keeps arriving. */
    showStillDelivered: boolean;
    /** Offer the support route — it is also the only way back. */
    showContact: boolean;
  }
> = {
  unsubscribed: {
    titleKey: "unsubscribedTitle",
    bodyKey: "unsubscribedBody",
    glyph: "✓",
    tone: "calm",
    showStillDelivered: true,
    showContact: true,
  },
  resubscribed: {
    titleKey: "resubscribedTitle",
    bodyKey: "resubscribedBody",
    glyph: "✓",
    tone: "calm",
    showStillDelivered: false,
    showContact: false,
  },
  invalid: {
    titleKey: "invalidTitle",
    bodyKey: "invalidBody",
    glyph: "!",
    tone: "warn",
    showStillDelivered: false,
    showContact: true,
  },
  error: {
    titleKey: "errorTitle",
    bodyKey: "errorBody",
    glyph: "!",
    tone: "warn",
    showStillDelivered: false,
    showContact: true,
  },
  gone: {
    titleKey: "goneTitle",
    bodyKey: "goneBody",
    glyph: "✓",
    tone: "calm",
    showStillDelivered: true,
    showContact: true,
  },
};

function parseStatus(raw: string | string[] | undefined): Status {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value in STATUSES ? (value as Status) : "invalid";
}

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  // Never index a page that only ever appears at the end of an email link.
  return { robots: { index: false, follow: false } };
}

export default async function UnsubscribePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const status = parseStatus((await searchParams).status);
  const config = STATUSES[status];
  const t = await getTranslations({ locale, namespace: "unsubscribe" });

  // The contact form lives on the marketing host ONLY. middleware.ts redirects
  // every MARKETING_SEGMENTS path — "contact" among them — to /app on
  // app.junosynastry.com, so a relative link from here would bounce the reader
  // into the app instead of the form. Verified live: www/en/contact → 200,
  // app/en/contact → 307 /en/app.
  const contactUrl = `https://www.junosynastry.com/${locale}/contact`;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div
          className={[
            "mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold",
            config.tone === "warn"
              ? "bg-white/8 text-text-muted"
              : "bg-accent/15 text-accent",
          ].join(" ")}
          aria-hidden="true"
        >
          {config.glyph}
        </div>

        <h1 className="text-3xl font-bold text-white">{t(config.titleKey)}</h1>

        <p className="mt-4 text-lg leading-relaxed text-text-muted">
          {t(config.bodyKey)}
        </p>

        {config.showStillDelivered && (
          <p className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm leading-relaxed text-text-dim">
            {t("stillDelivered")}
          </p>
        )}

        <Link
          href="/app"
          className="mt-9 inline-flex w-full items-center justify-center rounded-full bg-gold px-6 py-4 text-base font-semibold text-bg transition-colors hover:bg-gold-soft"
        >
          {t("openApp")}
        </Link>

        {config.showContact && (
          <p className="mt-5 text-sm text-text-dim">
            <a
              href={contactUrl}
              className="underline underline-offset-4 transition-colors hover:text-text-muted"
            >
              {t("contactSupport")}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
