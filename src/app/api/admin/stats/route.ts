import { NextRequest, NextResponse } from "next/server";
import { buildStatsReport } from "@/lib/statsReport";
import { latestSnapshot, takeSnapshot } from "@/lib/statsSnapshot";

/** The tab refreshes itself on open; this stops a burst of reloads from
 * re-walking every fan on SoundCloud each time. */
const AUTO_REFRESH_MIN_AGE_MS = 2 * 60_000;

export const dynamic = "force-dynamic";
// The refresh walks every downloader on SoundCloud.
export const maxDuration = 300;

/** Same credential as every other admin route. */
const authorized = (request: NextRequest) => {
  const secret = process.env.TRIGGER_SAVES_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const key = request.nextUrl.searchParams.get("key") || "";
  return bearer === secret || key === secret;
};

/** Everything the Stats tab draws. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await buildStatsReport(), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("[stats] report failed", error);
    return NextResponse.json({ error: "Couldn't build the stats." }, { status: 500 });
  }
}

/**
 * "Refresh SoundCloud now" — the same snapshot the daily cron takes, on
 * demand. It replaces today's row rather than adding one, so pressing it
 * twice is harmless.
 *
 * `?auto=1` is the tab refreshing itself on load: it does nothing when a
 * snapshot finished in the last two minutes. The button never sends it, so
 * pressing the button always refreshes.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (request.nextUrl.searchParams.get("auto") === "1") {
      const latest = await latestSnapshot();
      const age = latest ? Date.now() - Date.parse(latest.data.takenAt) : Infinity;
      if (age < AUTO_REFRESH_MIN_AGE_MS) {
        return NextResponse.json({ ok: true, skipped: true, takenAt: latest?.data.takenAt });
      }
    }
    const snapshot = await takeSnapshot();
    return NextResponse.json({
      ok: true,
      takenAt: snapshot.takenAt,
      fans: Object.keys(snapshot.fans).length,
      partial: snapshot.partial,
      errors: snapshot.errors
    });
  } catch (error) {
    console.error("[stats] snapshot failed", error);
    const missingTable = /stats_snapshots/.test(String((error as { message?: string })?.message || error));
    return NextResponse.json(
      {
        error: missingTable
          ? "The stats_snapshots table doesn't exist yet — run the SQL in docs/ADMIN_STATS_SETUP.md."
          : "SoundCloud refresh failed. Try again in a minute."
      },
      { status: 500 }
    );
  }
}
