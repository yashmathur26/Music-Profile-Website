import { NextRequest, NextResponse } from "next/server";
import { getAuthorizeUrl, createSignedState } from "@/lib/spotify";
import { campaign } from "@/config/campaign";
import { features } from "@/config/features";

export async function GET(req: NextRequest) {
  if (!features.presave || !campaign.isActive || !campaign.spotify.enabled) {
    return NextResponse.redirect(new URL("/home", req.nextUrl.origin));
  }

  // Preview mode: no Spotify app yet — redirect back to landing
  if (!process.env.SPOTIFY_CLIENT_ID) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  const searchParams = new URLSearchParams(req.nextUrl.search);
  const returnTo = searchParams.get("returnTo") || "/presave/success";
  const state = createSignedState(returnTo);

  const url = getAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
