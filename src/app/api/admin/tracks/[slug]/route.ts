import { NextRequest, NextResponse } from "next/server";
import {
  checkFollowTargets,
  deleteTrack,
  findTrack,
  listDbTracks,
  updateTrack
} from "@/lib/trackStore";
import { normalizeFollowTargets } from "@/lib/followTargets";
import { resolveTrackMeta } from "@/lib/soundcloud";
import { slugify, toDownloadUrl } from "@/lib/tracks";

export const dynamic = "force-dynamic";

/** Shown when the database predates the per-gate follow list. */
const MIGRATION_WARNING =
  "Saved — but the follow list needs one more column. Run the SQL in docs/ADMIN_TRACKS_SETUP.md, then set it again.";

const authorized = (request: NextRequest) => {
  const secret = process.env.TRIGGER_SAVES_SECRET;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(secret) && bearer === secret;
};

type EditBody = {
  slug?: string;
  title?: string;
  artworkUrl?: string;
  downloadUrl?: string;
  soundcloudUrl?: string;
  followTargets?: unknown;
};

/**
 * Edits one gate in place. Every field is optional — the admin page sends the
 * whole form, and anything it leaves out keeps its current value. Changing the
 * SoundCloud link re-resolves the track so the gate's like/repost calls keep
 * pointing at the right upload.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const current = await findTrack(params.slug);
  if (!current) {
    return NextResponse.json(
      { error: `No gate at /${params.slug}.` },
      { status: 404 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as EditBody;
  const patch: Parameters<typeof updateTrack>[1] = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "The title can’t be empty." }, { status: 400 });
    }
    patch.title = title.slice(0, 200);
  }

  if (typeof body.artworkUrl === "string") {
    const artwork = body.artworkUrl.trim();
    if (artwork && !/^(https?:\/\/|\/)/.test(artwork)) {
      return NextResponse.json(
        { error: "The artwork must be a link or a path starting with /." },
        { status: 400 }
      );
    }
    patch.artwork_url = artwork || null;
  }

  if (typeof body.downloadUrl === "string") {
    const download = toDownloadUrl(body.downloadUrl);
    if (!download || !/^(https?:\/\/|\/)/.test(download)) {
      return NextResponse.json(
        { error: "The download must be a Google Drive link, a URL, or a /path on the site." },
        { status: 400 }
      );
    }
    patch.download_url = download;
  }

  if (typeof body.soundcloudUrl === "string") {
    const url = body.soundcloudUrl.trim().split(/[?#]/)[0];
    if (!/^https?:\/\/(www\.|on\.|m\.)?soundcloud\.com\/.+\/.+/.test(url)) {
      return NextResponse.json(
        { error: "That doesn’t look like a SoundCloud track link." },
        { status: 400 }
      );
    }
    if (url !== current.soundcloudUrl) {
      // A new link means a new track id — resolve it now so the gate never
      // likes or reposts the wrong upload.
      try {
        const meta = await resolveTrackMeta(url);
        if (meta.kind !== "track" || !meta.id) {
          return NextResponse.json(
            { error: `That link resolves to a ${meta.kind || "nothing"}, not a track.` },
            { status: 400 }
          );
        }
        patch.soundcloud_url = meta.permalinkUrl || url;
        patch.soundcloud_track_id = meta.id;
      } catch (error) {
        console.error("[admin] resolve failed", error);
        return NextResponse.json(
          { error: "SoundCloud couldn’t resolve that link. Is the track public?" },
          { status: 502 }
        );
      }
    }
  }

  if (body.followTargets !== undefined) {
    const submitted = Array.isArray(body.followTargets)
      ? body.followTargets.filter(
          (value): value is string =>
            typeof value === "string" && value.trim() !== ""
        )
      : [];
    const error = await checkFollowTargets(submitted);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    const targets = normalizeFollowTargets(submitted);
    patch.follow_targets = targets.length ? targets : null;
  }

  if (typeof body.slug === "string" && slugify(body.slug) !== params.slug) {
    const slug = slugify(body.slug);
    if (!slug) {
      return NextResponse.json(
        { error: "The link needs at least one letter or number." },
        { status: 400 }
      );
    }
    patch.slug = slug;
  }

  try {
    const { track, followTargetsStored } = await updateTrack(params.slug, patch);
    return NextResponse.json({
      saved: true,
      track,
      warning: followTargetsStored ? undefined : MIGRATION_WARNING
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listDbTracks();
  if (!rows.some((row) => row.slug === params.slug)) {
    return NextResponse.json(
      { error: "Only tracks added from this page can be deleted." },
      { status: 404 }
    );
  }

  try {
    await deleteTrack(params.slug);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed." },
      { status: 500 }
    );
  }
  return NextResponse.json({ deleted: true });
}
