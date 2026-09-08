// JUNO-21 — unsubscribe tokens, two generations, one key each.
//
// WHAT THIS SUITE IS FOR
// ----------------------
// The finding was not "the HMAC is weak" — it isn't. It was that the signing
// key was DERIVED from SUPABASE_SERVICE_ROLE_KEY, so rotating the most
// privileged credential in the system would silently invalidate every
// unsubscribe link already sitting in somebody's inbox. Gmail and Yahoo read
// that as a sender failure (RFC 8058); a Québec sender under CASL reads it as
// a compliance failure.
//
// So the property under test is not confidentiality. It is that a link minted
// by the OLD code still works after the fix, and that a link minted by the new
// code cannot be forged with the old key. Everything else follows from those
// two.
//
// The legacy signer below is a verbatim reimplementation of the code as it
// stood before this change (send-email/index.ts, `hmac` + `buildUnsubscribeUrl`
// at 7 Sep 2026). It exists because that code is now deleted: without a copy of
// it, "legacy tokens still verify" is untestable, and the only way to find out
// would be in production, from the inbox of somebody trying to unsubscribe.
//
// The module under test is loaded from the REAL edge source, whole. That is the
// same discipline as edge-cors.test.ts, and it is what makes a rename here a
// failing test rather than a suite that passes against a stale copy.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanupEdgeModules, loadWholeModule, readRepoFile } from '../../testing/edge-source';

const MODULE_PATH = 'supabase/functions/_shared/unsubscribe-token.ts';
const SEND_EMAIL_PATH = 'supabase/functions/send-email/index.ts';
const UNSUBSCRIBE_PATH = 'supabase/functions/unsubscribe/index.ts';

// Fake secrets. Distinctive on purpose: several assertions below search output
// for these exact strings, and a generic "secret" would collide with prose.
const CURRENT_KEY = 'test-current-key-8Wq3zR-do-not-use-in-production';
const PREVIOUS_KEY = 'test-previous-key-4Kf9tB-do-not-use-in-production';
const WRONG_KEY = 'test-wrong-key-1Nc0pX-do-not-use-in-production';

const USER_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OTHER_USER_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

type TokenModule = {
  UNSUBSCRIBE_CATEGORY: string;
  TOKEN_VERSION: string;
  CURRENT_SECRET_ENV: string;
  PREVIOUS_SECRET_ENV: string;
  RETIRED_SECRET_ENV: string;
  MAX_TOKEN_LENGTH: number;
  constantTimeEqual: (a: string, b: string) => boolean;
  readUnsubscribeKeyring: (env: Record<string, string | undefined>) => {
    current: string;
    previous: string;
  };
  describeKeyring: (env: Record<string, string | undefined>) => string;
  signUnsubscribeToken: (
    userId: string,
    category: string,
    keyring: { current: string; previous: string },
  ) => Promise<string | null>;
  verifyUnsubscribeToken: (
    token: string,
    keyring: { current: string; previous: string },
  ) => Promise<{ userId: string; category: string; generation: string } | null>;
};

let mod: TokenModule;

/** Both keys present — the state during the transition window. */
const FULL = { current: CURRENT_KEY, previous: PREVIOUS_KEY };
/** The end state, once legacy links are retired. */
const CURRENT_ONLY = { current: CURRENT_KEY, previous: '' };
/** A half-provisioned deploy: verification of new links is impossible. */
const PREVIOUS_ONLY = { current: '', previous: PREVIOUS_KEY };
const NEITHER = { current: '', previous: '' };

// ---------------------------------------------------------------------------
// The pre-fix signer, kept verbatim so backward compatibility is provable.
// ---------------------------------------------------------------------------

function b64UrlEncodeLegacy(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacLegacy(value: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Exactly the token the deployed function minted before 8 Sep 2026. */
async function mintLegacyToken(
  userId: string,
  category: string,
  secret: string,
): Promise<string> {
  const payload = `${userId}:${category}`;
  const sig = await hmacLegacy(payload, secret);
  return `${b64UrlEncodeLegacy(payload)}.${sig}`;
}

/**
 * What the old code produced when UNSUBSCRIBE_TOKEN_SECRET was unset: a key
 * derived from the service-role JWT. This is the shape the operator has to
 * reconstruct into UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS, and the runbook says so.
 */
function legacyDerivedSecret(serviceRoleKey: string): string {
  return `juno-unsubscribe-v1:${serviceRoleKey}`;
}

/** Source with comments blanked, so prose cannot satisfy a code assertion. */
function codeOf(relativePath: string): string {
  return readRepoFile(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

beforeAll(async () => {
  mod = await loadWholeModule<TokenModule>(MODULE_PATH, 'unsubscribe-token');
});

afterAll(() => {
  cleanupEdgeModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1–2. Both generations verify.
// ---------------------------------------------------------------------------

describe('the two generations', () => {
  it('1. accepts a current-generation (v2) token it minted itself', async () => {
    const token = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    expect(token).toBeTruthy();
    expect(token!.startsWith('v2.')).toBe(true);
    expect(token!.split('.')).toHaveLength(3);

    const parsed = await mod.verifyUnsubscribeToken(token!, FULL);
    expect(parsed).toEqual({
      userId: USER_ID,
      category: 'lifecycle',
      generation: 'v2',
    });
  });

  it('2. accepts a legacy token minted by the pre-fix code — the whole point', async () => {
    const token = await mintLegacyToken(USER_ID, 'lifecycle', PREVIOUS_KEY);
    expect(token.split('.')).toHaveLength(2);

    const parsed = await mod.verifyUnsubscribeToken(token, FULL);
    expect(parsed).toEqual({
      userId: USER_ID,
      category: 'lifecycle',
      generation: 'legacy',
    });
  });

  it('2b. accepts a legacy token signed with the SERVICE-ROLE-DERIVED secret, when that value is configured as the previous key', async () => {
    // The realistic case: UNSUBSCRIBE_TOKEN_SECRET was never set in production,
    // so every link in every inbox was signed with this derivation. The
    // operator copies the derived value into UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS
    // and the links keep working. If this test fails, the runbook is wrong.
    // Deliberately NOT shaped like a JWT. The shape is irrelevant here — the
    // old code concatenated the key as an opaque string into the HMAC secret —
    // and a JWT-shaped fixture trips the credential scanner in
    // scripts/validate-repo-hygiene.mjs on every run, forever. A scanner that
    // cries wolf on its own test data is one somebody eventually switches off.
    const pretendServiceRole = 'stand-in-for-the-old-service-role-key';
    const derived = legacyDerivedSecret(pretendServiceRole);
    const token = await mintLegacyToken(USER_ID, 'lifecycle', derived);

    const keyring = { current: CURRENT_KEY, previous: derived };
    const parsed = await mod.verifyUnsubscribeToken(token, keyring);
    expect(parsed?.userId).toBe(USER_ID);
    expect(parsed?.generation).toBe('legacy');
  });
});

// ---------------------------------------------------------------------------
// 3–4. Wrong key, either generation.
// ---------------------------------------------------------------------------

describe('a signature made with the wrong key', () => {
  it('3. rejects a v2 token signed with a key that is not the current one', async () => {
    const token = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', {
      current: WRONG_KEY,
      previous: '',
    });
    expect(token).toBeTruthy();
    expect(await mod.verifyUnsubscribeToken(token!, FULL)).toBeNull();
  });

  it('4. rejects a legacy token signed with a key that is not the previous one', async () => {
    const token = await mintLegacyToken(USER_ID, 'lifecycle', WRONG_KEY);
    expect(await mod.verifyUnsubscribeToken(token, FULL)).toBeNull();
  });

  it('4b. does not accept a v2 token under the previous key, nor a legacy token under the current one', async () => {
    const v2SignedWithPrevious = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', {
      current: PREVIOUS_KEY,
      previous: '',
    });
    expect(await mod.verifyUnsubscribeToken(v2SignedWithPrevious!, FULL)).toBeNull();

    const legacySignedWithCurrent = await mintLegacyToken(USER_ID, 'lifecycle', CURRENT_KEY);
    expect(await mod.verifyUnsubscribeToken(legacySignedWithCurrent, FULL)).toBeNull();
  });

  it('4c. keeps the generations apart even when BOTH keys are the same value', async () => {
    // Domain separation, not key separation. An operator who fat-fingers the
    // same value into both variables must not thereby make a legacy signature
    // valid as v2 — v2 signs `v2.<b64payload>`, legacy signs the raw payload.
    const same = { current: CURRENT_KEY, previous: CURRENT_KEY };

    const legacyToken = await mintLegacyToken(USER_ID, 'lifecycle', CURRENT_KEY);
    const [b64Payload, legacySig] = legacyToken.split('.');

    // Re-dress the legacy signature as a v2 token: same payload, same sig.
    expect(await mod.verifyUnsubscribeToken(`v2.${b64Payload}.${legacySig}`, same)).toBeNull();

    // And the reverse: strip a v2 token's version prefix.
    const v2Token = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', same);
    const [, v2Payload, v2Sig] = v2Token!.split('.');
    expect(await mod.verifyUnsubscribeToken(`${v2Payload}.${v2Sig}`, same)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5–9. Malformed input.
// ---------------------------------------------------------------------------

describe('malformed tokens', () => {
  it('5. rejects a tampered payload (userId swapped, signature kept)', async () => {
    const token = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    const [, , sig] = token!.split('.');
    const forgedPayload = btoa(`${OTHER_USER_ID}:lifecycle`)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(await mod.verifyUnsubscribeToken(`v2.${forgedPayload}.${sig}`, FULL)).toBeNull();
  });

  it('5b. rejects a tampered legacy payload too', async () => {
    const token = await mintLegacyToken(USER_ID, 'lifecycle', PREVIOUS_KEY);
    const [, sig] = token.split('.');
    const forgedPayload = btoa(`${OTHER_USER_ID}:lifecycle`)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(await mod.verifyUnsubscribeToken(`${forgedPayload}.${sig}`, FULL)).toBeNull();
  });

  it('6. rejects a truncated signature', async () => {
    const token = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    const [v, payload, sig] = token!.split('.');

    expect(await mod.verifyUnsubscribeToken(`${v}.${payload}.${sig.slice(0, -1)}`, FULL)).toBeNull();
    expect(await mod.verifyUnsubscribeToken(`${v}.${payload}.`, FULL)).toBeNull();
    expect(await mod.verifyUnsubscribeToken(`${v}.${payload}.${sig}extra`, FULL)).toBeNull();
  });

  it('7. rejects invalid base64url in the payload', async () => {
    const token = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    const [v, , sig] = token!.split('.');

    for (const bad of ['not+base64url', 'has/slash', 'has=padding', 'has spaces', '']) {
      expect(await mod.verifyUnsubscribeToken(`${v}.${bad}.${sig}`, FULL)).toBeNull();
    }
  });

  it('7b. rejects shapes that are neither generation, and never throws', async () => {
    const cases = [
      '',
      '.',
      '..',
      'v2',
      'v2.',
      'v1.abc.def',
      'v3.abc.def',
      'a.b.c.d',
      'onepart',
      ' ',
      'v2.YWJj.ééé',
      'a'.repeat(mod.MAX_TOKEN_LENGTH + 1),
      `v2.${'a'.repeat(mod.MAX_TOKEN_LENGTH)}.sig`,
    ];
    for (const token of cases) {
      await expect(mod.verifyUnsubscribeToken(token, FULL)).resolves.toBeNull();
    }
  });

  it('8. rejects a well-signed token whose userId is not a UUID', async () => {
    // Signed correctly, so only the payload validation can catch it. This is
    // the check that stops a token from steering the profiles UPDATE.
    for (const badId of ['not-a-uuid', '1234', "' OR 1=1 --", `${USER_ID}x`, '']) {
      const payload = `${badId}:lifecycle`;
      const b64 = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sig = await hmacLegacy(`v2.${b64}`, CURRENT_KEY);
      expect(await mod.verifyUnsubscribeToken(`v2.${b64}.${sig}`, FULL)).toBeNull();
    }
  });

  it('9. rejects a well-signed token carrying an unknown category', async () => {
    for (const category of ['transactional', 'promotions', 'lifecycle ', 'LIFECYCLE', '']) {
      const payload = `${USER_ID}:${category}`;
      const b64 = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sig = await hmacLegacy(`v2.${b64}`, CURRENT_KEY);
      expect(await mod.verifyUnsubscribeToken(`v2.${b64}.${sig}`, FULL)).toBeNull();
    }
  });

  it('9b. refuses to SIGN an invalid payload, so a bad token is never minted', async () => {
    expect(await mod.signUnsubscribeToken('not-a-uuid', 'lifecycle', FULL)).toBeNull();
    expect(await mod.signUnsubscribeToken(USER_ID, 'promotions', FULL)).toBeNull();
    expect(await mod.signUnsubscribeToken('', '', FULL)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10–12. Missing keys — fail closed, in every combination.
// ---------------------------------------------------------------------------

describe('missing keys fail closed', () => {
  it('10. with no current key: signs nothing and verifies no v2 token', async () => {
    expect(await mod.signUnsubscribeToken(USER_ID, 'lifecycle', PREVIOUS_ONLY)).toBeNull();
    expect(await mod.signUnsubscribeToken(USER_ID, 'lifecycle', NEITHER)).toBeNull();

    const token = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    expect(await mod.verifyUnsubscribeToken(token!, PREVIOUS_ONLY)).toBeNull();
  });

  it('11. with no previous key: legacy links stop verifying, v2 keeps working', async () => {
    const legacy = await mintLegacyToken(USER_ID, 'lifecycle', PREVIOUS_KEY);
    expect(await mod.verifyUnsubscribeToken(legacy, CURRENT_ONLY)).toBeNull();

    const v2 = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', CURRENT_ONLY);
    expect((await mod.verifyUnsubscribeToken(v2!, CURRENT_ONLY))?.generation).toBe('v2');
  });

  it('12. with neither key: nothing verifies at all', async () => {
    const v2 = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    const legacy = await mintLegacyToken(USER_ID, 'lifecycle', PREVIOUS_KEY);

    expect(await mod.verifyUnsubscribeToken(v2!, NEITHER)).toBeNull();
    expect(await mod.verifyUnsubscribeToken(legacy, NEITHER)).toBeNull();
  });

  it('12b. an absent key cannot be impersonated by the constant-work placeholder', async () => {
    // verifyUnsubscribeToken hashes against a fixed placeholder when the real
    // key is missing, so "legacy is switched off" is not measurable by timing.
    // That placeholder must never accept anything. It is read out of the source
    // rather than duplicated here — a renamed constant would silently make this
    // test check nothing.
    const source = readRepoFile(MODULE_PATH);
    const match = source.match(/ABSENT_KEY_PLACEHOLDER\s*=\s*"([^"]+)"/);
    expect(match, 'ABSENT_KEY_PLACEHOLDER must exist as a string literal').toBeTruthy();
    const placeholder = match![1];

    const forgedV2Sig = await hmacLegacy(
      `v2.${btoa(`${USER_ID}:lifecycle`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`,
      placeholder,
    );
    const b64 = btoa(`${USER_ID}:lifecycle`)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(await mod.verifyUnsubscribeToken(`v2.${b64}.${forgedV2Sig}`, NEITHER)).toBeNull();
    expect(await mod.verifyUnsubscribeToken(`v2.${b64}.${forgedV2Sig}`, PREVIOUS_ONLY)).toBeNull();

    const forgedLegacySig = await hmacLegacy(`${USER_ID}:lifecycle`, placeholder);
    expect(await mod.verifyUnsubscribeToken(`${b64}.${forgedLegacySig}`, NEITHER)).toBeNull();
    expect(await mod.verifyUnsubscribeToken(`${b64}.${forgedLegacySig}`, CURRENT_ONLY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13. No route back to the service-role key.
// ---------------------------------------------------------------------------

describe('13. no fallback to the service-role key', () => {
  it('the shared module never mentions SUPABASE_SERVICE_ROLE_KEY', () => {
    expect(codeOf(MODULE_PATH)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('the derivation `juno-unsubscribe-v1:` survives nowhere in executable code', () => {
    for (const file of [MODULE_PATH, SEND_EMAIL_PATH, UNSUBSCRIBE_PATH]) {
      expect(codeOf(file), `${file} still derives the unsubscribe key`).not.toContain(
        'juno-unsubscribe-v1:',
      );
    }
  });

  it('neither function derives ANY signing key from a service-role value', () => {
    // Broader than the exact old string: catches a re-derivation under a new
    // prefix, which is the shape a well-meaning revert would take.
    const pattern = /(SECRET|KEY|secret|key)\s*=\s*[^;\n]*SERVICE_ROLE/;
    for (const file of [SEND_EMAIL_PATH, UNSUBSCRIBE_PATH]) {
      const code = codeOf(file);
      const offending = code
        .split('\n')
        .filter((line) => pattern.test(line))
        // The admin Supabase client legitimately reads the key; it signs nothing.
        .filter((line) => !/Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(line));
      expect(offending, `${file}: ${offending.join(' | ')}`).toEqual([]);
    }
  });

  it('the retired variable name is documented but never read', () => {
    const code = codeOf(MODULE_PATH);
    // Declared, so the boot report can warn about it…
    expect(code).toContain('RETIRED_SECRET_ENV');
    // …but never used as a lookup.
    expect(code).not.toMatch(/env\[\s*RETIRED_SECRET_ENV\s*\]\s*\?\?\s*["']["']\s*\)?\s*\|\|/);
    expect(codeOf(SEND_EMAIL_PATH)).not.toContain('UNSUBSCRIBE_TOKEN_SECRET"');
    expect(codeOf(UNSUBSCRIBE_PATH)).not.toContain('UNSUBSCRIBE_TOKEN_SECRET"');
  });
});

// ---------------------------------------------------------------------------
// 14. Outbound mail is signed v2 and only v2.
// ---------------------------------------------------------------------------

describe('14. new mail is signed exclusively with the current generation', () => {
  it('send-email calls the shared signer and holds no signer of its own', () => {
    const code = codeOf(SEND_EMAIL_PATH);
    expect(code).toContain('signUnsubscribeToken');
    // The two helpers it used to own are gone; a re-added local `hmac` would
    // be a second signer nobody would think to keep in step.
    expect(code).not.toMatch(/async function hmac\s*\(/);
    expect(code).not.toMatch(/function b64UrlEncode\s*\(/);
    expect(code).not.toContain('crypto.subtle');
    // It must not be able to verify, either — signing and verifying live apart.
    expect(code).not.toContain('verifyUnsubscribeToken');
  });

  it('send-email never reads the previous key', () => {
    expect(codeOf(SEND_EMAIL_PATH)).not.toContain('UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS');
  });

  it('every token the signer produces carries the version prefix', async () => {
    for (let i = 0; i < 25; i++) {
      const id = `3f2504e0-4f89-11d3-9a0c-0305e82c33${String(i).padStart(2, '0')}`;
      const token = await mod.signUnsubscribeToken(id, 'lifecycle', FULL);
      expect(token!.startsWith(`${mod.TOKEN_VERSION}.`)).toBe(true);
      const parsed = await mod.verifyUnsubscribeToken(token!, FULL);
      expect(parsed).toEqual({ userId: id, category: 'lifecycle', generation: 'v2' });
    }
  });

  it('unsubscribe verifies through the shared module and holds no verifier of its own', () => {
    const code = codeOf(UNSUBSCRIBE_PATH);
    expect(code).toContain('verifyUnsubscribeToken');
    expect(code).not.toMatch(/async function hmac\s*\(/);
    expect(code).not.toContain('crypto.subtle');
    // And it must never mint one.
    expect(code).not.toContain('signUnsubscribeToken');
  });
});

// ---------------------------------------------------------------------------
// 15. Constant-time comparison.
// ---------------------------------------------------------------------------

describe('15. signature comparison is constant-time', () => {
  it('compares the full string rather than returning at the first difference', () => {
    const decl = readRepoFile(MODULE_PATH).match(
      /export function constantTimeEqual[\s\S]*?\n}/,
    );
    expect(decl, 'constantTimeEqual must still exist').toBeTruthy();
    const body = decl![0];

    // Accumulate-then-test, never an early `return false` inside the loop.
    expect(body).toContain('diff |=');
    expect(body).toContain('return diff === 0');
    const loopBody = body.slice(body.indexOf('for ('));
    expect(loopBody).not.toContain('return false');
  });

  it('is correct on the cases it has to be correct on', () => {
    expect(mod.constantTimeEqual('', '')).toBe(true);
    expect(mod.constantTimeEqual('abc', 'abc')).toBe(true);
    expect(mod.constantTimeEqual('abc', 'abd')).toBe(false);
    expect(mod.constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(mod.constantTimeEqual('abc', '')).toBe(false);
    // Differs only in the last character — the case a memcmp-style short
    // circuit gets right and a `startsWith` gets wrong.
    const a = 'x'.repeat(42) + 'A';
    const b = 'x'.repeat(42) + 'B';
    expect(mod.constantTimeEqual(a, b)).toBe(false);
  });

  it('the verifier uses it rather than ===', () => {
    const code = codeOf(MODULE_PATH);
    expect(code).toContain('constantTimeEqual(sig, expected)');
    expect(code).not.toMatch(/sig\s*===\s*expected/);
    expect(code).not.toMatch(/expected\s*===\s*sig/);
  });
});

// ---------------------------------------------------------------------------
// 16. Nothing leaks a secret.
// ---------------------------------------------------------------------------

describe('16. no secret value reaches a log, an error or a return value', () => {
  it('the module logs nothing at all', () => {
    expect(codeOf(MODULE_PATH)).not.toMatch(/console\.(log|warn|error|info|debug)/);
  });

  it('describeKeyring reports presence, never a value and never a length', () => {
    const env = {
      UNSUBSCRIBE_TOKEN_SECRET_V2: CURRENT_KEY,
      UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS: PREVIOUS_KEY,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-should-not-appear',
    };
    const described = mod.describeKeyring(env);

    expect(described).not.toContain(CURRENT_KEY);
    expect(described).not.toContain(PREVIOUS_KEY);
    expect(described).not.toContain('service-role-should-not-appear');
    expect(described).not.toMatch(/\d{2,}/); // no lengths
    expect(described).toContain('UNSUBSCRIBE_TOKEN_SECRET_V2=set');
    expect(described).toContain('UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS=set');
  });

  it('describeKeyring names the exact half-finished migration that breaks old links', () => {
    // The operator set the old variable at some point and did not carry it into
    // PREVIOUS. Nothing else in the system would tell them.
    const stranded = mod.describeKeyring({
      UNSUBSCRIBE_TOKEN_SECRET_V2: CURRENT_KEY,
      UNSUBSCRIBE_TOKEN_SECRET: 'an-old-value',
    });
    expect(stranded).toContain('set-but-ignored');
    expect(stranded).toContain('WARNING');
    expect(stranded).toContain('UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS');
    expect(stranded).not.toContain('an-old-value');

    // …and stays quiet once PREVIOUS is provisioned.
    const fine = mod.describeKeyring({
      UNSUBSCRIBE_TOKEN_SECRET_V2: CURRENT_KEY,
      UNSUBSCRIBE_TOKEN_SECRET: 'an-old-value',
      UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS: 'an-old-value',
    });
    expect(fine).not.toContain('WARNING');
  });

  it('a failed verification says nothing about which key was tried', async () => {
    const errors: unknown[][] = [];
    for (const method of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        errors.push(args);
      });
    }

    const legacy = await mintLegacyToken(USER_ID, 'lifecycle', WRONG_KEY);
    const v2 = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', {
      current: WRONG_KEY,
      previous: '',
    });

    const a = await mod.verifyUnsubscribeToken(legacy, FULL);
    const b = await mod.verifyUnsubscribeToken(v2!, FULL);
    const c = await mod.verifyUnsubscribeToken('garbage', FULL);

    // Identical answer for three different reasons.
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(c).toBeNull();
    expect(errors).toEqual([]);
  });

  it('never throws a secret-bearing error, whatever it is handed', async () => {
    const hostile = [
      'v2..',
      'v2.%%%.%%%',
      `v2.${'A'.repeat(400)}.${'B'.repeat(43)}`,
      '\u{1F4A5}.\u{1F4A5}',
    ];
    for (const token of hostile) {
      try {
        const out = await mod.verifyUnsubscribeToken(token, FULL);
        expect(out).toBeNull();
      } catch (err) {
        const text = String((err as Error).stack ?? err);
        expect(text).not.toContain(CURRENT_KEY);
        expect(text).not.toContain(PREVIOUS_KEY);
        throw err; // it should not have thrown at all
      }
    }
  });

  it('a minted token does not contain the key that signed it', async () => {
    const token = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    expect(token).not.toContain(CURRENT_KEY);
    expect(token).not.toContain(PREVIOUS_KEY);
    // And the payload is only what we put in it.
    const decoded = atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
    expect(decoded).toBe(`${USER_ID}:lifecycle`);
  });
});

// ---------------------------------------------------------------------------
// 17. Idempotence.
// ---------------------------------------------------------------------------

describe('17. a valid link keeps giving the same answer', () => {
  it('verifies identically however many times it is presented', async () => {
    const v2 = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    const legacy = await mintLegacyToken(USER_ID, 'lifecycle', PREVIOUS_KEY);

    for (let i = 0; i < 5; i++) {
      expect(await mod.verifyUnsubscribeToken(v2!, FULL)).toEqual({
        userId: USER_ID,
        category: 'lifecycle',
        generation: 'v2',
      });
      expect(await mod.verifyUnsubscribeToken(legacy, FULL)).toEqual({
        userId: USER_ID,
        category: 'lifecycle',
        generation: 'legacy',
      });
    }
  });

  it('signing is deterministic, so the same reader gets the same link twice', async () => {
    const a = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    const b = await mod.signUnsubscribeToken(USER_ID, 'lifecycle', FULL);
    expect(a).toBe(b);
    // Determinism is required: the token never expires, so a second email must
    // not silently strand the link in the first one.
  });
});

// ---------------------------------------------------------------------------
// Keyring plumbing.
// ---------------------------------------------------------------------------

describe('keyring construction', () => {
  it('reads the two new names and nothing else', () => {
    const keyring = mod.readUnsubscribeKeyring({
      UNSUBSCRIBE_TOKEN_SECRET_V2: CURRENT_KEY,
      UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS: PREVIOUS_KEY,
      UNSUBSCRIBE_TOKEN_SECRET: 'retired-and-ignored',
      SUPABASE_SERVICE_ROLE_KEY: 'must-not-be-used',
    });
    expect(keyring).toEqual({ current: CURRENT_KEY, previous: PREVIOUS_KEY });
  });

  it('yields empty strings — never undefined — when nothing is configured', () => {
    expect(mod.readUnsubscribeKeyring({})).toEqual({ current: '', previous: '' });
  });

  it('trims, because a trailing newline is what `supabase secrets set < file` produces', () => {
    const keyring = mod.readUnsubscribeKeyring({
      UNSUBSCRIBE_TOKEN_SECRET_V2: `  ${CURRENT_KEY}\n`,
      UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS: `${PREVIOUS_KEY}\r\n`,
    });
    expect(keyring).toEqual({ current: CURRENT_KEY, previous: PREVIOUS_KEY });
  });

  it('treats a whitespace-only value as absent rather than as a key', async () => {
    const keyring = mod.readUnsubscribeKeyring({ UNSUBSCRIBE_TOKEN_SECRET_V2: '   ' });
    expect(keyring.current).toBe('');
    expect(await mod.signUnsubscribeToken(USER_ID, 'lifecycle', keyring)).toBeNull();
  });

  it('exposes the env names the runbook tells the operator to set', () => {
    expect(mod.CURRENT_SECRET_ENV).toBe('UNSUBSCRIBE_TOKEN_SECRET_V2');
    expect(mod.PREVIOUS_SECRET_ENV).toBe('UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS');
    expect(mod.RETIRED_SECRET_ENV).toBe('UNSUBSCRIBE_TOKEN_SECRET');
    // The current signing key MUST NOT be the name the pre-fix code read: the
    // whole zero-downtime property depends on setting a name the deployed
    // function ignores. See the module header.
    expect(mod.CURRENT_SECRET_ENV).not.toBe(mod.RETIRED_SECRET_ENV);
  });
});
