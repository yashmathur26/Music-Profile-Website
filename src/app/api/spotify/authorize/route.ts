import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/spotify";
import { campaign } from "@/config/campaign";
import { features } from "@/config/features";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  if (!features.presave || !campaign.isActive || !campaign.spotify.enabled) {
    return NextResponse.redirect(new URL("/home", req.nextUrl.origin));
  }

  // Preview mode: no Spotify app yet — redirect back to landing
  if (!process.env.SPOTIFY_CLIENT_ID) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
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
