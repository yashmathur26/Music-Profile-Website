import { NextResponse } from "next/server";

const MESSAGE_TYPE = "soundcloud-gate";

/** Inline JSON has to survive being parsed inside a <script> tag. */
const safeJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

/**
 * The OAuth window is opened as a popup. It hands the result back to the gate
 * via postMessage and closes itself; if it was opened as a full page instead
 * (popup blockers, in-app browsers), it falls back to a normal redirect.
 */
export const popupResponse = (
  payload: Record<string, unknown>,
  fallbackPath: string,
  status = 200
) => {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SoundCloud</title>
  </head>
  <body style="background:#150820;color:#fff;font-family:system-ui,sans-serif;padding:32px;">
    <p id="msg">Finishing up…</p>
    <script>
      (function () {
        var payload = Object.assign({ type: ${safeJson(MESSAGE_TYPE)} }, ${safeJson(payload)});
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, window.location.origin);
            window.close();
            document.getElementById("msg").textContent =
              "Done — you can close this tab.";
            return;
          }
        } catch (e) {}
        window.location.replace(${safeJson(fallbackPath)});
      })();
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
};
