import { NextRequest, NextResponse } from "next/server";
import { clearOauthState, getOauthState, getOrCreateSessionId } from "@/lib/session";
import { exchangeCodeForToken, fetchMe } from "@/lib/soundcloud";
import { updateSession } from "@/lib/db";

const htmlResponse = (success: boolean) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>SoundCloud Auth</title>
  </head>
  <body style="background:#0b0b0f;color:#fff;font-family:system-ui;padding:32px;">
    <p>${success ? "Auth complete. You can return to the tab." : "Auth failed."}</p>
    <script>
      (function () {
        try {
          if (window.opener) {
            window.opener.postMessage({ type: "soundcloud-auth-success" }, "*");
            window.close();
            return;
          }
        } catch (e) {}
        window.location.href = "/?oauth=${success ? "success" : "error"}";
      })();
    </script>
  </body>
</html>`;

export async function GET(request: NextRequest) {
  if (
    !process.env.SOUNDCLOUD_CLIENT_ID ||
    !process.env.SOUNDCLOUD_CLIENT_SECRET ||
    !process.env.SOUNDCLOUD_REDIRECT_URI
  ) {
    return new NextResponse(htmlResponse(false), {
      status: 500,
      headers: { "Content-Type": "text/html" }
    });
  }
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = getOauthState();

  if (!code || !state || !storedState || state !== storedState) {
    clearOauthState();
    return new NextResponse(htmlResponse(false), {
      status: 400,
      headers: { "Content-Type": "text/html" }
    });
  }

  clearOauthState();

  try {
    const sessionId = getOrCreateSessionId();
    const token = await exchangeCodeForToken(code);
    const me = await fetchMe(token.access_token);
    await updateSession(sessionId, {
      sc_access_token: token.access_token,
      sc_user_id: `${me.id}`,
      sc_verified: false
    });

    return new NextResponse(htmlResponse(true), {
      status: 200,
      headers: { "Content-Type": "text/html" }
    });
  } catch {
    return new NextResponse(htmlResponse(false), {
      status: 500,
      headers: { "Content-Type": "text/html" }
    });
  }
}
