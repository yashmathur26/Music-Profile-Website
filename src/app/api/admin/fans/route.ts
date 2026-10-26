import { NextRequest, NextResponse } from "next/server";
import {
  LEAVE_ALONE,
  LEFT_ALONE_PREFIX,
  ScProfile,
  artistId,
  loadArtistFollowings,
  loadProfile,
  loadProfileByUrl,
  screenProfile
} from "@/lib/fanScreen";
import {
  ReleaseSubscriber,
  listAllActions,
  listAllSubscribers,
  subscriptionsConfigured
} from "@/lib/releaseSubscribers";
import { SoundcloudApiError, appGet, appGetAll, numericId } from "@/lib/soundcloud";
import { FanSnapshot, isUnresolved, latestSnapshot } from "@/lib/statsSnapshot";
import { createServerSupabase } from "@/lib/supabaseServer";
import { getAllTracks } from "@/lib/trackStore";
import { TrackConfig, getTrackPermalink } from "@/lib/tracks";
import type { Fan, FanSaved, FansPayload } from "@/lib/fansTypes";

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

/** Profiles looked up live per load, beyond the saved fans. The snapshot
 * (re-taken after every download) covers the rest, and soon covers these. */
const LIVE_LOOKUP_CAP = 15;

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
 * Live SoundCloud answers, kept for ten minutes and shared by every load of
 * the page, so opening the tab twice doesn't cost twice. On globalThis so all
 * route bundles share it.
 */
const LIVE_TTL_MS = 10 * 60_000;
const CACHE_KEY = Symbol.for("yvsh.fansLive");
const cacheStore = globalThis as typeof globalThis & {
  [CACHE_KEY]?: Map<string, { at: number; value: unknown }>;
};
const cached = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const cache = (cacheStore[CACHE_KEY] ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
};

/** soundcloud.com links come back with and without tracking parameters. */
const normalUrl = (url: string) => url.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();

type DownloadRow = {
  track_slug: string;
  sc_username: string | null;
  sc_profile_url: string | null;
  created_at: string;
};

type Group = {
  key: string;
  username: string | null;
  /** Every spelling of their link the downloads table holds. */
  urls: Set<string>;
  rows: DownloadRow[];
  subscriber: ReleaseSubscriber | null;
  snapshot: FanSnapshot | null;
  snapshotGone: boolean;
  profile: ScProfile | null | undefined;
};

const loadDownloads = async (): Promise<DownloadRow[]> => {
  const supabase = createServerSupabase();
  if (!supabase) return [];
  const out: DownloadRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("downloads")
      .select("track_slug, sc_username, sc_profile_url, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data || []) as DownloadRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
};

/** Where each username last downloaded from, by IP — the fallback location. */
const loadDownloadCountries = async (): Promise<Map<string, string>> => {
  const supabase = createServerSupabase();
  const out = new Map<string, string>();
  if (!supabase) return out;
  const { data } = await supabase
    .from("gate_events")
    .select("sc_username, country, created_at")
    .eq("kind", "download")
    .not("country", "is", null)
    .not("sc_username", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  for (const row of data || []) {
    const name = row.sc_username as string;
    if (!out.has(name)) out.set(name, row.country as string);
  }
  return out;
};

/**
 * Everyone who has downloaded, with what SoundCloud says about them and how
 * they engage with you: what they downloaded and whether they still like it,
 * whether they follow you, and their standing in "like + repost future
 * releases" — including what each release did on their profile.
 *
 * Live where it matters and is cheap (who follows you, who likes each song,
 * the saved fans' profiles); everyone else's profile numbers come from the
 * stats snapshot, which is re-taken after every download. All on the app's
 * own token — no fan's credentials are touched to draw this page.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let downloads: DownloadRow[], subscribers: ReleaseSubscriber[], actions, tracks;
  let snapshot, downloadCountries;
  try {
    [downloads, subscribers, actions, tracks, snapshot, downloadCountries] = await Promise.all([
      loadDownloads(),
      subscriptionsConfigured() ? listAllSubscribers() : Promise.resolve([]),
      subscriptionsConfigured() ? listAllActions() : Promise.resolve([]),
      getAllTracks(),
      latestSnapshot().catch(() => null),
      loadDownloadCountries().catch(() => new Map<string, string>())
    ]);
  } catch (error) {
    console.error("[fans] could not load fans", error);
    return NextResponse.json({ error: "Couldn't load your fans." }, { status: 500 });
  }

  const bySlug = new Map(tracks.map((t) => [t.slug, t]));
  const title = (slug: string) => bySlug.get(slug)?.title || slug;

  // One group per person: by profile link where the download recorded one,
  // else by username. Downloads with neither are counted, not listed.
  const groups = new Map<string, Group>();
  let anonymousDownloads = 0;
  const groupFor = (url: string | null, username: string | null) => {
    const key = url ? normalUrl(url) : username ? `user:${username.toLowerCase()}` : null;
    if (!key) return null;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        username,
        urls: new Set(),
        rows: [],
        subscriber: null,
        snapshot: null,
        snapshotGone: false,
        profile: undefined
      };
      groups.set(key, group);
    }
    if (url) group.urls.add(url);
    if (!group.username && username) group.username = username;
    return group;
  };
  for (const row of downloads) {
    const group = groupFor(row.sc_profile_url, row.sc_username);
    if (group) group.rows.push(row);
    else anonymousDownloads++;
  }

  // The snapshot is keyed by the exact link the downloads table holds.
  const snapshotById = new Map<string, Group>();
  for (const group of groups.values()) {
    for (const url of group.urls) {
      const entry = snapshot?.data.fans[url];
      if (!entry) continue;
      if (isUnresolved(entry)) group.snapshotGone = true;
      else {
        group.snapshot = entry;
        snapshotById.set(entry.id, group);
      }
      break;
    }
  }

  // Saved fans join their downloader row by id, then link, then name.
  for (const sub of subscribers) {
    const group =
      snapshotById.get(sub.sc_user_id) ||
      (sub.sc_profile_url ? groups.get(normalUrl(sub.sc_profile_url)) : undefined) ||
      (sub.sc_username ? groups.get(`user:${sub.sc_username.toLowerCase()}`) : undefined) ||
      groupFor(sub.sc_profile_url, sub.sc_username);
    if (group) group.subscriber = sub;
  }

  // Live answers from SoundCloud, only where the snapshot isn't enough: who
  // you follow and the saved fans' profiles (the leave-alone check has to be
  // current), and what releases left on their profiles. Everything else —
  // follows, likes on downloads — comes from the snapshot, which is re-taken
  // after every download. Reading every song's likers on every page load is
  // what ran the app into SoundCloud's rate limit, and that limit is shared
  // with the live site.
  let liveError: string | null = null;
  let rateLimited = false;
  const live = async <T>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
    if (rateLimited) return undefined;
    try {
      return await cached(key, fn);
    } catch (error) {
      if (error instanceof SoundcloudApiError && error.status === 429) rateLimited = true;
      else console.error(`[fans] ${key} failed`, error);
      liveError = liveError || "SoundCloud didn't answer everything, so some details are from the last stats snapshot.";
      return undefined;
    }
  };

  const me = (await live("artist", artistId)) || "";
  const following = (await live("followings", loadArtistFollowings)) || new Set<string>();
  const likers = new Map<string, Set<string>>();
  const reposters = new Map<string, Set<string>>();

  const releaseSlugs = [...new Set(actions.map((a) => a.track_slug))];
  await mapLimit(releaseSlugs, 2, async (slug) => {
    const track = bySlug.get(slug);
    if (!track) return;
    const id = await live(`track:${slug}`, () => trackIdFor(track));
    if (!id) return;
    const l = await live(`likers:${id}`, () => appGetAll<ScItem>(`/tracks/${id}/favoriters`).then(ids));
    const r = await live(`reposters:${id}`, () => appGetAll<ScItem>(`/tracks/${id}/reposters`).then(ids));
    if (l) likers.set(slug, l);
    if (r) reposters.set(slug, r);
  });

  // Saved fans always, then a few people the snapshot hasn't reached yet.
  const saved = [...groups.values()].filter((g) => g.subscriber && !g.subscriber.revoked_at);
  const unknown = [...groups.values()]
    .filter((g) => !g.subscriber && !g.snapshot && !g.snapshotGone && g.urls.size)
    .slice(0, LIVE_LOOKUP_CAP);
  await mapLimit([...saved, ...unknown], 4, async (group) => {
    const sub = group.subscriber;
    const url = [...group.urls][0];
    const found = sub
      ? await live(`profile:${sub.sc_user_id}`, () => loadProfile(sub.sc_user_id))
      : await live(`profile:${url}`, () => loadProfileByUrl(url));
    if (found !== undefined) group.profile = found;
  });
  if (rateLimited) {
    liveError =
      "SoundCloud is asking us to slow down, so some details are from the last stats snapshot. Check again in a few minutes.";
  }

  const fans: Fan[] = [...groups.values()].map((group) => {
    const { subscriber: sub, snapshot: snap, profile } = group;
    const id = profile?.id || snap?.id || sub?.sc_user_id || "";
    const has = (map: Map<string, Set<string>>, slug: string) =>
      id && map.has(slug) ? map.get(slug)!.has(id) : null;

    const followsYou = snap ? snap.followsArtist : null;
    const city = profile?.city ?? snap?.city ?? null;
    const country = profile?.country ?? snap?.country ?? null;
    const gone = profile === null || (!profile && !snap && group.snapshotGone);

    let saved: FanSaved | null = null;
    if (sub) {
      // Judged on the live profile when there is one, else on the snapshot's
      // numbers — the release itself always checks live before acting.
      const basis: ScProfile | null | undefined =
        profile !== undefined
          ? profile
          : snap
            ? {
                id: snap.id,
                username: snap.username,
                permalinkUrl: snap.permalinkUrl,
                avatarUrl: snap.avatarUrl,
                followers: snap.followers,
                following: snap.followings,
                uploads: snap.tracks,
                city: snap.city,
                country: snap.country
              }
            : undefined;
      const screen = !sub.revoked_at && basis !== undefined ? screenProfile(basis, following) : null;
      saved = {
        status: sub.revoked_at ? "ended" : screen && !screen.ok ? "left_alone" : "ready",
        leaveAloneReason: screen && !screen.ok ? screen.reason : null,
        savedAt: sub.created_at,
        lastCheckedAt: sub.last_refreshed_at,
        endedAt: sub.revoked_at,
        endedReason: sub.revoked_reason
      };
    }

    const times = group.rows.map((r) => r.created_at);
    if (sub) times.push(sub.created_at);
    times.sort();

    return {
      key: group.key,
      username: profile?.username || snap?.username || group.username || sub?.sc_username || "Unknown",
      profileUrl: profile?.permalinkUrl || snap?.permalinkUrl || [...group.urls][0] || sub?.sc_profile_url || null,
      avatarUrl: profile?.avatarUrl || snap?.avatarUrl || null,
      followers: profile?.followers ?? snap?.followers ?? null,
      following: profile?.following ?? snap?.followings ?? null,
      uploads: profile?.uploads ?? snap?.tracks ?? null,
      location: [city, country].filter(Boolean).join(", ") || null,
      downloadCountry: group.username ? downloadCountries.get(group.username) || null : null,
      isYou: Boolean(id && me && id === me) || Boolean(snap?.isArtist),
      gone,
      followsYou,
      unfollowedSince: followsYou === false ? snap?.notFollowingSince || null : null,
      downloads: group.rows.map((row) => ({
        slug: row.track_slug,
        title: title(row.track_slug),
        at: row.created_at,
        likesNow: has(likers, row.track_slug) ?? snap?.likes[row.track_slug] ?? null
      })),
      firstSeen: times[0],
      lastSeen: times[times.length - 1],
      saved,
      releases: sub
        ? actions
            .filter((a) => a.subscriber_id === sub.id)
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
        : []
    };
  });

  fans.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

  const payload: FansPayload = {
    checkedAt: new Date().toISOString(),
    snapshotAt: snapshot?.data.takenAt || null,
    rules: { followers: LEAVE_ALONE.followers, uploads: LEAVE_ALONE.uploads },
    liveError,
    anonymousDownloads,
    fans
  };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
