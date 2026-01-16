"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTrackBySlug } from "@/lib/tracks";

type GateState = {
  soundcloudVerified: boolean;
  instagramVisited: boolean;
  tiktokVisited: boolean;
};

type OutboundState = {
  platform: "soundcloud" | "instagram" | "tiktok";
  startedAt: number;
};

const STATE_KEY_PREFIX = "download_gate_state";
const OUTBOUND_KEY_PREFIX = "download_gate_outbound";
const OUTBOUND_MIN_MS = 5000;

const initialState: GateState = {
  soundcloudVerified: false,
  instagramVisited: false,
  tiktokVisited: false
};

const statusLabel = (complete: boolean) =>
  complete ? "✓ Done" : "Pending";

type DownloadGateProps = {
  trackSlug: string;
};

export default function DownloadGate({ trackSlug }: DownloadGateProps) {
  const STATE_KEY = `${STATE_KEY_PREFIX}:${trackSlug}`;
  const OUTBOUND_KEY = `${OUTBOUND_KEY_PREFIX}:${trackSlug}`;

  const [gateState, setGateState] = useState<GateState>(initialState);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const outboundRef = useRef<OutboundState | null>(null);
  const artistName =
    process.env.NEXT_PUBLIC_ARTIST_NAME?.trim() || "YVSH";
  const soundcloudUrl =
    process.env.NEXT_PUBLIC_SOUNDCLOUD_URL?.trim() ||
    "https://soundcloud.com/yvshh";
  const instagramUrl =
    process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() ||
    "https://www.instagram.com/itsyvshhh/";
  const tiktokUrl =
    process.env.NEXT_PUBLIC_TIKTOK_URL?.trim() ||
    "https://www.tiktok.com/@yvsh.mp3?lang=en";

  const downloadReady = gateState.soundcloudVerified;

  const persistState = useCallback(
    (next: GateState | ((prev: GateState) => GateState)) => {
      setGateState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (typeof window !== "undefined") {
          sessionStorage.setItem(STATE_KEY, JSON.stringify(resolved));
        }
        return resolved;
      });
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Always reset progress when entering a track link
    outboundRef.current = null;
    sessionStorage.removeItem(OUTBOUND_KEY);
    sessionStorage.removeItem(STATE_KEY);
    setGateState(initialState);

    const cached = sessionStorage.getItem(STATE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as GateState;
        setGateState(parsed);
      } catch {
        sessionStorage.removeItem(STATE_KEY);
      }
    }
  }, [OUTBOUND_KEY, STATE_KEY, trackSlug]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const stored = sessionStorage.getItem(OUTBOUND_KEY);
      const outbound =
        outboundRef.current ?? (stored ? (JSON.parse(stored) as OutboundState) : null);

      if (!outbound) return;
      const elapsed = Date.now() - outbound.startedAt;
      if (elapsed < OUTBOUND_MIN_MS) return;

      persistState((prev) => ({
        ...prev,
        soundcloudVerified:
          prev.soundcloudVerified || outbound.platform === "soundcloud",
        instagramVisited:
          prev.instagramVisited || outbound.platform === "instagram",
        tiktokVisited: prev.tiktokVisited || outbound.platform === "tiktok"
      }));
      outboundRef.current = null;
      sessionStorage.removeItem(OUTBOUND_KEY);
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [persistState]);

  const startOutbound = (
    platform: "soundcloud" | "instagram" | "tiktok",
    url: string
  ) => {
    const outbound: OutboundState = { platform, startedAt: Date.now() };
    outboundRef.current = outbound;
    sessionStorage.setItem(OUTBOUND_KEY, JSON.stringify(outbound));
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      persistState((prev) => ({
        ...prev,
        soundcloudVerified:
          prev.soundcloudVerified || platform === "soundcloud",
        instagramVisited:
          prev.instagramVisited || platform === "instagram",
        tiktokVisited: prev.tiktokVisited || platform === "tiktok"
      }));
      outboundRef.current = null;
      sessionStorage.removeItem(OUTBOUND_KEY);
    }
  };

  const handleSoundcloud = () => {
    startOutbound("soundcloud", soundcloudUrl);
  };

  const handleDownload = async () => {
    setNotice(null);
    setDownloadBusy(true);
    try {
      const track = getTrackBySlug(trackSlug);
      if (!track?.downloadUrl) {
        setNotice("Download link isn’t set for this track yet.");
        return;
      }

      // Local file download: preflight so you don't get dumped on a 404 page
      if (track.downloadUrl.startsWith("/")) {
        const res = await fetch(track.downloadUrl, { method: "HEAD", cache: "no-store" });
        if (!res.ok) {
          setNotice(
            `That file isn’t on the site yet. Put it at: public${track.downloadUrl}`
          );
          return;
        }

        const link = document.createElement("a");
        link.href = track.downloadUrl;
        link.download = track.downloadUrl.split("/").pop() || "download";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // External URL (Google Drive, etc.)
      window.location.href = track.downloadUrl;
    } finally {
      setTimeout(() => setDownloadBusy(false), 500);
    }
  };

  const handleReset = () => {
    setNotice(null);
    outboundRef.current = null;
    sessionStorage.removeItem(OUTBOUND_KEY);
    sessionStorage.removeItem(STATE_KEY);
    setGateState(initialState);
  };

  const showInstagram = gateState.soundcloudVerified;
  const showTiktok = gateState.soundcloudVerified && gateState.instagramVisited;

  return (
    <section className="flex flex-col gap-4">
      <div className="space-y-3">
        <div className="rounded-2xl border border-purple-500/15 bg-purple-900/10 px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-purple-200/60">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-purple-400/30 bg-purple-400/10 text-[10px] text-purple-300">
              1
            </span>
            Required
          </div>
            <button
            onClick={handleSoundcloud}
            disabled={gateState.soundcloudVerified}
            className={clsx(
              "group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition",
              gateState.soundcloudVerified
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 text-white hover:brightness-110"
            )}
          >
            <span className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/30">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="currentColor"
                >
                  <path d="M17.7 10.4a4.77 4.77 0 0 0-3.9-1.9 5.1 5.1 0 0 0-4.7-3.2A5.1 5.1 0 0 0 4 10.4a3.6 3.6 0 0 0-.1 7.2h13.8a3.2 3.2 0 0 0 0-6.4z" />
                </svg>
              </span>
              Follow on SoundCloud
            </span>
            <span className="text-[11px] uppercase tracking-[0.2em]">
              {statusLabel(gateState.soundcloudVerified)}
            </span>
          </button>
          <p className="mt-2 text-xs text-purple-200/50">
            Follow {artistName} to unlock the download.
          </p>
        </div>

        {showInstagram ? (
          <div className="rounded-2xl border border-purple-500/15 bg-purple-900/10 px-4 py-4">
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-purple-200/60">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-purple-400/30 bg-purple-400/10 text-[10px] text-purple-300">
                2
              </span>
              Step 2
            </div>
            <button
              onClick={() => startOutbound("instagram", instagramUrl)}
              disabled={gateState.instagramVisited || !instagramUrl}
              className={clsx(
                "group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition",
                gateState.instagramVisited
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-gradient-to-r from-pink-600 to-purple-600 text-white hover:brightness-110",
                !instagramUrl && "cursor-not-allowed opacity-50"
              )}
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/30">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="currentColor"
                  >
                    <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5.5A3.5 3.5 0 1 0 15.5 12 3.5 3.5 0 0 0 12 8.5zm6.2-1.9a.9.9 0 1 0 .9.9.9.9 0 0 0-.9-.9z" />
                  </svg>
                </span>
                Follow on Instagram
              </span>
              <span className="text-[11px] uppercase tracking-[0.2em]">
                {instagramUrl
                  ? statusLabel(gateState.instagramVisited)
                  : "Link not set"}
              </span>
            </button>
          </div>
        ) : null}

        {showTiktok ? (
          <div className="rounded-2xl border border-purple-500/15 bg-purple-900/10 px-4 py-4">
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-purple-200/60">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-purple-400/30 bg-purple-400/10 text-[10px] text-purple-300">
                3
              </span>
              Step 3
            </div>
            <button
              onClick={() => startOutbound("tiktok", tiktokUrl)}
              disabled={gateState.tiktokVisited || !tiktokUrl}
              className={clsx(
                "group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition",
                gateState.tiktokVisited
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 text-white hover:brightness-110",
                !tiktokUrl && "cursor-not-allowed opacity-50"
              )}
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/30">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="currentColor"
                  >
                    <path d="M14.5 4.8c.7.7 1.6 1.2 2.6 1.3v2.5a6 6 0 0 1-3.4-1.1v6.9a4.8 4.8 0 1 1-4.2-4.8v2.6a2.2 2.2 0 1 0 1.6 2.1V3h2.6c.1.7.4 1.3.8 1.8z" />
                  </svg>
                </span>
                Follow on TikTok
              </span>
              <span className="text-[11px] uppercase tracking-[0.2em]">
                {tiktokUrl
                  ? statusLabel(gateState.tiktokVisited)
                  : "Link not set"}
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <button
        onClick={handleDownload}
        disabled={!downloadReady || downloadBusy}
        className={clsx(
          "mt-2 w-full rounded-2xl px-6 py-3 text-sm font-semibold uppercase tracking-wide transition",
          downloadReady
            ? "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25 hover:brightness-110"
            : "bg-white/10 text-muted"
        )}
      >
        {downloadBusy ? "Preparing download..." : "Download"}
      </button>

      {notice ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
          {notice}
        </div>
      ) : null}

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
