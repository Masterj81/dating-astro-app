const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHITESPACE_COLLAPSE_REGEX = /\s{2,}/g;
const PURE_NUMBERS_REGEX = /^\d+$/;
const PURE_SPECIAL_REGEX = /^[^a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+$/;

export function validateEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, error: 'invalidEmail' };
  }
  if (trimmed.length > 254) {
    return { valid: false, error: 'invalidEmail' };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'invalidEmail' };
  }
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'passwordHintStrong' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'passwordHintStrong' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'passwordHintStrong' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: 'passwordHintStrong' };
  }
  // Require at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return { valid: false, error: 'passwordHintStrong' };
  }
  return { valid: true };
}

export function validateName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: 'nameTooShort' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: 'nameTooShort' };
  }
  if (PURE_NUMBERS_REGEX.test(trimmed)) {
    return { valid: false, error: 'nameOnlyNumbers' };
  }
  if (PURE_SPECIAL_REGEX.test(trimmed)) {
    return { valid: false, error: 'nameOnlyNumbers' };
  }
  return { valid: true };
}

export function validateBirthDate(dateStr: string): {
  valid: boolean;
  error?: string;
  age?: number;
} {
  const parts = dateStr.split('/');
  if (parts.length !== 3) {
    return { valid: false, error: 'invalidBirthDateFormat' };
  }

  const [monthStr, dayStr, yearStr] = parts;
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);

  if (isNaN(month) || isNaN(day) || isNaN(year)) {
    return { valid: false, error: 'invalidBirthDateFormat' };
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || yearStr.length !== 4) {
    return { valid: false, error: 'invalidBirthDateFormat' };
  }

  // Validate actual date (handles Feb 30, etc.)
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { valid: false, error: 'invalidBirthDateFormat' };
  }

  const now = new Date();
  if (date > now) {
    return { valid: false, error: 'futureBirthDate' };
  }

  // Calculate age
  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
    age--;
  }

  if (age < 18) {
    return { valid: false, error: 'mustBe18' };
  }

  return { valid: true, age };
}

export function validateBio(bio: string): { valid: boolean; sanitized: string; error?: string } {
  const sanitized = sanitizeText(bio);
  if (sanitized.length > 500) {
    return { valid: false, sanitized, error: 'bioTooLong' };
  }
  return { valid: true, sanitized };
}

export function sanitizeText(text: string): string {
  // Plain-text policy — no angle brackets, ever. Biographies are rendered as
  // plain React Native text; tags have no meaning to preserve, so the safe
  // transform is to drop every '<' and '>' INDIVIDUALLY, character by
  // character. This closes the CodeQL finding for good
  // (js/incomplete-multi-character-sanitization, 2026-09-19/21): there is no
  // multi-character sanitization pattern left to bypass — nested payloads
  // ('<scr<script>ipt>'), half-tags, attributes, all reduce to text. The
  // previous replace(/<[^>]*>/g, '') approach — even looped to a fixed point
  // — still smelled like tag STRIPPING to static analysis, and rightly so:
  // stripping is a losing race; not letting brackets exist at all is not.
  let withoutAngleBrackets = "";
  for (const character of text) {
    if (character !== "<" && character !== ">") {
      withoutAngleBrackets += character;
    }
  }
  return withoutAngleBrackets
    .replace(WHITESPACE_COLLAPSE_REGEX, " ")
    .trim();
}
