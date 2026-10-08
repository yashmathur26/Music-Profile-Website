import { NextRequest, NextResponse } from "next/server";
import { announceRelease } from "@/lib/releaseRun";

export const dynamic = "force-dynamic";
// Hundreds of fans x two API calls each — the longest-running thing in the
// app. `limit` exists so a big list can be worked through in chunks that each
// finish inside the platform's ceiling.
export const maxDuration = 300;

/**
 * Likes and reposts a release on behalf of every fan who opted in, right now.
 *
 * The admin portal's checkbox goes through the queue instead (see
 * /api/cron/process-announcements); this is the manual escape hatch:
 *
 *   curl -X POST https://yvshmusic.com/api/releases/announce \
 *     -H "Authorization: Bearer $RELEASE_TRIGGER_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"track":"new-song-slug"}'
 *
 * Safe to re-run: each fan's result is recorded per release, and an
 * already-actioned fan is skipped rather than actioned twice.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RELEASE_TRIGGER_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const slug = typeof body?.track === "string" ? body.track.trim() : "";
  if (!slug) {
    return NextResponse.json(
      { error: 'Pass the release as {"track":"<slug>"}.' },
      { status: 400 }
    );
  }

  const result = await announceRelease({
    slug,
    dryRun: body?.dryRun === true,
    limit:
      typeof body?.limit === "number" && body.limit > 0
        ? Math.floor(body.limit)
        : null
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { summary } = result;
  return NextResponse.json({
    ...summary,
    ...(summary.abortedReason === "api_blocked"
      ? {
          note:
            "SoundCloud answered with 403 repeatedly — the write API is " +
            "likely paused. Nothing further was attempted; re-run later, " +
            "it picks up where it stopped."
        }
      : {})
  });
}
