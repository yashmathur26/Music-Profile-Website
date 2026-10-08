import {
  SoundcloudApiError,
  likeTrack,
  numericId,
  repostTrack,
  resolveTrackMeta,
  soundcloudConfigured
} from "@/lib/soundcloud";
import {
  getAccessToken,
  listActions,
  listActive,
  recordAction,
  subscriptionsConfigured
} from "@/lib/releaseSubscribers";
import { findTrack } from "@/lib/trackStore";
import { getTrackPermalink } from "@/lib/tracks";

/**
 * The release fan-out: like and repost one track from every fan who opted in.
 *
 * Lives here rather than in a route because three callers need exactly the
 * same behaviour — the manual endpoint, the queue drain the admin portal's
 * checkbox feeds, and anything added later. Divergence between "the artist
 * pressed the button" and "the cron did it" is the kind of bug nobody notices
 * until a release goes out twice.
 */

const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 1000;
/** Consecutive 403s that mean SoundCloud has shut the write API, not that one
 * fan is unusual — see the June 2026 note in docs/SOUNDCLOUD_GATE_SETUP.md. */
const BLOCKED_STREAK_LIMIT = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Outcome = {
  username: string | null;
  liked: boolean;
  reposted: boolean;
  error: string | null;
};

export type AnnounceSummary = {
  track: { slug: string; trackId: string; title: string };
  dryRun: boolean;
  subscribers: number;
  alreadyActioned: number;
  queued: number;
  processed: number;
  liked: number;
  reposted: number;
  failed: number;
  revokedDeadTokens: number;
  /** Still to do after this pass — drive repeat calls off this, not off a clock. */
  remaining: number;
  abortedReason: string | null;
  sample: Outcome[];
};

export type AnnounceResult =
  | { ok: true; summary: AnnounceSummary }
  | { ok: false; status: number; error: string };

const describe = (error: unknown) =>
  error instanceof SoundcloudApiError
    ? `soundcloud_${error.status}`
    : "unknown";

/** Resolves the track's numeric SoundCloud id over the app token — no fan's
 * credentials involved, and only once per run rather than once per fan. */
const resolveTrackId = async (
  slug: string
): Promise<{ id: string; title: string } | { error: string; status: number }> => {
  const track = await findTrack(slug);
  if (!track) return { error: `No track with slug "${slug}".`, status: 404 };

  const direct = numericId(track.soundcloudTrackId);
  if (direct) return { id: direct, title: track.title };

  const permalink = getTrackPermalink(track);
  if (!permalink) {
    return {
      error: `"${slug}" has no SoundCloud track or permalink set.`,
      status: 409
    };
  }
  try {
    const resolved = await resolveTrackMeta(permalink);
    if (!resolved.id) {
      return {
        error: `Couldn't resolve a SoundCloud track id for "${slug}".`,
        status: 409
      };
    }
    return { id: resolved.id, title: track.title };
  } catch (error) {
    return {
      error: `Couldn't resolve ${permalink}: ${describe(error)}`,
      status: 502
    };
  }
};

export const announceRelease = async (options: {
  slug: string;
  /** Cap this pass; the caller re-runs until `remaining` hits 0. */
  limit?: number | null;
  dryRun?: boolean;
}): Promise<AnnounceResult> => {
  const { slug, limit = null, dryRun = false } = options;

  if (!soundcloudConfigured() || !subscriptionsConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "SoundCloud OAuth or Supabase is not configured."
    };
  }

  const resolved = await resolveTrackId(slug);
  if ("error" in resolved) {
    return { ok: false, status: resolved.status, error: resolved.error };
  }
  const { id: trackId, title } = resolved;

  let subscribers;
  let alreadyDone: Set<string>;
  try {
    subscribers = await listActive();
    // One query rather than one per fan.
    alreadyDone = new Set(
      (await listActions(slug))
        .filter((action) => action.liked && action.reposted)
        .map((action) => action.subscriber_id)
    );
  } catch (error) {
    console.error("[release] could not load subscribers", error);
    return {
      ok: false,
      status: 503,
      error: "Couldn't load the subscriber list."
    };
  }

  const pending = subscribers.filter((fan) => !alreadyDone.has(fan.id));
  const queue = limit ? pending.slice(0, limit) : pending;

  const base: AnnounceSummary = {
    track: { slug, trackId, title },
    dryRun,
    subscribers: subscribers.length,
    alreadyActioned: subscribers.length - pending.length,
    queued: queue.length,
    processed: 0,
    liked: 0,
    reposted: 0,
    failed: 0,
    revokedDeadTokens: 0,
    remaining: pending.length,
    abortedReason: null,
    sample: []
  };

  if (dryRun) return { ok: true, summary: base };

  const results: Outcome[] = [];
  let blockedStreak = 0;
  let abortedReason: string | null = null;

  for (let i = 0; i < queue.length; i++) {
    const fan = queue[i];

    const token = await getAccessToken(fan);
    if (!token.ok) {
      // A dead grant has already been revoked by getAccessToken.
      if (token.dead) base.revokedDeadTokens++;
      else base.failed++;
      results.push({
        username: fan.sc_username,
        liked: false,
        reposted: false,
        error: token.reason
      });
      if (token.reason === "soundcloud_429") {
        abortedReason = "rate_limited";
        break;
      }
      continue;
    }

    const outcome: Outcome = {
      username: fan.sc_username,
      liked: false,
      reposted: false,
      error: null
    };

    try {
      outcome.liked = await likeTrack(token.accessToken, trackId);
      blockedStreak = 0;
    } catch (error) {
      outcome.error = describe(error);
      if (error instanceof SoundcloudApiError && error.status === 403) {
        blockedStreak++;
      }
      if (error instanceof SoundcloudApiError && error.status === 429) {
        abortedReason = "rate_limited";
      }
    }

    if (!abortedReason) {
      try {
        outcome.reposted = await repostTrack(token.accessToken, trackId);
        blockedStreak = 0;
      } catch (error) {
        outcome.error = outcome.error || describe(error);
        if (error instanceof SoundcloudApiError && error.status === 403) {
          blockedStreak++;
        }
        if (error instanceof SoundcloudApiError && error.status === 429) {
          abortedReason = "rate_limited";
        }
      }
    }

    if (outcome.liked) base.liked++;
    if (outcome.reposted) base.reposted++;
    if (!outcome.liked && !outcome.reposted) base.failed++;

    try {
      await recordAction({
        subscriberId: fan.id,
        trackSlug: slug,
        liked: outcome.liked,
        reposted: outcome.reposted,
        error: outcome.error
      });
    } catch (error) {
      // Losing the log risks a duplicate repost on a re-run, so say so loudly.
      console.error(`[release] could not record ${fan.id} for ${slug}`, error);
    }

    results.push(outcome);

    if (blockedStreak >= BLOCKED_STREAK_LIMIT) abortedReason = "api_blocked";
    if (abortedReason) break;

    if ((i + 1) % BATCH_SIZE === 0) await sleep(BATCH_PAUSE_MS);
  }

  base.processed = results.length;
  base.remaining = pending.length - results.length;
  base.abortedReason = abortedReason;
  base.sample = results.slice(0, 10);

  return { ok: true, summary: base };
};
