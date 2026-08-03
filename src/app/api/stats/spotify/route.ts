import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getStatsSession,
  updateStatsSessionTokens,
  type StatsSessionRow,
} from "@/lib/statsSession";
import { refreshStatsAccessToken } from "@/lib/spotifyStatsAuth";
import {
  calculateYvshStats,
  type RecentPlayedItem,
  type SpotifyTrackItem,
  type YvshStats,
} from "@/lib/statsCalculator";

const SPOTIFY_API = "https://api.spotify.com/v1";

async function getValidAccessToken(session: StatsSessionRow): Promise<string> {
  const expiresAt = new Date(session.expires_at).getTime();
  if (Date.now() < expiresAt - 60 * 1000) return session.access_token;
  const newAccess = await refreshStatsAccessToken(session.refresh_token);
  const newExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await updateStatsSessionTokens(session.id, newAccess, newExpires);
  return newAccess;
}

async function fetchWithAuth<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("yvsh_stats_session")?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const session = await getStatsSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 401 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session);
  } catch {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  try {
    const [recentlyPlayed, topTracks4Weeks, topTracks6Months, topTracksAllTime] =
      await Promise.all([
        fetchWithAuth<{ items?: RecentPlayedItem[] }>(
          `${SPOTIFY_API}/me/player/recently-played?limit=50`,
          accessToken
        ),
        fetchWithAuth<{ items?: SpotifyTrackItem[] }>(
          `${SPOTIFY_API}/me/top/tracks?time_range=short_term&limit=50`,
          accessToken
        ),
        fetchWithAuth<{ items?: SpotifyTrackItem[] }>(
          `${SPOTIFY_API}/me/top/tracks?time_range=medium_term&limit=50`,
          accessToken
        ),
        fetchWithAuth<{ items?: SpotifyTrackItem[] }>(
          `${SPOTIFY_API}/me/top/tracks?time_range=long_term&limit=50`,
          accessToken
        ),
      ]);

    const stats: YvshStats = calculateYvshStats({
      recentlyPlayed: recentlyPlayed,
      topTracks4Weeks: topTracks4Weeks,
      topTracks6Months: topTracks6Months,
      topTracksAllTime: topTracksAllTime,
    });

    return NextResponse.json(stats);
  } catch (e) {
    console.error("Stats API error:", e);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
