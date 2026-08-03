import { NextRequest, NextResponse } from "next/server";
import { resolveTrackMeta } from "@/lib/soundcloud";
import {
  getAllTracks,
  insertTrack,
  listDbTracks
} from "@/lib/trackStore";
import { tracks as staticTracks } from "@/lib/tracks";

export const dynamic = "force-dynamic";

/** Same credential as the presave dashboard — one admin secret for the site. */
const authorized = (request: NextRequest) => {
  const secret = process.env.TRIGGER_SAVES_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const key = request.nextUrl.searchParams.get("key") || "";
  return bearer === secret || key === secret;
};

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/**
 * Accepts every Drive link shape an artist actually pastes:
 * .../file/d/<id>/view, open?id=<id>, uc?id=<id>, or a bare id.
 */
const driveFileId = (input: string) => {
  const trimmed = input.trim();
  const patterns = [
    /\/file\/d\/([A-Za-z0-9_-]{10,})/,
    /[?&]id=([A-Za-z0-9_-]{10,})/,
    /^([A-Za-z0-9_-]{25,})$/
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export async function GET(request: NextRequest) {
  if (!authorized(request)) return unauthorized();
  const [rows, all] = await Promise.all([listDbTracks(), getAllTracks()]);
  const dbSlugs = new Set(rows.map((row) => row.slug));
  return NextResponse.json({
    tracks: all.map((track) => ({
      slug: track.slug,
      title: track.title,
      artworkUrl: track.artworkUrl,
      // Static tracks ship in the bundle; only DB rows can be deleted here.
      deletable: dbSlugs.has(track.slug)
    }))
  });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    driveUrl?: string;
    soundcloudUrl?: string;
    preview?: boolean;
  };

  const driveUrl = (body.driveUrl || "").trim();
  const soundcloudUrl = (body.soundcloudUrl || "").trim();
  if (!driveUrl || !soundcloudUrl) {
    return NextResponse.json(
      { error: "Both the Google Drive link and the SoundCloud link are required." },
      { status: 400 }
    );
  }

  const fileId = driveFileId(driveUrl);
  if (!fileId) {
    return NextResponse.json(
      { error: "Couldn’t find a file id in that Google Drive link." },
      { status: 400 }
    );
  }

  if (!/^https?:\/\/(www\.|on\.|m\.)?soundcloud\.com\/.+\/.+/.test(soundcloudUrl)) {
    return NextResponse.json(
      { error: "That doesn’t look like a SoundCloud track link." },
      { status: 400 }
    );
  }

  let meta;
  try {
    meta = await resolveTrackMeta(soundcloudUrl);
  } catch (error) {
    console.error("[admin] resolve failed", error);
    return NextResponse.json(
      { error: "SoundCloud couldn’t resolve that link. Is the track public?" },
      { status: 502 }
    );
  }
  if (meta.kind !== "track" || !meta.id) {
    return NextResponse.json(
      { error: `That link resolves to a ${meta.kind || "nothing"}, not a track.` },
      { status: 400 }
    );
  }

  const permalink = meta.permalinkUrl || soundcloudUrl;
  const base =
    slugify(permalink.split("/").filter(Boolean).pop() || "") ||
    slugify(meta.title) ||
    `track-${meta.id}`;

  // Static slugs are taken forever; DB slugs free up when deleted.
  const existing = new Set([
    ...staticTracks.map((track) => track.slug),
    ...(await listDbTracks()).map((row) => row.slug)
  ]);
  let slug = base;
  for (let n = 2; existing.has(slug); n += 1) {
    slug = `${base}-${n}`;
  }

  const row = {
    slug,
    title: meta.title,
    artwork_url: meta.artworkUrl || null,
    download_url: `https://drive.google.com/uc?export=download&id=${fileId}`,
    soundcloud_url: permalink,
    soundcloud_track_id: meta.id
  };

  if (body.preview) {
    return NextResponse.json({ preview: true, track: row });
  }

  try {
    await insertTrack(row);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Insert failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ created: true, track: row, path: `/${slug}` });
}
