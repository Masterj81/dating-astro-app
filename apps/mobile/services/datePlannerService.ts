import * as Astronomy from 'astronomy-engine';
import { BirthChart } from './astrologyService';
import { getZodiacSign, getGeocentricLongitude, detectAspect } from './astrologyCore';

export type DateScore = {
  date: Date;
  overallScore: number;
  moonPhaseScore: number;
  venusScore: number;
  marsScore: number;
  bestHours: { start: number; end: number }[];
  moonPhase: string;
  moonSign: string;
  venusSign: string;
  description: string;
};

type MoonPhaseInfo = {
  phase: string;
  emoji: string;
  score: number;
};

const MOON_PHASES: Record<string, MoonPhaseInfo> = {
  new: { phase: 'newMoon', emoji: '🌑', score: 70 },
  waxingCrescent: { phase: 'waxingCrescent', emoji: '🌒', score: 80 },
  firstQuarter: { phase: 'firstQuarter', emoji: '🌓', score: 75 },
  waxingGibbous: { phase: 'waxingGibbous', emoji: '🌔', score: 85 },
  full: { phase: 'fullMoon', emoji: '🌕', score: 95 },
  waningGibbous: { phase: 'waningGibbous', emoji: '🌖', score: 80 },
  lastQuarter: { phase: 'lastQuarter', emoji: '🌗', score: 70 },
  waningCrescent: { phase: 'waningCrescent', emoji: '🌘', score: 65 },
};

function getMoonPhaseInfo(date: Date): MoonPhaseInfo {
  const time = Astronomy.MakeTime(date);
  const phase = Astronomy.MoonPhase(time);

  // Moon phase in degrees: 0 = new, 90 = first quarter, 180 = full, 270 = last quarter
  if (phase < 22.5) return MOON_PHASES.new;
  if (phase < 67.5) return MOON_PHASES.waxingCrescent;
  if (phase < 112.5) return MOON_PHASES.firstQuarter;
  if (phase < 157.5) return MOON_PHASES.waxingGibbous;
  if (phase < 202.5) return MOON_PHASES.full;
  if (phase < 247.5) return MOON_PHASES.waningGibbous;
  if (phase < 292.5) return MOON_PHASES.lastQuarter;
  if (phase < 337.5) return MOON_PHASES.waningCrescent;
  return MOON_PHASES.new;
}

export function getMoonPhaseScore(date: Date): { score: number; phase: string; emoji: string } {
  const info = getMoonPhaseInfo(date);
  return {
    score: info.score,
    phase: info.phase,
    emoji: info.emoji,
  };
}

export function getVenusPositionScore(date: Date, userChart?: BirthChart): number {
  const time = Astronomy.MakeTime(date);
  const venusLong = getGeocentricLongitude('Venus', time);
  const { sign: venusSign } = getZodiacSign(venusLong);

  // Base score based on Venus dignity
  let score = 70;

  // Venus is exalted in Pisces, domicile in Taurus and Libra
  if (venusSign === 'Pisces') score = 95;
  else if (venusSign === 'Taurus' || venusSign === 'Libra') score = 90;
  // Venus is in detriment in Aries and Scorpio, fall in Virgo
  else if (venusSign === 'Virgo') score = 55;
  else if (venusSign === 'Aries' || venusSign === 'Scorpio') score = 60;

  // Bonus if Venus aspects user's natal Venus
  if (userChart?.planets?.venus) {
    const aspect = detectAspect(venusLong, userChart.planets.venus.longitude);
    if (aspect) {
      if (aspect.type === 'harmonious') score += 15;
      else if (aspect.type === 'intense') score += 10;
      else score -= 5;
    }
  }

  return Math.min(100, Math.max(0, score));
}

export function getMarsPositionScore(date: Date, userChart?: BirthChart): number {
  const time = Astronomy.MakeTime(date);
  const marsLong = getGeocentricLongitude('Mars', time);
  const { sign: marsSign } = getZodiacSign(marsLong);

  // Base score based on Mars dignity
  let score = 70;

  // Mars is exalted in Capricorn, domicile in Aries and Scorpio
  if (marsSign === 'Capricorn') score = 90;
  else if (marsSign === 'Aries' || marsSign === 'Scorpio') score = 85;
  // Mars is in detriment in Libra and Taurus, fall in Cancer
  else if (marsSign === 'Cancer') score = 55;
  else if (marsSign === 'Libra' || marsSign === 'Taurus') score = 60;

  // Bonus if Mars aspects user's natal Mars
  if (userChart?.planets?.mars) {
    const aspect = detectAspect(marsLong, userChart.planets.mars.longitude);
    if (aspect) {
      if (aspect.type === 'harmonious') score += 10;
      else if (aspect.type === 'intense') score += 5;
      else score -= 5;
    }
  }

  return Math.min(100, Math.max(0, score));
}

export function calculateOptimalHours(date: Date, userChart?: BirthChart): { start: number; end: number }[] {
  // Venus hours are traditionally best for romance
  // In planetary hours system, Venus rules specific hours each day
  // For simplicity, we'll suggest evening hours (romantic) and afternoon hours (social)
  const dayOfWeek = date.getDay();

  // Friday (Venus day) is always best
  if (dayOfWeek === 5) {
    return [
      { start: 18, end: 21 }, // Evening - prime romantic time
      { start: 14, end: 17 }, // Afternoon - good social time
    ];
  }

  // Sunday and Monday (Sun/Moon) are also good for emotional connection
  if (dayOfWeek === 0 || dayOfWeek === 1) {
    return [
      { start: 19, end: 22 }, // Evening
      { start: 12, end: 14 }, // Lunch time
    ];
  }

  // Midweek default
  return [
    { start: 18, end: 21 }, // Evening
  ];
}

function getDateDescription(score: number, moonPhase: string, venusSign: string): string {
  if (score >= 85) {
    return 'cosmicAligned'; // Excellent day for romance
  } else if (score >= 75) {
    return 'favorableEnergy'; // Great potential for connection
  } else if (score >= 65) {
    return 'goodVibes'; // Solid day for a date
  } else if (score >= 55) {
    return 'neutralEnergy'; // Average cosmic energy
  } else {
    return 'challengingEnergy'; // Consider another day
  }
}

export function calculateDateScores(
  userChart?: BirthChart,
  matchChart?: BirthChart,
  days: number = 30
): DateScore[] {
  const scores: DateScore[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    date.setHours(12, 0, 0, 0); // Noon for calculations

    const time = Astronomy.MakeTime(date);

    // Get planetary positions
    const moonLong = getGeocentricLongitude('Moon', time);
    const venusLong = getGeocentricLongitude('Venus', time);
    const { sign: moonSign } = getZodiacSign(moonLong);
    const { sign: venusSign } = getZodiacSign(venusLong);

    // Calculate individual scores
    const moonPhaseInfo = getMoonPhaseScore(date);
    const venusScore = getVenusPositionScore(date, userChart);
    const marsScore = getMarsPositionScore(date, userChart);

    // Synastry bonus if match chart provided
    let synastryBonus = 0;
    if (matchChart?.moon?.longitude) {
      const moonAspect = detectAspect(moonLong, matchChart.moon.longitude);
      if (moonAspect?.type === 'harmonious') synastryBonus += 10;
    }
    if (matchChart?.planets?.venus?.longitude) {
      const venusAspect = detectAspect(venusLong, matchChart.planets.venus.longitude);
      if (venusAspect?.type === 'harmonious') synastryBonus += 10;
    }

    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      moonPhaseInfo.score * 0.35 +
      venusScore * 0.35 +
      marsScore * 0.15 +
      synastryBonus +
      15 // Base score adjustment
    );

    const bestHours = calculateOptimalHours(date, userChart);

    scores.push({
      date,
      overallScore: Math.min(100, Math.max(0, overallScore)),
      moonPhaseScore: moonPhaseInfo.score,
      venusScore,
      marsScore,
      bestHours,
      moonPhase: moonPhaseInfo.phase,
      moonSign,
      venusSign,
      description: getDateDescription(overallScore, moonPhaseInfo.phase, venusSign),
    });
  }

  return scores;
}

export function getTop5Dates(scores: DateScore[]): DateScore[] {
  return [...scores]
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 5);
}

export function formatHourRange(start: number, end: number): string {
  const formatHour = (h: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}${period}`;
  };
  return `${formatHour(start)} - ${formatHour(end)}`;
}
