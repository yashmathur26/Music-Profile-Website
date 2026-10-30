"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import DownloadSuccess from "@/components/DownloadSuccess";

/** One account the gate follows. Mirror of the server's FollowTarget. */
type FollowTarget = {
  url: string;
  name: string;
  followed: boolean;
};

/** Mirror of the server's GateStatus. */
type GateStatus = {
  configured: boolean;
  connected: boolean;
  username: string | null;
  follows: FollowTarget[];
  followed: boolean;
  liked: boolean;
  reposted: boolean;
  commented: boolean;
  unlocked: boolean;
  isArtist: boolean;
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
  follows: [],
  followed: false,
  liked: false,
  reposted: false,
  commented: false,
  unlocked: false,
  isArtist: false,
  apiBlocked: false,
  error: null
};

const FAILURE_COPY: Record<string, string> = {
  unconfigured: "SoundCloud isn’t set up yet.",
  denied: "Connection cancelled.",
  state_mismatch: "Session expired. Connect again.",
  auth_failed: "SoundCloud didn’t connect. Try again.",
  blocked: "Follow and like on SoundCloud yourself, then come back.",
  rate_limited: "SoundCloud is busy. Try again in a moment.",
  reconnect: "Session expired. Connect again.",
  artist_unresolved: "Couldn’t reach SoundCloud. Try again.",
  track_unresolved: "Couldn’t find this track on SoundCloud.",
  exchange_401: "SoundCloud rejected the connection (401).",
  exchange_403: "SoundCloud refused the connection (403).",
  exchange_429: "SoundCloud is busy. Try again in a minute.",
  exchange_matrix: "SoundCloud didn’t connect:"
};

const failureCopy = (reason: string) => {
  if (FAILURE_COPY[reason]) return FAILURE_COPY[reason];
  const m = reason.match(/^(exchange|me|finalize)_(\d+)(?:_([a-z_]+))?$/);
  if (m) {
    if (m[3] === "invalid_grant")
      return "Sign-in expired. Close any SoundCloud popups and try again.";
    if (m[3] === "invalid_client")
      return "SoundCloud rejected the connection (invalid_client).";
    const step =
      m[1] === "me" ? "reading your profile" : m[1] === "finalize" ? "finishing up" : "the sign-in exchange";
    return `SoundCloud returned ${m[3] || `error ${m[2]}`} during ${step}.`;
  }
  return null;
};

/**
 * The server is the authority on *which* accounts to follow, but a status poll
 * reports stored state — never let one un-tick a follow the engagement just
 * confirmed this visit.
 */
const mergeFollows = (prev: FollowTarget[], next: FollowTarget[]) => {
  if (!next.length) return prev;
  const done = new Map(prev.map((target) => [target.url, target.followed]));
  return next.map((target) => ({
    ...target,
    followed: target.followed || done.get(target.url) === true
  }));
};

/** "A", "A and B", "A, B and C" — for the one-tap promise in the copy. */
const nameList = (names: string[]) =>
  names.length <= 1
    ? names[0] || ""
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const SoundcloudIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.7 10.4a4.77 4.77 0 0 0-3.9-1.9 5.1 5.1 0 0 0-4.7-3.2A5.1 5.1 0 0 0 4 10.4a3.6 3.6 0 0 0-.1 7.2h13.8a3.2 3.2 0 0 0 0-6.4z" />
  </svg>
);

/** Compact opt-in row: a rounded checkbox + label. */
const PrefRow = ({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
}) => (
  <label className="flex cursor-pointer select-none items-start gap-3">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="peer sr-only"
    />
    <span
      aria-hidden
      className={clsx(
        "mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition",
        "peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400/60",
        checked ? "border-transparent bg-violet-500" : "border-white/25 bg-white/5"
      )}
    >
      {checked && (
        <svg
          className="h-3 w-3"
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
    <span className="text-[13px] leading-snug text-white/70">{label}</span>
  </label>
);

/** A small spinner that inherits the text colour. */
const Spinner = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={clsx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/** One promised action: spins while SoundCloud is working on it, then ticks. */
const ActionRow = ({
  done,
  label,
  working = false
}: {
  done: boolean;
  label: string;
  working?: boolean;
}) => (
  <li className="flex items-center gap-3 text-sm">
    <span
      className={clsx(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition",
        done ? "bg-emerald-400 text-black" : working ? "text-white/60" : "border border-white/20"
      )}
      aria-hidden
    >
      {!done && working && <Spinner className="h-5 w-5" />}
      {done && (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 13 4 4L19 7" />
        </svg>
      )}
    </span>
    <span className={done ? "text-white/90" : "text-white/50"}>{label}</span>
    <span className="sr-only">{done ? "done" : working ? "in progress" : "pending"}</span>
  </li>
);

const linkClass = "text-white/85 underline decoration-white/30 underline-offset-2 hover:decoration-white/70";

type DownloadGateProps = {
  trackSlug: string;
};

/**
 * Tells the Stats tab something only the browser saw. Fire-and-forget with
 * keepalive, so a fan leaving the page (or a cross-origin download replacing
 * it) doesn't cancel the request; a failure here must never touch the gate.
 */
const reportGateEvent = (
  kind: "view" | "manual",
  track: string,
  extra: Record<string, string | null> = {}
) => {
  try {
    void fetch("/api/gate/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, track, ...extra }),
      keepalive: true
    }).catch(() => undefined);
  } catch {
    /* stats are never worth an error on the gate */
  }
};

export default function DownloadGate({ trackSlug }: DownloadGateProps) {
  const OUTBOUND_KEY = `${MANUAL_OUTBOUND_KEY_PREFIX}:${trackSlug}`;

  const [status, setStatus] = useState<GateStatus>(initialStatus);
  const [loaded, setLoaded] = useState(false);
  // The gate resets each visit: the results view only shows after the fan
  // pressed the button this visit (attempted), never straight from the cookie.
  const [attempted, setAttempted] = useState(false);
  const postEngageRan = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  /** null while idle or preparing; 0–100 while the file arrives, or -1 when
   * the size isn't known and only a spinner can be honest. */
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadTitle, setDownloadTitle] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The fan's choices, made before the popup opens.
  const [repost, setRepost] = useState(true);
  const [comment, setComment] = useState("");
  // Downloading requires an explicit opt-in to the terms + cookie use.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const outboundStartedAt = useRef<number | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const artistName = process.env.NEXT_PUBLIC_ARTIST_NAME?.trim() || "YVSH";
  const artistUrl =
    process.env.NEXT_PUBLIC_SOUNDCLOUD_URL?.trim() ||
    "https://soundcloud.com/yvshh";

  // The gate can follow up to three accounts at once. With one, the copy and
  // the checklist keep the artist's display name; with several, each row names
  // its own account so the fan knows exactly who they're following.
  const followTargets = status.follows;
  const multiFollow = followTargets.length > 1;
  const followLabel = (target: FollowTarget) =>
    multiFollow ? target.name : artistName;
  const followPromise = multiFollow
    ? nameList(followTargets.map((target) => target.name))
    : artistName;

  // Only the server's word counts: /api/download refuses anyone it didn't see
  // unlock, so this just mirrors it for the button.
  const downloadReady = status.unlocked;
  // The manual step's "check it worked" — set below, read by the tab-return
  // listener, which is declared before handleRetry exists.
  const verifyRef = useRef<() => Promise<GateStatus | null>>(async () => null);
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
      // Status polls report unlocked:false by design (per-visit reset) — never
      // let one clobber an unlock the engagement already granted this visit.
      setStatus((prev) => ({
        ...prev,
        ...next,
        follows: mergeFollows(prev.follows, next.follows || []),
        followed: prev.followed || next.followed,
        liked: prev.liked || next.liked,
        reposted: prev.reposted || next.reposted,
        commented: prev.commented || next.commented,
        unlocked: prev.unlocked || next.unlocked
      }));
      return next;
    } catch {
      return null;
    } finally {
      setLoaded(true);
    }
  }, [trackSlug]);

  // One view per song per page load. The ref survives React's dev-mode
  // double-invoke of effects, so local testing doesn't double the count.
  const viewReported = useRef<string | null>(null);
  useEffect(() => {
    if (viewReported.current === trackSlug) return;
    viewReported.current = trackSlug;
    const params = new URLSearchParams(window.location.search);
    reportGateEvent("view", trackSlug, {
      referrer: document.referrer || null,
      utm: params.get("utm_source")
    });
  }, [trackSlug]);

  useEffect(() => {
    setStatus(initialStatus);
    setLoaded(false);
    setAttempted(false);
    postEngageRan.current = false;
    setNotice(null);
    setDownloaded(false);
    outboundStartedAt.current = null;
    sessionStorage.removeItem(OUTBOUND_KEY);
    void fetchStatus();
    return stopPolling;
  }, [OUTBOUND_KEY, fetchStatus, stopPolling, trackSlug]);

  /**
   * Enrols the fan in likes + reposts of future releases.
   *
   * Awaited before the download fires, because a cross-origin download
   * navigates the page away and would cancel anything still in flight. Its
   * failures are swallowed: enrolment must never be what stops someone
   * getting the song they came for.
   */
  const enrol = useCallback(async () => {
    try {
      // Downloading enrols the fan in likes + reposts of future releases.
      // The Terms disclose it and carry the off switch (/unsubscribe), so
      // nothing about it is shown here.
      await fetch("/api/soundcloud/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: trackSlug })
      });
    } catch {
      /* never block the download on this */
    }
  }, [trackSlug]);

  const applyStatus = useCallback((next: GateStatus) => {
    setAttempted(true);
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
        postEngageRan.current = true;
        applyStatus(event.data.status);
        return;
      }
      const reason = event.data.reason || "auth_failed";
      const base = failureCopy(reason) || "SoundCloud connection failed.";
      setNotice(
        event.data.detail ? `${base} (${event.data.detail})` : base
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
          `Follow ${artistName} and like the track first.`
        );
        return;
      }

      outboundStartedAt.current = null;
      sessionStorage.removeItem(OUTBOUND_KEY);
      setNotice(null);
      reportGateEvent("manual", trackSlug);
      // Back from SoundCloud: have the server check they really follow now.
      // Only a confirmed follow unlocks anything.
      void verifyRef.current().then((result) => {
        if (!result?.unlocked) {
          setNotice(`No follow yet. Follow ${artistName} on SoundCloud, then come back.`);
        }
      });
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [OUTBOUND_KEY, artistName, trackSlug]);

  const handleConnect = async () => {
    setNotice(null);

    // Already connected from a previous visit: no popup needed — verify the
    // four tasks against SoundCloud and checkmark what's already done.
    if (status.connected) {
      const verified = await handleRetry();
      if (verified?.connected) return;
      // Token died since last visit — fall through to a fresh popup connect.
      setStatus((prev) => ({ ...prev, connected: false }));
    }

    setConnecting(true);
    postEngageRan.current = false;

    const params = new URLSearchParams({
      track: trackSlug,
      repost: repost ? "1" : "0"
    });
    const trimmed = comment.trim().slice(0, COMMENT_MAX);
    if (trimmed) params.set("comment", trimmed);

    const popup = window.open(
      `/api/soundcloud/login?${params.toString()}`,
      "soundcloud-gate",
      "width=520,height=720"
    );

    if (!popup) {
      setConnecting(false);
      setNotice("Allow popups for this site.");
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
        // COOP-severed popups can't postMessage their result — verify the
        // tasks over the fresh session so the checkmarks still appear.
        if (!postEngageRan.current) {
          postEngageRan.current = true;
          void handleRetry();
        } else {
          setConnecting(false);
        }
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

  /**
   * Runs the engagement against the fan's existing session: each of the four
   * tasks is verified on SoundCloud (already-done ones come back as
   * checkmarks) and anything missing is performed. Returns the fresh status.
   */
  const handleRetry = async (): Promise<GateStatus | null> => {
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
      const next = (await response.json()) as GateStatus;
      if (next.connected) {
        applyStatus(next);
      }
      return next;
    } catch {
      setNotice("Couldn’t reach SoundCloud. Try again.");
      return null;
    } finally {
      setConnecting(false);
    }
  };

  verifyRef.current = handleRetry;

  const handleManual = () => {
    setNotice(null);
    const startedAt = Date.now();
    outboundStartedAt.current = startedAt;
    sessionStorage.setItem(OUTBOUND_KEY, `${startedAt}`);

    const opened = window.open(artistUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      // No new tab to come back from: send them there in this one instead.
      window.location.href = artistUrl;
    }
  };

  const handleDownload = async () => {
    if (!downloadReady || downloadBusy || !termsAccepted) return;
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
        | { url?: string; title?: string; error?: string }
        | null;

      if (!res.ok || !data?.url) {
        setNotice(data?.error || "Download failed. Please try again.");
        return;
      }

      // Before the transfer starts: a cross-origin download replaces the
      // page, and anything still pending here would be cancelled with it.
      await enrol();

      // Fetched here rather than navigated to, so the button can show the
      // file arriving and only say "done" once it has. The ticket only works
      // for this fan, from this browser, for a few minutes.
      const file = await fetch(data.url, { cache: "no-store" });
      if (!file.ok || !file.body) {
        setNotice((await file.text().catch(() => "")) || "Download failed. Please try again.");
        return;
      }
      const total = Number(file.headers.get("content-length")) || 0;
      setDownloadProgress(total ? 0 : -1);
      const reader = file.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) setDownloadProgress(Math.min(99, Math.floor((received / total) * 100)));
      }
      setDownloadProgress(100);

      const disposition = file.headers.get("content-disposition") || "";
      const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plain = disposition.match(/filename="([^"]+)"/i)?.[1];
      const name = (encoded && decodeURIComponent(encoded)) || plain || `${data.title || "download"}.wav`;
      const href = URL.createObjectURL(
        new Blob(chunks as BlobPart[], { type: file.headers.get("content-type") || "application/octet-stream" })
      );
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);

      setDownloadTitle(data.title ?? null);
      setDownloaded(true);
    } catch {
      setNotice("Connection lost. Try again.");
    } finally {
      setDownloadBusy(false);
      setDownloadProgress(null);
    }
  };

  const handleReset = () => {
    setNotice(null);
    setDownloaded(false);
    setDownloadTitle(null);
    setAttempted(false);
    postEngageRan.current = false;
    outboundStartedAt.current = null;
    stopPolling();
    sessionStorage.removeItem(OUTBOUND_KEY);
    void fetchStatus();
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/40 backdrop-blur-xl">
      {/* Connect */}
      <div className="p-5 sm:p-6">
        <div>
          {/* Loading skeleton */}
          {!loaded && (
            <div className="space-y-3" aria-live="polite">
              <div className="h-4 w-4/5 animate-pulse rounded bg-white/5" />
              <div className="h-12 w-full animate-pulse rounded-2xl bg-white/5" />
              <span className="sr-only">Checking your SoundCloud status…</span>
            </div>
          )}

          {/* Connect form — shown fresh on every visit until the fan presses
              the button; already-connected fans skip the popup entirely. */}
          {loaded && !(attempted && status.connected) && !manualMode && (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Follow {followPromise} and like the track to download it.
              </p>

              {/* Optional comment — leave it empty and nothing gets posted. */}
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={COMMENT_MAX}
                placeholder="Add a comment"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/30 transition focus:border-violet-400/60 focus:bg-black/40 focus:outline-none"
              />

              <PrefRow checked={repost} onChange={setRepost} label="Repost to my followers" />

              <button
                onClick={handleConnect}
                disabled={connecting}
                className={clsx(
                  "group flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white transition",
                  "bg-gradient-to-b from-[#ff6a1a] to-[#ff4d00] shadow-lg shadow-orange-600/25 hover:brightness-110 active:scale-[0.99]",
                  connecting && "opacity-70"
                )}
              >
                {connecting ? <Spinner className="h-5 w-5" /> : <SoundcloudIcon className="h-5 w-5" />}
                {connecting
                  ? "Waiting for SoundCloud…"
                  : status.connected
                    ? "Unlock the download"
                    : "Continue with SoundCloud"}
              </button>
            </div>
          )}

          {/* Connected — show exactly what happened on their account. */}
          {loaded && attempted && status.connected && !manualMode && (
            <div className="space-y-4">
              {status.isArtist ? (
                <p className="rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 ring-1 ring-emerald-400/20">
                  Artist account. Nothing to do.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {followTargets.length > 0 ? (
                    followTargets.map((target) => (
                      <ActionRow
                        key={target.url}
                        done={target.followed}
                        working={connecting}
                        label={`Following ${followLabel(target)}`}
                      />
                    ))
                  ) : (
                    <ActionRow done={status.followed} working={connecting} label={`Following ${artistName}`} />
                  )}
                  <ActionRow done={status.liked} working={connecting} label="Liked this track" />
                  {(repost || status.reposted) && (
                    <ActionRow done={status.reposted} working={connecting} label="Reposted to your followers" />
                  )}
                  {(comment.trim() || status.commented) && (
                    <ActionRow done={status.commented} working={connecting} label="Comment posted" />
                  )}
                </ul>
              )}

              {!status.unlocked && (
                <button
                  onClick={handleRetry}
                  disabled={connecting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  {connecting && <Spinner />}
                  {connecting ? "Checking…" : "Try again"}
                </button>
              )}

              {status.username && (
                <p className="text-xs text-white/35">Connected as {status.username}</p>
              )}
            </div>
          )}

          {/* Manual fallback when the API isn't available. */}
          {manualMode && (
            <div className="space-y-3">
              <p className="text-sm text-white/60">
                Follow {artistName} and like the track, then come back.
              </p>
              <button
                onClick={handleManual}
                disabled={downloadReady}
                className={clsx(
                  "flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-semibold transition",
                  downloadReady
                    ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/25"
                    : "bg-gradient-to-b from-[#ff6a1a] to-[#ff4d00] text-white shadow-lg shadow-orange-600/25 hover:brightness-110"
                )}
              >
                {connecting ? <Spinner className="h-5 w-5" /> : <SoundcloudIcon className="h-5 w-5" />}
                {downloadReady ? "Unlocked" : connecting ? "Checking your follow…" : "Follow + like on SoundCloud"}
              </button>
              {multiFollow && (
                <p className="text-xs text-white/45">
                  Also follow{" "}
                  {followTargets.slice(1).map((target, index) => (
                    <span key={target.url}>
                      {index > 0 && ", "}
                      <a href={target.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        {target.name}
                      </a>
                    </span>
                  ))}
                  .
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Download */}
      <div className="border-t border-white/[0.07] bg-black/20 p-5 sm:p-6">
        <div className="space-y-4">
          <PrefRow
            checked={termsAccepted}
            onChange={setTermsAccepted}
            label={
              <>
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className={linkClass}>
                  terms
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className={linkClass}>
                  privacy policy
                </a>
              </>
            }
          />

          <button
            onClick={handleDownload}
            disabled={!downloadReady || downloadBusy || !termsAccepted}
            aria-busy={downloadBusy}
            className={clsx(
              "relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-6 py-3.5 text-sm font-semibold transition",
              downloadBusy
                ? "cursor-wait bg-white/90 text-black"
                : downloadReady && termsAccepted
                  ? "bg-white text-black shadow-lg shadow-white/10 hover:bg-white/90 active:scale-[0.99]"
                  : "cursor-not-allowed bg-white/[0.06] text-white/30"
            )}
          >
            {/* The file arriving, as a fill behind the label. */}
            {downloadBusy && downloadProgress !== null && downloadProgress >= 0 && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-violet-300/60 transition-[width] duration-200 ease-out"
                style={{ width: `${downloadProgress}%` }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {downloadBusy ? (
                <Spinner />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" />
                </svg>
              )}
              {downloadBusy
                ? downloadProgress === null
                  ? "Getting your file…"
                  : downloadProgress >= 0
                    ? `Downloading… ${downloadProgress}%`
                    : "Downloading…"
                : downloaded
                  ? "Download again"
                  : "Download"}
            </span>
          </button>

          <DownloadSuccess show={downloaded} trackTitle={downloadTitle ?? undefined} />


          {notice && (
            <div role="status" className="rounded-2xl bg-white/5 px-4 py-3 text-xs text-white/70 ring-1 ring-white/10">
              {notice}
            </div>
          )}

          {(notice || downloaded) && (
            <button
              onClick={handleReset}
              className="block w-full text-center text-xs text-white/30 transition hover:text-white/70"
            >
              Start over
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
