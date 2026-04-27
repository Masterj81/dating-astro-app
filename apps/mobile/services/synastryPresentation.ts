import { BirthChart, CompatibilityScore, getElement } from './astrologyService';

export type SynastryCategory = {
  name: string;
  score: number;
  icon: string;
  description: string;
};

export type SynastryAspect = {
  title: string;
  type: 'harmonious' | 'intense' | 'challenging';
  description: string;
};

function translateSign(sign: string, t: (key: string) => string): string {
  return t(sign.toLowerCase()) || sign;
}

function influenceFromScore(score: number): SynastryAspect['type'] {
  if (score >= 80) return 'harmonious';
  if (score >= 60) return 'intense';
  return 'challenging';
}

export function buildSynastryCategories(
  userChart: BirthChart | null,
  matchChart: BirthChart | null,
  compatibility: CompatibilityScore | null,
  t: (key: string) => string,
): SynastryCategory[] {
  if (!compatibility) {
    return [];
  }

  return [
    {
      name: t('emotional'),
      score: compatibility.emotional,
      icon: '💕',
      description:
        userChart && matchChart
          ? `${t('moon')}: ${userChart.moon.sign} & ${matchChart.moon.sign}`
          : t('emotionalDesc'),
    },
    {
      name: t('communication'),
      score: compatibility.communication,
      icon: '💬',
      description:
        userChart && matchChart
          ? `${t('mercury')}: ${userChart.planets.mercury.sign} & ${matchChart.planets.mercury.sign}`
          : t('communicationDesc'),
    },
    {
      name: t('passion'),
      score: compatibility.passion,
      icon: '🔥',
      description:
        userChart && matchChart
          ? `${t('venus')}-${t('mars')}: ${userChart.planets.venus.sign} & ${matchChart.planets.mars.sign}`
          : t('passionDesc'),
    },
    {
      name: t('longTerm'),
      score: compatibility.longTerm,
      icon: '🏠',
      description: t('longTermDesc'),
    },
    {
      name: t('values'),
      score: compatibility.values,
      icon: '❤️',
      description:
        userChart && matchChart
          ? `${t('venus')}: ${userChart.planets.venus.sign} & ${matchChart.planets.venus.sign}`
          : t('valuesDesc'),
    },
    {
      name: t('growth'),
      score: compatibility.growth,
      icon: '🌱',
      description: t('growthDesc'),
    },
  ];
}

export function buildSynastryAspects(
  userChart: BirthChart | null,
  matchChart: BirthChart | null,
  compatibility: CompatibilityScore | null,
  t: (key: string) => string,
): SynastryAspect[] {
  if (!userChart || !matchChart || !compatibility) {
    return [];
  }

  const sunMoonType = influenceFromScore(compatibility.emotional);
  const passionType = influenceFromScore(compatibility.passion);
  const communicationType = influenceFromScore(compatibility.communication);
  const moonMoonType = getElement(userChart.moon.sign) === getElement(matchChart.moon.sign)
    ? 'harmonious'
    : influenceFromScore(compatibility.emotional);
  const saturnType = influenceFromScore(compatibility.longTerm);

  return [
    {
      title: `${t('sun')} (${translateSign(userChart.sun.sign, t)}) • ${t('moon')} (${translateSign(matchChart.moon.sign, t)})`,
      type: sunMoonType,
      description: sunMoonType === 'challenging' ? t('growthCompatibility') : t('emotionalDesc'),
    },
    {
      title: `${t('venus')} (${translateSign(userChart.planets.venus.sign, t)}) • ${t('mars')} (${translateSign(matchChart.planets.mars.sign, t)})`,
      type: passionType,
      description: passionType === 'challenging' ? t('growthCompatibility') : t('passionDesc'),
    },
    {
      title: `${t('mercury')} (${translateSign(userChart.planets.mercury.sign, t)}) • ${t('mercury')} (${translateSign(matchChart.planets.mercury.sign, t)})`,
      type: communicationType,
      description: communicationType === 'challenging' ? t('growthCompatibility') : t('communicationDesc'),
    },
    {
      title: `${t('moon')} (${translateSign(userChart.moon.sign, t)}) • ${t('moon')} (${translateSign(matchChart.moon.sign, t)})`,
      type: moonMoonType,
      description: moonMoonType === 'challenging' ? t('growthCompatibility') : t('emotionalDesc'),
    },
    {
      title: `${t('saturn')} (${translateSign(userChart.planets.saturn.sign, t)}) • ${t('saturn')} (${translateSign(matchChart.planets.saturn.sign, t)})`,
      type: saturnType,
      description: saturnType === 'challenging' ? t('growthCompatibility') : t('longTermDesc'),
    },
  ];
}
