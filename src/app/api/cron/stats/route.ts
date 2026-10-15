import { NextRequest, NextResponse } from "next/server";
import { takeSnapshot } from "@/lib/statsSnapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The daily SoundCloud snapshot behind the Stats tab — see
 * lib/statsSnapshot.ts. A separate cron from /api/cron/subscribers on
 * purpose: this only ever uses the app's own token, never a fan's, so it
 * can't collide with that job's single-use refresh tokens.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await takeSnapshot();
    return NextResponse.json({
      ok: true,
      takenAt: snapshot.takenAt,
      tracks: Object.keys(snapshot.tracks).length,
      fans: Object.keys(snapshot.fans).length,
      partial: snapshot.partial,
      errors: snapshot.errors.length
    });
  } catch (error) {
    console.error("[stats-cron] snapshot failed", error);
    return NextResponse.json({ error: "Snapshot failed." }, { status: 503 });
  }
}
