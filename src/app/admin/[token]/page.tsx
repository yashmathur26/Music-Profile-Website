"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import clsx from "clsx";
import {
  DEFAULT_SITE_CONFIG,
  SiteConfig,
  nowPlayingEmbedUrl
} from "@/lib/siteContent";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type AdminTrack = {
  slug: string;
  title: string;
  artworkUrl: string;
  deletable: boolean;
};

type TrackPreview = {
  slug: string;
  title: string;
  artwork_url: string | null;
  download_url: string;
  soundcloud_url: string;
};

type DownloadEntry = {
  trackSlug: string;
  title: string;
  username: string | null;
  profileUrl: string | null;
  at: string | null;
};

type Stats = {
  count: number;
  campaignId: string;
  trackTitle: string;
  isActive: boolean;
};

type TabKey = "overview" | "gates" | "downloads" | "home" | "presaves";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const card =
  "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-400/60 focus:outline-none";

const timeAgo = (iso: string | null) => {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/**
 * Keeps a data feed live against Supabase: refetch on an interval while the
 * tab is visible, and immediately when the artist comes back to the tab.
 */
const usePolling = (fn: () => void, ms: number) => {
  useEffect(() => {
    fn();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fn();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") fn();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fn, ms]);
};

const LiveDot = () => (
  <span className="relative flex h-2 w-2" title="Auto-updating">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
  </span>
);

const SoundcloudIcon = ({ className = "h-6 w-6" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M17.7 10.4a4.77 4.77 0 0 0-3.9-1.9 5.1 5.1 0 0 0-4.7-3.2A5.1 5.1 0 0 0 4 10.4a3.6 3.6 0 0 0-.1 7.2h13.8a3.2 3.2 0 0 0 0-6.4z" />
  </svg>
);

const SpotifyIcon = ({ className = "h-6 w-6" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.621 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

const InstagramIcon = ({ className = "h-6 w-6" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5.5A3.5 3.5 0 1 0 15.5 12 3.5 3.5 0 0 0 12 8.5zm6.2-1.9a.9.9 0 1 0 .9.9.9.9 0 0 0-.9-.9z" />
  </svg>
);

const TiktokIcon = ({ className = "h-6 w-6" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path d="M14.5 4.8c.7.7 1.6 1.2 2.6 1.3v2.5a6 6 0 0 1-3.4-1.1v6.9a4.8 4.8 0 1 1-4.2-4.8v2.6a2.2 2.2 0 1 0 1.6 2.1V3h2.6c.1.7.4 1.3.8 1.8z" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Click-to-edit text                                                  */
/* ------------------------------------------------------------------ */

/**
 * Renders as normal text; click swaps in an auto-growing textarea styled to
 * match, so the mockup keeps its shape while editing. Enter (single-line) or
 * blur commits, Escape cancels.
 */
function InlineText({
  value,
  onSave,
  className = "",
  multiline = false
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
      resize(ref.current);
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          resize(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={commit}
        className={clsx(
          className,
          "block w-full resize-none overflow-hidden rounded-lg border border-purple-400/60 bg-black/40 px-2 py-1 text-center outline-none"
        )}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title="Click to edit"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      className={clsx(
        className,
        "cursor-text rounded-lg px-2 py-0.5 transition hover:bg-white/[0.07] hover:ring-1 hover:ring-purple-400/50"
      )}
    >
      {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Overview tab                                                        */
/* ------------------------------------------------------------------ */

function Overview({
  token,
  onUpload,
  onViewDownloads
}: {
  token: string;
  onUpload: () => void;
  onViewDownloads: () => void;
}) {
  const [total, setTotal] = useState<number | null>(null);
  const [recent, setRecent] = useState<DownloadEntry[]>([]);
  const [gateCount, setGateCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([
        fetch(`/api/admin/downloads?key=${encodeURIComponent(token)}`),
        fetch(`/api/admin/tracks?key=${encodeURIComponent(token)}`)
      ]);
      if (d.ok) {
        const data = await d.json();
        setTotal(data.total ?? 0);
        setRecent(data.recent || []);
      }
      if (t.ok) {
        const data = await t.json();
        setGateCount((data.tracks || []).length);
      }
    } catch {
      /* next poll retries */
    }
  }, [token]);

  usePolling(load, 4000);

  return (
    <div className="space-y-6">
      {/* The one big action */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        type="button"
        onClick={onUpload}
        className="group relative w-full overflow-hidden rounded-3xl bg-[#8b5cf6] px-8 py-10 text-left shadow-xl shadow-purple-500/30 transition hover:bg-[#9d75f8] hover:shadow-purple-500/50"
      >
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xl font-bold text-white md:text-2xl">
              Upload a song
            </p>
            <p className="mt-1 text-sm text-white/70">
              Drive link + SoundCloud link → live hyperlink in seconds
            </p>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white transition group-hover:scale-110">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </div>
      </motion.button>

      {/* Quick numbers */}
      <div className="grid grid-cols-2 gap-4">
        <div className={clsx(card, "px-5 py-4")}>
          <p className="text-xs uppercase tracking-widest text-white/40">
            Downloads
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">
            {total ?? "—"}
          </p>
        </div>
        <div className={clsx(card, "px-5 py-4")}>
          <p className="text-xs uppercase tracking-widest text-white/40">
            Live gates
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">
            {gateCount ?? "—"}
          </p>
        </div>
      </div>

      {/* Download history preview */}
      <div className={clsx(card, "p-6")}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white/70">Download history</p>
          <button
            type="button"
            onClick={onViewDownloads}
            className="rounded-lg bg-purple-500/15 px-3 py-1.5 text-xs font-semibold text-purple-200 transition hover:bg-purple-500/25"
          >
            View all →
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">
            {total === 0
              ? "No downloads recorded yet — they’ll show up here as fans grab tracks."
              : "Loading…"}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {recent.map((entry, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-300">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white/85">{entry.title}</p>
                  {entry.username && entry.profileUrl ? (
                    <a
                      href={entry.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-xs text-purple-300/80 transition hover:text-purple-200 hover:underline"
                    >
                      @{entry.username}
                    </a>
                  ) : (
                    <p className="truncate text-xs text-white/40">
                      {entry.username ? `@${entry.username}` : "anonymous"}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-white/35">
                  {timeAgo(entry.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gates tab (upload + manage)                                         */
/* ------------------------------------------------------------------ */

function TracksManager({ token }: { token: string }) {
  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [driveUrl, setDriveUrl] = useState("");
  const [soundcloudUrl, setSoundcloudUrl] = useState("");
  const [preview, setPreview] = useState<TrackPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPath, setCreatedPath] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadTracks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/tracks?key=${encodeURIComponent(token)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setTracks(data.tracks || []);
    } catch {
      /* the list is cosmetic; adding still works */
    }
  }, [token]);

  usePolling(loadTracks, 8000);

  const submit = async (confirm: boolean) => {
    setBusy(true);
    setError(null);
    if (!confirm) setCreatedPath(null);
    try {
      const res = await fetch("/api/admin/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ driveUrl, soundcloudUrl, preview: !confirm })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      if (confirm) {
        setCreatedPath(data.path);
        setPreview(null);
        setDriveUrl("");
        setSoundcloudUrl("");
        loadTracks();
      } else {
        setPreview(data.track);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (slug: string) => {
    if (!window.confirm(`Delete the gate at /${slug}? The link will stop working.`))
      return;
    try {
      const res = await fetch(`/api/admin/tracks/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (res.ok) loadTracks();
    } catch {
      /* leave the row; a refresh re-syncs */
    }
  };

  const copyLink = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${slug}`);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-6">
      <div className={clsx(card, "p-6")}>
        <p className="text-sm font-medium text-white/70">New download gate</p>
        <p className="mt-1 text-xs text-white/45">
          Paste the Google Drive link to the file and the SoundCloud track link —
          title and artwork come from SoundCloud automatically.
        </p>

        <div className="mt-4 space-y-3">
          <input
            type="url"
            value={driveUrl}
            onChange={(e) => {
              setDriveUrl(e.target.value);
              setPreview(null);
            }}
            placeholder="Google Drive link (the song file)"
            className={inputClass}
          />
          <input
            type="url"
            value={soundcloudUrl}
            onChange={(e) => {
              setSoundcloudUrl(e.target.value);
              setPreview(null);
            }}
            placeholder="SoundCloud track link"
            className={inputClass}
          />

          {!preview && (
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={busy || !driveUrl.trim() || !soundcloudUrl.trim()}
              className="rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition hover:bg-purple-500 disabled:opacity-40"
            >
              {busy ? "Checking…" : "Preview gate"}
            </button>
          )}

          {preview && (
            <div className="rounded-xl border border-purple-400/30 bg-purple-500/10 p-4">
              <div className="flex items-center gap-4">
                {preview.artwork_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.artwork_url}
                    alt="Artwork"
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded-lg bg-white/10" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white/90">
                    {preview.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-white/50">
                    will live at /{preview.slug}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => submit(true)}
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Create hyperlink"}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={busy}
                  className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/15"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {createdPath && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
              <p className="truncate text-sm text-emerald-200">
                Live at <span className="font-semibold">{createdPath}</span>
              </p>
              <button
                type="button"
                onClick={() => copyLink(createdPath.slice(1))}
                className="shrink-0 rounded-lg bg-emerald-600/80 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                {copiedSlug === createdPath.slice(1) ? "Copied!" : "Copy link"}
              </button>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}
        </div>
      </div>

      {tracks.length > 0 && (
        <div className={clsx(card, "p-6")}>
          <p className="mb-3 text-sm font-medium text-white/70">Live gates</p>
          <ul className="space-y-2">
            {tracks.map((track) => (
              <li
                key={track.slug}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white/85">{track.title}</p>
                  <p className="truncate text-xs text-white/40">/{track.slug}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyLink(track.slug)}
                  className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/20"
                >
                  {copiedSlug === track.slug ? "Copied!" : "Copy"}
                </button>
                {track.deletable && (
                  <button
                    type="button"
                    onClick={() => remove(track.slug)}
                    className="shrink-0 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/25"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Downloads tab — everyone who downloaded, linked to their profile    */
/* ------------------------------------------------------------------ */

function DownloadsList({ token }: { token: string }) {
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<DownloadEntry[]>([]);
  // "" = all songs — the default view when the tab opens.
  const [trackFilter, setTrackFilter] = useState("");
  const [songs, setSongs] = useState<{ slug: string; title: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ key: token, limit: "200" });
      if (trackFilter) params.set("track", trackFilter);
      const res = await fetch(`/api/admin/downloads?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setTotal(data.total ?? 0);
      setRows(data.recent || []);
    } catch {
      /* next poll retries */
    }
  }, [token, trackFilter]);

  usePolling(load, 4000);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/tracks?key=${encodeURIComponent(token)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        setSongs(
          (data.tracks || []).map((t: AdminTrack) => ({
            slug: t.slug,
            title: t.title
          }))
        );
      } catch {
        /* dropdown just shows All songs */
      }
    })();
  }, [token]);

  const RowInner = ({ entry }: { entry: DownloadEntry }) => (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
        {entry.username ? (
          <span className="text-sm font-bold uppercase">
            {entry.username.slice(0, 1)}
          </span>
        ) : (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/90">
          {entry.username || "Anonymous fan"}
        </p>
        <p className="truncate text-xs text-white/40">{entry.title}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-xs tabular-nums text-white/35">
          {timeAgo(entry.at)}
        </span>
        {entry.profileUrl && (
          <span className="text-[10px] uppercase tracking-widest text-purple-300/70">
            View profile →
          </span>
        )}
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      {/* Song filter — defaults to every song's downloads */}
      <select
        value={trackFilter}
        onChange={(e) => {
          setTrackFilter(e.target.value);
          setTotal(null);
        }}
        className="w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:border-purple-400/60 focus:outline-none"
      >
        <option value="" className="bg-[#150820]">
          All songs
        </option>
        {songs.map((song) => (
          <option key={song.slug} value={song.slug} className="bg-[#150820]">
            {song.title}
          </option>
        ))}
      </select>

      <div className="flex items-center justify-between">
        <p className="text-sm text-white/60">
          {total === null
            ? "Loading…"
            : `${total} download${total === 1 ? "" : "s"}${trackFilter ? " for this song" : " all-time"}`}
        </p>
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/35">
          <LiveDot /> Live
        </span>
      </div>

      {rows.length === 0 && total === 0 ? (
        <div className={clsx(card, "p-8 text-center")}>
          <p className="text-sm text-white/40">
            {trackFilter
              ? "No downloads for this song yet."
              : "No downloads yet — every fan who grabs a track will show up here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((entry, i) => (
            <li key={i}>
              {entry.profileUrl ? (
                <a
                  href={entry.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${entry.username}'s SoundCloud profile`}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:border-purple-400/50 hover:bg-purple-500/10"
                >
                  <RowInner entry={entry} />
                </a>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <RowInner entry={entry} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Home editor tab                                                     */
/* ------------------------------------------------------------------ */

const SOCIAL_META = {
  soundcloud: {
    label: "SoundCloud",
    icon: SoundcloudIcon,
    button:
      "border-purple-400/40 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30"
  },
  spotify: {
    label: "Spotify",
    icon: SpotifyIcon,
    button: "border-[#1DB954]/40 bg-[#1DB954]/20 text-[#1DB954] hover:bg-[#1DB954]/30"
  },
  instagram: {
    label: "Instagram",
    icon: InstagramIcon,
    button: "border-pink-400/40 bg-pink-500/20 text-pink-200 hover:bg-pink-500/30"
  },
  tiktok: {
    label: "TikTok",
    icon: TiktokIcon,
    button: "border-white/30 bg-white/10 text-white/80 hover:bg-white/20"
  }
} as const;

type SocialKey = keyof typeof SOCIAL_META;

function HomeEditor({ token }: { token: string }) {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [saved, setSaved] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [editingLink, setEditingLink] = useState<SocialKey | "nowplaying" | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/site-config?key=${encodeURIComponent(token)}`
        );
        if (res.ok) {
          const data = await res.json();
          setConfig(data.config);
          setSaved(data.config);
        }
      } catch {
        /* defaults stay */
      } finally {
        setLoaded(true);
      }
    })();
  }, [token]);

  const dirty = JSON.stringify(config) !== JSON.stringify(saved);

  const openLinkEditor = (key: SocialKey | "nowplaying") => {
    setEditingLink(key);
    setLinkDraft(
      key === "nowplaying" ? config.nowPlayingUrl : config.socials[key]
    );
  };

  const applyLink = () => {
    const value = linkDraft.trim();
    if (!editingLink || !value) {
      setEditingLink(null);
      return;
    }
    if (editingLink === "nowplaying") {
      setConfig((c) => ({ ...c, nowPlayingUrl: value.split(/[?#]/)[0] }));
    } else {
      setConfig((c) => ({
        ...c,
        socials: { ...c.socials, [editingLink]: value }
      }));
    }
    setEditingLink(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/site-config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      setConfig(data.config);
      setSaved(data.config);
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <p className="py-10 text-center text-sm text-white/40">Loading…</p>;
  }

  return (
    <div className="space-y-4 pb-24">
      <p className="text-xs text-white/45">
        This is a live mockup of your home page. Click any text to rewrite it,
        click a social button to change its link, and swap the Now Playing
        track — nothing goes live until you hit Save.
      </p>

      {/* The mockup */}
      <div className="overflow-hidden rounded-3xl border border-purple-500/20 bg-[#1a0a2e]">
        <div className="mx-auto max-w-xl px-6 py-10">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-purple-500/40 via-pink-500/30 to-blue-500/40 blur-lg" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/avatar.png"
                alt="Avatar"
                className="relative h-20 w-20 rounded-full border-2 border-purple-400/50 object-cover"
              />
            </div>

            <InlineText
              value={config.artistName}
              onSave={(v) => setConfig((c) => ({ ...c, artistName: v }))}
              className="text-xl font-bold tracking-wide text-white md:text-2xl"
            />

            <div className="mt-2 w-full max-w-md">
              <InlineText
                multiline
                value={config.bio}
                onSave={(v) => setConfig((c) => ({ ...c, bio: v }))}
                className="block text-xs leading-relaxed text-white/60 md:text-sm"
              />
            </div>

            {/* Social buttons — click to edit their links */}
            <div className="mt-5 flex items-center gap-3">
              {(Object.keys(SOCIAL_META) as SocialKey[]).map((key) => {
                const meta = SOCIAL_META[key];
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    title={`Change ${meta.label} link`}
                    onClick={() => openLinkEditor(key)}
                    className={clsx(
                      "relative flex h-12 w-12 items-center justify-center rounded-2xl border transition hover:scale-110",
                      meta.button,
                      editingLink === key && "ring-2 ring-purple-300"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-500 text-white shadow">
                      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Link editor panel */}
            {editingLink && editingLink !== "nowplaying" && (
              <div className="mt-4 w-full max-w-md rounded-xl border border-purple-400/40 bg-black/40 p-3 text-left">
                <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/50">
                  {SOCIAL_META[editingLink].label} link
                </p>
                <input
                  type="url"
                  autoFocus
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyLink();
                    if (e.key === "Escape") setEditingLink(null);
                  }}
                  className={inputClass}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={applyLink}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-purple-500"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingLink(null)}
                    className="rounded-lg bg-white/10 px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/15"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Now Playing */}
          <div className="mt-8">
            <h2 className="mb-3 text-center text-lg font-bold uppercase tracking-[0.2em] text-purple-300">
              Now Playing
            </h2>
            <div className="overflow-hidden rounded-xl border border-purple-500/20 bg-purple-900/10">
              <iframe
                key={config.nowPlayingUrl}
                title="Now Playing preview"
                src={nowPlayingEmbedUrl(config.nowPlayingUrl).replace(
                  "auto_play=true",
                  "auto_play=false"
                )}
                allow="encrypted-media"
                className="h-[166px] w-full border-0"
              />
            </div>
            <button
              type="button"
              onClick={() => openLinkEditor("nowplaying")}
              className="mt-2 w-full truncate rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-left text-xs text-white/60 transition hover:border-purple-400/50 hover:text-white/90"
              title="Change the Now Playing track"
            >
              🎵 {config.nowPlayingUrl}
              <span className="ml-2 text-purple-300">edit</span>
            </button>
            {editingLink === "nowplaying" && (
              <div className="mt-2 rounded-xl border border-purple-400/40 bg-black/40 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/50">
                  SoundCloud link of the featured track
                </p>
                <input
                  type="url"
                  autoFocus
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyLink();
                    if (e.key === "Escape") setEditingLink(null);
                  }}
                  placeholder="https://soundcloud.com/artist/track"
                  className={inputClass}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={applyLink}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-purple-500"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingLink(null)}
                    className="rounded-lg bg-white/10 px-4 py-2 text-xs font-medium text-white/70 transition hover:bg-white/15"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {/* Save bar */}
      {(dirty || flash) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[min(92%,42rem)] items-center justify-between rounded-2xl border border-white/10 bg-[#150820]/95 px-5 py-3 shadow-2xl backdrop-blur"
        >
          <p className="text-sm text-white/70">
            {flash && !dirty ? "Saved — it’s live." : "Unsaved changes"}
          </p>
          {dirty && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfig(saved)}
                disabled={saving}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/15"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presaves tab                                                        */
/* ------------------------------------------------------------------ */

function Presaves({ token }: { token: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/artist/stats?key=${encodeURIComponent(token)}`
      );
      if (res.ok) setStats(await res.json());
    } catch {
      /* retry on next poll */
    }
  }, [token]);

  usePolling(load, 4000);

  const trigger = async () => {
    setTriggering(true);
    setResult(null);
    try {
      const res = await fetch("/api/trigger-saves", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: "{}"
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult({ saved: data.saved, failed: data.failed });
      load();
    } catch {
      setResult({ saved: 0, failed: 0 });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={clsx(card, "relative overflow-hidden px-8 py-12")}>
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent" />
        <div className="relative">
          <p className="text-center text-sm font-medium uppercase tracking-widest text-white/50">
            Presaves{stats?.trackTitle ? ` — ${stats.trackTitle}` : ""}
          </p>
          <p
            className="mt-3 text-center text-6xl font-extrabold tabular-nums text-white"
            style={{
              textShadow:
                "0 0 60px rgba(167,139,250,0.4), 0 0 120px rgba(139,92,246,0.2)"
            }}
          >
            {stats?.count ?? "—"}
          </p>
          <p className="mt-2 text-center text-sm text-white/40">fans locked in</p>
        </div>
      </div>

      <div className={clsx(card, "p-6")}>
        <p className="text-sm font-medium text-white/70">Release day</p>
        <p className="mt-1 text-xs text-white/45">
          Save the track to every fan’s Spotify library in one click.
        </p>
        <button
          type="button"
          onClick={trigger}
          disabled={triggering}
          className="mt-4 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {triggering ? "Running…" : "Trigger saves now"}
        </button>
        {result && (
          <p className="mt-4 text-sm text-white/60">
            {result.saved} saved, {result.failed} failed
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "gates", label: "Songs" },
  { key: "downloads", label: "Downloads" },
  { key: "home", label: "Home Editor" },
  { key: "presaves", label: "Presaves" }
];

export default function AdminPage() {
  const params = useParams();
  const token = params.token as string;

  const [tab, setTab] = useState<TabKey>("overview");
  const [authState, setAuthState] = useState<"checking" | "ok" | "invalid">(
    "checking"
  );

  // One cheap authenticated call decides between the dashboard and the
  // invalid-link screen; backend outages must not lock the admin out.
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/tracks?key=${encodeURIComponent(token)}`
        );
        setAuthState(res.status === 401 ? "invalid" : "ok");
      } catch {
        setAuthState("ok");
      }
    })();
  }, [token]);

  if (authState === "checking") {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0612]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,80,200,0.25),transparent)]" />
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative text-white/50">
          Loading…
        </motion.p>
      </main>
    );
  }

  if (authState === "invalid") {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0612] p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,80,200,0.2),transparent)]" />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl border border-white/10 bg-white/5 px-8 py-10 text-center backdrop-blur-xl"
        >
          <p className="text-lg font-medium text-white/90">Invalid or expired link</p>
          <p className="mt-2 text-sm text-white/50">
            Use the admin URL from your setup docs.
          </p>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0612]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,80,200,0.28),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_50%,rgba(88,28,135,0.18),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_20%_80%,rgba(139,92,246,0.12),transparent)]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-6 py-12 md:py-16">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 text-center"
        >
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-white/40">
            Admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white/90 md:text-3xl">
            Artist Dashboard
          </h1>
        </motion.header>

        {/* Tab bar */}
        <div className="mb-8 flex justify-center">
          <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1 backdrop-blur">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={clsx(
                  "rounded-xl px-4 py-2 text-sm font-medium transition",
                  tab === t.key
                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/25"
                    : "text-white/50 hover:text-white/80"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "overview" && (
          <Overview
            token={token}
            onUpload={() => setTab("gates")}
            onViewDownloads={() => setTab("downloads")}
          />
        )}
        {tab === "gates" && <TracksManager token={token} />}
        {tab === "downloads" && <DownloadsList token={token} />}
        {tab === "home" && <HomeEditor token={token} />}
        {tab === "presaves" && <Presaves token={token} />}
      </div>
    </main>
  );
}
