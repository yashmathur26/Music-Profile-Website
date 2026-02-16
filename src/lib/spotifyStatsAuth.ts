/**
 * Spotify OAuth for Stats dashboard — separate redirect URI and scopes from presave.
 * Add redirect URI in Spotify Dashboard: https://yvshmusic.com/api/auth/spotify/callback
 */

const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";

const STATS_SCOPES = [
  "user-read-recently-played",
  "user-top-read",
  "user-read-private",
].join(" ");

function getStatsRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://yvshmusic.com";
  return `${base.replace(/\/$/, "")}/api/auth/spotify/callback`;
}

export function getStatsAuthorizeUrl(state: string): string {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) throw new Error("SPOTIFY_CLIENT_ID is not set");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getStatsRedirectUri(),
    scope: STATS_SCOPES,
    state,
  });
  return `${SPOTIFY_ACCOUNTS}/authorize?${params.toString()}`;
}

export async function exchangeStatsCodeForTokens(code: string): Promise<{
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
      redirect_uri: getStatsRedirectUri(),
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return data;
}

export async function refreshStatsAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Spotify credentials not set");
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  });
  if (!res.ok) throw new Error("Spotify refresh failed");
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
