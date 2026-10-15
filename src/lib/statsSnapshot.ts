import { createServerSupabase } from "@/lib/supabaseServer";
import {
  SoundcloudApiError,
  appGet,
  appGetAll,
  numericId
} from "@/lib/soundcloud";
import { getAllTracks } from "@/lib/trackStore";
import { ARTIST_SOUNDCLOUD_URL, getTrackPermalink } from "@/lib/tracks";

/**
 * The once-a-day picture of everything that only SoundCloud knows.
 *
 * The downloads table records the moment a file went out; it can't say
 * whether that fan still follows you a month later, or how many plays a song
 * has picked up since. So once a day this asks SoundCloud — on the app's own
 * token, never a fan's — and stores the answer as one row per day. The Stats
 * tab draws its "over time" charts from the run of rows, and its
 * retention/bypass checks from the newest one.
 *
 * It costs a fixed handful of paged reads (your followers, each song's
 * likers) plus one lookup per fan who has ever downloaded. Day-to-day state
 * that matters — when someone stopped following — is carried forward from
 * the previous row, so the history survives without keeping every day's
 * full fan list around to diff.
 */

export type TrackSnapshot = {
  id: string;
  title: string;
  plays: number;
  likes: number;
  reposts: number;
  comments: number;
  /** SoundCloud's own download counter — separate from the gate's. */
  scDownloads: number;
};

export type FanSnapshot = {
  id: string;
  username: string;
  avatarUrl: string | null;
  permalinkUrl: string;
  followers: number;
  followings: number;
  tracks: number;
  city: string | null;
  country: string | null;
  /** This is your own account downloading — kept out of every fan stat. */
  isArtist: boolean;
  followsArtist: boolean;
  /** The first day we saw them not following, carried forward while it
   * stays true. Null while they follow. */
  notFollowingSince: string | null;
  /** Per song they downloaded: do they still like it? */
  likes: Record<string, boolean>;
  notLikingSince: Record<string, string>;
};

export type UnresolvedFan = {
  unresolved: true;
  /** First day the profile stopped resolving — deleted or renamed. */
  since: string;
};

export type SnapshotData = {
  version: 1;
  takenAt: string;
  artist: {
    id: string;
    username: string;
    permalinkUrl: string;
    followers: number;
    followings: number;
    tracks: number;
  };
  tracks: Record<string, TrackSnapshot>;
  fans: Record<string, FanSnapshot | UnresolvedFan>;
  /** True when the run ran out of time before checking every fan. */
  partial: boolean;
  errors: string[];
};

const TABLE = "stats_snapshots";
const supabase = createServerSupabase();

/** Stop starting new fan lookups after this, under the route's maxDuration. */
const BUDGET_MS = 240_000;
const CONCURRENCY = 6;

type ScUser = {
  id?: number | string;
  urn?: string;
  username?: string;
  permalink_url?: string;
  avatar_url?: string | null;
  followers_count?: number;
  followings_count?: number;
  track_count?: number;
  city?: string | null;
  country?: string | null;
};

type ScTrack = {
  id?: number | string;
  urn?: string;
  title?: string;
  playback_count?: number;
  likes_count?: number;
  favoritings_count?: number;
  reposts_count?: number;
  comment_count?: number;
  download_count?: number;
};

const idOf = (item: { id?: number | string; urn?: string }) =>
  numericId(item.id ?? item.urn);

export const isUnresolved = (
  fan: FanSnapshot | UnresolvedFan | undefined
): fan is UnresolvedFan => Boolean(fan && "unresolved" in fan);

/** Runs `fn` over `items`, `limit` at a time. */
const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
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

/** Every distinct downloader profile, with the songs each one downloaded. */
const loadDownloaders = async () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const byProfile = new Map<string, Set<string>>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("downloads")
      .select("sc_profile_url, track_slug")
      .not("sc_profile_url", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data || []) {
      const url = row.sc_profile_url as string;
      const songs = byProfile.get(url) || new Set<string>();
      songs.add(row.track_slug as string);
      byProfile.set(url, songs);
    }
    if (!data || data.length < 1000) break;
  }
  return byProfile;
};

export const latestSnapshot = async (
  beforeDay?: string
): Promise<{ day: string; data: SnapshotData } | null> => {
  if (!supabase) return null;
  let query = supabase
    .from(TABLE)
    .select("day, data")
    .order("day", { ascending: false })
    .limit(1);
  if (beforeDay) query = query.lt("day", beforeDay);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? { day: data.day as string, data: data.data as SnapshotData } : null;
};

/**
 * Takes today's snapshot and stores it, replacing any earlier one from the
 * same UTC day — so the admin's "refresh now" button and the cron can both
 * run without stacking duplicates.
 */
export const takeSnapshot = async (): Promise<SnapshotData> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const started = Date.now();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const errors: string[] = [];

  // The newest run, even one from earlier today: refreshing on every open
  // means today's row is rewritten many times, and the last good answer is
  // the right thing to carry forward.
  const previous = (await latestSnapshot())?.data || null;

  // You, and everyone who follows you — one paged read, then set lookups.
  const artist = await appGet<ScUser>(
    `/resolve?url=${encodeURIComponent(ARTIST_SOUNDCLOUD_URL)}`
  );
  const artistId = idOf(artist);
  const followerIds = new Set(
    (await appGetAll<ScUser>(`/users/${artistId}/followers`)).map(idOf)
  );

  // Each song's public counters and who currently likes it.
  const tracks: Record<string, TrackSnapshot> = {};
  const likers: Record<string, Set<string>> = {};
  for (const track of await getAllTracks()) {
    try {
      let trackId = numericId(track.soundcloudTrackId);
      if (!trackId) {
        const permalink = getTrackPermalink(track);
        if (!permalink) continue;
        trackId = idOf(
          await appGet<ScTrack>(`/resolve?url=${encodeURIComponent(permalink)}`)
        );
      }
      if (!trackId) continue;
      const meta = await appGet<ScTrack>(`/tracks/${trackId}`);
      tracks[track.slug] = {
        id: trackId,
        title: meta.title || track.title,
        plays: meta.playback_count ?? 0,
        likes: meta.likes_count ?? meta.favoritings_count ?? 0,
        reposts: meta.reposts_count ?? 0,
        comments: meta.comment_count ?? 0,
        scDownloads: meta.download_count ?? 0
      };
      likers[track.slug] = new Set(
        (await appGetAll<ScUser>(`/tracks/${trackId}/favoriters`)).map(idOf)
      );
    } catch (error) {
      errors.push(`track ${track.slug}: ${String(error).slice(0, 160)}`);
      // One bad answer from SoundCloud shouldn't blank this song's numbers
      // for the day — keep the last good ones (fans' likes are carried below).
      if (previous?.tracks[track.slug]) tracks[track.slug] = previous.tracks[track.slug];
    }
  }

  // Every downloader, looked up by id where we already know it — ids survive
  // a renamed profile, URLs don't.
  const downloaders = await loadDownloaders();
  const fans: SnapshotData["fans"] = {};
  let partial = false;

  await mapLimit([...downloaders.entries()], CONCURRENCY, async ([url, songs]) => {
    if (Date.now() - started > BUDGET_MS) {
      partial = true;
      // Keep yesterday's answer rather than dropping the fan from the stats.
      if (previous?.fans[url]) fans[url] = previous.fans[url];
      return;
    }
    const before = previous?.fans[url];
    try {
      const known = before && !isUnresolved(before) ? before.id : "";
      const user = known
        ? await appGet<ScUser>(`/users/${known}`)
        : await appGet<ScUser>(`/resolve?url=${encodeURIComponent(url)}`);
      const id = idOf(user);
      const prior = before && !isUnresolved(before) ? before : null;
      const follows = followerIds.has(id);

      const likes: Record<string, boolean> = {};
      const notLikingSince: Record<string, string> = {};
      for (const slug of songs) {
        if (!likers[slug]) {
          // This song's likers couldn't be read this run: keep what we knew,
          // or a "not liking since" date would restart from today.
          if (prior && slug in prior.likes) {
            likes[slug] = prior.likes[slug];
            if (prior.notLikingSince?.[slug]) notLikingSince[slug] = prior.notLikingSince[slug];
          }
          continue;
        }
        likes[slug] = likers[slug].has(id);
        if (!likes[slug]) {
          notLikingSince[slug] = prior?.notLikingSince?.[slug] || today;
        }
      }

      fans[url] = {
        id,
        username: user.username || "",
        avatarUrl: user.avatar_url || null,
        permalinkUrl: user.permalink_url || url,
        followers: user.followers_count ?? 0,
        followings: user.followings_count ?? 0,
        tracks: user.track_count ?? 0,
        city: user.city || null,
        country: user.country || null,
        isArtist: id === artistId,
        followsArtist: follows,
        notFollowingSince: follows ? null : prior?.notFollowingSince || today,
        likes,
        notLikingSince
      };
    } catch (error) {
      // A 404 is a gone profile; anything else is SoundCloud having a bad
      // moment, which shouldn't rewrite history for this fan.
      if (error instanceof SoundcloudApiError && error.status === 404) {
        fans[url] = {
          unresolved: true,
          since: isUnresolved(before) ? before.since : today
        };
      } else {
        if (before) fans[url] = before;
        errors.push(`fan ${url}: ${String(error).slice(0, 120)}`);
      }
    }
  });

  const data: SnapshotData = {
    version: 1,
    takenAt: now.toISOString(),
    artist: {
      id: artistId,
      username: artist.username || "",
      permalinkUrl: artist.permalink_url || ARTIST_SOUNDCLOUD_URL,
      followers: artist.followers_count ?? followerIds.size,
      followings: artist.followings_count ?? 0,
      tracks: artist.track_count ?? 0
    },
    tracks,
    fans,
    partial,
    errors: errors.slice(0, 50)
  };

  const { error } = await supabase
    .from(TABLE)
    .upsert({ day: today, taken_at: data.takenAt, data }, { onConflict: "day" });
  if (error) throw error;
  return data;
};
