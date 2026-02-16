"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { formatHour } from "@/lib/statsCalculator";
import type { YvshStats, SpotifyTrackItem } from "@/lib/statsCalculator";

const PLACEHOLDER_STATS: YvshStats = {
  isYvshFan: true,
  mostPlayedSong: "FIRESTARTER",
  firstDiscoveryDate: new Date().toISOString(),
  totalYvshTracks: 5,
  fanLevel: "superfan",
  peakListeningHour: 22,
  favoriteAlbum: "YVSH Flips",
  recentStreaks: 3,
  listeningPersonality: "Night Owl YVSH Listener",
  topYvshTracks: [
    { id: "ph-1", name: "FIRESTARTER", album: { name: "YVSH Flips" } },
    { id: "ph-2", name: "DON'T STOP THE MUSIC (YVSH FLIP)", album: { name: "YVSH Flips" } },
    { id: "ph-3", name: "BEAUTY AND A BEAT (YVSH FLIP)", album: { name: "YVSH Flips" } },
    { id: "ph-4", name: "Lights Go Out", album: { name: "John Summit x YVSH" } },
    { id: "ph-5", name: "10 Outta 10", album: { name: "YVSH" } },
  ] as SpotifyTrackItem[],
};

function StatsContent() {
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<YvshStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlError = searchParams.get("error");

  useEffect(() => {
    if (urlError) {
      setError(urlError === "access_denied" ? "Spotify connection was cancelled." : "Something went wrong. Try again.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stats/spotify");
        if (cancelled) return;
        if (res.status === 401) {
          setStats(null);
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError("Failed to load your stats.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setStats(data);
      } catch {
        if (!cancelled) setError("Failed to load your stats.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlError]);

  const notConnected = !loading && !stats && !error;
  const isFan = stats?.isYvshFan ?? false;
  const displayStats = stats ?? (notConnected ? PLACEHOLDER_STATS : null);
  const isPlaceholder = notConnected && !urlError;

  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80" style={{ minHeight: "100vh" }}>
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
            <h1
              className="mb-2 text-center text-xl font-bold uppercase tracking-[0.2em] text-purple-300 md:text-2xl"
              style={{
                textShadow: "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.6)",
              }}
            >
              My YVSH Stats
            </h1>
            <p className="mb-8 text-center text-sm text-white/60">
              Connect Spotify to see your personalized listening stats.
            </p>

            {error && (
              <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-200">
                {error}
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                <p className="mt-4 text-sm text-white/60">Loading your stats…</p>
              </div>
            )}

            {isPlaceholder && (
              <div className="mb-6 rounded-xl border border-[#1DB954]/40 bg-[#1DB954]/10 p-4 text-center">
                <p className="mb-3 text-sm text-white/90">
                  Connect your Spotify to see your real listening stats.
                </p>
                <a
                  href="/api/auth/spotify"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#1DB954]/60 bg-[#1DB954]/20 px-5 py-2.5 text-sm font-medium text-[#1DB954] transition hover:bg-[#1DB954]/30"
                >
                  <svg className="h-5 w-5" fill="#1DB954" viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02z" />
                  </svg>
                  Connect with Spotify
                </a>
                <p className="mt-2 text-xs text-white/50">Preview below shows placeholder data.</p>
              </div>
            )}

            {!loading && stats && !isFan && (
              <div className="rounded-xl border border-purple-500/20 bg-purple-900/10 p-8 text-center">
                <p className="mb-2 text-lg font-semibold text-white/90">No YVSH listening data yet</p>
                <p className="mb-4 text-sm text-white/60">
                  We didn&apos;t find any YVSH in your recent or top tracks. Keep listening and come back!
                </p>
                <Link
                  href="/home"
                  className="text-sm font-medium text-purple-300 underline hover:text-purple-200"
                >
                  Back to Home
                </Link>
              </div>
            )}

            {!loading && displayStats && (isFan || isPlaceholder) && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-purple-500/20 bg-purple-900/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-purple-300/80">Fan level</p>
                    <p className="mt-1 text-lg font-semibold capitalize text-white">{displayStats.fanLevel}</p>
                  </div>
                  <div className="rounded-xl border border-purple-500/20 bg-purple-900/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-purple-300/80">Listening personality</p>
                    <p className="mt-1 text-sm font-medium text-white">{displayStats.listeningPersonality}</p>
                  </div>
                  <div className="rounded-xl border border-purple-500/20 bg-purple-900/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-purple-300/80">Most played song</p>
                    <p className="mt-1 text-sm font-medium text-white">{displayStats.mostPlayedSong ?? "—"}</p>
                  </div>
                  <div className="rounded-xl border border-purple-500/20 bg-purple-900/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-purple-300/80">Total YVSH tracks</p>
                    <p className="mt-1 text-lg font-semibold text-white">{displayStats.totalYvshTracks}</p>
                  </div>
                  {displayStats.peakListeningHour !== null && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-900/10 p-4">
                      <p className="text-xs uppercase tracking-wider text-purple-300/80">Peak listening hour</p>
                      <p className="mt-1 text-sm font-medium text-white">{formatHour(displayStats.peakListeningHour)}</p>
                    </div>
                  )}
                  {displayStats.favoriteAlbum && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-900/10 p-4">
                      <p className="text-xs uppercase tracking-wider text-purple-300/80">Favorite album</p>
                      <p className="mt-1 text-sm font-medium text-white">{displayStats.favoriteAlbum}</p>
                    </div>
                  )}
                  {displayStats.recentStreaks > 0 && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-900/10 p-4">
                      <p className="text-xs uppercase tracking-wider text-purple-300/80">Recent streak</p>
                      <p className="mt-1 text-sm font-medium text-white">{displayStats.recentStreaks} day(s)</p>
                    </div>
                  )}
                  {displayStats.firstDiscoveryDate && (
                    <div className="rounded-xl border border-purple-500/20 bg-purple-900/10 p-4">
                      <p className="text-xs uppercase tracking-wider text-purple-300/80">First discovery</p>
                      <p className="mt-1 text-sm font-medium text-white">
                        {new Date(displayStats.firstDiscoveryDate).toLocaleDateString("en-US")}
                      </p>
                    </div>
                  )}
                </div>

                {displayStats.topYvshTracks.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-lg font-bold uppercase tracking-wider text-purple-300">
                      Top YVSH tracks
                    </h2>
                    <ul className="space-y-2">
                      {displayStats.topYvshTracks.map((track, i) => (
                        <li
                          key={track.id}
                          className="flex items-center gap-3 rounded-lg border border-purple-500/20 bg-purple-900/10 p-3"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-purple-500/30 text-sm font-bold text-purple-200">
                            {i + 1}
                          </span>
                          {track.album?.images?.[0]?.url ? (
                            <img
                              src={track.album.images[0].url}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-purple-500/20 text-lg text-purple-300/60">
                              ♪
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{track.name}</p>
                            {track.album?.name && (
                              <p className="truncate text-xs text-white/60">{track.album.name}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-center text-xs text-white/40">
                  <Link href="/home" className="underline hover:text-white/60">Back to Home</Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function StatsPage() {
  return (
    <Suspense
      fallback={
        <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
          <div className="relative flex min-h-screen overflow-x-hidden">
            <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />
            <div className="flex flex-1 items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
            </div>
          </div>
        </main>
      }
    >
      <StatsContent />
    </Suspense>
  );
}
