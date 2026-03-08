export const SITE = {
  name: "AstroDating",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://astrodatingapp.com",
  email: {
    support: "support@astrodatingapp.com",
    privacy: "privacy@astrodatingapp.com",
    legal: "legal@astrodatingapp.com",
  },
  links: {
    appStore: "https://apps.apple.com/app/astrodating/id0000000000",
    playStore:
      "https://play.google.com/store/apps/details?id=com.astrodating.app",
  },
} as const;
