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
import {
  SubscriberPlan,
  normalizePlan,
  planIsNoop,
  removalDueAt
} from "@/lib/subscriberPlan";
import {
  LEFT_ALONE_PREFIX,
  loadArtistFollowings,
  loadProfile,
  screenProfile
} from "@/lib/fanScreen";

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
/** Never sit on an open function for longer than this waiting to pace: the
 * caller's own timeout is the real limit, and the leftovers are picked up on
 * the next tick anyway. */
const MAX_PACE_WAIT_MS = 30_000;
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
  /** What this gate was allowed to do, after clamping — worth echoing back so
   * a run that only liked isn't mistaken for a run whose reposts all failed. */
  plan: SubscriberPlan;
  /** When this pass's likes/reposts are due to come back off, or null when the
   * gate keeps them. */
  removeAfter: string | null;
  dryRun: boolean;
  subscribers: number;
  alreadyActioned: number;
  queued: number;
  processed: number;
  liked: number;
  reposted: number;
  failed: number;
  /** Saved fans this release skipped on purpose — see lib/fanScreen.ts. */
  leftAlone: number;
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
): Promise<
  | { id: string; title: string; plan: SubscriberPlan }
  | { error: string; status: number }
> => {
  const track = await findTrack(slug);
  if (!track) return { error: `No track with slug "${slug}".`, status: 404 };
  const plan = normalizePlan(track.subscriberPlan);

  const direct = numericId(track.soundcloudTrackId);
  if (direct) return { id: direct, title: track.title, plan };

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
    return { id: resolved.id, title: track.title, plan };
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
  /**
   * Milliseconds to leave between fans, so one pass's writes trickle out
   * instead of landing in the same second. The cron sets this from the gate's
   * rollout window; a direct caller can leave it off and get the old
   * batch-of-20 pacing.
   */
  paceMs?: number | null;
  /**
   * Turns this pass into one slice of a timed rollout.
   *
   * The gate says how long a release should take to go out; the cron fires
   * on a fixed tick and has no idea how far through that window it is. Given
   * when the release started and how many fans are already done, this works
   * out the share that belongs to this tick and how far apart to space it —
   * which is what keeps a release arriving as a trickle rather than as one
   * burst of identical writes from a single client id.
   */
  rollout?: {
    /** When the release began. Null means it starts now. */
    startedAt: string | null;
    /** Fans completed by earlier passes. */
    alreadyProcessed: number;
    /** How much of the window one tick covers. */
    tickMs: number;
    /** How much of that tick this pass may actually spend spacing writes —
     * under the function's own timeout, with headroom. */
    spreadMs: number;
  } | null;
  dryRun?: boolean;
}): Promise<AnnounceResult> => {
  const {
    slug,
    limit = null,
    paceMs: fixedPace = null,
    rollout = null,
    dryRun = false
  } = options;

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
  const { id: trackId, title, plan } = resolved;

  if (planIsNoop(plan)) {
    return {
      ok: false,
      status: 409,
      error:
        `"${slug}" has both Like and Repost switched off for subscribers, ` +
        "so there is nothing to send."
    };
  }

  // Fixed for the whole pass rather than per fan: everyone in one release
  // should come back off together, and it keeps the teardown's ordering
  // meaningful.
  const removeAfter = removalDueAt(plan);

  let subscribers;
  let alreadyDone: Set<string>;
  try {
    subscribers = await listActive();
    // One query rather than one per fan.
    // "Done" means every action this gate asks for is currently in place. A
    // row whose like/repost has since been removed on retention is not done:
    // sending the release again should put it back, which is exactly what the
    // artist is asking for when they press the button a second time.
    // A fan this release deliberately left alone is done too.
    alreadyDone = new Set(
      (await listActions(slug))
        .filter(
          (action) =>
            action.error?.startsWith(LEFT_ALONE_PREFIX) ||
            (!action.removed_at &&
              (!plan.like || action.liked) &&
              (!plan.repost || action.reposted))
        )
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

  let queue = limit ? pending.slice(0, limit) : pending;
  let paceMs = fixedPace;

  if (rollout && pending.length) {
    const windowMs = plan.rolloutMinutes * 60_000;
    const startedAt = rollout.startedAt ? Date.parse(rollout.startedAt) : NaN;
    const elapsed = Number.isNaN(startedAt)
      ? 0
      : Math.max(0, Date.now() - startedAt);

    // The share of the whole release that should be done by the time this
    // tick's slice of the window is over.
    const total = rollout.alreadyProcessed + pending.length;
    const fraction =
      windowMs <= 0 ? 1 : Math.min(1, (elapsed + rollout.tickMs) / windowMs);
    const targetDone = Math.ceil(total * fraction);

    // At least one per tick: a release with fewer fans than ticks would
    // otherwise round down to nothing and never finish. A run that has
    // fallen behind its window catches up here rather than staying behind.
    const share = Math.max(1, targetDone - rollout.alreadyProcessed);
    queue = pending.slice(0, Math.min(share, limit ?? pending.length));

    // Space this tick's share across the tick, but never drag past the end
    // of the window the artist asked for.
    const remainingWindow = Math.max(0, windowMs - elapsed);
    const spreadOver = Math.min(
      rollout.spreadMs,
      remainingWindow || rollout.spreadMs
    );
    paceMs = queue.length > 1 ? Math.floor(spreadOver / queue.length) : 0;
  }

  const base: AnnounceSummary = {
    track: { slug, trackId, title },
    plan,
    removeAfter,
    dryRun,
    subscribers: subscribers.length,
    alreadyActioned: subscribers.length - pending.length,
    queued: queue.length,
    processed: 0,
    liked: 0,
    reposted: 0,
    failed: 0,
    leftAlone: 0,
    revokedDeadTokens: 0,
    remaining: pending.length,
    abortedReason: null,
    sample: []
  };

  if (dryRun) return { ok: true, summary: base };

  // Who the artist follows, once per pass. Without it we can't tell who to
  // leave alone, so nobody is touched until it can be read.
  let following: Set<string>;
  try {
    following = queue.length ? await loadArtistFollowings() : new Set();
  } catch (error) {
    console.error("[release] could not read who the artist follows", error);
    return { ok: true, summary: { ...base, abortedReason: "followings_unavailable" } };
  }

  const results: Outcome[] = [];
  let blockedStreak = 0;
  let abortedReason: string | null = null;
  const startedAt = Date.now();

  for (let i = 0; i < queue.length; i++) {
    const fan = queue[i];

    // Hold this fan back until their slot in the rollout comes round. The
    // wait is measured from the start of the pass rather than slept between
    // calls, so time SoundCloud spends answering counts towards the spacing
    // instead of stretching it.
    if (paceMs && i > 0) {
      const due = startedAt + i * paceMs;
      const wait = Math.min(due - Date.now(), MAX_PACE_WAIT_MS);
      if (wait > 0) await sleep(wait);
    }

    // Big accounts and people the artist follows are left alone. A lookup
    // that fails for a passing reason leaves them for the next pass rather
    // than acting without knowing.
    let screen;
    try {
      screen = screenProfile(await loadProfile(fan.sc_user_id), following);
    } catch (error) {
      base.failed++;
      results.push({
        username: fan.sc_username,
        liked: false,
        reposted: false,
        error: `profile_${describe(error)}`
      });
      if (error instanceof SoundcloudApiError && error.status === 429) {
        abortedReason = "rate_limited";
        break;
      }
      continue;
    }
    if (!screen.ok) {
      base.leftAlone++;
      const error = `${LEFT_ALONE_PREFIX}${screen.reason}`;
      results.push({ username: fan.sc_username, liked: false, reposted: false, error });
      try {
        await recordAction({
          subscriberId: fan.id,
          trackSlug: slug,
          liked: false,
          reposted: false,
          error,
          removeAfter: null
        });
      } catch (recordError) {
        console.error(`[release] could not record ${fan.id} as left alone`, recordError);
      }
      continue;
    }

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

    /** Runs one write, folding its failure into the shared circuit breaker. */
    const attempt = async (run: () => Promise<boolean>) => {
      try {
        const ok = await run();
        blockedStreak = 0;
        return ok;
      } catch (error) {
        outcome.error = outcome.error || describe(error);
        if (error instanceof SoundcloudApiError && error.status === 403) {
          blockedStreak++;
        }
        if (error instanceof SoundcloudApiError && error.status === 429) {
          abortedReason = "rate_limited";
        }
        return false;
      }
    };

    if (plan.like) {
      outcome.liked = await attempt(() => likeTrack(token.accessToken, trackId));
    }

    if (plan.repost && !abortedReason) {
      outcome.reposted = await attempt(() =>
        repostTrack(token.accessToken, trackId)
      );
    }

    if (outcome.liked) base.liked++;
    if (outcome.reposted) base.reposted++;
    // Failure is "nothing the gate asked for landed" — with repost switched
    // off, a successful like is a complete success, not half of one.
    const wanted = (plan.like ? 1 : 0) + (plan.repost ? 1 : 0);
    const landed = (outcome.liked ? 1 : 0) + (outcome.reposted ? 1 : 0);
    if (landed === 0 && wanted > 0) base.failed++;

    try {
      await recordAction({
        subscriberId: fan.id,
        trackSlug: slug,
        liked: outcome.liked,
        reposted: outcome.reposted,
        error: outcome.error,
        // Only schedule a teardown for something that actually landed.
        removeAfter: landed > 0 ? removeAfter : null
      });
    } catch (error) {
      // Losing the log risks a duplicate repost on a re-run, so say so loudly.
      console.error(`[release] could not record ${fan.id} for ${slug}`, error);
    }

    results.push(outcome);

    if (blockedStreak >= BLOCKED_STREAK_LIMIT) abortedReason = "api_blocked";
    if (abortedReason) break;

    // Unpaced callers keep the original batch breather.
    if (!paceMs && (i + 1) % BATCH_SIZE === 0) await sleep(BATCH_PAUSE_MS);
  }

  base.processed = results.length;
  base.remaining = pending.length - results.length;
  base.abortedReason = abortedReason;
  base.sample = results.slice(0, 10);

  return { ok: true, summary: base };
};
