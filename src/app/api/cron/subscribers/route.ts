import { NextRequest, NextResponse } from "next/server";
import { soundcloudConfigured } from "@/lib/soundcloud";
import { announceRelease } from "@/lib/releaseRun";
import {
  getAccessToken,
  listActive,
  nextAnnouncement,
  subscriptionsConfigured,
  updateAnnouncement
} from "@/lib/releaseSubscribers";

export const dynamic = "force-dynamic";
// Must stay below the cron interval: two overlapping runs would refresh the
// same single-use tokens and invalidate each other.
export const maxDuration = 300;

/** Fans per announcement pass. Keeps the writes trickling rather than
 * arriving as one burst from a single client id. */
const ANNOUNCE_CHUNK = 150;
/** Fans per keepalive pass. */
const KEEPALIVE_CHUNK = 100;
/** How stale a grant gets before it's touched again. Under a day, so every
 * subscriber is exercised daily even though the ticks are shared with
 * announcement work. */
const KEEPALIVE_AFTER_MS = 20 * 60 * 60 * 1000;

/**
 * The single worker behind the subscription feature. Runs every ten minutes
 * and does exactly one of two jobs, never both:
 *
 *  1. drain the release queue the portal's "Tell my subscribers" checkbox
 *     feeds, 150 fans at a time;
 *  2. otherwise, refresh the grants that haven't been touched in 20 hours.
 *
 * One cron rather than two on purpose. SoundCloud's refresh tokens are
 * single-use, so two jobs refreshing the same fan at the same moment would
 * leave the loser holding a token SoundCloud has already retired — which
 * comes back as `invalid_grant`, indistinguishable from a fan who revoked
 * access, and would unsubscribe them for good. Serialising the work removes
 * that race by construction instead of hoping the schedules never collide.
 * maxDuration is held under the interval so a run can't overlap itself either.
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
  return keepalive();
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
    limit: ANNOUNCE_CHUNK
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
