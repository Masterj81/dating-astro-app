"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App shell error boundary caught:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)",
        color: "#e0e0e0",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ textAlign: "center", padding: "2rem", maxWidth: 480 }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>&#x2727;</div>
        <h1
          style={{
            fontSize: "1.5rem",
            color: "#e94560",
            marginBottom: "0.5rem",
          }}
        >
          Cosmic glitch detected
        </h1>
        <p style={{ color: "#a0a0b0", marginBottom: "1.5rem" }}>
          Something unexpected happened. Let&apos;s get you back on track.
        </p>
        {process.env.NODE_ENV === "development" && (
          <pre
            style={{
              background: "rgba(233,69,96,0.1)",
              border: "1px solid rgba(233,69,96,0.3)",
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
            background: "linear-gradient(135deg, #e94560 0%, #c23152 100%)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "0.75rem 2rem",
            fontSize: "1rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
