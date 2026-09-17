"use client";

import { CONTACT_CATEGORIES } from "@/lib/contact-categories";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

// JUNO-07: the public form carries a Cloudflare Turnstile widget. The SITE
// key is public by design; the SECRET lives only on the server, and the API
// verifies every token (fail-closed). When the site key is not configured
// the form is DISABLED with an honest notice — there is deliberately no
// "fake captcha" mode: the server would refuse the submission anyway.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type TurnstileWidgetId = string;
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => TurnstileWidgetId;
      reset: (id?: TurnstileWidgetId) => void;
      remove: (id?: TurnstileWidgetId) => void;
    };
    __junoTurnstileLoaded?: boolean;
  }
}

function loadTurnstile(): Promise<void> {
  if (window.__junoTurnstileLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = () => {
      window.__junoTurnstileLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error("turnstile script failed to load"));
    document.head.appendChild(s);
  });
}

/** Server error codes → localized copy. Raw provider text never reaches the
 *  reader; unknown codes fall back to a generic sentence. */
const ERROR_KEYS: Record<string, string> = {
  rate_limited: "contactRateLimited",
  captcha_invalid: "contactCaptchaInvalid",
  unavailable: "contactUnavailable",
};

export function ContactForm() {
  const t = useTranslations("contact");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const cooldownRef = useRef(false);
  const captchaHostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !captchaHostRef.current) return;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile || !captchaHostRef.current) return;
        widgetIdRef.current = window.turnstile.render(captchaHostRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => setCaptchaToken(token),
          "expired-callback": () => setCaptchaToken(""),
          "error-callback": () => setCaptchaToken(""),
        });
      })
      .catch(() => {
        // Script unreachable: leave the token empty — the server refuses
        // (fail-closed) and the disabled submit already tells the reader.
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (cooldownRef.current) return;

    const form = e.currentTarget;
    const data = new FormData(form);

    const name = data.get("name") as string;
    const email = data.get("email") as string;
    const category = data.get("category") as string;
    const message = data.get("message") as string;

    if (!name || !email || !category || !message) {
      setErrorMsg(t("fillAllFields"));
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          category,
          message,
          "cf-turnstile-response": captchaToken,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = typeof body.error === "string" ? body.error : "";
        throw new Error(ERROR_KEYS[code] ? t(ERROR_KEYS[code]) : "Something went wrong");
      }

      setStatus("success");
      form.reset();

      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
      }, 60_000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
      // The consumed token is single-use: arm a fresh challenge.
      setCaptchaToken("");
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mb-3 text-4xl">✉️</div>
        <h3 className="mb-2 text-lg font-semibold text-white">{t("messageSent")}</h3>
        <p className="text-sm text-text-muted">{t("messageSentDesc")}</p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm text-purple-light hover:underline"
        >
          {t("sendAnother")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm text-text-muted">{t("name")}</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white placeholder-text-dim outline-none focus:border-purple-light"
          placeholder={t("namePlaceholder")}
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-text-muted">{t("email")}</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white placeholder-text-dim outline-none focus:border-purple-light"
          placeholder={t("emailPlaceholder")}
        />
      </div>

      <div>
        <label htmlFor="category" className="mb-1 block text-sm text-text-muted">{t("category")}</label>
        <select
          id="category"
          name="category"
          required
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-purple-light"
        >
          <option value="">{t("categoryPlaceholder")}</option>
          {/* The VALUE is the canonical, language-independent contract the
              API whitelists; only the LABEL is translated. Sending the
              translation used to 400 every non-English locale. */}
          {CONTACT_CATEGORIES.map(({ value, labelKey }) => (
            <option key={value} value={value}>{t(labelKey)}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="mb-1 block text-sm text-text-muted">{t("message")}</label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white placeholder-text-dim outline-none focus:border-purple-light"
          placeholder={t("messagePlaceholder")}
        />
      </div>

      {TURNSTILE_SITE_KEY ? (
        <div
          ref={captchaHostRef}
          className="min-h-[65px]"
          aria-label={t("captchaLabel")}
        />
      ) : (
        <p role="note" className="text-sm text-text-muted">
          {t("contactUnavailable")}
        </p>
      )}

      {status === "error" && <p role="alert" className="text-sm text-accent">{errorMsg}</p>}

      <button
        type="submit"
        disabled={
          status === "loading" ||
          (TURNSTILE_SITE_KEY ? captchaToken === "" : true)
        }
        className="w-full rounded-full bg-gold py-2.5 text-sm font-medium text-bg transition-colors hover:bg-gold-soft disabled:opacity-50"
      >
        {status === "loading" ? tc("sending") : tc("sendMessage")}
      </button>
    </form>
  );
}
