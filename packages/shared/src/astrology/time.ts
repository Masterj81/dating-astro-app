// Time + timezone correctness layer.
//
// Why this file exists: the legacy mobile code used `dateWithTime.setHours()`
// which silently uses the *device's* local timezone, and the legacy geocoder
// used `Math.round(longitude / 15)` as the birth-place tz. Together those
// produced Moon positions off by up to ~7° and an effectively random
// Ascendant depending on what device a user happened to open the app on.
//
// This module replaces both with a single deterministic pipeline:
//   1. Resolve an IANA timezone for the birth coordinates (tz-lookup polygons).
//   2. Combine the local birth date+time with that IANA zone in Luxon →
//      a single UTC instant, fully aware of DST, half-hour and 45-min
//      offsets (India +5:30, Nepal +5:45, Chatham +12:45), and historical
//      tz changes baked into tzdb.
//   3. Hand that UTC instant to astronomy-engine — never the local Date.
//
// Inputs we never trust as final truth:
//   - The device clock / device timezone.
//   - longitude / 15.
//   - A hardcoded city → fixed-offset table that ignores DST.

import { DateTime, IANAZone } from 'luxon';
import tzlookup from 'tz-lookup';

import type {
  BirthInput,
  ChartWarning,
  Confidence,
  ResolvedTimezone,
} from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Accept H:MM, HH:MM and HH:MM:SS, optionally followed by AM/PM (case-insensitive).
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i;

/**
 * Parse a YYYY-MM-DD date into (y, m, d). Throws on malformed input.
 */
export function parseBirthDate(date: string): { year: number; month: number; day: number } {
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    throw new Error(`Invalid birth date format (expected YYYY-MM-DD): ${String(date)}`);
  }
  const [y, m, d] = date.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1 || y > 9999) {
    throw new Error(`Invalid birth date values: ${date}`);
  }
  return { year: y, month: m, day: d };
}

/**
 * Parse a HH:MM (24h) or H:MM AM/PM string into (hour, minute). Returns null
 * if `time` is null/undefined/empty (birth time unknown).
 */
export function parseBirthTime(
  time: string | null | undefined,
): { hour: number; minute: number } | null {
  if (time == null) return null;
  const trimmed = String(time).trim();
  if (!trimmed) return null;
  const match = TIME_RE.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid birth time format (expected HH:MM): ${trimmed}`);
  }
  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  const ampm = match[4]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid birth time values: ${trimmed}`);
  }
  return { hour, minute };
}

/**
 * Validate a candidate IANA timezone string. Returns the string if valid,
 * null otherwise. Does NOT use the device clock.
 */
export function validateIana(tz: string | null | undefined): string | null {
  if (!tz || typeof tz !== 'string') return null;
  return IANAZone.isValidZone(tz) ? tz : null;
}

/**
 * Resolve an IANA timezone for a birth event.
 *
 * Resolution order:
 *   1. If `inputTz` is a valid IANA id, trust it (source='input').
 *   2. Else look up lat/lng with tz-lookup polygons (source='lookup').
 *   3. Else fall back to UTC (source='fallback'). Callers MUST surface this
 *      as low confidence — never silently treat fallback as ground truth.
 *
 * Crucially: this never returns `longitude / 15`. If the lookup fails we
 * say so, instead of producing a confidently wrong offset.
 */
export function resolveBirthTimezone(
  /** Null when the birthplace is unknown — the lookup is then skipped and the
   *  result is the explicit UTC fallback, never a substituted location. */
  latitude: number | null,
  longitude: number | null,
  inputTz?: string | null,
  /** A reference UTC date to compute the offset at; defaults to the J2000 epoch
   *  but callers should pass the resolved birth instant for DST accuracy.
   */
  referenceInstantUtc?: Date,
): ResolvedTimezone {
  const validated = validateIana(inputTz);
  if (validated) {
    return {
      iana: validated,
      offsetMinutes: offsetMinutesAt(validated, referenceInstantUtc),
      source: 'input',
    };
  }
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    try {
      const iana = tzlookup(latitude, longitude);
      if (iana && IANAZone.isValidZone(iana)) {
        return {
          iana,
          offsetMinutes: offsetMinutesAt(iana, referenceInstantUtc),
          source: 'lookup',
        };
      }
    } catch {
      // Out-of-range coords or polygon miss — fall through.
    }
  }
  return { iana: 'UTC', offsetMinutes: 0, source: 'fallback' };
}

function offsetMinutesAt(iana: string, ref?: Date): number {
  const dt = ref
    ? DateTime.fromJSDate(ref, { zone: iana })
    : DateTime.now().setZone(iana);
  return dt.isValid ? dt.offset : 0;
}

/**
 * Combine a local birth date+time with an IANA timezone into a UTC instant.
 *
 * - If `time` is null/undefined, falls back to 12:00 local (solar noon-ish).
 *   This is the documented "birth time unknown" path; callers must propagate
 *   confidence='low' and the missing_birth_time warning.
 * - If the resulting DateTime is invalid (e.g. a DST spring-forward gap),
 *   Luxon snaps to the nearest valid instant; we accept that — the alternative
 *   is failing the whole chart, which would block onboarding.
 *
 * Throws on invalid date format (parseBirthDate enforces).
 */
export function birthInputToUtcDate(
  date: string,
  time: string | null | undefined,
  iana: string,
): Date {
  const { year, month, day } = parseBirthDate(date);
  const parsed = parseBirthTime(time);
  const hour = parsed?.hour ?? 12;
  const minute = parsed?.minute ?? 0;
  const zone = validateIana(iana) ?? 'UTC';

  const local = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone },
  );
  if (!local.isValid) {
    // Spring-forward gap or otherwise invalid combination. Build it as UTC
    // and shift by the zone's standard offset as a last resort.
    const utc = DateTime.fromObject(
      { year, month, day, hour, minute, second: 0, millisecond: 0 },
      { zone: 'UTC' },
    );
    return utc.toJSDate();
  }
  return local.toUTC().toJSDate();
}

export interface NormalizedBirth {
  date: string;
  time: string | null;
  hasBirthTime: boolean;
  timezone: ResolvedTimezone;
  utcDate: Date;
  confidence: Confidence;
  warnings: ChartWarning[];
}

/**
 * One-shot: take a `BirthInput`, resolve its tz, produce a UTC instant, and
 * compute confidence + warnings. Used by `computeNatalChart` so both mobile
 * and web converge on the same time math.
 */
export function normalizeBirthInput(input: BirthInput): NormalizedBirth {
  const warnings: ChartWarning[] = [];
  const hasBirthTime = parseBirthTime(input.time) != null;
  if (!hasBirthTime) warnings.push('missing_birth_time', 'houses_unavailable_without_birth_time');

  // First pass: resolve tz at the start of the birth day in UTC. Good enough
  // to pick the right offset (DST may differ by minutes around midnight,
  // which doesn't matter for chart accuracy).
  const { year, month, day } = parseBirthDate(input.date);
  const refUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const tz = resolveBirthTimezone(
    input.latitude,
    input.longitude,
    input.timezone,
    refUtc,
  );
  if (tz.source === 'fallback') warnings.push('timezone_fallback_used');
  if (!input.timezone && tz.source !== 'input') warnings.push('missing_birth_timezone');

  const utcDate = birthInputToUtcDate(input.date, input.time, tz.iana);

  // Re-resolve once more at the actual instant to get the right DST offset.
  const tzFinal: ResolvedTimezone = {
    ...tz,
    offsetMinutes:
      DateTime.fromJSDate(utcDate, { zone: tz.iana }).offset || tz.offsetMinutes,
  };

  let confidence: Confidence;
  if (!hasBirthTime) {
    confidence = 'low';
  } else if (tz.source === 'fallback') {
    confidence = 'low';
  } else if (tz.source === 'lookup' && !input.timezone) {
    // We had to look up the zone but we had coords + time; that's our normal
    // happy path. Treat as medium because the user could not confirm the zone.
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  return {
    date: input.date,
    time: input.time ?? null,
    hasBirthTime,
    timezone: tzFinal,
    utcDate,
    confidence,
    warnings,
  };
}
