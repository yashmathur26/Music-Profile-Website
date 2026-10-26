import { NextRequest, NextResponse } from "next/server";
import {
  LEAVE_ALONE,
  LEFT_ALONE_PREFIX,
  ScProfile,
  artistId,
  loadArtistFollowings,
  loadProfile,
  screenProfile
} from "@/lib/fanScreen";
import {
  listAllActions,
  listAllSubscribers,
  subscriptionsConfigured
} from "@/lib/releaseSubscribers";
import { appGet, appGetAll, numericId } from "@/lib/soundcloud";
import { getAllTracks } from "@/lib/trackStore";
import { TrackConfig, getTrackPermalink } from "@/lib/tracks";
import type { SavedFan, SavedFansPayload } from "@/lib/savedFansTypes";

export const dynamic = "force-dynamic";

/** Same credential as every other admin route. */
const authorized = (request: NextRequest) => {
  const secret = process.env.TRIGGER_SAVES_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const key = request.nextUrl.searchParams.get("key") || "";
  return bearer === secret || key === secret;
};

type ScItem = { id?: number | string; urn?: string };
const ids = (items: ScItem[]) => new Set(items.map((i) => numericId(i.id ?? i.urn)));

const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

const trackIdFor = async (track: TrackConfig) => {
  const direct = numericId(track.soundcloudTrackId);
  if (direct) return direct;
  const permalink = getTrackPermalink(track);
  if (!permalink) return "";
  const meta = await appGet<ScItem>(`/resolve?url=${encodeURIComponent(permalink)}`);
  return numericId(meta.id ?? meta.urn);
};

/**
 * Everyone the site has saved, and what that means on SoundCloud right now.
 *
 * The database says what a release did; this also asks SoundCloud whether it
 * is still there — a fan can unlike or un-repost by hand at any time — and
 * runs the same leave-alone check the release itself runs. All on the app's
 * own token: no fan's credentials are touched to draw this page.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!subscriptionsConfigured()) {
    return NextResponse.json({ error: "Supabase isn't configured." }, { status: 503 });
  }

  let subscribers, actions, tracks;
  try {
    [subscribers, actions, tracks] = await Promise.all([
      listAllSubscribers(),
      listAllActions(),
      getAllTracks()
    ]);
  } catch (error) {
    console.error("[fans] could not load saved fans", error);
    return NextResponse.json({ error: "Couldn't load your saved fans." }, { status: 500 });
  }

  const bySlug = new Map(tracks.map((t) => [t.slug, t]));
  const relevantSlugs = new Set([
    ...actions.map((a) => a.track_slug),
    ...subscribers.map((s) => s.source_track_slug).filter((s): s is string => Boolean(s))
  ]);

  // Live answers from SoundCloud. Any of it failing leaves those columns
  // blank rather than failing the page — the database half still stands.
  let liveError: string | null = null;
  let following = new Set<string>();
  let followers: Set<string> | null = null;
  const likers = new Map<string, Set<string>>();
  const reposters = new Map<string, Set<string>>();
  const profiles = new Map<string, ScProfile | null>();
  try {
    const me = await artistId();
    [following, followers] = await Promise.all([
      loadArtistFollowings(),
      appGetAll<ScItem>(`/users/${me}/followers`).then(ids)
    ]);
    await mapLimit([...relevantSlugs], 3, async (slug) => {
      const track = bySlug.get(slug);
      if (!track) return;
      const id = await trackIdFor(track);
      if (!id) return;
      const [l, r] = await Promise.all([
        appGetAll<ScItem>(`/tracks/${id}/favoriters`),
        appGetAll<ScItem>(`/tracks/${id}/reposters`)
      ]);
      likers.set(slug, ids(l));
      reposters.set(slug, ids(r));
    });
    const active = subscribers.filter((s) => !s.revoked_at);
    await mapLimit(active, 6, async (fan) => {
      profiles.set(fan.sc_user_id, await loadProfile(fan.sc_user_id));
    });
  } catch (error) {
    console.error("[fans] SoundCloud lookup failed", error);
    liveError = "SoundCloud didn't answer, so the live columns are blank. Try again in a minute.";
  }

  const live = !liveError;
  const fans: SavedFan[] = subscribers.map((fan) => {
    const profile = profiles.get(fan.sc_user_id);
    const ended = Boolean(fan.revoked_at);
    const screen = !ended && live && profiles.has(fan.sc_user_id)
      ? screenProfile(profile ?? null, following)
      : null;
    const title = (slug: string) => bySlug.get(slug)?.title || slug;
    const has = (map: Map<string, Set<string>>, slug: string) =>
      live && map.has(slug) ? map.get(slug)!.has(fan.sc_user_id) : null;

    return {
      id: fan.id,
      username: profile?.username || fan.sc_username || "Unknown",
      profileUrl: profile?.permalinkUrl || fan.sc_profile_url,
      avatarUrl: profile?.avatarUrl || null,
      followers: profile?.followers ?? null,
      uploads: profile?.uploads ?? null,
      savedAt: fan.created_at,
      fromSong: fan.source_track_slug ? title(fan.source_track_slug) : null,
      status: ended ? "ended" : screen && !screen.ok ? "left_alone" : "ready",
      leaveAloneReason: screen && !screen.ok ? screen.reason : null,
      lastCheckedAt: fan.last_refreshed_at,
      endedAt: fan.revoked_at,
      endedReason: fan.revoked_reason,
      followsYou: followers ? followers.has(fan.sc_user_id) : null,
      likesDownloadedSong: fan.source_track_slug ? has(likers, fan.source_track_slug) : null,
      releases: actions
        .filter((a) => a.subscriber_id === fan.id)
        .map((a) => ({
          slug: a.track_slug,
          title: title(a.track_slug),
          liked: a.liked,
          reposted: a.reposted,
          leftAlone: Boolean(a.error?.startsWith(LEFT_ALONE_PREFIX)),
          error: a.error?.startsWith(LEFT_ALONE_PREFIX) ? null : a.error,
          removeAfter: a.remove_after,
          removedAt: a.removed_at,
          likedNow: has(likers, a.track_slug),
          repostedNow: has(reposters, a.track_slug)
        }))
    };
  });

  const payload: SavedFansPayload = {
    checkedAt: new Date().toISOString(),
    rules: { followers: LEAVE_ALONE.followers, uploads: LEAVE_ALONE.uploads },
    liveError,
    fans
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
