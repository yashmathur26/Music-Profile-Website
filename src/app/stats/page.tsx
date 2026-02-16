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
    <main className="relative z-10 min-h-screen bg-[#0d0d0d]" style={{ minHeight: "100vh" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-violet-600/20 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-[400px] h-[300px] bg-fuchsia-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[200px] bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-14">
            {/* Hero title - Wrapped style */}
            <div className="text-center mb-10 md:mb-12">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight">
                <span className="bg-gradient-to-r from-white via-purple-200 to-fuchsia-300 bg-clip-text text-transparent">
                  YOUR YVSH
                </span>
                <br />
                <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-violet-400 bg-clip-text text-transparent">
                  WRAPPED
                </span>
              </h1>
              <p className="mt-3 text-white/50 text-sm font-medium tracking-wide">
                Connect Spotify to see your real stats
              </p>
            </div>

            {error && (
              <div className="mb-8 rounded-2xl border border-red-500/30 bg-red-950/40 backdrop-blur-sm p-4 text-center text-sm text-red-200">
                {error}
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="h-12 w-12 rounded-full border-2 border-white/20 border-t-fuchsia-400 animate-spin" />
                <p className="mt-5 text-sm text-white/50 font-medium">Loading your stats…</p>
              </div>
            )}

            {/* Connect card - sleek, proper Spotify logo */}
            {isPlaceholder && (
              <div className="mb-10 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 md:p-8 text-center shadow-2xl">
                <p className="text-white/80 text-sm md:text-base font-medium mb-5">
                  Connect your Spotify to unlock your real listening stats.
                </p>
                <a
                  href="/api/auth/spotify"
                  className="inline-flex items-center justify-center gap-3 rounded-full bg-[#1DB954] text-white font-bold text-base py-4 px-8 hover:bg-[#1ed760] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg shadow-[#1DB954]/25"
                >
                  <SpotifyLogoIcon className="h-6 w-6 shrink-0" />
                  Connect with Spotify
                </a>
                <p className="mt-4 text-xs text-white/40">Preview below uses placeholder data.</p>
              </div>
            )}

            {!loading && stats && !isFan && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 md:p-10 text-center">
                <p className="text-xl font-bold text-white/90">No YVSH in your mix yet</p>
                <p className="mt-2 text-sm text-white/50">
                  We didn&apos;t find YVSH in your recent or top tracks. Keep listening and come back.
                </p>
                <Link
                  href="/home"
                  className="mt-6 inline-block text-sm font-semibold text-fuchsia-300 hover:text-fuchsia-200 transition"
                >
                  Back to Home
                </Link>
              </div>
            )}

            {/* Wrapped-style dashboard */}
            {!loading && displayStats && (isFan || isPlaceholder) && (
              <div className="space-y-8 md:space-y-12">
                {/* Hero stat: Fan level */}
                <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent backdrop-blur-xl p-6 md:p-8 overflow-hidden">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/40 mb-1">You&apos;re a</p>
                  <p className="text-3xl md:text-4xl font-black capitalize bg-gradient-to-r from-fuchsia-300 to-purple-300 bg-clip-text text-transparent">
                    {displayStats.fanLevel}
                  </p>
                  <p className="mt-2 text-xs text-white/40 leading-relaxed">
                    Based on how many YVSH tracks you play and how often they show up in your top lists.
                  </p>
                </section>

                {/* Top song - hero moment */}
                {displayStats.mostPlayedSong && (
                  <section className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 md:p-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40 mb-2">Your top song</p>
                    <p className="text-xl md:text-2xl font-bold text-white truncate">{displayStats.mostPlayedSong}</p>
                    <p className="mt-2 text-xs text-white/40 leading-relaxed">
                      The YVSH track you&apos;ve listened to the most in your recent and top plays.
                    </p>
                  </section>
                )}

                {/* Personality + peak hour - side by side */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 mb-1">Vibe</p>
                    <p className="text-sm font-semibold text-white/90 leading-snug">{displayStats.listeningPersonality}</p>
                    <p className="mt-1.5 text-[11px] text-white/40 leading-snug">
                      A fun label based on when and how you listen to YVSH.
                    </p>
                  </div>
                  {displayStats.peakListeningHour !== null && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40 mb-1">Peak hour</p>
                      <p className="text-lg font-bold text-white">{formatHour(displayStats.peakListeningHour)}</p>
                      <p className="mt-1.5 text-[11px] text-white/40 leading-snug">
                        The hour you&apos;ve played YVSH the most in your recent history.
                      </p>
                    </div>
                  )}
                </section>

                {/* Stats strip */}
                <section className="space-y-4">
                  <p className="text-center text-[11px] text-white/40 max-w-md mx-auto">
                    Quick numbers from your YVSH listening: unique tracks, favorite album, streak of days with plays, and when you first showed up in the data.
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <StatPill label="Tracks" value={String(displayStats.totalYvshTracks)} />
                    {displayStats.favoriteAlbum && (
                      <StatPill label="Album" value={displayStats.favoriteAlbum} />
                    )}
                    {displayStats.recentStreaks > 0 && (
                      <StatPill label="Streak" value={`${displayStats.recentStreaks} day${displayStats.recentStreaks !== 1 ? "s" : ""}`} />
                    )}
                    {displayStats.firstDiscoveryDate && (
                      <StatPill
                        label="First heard"
                        value={new Date(displayStats.firstDiscoveryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      />
                    )}
                  </div>
                </section>

                {/* Top tracks - sleek list */}
                {displayStats.topYvshTracks.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-white/40 mb-1">
                      Top YVSH tracks
                    </h2>
                    <p className="text-[11px] text-white/40 mb-4 leading-relaxed">
                      Your most-played YVSH tracks, mixed from recent and top lists.
                    </p>
                    <ul className="space-y-2">
                      {displayStats.topYvshTracks.map((track, i) => (
                        <li
                          key={track.id}
                          className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] backdrop-blur-xl px-4 py-3 transition-colors"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-purple-500/30 text-sm font-black text-white/90 tabular-nums">
                            {i + 1}
                          </span>
                          {track.album?.images?.[0]?.url ? (
                            <img
                              src={track.album.images[0].url}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-lg"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-purple-500/20 text-2xl text-white/30">
                              ♪
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-white text-sm md:text-base">{track.name}</p>
                            {track.album?.name && (
                              <p className="truncate text-xs text-white/50">{track.album.name}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <p className="text-center pt-4">
                  <Link href="/home" className="text-xs font-medium text-white/40 hover:text-white/60 transition">
                    Back to Home
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SpotifyLogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.621 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] pl-4 pr-4 py-2 max-w-full">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40 shrink-0">{label}</span>
      <span className="ml-2 text-sm font-bold text-white/90 truncate min-w-0 max-w-[160px]">{value}</span>
    </div>
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
