import { NextRequest, NextResponse } from "next/server";
import { clearOauthHandoff, getOauthHandoff } from "@/lib/session";
import {
  SoundcloudApiError,
  exchangeCodeMatrix,
  fetchMe,
  numericId,
  soundcloudConfigured
} from "@/lib/soundcloud";
import { findBySoundcloudId, revoke } from "@/lib/releaseSubscribers";
import { writeGate } from "@/lib/gateStore";
import { runEngagement } from "@/lib/soundcloudGate";
import { popupResponse } from "@/lib/popupResponse";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { countryFrom, logGateEvent } from "@/lib/gateEvents";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const {
    state: storedState,
    codeVerifier,
    trackSlug,
    prefs
  } = getOauthHandoff();
  const slug = trackSlug || DEFAULT_TRACK_SLUG;
  const unsubscribing = prefs.purpose === "unsubscribe";

  /** Where a sign-in from the off-switch page lands, with what happened. */
  const backToOffSwitch = (signed: string, username?: string) => {
    const url = new URL("/unsubscribe", request.url);
    url.searchParams.set("signed", signed);
    if (username) url.searchParams.set("u", username);
    return NextResponse.redirect(url);
  };

  if (!soundcloudConfigured()) {
    return popupResponse(
      { ok: false, reason: "unconfigured" },
      `/${slug}?sc=unconfigured`
    );
  }

  // NOT searchParams.get(): that decodes "+" as a space (form-encoding
  // rules), silently corrupting any authorization code that contains "+".
  // SoundCloud then rejects the mangled code as `invalid_request` — while
  // synthetic test codes without "+" behave perfectly. Parse the raw query
  // and percent-decode only.
  const rawQuery = new URL(request.url).search;
  const rawParam = (name: string) => {
    const match = rawQuery.match(new RegExp(`[?&]${name}=([^&]*)`));
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]); // leaves "+" untouched
    } catch {
      return match[1];
    }
  };
  const code = rawParam("code");
  const state = rawParam("state");

  if (searchParams.get("error")) {
    clearOauthHandoff();
    if (unsubscribing) return backToOffSwitch("denied");
    return popupResponse({ ok: false, reason: "denied" }, `/${slug}?sc=denied`);
  }

  if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
    clearOauthHandoff();
    if (unsubscribing) return backToOffSwitch("error");
    return popupResponse(
      { ok: false, reason: "state_mismatch" },
      `/${slug}?sc=error`,
      400
    );
  }

  clearOauthHandoff();

  /** Builds the failure popup with the step name and SoundCloud's own words. */
  const failPopup = (step: string, error: unknown) => {
    console.error(`[gate] SoundCloud ${step} failed`, error);
    let reason = "auth_failed";
    let detail: string | undefined;
    if (error instanceof SoundcloudApiError) {
      reason = `${step}_${error.status}`;
      try {
        const parsed = JSON.parse(error.body) as {
          error?: string | null;
          error_code?: string;
          message?: string;
          errors?: { error_message?: string }[];
        };
        const scError = parsed.error || parsed.error_code;
        if (scError && /^[a-z_]+$/.test(scError)) reason += `_${scError}`;
        detail = (parsed.errors?.[0]?.error_message || parsed.message || "")
          .slice(0, 160);
      } catch {
        detail = error.body.slice(0, 160);
      }
    }
    return popupResponse(
      { ok: false, reason, detail: detail || undefined },
      `/${slug}?sc=error`,
      500
    );
  };

  const exchanged = await exchangeCodeMatrix(code, codeVerifier);
  if (!exchanged.ok && unsubscribing) {
    console.error("[unsubscribe] exchange failed:", exchanged.report);
    return backToOffSwitch("error");
  }
  if (!exchanged.ok) {
    console.error("[gate] all exchange variants failed:", exchanged.report);
    return popupResponse(
      { ok: false, reason: "exchange_matrix", detail: exchanged.report },
      `/${slug}?sc=error`,
      500
    );
  }
  const tokens = exchanged.tokens;

  let me;
  try {
    me = await fetchMe(tokens.accessToken);
  } catch (error) {
    if (unsubscribing) {
      console.error("[unsubscribe] couldn't read who signed in", error);
      return backToOffSwitch("error");
    }
    return failPopup("me", error);
  }

  // The off switch: they've proved which account they are, so turn it off
  // and stop. The token is dropped here — nothing is written to the gate
  // cookie and nothing runs on their account.
  if (unsubscribing) {
    try {
      const subscriber = await findBySoundcloudId(numericId(me.id));
      if (!subscriber) return backToOffSwitch("none", me.username);
      if (subscriber.revoked_at) return backToOffSwitch("already", me.username);
      await revoke(subscriber.id, "fan");
      return backToOffSwitch("off", me.username);
    } catch (error) {
      console.error("[unsubscribe] revoke after sign-in failed", error);
      return backToOffSwitch("error");
    }
  }

  try {
    writeGate({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || undefined,
      expiresAt: tokens.expiresAt || undefined,
      userId: me.id,
      username: me.username,
      profileUrl: me.permalinkUrl || undefined
    });

    // This is the moment the fan asked for: follow the artist, like the
    // track, and repost/comment if they opted in — all in one go.
    const status = await runEngagement(slug, prefs);

    const country = countryFrom(request.headers);
    await logGateEvent({
      kind: "connected",
      trackSlug: slug,
      scUsername: me.username,
      country,
      detail: { error: status.error, apiBlocked: status.apiBlocked }
    });
    if (status.unlocked) {
      await logGateEvent({
        kind: "unlock",
        trackSlug: slug,
        scUsername: me.username,
        country,
        detail: { via: "connect", liked: status.liked, reposted: status.reposted }
      });
    }

    return popupResponse(
      { ok: true, status },
      `/${slug}?sc=${status.unlocked ? "success" : "partial"}`
    );
  } catch (error) {
    return failPopup("finalize", error);
  }
}
