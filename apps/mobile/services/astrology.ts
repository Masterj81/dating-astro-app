// Accurate astrology calculations using astronomy-engine
import * as Astronomy from 'astronomy-engine';
import {
  getZodiacSign,
  getGeocentricLongitude,
  calculateAscendant,
  signDegreeToLongitude,
  detectAspect,
} from './astrologyCore';

type NatalChart = {
  sun: { sign: string; degree: number; longitude: number };
  moon: { sign: string; degree: number; longitude: number };
  rising: { sign: string; degree: number; longitude: number };
  mercury: { sign: string; degree: number; longitude: number };
  venus: { sign: string; degree: number; longitude: number };
  mars: { sign: string; degree: number; longitude: number };
  jupiter: { sign: string; degree: number; longitude: number };
  saturn: { sign: string; degree: number; longitude: number };
};

function makePosition(longitude: number): { sign: string; degree: number; longitude: number } {
  const { sign, degree } = getZodiacSign(longitude);
  return { sign, degree, longitude: Math.round(longitude * 100) / 100 };
}

// Main function to calculate natal chart
export function calculateNatalChart(
  birthDate: Date,
  birthTime: string | null,
  latitude: number = 45.5017,
  longitude: number = -73.5673
): NatalChart {
  // Parse birth time or default to noon
  let hours = 12, minutes = 0;
  if (birthTime) {
    const timeMatch = birthTime.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      minutes = parseInt(timeMatch[2]);

      // Handle AM/PM
      if (birthTime.toLowerCase().includes('pm') && hours < 12) {
        hours += 12;
      } else if (birthTime.toLowerCase().includes('am') && hours === 12) {
        hours = 0;
      }
    }
  }

  // Create date with time
  const dateWithTime = new Date(birthDate);
  dateWithTime.setHours(hours, minutes, 0, 0);

  const time = Astronomy.MakeTime(dateWithTime);

  // Calculate positions using astronomy-engine
  const sunLong = getGeocentricLongitude('Sun', time);
  const moonLong = getGeocentricLongitude('Moon', time);
  const mercuryLong = getGeocentricLongitude('Mercury', time);
  const venusLong = getGeocentricLongitude('Venus', time);
  const marsLong = getGeocentricLongitude('Mars', time);
  const jupiterLong = getGeocentricLongitude('Jupiter', time);
  const saturnLong = getGeocentricLongitude('Saturn', time);
  const ascLong = calculateAscendant(time, latitude, longitude);

  return {
    sun: makePosition(sunLong),
    moon: makePosition(moonLong),
    rising: makePosition(ascLong),
    mercury: makePosition(mercuryLong),
    venus: makePosition(venusLong),
    mars: makePosition(marsLong),
    jupiter: makePosition(jupiterLong),
    saturn: makePosition(saturnLong),
  };
}

// Weighted planet pairs for aspect-based compatibility scoring
const PLANET_PAIRS: Array<{
  key1: keyof NatalChart;
  key2: keyof NatalChart;
  weight: number;
}> = [
  { key1: 'sun', key2: 'sun', weight: 1.0 },
  { key1: 'moon', key2: 'moon', weight: 1.0 },
  { key1: 'sun', key2: 'moon', weight: 0.9 },   // cross: chart1 sun vs chart2 moon
  { key1: 'moon', key2: 'sun', weight: 0.9 },   // cross: chart1 moon vs chart2 sun
  { key1: 'venus', key2: 'mars', weight: 0.85 }, // cross: chart1 venus vs chart2 mars
  { key1: 'mars', key2: 'venus', weight: 0.85 }, // cross: chart1 mars vs chart2 venus
  { key1: 'mercury', key2: 'mercury', weight: 0.7 },
  { key1: 'rising', key2: 'sun', weight: 0.7 },  // cross: chart1 rising vs chart2 sun
  { key1: 'sun', key2: 'rising', weight: 0.7 },  // cross: chart1 sun vs chart2 rising
  { key1: 'jupiter', key2: 'jupiter', weight: 0.5 },
  { key1: 'saturn', key2: 'saturn', weight: 0.5 },
  { key1: 'venus', key2: 'venus', weight: 0.6 },
];

// Calculate compatibility between two charts using aspect-based scoring
export function calculateCompatibility(chart1: NatalChart, chart2: NatalChart): number {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const pair of PLANET_PAIRS) {
    const pos1 = chart1[pair.key1];
    const pos2 = chart2[pair.key2];

    const long1 = pos1.longitude != null ? pos1.longitude : signDegreeToLongitude(pos1);
    const long2 = pos2.longitude != null ? pos2.longitude : signDegreeToLongitude(pos2);

    const aspect = detectAspect(long1, long2);
    totalWeight += pair.weight;

    if (aspect) {
      // Tighter orb = stronger effect
      const orbTightness = 1 - aspect.actualOrb / 10;

      if (aspect.type === 'harmonious') {
        weightedScore += pair.weight * orbTightness * 1.0; // positive contribution
      } else if (aspect.type === 'intense') {
        // Conjunctions are generally positive but intense
        weightedScore += pair.weight * orbTightness * 0.6;
      } else {
        // Challenging aspects reduce score
        weightedScore -= pair.weight * orbTightness * 0.5;
      }
    }
    // No aspect detected = neutral (no contribution)
  }

  // Base score 50, shift up/down by harmonious/challenging ratio
  const ratio = totalWeight > 0 ? weightedScore / totalWeight : 0;
  let score = 50 + ratio * 40;

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, Math.round(score)));

  return score;
}

// Get a description for compatibility
export function getCompatibilityDescription(score: number): string {
  if (score >= 85) return "Cosmic soulmates! Your charts are incredibly aligned.";
  if (score >= 75) return "Strong connection. Great potential for lasting love.";
  if (score >= 65) return "Good compatibility with interesting dynamics.";
  if (score >= 55) return "Some challenges, but growth opportunities abound.";
  return "Different energies that require understanding and patience.";
}
