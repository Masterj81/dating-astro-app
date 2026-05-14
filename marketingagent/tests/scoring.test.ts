import { describe, expect, it } from "vitest";
import { scorePost, scoreViralPost } from "../scoring.js";

describe("scorePost (short posts, ≤280 chars)", () => {
  it("passes a clean human-sounding post", () => {
    const text = "Scorpios will meet you on Tuesday and by Friday they've already decided if you're marriage material. Zero patience for small talk. ♏";
    const result = scorePost(text);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0);
    expect(result.flagged).toEqual([]);
  });

  it("flags a banned AI-speak word and fails", () => {
    const text = "Let's delve into the rich tapestry of zodiac compatibility ✨";
    const result = scorePost(text);
    expect(result.pass).toBe(false);
    expect(result.flagged).toContain("delve");
    expect(result.flagged).toContain("tapestry");
    expect(result.score).toBeGreaterThanOrEqual(40); // 2 banned words × 20 pts
  });

  it("penalises the 'starts with I' AI tic", () => {
    const text = "I think Mercury retrograde is finally over and that's a vibe. Time to text your ex maybe. Or not. Honestly your call.";
    const result = scorePost(text);
    expect(result.details.startsWithI).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  it("penalises posts longer than 300 chars", () => {
    const text = "Astrology and dating ".repeat(20); // ~420 chars, repetitive
    const result = scorePost(text);
    expect(result.details.tooLong).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(10);
  });

  it("caps score at 100", () => {
    const text = "delve tapestry unleash realm landscape paradigm synergy leverage elevate foster";
    const result = scorePost(text);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns a deterministic shape", () => {
    const result = scorePost("hi there 👋");
    expect(result).toHaveProperty("pass");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("flagged");
    expect(result).toHaveProperty("details");
    expect(result.details).toHaveProperty("bannedWords");
    expect(result.details).toHaveProperty("sentenceVariety");
    expect(result.details).toHaveProperty("startsWithI");
    expect(result.details).toHaveProperty("tooLong");
  });
});

describe("scoreViralPost (long-form FB posts)", () => {
  it("passes a well-structured viral post", () => {
    const text = [
      "Stop dating people with the same Mars sign",
      "",
      "🔥 fire + fire = burnout in 3 weeks",
      "💧 water + water = mutual emotional flooding",
      "🌍 earth + earth = comfortable but bored",
      "💨 air + air = endless talking, zero action",
      "",
      "Your Mars shows how you fight, chase, and sweat.",
      "",
      "When you both need the same kind of friction, nobody plays the counterweight.",
      "",
      "Check your synastry before swiping. The grid never lies.",
    ].join("\n");
    const result = scoreViralPost(text);
    expect(result.pass).toBe(true);
    expect(result.flagged).toEqual([]);
  });

  it("penalises hashtags with +20 vs an otherwise-identical post", () => {
    const withoutTags = [
      "Stop dating Air signs blindly",
      "",
      "💨 Gemini chats but vanishes",
      "💨 Libra weighs forever",
      "💨 Aquarius detaches without warning",
      "",
      "Your charts know better than your hopes. Read them before you fall.",
    ].join("\n");
    const withTags = withoutTags.replace(/Gemini/, "#Gemini").replace(/Libra/, "#Libra");
    const a = scoreViralPost(withoutTags);
    const b = scoreViralPost(withTags);
    expect(b.score - a.score).toBe(20); // single regex match, not per-hashtag
  });

  it("rejects banned hedging words", () => {
    const text = [
      "Stop dating without checking your synastry",
      "",
      "🔥 You can probably get away with it",
      "💧 You may actually really like them",
      "🌍 You could just be wrong",
      "",
      "Your charts know more than you. Read them before falling for the wrong placement.",
    ].join("\n");
    const result = scoreViralPost(text);
    expect(result.pass).toBe(false);
    expect(result.flagged.length).toBeGreaterThan(0);
  });

  it("penalises a missing hook (first line too long)", () => {
    const text = [
      "This is a very very very very very very very very very very very long opening line that nobody scrolling Facebook will ever read because it is too long",
      "",
      "🔥 one bullet",
      "🌍 two bullets",
      "💧 three bullets",
      "",
      "Your synastry tells the truth.",
    ].join("\n");
    const result = scoreViralPost(text);
    expect(result.score).toBeGreaterThanOrEqual(15);
  });
});
