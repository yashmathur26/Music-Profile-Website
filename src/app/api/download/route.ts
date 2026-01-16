import { NextResponse } from "next/server";
import { DEFAULT_TRACK_SLUG, getTrackBySlug } from "@/lib/tracks";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug =
      typeof body?.track === "string" ? body.track : DEFAULT_TRACK_SLUG;
    const track = getTrackBySlug(slug);
    
    if (!track) {
      return NextResponse.json({ error: "Unknown track." }, { status: 404 });
    }

    if (!track.downloadUrl) {
      return NextResponse.json(
        { error: "Download not configured for this track." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: track.downloadUrl });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Download failed. Please try again." },
      { status: 500 }
    );
  }
}
