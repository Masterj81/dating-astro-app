import path from "node:path";
import type { NextConfig } from "next";

// Pin the workspace root to BigAd itself. The parent monorepo also has a
// package-lock.json (it's a separate AstroDating project that we don't
// touch); without this hint, Next would warn about the ambiguity.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
