const SIGN_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    Aries: "Aries",
    Taurus: "Taurus",
    Gemini: "Gemini",
    Cancer: "Cancer",
    Leo: "Leo",
    Virgo: "Virgo",
    Libra: "Libra",
    Scorpio: "Scorpio",
    Sagittarius: "Sagittarius",
    Capricorn: "Capricorn",
    Aquarius: "Aquarius",
    Pisces: "Pisces",
  },
  fr: {
    Aries: "B\u00e9lier",
    Taurus: "Taureau",
    Gemini: "G\u00e9meaux",
    Cancer: "Cancer",
    Leo: "Lion",
    Virgo: "Vierge",
    Libra: "Balance",
    Scorpio: "Scorpion",
    Sagittarius: "Sagittaire",
    Capricorn: "Capricorne",
    Aquarius: "Verseau",
    Pisces: "Poissons",
  },
  es: {
    Aries: "Aries",
    Taurus: "Tauro",
    Gemini: "G\u00e9minis",
    Cancer: "C\u00e1ncer",
    Leo: "Leo",
    Virgo: "Virgo",
    Libra: "Libra",
    Scorpio: "Escorpio",
    Sagittarius: "Sagitario",
    Capricorn: "Capricornio",
    Aquarius: "Acuario",
    Pisces: "Piscis",
  },
  de: {
    Aries: "Widder",
    Taurus: "Stier",
    Gemini: "Zwillinge",
    Cancer: "Krebs",
    Leo: "L\u00f6we",
    Virgo: "Jungfrau",
    Libra: "Waage",
    Scorpio: "Skorpion",
    Sagittarius: "Sch\u00fctze",
    Capricorn: "Steinbock",
    Aquarius: "Wassermann",
    Pisces: "Fische",
  },
  pt: {
    Aries: "\u00c1ries",
    Taurus: "Touro",
    Gemini: "G\u00eameos",
    Cancer: "C\u00e2ncer",
    Leo: "Le\u00e3o",
    Virgo: "Virgem",
    Libra: "Libra",
    Scorpio: "Escorpi\u00e3o",
    Sagittarius: "Sagit\u00e1rio",
    Capricorn: "Capric\u00f3rnio",
    Aquarius: "Aqu\u00e1rio",
    Pisces: "Peixes",
  },
  ja: {
    Aries: "\u7261\u7f8a\u5ea7",
    Taurus: "\u7261\u725b\u5ea7",
    Gemini: "\u53cc\u5b50\u5ea7",
    Cancer: "\u304b\u306b\u5ea7",
    Leo: "\u3057\u3057\u5ea7",
    Virgo: "\u304a\u3068\u3081\u5ea7",
    Libra: "\u3066\u3093\u3073\u3093\u5ea7",
    Scorpio: "\u3055\u305d\u308a\u5ea7",
    Sagittarius: "\u3044\u3066\u5ea7",
    Capricorn: "\u3084\u304e\u5ea7",
    Aquarius: "\u307f\u305a\u304c\u3081\u5ea7",
    Pisces: "\u3046\u304a\u5ea7",
  },
  zh: {
    Aries: "\u767d\u7f8a\u5ea7",
    Taurus: "\u91d1\u725b\u5ea7",
    Gemini: "\u53cc\u5b50\u5ea7",
    Cancer: "\u5de8\u87f9\u5ea7",
    Leo: "\u72ee\u5b50\u5ea7",
    Virgo: "\u5904\u5973\u5ea7",
    Libra: "\u5929\u79e4\u5ea7",
    Scorpio: "\u5929\u874e\u5ea7",
    Sagittarius: "\u5c04\u624b\u5ea7",
    Capricorn: "\u6469\u7faf\u5ea7",
    Aquarius: "\u6c34\u74f6\u5ea7",
    Pisces: "\u53cc\u9c7c\u5ea7",
  },
  ar: {
    Aries: "\u0627\u0644\u062d\u0645\u0644",
    Taurus: "\u0627\u0644\u062b\u0648\u0631",
    Gemini: "\u0627\u0644\u062c\u0648\u0632\u0627\u0621",
    Cancer: "\u0627\u0644\u0633\u0631\u0637\u0627\u0646",
    Leo: "\u0627\u0644\u0623\u0633\u062f",
    Virgo: "\u0627\u0644\u0639\u0630\u0631\u0627\u0621",
    Libra: "\u0627\u0644\u0645\u064a\u0632\u0627\u0646",
    Scorpio: "\u0627\u0644\u0639\u0642\u0631\u0628",
    Sagittarius: "\u0627\u0644\u0642\u0648\u0633",
    Capricorn: "\u0627\u0644\u062c\u062f\u064a",
    Aquarius: "\u0627\u0644\u062f\u0644\u0648",
    Pisces: "\u0627\u0644\u062d\u0648\u062a",
  },
};

const ELEMENT_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: { fire: "Fire", earth: "Earth", air: "Air", water: "Water" },
  fr: { fire: "Feu", earth: "Terre", air: "Air", water: "Eau" },
  es: { fire: "Fuego", earth: "Tierra", air: "Aire", water: "Agua" },
  de: { fire: "Feuer", earth: "Erde", air: "Luft", water: "Wasser" },
  pt: { fire: "Fogo", earth: "Terra", air: "Ar", water: "\u00c1gua" },
  ja: { fire: "\u706b", earth: "\u5730", air: "\u98a8", water: "\u6c34" },
  zh: { fire: "\u706b", earth: "\u571f", air: "\u98ce", water: "\u6c34" },
  ar: { fire: "\u0646\u0627\u0631", earth: "\u0623\u0631\u0636", air: "\u0647\u0648\u0627\u0621", water: "\u0645\u0627\u0621" },
};

const MODALITY_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: { cardinal: "Cardinal", fixed: "Fixed", mutable: "Mutable" },
  fr: { cardinal: "Cardinale", fixed: "Fixe", mutable: "Mutable" },
  es: { cardinal: "Cardinal", fixed: "Fijo", mutable: "Mutable" },
  de: { cardinal: "Kardinal", fixed: "Fix", mutable: "Ver\u00e4nderlich" },
  pt: { cardinal: "Cardinal", fixed: "Fixa", mutable: "Mut\u00e1vel" },
  ja: { cardinal: "\u6d3b\u52d5", fixed: "\u4e0d\u52d5", mutable: "\u67d4\u8edf" },
  zh: { cardinal: "\u57fa\u672c", fixed: "\u56fa\u5b9a", mutable: "\u53d8\u52a8" },
  ar: { cardinal: "\u0623\u0633\u0627\u0633\u064a", fixed: "\u062b\u0627\u0628\u062a", mutable: "\u0645\u062a\u063a\u064a\u0651\u0631" },
};

function getLocaleKey(locale: string) {
  return locale.split("-")[0] || "en";
}

export function translateSign(sign: string | null | undefined, locale: string) {
  if (!sign) {
    return sign || "";
  }

  const localeKey = getLocaleKey(locale);
  const normalizedSign =
    sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();

  return (
    SIGN_TRANSLATIONS[localeKey]?.[normalizedSign] ||
    SIGN_TRANSLATIONS.en[normalizedSign] ||
    sign
  );
}

export function translateElement(element: string | null | undefined, locale: string) {
  if (!element) {
    return element || "";
  }

  const localeKey = getLocaleKey(locale);
  return ELEMENT_TRANSLATIONS[localeKey]?.[element] || ELEMENT_TRANSLATIONS.en[element] || element;
}

export function translateModality(modality: string | null | undefined, locale: string) {
  if (!modality) {
    return modality || "";
  }

  const localeKey = getLocaleKey(locale);
  return (
    MODALITY_TRANSLATIONS[localeKey]?.[modality] ||
    MODALITY_TRANSLATIONS.en[modality] ||
    modality
  );
}
