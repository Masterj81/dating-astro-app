import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(MOBILE_ROOT, 'app', 'profile', 'edit.tsx'), 'utf8');

describe('Edit Profile web layout', () => {
  it('escapes zero-height router ancestors while preserving native keyboard behavior', () => {
    expect(source).toContain("Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined");
    expect(source).toMatch(/Platform\.OS === 'web'[\s\S]*position: 'fixed'/);
    expect(source).toContain("minHeight: '100vh'");
    expect(source).toContain("width: '100vw'");
  });
});
