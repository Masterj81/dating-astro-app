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
// The escape check catches the same characters when written as `\u{...}`.
// Functional text glyphs (check/close marks) and accessible labels remain valid.
const LITERAL_DECORATIVE_EMOJI = /\p{Emoji_Presentation}/u;
const ESCAPED_DECORATIVE_EMOJI = /\\u\{(?:1F[0-9A-F]{3}|(?:2600|2601|2614|2615|26A1|26C4|26C5|26F2|26F3|26F5|26FA|26FD|2705|270A|270B|2728|274C|274E|2753|2754|2755|2757|2795|2796|2797|27B0|27BF))\}/iu;
const ESCAPED_SURROGATE_EMOJI = /\\uD83[CD]\\uD[89AB][0-9A-F]{2}/iu;

describe('Profile surfaces', () => {
  it('use the icon system instead of decorative emoji', () => {
    const offenders = PROFILE_FILES.flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return LITERAL_DECORATIVE_EMOJI.test(source) ||
        ESCAPED_DECORATIVE_EMOJI.test(source) ||
        ESCAPED_SURROGATE_EMOJI.test(source)
        ? [path.relative(MOBILE_ROOT, file)]
        : [];
    });

    expect(offenders).toEqual([]);
  });
});
