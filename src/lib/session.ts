import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { ensureSession } from "@/lib/db";

export const SESSION_COOKIE = "gate_session";
export const OAUTH_STATE_COOKIE = "sc_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "sc_oauth_verifier";
export const OAUTH_TRACK_COOKIE = "sc_oauth_track";
export const OAUTH_PREFS_COOKIE = "sc_oauth_prefs";

/** What the fan chose before opening the OAuth popup. */
export type OauthPrefs = {
  repost: boolean;
  comment?: string;
};

const shortLivedCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 10,
  path: "/"
};

export const getOrCreateSessionId = () => {
  const cookieJar = cookies();
  let sessionId = cookieJar.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    sessionId = nanoid();
    cookieJar.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
      path: "/"
    });
  }
  void ensureSession(sessionId);
  return sessionId;
};

/** Stashes everything the OAuth callback needs: CSRF state, the PKCE verifier,
 * which track the fan was on, and their repost/comment choices. */
export const setOauthHandoff = (
  state: string,
  codeVerifier: string,
  trackSlug: string,
  prefs: OauthPrefs
) => {
  const cookieJar = cookies();
  cookieJar.set(OAUTH_STATE_COOKIE, state, shortLivedCookie);
  cookieJar.set(OAUTH_VERIFIER_COOKIE, codeVerifier, shortLivedCookie);
  cookieJar.set(OAUTH_TRACK_COOKIE, trackSlug, shortLivedCookie);
  cookieJar.set(OAUTH_PREFS_COOKIE, JSON.stringify(prefs), shortLivedCookie);
};

const parsePrefs = (raw: string | undefined): OauthPrefs => {
  if (!raw) return { repost: true };
  try {
    const parsed = JSON.parse(raw) as Partial<OauthPrefs>;
    return {
      repost: parsed.repost !== false,
      comment:
        typeof parsed.comment === "string" && parsed.comment.trim()
          ? parsed.comment
          : undefined
    };
  } catch {
    return { repost: true };
  }
};

export const getOauthHandoff = () => {
  const cookieJar = cookies();
  return {
    state: cookieJar.get(OAUTH_STATE_COOKIE)?.value,
    codeVerifier: cookieJar.get(OAUTH_VERIFIER_COOKIE)?.value,
    trackSlug: cookieJar.get(OAUTH_TRACK_COOKIE)?.value,
    prefs: parsePrefs(cookieJar.get(OAUTH_PREFS_COOKIE)?.value)
  };
};

export const clearOauthHandoff = () => {
  const cookieJar = cookies();
  cookieJar.delete(OAUTH_STATE_COOKIE);
  cookieJar.delete(OAUTH_VERIFIER_COOKIE);
  cookieJar.delete(OAUTH_TRACK_COOKIE);
  cookieJar.delete(OAUTH_PREFS_COOKIE);
};
