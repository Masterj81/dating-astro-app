"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";

const CATEGORY_KEYS = [
  "catGeneral",
  "catAccount",
  "catBilling",
  "catBug",
  "catSafety",
  "catFeature",
  "catOther",
] as const;

export function ContactForm() {
  const t = useTranslations("contact");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const cooldownRef = useRef(false);

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
        body: JSON.stringify({ name, email, category, message }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong");
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
          {CATEGORY_KEYS.map((key) => (
            <option key={key} value={t(key)}>{t(key)}</option>
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

      {status === "error" && <p className="text-sm text-accent">{errorMsg}</p>}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-full bg-accent py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {status === "loading" ? tc("sending") : tc("sendMessage")}
      </button>
    </form>
  );
}
