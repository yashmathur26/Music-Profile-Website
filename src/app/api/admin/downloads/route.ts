import { NextRequest, NextResponse } from "next/server";
import { listDownloads } from "@/lib/downloadLog";
import { getAllTracks } from "@/lib/trackStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.TRIGGER_SAVES_SECRET;
  const key = request.nextUrl.searchParams.get("key") || "";
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || (key !== secret && bearer !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("limit")) || 12, 1),
    500
  );
  const track = request.nextUrl.searchParams.get("track") || undefined;
  const [{ total, rows }, tracks] = await Promise.all([
    listDownloads(limit, track),
    getAllTracks()
  ]);
  const titles = new Map(tracks.map((track) => [track.slug, track.title]));

  return NextResponse.json({
    total,
    recent: rows.map((row) => ({
      trackSlug: row.track_slug,
      title: titles.get(row.track_slug) || row.track_slug,
      username: row.sc_username,
      profileUrl: row.sc_profile_url || null,
      at: row.created_at
    }))
  });
}
