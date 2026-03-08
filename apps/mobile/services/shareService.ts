import { Share, Platform } from 'react-native';

/**
 * Share service for iOS Share Sheet integration
 * Enables users to share horoscopes, profiles, and compatibility results
 */

interface ShareResult {
  success: boolean;
  action?: string;
  error?: string;
}

/**
 * Base share function with error handling
 */
async function shareContent(
  message: string,
  title?: string,
  url?: string
): Promise<ShareResult> {
  try {
    const result = await Share.share(
      {
        message,
        ...(title && { title }),
        ...(url && { url }),
      },
      {
        // iOS-specific options
        ...(Platform.OS === 'ios' && {
          excludedActivityTypes: [
            'com.apple.UIKit.activity.Print',
            'com.apple.UIKit.activity.AssignToContact',
            'com.apple.UIKit.activity.AddToReadingList',
          ],
        }),
      }
    );

    if (result.action === Share.sharedAction) {
      return { success: true, action: 'shared' };
    } else if (result.action === Share.dismissedAction) {
      return { success: false, action: 'dismissed' };
    }
    return { success: false };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Share failed',
    };
  }
}

/**
 * Get zodiac emoji for a sign
 */
function getZodiacEmoji(sign: string): string {
  const emojis: Record<string, string> = {
    aries: '♈',
    taurus: '♉',
    gemini: '♊',
    cancer: '♋',
    leo: '♌',
    virgo: '♍',
    libra: '♎',
    scorpio: '♏',
    sagittarius: '♐',
    capricorn: '♑',
    aquarius: '♒',
    pisces: '♓',
  };
  return emojis[sign.toLowerCase()] || '✨';
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Share daily horoscope reading
 */
export async function shareHoroscope(
  sunSign: string,
  horoscopeText: string,
  date?: string
): Promise<ShareResult> {
  const emoji = getZodiacEmoji(sunSign);
  const dateStr = date || new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const message = `${emoji} ${capitalize(sunSign)} Horoscope for ${dateStr}

${horoscopeText}

✨ Get your personalized horoscope on AstroDating!`;

  return shareContent(message, `${capitalize(sunSign)} Daily Horoscope`);
}

/**
 * Share birth chart / profile
 */
export async function shareProfile(
  name: string,
  sunSign: string,
  moonSign?: string,
  risingSign?: string
): Promise<ShareResult> {
  const sunEmoji = getZodiacEmoji(sunSign);
  const moonEmoji = moonSign ? getZodiacEmoji(moonSign) : '';
  const risingEmoji = risingSign ? getZodiacEmoji(risingSign) : '';

  let chartDetails = `☀️ Sun: ${capitalize(sunSign)} ${sunEmoji}`;

  if (moonSign) {
    chartDetails += `\n🌙 Moon: ${capitalize(moonSign)} ${moonEmoji}`;
  }

  if (risingSign) {
    chartDetails += `\n⬆️ Rising: ${capitalize(risingSign)} ${risingEmoji}`;
  }

  const message = `✨ ${name}'s Birth Chart

${chartDetails}

🔮 Discover your cosmic profile on AstroDating!`;

  return shareContent(message, `${name}'s Birth Chart`);
}

/**
 * Share compatibility result
 */
export async function shareCompatibility(
  userName: string,
  userSign: string,
  partnerName: string,
  partnerSign: string,
  compatibilityScore: number
): Promise<ShareResult> {
  const userEmoji = getZodiacEmoji(userSign);
  const partnerEmoji = getZodiacEmoji(partnerSign);

  // Get compatibility description based on score
  let description: string;
  if (compatibilityScore >= 90) {
    description = '🔥 Cosmic soulmates!';
  } else if (compatibilityScore >= 75) {
    description = '💫 Stellar connection!';
  } else if (compatibilityScore >= 60) {
    description = '✨ Great potential!';
  } else if (compatibilityScore >= 40) {
    description = '🌟 Interesting dynamics!';
  } else {
    description = '💭 Unique pairing!';
  }

  const message = `💕 Cosmic Compatibility Check

${capitalize(userSign)} ${userEmoji} + ${capitalize(partnerSign)} ${partnerEmoji}

${compatibilityScore}% Compatible
${description}

🔮 Find your cosmic match on AstroDating!`;

  return shareContent(
    message,
    `${capitalize(userSign)} + ${capitalize(partnerSign)} Compatibility`
  );
}

/**
 * Share match result (when two users match)
 */
export async function shareMatch(
  matchName: string,
  matchSign: string,
  compatibilityScore: number
): Promise<ShareResult> {
  const emoji = getZodiacEmoji(matchSign);

  const message = `🎉 I just matched with ${matchName} on AstroDating!

${emoji} ${capitalize(matchSign)} - ${compatibilityScore}% Compatible

✨ The stars have aligned! ✨

🔮 Find your cosmic connection on AstroDating!`;

  return shareContent(message, 'New AstroDating Match!');
}

/**
 * Share the app itself
 */
export async function shareApp(): Promise<ShareResult> {
  const message = `✨ Looking for love written in the stars?

I'm using AstroDating to find my cosmic match based on astrology and synastry compatibility!

🔮 Sun, Moon & Rising sign matching
💕 Real astrology-based compatibility
✨ Personalized horoscopes

Download AstroDating and find your soulmate! 🌟`;

  // In production, you'd include the actual App Store URL
  return shareContent(message, 'AstroDating - Find Your Cosmic Match');
}

/**
 * Share planetary transit information
 */
export async function sharePlanetaryTransit(
  planet: string,
  sign: string,
  description: string
): Promise<ShareResult> {
  const signEmoji = getZodiacEmoji(sign);

  const planetEmojis: Record<string, string> = {
    mercury: '☿️',
    venus: '♀️',
    mars: '♂️',
    jupiter: '♃',
    saturn: '♄',
    uranus: '⛢',
    neptune: '♆',
    pluto: '♇',
  };
  const planetEmoji = planetEmojis[planet.toLowerCase()] || '🪐';

  const message = `${planetEmoji} ${capitalize(planet)} in ${capitalize(sign)} ${signEmoji}

${description}

✨ Track planetary transits on AstroDating!`;

  return shareContent(message, `${capitalize(planet)} Transit Update`);
}

/**
 * Share retrograde alert
 */
export async function shareRetrogradeAlert(
  planet: string,
  startDate: string,
  endDate: string
): Promise<ShareResult> {
  const planetEmojis: Record<string, string> = {
    mercury: '☿️',
    venus: '♀️',
    mars: '♂️',
    jupiter: '♃',
    saturn: '♄',
  };
  const emoji = planetEmojis[planet.toLowerCase()] || '🪐';

  const message = `⚠️ ${capitalize(planet)} Retrograde Alert! ${emoji}

📅 ${startDate} - ${endDate}

Don't let the planets catch you off guard!

🔮 Get retrograde alerts on AstroDating!`;

  return shareContent(message, `${capitalize(planet)} Retrograde Alert`);
}

/**
 * Share lucky days prediction
 */
export async function shareLuckyDays(
  dates: string[],
  luckyActivity?: string
): Promise<ShareResult> {
  const datesStr = dates.map(d => `  🌟 ${d}`).join('\n');

  let message = `✨ My Lucky Days This Week

${datesStr}`;

  if (luckyActivity) {
    message += `\n\n💫 Best for: ${luckyActivity}`;
  }

  message += `\n\n🔮 Get your personalized lucky days on AstroDating!`;

  return shareContent(message, 'My Lucky Days');
}

export const ShareService = {
  shareHoroscope,
  shareProfile,
  shareCompatibility,
  shareMatch,
  shareApp,
  sharePlanetaryTransit,
  shareRetrogradeAlert,
  shareLuckyDays,
};

export default ShareService;
