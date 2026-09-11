// The transactional emails, rendered and asserted on — not grepped.
//
// Three of them form the account-deletion journey and get the closest look:
//   1. the verification code           apps/web/src/lib/account-deletion-email.ts
//   2. deletion scheduled (grace)      supabase/functions/delete-account/index.ts
//   3. deletion completed              apps/web/src/lib/account-deletion-email.ts
// plus the payment confirmation (stripe-webhook), the contact form pair, the
// lifecycle shell and the three Supabase Auth templates.
//
// WHY RENDER RATHER THAN READ
// ---------------------------------------------------------------------------
// The lifecycle templates once shipped without a single <a href>, and every
// source-level check was green: the defect lived in the OUTPUT. So this suite
// executes the real renderers — the web module loaded whole, the Deno
// function's renderer extracted from the deployed source, the Stripe and
// contact shells extracted from theirs — and asserts on the HTML and text a
// reader receives. The two things it must never let through: a claim the code
// cannot back (media "removed" when the purge said otherwise), and a reader-
// typed value landing in the markup unescaped.
//
// The JUNO-09 purge logic is out of scope here and untouched: these emails are
// handed `purge.done` and render it. That contract is asserted on the route
// source at the end, so a refactor cannot quietly hand the renderer the intent
// instead of the measurement.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupEdgeModules, loadEdgeModule, loadWholeModule, readRepoFile,
} from '../../testing/edge-source';

const WEB_EMAIL = 'apps/web/src/lib/account-deletion-email.ts';
const WEB_LIB = 'apps/web/src/lib/media-purge.ts';
const REQUEST_ROUTE = 'apps/web/src/app/api/account/request-deletion/route.ts';
const CONFIRM_ROUTE = 'apps/web/src/app/api/account/confirm-deletion/route.ts';
const CONTACT_ROUTE = 'apps/web/src/app/api/contact/route.ts';
const DELETE_FN = 'supabase/functions/delete-account/index.ts';
const STRIPE_FN = 'supabase/functions/stripe-webhook/index.ts';
const LIFECYCLE = 'supabase/functions/send-email/templates.ts';
const AUTH_TEMPLATES = [
  'supabase/templates/confirmation.html',
  'supabase/templates/recovery.html',
  'supabase/templates/email_change.html',
];

type Rendered = { html: string; text: string };

type WebEmail = {
  SUPPORT_EMAIL: string;
  escapeHtml: (v: string) => string;
  deletionCodeEmail: (code: string) => Rendered;
  deletionCompletedEmail: (purgeComplete: boolean) => Rendered;
};
type DeleteFn = {
  SUPPORT_EMAIL: string;
  escapeHtml: (v: string) => string;
  isAcceptableCancelUrl: (url: string | null, supabaseUrl: string) => boolean;
  renderDeletionScheduledEmail: (input: {
    scheduledForIso: string; graceDays: number; cancelUrl: string | null; supabaseUrl: string;
  }) => Rendered & { subject: string };
};
type StripeFn = {
  SUPPORT_EMAIL: string;
  escapeHtml: (v: string) => string;
  renderPaymentEmailShell: (input: {
    eyebrow: string; title: string; intro: string;
    summaryRows: Array<{ label: string; value: string }>; footer: string;
  }) => string;
};
type ContactRoute = {
  SUPPORT_EMAIL: string;
  htmlEscape: (v: string) => string;
  renderEmailShell: (input: { eyebrow: string; title: string; intro: string; body: string }) => string;
};

let web: WebEmail;
let del: DeleteFn;
let stripe: StripeFn;
let contact: ContactRoute;

beforeAll(async () => {
  web = await loadWholeModule<WebEmail>(WEB_EMAIL, 'account-deletion-email');
  del = await loadEdgeModule<DeleteFn>({
    file: DELETE_FN,
    label: 'delete-account-email',
    declarations: ['SUPPORT_EMAIL', 'escapeHtml', 'isAcceptableCancelUrl', 'renderDeletionScheduledEmail'],
  });
  stripe = await loadEdgeModule<StripeFn>({
    file: STRIPE_FN,
    label: 'stripe-payment-email',
    declarations: ['SUPPORT_EMAIL', 'escapeHtml', 'renderPaymentEmailShell'],
  });
  contact = await loadEdgeModule<ContactRoute>({
    file: CONTACT_ROUTE,
    label: 'contact-email',
    declarations: ['SUPPORT_EMAIL', 'htmlEscape', 'renderEmailShell'],
  });
});

afterAll(() => cleanupEdgeModules());

// ---------------------------------------------------------------------------
// The palette, and what must never come back.
// ---------------------------------------------------------------------------
const GOLD = /#e8c77e/i;
const TEXT_ON_GOLD = /color:#0b0b14/i;
const LEGACY = [
  [/#e94560/i, 'coral CTA'],
  [/#ec4899/i, 'pink accent'],
  [/#a78bfa/i, 'lavender link'],
  [/#6366f1/i, 'indigo wash'],
  [/#2d1638/i, 'purple ground'],
  [/#f8d4df/i, 'pink eyebrow'],
  [/#f9a8d4/i, 'pink link'],
  [/rgba\(\s*244\s*,\s*114\s*,\s*182/i, 'pink wash'],
  [/rgba\(\s*236\s*,\s*72\s*,\s*153/i, 'magenta wash'],
  [/rgba\(\s*167\s*,\s*139\s*,\s*250/i, 'lavender wash'],
  [/rgba\(\s*99\s*,\s*102\s*,\s*241/i, 'indigo wash'],
  [/#0f0f1a|#1a1a2e|#2a2a40/i, 'first-generation greys'],
] as const;
const SUPPORT = 'support@junosynastry.com';
const CANCEL_BASE = 'https://qtihezzbuubnyvrjdkjd.supabase.co';
const CANCEL_URL = `${CANCEL_BASE}/functions/v1/cancel-account-deletion?token=` +
  'ZmFrZS1wYXlsb2FkLWZvci10aGUtc3VpdGU.c2lnbmF0dXJlLWJhc2U2NHVybC1zdHJpbmc';
const CODE = '3F9A1C8E2B04D7E5';

/** Anchors open and close in pairs; a stray one breaks the whole card in some clients. */
function anchorsBalanced(html: string): boolean {
  return (html.match(/<a\s/gi) ?? []).length === (html.match(/<\/a>/gi) ?? []).length;
}

/**
 * Every gradient has a solid colour underneath it. Clients that drop
 * `background-image` (Outlook desktop, several webmails) then paint the fallback
 * instead of white-on-white. Checked per style attribute, not per file.
 */
function gradientsHaveFallback(html: string): string[] {
  const offenders: string[] = [];
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    const style = m[1];
    if (!/background-image\s*:\s*(linear|radial)-gradient/.test(style)) continue;
    if (!/background-color\s*:\s*#[0-9a-f]{3,6}/i.test(style)) offenders.push(style.slice(0, 80));
  }
  // And no bare `background: <gradient>` shorthand, which has no fallback at all.
  for (const m of html.matchAll(/background\s*:\s*(linear|radial)-gradient[^;"]*/g)) offenders.push(m[0].slice(0, 80));
  return offenders;
}

function expectBrandClean(html: string, text: string, label: string) {
  for (const [re, why] of LEGACY) {
    expect(html, `${label}: ${why}`).not.toMatch(re);
  }
  expect(html, `${label}: gold`).toMatch(GOLD);
  for (const doc of [html, text]) {
    expect(doc, `${label}: legacy brand`).not.toMatch(/astrodating/i);
    expect(doc, `${label}: retired table`).not.toMatch(/\bmatches\b/i);
  }
  expect(anchorsBalanced(html), `${label}: <a> balanced`).toBe(true);
  expect(gradientsHaveFallback(html), `${label}: gradient fallback`).toEqual([]);
  expect(html, `${label}: mobile width`).toMatch(/width:100%;max-width:560px/);
  expect(html, `${label}: presentation tables`).toMatch(/role="presentation"/);
  expect(html, `${label}: lang`).toMatch(/<html lang="en">/);
}

// ===========================================================================
// 1 · the verification code
// ===========================================================================
describe('deletion email 1 · the verification code', () => {
  it('carries the code in HTML and text, with the 10-minute expiry and the two warnings', () => {
    const { html, text } = web.deletionCodeEmail(CODE);
    // Grouped for reading in the HTML, verbatim in the text.
    expect(html).toContain('3F9A&nbsp;&nbsp;1C8E&nbsp;&nbsp;2B04&nbsp;&nbsp;D7E5');
    expect(text).toContain(`code: ${CODE}`);
    for (const doc of [html, text]) {
      expect(doc).toMatch(/expires in 10 minutes/i);
      expect(doc).toMatch(/Enter it only in JUNO/i);
      expect(doc).toMatch(/Never send this code to anyone/i);
      expect(doc).toMatch(/JUNO will never ask you for it/i);
      expect(doc).toContain(SUPPORT);
    }
    expect(html).toMatch(/Type it without spaces/);
  });

  it('never puts the code in a URL', () => {
    const { html, text } = web.deletionCodeEmail(CODE);
    for (const href of html.matchAll(/href="([^"]+)"/g)) {
      expect(href[1]).not.toContain(CODE);
      expect(href[1]).not.toContain('3F9A');
    }
    for (const url of text.match(/https?:\/\/\S+/g) ?? []) expect(url).not.toContain(CODE);
    // No link at all besides mailto: a code email that links anywhere teaches
    // readers to click links in "security" emails.
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.every((h) => h.startsWith('mailto:'))).toBe(true);
  });

  it('refuses a code of the wrong shape rather than rendering it', () => {
    for (const bad of ['', 'abc', '3f9a1c8e2b04d7e5', '3F9A1C8E2B04D7E', '<b>3F9A1C8E2B04D7E5', 'X'.repeat(16)]) {
      expect(() => web.deletionCodeEmail(bad), JSON.stringify(bad)).toThrow(/unexpected shape/);
    }
  });

  it('is brand-clean and client-safe', () => {
    const { html, text } = web.deletionCodeEmail(CODE);
    expectBrandClean(html, text, 'code');
    expect(html).toMatch(/Account security/);
  });

  it('is deterministic', () => {
    expect(web.deletionCodeEmail(CODE)).toEqual(web.deletionCodeEmail(CODE));
  });
});

// ===========================================================================
// 2 · deletion scheduled — the grace window
// ===========================================================================
describe('deletion email 2 · scheduled, with the grace window', () => {
  const when = '2026-09-18T14:03:00.000Z';
  const input = { scheduledForIso: when, graceDays: 7, cancelUrl: CANCEL_URL, supabaseUrl: CANCEL_BASE };

  it('shows the date, explains the seven days, says the profile is already hidden', () => {
    const { subject, html, text } = del.renderDeletionScheduledEmail(input);
    expect(subject).toBe('Account Deletion Scheduled - JUNO');
    const label = new Date(when).toUTCString();
    for (const doc of [html, text]) {
      expect(doc).toContain(label);
      expect(doc).toMatch(/7 days/);
      expect(doc).toMatch(/profile is hidden/i);
      expect(doc).toMatch(/permanently/i);
      expect(doc).toMatch(/cannot be undone/i);
      expect(doc).toContain(SUPPORT);
    }
    expect(html).toMatch(/grace period/i);
  });

  it('carries the gold "Keep my JUNO account" button on a table with a bgcolor fallback, plus the raw URL', () => {
    const { html, text } = del.renderDeletionScheduledEmail(input);
    expect(html).toContain('Keep my JUNO account');
    expect(html).toMatch(/<td align="center" bgcolor="#e8c77e"[^>]*>\s*<a href="[^"]+"[^>]*color:#0b0b14/);
    // Present exactly twice: the button and the paste-this-link fallback.
    expect(html.split(`href="${CANCEL_URL}"`).length - 1).toBe(2);
    expect(text).toContain(CANCEL_URL);
    // The token is not touched — no tracking parameter appended, no re-encoding.
    expect(html).not.toMatch(/utm_|[?&]ref=/);
    expect(html).toMatch(/If the link no longer works, write to/);
  });

  it('without a link, tells the reader to write to support before the date', () => {
    const { html, text } = del.renderDeletionScheduledEmail({ ...input, cancelUrl: null });
    for (const doc of [html, text]) {
      expect(doc).toMatch(/Changed your mind\? Write to/);
      expect(doc).toContain(SUPPORT);
      expect(doc).not.toContain('Keep my JUNO account');
    }
    expect(html).not.toContain('bgcolor="#e8c77e"');
  });

  it('accepts only this project\'s own cancel URL, and treats anything else as "no link"', () => {
    expect(del.isAcceptableCancelUrl(CANCEL_URL, CANCEL_BASE)).toBe(true);
    const hostile = [
      'https://evil.example/functions/v1/cancel-account-deletion?token=' + 'a'.repeat(40),
      `${CANCEL_BASE}/functions/v1/cancel-account-deletion?token=abc"><script>x</script>`,
      `${CANCEL_BASE}/functions/v1/cancel-account-deletion?token=short`,
      `${CANCEL_BASE}/functions/v1/other?token=${'a'.repeat(40)}`,
      'javascript:alert(1)',
      '',
    ];
    for (const url of hostile) {
      expect(del.isAcceptableCancelUrl(url, CANCEL_BASE), url).toBe(false);
      const { html } = del.renderDeletionScheduledEmail({ ...input, cancelUrl: url });
      expect(html, url).not.toContain('<script');
      expect(html, url).not.toContain('evil.example');
      expect(html, url).not.toContain('javascript:');
      expect(html, url).toMatch(/Changed your mind\? Write to/);
    }
    expect(del.isAcceptableCancelUrl(CANCEL_URL, '')).toBe(false);
  });

  it('refuses an invalid date or grace window instead of printing "Invalid Date"', () => {
    expect(() => del.renderDeletionScheduledEmail({ ...input, scheduledForIso: 'not-a-date' })).toThrow(/invalid/);
    expect(() => del.renderDeletionScheduledEmail({ ...input, graceDays: 0 })).toThrow(/invalid/);
    expect(() => del.renderDeletionScheduledEmail({ ...input, graceDays: 7.5 })).toThrow(/invalid/);
  });

  it('is brand-clean, client-safe and deterministic', () => {
    const a = del.renderDeletionScheduledEmail(input);
    const b = del.renderDeletionScheduledEmail(input);
    expect(a).toEqual(b);
    expectBrandClean(a.html, a.text, 'scheduled');
    expect(a.html).toMatch(TEXT_ON_GOLD);
  });

  it('is what the function actually sends: html AND text, to the user, from the fixed sender', () => {
    const src = readRepoFile(DELETE_FN);
    const send = src.slice(src.indexOf('if (RESEND_API_KEY && user.email)'), src.indexOf('}).catch((err) =>'));
    expect(send).toMatch(/renderDeletionScheduledEmail\(\{/);
    expect(send).toMatch(/html: scheduledEmail\.html/);
    expect(send).toMatch(/text: scheduledEmail\.text/);
    expect(send).toMatch(/to: \[user\.email\]/);
    // The cancel URL is built once, outside the renderer, and never logged.
    expect(src).not.toMatch(/console\.(log|error|warn)\([^)]*cancelUrl/);
    expect(src).not.toMatch(/console\.(log|error|warn)\([^)]*cancelToken/);
  });
});

// ===========================================================================
// 3 · deletion completed — two honest states
// ===========================================================================
describe('deletion email 3 · completed, honest in both states', () => {
  it('complete purge: says the media are gone, names them', () => {
    const { html, text } = web.deletionCompletedEmail(true);
    for (const doc of [html, text]) {
      expect(doc).toMatch(/uploaded files/i);
      expect(doc).toMatch(/verification video/i);
      expect(doc).toMatch(/voice introduction/i);
      expect(doc).toMatch(/have been removed/i);
      expect(doc).not.toMatch(/still being deleted/i);
      expect(doc).toContain(SUPPORT);
    }
    expect(html).toMatch(/Deletion complete/);
  });

  it('partial purge: never says the media are gone, gives the 24-hour bound', () => {
    const { html, text } = web.deletionCompletedEmail(false);
    for (const doc of [html, text]) {
      expect(doc).toMatch(/still being deleted/i);
      expect(doc).toMatch(/within 24 hours/i);
      expect(doc).toMatch(/no action is needed/i);
      expect(doc).not.toMatch(/uploaded files[^.]*have been removed/i);
      expect(doc).not.toMatch(/have all been removed/i);
      expect(doc).not.toMatch(/verification video[^.]*removed/i);
      expect(doc).toContain(SUPPORT);
    }
    expect(html).toMatch(/Account deleted/);
    expect(html).not.toMatch(/Deletion complete/);
  });

  it('claims nothing the deletion path does not do: the subscription warning is present in both', () => {
    // Nothing in confirm-deletion or process-expired-deletions cancels a Stripe
    // or store subscription. Saying "your subscription does not renew" would be
    // the same class of lie the partial state exists to avoid.
    for (const state of [true, false]) {
      const { html, text } = web.deletionCompletedEmail(state);
      for (const doc of [html, text]) {
        expect(doc).toMatch(/does not cancel a paid subscription/i);
        expect(doc).not.toMatch(/subscription (does not|will not|won't) renew/i);
      }
    }
  });

  it('is brand-clean, client-safe and deterministic in both states', () => {
    for (const state of [true, false]) {
      const a = web.deletionCompletedEmail(state);
      expect(a).toEqual(web.deletionCompletedEmail(state));
      expectBrandClean(a.html, a.text, `completed(${state})`);
      expect(a.html).toMatch(/Privacy/);
    }
  });
});

// ===========================================================================
// The routes: html AND text, the measurement not the intent, the guard intact
// ===========================================================================
describe('the web routes send what the renderers return, and nothing else changed', () => {
  it('request-deletion sends html and text from deletionCodeEmail(code)', () => {
    const src = readRepoFile(REQUEST_ROUTE);
    expect(src).toMatch(/import \{ deletionCodeEmail \} from "@\/lib\/account-deletion-email"/);
    expect(src).toMatch(/deletionCodeEmail\(code\)/);
    // The route has an earlier `success: true` (the no-match case), so slice
    // from the send call forward, not from the file start.
    const sendAt = src.indexOf('resend.emails.send(');
    const send = src.slice(sendAt, src.indexOf('return NextResponse.json({ success: true })', sendAt));
    expect(send).toMatch(/html: deletionEmail\.html/);
    expect(send).toMatch(/text: deletionEmail\.text/);
    // The code is generated here and appears in the email only through the renderer.
    expect(src).toMatch(/randomBytes\(8\)\.toString\("hex"\)\.toUpperCase\(\)/);
    expect(src).not.toMatch(/console\.(log|error)\([^)]*code/);
  });

  it('confirm-deletion sends html and text from deletionCompletedEmail(purge.done) — the measurement', () => {
    const src = readRepoFile(CONFIRM_ROUTE);
    expect(src).toMatch(/import \{ deletionCompletedEmail \} from "@\/lib\/account-deletion-email"/);
    expect(src).toMatch(/deletionCompletedEmail\(purge\.done\)/);
    expect(src).not.toMatch(/deletionCompletedEmail\((true|false)\)/);
    const send = src.slice(src.indexOf('resend.emails.send('), src.indexOf('return NextResponse.json({ success: true })'));
    expect(send).toMatch(/html: deletionEmail\.html/);
    expect(send).toMatch(/text: deletionEmail\.text/);
  });

  it('the JUNO-09 guard is untouched: job row first, refusal on !jobCreated, then deleteUser, then the email', () => {
    const src = readRepoFile(CONFIRM_ROUTE);
    const purgeAt = src.search(/const purge = await requestMediaPurge\(/);
    const guardAt = src.indexOf('if (!purge.jobCreated) {');
    const deleteAt = src.indexOf('auth.admin.deleteUser(user.id)');
    const emailAt = src.indexOf('deletionCompletedEmail(purge.done)');
    expect(purgeAt).toBeGreaterThan(0);
    expect(guardAt).toBeGreaterThan(purgeAt);
    expect(deleteAt).toBeGreaterThan(guardAt);
    expect(emailAt).toBeGreaterThan(deleteAt);
    // The guard returns before the deletion.
    const guard = src.slice(guardAt, deleteAt);
    expect(guard).toMatch(/return NextResponse\.json\(/);
    expect(guard).toMatch(/status: 500/);
  });

  it('media-purge.ts keeps the purge request and no longer renders copy', () => {
    const src = readRepoFile(WEB_LIB);
    expect(src).toMatch(/export async function requestMediaPurge/);
    expect(src).toMatch(/export const PURGE_FUNCTION_PATH = "\/functions\/v1\/purge-user-media"/);
    expect(src).not.toMatch(/export function deletionEmailText/);
    expect(src).not.toMatch(/astrodatingapp/);
  });

  it('the email module exports renderers only — no HTTP handler, no Next import', () => {
    const src = readRepoFile(WEB_EMAIL);
    expect(src).not.toMatch(/^import /m);
    expect(src).not.toMatch(/export (async )?function (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/);
    expect(src).not.toMatch(/NextResponse|next\/server/);
    expect(src).not.toMatch(/Date\.now\(\)|new Date\(\)|Math\.random/);
  });
});

// ===========================================================================
// Payment confirmation
// ===========================================================================
describe('payment confirmation · the reader\'s name is escaped, and the email has a text half', () => {
  it('escapes a hostile name and hostile summary values', () => {
    const hostile = `<img src=x onerror="alert(1)">Ana & "Bo" 'C'`;
    const html = stripe.renderPaymentEmailShell({
      eyebrow: 'Payment confirmed',
      title: 'Your JUNO payment went through',
      intro: `Hi ${stripe.escapeHtml(hostile)}, your subscription is active.`,
      summaryRows: [
        { label: 'Plan', value: 'Cosmic <b>Yearly</b>' },
        { label: 'Subscription ID', value: 'sub_"x"' },
      ],
      footer: 'ok',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Yearly');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;Ana &amp; &quot;Bo&quot; &#x27;C&#x27;');
    expect(html).toContain('Cosmic &lt;b&gt;Yearly&lt;/b&gt;');
    expect(html).toContain('sub_&quot;x&quot;');
    expect(anchorsBalanced(html)).toBe(true);
  });

  it('the call site escapes firstName, adds text, and no longer invites a reply to noreply@', () => {
    const src = readRepoFile(STRIPE_FN);
    const site = src.slice(src.indexOf('const html = renderPaymentEmailShell({'), src.indexOf('const resendResponse = await fetch('));
    expect(site).toMatch(/Hi \$\{escapeHtml\(firstName\)\}/);
    expect(site).not.toMatch(/reply to this email/i);
    expect(site).toMatch(/const text = \[/);
    const send = src.slice(src.indexOf('const resendResponse = await fetch('), src.indexOf('const resendPayload'));
    expect(send).toMatch(/html,\s*text,/);
  });

  it('is brand-clean and client-safe', () => {
    const html = stripe.renderPaymentEmailShell({
      eyebrow: 'Payment confirmed', title: 'T', intro: 'I',
      summaryRows: [{ label: 'Plan', value: 'Cosmic Yearly' }], footer: 'F',
    });
    expectBrandClean(html, 'text', 'payment');
    expect(html).toContain(SUPPORT);
  });
});

// ===========================================================================
// Contact form
// ===========================================================================
describe('contact form · escaped in, honest out', () => {
  it('escapes every reader-typed field before it reaches the shell', () => {
    const e = contact.htmlEscape;
    expect(e(`<script>alert("x")</script>&'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#x27;');
    const src = readRepoFile(CONTACT_ROUTE);
    for (const field of ['name', 'email', 'category', 'message']) {
      expect(src, field).toMatch(new RegExp(`const safe\\w* = htmlEscape\\(${field}\\)`));
    }
    // Only the escaped variables reach the HTML; the raw ones are text-only.
    const htmlCalls = [...src.matchAll(/html: renderEmailShell\(\{[\s\S]*?\}\),/g)].map((m) => m[0]);
    expect(htmlCalls).toHaveLength(2);
    for (const call of htmlCalls) {
      expect(call).not.toMatch(/\$\{(name|email|category|message)\}/);
    }
  });

  it('the auto-reply is sent from noreply@ and therefore does not say "reply to this email"', () => {
    const src = readRepoFile(CONTACT_ROUTE);
    expect(src).not.toMatch(/just reply to this email/i);
    expect(src).toMatch(/Write to <a href="mailto:\$\{SUPPORT_EMAIL\}"/);
  });

  it('keeps the FUNCTIONAL inbox unchanged and documents why it differs from the displayed one', () => {
    const src = readRepoFile(CONTACT_ROUTE);
    expect(src).toMatch(/to: "support@astrodatingapp\.com"/);
    expect(src).toMatch(/The FUNCTIONAL inbox/);
    expect(contact.SUPPORT_EMAIL).toBe(SUPPORT);
  });

  it('is brand-clean and client-safe', () => {
    const html = contact.renderEmailShell({ eyebrow: 'Support', title: 'T', intro: 'I', body: '<p>B</p>' });
    expectBrandClean(html, 'text', 'contact');
  });
});

// ===========================================================================
// Lifecycle shell and Auth templates
// ===========================================================================
describe('lifecycle shell and Supabase Auth templates', () => {
  it('the lifecycle shell carries the client attributes', () => {
    const src = readRepoFile(LIFECYCLE);
    const shell = src.slice(src.indexOf('export function renderEmailShell'), src.indexOf('export function renderEmailShell') + 4000);
    expect(shell).toMatch(/<html lang="en">/);
    expect(shell).toMatch(/role="presentation" width="100%"/);
    expect(shell).toMatch(/width:100%;max-width:560px/);
    expect(shell).toMatch(/bgcolor="#e8c77e"/);
    expect(shell).toMatch(TEXT_ON_GOLD);
  });

  for (const file of AUTH_TEMPLATES) {
    it(`${file.split('/').pop()} keeps the Supabase placeholder exactly — two hrefs and the visible fallback — on a gold table button`, () => {
      const html = readRepoFile(file);
      // Exactly the placeholder Supabase substitutes — never re-encoded, never
      // decorated with a query string. Three occurrences: the button's href, the
      // fallback link's href, and the fallback link's visible text.
      expect(html.split('{{ .ConfirmationURL }}').length - 1).toBe(3);
      expect(html.split('href="{{ .ConfirmationURL }}"').length - 1).toBe(2);
      expect(html).toMatch(/>\{\{ \.ConfirmationURL \}\}<\/a>/);
      expect(html).not.toMatch(/\{\{ \.ConfirmationURL \}\}[?&]/);
      expect(html).not.toMatch(/\{\{\s*\.(Token|TokenHash|SiteURL|RedirectTo)\s*\}\}/);
      expect(html).toMatch(/<td align="center" bgcolor="#e8c77e"[^>]*>\s*<a href="\{\{ \.ConfirmationURL \}\}"[^>]*color:#0b0b14/);
      expectBrandClean(html, '', file);
      expect(html).toMatch(/expires in one hour/i);
      expect(html).toMatch(/JUNO &mdash; Montr&eacute;al/);
      expect(html).not.toMatch(/&#x2709;|&#x1F512;/);   // the emoji headers of the first version
    });
  }

  it('the three Auth templates are the same shell — same card, same header, same footer', () => {
    const shells = AUTH_TEMPLATES.map((f) => readRepoFile(f));
    const outer = /<table role="presentation" width="100%"[^>]*bgcolor="#070b16"/;
    const card = /<table role="presentation" width="560"[^>]*bgcolor="#12182a" style="width:100%;max-width:560px;/;
    const header = /<td bgcolor="#1c1b18" style="padding:28px 32px 24px;background-color:#1c1b18;/;
    for (const s of shells) {
      expect(s).toMatch(outer);
      expect(s).toMatch(card);
      expect(s).toMatch(header);
    }
  });
});

// ===========================================================================
// Nothing dynamic reaches any HTML unescaped — the rule, asserted on the sources
// ===========================================================================
describe('no unescaped interpolation in any transactional HTML', () => {
  it('every `${…}` inside an HTML template is a static field, an escaped value or a validated server value', () => {
    // account-deletion-email.ts: the only dynamic values are `safeCode`/`grouped`
    // (validated + escaped) and static shell fields.
    const webSrc = readRepoFile(WEB_EMAIL);
    const webDyn = [...webSrc.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1].trim());
    const allowedWeb = new Set([
      'input.title', 'input.preheader', 'input.eyebrow', 'input.intro', 'input.body', 'input.footer',
      'SUPPORT_EMAIL', 'label', 'inner', 'align', 'grouped', 'status', 'code',
    ]);
    for (const d of webDyn) expect(allowedWeb.has(d), d).toBe(true);
    expect(webSrc).toMatch(/const safeCode = escapeHtml\(code\)/);

    // delete-account: the renderer's dynamic values are the escaped date, the
    // validated+escaped URL, the integer-checked grace label and the constant.
    const delSrc = readRepoFile(DELETE_FN);
    const renderer = delSrc.slice(delSrc.indexOf('export function renderDeletionScheduledEmail'), delSrc.indexOf('Deno.serve('));
    const delDyn = [...renderer.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1].trim());
    const allowedDel = new Set(['safeWhen', 'safeCancel', 'daysLabel', 'SUPPORT_EMAIL', 'cancelBlock', 'whenLabel', 'cancelUrl', 'days', 'days === 1 ? "" : "s"']);
    for (const d of delDyn) expect(allowedDel.has(d), d).toBe(true);
    // `whenLabel` and `cancelUrl` (raw) appear only in the TEXT half.
    const htmlHalf = renderer.slice(renderer.indexOf('const html = `'), renderer.indexOf('const text = ['));
    expect(htmlHalf).not.toMatch(/\$\{whenLabel\}|\$\{cancelUrl\}/);
  });
});
