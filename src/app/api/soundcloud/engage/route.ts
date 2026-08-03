import { NextRequest, NextResponse } from "next/server";
import { emptyStatus, runEngagement } from "@/lib/soundcloudGate";
import { DEFAULT_TRACK_SLUG, getTrackBySlug } from "@/lib/tracks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { headers: { "Cache-Control": "no-store" } };

/**
 * Re-runs the engagement for an already-connected fan. Used by the retry
 * button and when a fan opens a second track without reconnecting.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const requested =
    typeof body?.track === "string" ? body.track : DEFAULT_TRACK_SLUG;
  const trackSlug = getTrackBySlug(requested)?.slug || DEFAULT_TRACK_SLUG;
  const prefs = {
    repost: body?.repost !== false,
    comment:
      typeof body?.comment === "string"
        ? body.comment.trim().slice(0, 300) || undefined
        : undefined
  };

  try {
    return NextResponse.json(await runEngagement(trackSlug, prefs), noStore);
  } catch (error) {
    console.error("[gate] engagement failed", error);
    return NextResponse.json(
      { ...emptyStatus(), error: "engage_failed" },
      noStore
    );
  }
}
