import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

// Behavioural test setup for the web workspace (2026-09-15, Astro portal
// mission). Until now apps/web echoed "No tests yet" — the portal's tier
// logic was only checked structurally (validate:astro-portal). These tests
// render the REAL component with a simulated account state, so the free /
// premium / premium_plus behaviours are executed, not deduced.
export default {
  plugins: [react()],
  // Next's tsconfig sets `jsx: "preserve"`, which pushes esbuild toward the
  // classic runtime (React.createElement) — components without a default
  // React import then fail with "React is not defined". The automatic
  // runtime is what React 19 ships with; force it for the test transform.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
};
