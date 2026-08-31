// JUNO email templates — pure rendering, no runtime dependencies.
//
// Split out of index.ts so the templates can be rendered and asserted on
// outside Deno. index.ts imports from esm.sh, which Node will not resolve;
// this module imports nothing at all, so `scripts/validate-email-templates.mjs`
// can load it directly under Node's native type stripping and check the real
// output instead of grepping the source.
//
// Rules encoded here, from docs/retention-day2-audit-2026-08.md §1 and §6:
//   * every template carries a clickable, tracked CTA;
//   * every template ships a text/plain alternative;
//   * no trial language — no trial exists in the backend;
//   * no banned brand promise, and no branding or domain from before the JUNO
//     rename. The authoritative list is BANNED in
//     scripts/validate-email-templates.mjs, which asserts against the RENDERED
//     output — so a plain grep over this directory stays clean and any hit is
//     a real one.
//   * the footer never promises an unsubscribe it cannot deliver.

// Read configuration without hard-binding to Deno, so this module also loads
// under Node (validator) and any future test runner.
function env(key: string): string | undefined {
  const d = (globalThis as unknown as {
    Deno?: { env?: { get?: (k: string) => string | undefined } };
  }).Deno;
  try {
    return d?.env?.get?.(key);
  } catch {
    // Deno throws rather than returning undefined when --allow-env is absent.
    return undefined;
  }
}

// MUST stay `/app` and never `/en/app`. Two independent reasons:
//   1. android.intentFilters in apps/mobile/app.json declares pathPrefix
//      "/app". `/en/app` does not start with `/app`, so a locale-prefixed link
//      would never open the installed Android app — it would fall through to
//      the browser, defeating the point of verified App Links.
//   2. apps/web/src/middleware.ts 307-redirects `/app` → `/{defaultLocale}/app`
//      and preserves the query string, so the web path resolves anyway and the
//      UTM parameters survive. Verified live: `/app?utm_source=…` →
//      `/en/app?utm_source=…`.
const APP_ORIGIN_FALLBACK = "https://app.junosynastry.com";

/**
 * Reduce whatever is configured to a bare origin.
 *
 * A base URL carrying a path breaks two things at once, and it is not
 * hypothetical: on 2026-08-27 PUBLIC_APP_BASE_URL was set in production to
 * `https://app.junosynastry.com/en`, which
 *
 *   1. broke Android App Links — the intent filter declares pathPrefix "/app",
 *      and "/en/app" does not start with "/app", so every email CTA opened the
 *      browser instead of the installed app; and
 *   2. forced English on every reader, cancelling the locale negotiation the
 *      web middleware performs for a locale-less path.
 *
 * Configuration must not be able to cause either again. Origin only.
 */
function appOrigin(raw: string | undefined): string {
  try {
    return new URL(raw || APP_ORIGIN_FALLBACK).origin;
  } catch {
    return APP_ORIGIN_FALLBACK;
  }
}

export const APP_BASE_URL = appOrigin(
  env("PUBLIC_APP_BASE_URL") || env("APP_BASE_URL"),
);

export const SUPPORT_EMAIL = env("SUPPORT_EMAIL") || "support@junosynastry.com";

// Postal address is required in every commercial message under CAN-SPAM and
// CASL. Override via the function environment.
export const SENDER_POSTAL_ADDRESS =
  env("SENDER_POSTAL_ADDRESS") || "JUNO — Montréal, Québec, Canada";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Build a tracked CTA URL. `path` must begin with `/app` (see APP_BASE_URL). */
export function appLink(
  path: string,
  template: string,
  campaign = "onboarding",
): string {
  const url = new URL(APP_BASE_URL + path);
  url.searchParams.set("utm_source", "lifecycle_email");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("template", template);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export type EmailShellInput = {
  eyebrow: string;
  title: string;
  intro: string;
  accentLabel: string;
  accentBody: string;
  cta: { label: string; url: string };
  footerNote: string;
  unsubscribeUrl?: string | null;
};

export function renderEmailShell({
  eyebrow,
  title,
  intro,
  accentLabel,
  accentBody,
  cta,
  footerNote,
  unsubscribeUrl,
}: EmailShellInput): string {
  // Table-wrapped anchor so Outlook renders the background colour. Padding
  // sits on the <a> so the whole block is clickable.
  const button = `
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 4px;">
      <tr>
        <td align="center" bgcolor="#e94560" style="border-radius:14px;">
          <a href="${cta.url}"
             style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;background:#e94560;">
            ${cta.label}
          </a>
        </td>
      </tr>
    </table>`;

  // Never claim an unsubscribe we cannot deliver. When no token could be built
  // (misconfiguration), point at somewhere real instead of printing the word
  // "unsubscribe" with nothing behind it.
  const unsubscribeLine = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" style="color:#8f9ab5;text-decoration:underline;">Unsubscribe from these emails</a>`
    : `Manage email preferences in JUNO under Settings &rsaquo; Notifications.`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background:#0b1020;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:radial-gradient(circle at top left,#2d1638 0%,#0b1020 46%,#070b16 100%);padding:32px 14px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#12182a;border:1px solid #2a3247;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
            <tr>
              <td style="padding:28px 32px 18px;background:linear-gradient(135deg,rgba(244,114,182,0.18),rgba(167,139,250,0.08));border-bottom:1px solid #2a3247;">
                <div style="display:inline-block;padding:9px 14px;border-radius:999px;border:1px solid #4b556f;color:#f8d4df;font-size:11px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;">
                  ${eyebrow}
                </div>
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-0.03em;">
                  ${title}
                </h1>
                <p style="margin:0;color:#d4d9e7;font-size:16px;line-height:1.7;">
                  ${intro}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <div style="margin-bottom:24px;padding:18px 20px;border-radius:22px;background:linear-gradient(135deg,rgba(236,72,153,0.22),rgba(99,102,241,0.14));border:1px solid rgba(255,255,255,0.08);color:#ffffff;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.72);margin-bottom:8px;">
                    ${accentLabel}
                  </div>
                  ${accentBody}
                </div>

                ${button}
                <p style="margin:10px 0 22px;color:#8f9ab5;font-size:12px;line-height:1.6;">
                  If the button doesn't work, paste this into your browser:<br />
                  <a href="${cta.url}" style="color:#8f9ab5;word-break:break-all;">${cta.url}</a>
                </p>

                <div style="color:#b7bfd3;font-size:14px;line-height:1.75;border-top:1px solid #2a3247;padding-top:18px;">
                  ${footerNote}
                </div>
                <div style="margin-top:14px;color:#7c869e;font-size:12px;line-height:1.7;">
                  ${unsubscribeLine}<br />
                  Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:#8f9ab5;">${SUPPORT_EMAIL}</a><br />
                  ${escapeHtml(SENDER_POSTAL_ADDRESS)}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** text/plain alternative. Every message ships with one. */
export function renderText(
  lines: string[],
  cta: { label: string; url: string },
  unsubscribeUrl?: string | null,
): string {
  const tail = unsubscribeUrl
    ? `Unsubscribe from these emails: ${unsubscribeUrl}`
    : `Manage email preferences in JUNO under Settings > Notifications.`;
  return [
    ...lines,
    "",
    `${cta.label}: ${cta.url}`,
    "",
    "—",
    tail,
    `Questions? ${SUPPORT_EMAIL}`,
    SENDER_POSTAL_ADDRESS,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * One observation per Moon sign — a behaviour the reader can recognise in
 * themselves. Not a prediction, not a promise, not a compatibility claim.
 *
 * This is what makes the D+1 email carry something the reader has not already
 * seen: the reveal at the end of onboarding names the placement, this says
 * what it does.
 */
export const MOON_INSIGHT: Record<string, string> = {
  aries:
    "You process feelings fast and out loud. The flare passes quickly — but the people around you often take longer to catch up than you expect.",
  taurus:
    "You settle into a feeling and stay there. It makes you steady company, and it makes leaving anything — a mood, a habit, a room — take longer than you admit.",
  gemini:
    "You talk your way into knowing how you feel. Silence doesn't calm you down; it leaves the thought unfinished.",
  cancer:
    "You remember the emotional weather of a room long after everyone else has forgotten what was actually said.",
  leo:
    "You need your feelings witnessed, not just heard. Being taken for granted registers as a much larger event than most people realise.",
  virgo:
    "You handle emotion by finding something to fix. Sitting with a feeling that has no task attached is the harder skill.",
  libra:
    "You read the temperature of the other person before you check your own. It makes you easy to be around, and harder to know.",
  scorpio:
    "You go all the way in or not at all. There is very little middle setting, and you tend to test people quietly before you let them close.",
  sagittarius:
    "Space is how you regulate. When something gets heavy, your instinct is distance first and conversation second.",
  capricorn:
    "You keep your composure by default, which reads as strength and sometimes as absence. You ask for help last.",
  aquarius:
    "You step back and analyse the feeling instead of having it. It buys you clarity, and it costs you some closeness.",
  pisces:
    "You absorb the mood of whoever you are with. Working out which feelings are actually yours is a daily piece of work.",
};

function titleCase(sign: string): string {
  if (!sign) return "";
  return sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();
}

export type BuiltEmail = { subject: string; html: string; text: string };

export type TemplateContext = {
  name: string;
  sunSign: string;
  moonSign: string;
  unsubscribeUrl: string | null;
};

// --- welcome (transactional) ------------------------------------------------

export function welcomeEmail(ctx: TemplateContext): BuiltEmail {
  const cta = { label: "Open JUNO", url: appLink("/app", "welcome", "activation") };
  const name = ctx.name || "there";
  return {
    subject: "Welcome to JUNO",
    html: renderEmailShell({
      eyebrow: "JUNO",
      title: `Welcome, ${name}`,
      intro:
        "Your account is verified and your birth chart is calculated. Here is where to start.",
      accentLabel: "First steps",
      accentBody: `
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Read your chart</strong> — Sun, Moon and Rising, and what each one actually governs.
        </p>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Add a photo and a line about yourself</strong> so people meet you, not a placeholder.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Put someone else's chart next to yours.</strong> That comparison is what JUNO is actually built around — and the first message is free.
        </p>
      `,
      cta,
      footerNote:
        "You're receiving this because you created a JUNO account. If that wasn't you, let us know and we'll close it.",
      unsubscribeUrl: ctx.unsubscribeUrl,
    }),
    text: renderText(
      [
        `Welcome, ${name}`,
        "",
        "Your account is verified and your birth chart is calculated. Here is where to start.",
        "",
        "- Read your chart: Sun, Moon and Rising, and what each one actually governs.",
        "- Add a photo and a line about yourself so people meet you, not a placeholder.",
        "- Put someone else's chart next to yours. That comparison is what JUNO is built around, and the first message is free.",
        "",
        "You're receiving this because you created a JUNO account.",
      ],
      cta,
      ctx.unsubscribeUrl,
    ),
  };
}

// --- day 1 (lifecycle) ------------------------------------------------------

export function onboardingDay1Email(ctx: TemplateContext): BuiltEmail {
  const cta = {
    // Points at the chart itself, not at the app menu.
    //
    // This CTA said "Read my full chart" and landed on `/app` — a grid of five
    // navigation cards. The reader had to find the chart themselves, one day
    // after signup, with no idea where it lived. Promise and destination did
    // not match, and this is the Day 1 email: the single message with the best
    // odds of bringing someone back.
    //
    // `natal_chart` is the one web surface with a real free daily preview
    // (`premium_feature_policy.free_preview_quota = 1`, migration
    // 20260823000001), so a free account clicking this gets the chart it was
    // promised rather than a paywall. Still under the `/app` prefix, which the
    // Android App Link intent filter requires.
    label: "Read my full chart",
    url: appLink("/app/premium/celestial/natal-chart", "onboarding_day1"),
  };
  const name = ctx.name || "there";
  const insight = MOON_INSIGHT[ctx.moonSign.toLowerCase()];
  const moonLabel = titleCase(ctx.moonSign);
  const sunLabel = titleCase(ctx.sunSign);

  // No birth time means no reliable Moon. Fall back to the Sun rather than
  // inventing a placement — that is the audit's §3.5 failure mode in email
  // form, and it is the fastest way to lose a reader who checks.
  const hasMoon = Boolean(insight);

  const subject = hasMoon
    ? `Your Moon in ${moonLabel} explains this`
    : sunLabel
      ? `${sunLabel} is only the first layer of your chart`
      : "Your chart has more than one layer";

  const title = hasMoon
    ? `${name}, this is your Moon talking`
    : `${name}, there's more in your chart`;

  const intro = hasMoon
    ? "Yesterday you saw the names of your placements. Here's what one of them actually does."
    : "Yesterday you saw your Sun sign. It's the layer everyone knows — and the least specific one in your chart.";

  const accentBody = hasMoon
    ? `
        <p style="margin:0 0 12px;font-size:16px;line-height:1.7;">
          <strong style="color:#ffffff;">Moon in ${moonLabel}.</strong> ${insight}
        </p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.82);">
          Your Moon governs how you process feeling — privately, before anyone else sees it. It's usually the placement people recognise themselves in first.
        </p>
      `
    : `
        <p style="margin:0 0 12px;font-size:16px;line-height:1.7;">
          <strong style="color:#ffffff;">Your Moon needs your birth time.</strong> Without it we can't place your Moon or your Rising sign with confidence — so we don't guess.
        </p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.82);">
          Add your birth time in JUNO and both appear. Even an approximate time gets you most of the way.
        </p>
      `;

  const bodyText = hasMoon
    ? [
        `Moon in ${moonLabel}. ${insight}`,
        "",
        "Your Moon governs how you process feeling — privately, before anyone else sees it. It's usually the placement people recognise themselves in first.",
      ]
    : [
        "Your Moon needs your birth time. Without it we can't place your Moon or your Rising sign with confidence, so we don't guess.",
        "",
        "Add your birth time in JUNO and both appear. Even an approximate time gets you most of the way.",
      ];

  return {
    subject,
    html: renderEmailShell({
      eyebrow: "Your chart",
      title,
      intro,
      accentLabel: hasMoon ? "What it does" : "What's missing",
      accentBody,
      cta,
      footerNote:
        "Your chart holds eight more placements like this one. They're all in the app.",
      unsubscribeUrl: ctx.unsubscribeUrl,
    }),
    text: renderText(
      [
        title,
        "",
        intro,
        "",
        ...bodyText,
        "",
        "Your chart holds eight more placements like this one.",
      ],
      cta,
      ctx.unsubscribeUrl,
    ),
  };
}

// --- day 3 (lifecycle) ------------------------------------------------------

export function onboardingDay3Email(ctx: TemplateContext): BuiltEmail {
  const cta = {
    label: "Compare two charts",
    url: appLink("/app", "onboarding_day3"),
  };
  const name = ctx.name || "there";
  return {
    subject: "Why two people with the same sign can still miss each other",
    html: renderEmailShell({
      eyebrow: "Synastry",
      title: "Sun signs don't explain chemistry",
      intro: `${name}, comparing two Sun signs is where most astrology apps stop. It's also why their results feel generic — a twelfth of the world is not your type.`,
      accentLabel: "What JUNO compares instead",
      accentBody: `
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">The angles between two charts</strong> — conjunctions, trines, squares, oppositions — not just the signs themselves.
        </p>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Which planets are involved.</strong> Venus to Mars reads very differently from Moon to Saturn, and both can be present at once.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Where the friction sits</strong>, not only where things are easy. A square isn't bad news — it's often the part that keeps a connection interesting.
        </p>
      `,
      cta,
      footerNote:
        "This works for any relationship — someone you're seeing, a friend, a person you work with. Pick a chart and put it next to yours.",
      unsubscribeUrl: ctx.unsubscribeUrl,
    }),
    text: renderText(
      [
        "Sun signs don't explain chemistry",
        "",
        `${name}, comparing two Sun signs is where most astrology apps stop. It's also why their results feel generic — a twelfth of the world is not your type.`,
        "",
        "What JUNO compares instead:",
        "- The angles between two charts: conjunctions, trines, squares, oppositions.",
        "- Which planets are involved. Venus to Mars reads very differently from Moon to Saturn.",
        "- Where the friction sits, not only where things are easy.",
        "",
        "This works for any relationship — someone you're seeing, a friend, a person you work with.",
      ],
      cta,
      ctx.unsubscribeUrl,
    ),
  };
}

// --- day 5 (lifecycle) ------------------------------------------------------

export function onboardingDay5Email(ctx: TemplateContext): BuiltEmail {
  // This template used to announce that the reader's week-long trial was about
  // to expire, and listed what they would "lose access to". No such trial
  // exists anywhere in the backend — see
  // docs/retention-day2-audit-2026-08.md §1. The real model is one full natal
  // reading per day, indefinitely (premium_feature_policy.free_preview_quota
  // = 1 for natal_chart).
  //
  // Do not reintroduce expiry language unless something actually expires.
  const cta = {
    label: "See what's included",
    url: appLink("/app/plans", "onboarding_day5", "premium"),
  };
  const name = ctx.name || "there";
  return {
    subject: "What your free JUNO account already includes",
    html: renderEmailShell({
      eyebrow: "Your account",
      title: "No countdown, nothing expiring",
      intro: `${name}, some apps spend this email telling you a clock is running out. Yours isn't. Here's what you actually have — and what you don't.`,
      accentLabel: "Free, every day",
      accentBody: `
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">A full reading of your natal chart</strong> — once a day, for as long as you keep the account.
        </p>
        <p style="margin:0 0 10px;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Browsing and messaging.</strong> Starting a conversation has never cost anything on JUNO.
        </p>
        <p style="margin:0;font-size:16px;line-height:1.65;">
          <strong style="color:#ffffff;">Celestial removes the daily limit</strong> and opens detailed synastry — the aspect-by-aspect read between two charts. That's the difference, and it's the whole difference.
        </p>
      `,
      cta,
      footerNote:
        "If the free daily reading is enough for you, keep it. This isn't a countdown.",
      unsubscribeUrl: ctx.unsubscribeUrl,
    }),
    text: renderText(
      [
        "No countdown, nothing expiring",
        "",
        `${name}, some apps spend this email telling you a clock is running out. Yours isn't. Here's what you actually have — and what you don't.`,
        "",
        "Free, every day:",
        "- A full reading of your natal chart, once a day, for as long as you keep the account.",
        "- Browsing and messaging. Starting a conversation has never cost anything on JUNO.",
        "",
        "Celestial removes the daily limit and opens detailed synastry — the aspect-by-aspect read between two charts.",
        "",
        "If the free daily reading is enough for you, keep it. This isn't a countdown.",
      ],
      cta,
      ctx.unsubscribeUrl,
    ),
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
//
// `category` decides suppressibility:
//   transactional — account-critical. Never suppressed, and never carries
//                   List-Unsubscribe headers. Suppressing these would lock
//                   people out of their own account.
//   lifecycle     — marketing. Suppressed when the reader has opted out, and
//                   carries RFC 8058 one-click unsubscribe headers.

export type TemplateCategory = "transactional" | "lifecycle";

export const TEMPLATES: Record<
  string,
  { category: TemplateCategory; build: (ctx: TemplateContext) => BuiltEmail }
> = {
  welcome: { category: "transactional", build: welcomeEmail },
  onboarding_day1: { category: "lifecycle", build: onboardingDay1Email },
  onboarding_day3: { category: "lifecycle", build: onboardingDay3Email },
  onboarding_day5: { category: "lifecycle", build: onboardingDay5Email },
};

/**
 * Preference key consulted for lifecycle mail.
 *
 * Deliberately NOT `promotions`: that key defaults to `false` in the profiles
 * schema, so gating on it would suppress the entire onboarding sequence for
 * every account — the same defect that kept the daily horoscope push at zero
 * recipients for its whole life. `lifecycleEmails` is absent from the schema
 * default, and absent means opted in.
 */
export const LIFECYCLE_PREF_KEY = "lifecycleEmails";

export function isSuppressed(
  prefs: unknown,
  category: TemplateCategory,
): boolean {
  if (category === "transactional") return false;
  if (!prefs || typeof prefs !== "object") return false;
  return (prefs as Record<string, unknown>)[LIFECYCLE_PREF_KEY] === false;
}
