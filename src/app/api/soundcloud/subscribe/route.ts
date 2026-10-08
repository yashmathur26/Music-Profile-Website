import { NextRequest, NextResponse } from "next/server";
import { readGate, writeGate } from "@/lib/gateStore";
import {
  SoundcloudApiError,
  numericId,
  refreshAccessToken
} from "@/lib/soundcloud";
import {
  findBySoundcloudId,
  revoke,
  subscribe,
  subscriptionsConfigured
} from "@/lib/releaseSubscribers";
import { env } from "@/utils/env";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";

export const dynamic = "force-dynamic";

/**
 * The "like + repost my future releases" opt-in.
 *
 * The gate calls POST when the fan downloads with the box ticked, and DELETE if
 * they untick it having opted in before. Neither one is allowed to block the
 * download, so every failure comes back as a plain `{ ok: false }` the gate can
 * ignore.
 */

const artistSoundcloudId = () => numericId(env.soundcloudArtistId);

/** Is this fan already opted in? Lets the checkbox render in the right state. */
export async function GET() {
  if (!subscriptionsConfigured()) {
    return NextResponse.json({ available: false, subscribed: false });
  }
  const gate = readGate();
  const userId = numericId(gate.userId);
  if (!userId) {
    return NextResponse.json({ available: true, subscribed: false });
  }
  try {
    const existing = await findBySoundcloudId(userId);
    return NextResponse.json({
      available: true,
      subscribed: Boolean(existing && !existing.revoked_at)
    });
  } catch (error) {
    console.error("[subscribers] status lookup failed", error);
    return NextResponse.json({ available: false, subscribed: false });
  }
}

export async function POST(request: NextRequest) {
  if (!subscriptionsConfigured()) {
    return NextResponse.json({ ok: false, reason: "unconfigured" });
  }

  const body = await request.json().catch(() => ({}));
  const trackSlug =
    typeof body?.track === "string" && body.track.trim()
      ? body.track.trim()
      : DEFAULT_TRACK_SLUG;

  const gate = readGate();
  const userId = numericId(gate.userId);

  if (!userId || !gate.refreshToken) {
    // Manual-mode fans never authorised us, so there is no token to keep.
    return NextResponse.json({ ok: false, reason: "not_connected" });
  }

  // The artist's own account can't like or repost its own uploads.
  if (artistSoundcloudId() && userId === artistSoundcloudId()) {
    return NextResponse.json({ ok: false, reason: "is_artist" });
  }

  /**
   * Mint a fresh token pair for the subscription rather than copying the
   * cookie's.
   *
   * SoundCloud's refresh tokens are single-use: if the subscription and the
   * gate cookie both held the same one, whichever refreshed first would
   * silently invalidate the other — and the one that loses is usually the
   * subscription, weeks later, with nobody watching. So we rotate once here,
   * hand the new refresh token to the database, and strip it from the cookie.
   * The access token below keeps this visit working for its remaining hour,
   * which is far longer than the download flow needs.
   */
  let tokens;
  try {
    tokens = await refreshAccessToken(gate.refreshToken);
  } catch (error) {
    console.error("[subscribers] could not mint a durable token", error);
    return NextResponse.json({
      ok: false,
      reason:
        error instanceof SoundcloudApiError
          ? `soundcloud_${error.status}`
          : "refresh_failed"
    });
  }

  if (!tokens.refreshToken) {
    // Without a refresh token the subscription would die in an hour; don't
    // pretend it worked, and leave the cookie's token alone.
    return NextResponse.json({ ok: false, reason: "no_refresh_token" });
  }

  try {
    const subscriber = await subscribe({
      scUserId: userId,
      scUsername: gate.username,
      scProfileUrl: gate.profileUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      sourceTrackSlug: trackSlug
    });

    writeGate({
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt || undefined,
      // Explicitly surrendered: the database owns this fan's refresh token now.
      refreshToken: undefined
    });

    return NextResponse.json({
      ok: true,
      subscribed: true,
      revokeUrl: `/unsubscribe?t=${subscriber.revoke_token}`
    });
  } catch (error) {
    console.error("[subscribers] opt-in failed", error);
    return NextResponse.json({ ok: false, reason: "store_failed" });
  }
}

/** Unticking the box after a previous opt-in. */
export async function DELETE() {
  if (!subscriptionsConfigured()) {
    return NextResponse.json({ ok: false, reason: "unconfigured" });
  }
  const gate = readGate();
  const userId = numericId(gate.userId);
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "not_connected" });
  }
  try {
    const existing = await findBySoundcloudId(userId);
    if (existing && !existing.revoked_at) {
      await revoke(existing.id, "fan");
    }
    return NextResponse.json({ ok: true, subscribed: false });
  } catch (error) {
    console.error("[subscribers] opt-out failed", error);
    return NextResponse.json({ ok: false, reason: "store_failed" });
  }
}
