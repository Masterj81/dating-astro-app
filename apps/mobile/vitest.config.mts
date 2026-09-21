import path from "path";
import { fileURLToPath } from "url";

// JUNO-17: the mobile workspace's first vitest suite executes the REAL
// config-plugin decisions (manifest mutation + generated XML resources).
// Node environment — no DOM needed.
export default {
  test: {
    environment: "node",
    include: ["plugins/**/*.test.{js,mjs}", "src/**/*.test.{ts,tsx}", "utils/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {},
  },
};
