// Zodiac signs and their properties
export const zodiacSigns = [
  { name: 'Aries', symbol: '♈', element: 'fire', dates: 'Mar 21 - Apr 19' },
  { name: 'Taurus', symbol: '♉', element: 'earth', dates: 'Apr 20 - May 20' },
  { name: 'Gemini', symbol: '♊', element: 'air', dates: 'May 21 - Jun 20' },
  { name: 'Cancer', symbol: '♋', element: 'water', dates: 'Jun 21 - Jul 22' },
  { name: 'Leo', symbol: '♌', element: 'fire', dates: 'Jul 23 - Aug 22' },
  { name: 'Virgo', symbol: '♍', element: 'earth', dates: 'Aug 23 - Sep 22' },
  { name: 'Libra', symbol: '♎', element: 'air', dates: 'Sep 23 - Oct 22' },
  { name: 'Scorpio', symbol: '♏', element: 'water', dates: 'Oct 23 - Nov 21' },
  { name: 'Sagittarius', symbol: '♐', element: 'fire', dates: 'Nov 22 - Dec 21' },
  { name: 'Capricorn', symbol: '♑', element: 'earth', dates: 'Dec 22 - Jan 19' },
  { name: 'Aquarius', symbol: '♒', element: 'air', dates: 'Jan 20 - Feb 18' },
  { name: 'Pisces', symbol: '♓', element: 'water', dates: 'Feb 19 - Mar 20' },
] as const;

export type ZodiacSign = typeof zodiacSigns[number]['name'];
export type Element = 'fire' | 'earth' | 'air' | 'water';

// Get zodiac sign from a date
export function getZodiacSign(month: number, day: number): ZodiacSign {
  const dates = [
    { sign: 'Capricorn', start: [1, 1], end: [1, 19] },
    { sign: 'Aquarius', start: [1, 20], end: [2, 18] },
    { sign: 'Pisces', start: [2, 19], end: [3, 20] },
    { sign: 'Aries', start: [3, 21], end: [4, 19] },
    { sign: 'Taurus', start: [4, 20], end: [5, 20] },
    { sign: 'Gemini', start: [5, 21], end: [6, 20] },
    { sign: 'Cancer', start: [6, 21], end: [7, 22] },
    { sign: 'Leo', start: [7, 23], end: [8, 22] },
    { sign: 'Virgo', start: [8, 23], end: [9, 22] },
    { sign: 'Libra', start: [9, 23], end: [10, 22] },
    { sign: 'Scorpio', start: [10, 23], end: [11, 21] },
    { sign: 'Sagittarius', start: [11, 22], end: [12, 21] },
    { sign: 'Capricorn', start: [12, 22], end: [12, 31] },
  ];

  for (const { sign, start, end } of dates) {
    const afterStart = month > start[0] || (month === start[0] && day >= start[1]);
    const beforeEnd = month < end[0] || (month === end[0] && day <= end[1]);
    if (afterStart && beforeEnd) {
      return sign as ZodiacSign;
    }
  }
  return 'Capricorn'; // Default fallback
}

// Get element for a zodiac sign
export function getElement(sign: ZodiacSign): Element {
  const signData = zodiacSigns.find(s => s.name === sign);
  return (signData?.element || 'fire') as Element;
}

// Basic element compatibility (simplified)
export function getElementCompatibility(element1: Element, element2: Element): number {
  const compatibility: Record<Element, Record<Element, number>> = {
    fire: { fire: 80, earth: 50, air: 90, water: 40 },
    earth: { fire: 50, earth: 85, air: 45, water: 90 },
    air: { fire: 90, earth: 45, air: 80, water: 55 },
    water: { fire: 40, earth: 90, air: 55, water: 85 },
  };
  return compatibility[element1][element2];
}

// Planets used in astrology
export const planets = [
  { name: 'Sun', symbol: '☉', represents: 'Core identity, ego' },
  { name: 'Moon', symbol: '☽', represents: 'Emotions, inner self' },
  { name: 'Mercury', symbol: '☿', represents: 'Communication, thinking' },
  { name: 'Venus', symbol: '♀', represents: 'Love, beauty, values' },
  { name: 'Mars', symbol: '♂', represents: 'Action, desire, energy' },
  { name: 'Jupiter', symbol: '♃', represents: 'Growth, luck, wisdom' },
  { name: 'Saturn', symbol: '♄', represents: 'Structure, discipline' },
  { name: 'Uranus', symbol: '♅', represents: 'Innovation, rebellion' },
  { name: 'Neptune', symbol: '♆', represents: 'Dreams, intuition' },
  { name: 'Pluto', symbol: '♇', represents: 'Transformation, power' },
] as const;

// Houses and their meanings
export const houses = [
  { number: 1, name: 'Self', represents: 'Identity, appearance' },
  { number: 2, name: 'Possessions', represents: 'Money, values' },
  { number: 3, name: 'Communication', represents: 'Learning, siblings' },
  { number: 4, name: 'Home', represents: 'Family, roots' },
  { number: 5, name: 'Creativity', represents: 'Romance, children' },
  { number: 6, name: 'Health', represents: 'Work, daily routines' },
  { number: 7, name: 'Partnership', represents: 'Marriage, contracts' },
  { number: 8, name: 'Transformation', represents: 'Death, rebirth, shared resources' },
  { number: 9, name: 'Philosophy', represents: 'Travel, higher learning' },
  { number: 10, name: 'Career', represents: 'Public image, ambition' },
  { number: 11, name: 'Community', represents: 'Friends, hopes' },
  { number: 12, name: 'Subconscious', represents: 'Hidden self, karma' },
] as const;
