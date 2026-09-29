import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROFILE_FILES = [
  path.join(MOBILE_ROOT, 'app', '(tabs)', 'profile.tsx'),
  path.join(MOBILE_ROOT, 'app', 'onboarding', 'birth-info.tsx'),
  ...['edit.tsx', 'verify.tsx', '[id].tsx'].map((name) =>
    path.join(MOBILE_ROOT, 'app', 'profile', name)
  ),
  ...fs
    .readdirSync(path.join(MOBILE_ROOT, 'components', 'profile'))
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => path.join(MOBILE_ROOT, 'components', 'profile', name)),
];

// Emoji_Presentation catches literal pictographs such as camera/video/chat.
// The escape checks catch the same characters when written as `\u{...}` or as
// an astral UTF-16 surrogate PAIR escape (the exact form these screens used
// before the icon migration). Functional text glyphs (check/close marks, the
// zodiac wheel) and accessible labels remain valid.
const LITERAL_DECORATIVE_EMOJI = /\p{Emoji_Presentation}/u;
const ESCAPED_DECORATIVE_EMOJI = /\\u\{(?:1F[0-9A-F]{3}|(?:2600|2601|2614|2615|26A1|26C4|26C5|26F2|26F3|26F5|26FA|26FD|2705|270A|270B|2728|274C|274E|2753|2754|2755|2757|2795|2796|2797|27B0|27BF))\}/iu;
// The LOW surrogate of an astral escape is always DC00..DFFF — `[89AB]`
// there would only match HIGH surrogates (D800..DBFF) and never fire: every
// decorative pair these screens carried (\uD83C\uDF82 cake, \uD83D\uDD12
// lock, \uD83C\uDF0D globe, \uD83C\uDF19 moon, \uD83D\uDCAC speech bubble)
// ends in \uD[CDEF]. `[89AB]` was dead code catching nothing; `[CDEF]` is
// the corrected, proven class (see the parametrized fixtures below).
const ESCAPED_SURROGATE_EMOJI = /\\uD83[CD]\\uD[CDEF][0-9A-F]{2}/iu;

/** Pure: does this SOURCE TEXT still carry a decorative emoji, in any of the
 *  three detectable writings (literal, `\u{...}`, escaped surrogate pair)?
 *  Shared by the real-file scan and the fixture proofs so the detection can
 *  never drift from what the guard enforces. */
function sourceHasDecorativeEmoji(source: string): boolean {
  return (
    LITERAL_DECORATIVE_EMOJI.test(source) ||
    ESCAPED_DECORATIVE_EMOJI.test(source) ||
    ESCAPED_SURROGATE_EMOJI.test(source)
  );
}

describe('Profile surfaces', () => {
  it('use the icon system instead of decorative emoji', () => {
    const offenders = PROFILE_FILES.flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return sourceHasDecorativeEmoji(source) ? [path.relative(MOBILE_ROOT, file)] : [];
    });

    expect(offenders).toEqual([]);
  });

  // The DETECTION itself, proven on fixtures. String.raw keeps the backslash
  // sequences literal, so each fixture is the exact SOURCE form (backslash +
  // uD83C + ...), not the decoded character.
  describe('decorative-emoji detection', () => {
    it.each([
      ['cake — birth-info birthday section', String.raw`{'\uD83C\uDF82'}`],
      ['lock — birth-info privacy note', String.raw`{'\uD83D\uDD12'}`],
      ['globe — birth-info birth place', String.raw`{'\uD83C\uDF0D'}`],
      ['moon — Profile big three / birth-info time', String.raw`{'\uD83C\uDF19'}`],
      ['speech bubble — Conversation Guide entry', String.raw`{'\uD83D\uDCAC'}`],
    ])('detects the escaped surrogate pair for %s', (_label, fixture) => {
      expect(sourceHasDecorativeEmoji(fixture)).toBe(true);
    });

    it('still detects literal pictographs and \\u{1F...} / BMP escapes', () => {
      expect(sourceHasDecorativeEmoji('📸')).toBe(true);
      expect(sourceHasDecorativeEmoji(String.raw`{'\u{1F4F7}'}`)).toBe(true);
      expect(sourceHasDecorativeEmoji(String.raw`{'\u{2728}'}`)).toBe(true);
    });

    it('keeps the zodiac wheel (incl. its \\u2648 escape) and functional marks valid', () => {
      // The 12 zodiac signs are information-bearing glyphs (♈..♓) and stay
      // valid in the form the screens actually ship them: ESCAPED. Note the
      // deliberate asymmetry: U+2648..U+2653 carry a default EMOJI
      // presentation, so a literal wheel would trip the literal arm on
      // purpose — that is why birth-info writes \u2648.. instead (and why
      // the BMP escape set deliberately does not list 2648..2653).
      expect(
        sourceHasDecorativeEmoji(
          String.raw`{'\u2648 \u2649 \u264A \u264B \u264C \u264D \u264E \u264F \u2650 \u2651 \u2652 \u2653'}`,
        ),
      ).toBe(false);
      expect(sourceHasDecorativeEmoji('✓ ✕')).toBe(false);
    });
  });
});
