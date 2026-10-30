import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { buildAuthUrl, createPkcePair, soundcloudConfigured } from "@/lib/soundcloud";
import { setOauthHandoff } from "@/lib/session";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";

export const dynamic = "force-dynamic";

/**
 * "Sign in with SoundCloud to turn it off" on /unsubscribe, for a fan who has
 * neither their personal link nor the browser they downloaded in.
 *
 * Signing in proves which account they are, which is all the off switch
 * needs. It goes through the gate's own callback (SoundCloud only allows the
 * one redirect address), marked so the callback switches them off and does
 * nothing else — no follow, no like, and no token kept.
 */
export async function GET(request: Request) {
  if (!soundcloudConfigured()) {
    return NextResponse.redirect(new URL("/unsubscribe?signed=error", request.url));
  }
  const state = nanoid();
  const { verifier, challenge } = createPkcePair();
  setOauthHandoff(state, verifier, DEFAULT_TRACK_SLUG, {
    repost: false,
    purpose: "unsubscribe"
  });
  return NextResponse.redirect(buildAuthUrl(state, challenge));
}
