import { NextRequest, NextResponse } from "next/server";
import { emptyStatus, readStatus } from "@/lib/soundcloudGate";
import { DEFAULT_TRACK_SLUG, getTrackBySlug } from "@/lib/tracks";

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("track") || DEFAULT_TRACK_SLUG;
  const trackSlug = getTrackBySlug(requested)?.slug || DEFAULT_TRACK_SLUG;

  try {
    return NextResponse.json(await readStatus(trackSlug), noStore);
  } catch (error) {
    console.error("[gate] status lookup failed", error);
    return NextResponse.json(
      { ...emptyStatus(), error: "status_failed" },
      noStore
    );
  }
}
