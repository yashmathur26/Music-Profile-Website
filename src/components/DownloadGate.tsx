"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import DownloadSuccess from "@/components/DownloadSuccess";

/** Mirror of the server's GateStatus. */
type GateStatus = {
  configured: boolean;
  connected: boolean;
  username: string | null;
  followed: boolean;
  liked: boolean;
  reposted: boolean;
  commented: boolean;
  unlocked: boolean;
  apiBlocked: boolean;
  error: string | null;
};

type GateMessage = {
  type: "soundcloud-gate";
  ok: boolean;
  reason?: string;
  /** SoundCloud's own error text, verbatim, when a call failed. */
  detail?: string;
  status?: GateStatus;
};

const MANUAL_KEY_PREFIX = "download_gate_manual";
const MANUAL_OUTBOUND_KEY_PREFIX = "download_gate_outbound";
/** How long a fan has to spend on SoundCloud for the manual step to count. */
const MANUAL_MIN_MS = 5000;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 180000;
/** How long to keep polling after the popup looks closed — long enough for a
 * COOP-severed flow (where `closed` lies) to finish sign-in and the callback. */
const POPUP_CLOSED_GRACE_MS = 90000;
const COMMENT_MAX = 300;

const initialStatus: GateStatus = {
  configured: false,
  connected: false,
  username: null,
  followed: false,
  liked: false,
  reposted: false,
  commented: false,
  unlocked: false,
  apiBlocked: false,
  error: null
};

const FAILURE_COPY: Record<string, string> = {
  unconfigured: "SoundCloud connect isn’t set up yet — use the manual step instead.",
  denied: "You cancelled the SoundCloud connection.",
  state_mismatch: "That session expired. Connect again.",
  auth_failed: "SoundCloud wouldn’t complete the connection.",
  blocked: "SoundCloud blocked the automatic follow — use the manual step instead.",
  rate_limited: "SoundCloud is rate-limiting us. Wait a moment, then retry.",
  reconnect: "Your SoundCloud session expired. Connect again.",
  artist_unresolved: "Couldn’t find the artist profile on SoundCloud.",
  track_unresolved: "Couldn’t find this track on SoundCloud.",
  exchange_401:
    "SoundCloud rejected the app credentials (401). The client secret on the server is likely mistyped.",
  exchange_403: "SoundCloud refused the connection (403).",
  exchange_429: "SoundCloud is rate-limiting us. Wait a minute, then retry.",
  exchange_matrix: "Every exchange variant failed. Variant report:"
};

const failureCopy = (reason: string) => {
  if (FAILURE_COPY[reason]) return FAILURE_COPY[reason];
  const m = reason.match(/^(exchange|me|finalize)_(\d+)(?:_([a-z_]+))?$/);
  if (m) {
    if (m[3] === "invalid_grant")
      return "The sign-in code came back stale (invalid_grant). Close any leftover SoundCloud popups and try once more.";
    if (m[3] === "invalid_client")
      return "SoundCloud rejected the app credentials (invalid_client) — check the client secret on the server.";
    const step =
      m[1] === "me" ? "reading your profile" : m[1] === "finalize" ? "finishing up" : "the sign-in exchange";
    return `SoundCloud returned ${m[3] || `error ${m[2]}`} during ${step}.`;
  }
  return null;
};

const SoundcloudIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.7 10.4a4.77 4.77 0 0 0-3.9-1.9 5.1 5.1 0 0 0-4.7-3.2A5.1 5.1 0 0 0 4 10.4a3.6 3.6 0 0 0-.1 7.2h13.8a3.2 3.2 0 0 0 0-6.4z" />
  </svg>
);

/** Compact opt-in row: small purple checkbox + label. */
const PrefRow = ({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) => (
  <label className="flex cursor-pointer select-none items-center gap-2.5 px-1 py-0.5">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="peer sr-only"
    />
    <span
      aria-hidden
      className={clsx(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
        checked
          ? "border-transparent bg-[#8b5cf6]"
          : "border-purple-400/40 bg-transparent"
      )}
    >
      {checked && (
        <svg
          className="h-2.5 w-2.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 13 4 4L19 7" />
        </svg>
      )}
    </span>
    <span className="text-xs text-purple-100/80">{label}</span>
  </label>
);

/** One promised action: label on the left, live state on the right. */
const ActionRow = ({ done, label }: { done: boolean; label: string }) => (
  <li className="flex items-center justify-between text-sm">
    <span className={done ? "text-emerald-200" : "text-purple-100/80"}>
      {label}
    </span>
    <span
      className={clsx(
        "text-[11px] uppercase tracking-[0.2em]",
        done ? "text-emerald-300" : "text-purple-200/40"
      )}
    >
      {done ? "✓ Done" : "Pending"}
    </span>
  </li>
);

type DownloadGateProps = {
  trackSlug: string;
};

export default function DownloadGate({ trackSlug }: DownloadGateProps) {
  const MANUAL_KEY = `${MANUAL_KEY_PREFIX}:${trackSlug}`;
  const OUTBOUND_KEY = `${MANUAL_OUTBOUND_KEY_PREFIX}:${trackSlug}`;

  const [status, setStatus] = useState<GateStatus>(initialStatus);
  const [loaded, setLoaded] = useState(false);
  const [manualUnlocked, setManualUnlocked] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadTitle, setDownloadTitle] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The fan's choices, made before the popup opens. The comment is theirs to
  // write — the gate won't open the popup until it has one.
  const [repost, setRepost] = useState(true);
  const [comment, setComment] = useState("");
  const outboundStartedAt = useRef<number | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const artistName = process.env.NEXT_PUBLIC_ARTIST_NAME?.trim() || "YVSH";
  const artistUrl =
    process.env.NEXT_PUBLIC_SOUNDCLOUD_URL?.trim() ||
    "https://soundcloud.com/yvshh";

  const downloadReady = status.unlocked || manualUnlocked;
  // Auto mode is the real gate; manual is the escape hatch when SoundCloud's
  // API isn't available to us.
  const manualMode = loaded && (!status.configured || status.apiBlocked);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/soundcloud/status?track=${encodeURIComponent(trackSlug)}`,
        { cache: "no-store" }
      );
      if (!response.ok) return null;
      const next = (await response.json()) as GateStatus;
      setStatus((prev) => ({ ...prev, ...next }));
      return next;
    } catch {
      return null;
    } finally {
      setLoaded(true);
    }
  }, [trackSlug]);

  useEffect(() => {
    setStatus(initialStatus);
    setLoaded(false);
    setManualUnlocked(sessionStorage.getItem(MANUAL_KEY) === "1");
    setNotice(null);
    setDownloaded(false);
    outboundStartedAt.current = null;
    sessionStorage.removeItem(OUTBOUND_KEY);
    void fetchStatus();
    return stopPolling;
  }, [MANUAL_KEY, OUTBOUND_KEY, fetchStatus, stopPolling, trackSlug]);

  const applyStatus = useCallback((next: GateStatus) => {
    setStatus((prev) => ({ ...prev, ...next }));
    if (next.unlocked) {
      setNotice(null);
      return;
    }
    if (next.error) {
      setNotice(failureCopy(next.error) || "Couldn’t finish on SoundCloud.");
    }
  }, []);

  // The OAuth popup posts its result back here when it's done. The popup may
  // sit on the www host while this page is on the apex (or vice versa), so
  // accept the sibling origin too.
  useEffect(() => {
    const siblingOrigin = window.location.origin.includes("://www.")
      ? window.location.origin.replace("://www.", "://")
      : window.location.origin.replace("://", "://www.");
    const onMessage = (event: MessageEvent<GateMessage>) => {
      if (
        event.origin !== window.location.origin &&
        event.origin !== siblingOrigin
      )
        return;
      if (event.data?.type !== "soundcloud-gate") return;

      stopPolling();
      setConnecting(false);

      if (event.data.ok && event.data.status) {
        applyStatus(event.data.status);
        return;
      }
      const reason = event.data.reason || "auth_failed";
      const base = failureCopy(reason) || "SoundCloud connection failed.";
      setNotice(
        event.data.detail ? `${base} — “${event.data.detail}”` : base
      );
      if (reason === "unconfigured") {
        setStatus((prev) => ({ ...prev, configured: false }));
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyStatus, stopPolling]);

  // Manual fallback: count the visit once the fan comes back to this tab.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const stored = sessionStorage.getItem(OUTBOUND_KEY);
      const startedAt =
        outboundStartedAt.current ?? (stored ? Number(stored) : null);
      if (!startedAt) return;
      if (Date.now() - startedAt < MANUAL_MIN_MS) {
        setNotice(
          `Give it a few seconds on SoundCloud — follow ${artistName}, like the track, then come back.`
        );
        return;
      }

      outboundStartedAt.current = null;
      sessionStorage.removeItem(OUTBOUND_KEY);
      sessionStorage.setItem(MANUAL_KEY, "1");
      setNotice(null);
      setManualUnlocked(true);
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [MANUAL_KEY, OUTBOUND_KEY, artistName]);

  const handleConnect = () => {
    const trimmed = comment.trim().slice(0, COMMENT_MAX);
    if (!trimmed) {
      setNotice("Write a comment for the track first — it posts under your name.");
      return;
    }
    setNotice(null);
    setConnecting(true);

    const params = new URLSearchParams({
      track: trackSlug,
      repost: repost ? "1" : "0",
      comment: trimmed
    });

    const popup = window.open(
      `/api/soundcloud/login?${params.toString()}`,
      "soundcloud-gate",
      "width=520,height=720"
    );

    if (!popup) {
      setConnecting(false);
      setNotice("Allow popups for this site, or use the manual step below.");
      setStatus((prev) => ({ ...prev, apiBlocked: true }));
      return;
    }

    // Backstop that treats polling as the primary signal, not a fallback.
    // postMessage from the popup is unreliable in the real world: Google's
    // sign-in pages sever the popup↔opener link (COOP), which also makes
    // `popup.closed` read true while the fan is still mid-login. So: poll the
    // whole window, and only use `closed` to shorten the tail — never to stop
    // immediately.
    const startedAt = Date.now();
    let closedSeenAt: number | null = null;
    stopPolling();
    pollTimer.current = setInterval(async () => {
      const next = await fetchStatus();
      if (next?.connected) {
        stopPolling();
        setConnecting(false);
        return;
      }
      let popupClosed = true;
      try {
        popupClosed = popup.closed;
      } catch {
        // COOP-severed proxies can throw; treat as closed.
      }
      if (popupClosed && closedSeenAt === null) {
        closedSeenAt = Date.now();
      }
      const timedOut = Date.now() - startedAt > POLL_TIMEOUT_MS;
      const closedLongAgo =
        closedSeenAt !== null && Date.now() - closedSeenAt > POPUP_CLOSED_GRACE_MS;
      if (timedOut || closedLongAgo) {
        stopPolling();
        setConnecting(false);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleRetry = async () => {
    setNotice(null);
    setConnecting(true);
    try {
      const response = await fetch("/api/soundcloud/engage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: trackSlug,
          repost,
          comment: comment.trim().slice(0, COMMENT_MAX) || undefined
        })
      });
      applyStatus((await response.json()) as GateStatus);
    } catch {
      setNotice("Couldn’t reach SoundCloud. Try again.");
    } finally {
      setConnecting(false);
    }
  };

  const handleManual = () => {
    setNotice(null);
    const startedAt = Date.now();
    outboundStartedAt.current = startedAt;
    sessionStorage.setItem(OUTBOUND_KEY, `${startedAt}`);

    const opened = window.open(artistUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      outboundStartedAt.current = null;
      sessionStorage.removeItem(OUTBOUND_KEY);
      sessionStorage.setItem(MANUAL_KEY, "1");
      setManualUnlocked(true);
    }
  };

  const handleDownload = async () => {
    if (!downloadReady || downloadBusy) return;
    setNotice(null);
    setDownloaded(false);
    setDownloadBusy(true);

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: trackSlug }),
        cache: "no-store"
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; title?: string; local?: boolean; error?: string }
        | null;

      if (!res.ok || !data?.url) {
        setNotice(data?.error || "Download failed. Please try again.");
        return;
      }

      if (data.local) {
        const head = await fetch(data.url, { method: "HEAD", cache: "no-store" });
        if (!head.ok) {
          setNotice(`That file isn’t on the site yet (public${data.url}).`);
          return;
        }
        const link = document.createElement("a");
        link.href = data.url;
        link.download = data.url.split("/").pop() || "download";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        // Drive answers with Content-Disposition: attachment, so the browser
        // downloads in place and this page stays put.
        window.location.href = data.url;
      }

      setDownloadTitle(data.title ?? null);
      setDownloaded(true);
    } catch {
      setNotice("Couldn’t reach the server. Check your connection and retry.");
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleReset = () => {
    setNotice(null);
    setDownloaded(false);
    setDownloadTitle(null);
    outboundStartedAt.current = null;
    stopPolling();
    sessionStorage.removeItem(OUTBOUND_KEY);
    sessionStorage.removeItem(MANUAL_KEY);
    setManualUnlocked(false);
    void fetchStatus();
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-purple-500/15 bg-purple-900/10 px-4 py-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-purple-200/60">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-purple-400/30 bg-purple-400/10 text-[10px] text-purple-300">
            1
          </span>
          Required
        </div>

        {/* Loading skeleton */}
        {!loaded && (
          <div className="space-y-2" aria-live="polite">
            <div className="h-11 w-full animate-pulse rounded-2xl bg-white/5" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
            <span className="sr-only">Checking your SoundCloud status…</span>
          </div>
        )}

        {/* Connect form — the one decision point. */}
        {loaded && !status.connected && !manualMode && (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Connect your SoundCloud
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-purple-200/50">
                One tap follows {artistName} and likes this track — that
                unlocks the download. Undo anything later on SoundCloud.
              </p>
            </div>

            {/* The fan writes their own comment — required before the popup
                opens, and it posts under their name. */}
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={COMMENT_MAX}
              required
              placeholder="Write a comment for the track (required)"
              className="w-full rounded-xl border border-purple-500/15 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-purple-200/40 focus:border-purple-400/50 focus:outline-none"
            />

            <PrefRow
              checked={repost}
              onChange={setRepost}
              label="Repost to my followers"
            />

            <button
              onClick={handleConnect}
              disabled={connecting || !comment.trim()}
              className={clsx(
                "group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition",
                "bg-[#8b5cf6] text-white hover:bg-[#9d75f8]",
                (connecting || !comment.trim()) && "opacity-70"
              )}
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/30">
                  <SoundcloudIcon />
                </span>
                {connecting ? "Waiting for SoundCloud…" : "Proceed to SoundCloud"}
              </span>
              {!connecting && (
                <svg
                  className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M5 12h13m0 0-5-5m5 5-5 5" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Connected — show exactly what happened on their account. */}
        {loaded && status.connected && !manualMode && (
          <div className="space-y-3">
            <ul className="space-y-2 rounded-2xl bg-black/20 px-4 py-3">
              <ActionRow done={status.followed} label={`Following ${artistName}`} />
              <ActionRow done={status.liked} label="Liked this track" />
              {(repost || status.reposted) && (
                <ActionRow done={status.reposted} label="Reposted to your followers" />
              )}
              {(comment.trim() || status.commented) && (
                <ActionRow done={status.commented} label="Comment posted" />
              )}
            </ul>

            {!status.unlocked && (
              <button
                onClick={handleRetry}
                disabled={connecting}
                className="w-full rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/15"
              >
                {connecting ? "Retrying…" : "Retry"}
              </button>
            )}

            {status.username && (
              <p className="text-[11px] text-purple-200/40">
                Connected as {status.username}
              </p>
            )}
          </div>
        )}

        {/* Manual fallback when the API isn't available. */}
        {manualMode && (
          <div className="space-y-2">
            <button
              onClick={handleManual}
              disabled={manualUnlocked}
              className={clsx(
                "group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition",
                manualUnlocked
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-[#8b5cf6] text-white hover:bg-[#9d75f8]"
              )}
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/30">
                  <SoundcloudIcon />
                </span>
                Follow + like on SoundCloud
              </span>
              <span className="text-[11px] uppercase tracking-[0.2em]">
                {manualUnlocked ? "✓ Done" : "Pending"}
              </span>
            </button>
            <p className="text-xs text-purple-200/50">
              Opens SoundCloud in a new tab. Follow {artistName}, like the
              track, then come back here.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={handleDownload}
        disabled={!downloadReady || downloadBusy}
        className={clsx(
          "mt-2 w-full rounded-2xl px-6 py-3 text-sm font-semibold uppercase tracking-wide transition",
          downloadReady
            ? "bg-[#8b5cf6] text-white shadow-lg shadow-purple-500/25 hover:bg-[#9d75f8]"
            : "bg-white/10 text-muted"
        )}
      >
        {downloadBusy
          ? "Preparing download..."
          : downloaded
            ? "Download again"
            : "Download"}
      </button>

      <DownloadSuccess show={downloaded} trackTitle={downloadTitle ?? undefined} />

      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70"
        >
          {notice}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-purple-200/40">
        <span>Downloads are limited to one per session.</span>
        <button
          onClick={handleReset}
          className="text-[11px] uppercase tracking-[0.2em] text-purple-300/50 transition hover:text-purple-200"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
