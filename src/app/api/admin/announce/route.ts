import { NextRequest, NextResponse } from "next/server";
import { requestAnnouncement, subscriptionsConfigured } from "@/lib/releaseSubscribers";
import { findTrack } from "@/lib/trackStore";

export const dynamic = "force-dynamic";

/** Same credential as the rest of the admin portal. */
const authorized = (request: NextRequest) => {
  const secret = process.env.TRIGGER_SAVES_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const key = request.nextUrl.searchParams.get("key") || "";
  return bearer === secret || key === secret;
};

/**
 * Queues "like + repost this from every subscriber" for one gate.
 *
 * Only ever enqueues — the fan-out itself belongs to
 * /api/cron/process-announcements, because it can outlive any request and
 * because trickling it out beats firing every account at SoundCloud in the
 * same second. The portal ticks this on gate creation, or fires it from the
 * button on an existing gate.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!subscriptionsConfigured()) {
    return NextResponse.json(
      { error: "Supabase isn't configured, so there are no subscribers yet." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const slug = typeof body?.track === "string" ? body.track.trim() : "";
  if (!slug) {
    return NextResponse.json({ error: "Which track?" }, { status: 400 });
  }

  // Catch a typo here rather than letting the cron park it as failed.
  const track = await findTrack(slug);
  if (!track) {
    return NextResponse.json(
      { error: `No gate at /${slug}.` },
      { status: 404 }
    );
  }

  try {
    const announcement = await requestAnnouncement(slug);
    return NextResponse.json({ queued: true, announcement });
  } catch (error) {
    console.error("[admin] could not queue the announcement", error);
    return NextResponse.json(
      {
        error:
          "Couldn't queue it — the release_announcements table may be missing. " +
          "See docs/RELEASE_SUBSCRIBERS_SETUP.md."
      },
      { status: 503 }
    );
  }
}
