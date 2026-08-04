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
import { env } from "@/utils/env";

export type GateStatus = {
  /** SoundCloud OAuth env vars are present. */
  configured: boolean;
  /** Fan has authorised us against their SoundCloud account. */
  connected: boolean;
  username: string | null;
  followed: boolean;
  liked: boolean;
  reposted: boolean;
  commented: boolean;
  unlocked: boolean;
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
  followed: false,
  liked: false,
  reposted: false,
  commented: false,
  unlocked: false,
  apiBlocked: false,
  error: null
});

/** Resolved SoundCloud ids are stable, so keep them warm per server instance. */
const resolvedIds = new Map<string, string>();

const resolveCached = async (accessToken: string, url: string) => {
  const cached = resolvedIds.get(url);
  if (cached) return cached;
  const { id } = await resolvePermalink(accessToken, url);
  if (id) {
    resolvedIds.set(url, id);
  }
  return id;
};

const getArtistId = async (accessToken: string) => {
  const configured = numericId(env.soundcloudArtistId);
  if (configured) return configured;
  return resolveCached(accessToken, ARTIST_SOUNDCLOUD_URL);
};

const getTrackId = async (accessToken: string, trackSlug: string) => {
  const track = await findTrack(trackSlug);
  if (!track) return "";
  if (track.soundcloudTrackId) return numericId(track.soundcloudTrackId);
  const permalink = getTrackPermalink(track);
  return permalink ? resolveCached(accessToken, permalink) : "";
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

/**
 * Runs the actions the gate promises — follow the artist, like the track, and
 * optionally repost and comment — on the fan's behalf, then records the
 * result. Follow/like/repost are idempotent, so retries are safe; the comment
 * is guarded by the `commented` flag because SoundCloud will happily post it
 * twice.
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

  const previous = gate.engagement?.[trackSlug] || {};
  status.followed = Boolean(previous.followed);
  status.liked = Boolean(previous.liked);
  status.reposted = Boolean(previous.reposted);
  status.commented = Boolean(previous.commented);

  if (!status.followed) {
    try {
      const artistId = await getArtistId(accessToken);
      if (artistId) {
        status.followed = await followUser(accessToken, artistId);
        console.log(`[gate] follow artist=${artistId} -> ok`);
      } else {
        status.error = "artist_unresolved";
      }
    } catch (error) {
      const detail =
        error instanceof SoundcloudApiError
          ? `${error.status} ${error.body}`
          : String(error);
      console.log(`[gate] follow FAILED: ${detail}`);
      const kind = describeError(error);
      status.error = kind;
      status.apiBlocked = kind === "blocked";
      // The write may be blocked while the fan already follows manually —
      // a read-only check still lets them through.
      try {
        const artistId = await getArtistId(accessToken);
        if (artistId) {
          status.followed = await checkFollowing(accessToken, artistId);
        }
      } catch {
        /* fall through with followed = false */
      }
    }
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
      const detail =
        error instanceof SoundcloudApiError
          ? `${error.status} ${error.body}`
          : String(error);
      console.log(`[gate] like FAILED: ${detail}`);
      const kind = describeError(error);
      status.error = status.error || kind;
      status.apiBlocked = status.apiBlocked || kind === "blocked";
    }
  }

  // Repost is opt-out (the checkbox defaults to on). Failures here never
  // block the download — the follow is the gate.
  if (prefs.repost !== false && !status.reposted) {
    try {
      const trackId = await getTrackId(accessToken, trackSlug);
      if (trackId) {
        status.reposted = await repostTrack(accessToken, trackId);
        console.log(`[gate] repost track=${trackId} -> ok`);
      }
    } catch (error) {
      const detail =
        error instanceof SoundcloudApiError
          ? `${error.status} ${error.body}`
          : String(error);
      console.log(`[gate] repost FAILED: ${detail}`);
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
      const detail =
        error instanceof SoundcloudApiError
          ? `${error.status} ${error.body}`
          : String(error);
      console.log(`[gate] comment FAILED: ${detail}`);
      status.error = status.error || describeError(error);
    }
  }

  recordGateEngagement(trackSlug, {
    followed: status.followed,
    liked: status.liked,
    reposted: status.reposted,
    commented: status.commented
  });
  mirrorToDatabase({
    sc_user_id: gate.userId ?? null,
    sc_username: gate.username ?? null,
    sc_verified: status.followed
  });

  // The follow is what the gate is really for; a like that SoundCloud refuses
  // shouldn't hold the download hostage.
  status.unlocked = status.followed;
  return status;
};

export const readStatus = async (trackSlug: string): Promise<GateStatus> => {
  const status = emptyStatus();
  if (!status.configured) {
    return status;
  }

  const gate = readGate();
  if (!gate.accessToken) {
    return status;
  }

  const engagement = gate.engagement?.[trackSlug] || {};
  status.connected = true;
  status.username = gate.username || null;
  status.followed = Boolean(engagement.followed);
  status.liked = Boolean(engagement.liked);
  status.reposted = Boolean(engagement.reposted);
  status.commented = Boolean(engagement.commented);
  // The gate resets on every visit: the fan re-presses the button, the
  // engagement run re-verifies each task (already-done ones just come back
  // checkmarked), and only that press unlocks the download.
  status.unlocked = false;
  return status;
};
