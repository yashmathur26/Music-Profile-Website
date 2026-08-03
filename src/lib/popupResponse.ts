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
        // The opener may be on the www or the apex host — post to both forms
        // so the message lands wherever the gate is running.
        var origins = [window.location.origin];
        var swapped = window.location.origin.indexOf("://www.") !== -1
          ? window.location.origin.replace("://www.", "://")
          : window.location.origin.replace("://", "://www.");
        if (swapped !== window.location.origin) origins.push(swapped);
        try {
          if (window.opener && !window.opener.closed) {
            for (var i = 0; i < origins.length; i++) {
              try { window.opener.postMessage(payload, origins[i]); } catch (e) {}
            }
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
