import { NextResponse } from "next/server";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { findTrack } from "@/lib/trackStore";
import { recordDownload } from "@/lib/downloadLog";
import { readGate, writeGate } from "@/lib/gateStore";
import { fetchMe } from "@/lib/soundcloud";
import {
  DownloadGateState,
  countryFrom,
  logGateEvent
} from "@/lib/gateEvents";

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

    // Awaited on purpose: a serverless host freezes the function once the response is
    // sent, so a fire-and-forget insert never lands. recordDownload never
    // throws, so the download can't fail because of it.
    const gate = readGate();
    let profileUrl = gate.profileUrl;
    // Fans who connected before profile links existed have a cookie without
    // one — backfill it from their token so their history rows link too.
    if (!profileUrl && gate.accessToken) {
      try {
        profileUrl = (await fetchMe(gate.accessToken)).permalinkUrl || undefined;
        if (profileUrl) writeGate({ profileUrl });
      } catch {
        /* an expired token just means an unlinked row */
      }
    }
    await recordDownload(track.slug, gate.username, profileUrl);

    // What the server could see of how this visitor got here. This route
    // doesn't refuse anyone yet, so this is how a bypass shows up: a download
    // with no SoundCloud connection and no manual-route event before it.
    const connected = Boolean(gate.accessToken || gate.userId);
    const gateState: DownloadGateState = !connected
      ? "no_connection"
      : gate.engagement?.[track.slug]?.followed
        ? "unlocked"
        : "connected_not_unlocked";
    await logGateEvent({
      kind: "download",
      trackSlug: track.slug,
      scUsername: gate.username,
      country: countryFrom(request.headers),
      detail: { gate: gateState }
    });

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
