import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getSpotifyUserId, verifySignedState } from "@/lib/spotify";
import { insertPresave, getPresaveByCampaignAndUser, updatePresaveRefreshToken } from "@/lib/presaves";
import { campaign, getCampaignId } from "@/config/campaign";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = req.nextUrl.origin;
  // Redirect errors to /presave so user sees "Sign-in didn't complete. Please try again" and can retry
  const presaveUrl = new URL("/presave", baseUrl);

  // If Spotify returned an error (e.g., user denied access)
  if (error) {
    console.log("Spotify returned error:", error);
    presaveUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(presaveUrl);
  }

  // No code in URL = not a real OAuth return (e.g. user opened callback link directly).
  if (!code) {
    const res = NextResponse.redirect(presaveUrl);
    res.cookies.set("spotify_oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("spotify_return_to", "", { maxAge: 0, path: "/" });
    return res;
  }

  // Verify signed state (no cookies — works with ad/cookie blockers).
  const parsed = state ? verifySignedState(state) : null;
  if (!parsed) {
    console.log("Invalid or expired state");
    presaveUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(presaveUrl);
  }
  const returnTo = parsed.returnTo;

  let presaveId: string | null = null;
  let alreadyPresaved = false;
  try {
    const { access_token, refresh_token } = await exchangeCodeForTokens(code);
    const spotifyUserId = await getSpotifyUserId(access_token);
    const campaignId = getCampaignId(campaign);

    const existing = await getPresaveByCampaignAndUser(campaignId, spotifyUserId);
    if (existing) {
      presaveId = existing.id;
      alreadyPresaved = true;
      await updatePresaveRefreshToken(existing.id, refresh_token);
    } else {
      presaveId = await insertPresave({
        campaign_id: campaignId,
        spotify_user_id: spotifyUserId,
        refresh_token,
      });
    }
  } catch (e) {
    console.error("Spotify callback error:", e);
    presaveUrl.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(presaveUrl);
  }

  const redirectUrl = new URL(returnTo.startsWith("/") ? returnTo : `/presave/success`, baseUrl);
  if (alreadyPresaved) redirectUrl.searchParams.set("already", "1");

  // Use 303 so client does a fresh GET (avoids redirect caching issues)
  const res = NextResponse.redirect(redirectUrl, 303);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

  // Clear any old OAuth cookies (state is now in URL; this just cleans up).
  res.cookies.set("spotify_oauth_state", "", { maxAge: 0, path: "/" });
  res.cookies.set("spotify_return_to", "", { maxAge: 0, path: "/" });
  if (presaveId) {
    res.cookies.set("presave_id", presaveId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}
