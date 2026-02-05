// Astrology API Service — real calculations via astronomy-engine
import * as Astronomy from 'astronomy-engine';
import {
  getZodiacSign,
  getGeocentricLongitude,
  calculateAscendant,
  generateEqualHouses,
  detectAspect,
  ZODIAC_SIGNS,
  type AspectType,
} from './astrologyCore';
import { geocodeCity } from './geocoding';

// Types
export interface BirthData {
  date: string;      // YYYY-MM-DD
  time: string;      // HH:MM (24-hour format)
  latitude: number;
  longitude: number;
  timezone: number;  // UTC offset in hours
}

export interface PlanetPosition {
  planet: string;
  sign: string;
  degree: number;
  house: number;
  retrograde: boolean;
}

export interface NatalChart {
  sunSign: string;
  moonSign: string;
  risingSign: string;
  planets: PlanetPosition[];
  houses: number[];
}

export interface SynastryResult {
  overallScore: number;
  aspects: SynastryAspect[];
  categories: {
    emotional: number;
    communication: number;
    passion: number;
    longTerm: number;
  };
}

export interface SynastryAspect {
  planet1: string;
  planet2: string;
  aspect: string;
  orb: number;
  type: 'harmonious' | 'challenging' | 'intense';
  description: string;
}

const PLANET_BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const;

function parseBirthTime(time: string): { hours: number; minutes: number } {
  const parts = time.split(':');
  return {
    hours: parseInt(parts[0]) || 12,
    minutes: parseInt(parts[1]) || 0,
  };
}

function buildDate(birthData: BirthData): Date {
  const [year, month, day] = birthData.date.split('-').map(Number);
  const { hours, minutes } = parseBirthTime(birthData.time);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function isRetrograde(body: string, time: Astronomy.AstroTime): boolean {
  if (body === 'Sun' || body === 'Moon') return false;
  // Check longitude delta over ~1 day
  const timeBefore = Astronomy.MakeTime(new Date(time.date.getTime() - 86400000));
  const longNow = getGeocentricLongitude(body, time);
  const longBefore = getGeocentricLongitude(body, timeBefore);
  // Handle wrap-around at 360/0
  let delta = longNow - longBefore;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta < 0;
}

function getHouseNumber(longitude: number, houses: number[]): number {
  const normLong = ((longitude % 360) + 360) % 360;
  for (let i = 0; i < 12; i++) {
    const cusp = houses[i];
    const nextCusp = houses[(i + 1) % 12];
    if (nextCusp > cusp) {
      if (normLong >= cusp && normLong < nextCusp) return i + 1;
    } else {
      // Wraps around 360
      if (normLong >= cusp || normLong < nextCusp) return i + 1;
    }
  }
  return 1;
}

// Fetch natal chart using real astronomy-engine calculations
export async function fetchNatalChart(birthData: BirthData): Promise<NatalChart> {
  const date = buildDate(birthData);
  const time = Astronomy.MakeTime(date);

  const sunLong = getGeocentricLongitude('Sun', time);
  const moonLong = getGeocentricLongitude('Moon', time);
  const ascLong = calculateAscendant(time, birthData.latitude, birthData.longitude);
  const houses = generateEqualHouses(ascLong);

  const sunSign = getZodiacSign(sunLong);
  const moonSign = getZodiacSign(moonLong);
  const risingSign = getZodiacSign(ascLong);

  const planets: PlanetPosition[] = [
    {
      planet: 'Sun',
      sign: sunSign.sign,
      degree: sunSign.degree,
      house: getHouseNumber(sunLong, houses),
      retrograde: false,
    },
    {
      planet: 'Moon',
      sign: moonSign.sign,
      degree: moonSign.degree,
      house: getHouseNumber(moonLong, houses),
      retrograde: false,
    },
  ];

  for (const body of PLANET_BODIES) {
    const long = getGeocentricLongitude(body, time);
    const sign = getZodiacSign(long);
    planets.push({
      planet: body,
      sign: sign.sign,
      degree: sign.degree,
      house: getHouseNumber(long, houses),
      retrograde: isRetrograde(body, time),
    });
  }

  return {
    sunSign: sunSign.sign,
    moonSign: moonSign.sign,
    risingSign: risingSign.sign,
    planets,
    houses,
  };
}

// Aspect description generator
function describeAspect(planet1: string, planet2: string, aspectName: string, type: AspectType): string {
  const descriptions: Record<string, Record<AspectType, string>> = {
    'Sun-Moon': {
      harmonious: 'Natural emotional understanding and support',
      challenging: 'Tension between identity and emotional needs',
      intense: 'Powerful bond of identity and emotion',
    },
    'Venus-Mars': {
      harmonious: 'Beautiful romantic and physical harmony',
      challenging: 'Magnetic tension in love and desire',
      intense: 'Strong romantic and physical attraction',
    },
    'Mercury-Mercury': {
      harmonious: 'Easy, flowing communication',
      challenging: 'Different communication styles to navigate',
      intense: 'Minds deeply linked in conversation',
    },
    'Moon-Moon': {
      harmonious: 'Deep emotional resonance and understanding',
      challenging: 'Different emotional needs and rhythms',
      intense: 'Profound emotional merging',
    },
    'Saturn-Sun': {
      harmonious: 'Stabilizing long-term commitment energy',
      challenging: 'Lessons around authority and freedom',
      intense: 'Karmic bond with growth potential',
    },
  };

  const key1 = `${planet1}-${planet2}`;
  const key2 = `${planet2}-${planet1}`;
  const desc = descriptions[key1] || descriptions[key2];
  if (desc) return desc[type];
  return `${planet1} ${aspectName} ${planet2}: ${type} energy`;
}

// Synastry cross-chart pairs for category scoring
const SYNASTRY_PAIRS: Array<{
  planet1: string;
  planet2: string;
  category: 'emotional' | 'communication' | 'passion' | 'longTerm';
}> = [
  { planet1: 'Moon', planet2: 'Moon', category: 'emotional' },
  { planet1: 'Moon', planet2: 'Venus', category: 'emotional' },
  { planet1: 'Venus', planet2: 'Moon', category: 'emotional' },
  { planet1: 'Mercury', planet2: 'Mercury', category: 'communication' },
  { planet1: 'Mercury', planet2: 'Sun', category: 'communication' },
  { planet1: 'Sun', planet2: 'Mercury', category: 'communication' },
  { planet1: 'Venus', planet2: 'Mars', category: 'passion' },
  { planet1: 'Mars', planet2: 'Venus', category: 'passion' },
  { planet1: 'Saturn', planet2: 'Sun', category: 'longTerm' },
  { planet1: 'Sun', planet2: 'Saturn', category: 'longTerm' },
  { planet1: 'Saturn', planet2: 'Saturn', category: 'longTerm' },
];

function getPlanetLongFromChart(chart: NatalChart, planetName: string): number {
  const planet = chart.planets.find(p => p.planet === planetName);
  if (!planet) return 0;
  const signIndex = ZODIAC_SIGNS.indexOf(planet.sign as typeof ZODIAC_SIGNS[number]);
  return (signIndex >= 0 ? signIndex * 30 : 0) + planet.degree;
}

// Fetch synastry between two charts
export async function fetchSynastry(
  person1: BirthData,
  person2: BirthData
): Promise<SynastryResult> {
  const chart1 = await fetchNatalChart(person1);
  const chart2 = await fetchNatalChart(person2);

  const allAspects: SynastryAspect[] = [];
  const categoryScores: Record<string, { total: number; count: number }> = {
    emotional: { total: 0, count: 0 },
    communication: { total: 0, count: 0 },
    passion: { total: 0, count: 0 },
    longTerm: { total: 0, count: 0 },
  };

  for (const pair of SYNASTRY_PAIRS) {
    const long1 = getPlanetLongFromChart(chart1, pair.planet1);
    const long2 = getPlanetLongFromChart(chart2, pair.planet2);
    const aspect = detectAspect(long1, long2);

    if (aspect) {
      const orbTightness = 1 - aspect.actualOrb / 10;
      let score: number;
      if (aspect.type === 'harmonious') {
        score = 70 + orbTightness * 25;
      } else if (aspect.type === 'intense') {
        score = 60 + orbTightness * 20;
      } else {
        score = 35 + orbTightness * 15;
      }

      categoryScores[pair.category].total += score;
      categoryScores[pair.category].count += 1;

      allAspects.push({
        planet1: pair.planet1,
        planet2: pair.planet2,
        aspect: aspect.name,
        orb: aspect.actualOrb,
        type: aspect.type,
        description: describeAspect(pair.planet1, pair.planet2, aspect.name, aspect.type),
      });
    } else {
      // No aspect = neutral ~55
      categoryScores[pair.category].total += 55;
      categoryScores[pair.category].count += 1;
    }
  }

  const catScore = (key: string): number => {
    const cat = categoryScores[key];
    return cat.count > 0 ? Math.round(cat.total / cat.count) : 55;
  };

  const emotional = catScore('emotional');
  const communication = catScore('communication');
  const passion = catScore('passion');
  const longTerm = catScore('longTerm');
  const overallScore = Math.round((emotional + communication + passion + longTerm) / 4);

  return {
    overallScore,
    aspects: allAspects,
    categories: { emotional, communication, passion, longTerm },
  };
}

// Convert city name to coordinates — delegates to geocoding service
export async function getCityCoordinates(city: string): Promise<{
  latitude: number;
  longitude: number;
  timezone: number;
}> {
  const result = await geocodeCity(city);
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
  };
}

// Calculate compatibility score (simplified local calculation)
// Use this for quick estimates; use synastry API for detailed analysis
export function calculateQuickCompatibility(
  sign1: string,
  sign2: string
): number {
  const elements: Record<string, string> = {
    Aries: 'fire', Taurus: 'earth', Gemini: 'air', Cancer: 'water',
    Leo: 'fire', Virgo: 'earth', Libra: 'air', Scorpio: 'water',
    Sagittarius: 'fire', Capricorn: 'earth', Aquarius: 'air', Pisces: 'water',
  };

  const compatibility: Record<string, Record<string, number>> = {
    fire: { fire: 80, earth: 50, air: 90, water: 40 },
    earth: { fire: 50, earth: 85, air: 45, water: 90 },
    air: { fire: 90, earth: 45, air: 80, water: 55 },
    water: { fire: 40, earth: 90, air: 55, water: 85 },
  };

  const el1 = elements[sign1];
  const el2 = elements[sign2];

  if (!el1 || !el2) return 50;
  return compatibility[el1][el2];
}
