import { NextRequest, NextResponse } from "next/server";
import { findByRevokeToken, revoke } from "@/lib/releaseSubscribers";

export const dynamic = "force-dynamic";

/**
 * Turns off a fan's "like + repost my future releases" subscription.
 *
 * Deliberately POST-only and keyed on the long random revoke token: no login,
 * no session, nothing for the fan to remember — but also not something a link
 * prefetcher or an email client's image proxy can trigger by accident, which a
 * GET would be.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token) {
    return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 400 });
  }

  try {
    const subscriber = await findByRevokeToken(token);
    if (!subscriber) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    // Already off: say it worked. The fan asked for a state, not an event.
    if (!subscriber.revoked_at) {
      await revoke(subscriber.id, "fan");
    }
    return NextResponse.json({ ok: true, username: subscriber.sc_username });
  } catch (error) {
    console.error("[subscribers] revoke failed", error);
    return NextResponse.json({ ok: false, reason: "server_error" }, { status: 500 });
  }
}
