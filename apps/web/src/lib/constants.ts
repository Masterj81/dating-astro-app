export const SITE = {
  name: "JUNO",
  // Canonical public domain. junosynastry.com is the JUNO brand domain;
  // apex must redirect to www (configure in DNS/Vercel). The legacy
  // astrodatingapp.com may stay live as a 301 redirect to here.
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.junosynastry.com",
  // Transactional / inbound email addresses. These are mailbox identifiers
  // bound to MX records — they are NOT changed in lockstep with the public
  // domain. Keep astrodatingapp.com here until junosynastry.com mailboxes
  // are provisioned (see "Next manual actions" in the rebrand report).
  email: {
    support: "support@astrodatingapp.com",
    privacy: "privacy@astrodatingapp.com",
    legal: "legal@astrodatingapp.com",
  },
  links: {
    appStore: "https://apps.apple.com/app/astrodating/id0000000000",
    playStore:
      "https://play.google.com/store/apps/details?id=com.astrodatingapp.mobile",
  },
} as const;
