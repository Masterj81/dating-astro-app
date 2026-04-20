export function getPasswordStrength(password: string): number {
  if (!password) return 0;

  let strength = 0;
  if (password.length >= 8) strength += 1;
  if (password.length >= 12) strength += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength += 1;
  if (/\d/.test(password)) strength += 1;
  if (/[^A-Za-z0-9]/.test(password)) strength += 1;

  return Math.min(strength, 4);
}

export function getPasswordValidationError(password: string): string | null {
  if (password.length < 8) {
    return "passwordHintStrong";
  }

  if (!/[a-z]/.test(password)) {
    return "passwordHintStrong";
  }

  if (!/[A-Z]/.test(password)) {
    return "passwordHintStrong";
  }

  if (!/\d/.test(password)) {
    return "passwordHintStrong";
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return "passwordHintStrong";
  }

  return null;
}
