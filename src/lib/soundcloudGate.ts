import {
  SoundcloudApiError,
  checkFollowing,
  commentOnTrack,
  followUser,
  likeTrack,
  numericId,
  refreshAccessToken,
  repostTrack,
  resolvePermalink,
  soundcloudConfigured
} from "@/lib/soundcloud";
import { readGate, recordGateEngagement, writeGate } from "@/lib/gateStore";
import { updateSession } from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";
import { ARTIST_SOUNDCLOUD_URL, getTrackPermalink } from "@/lib/tracks";
import { findTrack } from "@/lib/trackStore";
import { followTargetName, normalizeFollowTargets } from "@/lib/followTargets";
import { env } from "@/utils/env";

/** One account the gate follows, and whether that's done. */
export type FollowTarget = {
  /** soundcloud.com profile URL — the key this target is stored under. */
  url: string;
  /** SoundCloud's display name once resolved, else the @permalink. */
  name: string;
  followed: boolean;
};

export type GateStatus = {
  /** SoundCloud OAuth env vars are present. */
  configured: boolean;
  /** Fan has authorised us against their SoundCloud account. */
  connected: boolean;
  username: string | null;
  /** Every configured account the gate follows, with its own state. */
  follows: FollowTarget[];
  /** Shorthand for "every follow target is done" — what the gate unlocks on. */
  followed: boolean;
  liked: boolean;
  reposted: boolean;
  commented: boolean;
  unlocked: boolean;
  /** The connected account IS the artist — nothing to follow or like. */
  isArtist: boolean;
  /** Set when SoundCloud rejected the write calls and the UI should fall back
   * to the manual "open SoundCloud yourself" flow. */
  apiBlocked: boolean;
  error: string | null;
};

/** Repost/comment choices made by the fan before connecting. */
export type EngagementPrefs = {
  repost?: boolean;
  comment?: string;
};

export const emptyStatus = (): GateStatus => ({
  configured: soundcloudConfigured(),
  connected: false,
  username: null,
  follows: [],
  followed: false,
  liked: false,
  reposted: false,
  commented: false,
  unlocked: false,
  isArtist: false,
  apiBlocked: false,
  error: null
});

/** Resolved SoundCloud ids are stable, so keep them warm per server instance. */
const resolvedIds = new Map<string, { id: string; name: string }>();

const resolveCached = async (accessToken: string, url: string) => {
  const cached = resolvedIds.get(url);
  if (cached) return cached;
  const { id, name } = await resolvePermalink(accessToken, url);
  const resolved = { id, name };
  if (id) {
    resolvedIds.set(url, resolved);
  }
  return resolved;
};

/**
 * The profiles this song's gate follows, in the order the artist set them on
 * the gate. A song with none set falls back to the artist's own profile, so
 * every gate always has someone to follow.
 */
export const getFollowTargetUrls = async (
  trackSlug: string
): Promise<string[]> => {
  let configured: string[] = [];
  try {
    configured = normalizeFollowTargets((await findTrack(trackSlug))?.followTargets);
  } catch (error) {
    console.warn("[gate] follow targets unavailable; using the artist profile", error);
  }
  return configured.length ? configured : [ARTIST_SOUNDCLOUD_URL];
};

/** URL + display name, with no SoundCloud call — for the pre-connect list. */
const listFollowTargets = async (
  trackSlug: string
): Promise<{ url: string; name: string }[]> =>
  (await getFollowTargetUrls(trackSlug)).map((url) => ({
    url,
    name: followTargetName(url)
  }));

/**
 * Resolves every follow target to its numeric user id, all at once. A target
 * that won't resolve comes back with an empty id; callers drop it rather than
 * leaving the fan staring at a task they can't complete.
 */
const resolveFollowTargets = async (accessToken: string, trackSlug: string) => {
  const targets = await listFollowTargets(trackSlug);
  // The env var short-circuits the lookup for the artist's own profile.
  const artistIdOverride = numericId(env.soundcloudArtistId);

  return Promise.all(
    targets.map(async (target) => {
      if (artistIdOverride && target.url === ARTIST_SOUNDCLOUD_URL) {
        return { ...target, id: artistIdOverride };
      }
      try {
        const { id, name } = await resolveCached(accessToken, target.url);
        return { ...target, id, name: name || target.name };
      } catch (error) {
        console.log(`[gate] resolve failed for ${target.url}`, error);
        return { ...target, id: "" };
      }
    })
  );
};

const getTrackId = async (accessToken: string, trackSlug: string) => {
  const track = await findTrack(trackSlug);
  if (!track) return "";
  if (track.soundcloudTrackId) return numericId(track.soundcloudTrackId);
  const permalink = getTrackPermalink(track);
  return permalink ? (await resolveCached(accessToken, permalink)).id : "";
};

/** Supabase is an optional mirror; the gate cookie is the source of truth. */
const mirrorToDatabase = (updates: Parameters<typeof updateSession>[1]) => {
  try {
    const sessionId = getOrCreateSessionId();
    void updateSession(sessionId, updates);
  } catch {
    /* the gate does not depend on this */
  }
};

/** Access tokens last about an hour; refresh tokens are single-use, so the
 * new pair has to be written back immediately. */
export const getValidAccessToken = async () => {
  const gate = readGate();
  if (!gate.accessToken) {
    return null;
  }

  const expiresAt = gate.expiresAt ? Date.parse(gate.expiresAt) : null;
  const expiringSoon = expiresAt !== null && expiresAt - Date.now() < 60_000;

  if (!expiringSoon || !gate.refreshToken) {
    return gate.accessToken;
  }

  try {
    const tokens = await refreshAccessToken(gate.refreshToken);
    writeGate({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? gate.refreshToken,
      expiresAt: tokens.expiresAt || undefined
    });
    return tokens.accessToken;
  } catch (error) {
    console.error("[gate] token refresh failed", error);
    return null;
  }
};

const describeError = (error: unknown) => {
  if (error instanceof SoundcloudApiError) {
    if (error.status === 401) return "reconnect";
    if (error.status === 403 || error.status === 404) return "blocked";
    if (error.status === 429) return "rate_limited";
    return `soundcloud_${error.status}`;
  }
  return "unknown";
};

const detailOf = (error: unknown) =>
  error instanceof SoundcloudApiError
    ? `${error.status} ${error.body}`
    : String(error);

/**
 * Runs the actions the gate promises — follow every configured account, like
 * the track, and optionally repost and comment — on the fan's behalf, then
 * records the result. Follow/like/repost are idempotent, so retries are safe;
 * the comment is guarded by the `commented` flag because SoundCloud will
 * happily post it twice.
 */
export const runEngagement = async (
  trackSlug: string,
  prefs: EngagementPrefs = {}
): Promise<GateStatus> => {
  const status = emptyStatus();
  if (!status.configured) {
    return status;
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return status;
  }

  const gate = readGate();
  status.connected = true;
  status.username = gate.username || null;

  const selfId = numericId(gate.userId);
  const targets = await resolveFollowTargets(accessToken, trackSlug);

  // The artist opening their own gate: you can't follow, like or repost your
  // own upload, so skip the tasks entirely and hand over the download.
  if (selfId && targets[0]?.id && targets[0].id === selfId) {
    status.isArtist = true;
    status.unlocked = true;
    return status;
  }

  const previous = gate.engagement?.[trackSlug] || {};
  const previousFollows = previous.follows || {};
  status.liked = Boolean(previous.liked);
  status.reposted = Boolean(previous.reposted);
  status.commented = Boolean(previous.commented);

  // Every follow fires at the same time — one round trip's worth of waiting no
  // matter how many accounts are configured.
  const followed = await Promise.all(
    targets.map(async (target) => {
      if (!target.id) {
        return { ...target, followed: false, error: "artist_unresolved" as string | null };
      }
      // A fan who happens to be one of the other configured accounts can't
      // follow themselves; count it as nothing left to do.
      if (selfId && target.id === selfId) {
        return { ...target, followed: true, error: null as string | null };
      }
      if (previousFollows[target.url]) {
        return { ...target, followed: true, error: null as string | null };
      }
      try {
        const ok = await followUser(accessToken, target.id);
        console.log(`[gate] follow artist=${target.id} -> ok`);
        return { ...target, followed: ok, error: null as string | null };
      } catch (error) {
        console.log(`[gate] follow ${target.url} FAILED: ${detailOf(error)}`);
        const kind = describeError(error);
        // The write may be blocked while the fan already follows manually —
        // a read-only check still lets them through.
        try {
          return {
            ...target,
            followed: await checkFollowing(accessToken, target.id),
            error: kind as string | null
          };
        } catch {
          return { ...target, followed: false, error: kind as string | null };
        }
      }
    })
  );

  // A target that won't resolve stays in the checklist as pending and keeps
  // the gate shut — the admin page verifies every profile on save, so this is
  // SoundCloud being unreachable, and a retry is the right answer.
  status.follows = followed.map(({ url, name, followed: done }) => ({
    url,
    name,
    followed: done
  }));
  status.followed =
    followed.length > 0 && followed.every((target) => target.followed);

  const followError = followed.find((target) => target.error)?.error || null;
  if (!status.followed && followError) {
    status.error = followError;
    status.apiBlocked = followed.some((target) => target.error === "blocked");
  }

  if (!status.liked) {
    try {
      const trackId = await getTrackId(accessToken, trackSlug);
      if (trackId) {
        status.liked = await likeTrack(accessToken, trackId);
        console.log(`[gate] like track=${trackId} -> ok`);
      } else {
        status.error = status.error || "track_unresolved";
      }
    } catch (error) {
      console.log(`[gate] like FAILED: ${detailOf(error)}`);
      const kind = describeError(error);
      status.error = status.error || kind;
      status.apiBlocked = status.apiBlocked || kind === "blocked";
    }
  }

  // Repost is opt-out (the checkbox defaults to on). Failures here never
  // block the download — the follows are the gate.
  if (prefs.repost !== false && !status.reposted) {
    try {
      const trackId = await getTrackId(accessToken, trackSlug);
      if (trackId) {
        status.reposted = await repostTrack(accessToken, trackId);
        console.log(`[gate] repost track=${trackId} -> ok`);
      }
    } catch (error) {
      console.log(`[gate] repost FAILED: ${detailOf(error)}`);
      status.error = status.error || describeError(error);
    }
  }

  const commentText = prefs.comment?.trim();
  if (commentText && !status.commented) {
    try {
      const trackId = await getTrackId(accessToken, trackSlug);
      if (trackId) {
        status.commented = await commentOnTrack(
          accessToken,
          trackId,
          commentText
        );
        console.log(`[gate] comment track=${trackId} -> ok`);
      }
    } catch (error) {
      console.log(`[gate] comment FAILED: ${detailOf(error)}`);
      status.error = status.error || describeError(error);
    }
  }

  recordGateEngagement(trackSlug, {
    followed: status.followed,
    follows: Object.fromEntries(
      status.follows.map((target) => [target.url, target.followed])
    ),
    liked: status.liked,
    reposted: status.reposted,
    commented: status.commented
  });
  mirrorToDatabase({
    sc_user_id: gate.userId ?? null,
    sc_username: gate.username ?? null,
    sc_verified: status.followed
  });

  // The follows are what the gate is really for; a like that SoundCloud
  // refuses shouldn't hold the download hostage.
  status.unlocked = status.followed;
  return status;
};

export const readStatus = async (trackSlug: string): Promise<GateStatus> => {
  const status = emptyStatus();
  if (!status.configured) {
    return status;
  }

  // The accounts to follow are public config — the gate page lists them before
  // anyone connects, so this half runs with or without a session.
  const targets = await listFollowTargets(trackSlug);

  const gate = readGate();
  if (!gate.accessToken) {
    status.follows = targets.map((target) => ({ ...target, followed: false }));
    return status;
  }

  const engagement = gate.engagement?.[trackSlug] || {};
  const follows = engagement.follows || {};
  status.connected = true;
  status.username = gate.username || null;
  status.follows = targets.map((target) => ({
    ...target,
    followed: Boolean(follows[target.url])
  }));
  status.followed =
    status.follows.length > 0 &&
    status.follows.every((target) => target.followed);
  status.liked = Boolean(engagement.liked);
  status.reposted = Boolean(engagement.reposted);
  status.commented = Boolean(engagement.commented);
  // The gate resets on every visit: the fan re-presses the button, the
  // engagement run re-verifies each task (already-done ones just come back
  // checkmarked), and only that press unlocks the download.
  status.unlocked = false;
  return status;
};
