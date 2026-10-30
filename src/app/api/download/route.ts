import { NextResponse } from "next/server";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { findTrack } from "@/lib/trackStore";
import { recordDownload } from "@/lib/downloadLog";
import { queueStatsRefresh } from "@/lib/statsRefresh";
import { readGate, writeGate } from "@/lib/gateStore";
import { fetchMe, numericId } from "@/lib/soundcloud";
import { likeOtherSongs } from "@/lib/soundcloudGate";
import { artistId } from "@/lib/fanScreen";
import { issueTicket } from "@/lib/downloadTicket";
import {
  DownloadGateState,
  countryFrom,
  logGateEvent
} from "@/lib/gateEvents";

/**
 * Whether the server itself saw this fan unlock the gate: the follows went
 * through (or were verified with a read) during an engagement run, which is
 * recorded in the gate cookie. That cookie is encrypted and authenticated
 * with a server-only key, so it can't be edited or forged in the browser —
 * nothing the page says, and nothing typed into the console, counts.
 */
const unlockedOnServer = async (slug: string) => {
  const gate = readGate();
  const uid = numericId(gate.userId);
  if (!gate.accessToken || !uid) return null;
  if (gate.engagement?.[slug]?.followed) return uid;
  // The artist opening their own gate has nothing to follow.
  try {
    if (uid === (await artistId())) return uid;
  } catch {
    /* can't tell, so treat them like anyone else */
  }
  return null;
};

/**
 * Hands out a download for a track — but only to a fan the server saw unlock
 * it, and never the file's real address: the reply is a short-lived ticket to
 * /api/download/file, which streams the file and only works for this fan.
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

    const uid = await unlockedOnServer(track.slug);
    if (!uid) {
      return NextResponse.json(
        { error: "Connect SoundCloud and unlock the download first." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
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

    // The songs the artist wants liked on every download, from this fan's
    // own connection — the gate told them which before they pressed the
    // button. Never fails the download.
    const alsoLiked = await likeOtherSongs(track.slug).catch((error) => {
      console.error("[download] cross-like failed", error);
      return [] as string[];
    });
    queueStatsRefresh();

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
      detail: { gate: gateState, ...(alsoLiked.length ? { alsoLiked } : {}) }
    });

    return NextResponse.json(
      {
        url: `/api/download/file?t=${issueTicket(track.slug, uid)}`,
        title: track.title
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
