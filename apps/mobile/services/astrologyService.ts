import { supabase } from './supabase';

// Simple in-memory cache for birth chart API calls to avoid redundant network requests
const birthChartCache = new Map<string, { data: BirthChart; timestamp: number }>();
const CHART_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface BirthChart {
  sun: {
    longitude: number;
    sign: string;
    degree: number;
  };
  moon: {
    longitude: number;
    sign: string;
    degree: number;
  };
  rising: {
    longitude: number;
    sign: string;
    degree: number;
  };
  planets: {
    mercury: { longitude: number; sign: string; degree: number };
    venus: { longitude: number; sign: string; degree: number };
    mars: { longitude: number; sign: string; degree: number };
    jupiter: { longitude: number; sign: string; degree: number };
    saturn: { longitude: number; sign: string; degree: number };
  };
  coordinates: {
    latitude: number;
    longitude: number;
  };
  julianDay: number;
}

export interface CompatibilityScore {
  overall: number;
  emotional: number;
  communication: number;
  passion: number;
  longTerm: number;
  values: number;
  growth: number;
}

export interface SunSign {
  sign: string;
  degree: number;
}

/**
 * Calculate full birth chart from birth data
 * @param birthDate - Format: YYYY-MM-DD
 * @param birthTime - Format: HH:MM (24-hour), optional
 * @param birthCity - City name, optional if coordinates provided
 * @param latitude - Optional, will use city geocoding if not provided
 * @param longitude - Optional, will use city geocoding if not provided
 */
export async function calculateBirthChart(
  birthDate: string,
  birthTime?: string,
  birthCity?: string,
  latitude?: number,
  longitude?: number
): Promise<BirthChart> {
  // Check cache to avoid redundant edge function calls
  const cacheKey = `${birthDate}|${birthTime || ''}|${birthCity || ''}|${latitude || ''}|${longitude || ''}`;
  const cached = birthChartCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CHART_CACHE_TTL) {
    return cached.data;
  }

  const { data, error } = await supabase.functions.invoke('calculate-chart', {
    body: {
      action: 'calculate_chart',
      birthDate,
      birthTime,
      birthCity,
      latitude,
      longitude,
    },
  });

  if (error) {
    throw new Error(`Failed to calculate birth chart: ${error.message}`);
  }

  if (!data.success) {
    throw new Error(data.error || 'Unknown error calculating birth chart');
  }

  const chart = data.data as BirthChart;
  birthChartCache.set(cacheKey, { data: chart, timestamp: Date.now() });
  return chart;
}

/**
 * Calculate compatibility/synastry between two birth charts
 */
export async function calculateSynastry(
  chart1: BirthChart,
  chart2: BirthChart
): Promise<CompatibilityScore> {
  const { data, error } = await supabase.functions.invoke('calculate-chart', {
    body: {
      action: 'calculate_synastry',
      chart1,
      chart2,
    },
  });

  if (error) {
    throw new Error(`Failed to calculate synastry: ${error.message}`);
  }

  if (!data.success) {
    throw new Error(data.error || 'Unknown error calculating synastry');
  }

  return data.data as CompatibilityScore;
}

/**
 * Quick sun sign calculation from birth date only
 * @param birthDate - Format: YYYY-MM-DD
 */
export async function getSunSign(birthDate: string): Promise<SunSign> {
  const { data, error } = await supabase.functions.invoke('calculate-chart', {
    body: {
      action: 'get_sun_sign',
      birthDate,
    },
  });

  if (error) {
    throw new Error(`Failed to get sun sign: ${error.message}`);
  }

  if (!data.success) {
    throw new Error(data.error || 'Unknown error getting sun sign');
  }

  return data.data as SunSign;
}

/**
 * Calculate sun sign locally without API call (for instant feedback)
 * Less accurate but immediate
 */
export function calculateSunSignLocal(birthDate: string): string {
  if (!birthDate || typeof birthDate !== 'string') return 'unknown';
  const [year, month, day] = birthDate.split('-').map(Number);
  if (!month || !day || isNaN(month) || isNaN(day)) return 'unknown';

  // Simplified sun sign calculation based on date ranges
  const signs = [
    { sign: 'capricorn', startMonth: 1, startDay: 1, endMonth: 1, endDay: 19 },
    { sign: 'aquarius', startMonth: 1, startDay: 20, endMonth: 2, endDay: 18 },
    { sign: 'pisces', startMonth: 2, startDay: 19, endMonth: 3, endDay: 20 },
    { sign: 'aries', startMonth: 3, startDay: 21, endMonth: 4, endDay: 19 },
    { sign: 'taurus', startMonth: 4, startDay: 20, endMonth: 5, endDay: 20 },
    { sign: 'gemini', startMonth: 5, startDay: 21, endMonth: 6, endDay: 20 },
    { sign: 'cancer', startMonth: 6, startDay: 21, endMonth: 7, endDay: 22 },
    { sign: 'leo', startMonth: 7, startDay: 23, endMonth: 8, endDay: 22 },
    { sign: 'virgo', startMonth: 8, startDay: 23, endMonth: 9, endDay: 22 },
    { sign: 'libra', startMonth: 9, startDay: 23, endMonth: 10, endDay: 22 },
    { sign: 'scorpio', startMonth: 10, startDay: 23, endMonth: 11, endDay: 21 },
    { sign: 'sagittarius', startMonth: 11, startDay: 22, endMonth: 12, endDay: 21 },
    { sign: 'capricorn', startMonth: 12, startDay: 22, endMonth: 12, endDay: 31 },
  ];

  for (const range of signs) {
    if (
      (month === range.startMonth && day >= range.startDay) ||
      (month === range.endMonth && day <= range.endDay)
    ) {
      return range.sign;
    }
  }

  return 'unknown';
}

/**
 * Get element for a zodiac sign
 */
export function getElement(sign: string): 'fire' | 'earth' | 'air' | 'water' {
  if (!sign || typeof sign !== 'string') return 'fire';
  const elements: Record<string, 'fire' | 'earth' | 'air' | 'water'> = {
    aries: 'fire',
    leo: 'fire',
    sagittarius: 'fire',
    taurus: 'earth',
    virgo: 'earth',
    capricorn: 'earth',
    gemini: 'air',
    libra: 'air',
    aquarius: 'air',
    cancer: 'water',
    scorpio: 'water',
    pisces: 'water',
  };
  return elements[sign.toLowerCase()] || 'fire';
}

/**
 * Get modality for a zodiac sign
 */
export function getModality(sign: string): 'cardinal' | 'fixed' | 'mutable' {
  if (!sign || typeof sign !== 'string') return 'cardinal';
  const modalities: Record<string, 'cardinal' | 'fixed' | 'mutable'> = {
    aries: 'cardinal',
    cancer: 'cardinal',
    libra: 'cardinal',
    capricorn: 'cardinal',
    taurus: 'fixed',
    leo: 'fixed',
    scorpio: 'fixed',
    aquarius: 'fixed',
    gemini: 'mutable',
    virgo: 'mutable',
    sagittarius: 'mutable',
    pisces: 'mutable',
  };
  return modalities[sign.toLowerCase()] || 'cardinal';
}

/**
 * Get zodiac emoji
 */
export function getZodiacEmoji(sign: string): string {
  if (!sign || typeof sign !== 'string') return '⭐';
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
  return emojis[sign.toLowerCase()] || '⭐';
}

/**
 * Calculate quick compatibility score based on sun signs only
 * Useful for instant feedback before full synastry
 */
export function calculateQuickCompatibility(sign1: string, sign2: string): number {
  // Guard against null/undefined signs
  if (!sign1 || !sign2 || typeof sign1 !== 'string' || typeof sign2 !== 'string') {
    return 65; // Neutral fallback score
  }

  const elements: Record<string, string> = {
    aries: 'fire', leo: 'fire', sagittarius: 'fire',
    taurus: 'earth', virgo: 'earth', capricorn: 'earth',
    gemini: 'air', libra: 'air', aquarius: 'air',
    cancer: 'water', scorpio: 'water', pisces: 'water',
  };

  const el1 = elements[sign1.toLowerCase()];
  const el2 = elements[sign2.toLowerCase()];

  // Base score from element compatibility
  let score: number;
  if (el1 === el2) {
    score = 85;
  } else {
    const compatible: Record<string, string> = {
      fire: 'air', air: 'fire', earth: 'water', water: 'earth',
    };
    score = compatible[el1] === el2 ? 75 : 55;
  }

  // Modality bonus
  const MODALITIES: Record<string, string> = {
    aries: 'cardinal', cancer: 'cardinal', libra: 'cardinal', capricorn: 'cardinal',
    taurus: 'fixed', leo: 'fixed', scorpio: 'fixed', aquarius: 'fixed',
    gemini: 'mutable', virgo: 'mutable', sagittarius: 'mutable', pisces: 'mutable',
  };
  const mod1 = MODALITIES[sign1.toLowerCase()];
  const mod2 = MODALITIES[sign2.toLowerCase()];
  if (mod1 && mod2) {
    if (mod1 === mod2) {
      score += 5; // Same pace — they understand each other
    } else if (
      (mod1 === 'cardinal' && mod2 === 'mutable') ||
      (mod1 === 'mutable' && mod2 === 'cardinal')
    ) {
      score += 3; // Complementary — one initiates, the other adapts
    }
  }

  return Math.min(score, 100);
}
