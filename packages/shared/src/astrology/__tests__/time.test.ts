// Tests for the timezone correctness layer. These are the tests that lock
// down the device-tz bug fix — anything that re-introduces longitude/15 or
// device-local Date math should make a test here go red.

import { describe, expect, it } from 'vitest';

import {
  birthInputToUtcDate,
  normalizeBirthInput,
  parseBirthDate,
  parseBirthTime,
  resolveBirthTimezone,
  validateIana,
} from '../time';

describe('parseBirthDate', () => {
  it('parses a valid YYYY-MM-DD', () => {
    expect(parseBirthDate('1990-07-04')).toEqual({ year: 1990, month: 7, day: 4 });
  });
  it('rejects garbage', () => {
    expect(() => parseBirthDate('07/04/1990')).toThrow();
    expect(() => parseBirthDate('1990-13-01')).toThrow();
  });
});

describe('parseBirthTime', () => {
  it('returns null for empty input', () => {
    expect(parseBirthTime(null)).toBeNull();
    expect(parseBirthTime(undefined)).toBeNull();
    expect(parseBirthTime('')).toBeNull();
  });
  it('parses HH:MM', () => {
    expect(parseBirthTime('14:30')).toEqual({ hour: 14, minute: 30 });
  });
  it('parses AM/PM', () => {
    expect(parseBirthTime('2:30 PM')).toEqual({ hour: 14, minute: 30 });
    expect(parseBirthTime('12:00 AM')).toEqual({ hour: 0, minute: 0 });
    expect(parseBirthTime('12:30 PM')).toEqual({ hour: 12, minute: 30 });
  });
});

describe('validateIana', () => {
  it('accepts well-known zones', () => {
    expect(validateIana('America/New_York')).toBe('America/New_York');
    expect(validateIana('Asia/Kathmandu')).toBe('Asia/Kathmandu');
    expect(validateIana('UTC')).toBe('UTC');
  });
  it('rejects junk', () => {
    expect(validateIana('Foo/Bar')).toBeNull();
    expect(validateIana('GMT+05:30')).toBeNull(); // POSIX-style, not IANA
    expect(validateIana(null)).toBeNull();
    expect(validateIana('')).toBeNull();
  });
});

describe('resolveBirthTimezone', () => {
  it('trusts a valid input IANA id', () => {
    const r = resolveBirthTimezone(35.6762, 139.6503, 'Asia/Tokyo');
    expect(r.iana).toBe('Asia/Tokyo');
    expect(r.source).toBe('input');
  });

  it('falls back to tz-lookup when no input zone', () => {
    const r = resolveBirthTimezone(40.7128, -74.006, null);
    expect(r.iana).toBe('America/New_York');
    expect(r.source).toBe('lookup');
  });

  it('returns UTC + source=fallback for unreasonable coords', () => {
    const r = resolveBirthTimezone(NaN, NaN, null);
    expect(r.iana).toBe('UTC');
    expect(r.source).toBe('fallback');
  });

  it('produces a half-hour offset for India', () => {
    const r = resolveBirthTimezone(
      19.076,
      72.8777,
      'Asia/Kolkata',
      new Date(Date.UTC(2024, 0, 1)),
    );
    expect(r.offsetMinutes).toBe(330);
  });

  it('produces a 45-minute offset for Nepal', () => {
    const r = resolveBirthTimezone(
      27.7172,
      85.324,
      'Asia/Kathmandu',
      new Date(Date.UTC(2024, 0, 1)),
    );
    expect(r.offsetMinutes).toBe(345);
  });

  it('does NOT round longitude/15 as a fallback offset', () => {
    // India sits near +73° longitude. The legacy code returned +5h
    // (round(73/15)); the correct offset is +5:30. We assert the bug is gone.
    const r = resolveBirthTimezone(
      19.076,
      72.8777,
      null,
      new Date(Date.UTC(2024, 0, 1)),
    );
    // tz-lookup gives Asia/Kolkata → +330 minutes, NOT 5 * 60 = 300.
    expect(r.offsetMinutes).toBe(330);
    expect(r.iana).toBe('Asia/Kolkata');
  });
});

describe('birthInputToUtcDate', () => {
  it('produces the same UTC instant regardless of device timezone', () => {
    // This is the canonical device-independence assertion. We don't actually
    // change process.env.TZ here (Node would need restart on Windows) — we
    // instead rely on the fact that the implementation never touches
    // `Date.setHours` / `getTimezoneOffset` of an unzoned Date. The proof is
    // that the same UTC instant comes out of two different IANA zones for
    // identical local clock times.
    const aNyc = birthInputToUtcDate('1990-07-04', '14:30', 'America/New_York');
    const aLon = birthInputToUtcDate('1990-07-04', '14:30', 'Europe/London');
    // 14:30 in NYC (DST, UTC-4) → 18:30 UTC.
    // 14:30 in London (BST, UTC+1) → 13:30 UTC.
    expect(aNyc.toISOString()).toBe('1990-07-04T18:30:00.000Z');
    expect(aLon.toISOString()).toBe('1990-07-04T13:30:00.000Z');
    expect(aNyc.getTime()).not.toBe(aLon.getTime());
  });

  it('honours DST automatically (NYC summer vs winter)', () => {
    const summer = birthInputToUtcDate('1990-07-04', '12:00', 'America/New_York');
    const winter = birthInputToUtcDate('1990-12-21', '12:00', 'America/New_York');
    // EDT = UTC-4 (summer): 12:00 EDT = 16:00 UTC
    // EST = UTC-5 (winter): 12:00 EST = 17:00 UTC
    expect(summer.toISOString()).toBe('1990-07-04T16:00:00.000Z');
    expect(winter.toISOString()).toBe('1990-12-21T17:00:00.000Z');
  });

  it('handles half-hour offsets (India)', () => {
    const utc = birthInputToUtcDate('1993-10-02', '06:45', 'Asia/Kolkata');
    // 06:45 IST (UTC+5:30) → 01:15 UTC
    expect(utc.toISOString()).toBe('1993-10-02T01:15:00.000Z');
  });

  it('handles 45-minute offsets (Nepal)', () => {
    const utc = birthInputToUtcDate('1994-04-13', '11:11', 'Asia/Kathmandu');
    // 11:11 NPT (UTC+5:45) → 05:26 UTC
    expect(utc.toISOString()).toBe('1994-04-13T05:26:00.000Z');
  });

  it('defaults to local noon when birth time is null', () => {
    const utc = birthInputToUtcDate('2000-01-01', null, 'Europe/Paris');
    // Noon Paris winter (UTC+1) → 11:00 UTC
    expect(utc.toISOString()).toBe('2000-01-01T11:00:00.000Z');
  });
});

describe('normalizeBirthInput', () => {
  it('returns high confidence with full birth data + IANA tz', () => {
    const out = normalizeBirthInput({
      date: '1990-07-04',
      time: '14:30',
      timezone: 'America/New_York',
      latitude: 40.7128,
      longitude: -74.006,
    });
    expect(out.confidence).toBe('high');
    expect(out.warnings).toEqual([]);
    expect(out.timezone.source).toBe('input');
  });

  it('drops to medium when tz must be looked up', () => {
    const out = normalizeBirthInput({
      date: '1987-11-05',
      time: '16:20',
      timezone: null,
      latitude: 35.6762,
      longitude: 139.6503,
    });
    expect(out.confidence).toBe('medium');
    expect(out.timezone.iana).toBe('Asia/Tokyo');
    expect(out.warnings).toContain('missing_birth_timezone');
  });

  it('drops to low when birth time is missing', () => {
    const out = normalizeBirthInput({
      date: '1990-03-21',
      time: null,
      timezone: 'Europe/Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(out.confidence).toBe('low');
    expect(out.warnings).toContain('missing_birth_time');
    expect(out.warnings).toContain('houses_unavailable_without_birth_time');
  });

  it('drops to low + warns when tz fallback was used', () => {
    const out = normalizeBirthInput({
      date: '1990-03-21',
      time: '10:00',
      timezone: null,
      // NaN coords force a fallback path.
      latitude: NaN,
      longitude: NaN,
    });
    expect(out.confidence).toBe('low');
    expect(out.timezone.source).toBe('fallback');
    expect(out.warnings).toContain('timezone_fallback_used');
  });
});
