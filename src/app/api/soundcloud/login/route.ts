import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { buildAuthUrl } from "@/lib/soundcloud";
import { getOrCreateSessionId, setOauthState } from "@/lib/session";

export async function GET(request: NextRequest) {
  if (
    !process.env.SOUNDCLOUD_CLIENT_ID ||
    !process.env.SOUNDCLOUD_CLIENT_SECRET ||
    !process.env.SOUNDCLOUD_REDIRECT_URI
  ) {
    return NextResponse.json(
      { error: "SoundCloud OAuth is not configured." },
      { status: 500 }
    );
  }
  getOrCreateSessionId();
  const state = nanoid();
  setOauthState(state);
  const url = buildAuthUrl(state);
  return NextResponse.redirect(url);
}
