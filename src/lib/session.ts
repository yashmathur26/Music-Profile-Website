import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { ensureSession } from "@/lib/db";

export const SESSION_COOKIE = "gate_session";
export const OAUTH_STATE_COOKIE = "sc_oauth_state";

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

export const setOauthState = (state: string) => {
  const cookieJar = cookies();
  cookieJar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/"
  });
};

export const getOauthState = () => cookies().get(OAUTH_STATE_COOKIE)?.value;

export const clearOauthState = () => {
  cookies().delete(OAUTH_STATE_COOKIE);
};
