import { createServerSupabase } from "@/lib/supabaseServer";
import { getAllTracks } from "@/lib/trackStore";
import { ARTIST_SOUNDCLOUD_URL, getTrackPermalink } from "@/lib/tracks";
import { GATE_EVENT_KINDS } from "@/lib/gateEvents";
import { SnapshotData, isUnresolved } from "@/lib/statsSnapshot";
import type {
  StatsDownloadRow,
  StatsEventRow,
  StatsFan,
  StatsFanState,
  StatsHistoryDay,
  StatsPayload
} from "@/lib/statsTypes";

/**
 * Assembles everything the admin Stats tab draws, in one request.
 *
 * Live tables (downloads, gate events, subscribers) are read as they are
 * right now; SoundCloud's side comes from the daily snapshots. The tab does
 * all the slicing by date range and song itself, so this stays a plain
 * gather-and-pack with no opinions about what to show.
 */

const supabase = createServerSupabase();

/** How far back the event log goes on the wire. */
const EVENT_WINDOW_DAYS = 365;
/** Snapshots drawn as history. */
const HISTORY_DAYS = 365;

/**
 * The query builder, loosely typed: supabase-js's generics can't follow a
 * filter chain passed through a helper, and every caller states its row type
 * at the call site anyway.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

/** PostgREST caps a response at 1,000 rows, so read in pages. */
const selectAll = async <T>(
  table: string,
  columns: string,
  shape?: (query: Query) => Query
): Promise<T[]> => {
  if (!supabase) return [];
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let query: Query = supabase.from(table).select(columns);
    if (shape) query = shape(query);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw error;
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
};

/** Index-of with insertion — builds the lookup tables for the tuples. */
const indexer = () => {
  const values: string[] = [];
  const index = new Map<string, number>();
  const of = (value: string | null | undefined) => {
    if (!value) return -1;
    let i = index.get(value);
    if (i === undefined) {
      i = values.length;
      values.push(value);
      index.set(value, i);
    }
    return i;
  };
  return { values, of };
};

const fanState = (
  snapshot: SnapshotData | null,
  url: string | null
): StatsFanState | null => {
  if (!snapshot || !url) return null;
  const fan = snapshot.fans[url];
  if (!fan) return null;
  if (isUnresolved(fan)) return { unresolvedSince: fan.since };
  return {
    username: fan.username,
    avatarUrl: fan.avatarUrl,
    followers: fan.followers,
    followings: fan.followings,
    city: fan.city,
    country: fan.country,
    isArtist: fan.isArtist,
    followsArtist: fan.followsArtist,
    notFollowingSince: fan.notFollowingSince,
    likes: fan.likes,
    notLikingSince: fan.notLikingSince
  };
};

export const buildStatsReport = async (): Promise<StatsPayload> => {
  const missing: string[] = [];
  const attempt = async <T>(label: string, run: () => Promise<T>, fallback: T) => {
    try {
      return await run();
    } catch (error) {
      console.warn(`[stats] ${label} unavailable`, error);
      missing.push(label);
      return fallback;
    }
  };

  const tracks = await getAllTracks();
  const trackIndex = new Map(tracks.map((track, i) => [track.slug, i]));
  /** Songs that were deleted still have history; give them a row too. */
  const trackOf = (slug: string) => {
    let i = trackIndex.get(slug);
    if (i === undefined) {
      i = tracks.length;
      tracks.push({
        slug,
        title: slug,
        artworkUrl: "",
        downloadUrl: "",
        soundcloudEmbedUrl: ""
      });
      trackIndex.set(slug, i);
    }
    return i;
  };

  const [downloadRows, snapshotRows, latestRow, eventRows, subscriberRows, actionRows, announcementRows] =
    await Promise.all([
      attempt(
        "downloads",
        () =>
          selectAll<{
            created_at: string;
            track_slug: string;
            sc_username: string | null;
            sc_profile_url: string | null;
          }>("downloads", "created_at, track_slug, sc_username, sc_profile_url", (q) =>
            q.order("created_at", { ascending: true })
          ),
        []
      ),
      attempt(
        "SoundCloud history",
        () =>
          selectAll<{
            day: string;
            followers: number | null;
            tracks: SnapshotData["tracks"] | null;
          }>(
            "stats_snapshots",
            "day, followers:data->artist->followers, tracks:data->tracks",
            (q) =>
              q
                .gte(
                  "day",
                  new Date(Date.now() - HISTORY_DAYS * 86_400_000)
                    .toISOString()
                    .slice(0, 10)
                )
                .order("day", { ascending: true })
          ),
        []
      ),
      attempt(
        "latest SoundCloud snapshot",
        async () => {
          if (!supabase) return null;
          const { data, error } = await supabase
            .from("stats_snapshots")
            .select("day, data")
            .order("day", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data as { day: string; data: SnapshotData } | null;
        },
        null
      ),
      attempt(
        "gate events",
        () =>
          selectAll<{
            created_at: string;
            track_slug: string;
            kind: string;
            session_id: string | null;
            country: string | null;
            referrer: string | null;
            detail: { gate?: string } | null;
          }>(
            "gate_events",
            "created_at, track_slug, kind, session_id, country, referrer, detail",
            (q) =>
              q
                .gte(
                  "created_at",
                  new Date(Date.now() - EVENT_WINDOW_DAYS * 86_400_000).toISOString()
                )
                .order("created_at", { ascending: true })
          ),
        []
      ),
      attempt(
        "subscribers",
        // Never the token columns — the browser has no business with them.
        () =>
          selectAll<{
            created_at: string;
            revoked_at: string | null;
            revoked_reason: string | null;
            source_track_slug: string | null;
          }>(
            "release_subscribers",
            "created_at, revoked_at, revoked_reason, source_track_slug",
            (q) => q.order("created_at", { ascending: true })
          ),
        []
      ),
      attempt(
        "release actions",
        () =>
          selectAll<{
            liked: boolean;
            reposted: boolean;
            error: string | null;
            remove_after: string | null;
            removed_at: string | null;
            remove_error: string | null;
          }>(
            "release_actions",
            "liked, reposted, error, remove_after, removed_at, remove_error"
          ),
        []
      ),
      attempt(
        "release announcements",
        () =>
          selectAll<{
            track_slug: string;
            status: string;
            processed: number;
            liked: number;
            reposted: number;
            failed: number;
            requested_at: string;
            completed_at: string | null;
          }>(
            "release_announcements",
            "track_slug, status, processed, liked, reposted, failed, requested_at, completed_at",
            (q) => q.order("requested_at", { ascending: false })
          ),
        []
      )
    ]);

  const snapshot = latestRow?.data || null;

  // Fans: keyed by profile URL when we have one, else by username, so the
  // two rows that predate profile links still count as people.
  const fans: StatsFan[] = [];
  const fanIndex = new Map<string, number>();
  const fanOf = (url: string | null, username: string | null) => {
    const key = url || (username ? `user:${username}` : "");
    if (!key) return -1;
    let i = fanIndex.get(key);
    if (i === undefined) {
      i = fans.length;
      fans.push({ url, username });
      fanIndex.set(key, i);
    } else if (username && !fans[i].username) {
      fans[i].username = username;
    }
    return i;
  };

  const downloads: StatsDownloadRow[] = downloadRows.map((row) => [
    Date.parse(row.created_at),
    trackOf(row.track_slug),
    fanOf(row.sc_profile_url, row.sc_username)
  ]);

  const history: StatsHistoryDay[] = snapshotRows.map((row) => ({
    day: row.day,
    followers: Number(row.followers ?? 0),
    tracks: Object.fromEntries(
      Object.entries(row.tracks || {}).map(([slug, t]) => [
        slug,
        { plays: t.plays, likes: t.likes, reposts: t.reposts, comments: t.comments }
      ])
    )
  }));

  const sessions = indexer();
  const countries = indexer();
  const sources = indexer();
  const gates = indexer();
  const kinds = [...GATE_EVENT_KINDS] as string[];
  const events: StatsEventRow[] = eventRows.map((row) => [
    Date.parse(row.created_at),
    trackOf(row.track_slug),
    Math.max(0, kinds.indexOf(row.kind)),
    sessions.of(row.session_id),
    countries.of(row.country),
    sources.of(row.referrer),
    gates.of(row.detail?.gate)
  ]);

  const now = Date.now();
  const actions = {
    total: actionRows.length,
    liked: actionRows.filter((a) => a.liked).length,
    reposted: actionRows.filter((a) => a.reposted).length,
    failed: actionRows.filter((a) => !a.liked && !a.reposted && a.error).length,
    removalsScheduled: actionRows.filter((a) => a.remove_after && !a.removed_at).length,
    removalsPending: actionRows.filter(
      (a) => a.remove_after && !a.removed_at && Date.parse(a.remove_after) <= now
    ).length,
    removed: actionRows.filter((a) => a.removed_at && !a.remove_error).length,
    removalFailed: actionRows.filter((a) => a.removed_at && a.remove_error).length
  };

  return {
    generatedAt: new Date().toISOString(),
    artist: {
      username: snapshot?.artist.username || "",
      profileUrl: snapshot?.artist.permalinkUrl || ARTIST_SOUNDCLOUD_URL,
      followers: snapshot?.artist.followers ?? null
    },
    snapshot: latestRow
      ? {
          day: latestRow.day,
          takenAt: latestRow.data.takenAt,
          partial: latestRow.data.partial,
          errors: latestRow.data.errors.length
        }
      : null,
    tracks: tracks.map((track) => ({
      slug: track.slug,
      title: track.title,
      artworkUrl: track.artworkUrl,
      url: getTrackPermalink(track)
    })),
    fans,
    fanState: fans.map((fan) => fanState(snapshot, fan.url)),
    downloads,
    history,
    events: {
      since: eventRows[0]?.created_at || null,
      rows: events,
      kinds,
      countries: countries.values,
      sources: sources.values,
      gates: gates.values
    },
    subscribers: {
      configured: Boolean(supabase),
      rows: subscriberRows.map((row) => ({
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
        reason: row.revoked_reason,
        source: row.source_track_slug
      })),
      actions,
      announcements: announcementRows.map((row) => ({
        track: row.track_slug,
        status: row.status,
        processed: row.processed,
        liked: row.liked,
        reposted: row.reposted,
        failed: row.failed,
        requestedAt: row.requested_at,
        completedAt: row.completed_at
      }))
    },
    missing
  };
};
