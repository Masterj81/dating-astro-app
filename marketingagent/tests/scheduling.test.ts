import { describe, expect, it, vi, afterEach } from "vitest";
import {
  getNextPostingWindow,
  getNextPostingWindowISO,
  parseDateTime,
} from "../scheduling.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("getNextPostingWindow", () => {
  it("picks the next slot strictly in the future", () => {
    // 10:30 → next slot 11:00
    vi.setSystemTime(new Date("2026-04-24T10:30:00"));
    const slot = getNextPostingWindow();
    expect(slot.getHours()).toBe(11);
    expect(slot.getMinutes()).toBe(0);
  });

  it("never returns 'now' when called at exactly a slot boundary", () => {
    // The off-by-one bug fixed in the previous P0 pass: at 11:00:00.000 we
    // previously returned 11:00 itself, which the scheduler then published
    // in the same tick. Must return 12:00 instead.
    vi.setSystemTime(new Date("2026-04-24T11:00:00"));
    const slot = getNextPostingWindow();
    expect(slot.getHours()).toBe(12);
  });

  it("rolls over to tomorrow 11:00 after 20:00", () => {
    vi.setSystemTime(new Date("2026-04-24T22:30:00"));
    const slot = getNextPostingWindow();
    expect(slot.getHours()).toBe(11);
    // Should be on the next calendar day.
    expect(slot.getDate()).toBe(25);
  });

  it("getNextPostingWindowISO returns the same instant in ISO form", () => {
    vi.setSystemTime(new Date("2026-04-24T10:30:00"));
    const iso = getNextPostingWindowISO();
    const date = getNextPostingWindow();
    expect(iso).toBe(date.toISOString());
  });

  it("respects the `from` parameter (pure function)", () => {
    const from = new Date("2026-04-24T18:00:00");
    const slot = getNextPostingWindow(from);
    // 18:00 → next is 19:00
    expect(slot.getHours()).toBe(19);
  });
});

describe("parseDateTime", () => {
  it('"next" returns a future Date', () => {
    const out = parseDateTime("next");
    expect(out.getTime()).toBeGreaterThan(Date.now());
  });

  it('"tomorrow 19:30" returns tomorrow at 19:30', () => {
    vi.setSystemTime(new Date("2026-04-24T10:00:00"));
    const out = parseDateTime("tomorrow 19:30");
    expect(out.getDate()).toBe(25);
    expect(out.getHours()).toBe(19);
    expect(out.getMinutes()).toBe(30);
  });

  it('"tomorrow" without a time defaults to 11:00', () => {
    vi.setSystemTime(new Date("2026-04-24T10:00:00"));
    const out = parseDateTime("tomorrow");
    expect(out.getDate()).toBe(25);
    expect(out.getHours()).toBe(11);
    expect(out.getMinutes()).toBe(0);
  });

  it("throws on invalid input", () => {
    expect(() => parseDateTime("not-a-date")).toThrow(/Invalid date/);
  });

  it("rejects dates more than 60s in the past", () => {
    expect(() => parseDateTime("2020-01-01T00:00:00Z")).toThrow(/Refusing to schedule in the past/);
  });

  it("accepts a near-future ISO string", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const out = parseDateTime(future);
    expect(out.toISOString()).toBe(future);
  });
});
