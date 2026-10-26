import { NextResponse } from "next/server";
import { schedulerStatus } from "@/lib/scheduler";
import { listActive, subscriptionsConfigured } from "@/lib/releaseSubscribers";

export const dynamic = "force-dynamic";

/** The keepalive's own threshold is 20 hours; past this, it isn't keeping up. */
const OVERDUE_MS = 26 * 60 * 60 * 1000;

/**
 * Is the cron alive, and are the saved fans' grants being kept fresh?
 *
 * Public on purpose, so it can be checked with a plain curl after a deploy —
 * which is also why it says nothing about who anyone is: counts and
 * timestamps only, never usernames or tokens.
 */
export async function GET() {
  let subscribers: Record<string, unknown> | null = null;
  if (subscriptionsConfigured()) {
    try {
      const active = await listActive();
      const now = Date.now();
      const lastTouch = (fan: (typeof active)[number]) =>
        Date.parse(fan.last_refreshed_at || fan.created_at);
      const touches = active.map(lastTouch).filter((t) => !Number.isNaN(t));
      subscribers = {
        active: active.length,
        // A refresh since signup is the proof a grant still works.
        refreshedSinceSignup: active.filter(
          (fan) => fan.last_refreshed_at && fan.last_refreshed_at !== fan.created_at
        ).length,
        overdue: touches.filter((t) => now - t > OVERDUE_MS).length,
        oldestTouch: touches.length ? new Date(Math.min(...touches)).toISOString() : null
      };
    } catch {
      subscribers = { error: "couldn't read release_subscribers" };
    }
  }

  return NextResponse.json(
    { scheduler: schedulerStatus(), subscribers },
    { headers: { "Cache-Control": "no-store" } }
  );
}
