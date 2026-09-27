import { NextRequest, NextResponse } from "next/server";
import { resolveTrackMeta } from "@/lib/soundcloud";
import {
  checkFollowTargets,
  getAllTracks,
  insertTrack,
  listDbTracks
} from "@/lib/trackStore";
import { normalizeFollowTargets } from "@/lib/followTargets";
import {
  driveFileId,
  getTrackPermalink,
  slugify,
  tracks as staticTracks
} from "@/lib/tracks";

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

export async function GET(request: NextRequest) {
  if (!authorized(request)) return unauthorized();
  const [rows, all] = await Promise.all([listDbTracks(), getAllTracks()]);
  const dbSlugs = new Set(rows.map((row) => row.slug));
  return NextResponse.json({
    tracks: all.map((track) => ({
      slug: track.slug,
      title: track.title,
      artworkUrl: track.artworkUrl,
      downloadUrl: track.downloadUrl,
      // Static tracks keep their permalink inside the embed URL.
      soundcloudUrl: getTrackPermalink(track),
      // Empty means "nobody set a list" — the gate follows the artist.
      followTargets: track.followTargets || [],
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
    followTargets?: unknown;
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

  // Who this particular song's gate follows. Blank rows are fine — the gate
  // falls back to the artist's own profile.
  const submittedTargets = Array.isArray(body.followTargets)
    ? body.followTargets.filter(
        (value): value is string =>
          typeof value === "string" && value.trim() !== ""
      )
    : [];
  const targetsError = await checkFollowTargets(submittedTargets);
  if (targetsError) {
    return NextResponse.json({ error: targetsError }, { status: 400 });
  }
  const followTargets = normalizeFollowTargets(submittedTargets);

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
    soundcloud_track_id: meta.id,
    follow_targets: followTargets.length ? followTargets : null
  };

  if (body.preview) {
    return NextResponse.json({ preview: true, track: row });
  }

  let followTargetsStored = true;
  try {
    ({ followTargetsStored } = await insertTrack(row));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Insert failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    created: true,
    track: row,
    path: `/${slug}`,
    warning: followTargetsStored
      ? undefined
      : "Saved — but the follow list needs one more column. Run the SQL in docs/ADMIN_TRACKS_SETUP.md, then set it again."
  });
}
