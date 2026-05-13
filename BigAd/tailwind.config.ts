import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b0c0e",
          900: "#101216",
          800: "#161a20",
          700: "#1d222a",
          600: "#262c36",
          500: "#3a414d",
          400: "#5c6470",
          300: "#8a93a0",
          200: "#b8bfc9",
          100: "#dde2e8",
          50: "#f3f5f8",
        },
        accent: {
          DEFAULT: "#3b82f6",
          soft: "#1e3a8a",
          coral: "#f97066",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Inter",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
      },
      fontSize: {
        xxs: ["0.6875rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
