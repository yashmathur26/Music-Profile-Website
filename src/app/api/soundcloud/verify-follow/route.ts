import { NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";
import { checkFollowings } from "@/lib/soundcloud";
import { env } from "@/utils/env";

export async function GET() {
  if (
    !process.env.SOUNDCLOUD_CLIENT_ID ||
    !process.env.SOUNDCLOUD_CLIENT_SECRET ||
    !process.env.SOUNDCLOUD_REDIRECT_URI ||
    !process.env.SOUNDCLOUD_ARTIST_ID
  ) {
    return NextResponse.json({ verified: false });
  }
  const sessionId = getOrCreateSessionId();
  const session = await getSession(sessionId);
  if (!session?.sc_access_token) {
    return NextResponse.json({ verified: false });
  }
  if (session.sc_verified) {
    return NextResponse.json({ verified: true });
  }

  try {
    const verified = await checkFollowings(
      session.sc_access_token,
      env.soundcloudArtistId as string
    );
    if (verified) {
      await updateSession(sessionId, { sc_verified: true });
    }
    return NextResponse.json({ verified });
  } catch {
    return NextResponse.json({ verified: false }, { status: 500 });
  }
}
