import { NextRequest, NextResponse } from "next/server";
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
  subscriptionsConfigured,
  type ReleaseSubscriber
} from "@/lib/releaseSubscribers";
import { findTrack } from "@/lib/trackStore";
import { getTrackPermalink } from "@/lib/tracks";

export const dynamic = "force-dynamic";
// Hundreds of fans x two API calls each — this is the longest-running thing in
// the app. `limit` exists so a big list can be worked through in chunks that
// each finish inside the platform's ceiling.
export const maxDuration = 300;

const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 1000;
/** Consecutive 403s that mean SoundCloud has shut the write API, not that one
 * fan is unusual — see the June 2026 note in docs/SOUNDCLOUD_GATE_SETUP.md. */
const BLOCKED_STREAK_LIMIT = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = {
  username: string | null;
  liked: boolean;
  reposted: boolean;
  error: string | null;
};

const describe = (error: unknown) =>
  error instanceof SoundcloudApiError
    ? `soundcloud_${error.status}`
    : "unknown";

/**
 * Likes and reposts a new release on behalf of every fan who ticked the
 * "like + repost my future releases" box on a download gate.
 *
 * Call it once the track is public:
 *
 *   curl -X POST https://yvshmusic.com/api/releases/announce \
 *     -H "Authorization: Bearer $RELEASE_TRIGGER_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"track":"new-song-slug"}'
 *
 * Safe to re-run: every fan's result is recorded per release, and an already
 * actioned fan is skipped rather than actioned twice.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RELEASE_TRIGGER_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!soundcloudConfigured() || !subscriptionsConfigured()) {
    return NextResponse.json(
      { error: "SoundCloud OAuth or Supabase is not configured." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const slug = typeof body?.track === "string" ? body.track.trim() : "";
  const dryRun = body?.dryRun === true;
  const limit =
    typeof body?.limit === "number" && body.limit > 0
      ? Math.floor(body.limit)
      : null;

  if (!slug) {
    return NextResponse.json(
      { error: 'Pass the release as {"track":"<slug>"}.' },
      { status: 400 }
    );
  }

  const track = await findTrack(slug);
  if (!track) {
    return NextResponse.json(
      { error: `No track with slug "${slug}".` },
      { status: 404 }
    );
  }

  // Resolved once, over the app-level token — no fan's credentials involved.
  let trackId = numericId(track.soundcloudTrackId);
  if (!trackId) {
    const permalink = getTrackPermalink(track);
    if (!permalink) {
      return NextResponse.json(
        { error: `"${slug}" has no SoundCloud track or permalink set.` },
        { status: 409 }
      );
    }
    try {
      trackId = (await resolveTrackMeta(permalink)).id;
    } catch (error) {
      return NextResponse.json(
        { error: `Couldn't resolve ${permalink}: ${describe(error)}` },
        { status: 502 }
      );
    }
  }
  if (!trackId) {
    return NextResponse.json(
      { error: `Couldn't resolve a SoundCloud track id for "${slug}".` },
      { status: 409 }
    );
  }

  let subscribers: ReleaseSubscriber[];
  let alreadyDone: Set<string>;
  try {
    subscribers = await listActive();
    // One query instead of one per fan.
    alreadyDone = new Set(
      (await listActions(slug))
        .filter((action) => action.liked && action.reposted)
        .map((action) => action.subscriber_id)
    );
  } catch (error) {
    console.error("[release] could not load subscribers", error);
    return NextResponse.json(
      { error: "Couldn't load the subscriber list." },
      { status: 503 }
    );
  }

  const pending = subscribers.filter((fan) => !alreadyDone.has(fan.id));
  const queue = limit ? pending.slice(0, limit) : pending;

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      track: { slug, trackId, title: track.title },
      subscribers: subscribers.length,
      alreadyActioned: subscribers.length - pending.length,
      wouldAction: queue.length
    });
  }

  const results: Outcome[] = [];
  let liked = 0;
  let reposted = 0;
  let skippedDead = 0;
  let failed = 0;
  let blockedStreak = 0;
  let abortedReason: string | null = null;

  for (let i = 0; i < queue.length; i++) {
    const fan = queue[i];

    const token = await getAccessToken(fan);
    if (!token.ok) {
      if (token.dead) {
        // Already revoked by getAccessToken — the fan's grant is gone.
        skippedDead++;
      } else {
        failed++;
      }
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

    if (outcome.liked) liked++;
    if (outcome.reposted) reposted++;
    if (!outcome.liked && !outcome.reposted) failed++;

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

    if (blockedStreak >= BLOCKED_STREAK_LIMIT) {
      abortedReason = "api_blocked";
    }
    if (abortedReason) break;

    if ((i + 1) % BATCH_SIZE === 0) await sleep(BATCH_PAUSE_MS);
  }

  const processed = results.length;
  return NextResponse.json({
    track: { slug, trackId, title: track.title },
    subscribers: subscribers.length,
    alreadyActioned: subscribers.length - pending.length,
    queued: queue.length,
    processed,
    liked,
    reposted,
    failed,
    revokedDeadTokens: skippedDead,
    remaining: pending.length - processed,
    abortedReason,
    ...(abortedReason === "api_blocked"
      ? {
          note:
            "SoundCloud answered with 403 repeatedly — the write API is " +
            "likely paused. Nothing further was attempted; re-run later, " +
            "it picks up where it stopped."
        }
      : {}),
    sample: results.slice(0, 10)
  });
}
