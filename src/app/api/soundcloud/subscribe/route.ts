import { NextRequest, NextResponse } from "next/server";
import { readGate, writeGate } from "@/lib/gateStore";
import {
  SoundcloudApiError,
  describeSoundcloudError,
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
import { logGateEvent } from "@/lib/gateEvents";

export const dynamic = "force-dynamic";

/**
 * Enrolment in "like + repost future releases".
 *
 * Downloading is the opt-in: the gate POSTs here on every download, and the
 * terms the fan has to tick before the button unlocks are what disclose it.
 * Nothing here may block the download, so every failure comes back as a plain
 * `{ ok: false }` the gate can ignore.
 */

const artistSoundcloudId = () => numericId(env.soundcloudArtistId);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const trackSlug =
    typeof body?.track === "string" && body.track.trim()
      ? body.track.trim()
      : DEFAULT_TRACK_SLUG;

  const result = await enrol(trackSlug);
  // Every outcome is written down: the gate swallows failures so they never
  // block a download, which also means nobody would otherwise see them.
  const outcome = (await result.clone().json().catch(() => ({}))) as {
    ok?: boolean;
    reason?: string;
  };
  await logGateEvent({
    kind: "enrol",
    trackSlug,
    scUsername: readGate().username,
    detail: { ok: Boolean(outcome.ok), reason: outcome.reason || null }
  });
  return result;
}

const enrol = async (trackSlug: string) => {
  if (!subscriptionsConfigured()) {
    return NextResponse.json({ ok: false, reason: "unconfigured" });
  }

  const gate = readGate();
  const userId = numericId(gate.userId);

  if (!userId) {
    // Manual-mode fans never authorised us, so there is no token to keep.
    return NextResponse.json({ ok: false, reason: "not_connected" });
  }

  // The artist's own account can't like or repost its own uploads.
  if (artistSoundcloudId() && userId === artistSoundcloudId()) {
    return NextResponse.json({ ok: false, reason: "is_artist" });
  }

  let existing;
  try {
    existing = await findBySoundcloudId(userId);
  } catch (error) {
    console.error("[subscribers] lookup failed", error);
    return NextResponse.json({ ok: false, reason: "store_failed" });
  }

  // Already enrolled: hand back the same off-switch link and touch nothing.
  // Re-minting here would burn the fan's live refresh token for no reason.
  if (existing && !existing.revoked_at) {
    return NextResponse.json({
      ok: true,
      subscribed: true,
      revokeUrl: `/unsubscribe?t=${existing.revoke_token}`
    });
  }

  /**
   * Someone who used their off switch stays off.
   *
   * Enrolment is automatic on download, so without this check a fan who
   * deliberately unsubscribed would be re-enrolled by their very next
   * download — turning an aggressive default into overriding an explicit no,
   * which is the one version of this nobody can defend. A grant that merely
   * died on SoundCloud's side carries 'token_invalid' instead and is fair to
   * re-enrol.
   */
  if (existing?.revoked_reason === "fan") {
    return NextResponse.json({ ok: false, reason: "opted_out" });
  }

  if (!gate.refreshToken) {
    // Nothing durable to keep — the cookie's token was already surrendered.
    return NextResponse.json({ ok: false, reason: "no_refresh_token" });
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
          ? describeSoundcloudError(error)
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
};

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
