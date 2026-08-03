import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";

export type GateEngagement = Record<
  string,
  {
    followed?: boolean;
    liked?: boolean;
    reposted?: boolean;
    /** Comments are not idempotent on SoundCloud — this flag is the only thing
     * standing between a retry and a duplicate comment. */
    commented?: boolean;
  }
>;

export type GateCookie = {
  userId?: string;
  username?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  engagement?: GateEngagement;
};

const COOKIE_NAME = "sc_gate";
const MAX_AGE = 60 * 60 * 24 * 7;

/**
 * The gate only needs per-visitor state, so it lives in an encrypted cookie
 * rather than a database. Keyed off the SoundCloud client secret, which is
 * server-only and always present whenever the gate is in auto mode.
 */
const secretKey = () => {
  const secret =
    process.env.GATE_SECRET ||
    process.env.SOUNDCLOUD_CLIENT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
};

const encrypt = (value: GateCookie) => {
  const key = secretKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url"
  );
};

const decrypt = (raw: string): GateCookie | null => {
  const key = secretKey();
  if (!key) return null;
  try {
    const buffer = Buffer.from(raw, "base64url");
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(buffer.subarray(28)),
      decipher.final()
    ]).toString("utf8");
    return JSON.parse(plaintext) as GateCookie;
  } catch {
    // Tampered, truncated, or encrypted under a rotated secret.
    return null;
  }
};

export const readGate = (): GateCookie => {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return {};
  return decrypt(raw) || {};
};

/** Merges a patch into the stored state; engagement merges per track. */
export const writeGate = (patch: GateCookie) => {
  const current = readGate();
  const next: GateCookie = {
    ...current,
    ...patch,
    engagement: {
      ...(current.engagement || {}),
      ...(patch.engagement || {})
    }
  };

  const encoded = encrypt(next);
  if (!encoded) return next;

  cookies().set(COOKIE_NAME, encoded, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/"
  });
  return next;
};

export const recordGateEngagement = (
  trackSlug: string,
  engagement: GateEngagement[string]
) => {
  const current = readGate();
  return writeGate({
    engagement: {
      [trackSlug]: {
        ...(current.engagement?.[trackSlug] || {}),
        ...engagement
      }
    }
  });
};

export const clearGate = () => {
  cookies().delete(COOKIE_NAME);
};
