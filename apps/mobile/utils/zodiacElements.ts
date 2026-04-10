const ZODIAC_ELEMENTS = {
  aries: 'fire',
  taurus: 'earth',
  gemini: 'air',
  cancer: 'water',
  leo: 'fire',
  virgo: 'earth',
  libra: 'air',
  scorpio: 'water',
  sagittarius: 'fire',
  capricorn: 'earth',
  aquarius: 'air',
  pisces: 'water',
} as const;

const ELEMENT_COLORS = {
  fire: '#E85D75',
  earth: '#DAB56D',
  air: '#7C6CFF',
  water: '#6CA5FF',
} as const;

type ZodiacSign = keyof typeof ZODIAC_ELEMENTS;
type Element = (typeof ZODIAC_ELEMENTS)[ZodiacSign];

export function getElement(sign: string): Element | 'unknown' {
  const key = sign.toLowerCase() as ZodiacSign;
  return ZODIAC_ELEMENTS[key] ?? 'unknown';
}

export function getElementColor(sign: string): string {
  const element = getElement(sign);
  if (element === 'unknown') return '#FFFFFF';
  return ELEMENT_COLORS[element];
}

export { ZODIAC_ELEMENTS, ELEMENT_COLORS };
