"use client";

// JUNO-13 (2026-09-22) — the LAST-RESORT error boundary. Next renders this
// ONLY for errors not caught by any segment boundary (root layout included),
// and it replaces the root layout entirely — so the enforced-CSP <meta> that
// the root layout renders would be LOST exactly here. This boundary renders
// its own <html>/<head> and re-includes the meta: no executable error
// document may ship without an enforced policy (review criterion: any
// unprotected HTML surface blocks the merge).
import { useEffect } from "react";

import { CspEnforcementMeta } from "@/components/CspEnforcementMeta";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <head>
        <CspEnforcementMeta />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0B0B14 0%, #151A2B 100%)",
          color: "#e0e0e0",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 480 }}>
          <h1
            style={{
              fontSize: "2rem",
              color: "#E85D75",
              marginBottom: "0.5rem",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ color: "#a0a0b0", marginBottom: "1.5rem" }}>
            The stars seem misaligned right now. Please try again.
          </p>
          {process.env.NODE_ENV === "development" && (
            <pre
              style={{
                background: "rgba(201, 134, 146, 0.1)",
                border: "1px solid rgba(201, 134, 146, 0.3)",
                borderRadius: 8,
                padding: "1rem",
                fontSize: "0.8rem",
                textAlign: "left",
                overflow: "auto",
                marginBottom: "1.5rem",
                color: "#f08090",
              }}
            >
              {error.message}
            </pre>
          )}
          <button
            onClick={reset}
            style={{
              background: "#E85D75",
              color: "#fff",
              border: "none",
              borderRadius: 9999,
              padding: "0.75rem 2rem",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
