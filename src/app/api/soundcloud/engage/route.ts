import { NextRequest, NextResponse } from "next/server";
import { emptyStatus, runEngagement } from "@/lib/soundcloudGate";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { findTrack } from "@/lib/trackStore";
import { countryFrom, logGateEvent } from "@/lib/gateEvents";

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

/**
 * Re-runs the engagement for an already-connected fan. Used by the retry
 * button and when a fan opens a second track without reconnecting.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const requested =
    typeof body?.track === "string" ? body.track : DEFAULT_TRACK_SLUG;
  const trackSlug = (await findTrack(requested))?.slug || DEFAULT_TRACK_SLUG;
  const prefs = {
    repost: body?.repost !== false,
    comment:
      typeof body?.comment === "string"
        ? body.comment.trim().slice(0, 300) || undefined
        : undefined
  };

  try {
    const status = await runEngagement(trackSlug, prefs);
    if (status.unlocked) {
      await logGateEvent({
        kind: "unlock",
        trackSlug,
        scUsername: status.username,
        country: countryFrom(request.headers),
        detail: { via: "returning", liked: status.liked, reposted: status.reposted }
      });
    }
    return NextResponse.json(status, noStore);
  } catch (error) {
    console.error("[gate] engagement failed", error);
    return NextResponse.json(
      { ...emptyStatus(), error: "engage_failed" },
      noStore
    );
  }
}
