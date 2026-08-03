import { NextRequest } from "next/server";
import { clearOauthHandoff, getOauthHandoff } from "@/lib/session";
import {
  exchangeCodeForToken,
  fetchMe,
  soundcloudConfigured
} from "@/lib/soundcloud";
import { writeGate } from "@/lib/gateStore";
import { runEngagement } from "@/lib/soundcloudGate";
import { popupResponse } from "@/lib/popupResponse";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";

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

  if (!soundcloudConfigured()) {
    return popupResponse(
      { ok: false, reason: "unconfigured" },
      `/${slug}?sc=unconfigured`
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (searchParams.get("error")) {
    clearOauthHandoff();
    return popupResponse({ ok: false, reason: "denied" }, `/${slug}?sc=denied`);
  }

  if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
    clearOauthHandoff();
    return popupResponse(
      { ok: false, reason: "state_mismatch" },
      `/${slug}?sc=error`,
      400
    );
  }

  clearOauthHandoff();

  try {
    const tokens = await exchangeCodeForToken(code, codeVerifier);
    const me = await fetchMe(tokens.accessToken);

    writeGate({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || undefined,
      expiresAt: tokens.expiresAt || undefined,
      userId: me.id,
      username: me.username
    });

    // This is the moment the fan asked for: follow the artist, like the
    // track, and repost/comment if they opted in — all in one go.
    const status = await runEngagement(slug, prefs);

    return popupResponse(
      { ok: true, status },
      `/${slug}?sc=${status.unlocked ? "success" : "partial"}`
    );
  } catch (error) {
    console.error("[gate] SoundCloud callback failed", error);
    return popupResponse(
      { ok: false, reason: "auth_failed" },
      `/${slug}?sc=error`,
      500
    );
  }
}
