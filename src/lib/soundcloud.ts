import { createHash, randomBytes } from "crypto";
import { env } from "@/utils/env";

const AUTHORIZE_URL = "https://secure.soundcloud.com/authorize";
/**
 * secure.soundcloud.com/oauth/token IS the right endpoint for every grant —
 * but only over HTTP Basic auth, and it answers *any* malformed or unknown
 * authorization_code request (bogus code, missing verifier, body creds) with
 * the same blanket `invalid_request`, which is what made it look broken.
 * Verified live: garbage grant_type -> `unsupported_grant_type` (so the
 * grant parser runs), client_credentials + Basic -> 200, client_credentials
 * with creds in the body -> `invalid_client`. The legacy
 * api.soundcloud.com/oauth2/token host can't redeem PKCE-bound codes issued
 * by secure.soundcloud.com/authorize, which is why real codes died there.
 */
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

/**
 * Exchange with fallbacks: the expected winner is the secure host over Basic
 * auth (see TOKEN_URL note), but the older shapes stay as fallbacks and the
 * total-failure path still reports the per-variant matrix to the popup.
 * Basic auth and client_id in the body must never be combined — the secure
 * host answers that mix with `invalid_client`.
 */
export const exchangeCodeMatrix = async (
  code: string,
  codeVerifier: string
): Promise<
  | { ok: true; tokens: SoundcloudTokens; via: string }
  | { ok: false; report: string }
> => {
  const id = env.soundcloudClientId as string;
  const secret = env.soundcloudClientSecret as string;
  const redirect = env.soundcloudRedirectUri as string;

  const variants: {
    name: string;
    url: string;
    basic: boolean;
    body: Record<string, string>;
  }[] = [
    {
      name: "v0-secure-basic",
      url: "https://secure.soundcloud.com/oauth/token",
      basic: true,
      body: {
        grant_type: "authorization_code",
        redirect_uri: redirect,
        code_verifier: codeVerifier,
        code
      }
    },
    {
      name: "v1-api-basic",
      url: "https://api.soundcloud.com/oauth2/token",
      basic: true,
      body: {
        grant_type: "authorization_code",
        redirect_uri: redirect,
        code_verifier: codeVerifier,
        code
      }
    },
    {
      name: "v2-api-bodycreds",
      url: "https://api.soundcloud.com/oauth2/token",
      basic: false,
      body: {
        grant_type: "authorization_code",
        client_id: id,
        client_secret: secret,
        redirect_uri: redirect,
        code_verifier: codeVerifier,
        code
      }
    },
    {
      name: "v3-secure-bodycreds",
      url: "https://secure.soundcloud.com/oauth/token",
      basic: false,
      body: {
        grant_type: "authorization_code",
        client_id: id,
        client_secret: secret,
        redirect_uri: redirect,
        code_verifier: codeVerifier,
        code
      }
    }
  ];

  const report: string[] = [];
  for (const variant of variants) {
    try {
      const response = await fetch(variant.url, {
        method: "POST",
        headers: {
          ...(variant.basic
            ? {
                Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`
              }
            : {}),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json; charset=utf-8"
        },
        body: new URLSearchParams(variant.body),
        cache: "no-store"
      });
      const text = await response.text();
      if (response.ok) {
        console.log(`[gate] exchange matrix: ${variant.name} SUCCEEDED`);
        return {
          ok: true,
          via: variant.name,
          tokens: parseTokenResponse(JSON.parse(text))
        };
      }
      let brief = `${response.status}`;
      try {
        const parsed = JSON.parse(text) as {
          error?: string | null;
          error_code?: string;
        };
        brief += `:${parsed.error || parsed.error_code || "?"}`;
      } catch {
        brief += `:${text.slice(0, 40)}`;
      }
      report.push(`${variant.name}=${brief}`);
      console.log(`[gate] exchange matrix: ${variant.name} -> ${brief}`);
    } catch (error) {
      report.push(`${variant.name}=network_error`);
      console.log(`[gate] exchange matrix: ${variant.name} threw`, error);
    }
  }
  return { ok: false, report: report.join(" | ") };
};

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

/**
 * App-level token for admin-side lookups (no fan involved). Cached per server
 * instance because SoundCloud caps client_credentials issuance at 50 tokens
 * per 12 hours per app.
 */
let clientToken: { token: string; expiresAt: number } | null = null;

export const getClientToken = async () => {
  if (clientToken && clientToken.expiresAt - Date.now() > 60_000) {
    return clientToken.token;
  }
  const tokens = await postToken(
    new URLSearchParams({ grant_type: "client_credentials" })
  );
  clientToken = {
    token: tokens.accessToken,
    expiresAt: tokens.expiresAt
      ? Date.parse(tokens.expiresAt)
      : Date.now() + 50 * 60 * 1000
  };
  return clientToken.token;
};

export type ResolvedTrackMeta = {
  kind: string;
  id: string;
  title: string;
  artworkUrl: string;
  permalinkUrl: string;
};

/** Full track metadata for the admin "add a gate" flow. */
export const resolveTrackMeta = async (
  url: string
): Promise<ResolvedTrackMeta> => {
  const token = await getClientToken();
  const data = await asJson<{
    id?: number | string;
    urn?: string;
    kind?: string;
    title?: string;
    artwork_url?: string | null;
    permalink_url?: string;
  }>(await apiRequest(`/resolve?url=${encodeURIComponent(url)}`, token));
  return {
    kind: data.kind || "",
    id: numericId(data.id ?? data.urn),
    title: data.title || "",
    // The API hands back the 100x100 "-large" crop; the gate page wants more.
    artworkUrl: (data.artwork_url || "").replace("-large", "-t500x500"),
    // permalink_url arrives with ?utm_… tracking params appended — drop them,
    // they'd otherwise leak into the slug and the stored permalink.
    permalinkUrl: (data.permalink_url || "").split(/[?#]/)[0]
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
