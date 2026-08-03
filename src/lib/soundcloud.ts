import { createHash, randomBytes } from "crypto";
import { env } from "@/utils/env";

const AUTHORIZE_URL = "https://secure.soundcloud.com/authorize";
const TOKEN_URL = "https://secure.soundcloud.com/oauth/token";
const API_BASE = "https://api.soundcloud.com";

export type SoundcloudTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

export class SoundcloudApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string, message?: string) {
    super(message || `SoundCloud API error (${status})`);
    this.name = "SoundcloudApiError";
    this.status = status;
    this.body = body;
  }
}

export const soundcloudConfigured = () =>
  Boolean(
    env.soundcloudClientId &&
      env.soundcloudClientSecret &&
      env.soundcloudRedirectUri
  );

const base64url = (buffer: Buffer) =>
  buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** SoundCloud runs OAuth 2.1, so PKCE is mandatory on the code exchange. */
export const createPkcePair = () => {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
};

export const buildAuthUrl = (state: string, codeChallenge: string) => {
  const params = new URLSearchParams({
    client_id: env.soundcloudClientId as string,
    redirect_uri: env.soundcloudRedirectUri as string,
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
};

const parseTokenResponse = (payload: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): SoundcloudTokens => ({
  accessToken: payload.access_token,
  refreshToken: payload.refresh_token || null,
  expiresAt: payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
    : null
});

/**
 * SoundCloud authenticates the client with HTTP Basic auth on this endpoint.
 * Passing client_id/client_secret in the form body — which is legal in plain
 * OAuth 2.0 — is rejected here with `401 invalid_client`, so every code
 * exchange and refresh silently failed. Verified against the live endpoint:
 * body credentials -> 401, Basic auth -> 200 + token.
 */
const basicAuth = () =>
  Buffer.from(
    `${env.soundcloudClientId}:${env.soundcloudClientSecret}`
  ).toString("base64");

const postToken = async (body: URLSearchParams) => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json; charset=utf-8"
    },
    body,
    cache: "no-store"
  });

  const text = await response.text();
  if (!response.ok) {
    throw new SoundcloudApiError(response.status, text, "Token request failed.");
  }

  return parseTokenResponse(JSON.parse(text));
};

export const exchangeCodeForToken = (code: string, codeVerifier: string) =>
  postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: env.soundcloudRedirectUri as string,
      code_verifier: codeVerifier,
      code
    })
  );

/** Refresh tokens are single-use — always persist the new one you get back. */
export const refreshAccessToken = (refreshToken: string) =>
  postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  );

const apiRequest = async (
  path: string,
  accessToken: string,
  init?: RequestInit
) => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `OAuth ${accessToken}`,
      Accept: "application/json; charset=utf-8",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new SoundcloudApiError(response.status, await response.text());
  }

  return response;
};

const asJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
};

/**
 * SoundCloud is migrating id fields from numbers to URN strings
 * ("soundcloud:users:123"), so pull the numeric part off whatever we get.
 */
export const numericId = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return "";
  const match = `${value}`.match(/(\d+)\s*$/);
  return match ? match[1] : "";
};

type SoundcloudUser = {
  id?: number | string;
  urn?: string;
  username?: string;
  permalink_url?: string;
  avatar_url?: string;
};

export const fetchMe = async (accessToken: string) => {
  const me = await asJson<SoundcloudUser>(await apiRequest("/me", accessToken));
  return {
    id: numericId(me.id ?? me.urn),
    username: me.username || "",
    permalinkUrl: me.permalink_url || "",
    avatarUrl: me.avatar_url || ""
  };
};

/** Resolves a soundcloud.com permalink to its API resource (user or track). */
export const resolvePermalink = async (accessToken: string, url: string) => {
  const resolved = await asJson<{
    id?: number | string;
    urn?: string;
    kind?: string;
  }>(
    await apiRequest(
      `/resolve?url=${encodeURIComponent(url)}`,
      accessToken
    )
  );
  return {
    id: numericId(resolved.id ?? resolved.urn),
    kind: resolved.kind || ""
  };
};

/**
 * PUT /me/followings/:id — idempotent on SoundCloud's side, and a 409 just
 * means the fan already follows, which is still a pass for the gate.
 */
export const followUser = async (accessToken: string, userId: string) => {
  try {
    await apiRequest(`/me/followings/${userId}`, accessToken, { method: "PUT" });
    return true;
  } catch (error) {
    if (error instanceof SoundcloudApiError && error.status === 409) {
      return true;
    }
    throw error;
  }
};

/** POST /likes/tracks/:id — same idempotency story as the follow above. */
export const likeTrack = async (accessToken: string, trackId: string) => {
  try {
    await apiRequest(`/likes/tracks/${trackId}`, accessToken, {
      method: "POST"
    });
    return true;
  } catch (error) {
    if (error instanceof SoundcloudApiError && error.status === 409) {
      return true;
    }
    throw error;
  }
};

/**
 * POST /reposts/tracks/:id — puts the track on the fan's profile feed.
 * Idempotent like the others; 409 means it's already reposted.
 */
export const repostTrack = async (accessToken: string, trackId: string) => {
  try {
    await apiRequest(`/reposts/tracks/${trackId}`, accessToken, {
      method: "POST"
    });
    return true;
  } catch (error) {
    if (error instanceof SoundcloudApiError && error.status === 409) {
      return true;
    }
    throw error;
  }
};

/**
 * POST /tracks/:id/comments — body is nested under `comment`.
 * Not idempotent: re-running posts a second comment, so callers must only
 * fire this once per fan per track.
 */
export const commentOnTrack = async (
  accessToken: string,
  trackId: string,
  body: string
) => {
  const text = body.trim();
  if (!text) return false;
  await apiRequest(`/tracks/${trackId}/comments`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment: { body: text } })
  });
  return true;
};

type FollowingsPage = {
  collection?: { id?: number | string; urn?: string }[];
  next_href?: string;
};

/** Fallback verification when a write call is rejected but the fan may have
 * already followed manually. Paged, so only used off the happy path. */
export const checkFollowing = async (accessToken: string, artistId: string) => {
  let nextUrl: string | null =
    "/me/followings?limit=200&linked_partitioning=true";

  while (nextUrl) {
    const data: FollowingsPage = await asJson<FollowingsPage>(
      await apiRequest(nextUrl, accessToken)
    );

    if (
      data.collection?.some(
        (user) => numericId(user.id ?? user.urn) === artistId
      )
    ) {
      return true;
    }

    nextUrl = data.next_href
      ? data.next_href.replace(API_BASE, "")
      : null;
  }

  return false;
};
