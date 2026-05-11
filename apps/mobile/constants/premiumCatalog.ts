// Conversation-first product change: removed `seeWhoLikes`, `superLikes`,
// and `priorityMessages` from the Celestial tier. Messaging is free
// for everyone now and the "who liked you" feed has no real backend
// signal on the web side, so those upsells are gone. Natal Chart,
// Synastry, and Monthly Tarot are the Celestial value props.
//
// The `likes` and `priority-messages` routes have been redirected to
// the premium hub so any lingering deep links land somewhere sensible.
export const CELESTIAL_FEATURES = [
  { key: 'fullNatalChart', icon: '\u{1F31F}', route: '/premium-screens/natal-chart' },
  { key: 'advancedSynastry', icon: '\u{1F495}', route: '/premium-screens/synastry' },
  { key: 'monthlyTarot', icon: '\u{1F0CF}', route: '/premium-screens/tarot' },
] as const;

export const COSMIC_FEATURES = [
  { key: 'dailyHoroscope', icon: '\u{1F52E}', route: '/premium-screens/daily-horoscope' },
  { key: 'monthlyHoroscope', icon: '\u{1F4C5}', route: '/premium-screens/monthly-horoscope' },
  { key: 'weeklyTarot', icon: '\u{1F0CF}', route: '/premium-screens/tarot' },
  { key: 'planetaryTransits', icon: '\u{1FA90}', route: '/premium-screens/planetary-transits' },
  { key: 'luckyDays', icon: '\u{1F340}', route: '/premium-screens/lucky-days' },
  { key: 'datePlanner', icon: '\u{1F4AB}', route: '/premium-screens/date-planner' },
] as const;

export const PAYWALL_PREVIEW_FEATURES = [
  { key: 'advancedSynastry', icon: '\u{1F495}', fallback: 'Synastry' },
  { key: 'fullNatalChart', icon: '\u{1F31F}', fallback: 'Natal Chart' },
  { key: 'dailyHoroscope', icon: '\u{1F52E}', fallback: 'Horoscopes' },
  { key: 'luckyDays', icon: '\u{1F340}', fallback: 'Lucky Days' },
] as const;

export const CELESTIAL_FEATURE_KEYS = CELESTIAL_FEATURES.map((feature) => feature.key);
export const COSMIC_FEATURE_KEYS = COSMIC_FEATURES.map((feature) => feature.key);
