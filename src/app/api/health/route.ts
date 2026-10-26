import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Railway's deploy health check (railway.json). Touches nothing else, so a
 * Supabase or SoundCloud outage can't stop a deploy from going live. */
export function GET() {
  return NextResponse.json({ ok: true });
}
