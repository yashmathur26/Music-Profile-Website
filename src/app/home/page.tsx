"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { tracks, DEFAULT_TRACK_SLUG, getTrackBySlug } from "@/lib/tracks";
import { campaign } from "@/config/campaign";
import Sidebar from "@/components/Sidebar";

const artistName = "YVSH";
const bio = "rest in peace my granny she got hit w a bazooka kabloom kablow";

export default function HomePage() {
  const widgetRef = useRef<unknown>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      const iframe = document.querySelector('iframe[title="SoundCloud player"]') as HTMLIFrameElement;
      if (iframe && (window as unknown as { SC?: { Widget: (el: HTMLIFrameElement) => unknown } }).SC) {
        const widget = (window as unknown as { SC: { Widget: (el: HTMLIFrameElement) => unknown } }).SC.Widget(iframe);
        (widgetRef as React.MutableRefObject<unknown>).current = widget;
        if (typeof (widget as { bind?: (e: string, fn: () => void) => void }).bind === "function") {
          (widget as { bind: (e: string, fn: () => void) => void }).bind(
            (window as unknown as { SC: { Widget: { Events: { READY: string } } } }).SC.Widget.Events.READY,
            () => {
              (widget as { setVolume: (n: number) => void }).setVolume(0);
              let volume = 0;
              const targetVolume = 15;
              const fadeDuration = 3000;
              const steps = 30;
              const stepDuration = fadeDuration / steps;
              const volumeStep = targetVolume / steps;
              const fadeInterval = setInterval(() => {
                volume += volumeStep;
                if (volume >= targetVolume) {
                  (widget as { setVolume: (n: number) => void }).setVolume(targetVolume);
                  clearInterval(fadeInterval);
                } else {
                  (widget as { setVolume: (n: number) => void }).setVolume(Math.round(volume));
                }
              }, stepDuration);
            }
          );
        }
      }
    };
    return () => {
      if (script.parentNode) document.body.removeChild(script);
    };
  }, []);

  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80" style={{ minHeight: "100vh" }}>
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
            {campaign.isActive && (
              <div
                className="mb-6 rounded-xl border p-4 text-center"
                style={{
                  borderColor: `${campaign.accentColor}40`,
                  backgroundColor: `${campaign.accentColor}15`,
                }}
              >
                <p className="text-sm font-semibold text-white/90">
                  {campaign.trackTitle} — dropping {new Date(campaign.releaseDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
                  <Link
                    href="/api/spotify/authorize"
                    className="text-sm font-medium underline"
                    style={{ color: campaign.accentColor }}
                  >
                    Pre-save now →
                  </Link>
                  <Link
                    href="/stats"
                    className="text-sm font-medium text-purple-300 underline hover:text-purple-200"
                  >
                    View My YVSH Stats →
                  </Link>
                </div>
              </div>
            )}

            <header className="flex flex-col items-center text-center">
              <div className="relative mb-4 md:mb-6 animate-float">
                <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-purple-500/40 via-pink-500/30 to-blue-500/40 blur-xl animate-glow-pulse" />
                <img
                  src="/avatar.png"
                  alt={artistName}
                  className="relative h-20 w-20 rounded-full border-2 border-purple-400/50 object-cover shadow-xl animate-glow-text md:h-24 md:w-24"
                  style={{
                    filter: "drop-shadow(0 0 10px rgba(139, 92, 246, 0.6)) drop-shadow(0 0 20px rgba(236, 72, 153, 0.4))",
                  }}
                />
              </div>
              <h1
                className="animate-text-float text-xl font-bold tracking-wide text-white animate-glow-text md:text-2xl"
                style={{
                  textShadow: "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.6), 0 0 30px rgba(236, 72, 153, 0.4)",
                }}
              >
                {artistName}
              </h1>
              <p
                className="animate-text-float mt-2 max-w-md px-4 text-xs leading-relaxed text-white/60 animate-glow-text md:text-sm"
                style={{ animationDelay: "0.15s", textShadow: "0 0 8px rgba(139, 92, 246, 0.5), 0 0 15px rgba(139, 92, 246, 0.3)" }}
              >
                {bio}
              </p>
              <div className="mt-4 flex items-center gap-3 md:mt-5 md:gap-5">
                <a
                  href="https://soundcloud.com/yvshh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-400/40 bg-purple-500/20 text-purple-200 transition hover:scale-110 hover:bg-purple-500/30 md:h-14 md:w-14"
                >
                  <svg className="h-6 w-6 md:h-7 md:w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.7 10.4a4.77 4.77 0 0 0-3.9-1.9 5.1 5.1 0 0 0-4.7-3.2A5.1 5.1 0 0 0 4 10.4a3.6 3.6 0 0 0-.1 7.2h13.8a3.2 3.2 0 0 0 0-6.4z" />
                  </svg>
                </a>
                <a
                  href="https://www.instagram.com/itsyvshhh/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-pink-400/40 bg-pink-500/20 text-pink-200 transition hover:scale-110 hover:bg-pink-500/30 md:h-14 md:w-14"
                >
                  <svg className="h-6 w-6 md:h-7 md:w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5.5A3.5 3.5 0 1 0 15.5 12 3.5 3.5 0 0 0 12 8.5zm6.2-1.9a.9.9 0 1 0 .9.9.9.9 0 0 0-.9-.9z" />
                  </svg>
                </a>
                <a
                  href="https://www.tiktok.com/@yvsh.mp3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/10 text-white/80 transition hover:scale-110 hover:bg-white/20 md:h-14 md:w-14"
                >
                  <svg className="h-6 w-6 md:h-7 md:w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.5 4.8c.7.7 1.6 1.2 2.6 1.3v2.5a6 6 0 0 1-3.4-1.1v6.9a4.8 4.8 0 1 1-4.2-4.8v2.6a2.2 2.2 0 1 0 1.6 2.1V3h2.6c.1.7.4 1.3.8 1.8z" />
                  </svg>
                </a>
              </div>
            </header>

            <section className="mt-8 md:mt-10">
              <h2
                className="animate-text-float mb-3 text-center text-xl font-bold uppercase tracking-[0.2em] text-purple-300 animate-glow-text md:text-2xl"
                style={{
                  animationDelay: "0.2s",
                  textShadow: "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.6), 0 0 30px rgba(236, 72, 153, 0.4)",
                }}
              >
                Now Playing
              </h2>
              <div className="overflow-hidden rounded-xl border border-purple-500/20 bg-purple-900/10 shadow-lg">
                <iframe
                  title="SoundCloud player"
                  src={`${(getTrackBySlug(DEFAULT_TRACK_SLUG)?.soundcloudEmbedUrl ?? "").replace("auto_play=false", "auto_play=true").replace("visual=true", "visual=false")}&volume=15`}
                  allow="autoplay"
                  className="h-[166px] w-full border-0"
                />
              </div>
            </section>

            <section className="mt-8 hidden md:mt-10 md:block">
              <h2
                className="animate-text-float mb-3 text-center text-xl font-bold uppercase tracking-[0.2em] text-purple-300 animate-glow-text md:text-2xl"
                style={{
                  animationDelay: "0.35s",
                  textShadow: "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.6), 0 0 30px rgba(236, 72, 153, 0.4)",
                }}
              >
                Free Downloads
              </h2>
              <div className="grid gap-2">
                {tracks.map((track, i) => (
                  <Link
                    key={track.slug}
                    href={`/${track.slug}`}
                    className="group flex animate-slide-in items-center gap-3 rounded-lg border border-purple-400/25 bg-purple-900/20 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.25)] transition-all duration-200 hover:scale-[1.02] hover:border-purple-300/40 hover:bg-purple-900/30"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                      <svg className="h-5 w-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white/90">{track.title}</p>
                    </div>
                    <svg className="h-4 w-4 shrink-0 text-purple-300/60 transition group-hover:translate-x-1 group-hover:text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </section>

            <section className="mt-8 md:mt-10">
              <h2
                className="animate-text-float mb-3 text-center text-xl font-bold uppercase tracking-[0.2em] text-purple-300 animate-glow-text md:text-2xl"
                style={{
                  animationDelay: "0.4s",
                  textShadow: "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.6), 0 0 30px rgba(236, 72, 153, 0.4)",
                }}
              >
                Shop
              </h2>
              <div className="rounded-xl border border-purple-400/25 bg-purple-900/20 p-4 text-center shadow-[0_12px_30px_rgba(0,0,0,0.25)] md:p-5">
                <p className="text-xs font-extrabold tracking-[0.25em] text-white/90 md:text-sm">COMING SOON</p>
              </div>
            </section>

            <footer className="mt-8 md:mt-12 text-center">
              <p className="animate-text-float text-[10px] text-white/20" style={{ animationDelay: "0.45s" }}>
                © 2026 {artistName}
              </p>
            </footer>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes text-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes glow-text {
          0%, 100% { text-shadow: 0 0 10px rgba(139,92,246,0.8), 0 0 20px rgba(139,92,246,0.6); }
          33% { text-shadow: 0 0 15px rgba(236,72,153,0.8), 0 0 25px rgba(236,72,153,0.6); }
          66% { text-shadow: 0 0 12px rgba(59,130,246,0.8), 0 0 22px rgba(59,130,246,0.6); }
        }
        .animate-float { animation: float 3s ease-in-out infinite; }
        .animate-text-float { animation: text-float 2.8s ease-in-out infinite; }
        .animate-slide-in { animation: slide-in 0.5s ease-out forwards; }
        .animate-glow-pulse { animation: glow-pulse 3s ease-in-out infinite; }
        .animate-glow-text { animation: glow-text 4s ease-in-out infinite; }
      `}</style>
    </main>
  );
}
