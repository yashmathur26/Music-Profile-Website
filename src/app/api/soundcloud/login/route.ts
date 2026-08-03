import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import {
  buildAuthUrl,
  createPkcePair,
  soundcloudConfigured
} from "@/lib/soundcloud";
import { getOrCreateSessionId, setOauthHandoff } from "@/lib/session";
import { popupResponse } from "@/lib/popupResponse";
import { DEFAULT_TRACK_SLUG, getTrackBySlug } from "@/lib/tracks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("track") || DEFAULT_TRACK_SLUG;
  const trackSlug = getTrackBySlug(requested)?.slug || DEFAULT_TRACK_SLUG;

  if (!soundcloudConfigured()) {
    return popupResponse(
      { ok: false, reason: "unconfigured" },
      `/${trackSlug}?sc=unconfigured`
    );
  }

  getOrCreateSessionId();

  // The fan picks these before the popup opens; the callback reads them back.
  const repost = searchParams.get("repost") !== "0";
  const comment = (searchParams.get("comment") || "").trim().slice(0, 300);

  const state = nanoid();
  const { verifier, challenge } = createPkcePair();
  setOauthHandoff(state, verifier, trackSlug, {
    repost,
    comment: comment || undefined
  });

  return NextResponse.redirect(buildAuthUrl(state, challenge));
}
