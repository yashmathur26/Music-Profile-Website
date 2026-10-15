import {
  SoundcloudApiError,
  numericId,
  resolveTrackMeta,
  unlikeTrack,
  unrepostTrack
} from "@/lib/soundcloud";
import {
  DueRemoval,
  getAccessToken,
  listDueRemovals,
  markRemoved,
  noteRemovalFailure
} from "@/lib/releaseSubscribers";
import { findTrack } from "@/lib/trackStore";
import { getTrackPermalink } from "@/lib/tracks";

/**
 * The other half of the release fan-out: taking it back off.
 *
 * A gate with a retention set gives each like and repost a deadline. This
 * runs past that deadline and undoes them, so a fan who downloaded one song
 * isn't left with a repost on their profile for good. It is the part of the
 * feature that makes the unattended writes a loan rather than a permanent
 * mark on a stranger's account, which means a removal that quietly fails is
 * worse than one that never ran — every outcome below is written to the row.
 *
 * Deliberately never touches follows. The fan followed to unlock a download;
 * that was their own action, and unfollowing behind their back would be a
 * second unattended write they never asked for.
 */

/** Rows per pass. The cron calls this on ticks where nothing is going out. */
export const TEARDOWN_CHUNK = 60;

/** Consecutive 403s that mean SoundCloud has shut the write API — same
 * breaker as the fan-out, for the same reason. */
const BLOCKED_STREAK_LIMIT = 5;

export type TeardownSummary = {
  due: number;
  processed: number;
  unliked: number;
  unreposted: number;
  /** Rows written off because we can never remove them — the fan revoked us,
   * or the gate they came from is gone. */
  abandoned: number;
  failed: number;
  abortedReason: string | null;
};

const describe = (error: unknown) =>
  error instanceof SoundcloudApiError
    ? `soundcloud_${error.status}`
    : "unknown";

/**
 * The SoundCloud track id for a slug, resolved over the app token and cached
 * for the pass. `null` means the gate is gone and nothing can be resolved —
 * permanent, and the caller writes those rows off. A throw means SoundCloud
 * couldn't answer, which is worth retrying.
 */
const trackIdResolver = () => {
  const cache = new Map<string, string | null>();
  return async (slug: string): Promise<string | null> => {
    const hit = cache.get(slug);
    if (hit !== undefined) return hit;

    const track = await findTrack(slug);
    if (!track) {
      cache.set(slug, null);
      return null;
    }

    const direct = numericId(track.soundcloudTrackId);
    if (direct) {
      cache.set(slug, direct);
      return direct;
    }

    const permalink = getTrackPermalink(track);
    if (!permalink) {
      cache.set(slug, null);
      return null;
    }

    // Deliberately outside the cache on failure: a SoundCloud outage now
    // shouldn't poison the slug for the rest of the pass.
    const resolved = await resolveTrackMeta(permalink);
    if (!resolved.id) {
      cache.set(slug, null);
      return null;
    }
    cache.set(slug, resolved.id);
    return resolved.id;
  };
};

/** Nothing left to remove with — the grant is gone, so say so and stop. */
const hasUsableGrant = (row: DueRemoval) =>
  Boolean(row.subscriber && !row.subscriber.revoked_at && row.subscriber.refresh_token);

/**
 * One access token per fan per pass.
 *
 * A fan who downloaded two songs has two rows here, and they usually fall due
 * together. Calling getAccessToken for each would refresh twice off the same
 * snapshot — and SoundCloud's refresh tokens are single-use, so the second
 * call presents one that has already been retired. That comes back as
 * `invalid_grant`, which this codebase cannot tell apart from a fan who
 * revoked access, so it would unsubscribe them for good. Resolving once per
 * fan and reusing the result removes the race rather than hoping duplicates
 * never land in the same chunk.
 */
const tokenResolver = () => {
  const cache = new Map<string, Awaited<ReturnType<typeof getAccessToken>>>();
  return async (subscriber: NonNullable<DueRemoval["subscriber"]>) => {
    const hit = cache.get(subscriber.id);
    if (hit) return hit;
    const result = await getAccessToken(subscriber);
    cache.set(subscriber.id, result);
    return result;
  };
};

export const runTeardown = async (
  limit: number = TEARDOWN_CHUNK
): Promise<TeardownSummary> => {
  const due = await listDueRemovals(limit);
  const summary: TeardownSummary = {
    due: due.length,
    processed: 0,
    unliked: 0,
    unreposted: 0,
    abandoned: 0,
    failed: 0,
    abortedReason: null
  };

  const resolveId = trackIdResolver();
  const resolveToken = tokenResolver();
  let blockedStreak = 0;

  for (const row of due) {
    if (!hasUsableGrant(row)) {
      // The fan revoked us, so their like and repost stay where they are.
      // Recording that is the honest outcome; pretending we removed them
      // would leave the row saying something untrue about their account.
      await markRemoved({
        actionId: row.id,
        liked: row.liked,
        reposted: row.reposted,
        error: "no_grant"
      });
      summary.abandoned++;
      continue;
    }

    let trackId: string | null;
    try {
      trackId = await resolveId(row.track_slug);
    } catch (error) {
      await noteRemovalFailure({ action: row, reason: describe(error) });
      summary.failed++;
      continue;
    }

    if (!trackId) {
      await markRemoved({
        actionId: row.id,
        liked: row.liked,
        reposted: row.reposted,
        error: "track_unresolved"
      });
      summary.abandoned++;
      continue;
    }

    const token = await resolveToken(row.subscriber!);
    if (!token.ok) {
      if (token.dead) {
        await markRemoved({
          actionId: row.id,
          liked: row.liked,
          reposted: row.reposted,
          error: "no_grant"
        });
        summary.abandoned++;
      } else {
        await noteRemovalFailure({ action: row, reason: token.reason });
        summary.failed++;
        if (token.reason === "soundcloud_429") {
          summary.abortedReason = "rate_limited";
          break;
        }
      }
      continue;
    }

    // What is still on the account when this row is done. Starts as what we
    // put there and is cleared only by a removal that actually succeeded.
    let stillLiked = row.liked;
    let stillReposted = row.reposted;
    let failure: string | null = null;

    const attempt = async (run: () => Promise<boolean>) => {
      try {
        const ok = await run();
        blockedStreak = 0;
        return ok;
      } catch (error) {
        failure = failure || describe(error);
        if (error instanceof SoundcloudApiError && error.status === 403) {
          blockedStreak++;
        }
        if (error instanceof SoundcloudApiError && error.status === 429) {
          summary.abortedReason = "rate_limited";
        }
        return false;
      }
    };

    const id = trackId;
    if (stillLiked) {
      if (await attempt(() => unlikeTrack(token.accessToken, id))) {
        stillLiked = false;
        summary.unliked++;
      }
    }

    if (stillReposted && !summary.abortedReason) {
      if (await attempt(() => unrepostTrack(token.accessToken, id))) {
        stillReposted = false;
        summary.unreposted++;
      }
    }

    if (failure) {
      // Whatever did come off is written back, so the retry only takes off
      // what is genuinely still there.
      const written = await noteRemovalFailure({
        action: row,
        reason: failure,
        liked: stillLiked,
        reposted: stillReposted
      });
      if (written) summary.abandoned++;
      else summary.failed++;
    } else {
      await markRemoved({
        actionId: row.id,
        liked: stillLiked,
        reposted: stillReposted,
        error: null
      });
      summary.processed++;
    }

    if (blockedStreak >= BLOCKED_STREAK_LIMIT) summary.abortedReason = "api_blocked";
    if (summary.abortedReason) break;
  }

  return summary;
};
