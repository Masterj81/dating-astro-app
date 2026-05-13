// Conversation-first product change: removed `seeWhoLikes`, `superLikes`,
// and `priorityMessages` from the Celestial tier. Messaging is free
// for everyone now and the "who liked you" feed has no real backend
// signal on the web side, so those upsells are gone. Natal Chart,
// Synastry, and Monthly Tarot are the Celestial value props.
//
// The `likes` and `priority-messages` routes have been redirected to
// the premium hub so any lingering deep links land somewhere sensible.
//
// Icons used to be emojis (e.g. 🌟 💕 🔮). They have been replaced
// by `PremiumCardGlyph` which switches on the feature `key`. The
// previous string icons are gone so the catalog now ships only
// semantic data — no presentation glyphs to keep in sync.
export const CELESTIAL_FEATURES = [
  { key: 'fullNatalChart', route: '/premium-screens/natal-chart' },
  { key: 'advancedSynastry', route: '/premium-screens/synastry' },
  { key: 'dailyHoroscope', route: '/premium-screens/daily-horoscope' },
  { key: 'monthlyTarot', route: '/premium-screens/tarot' },
] as const;

// Daily Horoscope moved from Cosmic → Celestial: it's a personal +
// daily astrology feature, not a high-end exclusive. Cosmic users
// still have access by downward inclusion via FEATURE_TIERS.
//
// V2 rename: hub card labels resolve through the feature `key` via
// `t(feature.key)`. To surface V2 names (Planning Windows, Date
// Reflection, Transit Reflection) the keys here are the V2 i18n
// keys, not the legacy ones. Routes stay on legacy paths so deep
// links and PremiumGate `feature` slugs continue to work.
export const COSMIC_FEATURES = [
  { key: 'monthlyHoroscope', route: '/premium-screens/monthly-horoscope' },
  { key: 'weeklyTarot', route: '/premium-screens/tarot' },
  { key: 'transitReflection', route: '/premium-screens/planetary-transits' },
  { key: 'planningWindows', route: '/premium-screens/lucky-days' },
  { key: 'dateReflection', route: '/premium-screens/date-planner' },
] as const;

export const PAYWALL_PREVIEW_FEATURES = [
  { key: 'advancedSynastry', fallback: 'Synastry' },
  { key: 'fullNatalChart', fallback: 'Natal Chart' },
  { key: 'dailyHoroscope', fallback: 'Horoscopes' },
  { key: 'planningWindows', fallback: 'Planning Windows' },
] as const;

export const CELESTIAL_FEATURE_KEYS = CELESTIAL_FEATURES.map((feature) => feature.key);
export const COSMIC_FEATURE_KEYS = COSMIC_FEATURES.map((feature) => feature.key);
