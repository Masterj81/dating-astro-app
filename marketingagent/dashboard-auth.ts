/**
 * Basic Auth gate for the local dashboard.
 *
 * Kept in its own module so tests can import the pure decision function
 * without booting the HTTP server (which opens a socket + registers
 * setInterval schedulers at import time).
 *
 * Password comparison is timing-safe to avoid leaking token length via the
 * loopback-only attack surface. Paranoid but free.
 */

import { timingSafeEqual } from "crypto";

export function checkBasicAuthHeader(authHeader: string | undefined, expectedToken: string): boolean {
  if (!expectedToken) return true;
  const header = authHeader || "";
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (!match) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf-8");
  } catch {
    return false;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  const pass = decoded.slice(colon + 1);
  const a = Buffer.from(pass);
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
