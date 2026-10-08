import { NextRequest, NextResponse } from "next/server";
import { soundcloudConfigured } from "@/lib/soundcloud";
import {
  getAccessToken,
  listActive,
  subscriptionsConfigured
} from "@/lib/releaseSubscribers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 1000;
const DEFAULT_LIMIT = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Daily keepalive for the release subscribers' SoundCloud grants.
 *
 * A refresh token that is never used can be aged out by the provider, and a
 * grant the fan revoked on SoundCloud's side gives no notification at all —
 * you only find out when you try to use it. Touching every token once a day
 * means two things:
 *
 *  - the grants stay warm, so a release that lands two months from now still
 *    has live tokens to work with, and
 *  - dead grants are revoked here, quietly, instead of being discovered
 *    mid-release — so the subscriber count the dashboard shows is honest.
 *
 * Wired to Vercel Cron in vercel.json, authorised with CRON_SECRET. Fans are
 * processed oldest-refresh-first, so even if a very long list runs out of time,
 * successive days work through all of it.
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

  const limitParam = Number(
    new URL(request.url).searchParams.get("limit") || DEFAULT_LIMIT
  );
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;

  let subscribers;
  try {
    subscribers = await listActive();
  } catch (error) {
    console.error("[cron] could not load subscribers", error);
    return NextResponse.json(
      { error: "Couldn't load the subscriber list." },
      { status: 503 }
    );
  }

  const queue = [...subscribers]
    .sort((a, b) =>
      (a.last_refreshed_at || a.created_at).localeCompare(
        b.last_refreshed_at || b.created_at
      )
    )
    .slice(0, limit);

  let refreshed = 0;
  let stillValid = 0;
  let revoked = 0;
  let failed = 0;
  let abortedReason: string | null = null;

  for (let i = 0; i < queue.length; i++) {
    const result = await getAccessToken(queue[i]);
    if (result.ok) {
      if (result.refreshed) refreshed++;
      else stillValid++;
    } else if (result.dead) {
      revoked++;
    } else {
      failed++;
      if (result.reason === "soundcloud_429") {
        // Back off entirely; tomorrow's run picks these up.
        abortedReason = "rate_limited";
        break;
      }
    }

    if ((i + 1) % BATCH_SIZE === 0) await sleep(BATCH_PAUSE_MS);
  }

  return NextResponse.json({
    active: subscribers.length,
    checked: refreshed + stillValid + revoked + failed,
    refreshed,
    stillValid,
    revoked,
    failed,
    abortedReason
  });
};

export const GET = handle;
export const POST = handle;
