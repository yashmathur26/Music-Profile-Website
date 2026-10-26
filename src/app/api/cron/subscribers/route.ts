import { NextRequest, NextResponse } from "next/server";
import {
  SoundcloudApiError,
  describeSoundcloudError,
  getClientToken,
  soundcloudConfigured
} from "@/lib/soundcloud";
import { announceRelease } from "@/lib/releaseRun";
import { TEARDOWN_CHUNK, runTeardown } from "@/lib/releaseTeardown";
import {
  countDueRemovals,
  getAccessToken,
  listActive,
  nextAnnouncement,
  subscriptionsConfigured,
  updateAnnouncement
} from "@/lib/releaseSubscribers";

export const dynamic = "force-dynamic";
// Two overlapping runs would refresh the same single-use tokens and
// invalidate each other. lib/scheduler.ts never starts a run while one is
// still going, so nothing here needs a time limit to keep them apart.

/**
 * How often lib/scheduler.ts fires this — every five minutes on Railway.
 * The rollout maths needs to know how much of a gate's window one tick is
 * responsible for, so change the two together.
 */
const TICK_MS = 5 * 60_000;

/** How much of a tick a pass may spend spacing its writes — well inside the
 * five minutes, so a pass is finished before the scheduler's next tick. */
const SPREAD_MS = 200_000;

/** Hard ceiling on fans per announcement pass, whatever the pacing works
 * out — one tick should never become a burst from a single client id. */
const ANNOUNCE_CHUNK = 150;
/** Fans per keepalive pass. */
const KEEPALIVE_CHUNK = 100;
/** How stale a grant gets before it's touched again. Under a day, so every
 * subscriber is exercised daily even though the ticks are shared with
 * announcement work. */
const KEEPALIVE_AFTER_MS = 20 * 60 * 60 * 1000;

/**
 * The single worker behind the subscription feature. Each run does exactly
 * one of three jobs, never two:
 *
 *  1. drain the release queue the portal's "Tell my subscribers" checkbox
 *     feeds, at the pace the gate's rollout window asks for;
 *  2. otherwise, take back the likes and reposts whose retention has run out;
 *  3. otherwise, refresh the grants that haven't been touched in 20 hours.
 *
 * Announcements outrank teardowns, which outrank the keepalive. A release is
 * time-sensitive to the minute; a teardown deadline is set in days, so losing
 * a few ticks to a rollout costs it nothing.
 *
 * One cron rather than two on purpose. SoundCloud's refresh tokens are
 * single-use, so two jobs refreshing the same fan at the same moment would
 * leave the loser holding a token SoundCloud has already retired — which
 * comes back as `invalid_grant`, indistinguishable from a fan who revoked
 * access, and would unsubscribe them for good. Serialising the work removes
 * that race by construction instead of hoping the schedules never collide.
 * The scheduler waits for a run to finish before starting the next, so a run
 * can't overlap itself either.
 *
 * Announcements take priority: a release going out is time-sensitive, a
 * keepalive is not, and the keepalive window is wide enough to absorb being
 * skipped for a few ticks.
 */
const handle = async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!soundcloudConfigured() || !subscriptionsConfigured()) {
    return NextResponse.json(
      { error: "SoundCloud OAuth or Supabase is not configured." },
      { status: 503 }
    );
  }

  let job;
  try {
    job = await nextAnnouncement();
  } catch (error) {
    console.error("[subscribers-cron] could not read the queue", error);
    return NextResponse.json(
      { error: "Couldn't read the announcement queue." },
      { status: 503 }
    );
  }

  if (job) return announce(job);

  // Cheap enough to ask every idle tick, and it keeps the teardown off the
  // critical path of a release.
  let dueRemovals = 0;
  try {
    dueRemovals = await countDueRemovals();
  } catch (error) {
    console.error("[subscribers-cron] could not count due removals", error);
  }
  if (dueRemovals > 0) return teardown();

  return keepalive();
};

/**
 * Takes expired likes and reposts back off. See lib/releaseTeardown.ts — the
 * route's only job here is to run a chunk and report it.
 */
const teardown = async () => {
  try {
    const summary = await runTeardown(TEARDOWN_CHUNK);
    return NextResponse.json({ mode: "teardown", ...summary });
  } catch (error) {
    console.error("[subscribers-cron] teardown failed", error);
    return NextResponse.json(
      { mode: "teardown", error: "Teardown pass failed." },
      { status: 503 }
    );
  }
};

const announce = async (
  job: NonNullable<Awaited<ReturnType<typeof nextAnnouncement>>>
) => {
  const now = new Date().toISOString();
  await updateAnnouncement(job.id, {
    status: "running",
    startedAt: job.started_at || now,
    current: job
  });

  const result = await announceRelease({
    slug: job.track_slug,
    limit: ANNOUNCE_CHUNK,
    rollout: {
      startedAt: job.started_at,
      alreadyProcessed: job.processed,
      tickMs: TICK_MS,
      spreadMs: SPREAD_MS
    }
  });

  if (!result.ok) {
    // A track that can't be resolved won't resolve on a retry either, so park
    // it with the reason rather than spinning on it every tick.
    await updateAnnouncement(job.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      lastError: result.error,
      current: job
    });
    return NextResponse.json({
      mode: "announce",
      track: job.track_slug,
      status: "failed",
      error: result.error
    });
  }

  const { summary } = result;
  // Being told to back off is not failure — the work is kept and the next
  // tick resumes it. Only a run that can't start at all is a failure.
  const blocked = summary.abortedReason;
  const done = summary.remaining <= 0 && !blocked;

  await updateAnnouncement(job.id, {
    status: done ? "done" : "pending",
    completedAt: done ? new Date().toISOString() : null,
    addProcessed: summary.processed,
    addLiked: summary.liked,
    addReposted: summary.reposted,
    addFailed: summary.failed,
    lastError: blocked,
    current: job
  });

  return NextResponse.json({
    mode: "announce",
    track: job.track_slug,
    status: done ? "done" : "pending",
    processedThisPass: summary.processed,
    liked: summary.liked,
    reposted: summary.reposted,
    failed: summary.failed,
    removeAfter: summary.removeAfter,
    leftAlone: summary.leftAlone,
    revokedDeadTokens: summary.revokedDeadTokens,
    remaining: summary.remaining,
    abortedReason: summary.abortedReason
  });
};

/**
 * Touches each grant once a day.
 *
 * An unused refresh token can be aged out, and a fan revoking access on
 * SoundCloud's side notifies us of nothing — without this we'd only find out
 * mid-release. Dead grants are retired here instead, so the subscriber count
 * the portal shows is honest.
 */
const keepalive = async () => {
  // Prove the app's own credentials first. With a wrong secret every refresh
  // below would fail, and none of those failures would be the fans' doing —
  // better to touch nobody and say why.
  try {
    await getClientToken();
  } catch (error) {
    console.error("[subscribers-cron] SoundCloud rejected the app credentials", error);
    return NextResponse.json(
      {
        mode: "keepalive",
        abortedReason:
          error instanceof SoundcloudApiError
            ? `credentials_${describeSoundcloudError(error)}`
            : "credentials_unreachable"
      },
      { status: 503 }
    );
  }

  let subscribers;
  try {
    subscribers = await listActive();
  } catch (error) {
    console.error("[subscribers-cron] could not load subscribers", error);
    return NextResponse.json(
      { error: "Couldn't load the subscriber list." },
      { status: 503 }
    );
  }

  const cutoff = Date.now() - KEEPALIVE_AFTER_MS;
  const stale = subscribers
    .filter((fan) => {
      const last = Date.parse(fan.last_refreshed_at || fan.created_at);
      return Number.isNaN(last) || last < cutoff;
    })
    // Oldest first, so nobody is starved when the list is long.
    .sort((a, b) =>
      (a.last_refreshed_at || a.created_at).localeCompare(
        b.last_refreshed_at || b.created_at
      )
    )
    .slice(0, KEEPALIVE_CHUNK);

  let refreshed = 0;
  let revoked = 0;
  let failed = 0;
  let abortedReason: string | null = null;

  for (const fan of stale) {
    const result = await getAccessToken(fan);
    if (result.ok) refreshed++;
    else if (result.dead) revoked++;
    else {
      failed++;
      if (result.reason === "soundcloud_429") {
        // Back off entirely; the next tick picks these up.
        abortedReason = "rate_limited";
        break;
      }
    }
  }

  return NextResponse.json({
    mode: "keepalive",
    active: subscribers.length,
    stale: stale.length,
    refreshed,
    revoked,
    failed,
    abortedReason
  });
};

export const GET = handle;
export const POST = handle;
