import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeStatsCodeForTokens } from "@/lib/spotifyStatsAuth";
import { createStatsSession } from "@/lib/statsSession";
import { getSpotifyUserId } from "@/lib/spotify";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("spotify_stats_state")?.value;
  const returnTo = cookieStore.get("spotify_stats_return")?.value || "/stats";
  const baseUrl = req.nextUrl.origin;

  if (!code || !state || state !== savedState) {
    const res = NextResponse.redirect(new URL("/stats?error=access_denied", baseUrl));
    res.cookies.set("spotify_stats_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("spotify_stats_return", "", { maxAge: 0, path: "/" });
    return res;
  }

  try {
    const tokens = await exchangeStatsCodeForTokens(code);
    const userId = await getSpotifyUserId(tokens.access_token);
    const sessionId = nanoid(32);
    await createStatsSession({
      id: sessionId,
      spotify_user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
    const res = NextResponse.redirect(new URL(returnTo.startsWith("/") ? returnTo : "/stats", baseUrl));
    res.cookies.set("spotify_stats_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("spotify_stats_return", "", { maxAge: 0, path: "/" });
    res.cookies.set("yvsh_stats_session", sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    console.error("Stats callback error:", e);
    const res = NextResponse.redirect(new URL("/stats?error=auth_failed", baseUrl));
    res.cookies.set("spotify_stats_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("spotify_stats_return", "", { maxAge: 0, path: "/" });
    return res;
  }
}
