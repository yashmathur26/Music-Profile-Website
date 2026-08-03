import { NextResponse } from "next/server";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { findTrack } from "@/lib/trackStore";

/**
 * Resolves a track slug to its download URL.
 *
 * The gate calls this instead of reading the URL out of the client bundle, so
 * the link for every track goes through one place that can validate the slug
 * and report a usable error.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const slug =
      typeof body?.track === "string" && body.track.trim()
        ? body.track.trim()
        : DEFAULT_TRACK_SLUG;
    const track = await findTrack(slug);

    if (!track) {
      return NextResponse.json(
        { error: "That track doesn’t exist." },
        { status: 404 }
      );
    }

    if (!track.downloadUrl) {
      return NextResponse.json(
        { error: "This track has no download link yet." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        url: track.downloadUrl,
        title: track.title,
        // Local files can carry a download filename; cross-origin ones can't.
        local: track.downloadUrl.startsWith("/")
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Download failed. Please try again." },
      { status: 500 }
    );
  }
}
