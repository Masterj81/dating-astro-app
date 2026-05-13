"use client";

import { useCallback, useState } from "react";

interface Props {
  label?: string;
  text: string;
  children?: React.ReactNode;
  dense?: boolean;
}

// CopyableCard — wraps any block of output text with a small Copy button.
// The visible card stays clean; the button sits in the top-right corner.
export function CopyableCard({ label, text, children, dense }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be unavailable in some sandboxes — silently ignore.
      setCopied(false);
    }
  }, [text]);

  return (
    <div
      className={`hairline relative rounded-lg bg-ink-900 ${
        dense ? "p-3" : "p-4"
      }`}
    >
      {label ? (
        <div className="mb-2 text-xxs uppercase tracking-wide text-ink-400">
          {label}
        </div>
      ) : null}
      <div className="pr-16 text-sm leading-relaxed text-ink-100">
        {children ?? <p className="whitespace-pre-wrap">{text}</p>}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-3 top-3 rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs text-ink-200 transition hover:border-accent hover:text-white"
        aria-label={`Copy ${label ?? "value"}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
