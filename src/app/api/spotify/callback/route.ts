import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, getSpotifyUserId } from "@/lib/spotify";
import { insertPresave } from "@/lib/presaves";
import { campaign, getCampaignId } from "@/config/campaign";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("spotify_oauth_state")?.value;
  const returnTo = cookieStore.get("spotify_return_to")?.value || "/presave/success";

  const baseUrl = req.nextUrl.origin;
  const errorUrl = new URL("/presave", baseUrl);
  errorUrl.searchParams.set("error", "oauth_failed");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(errorUrl);
  }

  try {
    const { access_token, refresh_token } = await exchangeCodeForTokens(code);
    const spotifyUserId = await getSpotifyUserId(access_token);
    const campaignId = getCampaignId(campaign);

    await insertPresave({
      campaign_id: campaignId,
      spotify_user_id: spotifyUserId,
      refresh_token,
    });
  } catch (e) {
    console.error("Spotify callback error:", e);
    return NextResponse.redirect(errorUrl);
  }

  const redirectUrl = new URL(returnTo.startsWith("/") ? returnTo : `/presave/success`, baseUrl);
  const res = NextResponse.redirect(redirectUrl);

  res.cookies.set("spotify_oauth_state", "", { maxAge: 0, path: "/" });
  res.cookies.set("spotify_return_to", "", { maxAge: 0, path: "/" });
  return res;
}
