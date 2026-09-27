import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * The password screen in front of the admin dashboard. The link itself is
 * still the first gate (`/admin/<TRIGGER_SAVES_SECRET>`); this is the second,
 * so a shared or shoulder-surfed URL isn't enough on its own.
 *
 * Unlocking mints a short-lived signed cookie rather than keeping the password
 * anywhere in the browser.
 */

const COOKIE_NAME = "admin_session";
/** A working session, short enough that a borrowed laptop re-prompts. */
const MAX_AGE_SECONDS = 60 * 60 * 12;

/** ADMIN_PASSWORD, or the admin link's own secret when it isn't set. */
export const adminPassword = () =>
  process.env.ADMIN_PASSWORD?.trim() ||
  process.env.TRIGGER_SAVES_SECRET?.trim() ||
  "";

/** Signing key for the session cookie — server-only, never the password. */
const signingKey = () =>
  process.env.GATE_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SOUNDCLOUD_CLIENT_SECRET ||
  "";

const sign = (value: string) =>
  createHmac("sha256", signingKey()).update(value).digest("base64url");

/** Compares digests so the check takes the same time whatever was typed. */
const sameSecret = (a: string, b: string) => {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
};

export const matchesAdminPassword = (input: string) => {
  const expected = adminPassword();
  if (!expected) return false;
  return sameSecret(input, expected);
};

export const startAdminSession = () => {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${expiresAt}`;
  cookies().set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/"
  });
};

export const hasAdminSession = () => {
  if (!signingKey()) return false;
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return false;

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  // Same length by construction, but a forged cookie can be any length.
  if (signature.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false;
  }

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

export const clearAdminSession = () => {
  cookies().delete(COOKIE_NAME);
};
