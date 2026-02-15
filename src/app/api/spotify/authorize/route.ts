import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/spotify";
import { campaign } from "@/config/campaign";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  if (!campaign.isActive || !campaign.spotify.enabled) {
    return NextResponse.redirect(new URL("/presave", req.url));
  }

  // Preview mode: no Spotify app yet — redirect back so you can see the presave page without errors
  if (!process.env.SPOTIFY_CLIENT_ID) {
    const presaveUrl = new URL("/presave", req.nextUrl.origin);
    presaveUrl.searchParams.set("preview", "1");
    return NextResponse.redirect(presaveUrl);
  }

  const state = randomBytes(16).toString("hex");
  const searchParams = new URLSearchParams(req.nextUrl.search);
  const returnTo = searchParams.get("returnTo") || "/presave/success";

  const url = getAuthorizeUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set("spotify_oauth_state", state, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 600 });
  res.cookies.set("spotify_return_to", returnTo, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 600 });
  return res;
}
