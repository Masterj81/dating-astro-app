/**
 * Birth city suggestions — the shapes.
 *
 * The whole point of this module is that a suggestion is only ever a
 * SUGGESTION until someone picks it, and that a picked suggestion carries real
 * coordinates rather than a name the app will try to resolve later. This repo
 * has spent a year undoing the opposite: a Montréal fallback that wrote its
 * exact coordinates onto 69 profiles whose owners had typed Sofia, Varna,
 * Vienna, Verona, Lima or Tampa; a Greenwich fallback in two edge functions; a
 * `{0,0}` that read as a real place off the coast of Ghana.
 *
 * So `BirthCitySuggestion` has no optional latitude. A value of this type
 * always knows where it is. Anything that does not is not a suggestion — it is
 * a query the user still has to resolve.
 */

/** ISO 3166-1 alpha-2, uppercase. */
export type CountryCode = string;

export type BirthCitySuggestion = {
  /** Stable id, `slug|countryCode|admin1slug` — unique across the catalog. */
  id: string;
  /** City name in its common local/English form, e.g. "Montréal". */
  name: string;
  /** First-level division: state, province, région. Empty when a country has none worth showing. */
  admin1: string;
  /** Country name as displayed, e.g. "Canada". */
  country: string;
  countryCode: CountryCode;
  /** Decimal degrees, north positive. Always finite. */
  latitude: number;
  /** Decimal degrees, east positive. Always finite. */
  longitude: number;
  /**
   * IANA zone when the catalog knows it. Absent means "not known here" — never
   * a guess, and never the device zone. `calculate-chart` resolves the zone
   * from the coordinates and records its own confidence.
   */
  timezone?: string;
  /**
   * Where this row came from. `catalog` is the bundled list; `remote` is a
   * lookup through our own edge function, which holds the provider key.
   *
   * Deliberately not the provider's name: the discriminant ends up in state
   * and in validation, and renaming it the day we swap Geoapify for LocationIQ
   * would be churn for nothing.
   *
   * It is kept as a field rather than dropped because a stored suggestion from
   * the catalog era must FAIL validation — those rows carried coordinates from
   * a table this app no longer ships.
   */
  source: 'remote';
};
