import { NextRequest, NextResponse } from "next/server";
import { announceRelease } from "@/lib/releaseRun";
import {
  nextAnnouncement,
  subscriptionsConfigured,
  updateAnnouncement
} from "@/lib/releaseSubscribers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** One pass's worth of fans. Small enough to finish well inside the function
 * ceiling, and it keeps the writes trickling rather than arriving as one
 * burst from a single client id. */
const CHUNK = 150;

/**
 * Drains the release queue the admin portal's "tell my subscribers" checkbox
 * feeds.
 *
 * Takes the oldest unfinished release, does up to CHUNK fans, and leaves the
 * rest for the next tick — so a new gate created at 2am reaches everyone
 * without the artist waiting on a request, and a list of any size gets there
 * eventually. Re-entrant: a fan already liked *and* reposted for that release
 * is skipped, so an overlapping run costs nothing but time.
 */
const handle = async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!subscriptionsConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  let job;
  try {
    job = await nextAnnouncement();
  } catch (error) {
    console.error("[announce-queue] could not read the queue", error);
    return NextResponse.json(
      { error: "Couldn't read the announcement queue." },
      { status: 503 }
    );
  }

  if (!job) return NextResponse.json({ idle: true });

  const now = new Date().toISOString();
  await updateAnnouncement(job.id, {
    status: "running",
    startedAt: job.started_at || now,
    current: job
  });

  const result = await announceRelease({ slug: job.track_slug, limit: CHUNK });

  if (!result.ok) {
    // A track that can't be resolved will never resolve on a retry, so park
    // it as failed with the reason rather than spinning on it every tick.
    await updateAnnouncement(job.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      lastError: result.error,
      current: job
    });
    return NextResponse.json({
      track: job.track_slug,
      status: "failed",
      error: result.error
    });
  }

  const { summary } = result;
  const done = summary.remaining <= 0;
  // Being told to stop is not failure — the work is kept and the next tick
  // resumes it. Only a run that can't start at all is a failure.
  const blocked = summary.abortedReason;

  await updateAnnouncement(job.id, {
    status: done && !blocked ? "done" : "pending",
    completedAt: done && !blocked ? new Date().toISOString() : null,
    addProcessed: summary.processed,
    addLiked: summary.liked,
    addReposted: summary.reposted,
    addFailed: summary.failed,
    lastError: blocked,
    current: job
  });

  return NextResponse.json({
    track: job.track_slug,
    status: done && !blocked ? "done" : "pending",
    processedThisPass: summary.processed,
    liked: summary.liked,
    reposted: summary.reposted,
    failed: summary.failed,
    revokedDeadTokens: summary.revokedDeadTokens,
    remaining: summary.remaining,
    abortedReason: summary.abortedReason
  });
};

export const GET = handle;
export const POST = handle;
