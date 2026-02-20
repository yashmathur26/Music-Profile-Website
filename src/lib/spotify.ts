/**
 * Spotify API helpers: OAuth token exchange, refresh, and save track to user library.
 * OAuth state is signed (no cookies) so presave works with ad/cookie blockers.
 */

import { createHmac, randomBytes } from "crypto";

const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";
const SPOTIFY_API = "https://api.spotify.com/v1";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://yvshmusic.com";
  return `${base.replace(/\/$/, "")}/api/spotify/callback`;
}

/** Create signed state (no cookie needed) — works with cookie blockers. */
export function createSignedState(returnTo: string): string {
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new Error("SPOTIFY_CLIENT_SECRET not set");
  const nonce = randomBytes(16).toString("hex");
  const ts = Date.now().toString();
  const payload = `${nonce}|${returnTo}|${ts}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  return `${payloadB64}.${sig}`;
}

/** Verify signed state from callback; returns returnTo or null if invalid/expired. */
export function verifySignedState(state: string): { returnTo: string } | null {
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) return null;
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expectedSig = createHmac("sha256", secret).update(payload).digest("base64url");
  if (sig !== expectedSig) return null;
  const [, returnTo, tsStr] = payload.split("|");
  if (!returnTo || !tsStr) return null;
  const ts = parseInt(tsStr, 10);
  if (Number.isNaN(ts) || Date.now() - ts > STATE_TTL_MS || ts > Date.now() + 60000) return null;
  return { returnTo };
}

export function getAuthorizeUrl(state: string): string {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) throw new Error("SPOTIFY_CLIENT_ID is not set");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: "user-library-modify",
    state,
  });
  return `${SPOTIFY_ACCOUNTS}/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Spotify credentials not set");

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return data;
}

export async function getAccessTokenFromRefresh(refreshToken: string): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Spotify credentials not set");

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getSpotifyUserId(accessToken: string): Promise<string> {
  const res = await fetch(`${SPOTIFY_API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify /me failed: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Save a track to the user's Spotify library. trackId can be "spotify:track:xxx" or just the id. */
export async function saveTrackToLibrary(accessToken: string, trackId: string): Promise<boolean> {
  const id = trackId.startsWith("spotify:track:") ? trackId : `spotify:track:${trackId}`;
  const res = await fetch(`${SPOTIFY_API}/me/tracks`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [id.replace("spotify:track:", "")] }),
  });
  return res.ok;
}
