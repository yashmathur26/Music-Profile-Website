import { NextRequest } from "next/server";
import { clearOauthHandoff, getOauthHandoff } from "@/lib/session";
import {
  SoundcloudApiError,
  exchangeCodeForToken,
  fetchMe,
  soundcloudConfigured
} from "@/lib/soundcloud";
import { writeGate } from "@/lib/gateStore";
import { runEngagement } from "@/lib/soundcloudGate";
import { popupResponse } from "@/lib/popupResponse";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";

export const dynamic = "force-dynamic";
// The engagement chain (exchange + resolve + up to four writes) can outlive
// the platform's default function timeout.
export const maxDuration = 60;

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

  let tokens;
  try {
    tokens = await exchangeCodeForToken(code, codeVerifier);
  } catch (error) {
    return failPopup("exchange", error);
  }

  let me;
  try {
    me = await fetchMe(tokens.accessToken);
  } catch (error) {
    return failPopup("me", error);
  }

  try {
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
    return failPopup("finalize", error);
  }
}
