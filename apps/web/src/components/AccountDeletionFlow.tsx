"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Step = "email" | "verify" | "done";

export function AccountDeletionFlow() {
  const t = useTranslations("accountDelete");
  const tc = useTranslations("common");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/account/request-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong");
      }

      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeletion(e: React.FormEvent) {
    e.preventDefault();
    if (!code) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/account/confirm-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong");
      }

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mb-3 text-4xl">👋</div>
        <h3 className="mb-2 text-lg font-semibold text-white">{t("doneTitle")}</h3>
        <p className="text-sm text-text-muted">{t("doneDesc")}</p>
        <p className="mt-2 text-sm text-text-muted">{t("doneNote")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {(["email", "verify", "done"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step === s
                  ? "bg-accent text-white"
                  : i < (["email", "verify", "done"] as const).indexOf(step)
                    ? "bg-purple text-white"
                    : "bg-bg text-text-dim"
              }`}
            >
              {i + 1}
            </div>
            {i < 2 && <div className="h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {step === "email" && (
        <form onSubmit={requestCode} className="space-y-4">
          <div className="text-center">
            <h3 className="mb-1 text-lg font-semibold text-white">{t("step1Title")}</h3>
            <p className="text-sm text-text-muted">{t("step1Desc")}</p>
          </div>

          <div>
            <label htmlFor="delete-email" className="mb-1 block text-sm text-text-muted">
              {t("emailLabel")}
            </label>
            <input
              id="delete-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white placeholder-text-dim outline-none focus:border-purple-light"
              placeholder={t("emailPlaceholder")}
            />
          </div>

          {error && <p className="text-sm text-accent">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-accent py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? t("sendingCode") : t("sendCode")}
          </button>
        </form>
      )}

      {step === "verify" && (
        <form onSubmit={confirmDeletion} className="space-y-4">
          <div className="text-center">
            <h3 className="mb-1 text-lg font-semibold text-white">{t("step2Title")}</h3>
            <p className="text-sm text-text-muted">
              {t("step2Desc", { email })}
            </p>
          </div>

          <div>
            <label htmlFor="delete-code" className="mb-1 block text-sm text-text-muted">
              {t("codeLabel")}
            </label>
            <input
              id="delete-code"
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-center text-lg tracking-widest text-white placeholder-text-dim outline-none focus:border-purple-light"
              placeholder={t("codePlaceholder")}
            />
          </div>

          {error && <p className="text-sm text-accent">{error}</p>}

          <div className="rounded-lg bg-accent/10 p-3">
            <p className="text-xs text-accent">⚠️ {t("warning")}</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-accent py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? t("deleting") : t("confirmDelete")}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError("");
            }}
            className="w-full text-sm text-text-dim hover:text-white"
          >
            {tc("goBack")}
          </button>
        </form>
      )}
    </div>
  );
}
