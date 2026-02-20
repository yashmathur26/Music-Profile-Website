import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, getSpotifyUserId } from "@/lib/spotify";
import { insertPresave, getPresaveByCampaignAndUser, updatePresaveRefreshToken } from "@/lib/presaves";
import { campaign, getCampaignId } from "@/config/campaign";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("spotify_oauth_state")?.value;
  const returnTo = cookieStore.get("spotify_return_to")?.value || "/presave/success";

  const baseUrl = req.nextUrl.origin;
  const errorUrl = new URL("/", baseUrl);
  errorUrl.searchParams.set("error", "oauth_failed");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(errorUrl);
  }

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
    return NextResponse.redirect(errorUrl);
  }

  const redirectUrl = new URL(returnTo.startsWith("/") ? returnTo : `/presave/success`, baseUrl);
  if (alreadyPresaved) redirectUrl.searchParams.set("already", "1");

  const res = NextResponse.redirect(redirectUrl);

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
