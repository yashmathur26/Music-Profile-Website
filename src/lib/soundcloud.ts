import { env } from "@/utils/env";

const AUTH_BASE = "https://soundcloud.com/connect";
const TOKEN_URL = "https://api.soundcloud.com/oauth2/token";
const API_BASE = "https://api.soundcloud.com";

export const buildAuthUrl = (state: string) => {
  const params = new URLSearchParams({
    client_id: env.soundcloudClientId,
    redirect_uri: env.soundcloudRedirectUri,
    response_type: "code",
    state
  });
  return `${AUTH_BASE}?${params.toString()}`;
};

export const exchangeCodeForToken = async (code: string) => {
  const body = new URLSearchParams({
    client_id: env.soundcloudClientId,
    client_secret: env.soundcloudClientSecret,
    redirect_uri: env.soundcloudRedirectUri,
    grant_type: "authorization_code",
    code
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error("SoundCloud token exchange failed.");
  }

  return (await response.json()) as { access_token: string };
};

const fetchWithAuth = async (url: string, accessToken: string) => {
  const oauthResponse = await fetch(url, {
    headers: { Authorization: `OAuth ${accessToken}` }
  });
  if (oauthResponse.status !== 401) {
    return oauthResponse;
  }
  return fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
};

export const fetchMe = async (accessToken: string) => {
  const response = await fetchWithAuth(`${API_BASE}/me`, accessToken);

  if (!response.ok) {
    throw new Error("Failed to fetch SoundCloud profile.");
  }

  return (await response.json()) as { id: number };
};

export const checkFollowings = async (
  accessToken: string,
  artistId: string
) => {
  let nextUrl = `${API_BASE}/me/followings?limit=200&linked_partitioning=1`;
  while (nextUrl) {
    const response = await fetchWithAuth(nextUrl, accessToken);
    if (!response.ok) {
      throw new Error("Failed to fetch followings.");
    }
    const data = (await response.json()) as {
      collection: { id: number }[];
      next_href?: string;
    };
    if (data.collection?.some((user) => `${user.id}` === artistId)) {
      return true;
    }
    nextUrl = data.next_href || "";
  }
  return false;
};
