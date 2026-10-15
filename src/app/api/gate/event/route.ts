import { NextRequest, NextResponse } from "next/server";
import { countryFrom, describeSource, logGateEvent } from "@/lib/gateEvents";
import { getOrCreateSessionId } from "@/lib/session";
import { findTrack } from "@/lib/trackStore";

export const dynamic = "force-dynamic";

/**
 * The two gate events only the browser can see: a page view, and a fan
 * taking the manual "open SoundCloud yourself" route. Everything that proves
 * a fan did something is logged server-side instead, so this endpoint being
 * public costs nothing but the accuracy of the view count.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const kind = body?.kind === "manual" ? "manual" : body?.kind === "view" ? "view" : null;
  const track = typeof body?.track === "string" ? await findTrack(body.track) : undefined;
  if (!kind || !track) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await logGateEvent({
    kind,
    trackSlug: track.slug,
    // Views mint the visitor cookie, so every later step joins up with it.
    sessionId: getOrCreateSessionId(),
    country: countryFrom(request.headers),
    referrer: kind === "view" ? describeSource(body?.referrer, body?.utm) : null
  });
  return NextResponse.json({ ok: true });
}
