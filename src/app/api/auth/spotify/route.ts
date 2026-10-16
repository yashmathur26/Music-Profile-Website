import { NextRequest, NextResponse } from "next/server";
import { getStatsAuthorizeUrl } from "@/lib/spotifyStatsAuth";
import { features } from "@/config/features";
import { randomBytes } from "crypto";
import { siteOrigin } from "@/lib/siteOrigin";

export async function GET(req: NextRequest) {
  if (!features.stats) {
    return NextResponse.redirect(new URL("/home", siteOrigin(req)));
  }
  if (!process.env.SPOTIFY_CLIENT_ID) {
    return NextResponse.redirect(new URL("/stats?error=config", siteOrigin(req)));
  }
  const state = randomBytes(16).toString("hex");
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/stats";
  const res = NextResponse.redirect(getStatsAuthorizeUrl(state));
  res.cookies.set("spotify_stats_state", state, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 600 });
  res.cookies.set("spotify_stats_return", returnTo, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 600 });
  return res;
}
