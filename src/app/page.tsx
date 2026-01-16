"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { tracks } from "@/lib/tracks";
import Sidebar from "@/components/Sidebar";
import StarfieldCanvas from "@/components/StarfieldCanvas";

export default function HomePage() {
  const [entered, setEntered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const artistName = "YVSH";
  const bio = "rest in peace my granny she got hit w a bazooka kabloom kablow";

  if (!entered) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1a0a2e]">
        {/* Animated gradient orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[20%] top-[20%] h-[600px] w-[600px] rounded-full bg-purple-600/20 blur-[120px] max-md:animate-none" />
          <div className="absolute bottom-[20%] right-[10%] h-[500px] w-[500px] rounded-full bg-pink-600/15 blur-[100px] max-md:animate-none" style={{ animationDelay: '1s' }} />
          <div className="absolute bottom-[10%] left-[50%] h-[400px] w-[400px] rounded-full bg-blue-600/15 blur-[80px] max-md:animate-none" style={{ animationDelay: '2s' }} />
        </div>

        {/* Starfield */}
        <div className="pointer-events-none absolute inset-0">
          <StarfieldCanvas density={1.0} seed={1337} className="opacity-90" />
        </div>

        {/* Main content */}
        <div className="relative z-10">
          <button
            onClick={() => setEntered(true)}
            className="group flex flex-col items-center gap-12"
          >
            {/* Avatar with glow and bounce */}
            <div className="relative animate-bounce-slow" style={{ animationDuration: '3s' }}>
              <div className="absolute -inset-6 rounded-full bg-gradient-to-br from-purple-500/40 via-pink-500/30 to-blue-500/40 blur-2xl transition-all duration-500 group-hover:scale-125" />
              <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-purple-400 via-pink-500 to-blue-500 opacity-50 blur-sm" />
              <img
                src="/avatar.png"
                alt={artistName}
                className="relative h-36 w-36 rounded-full border-2 border-white/20 object-cover shadow-2xl transition-transform duration-300 group-hover:scale-105"
              />
            </div>

            {/* Enter text */}
            <div className="flex flex-col items-center gap-3">
              <span className="max-md:animate-none rounded-full border border-purple-400/40 bg-purple-500/20 px-8 py-3 text-sm font-medium uppercase tracking-[0.3em] text-purple-200 backdrop-blur-sm transition-all duration-300 group-hover:border-purple-400/80 group-hover:bg-purple-500/30 group-hover:shadow-lg group-hover:shadow-purple-500/20">
                Click to Enter
              </span>
            </div>
          </button>
        </div>

        <style jsx>{`
          /* (stars are now canvas-based; no CSS starfield here) */
        `}</style>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[#1a0a2e]">
      {/* Animated background orbs */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[10%] top-[10%] h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[100px] max-md:animate-none" />
        <div className="absolute bottom-[30%] right-[20%] h-[400px] w-[400px] rounded-full bg-pink-600/10 blur-[80px] max-md:animate-none" style={{ animationDelay: '1s' }} />
        <div className="absolute left-[60%] top-[50%] h-[300px] w-[300px] rounded-full bg-blue-600/10 blur-[60px] max-md:animate-none" style={{ animationDelay: '2s' }} />
      </div>

      {/* Starfield */}
      <div className="pointer-events-none fixed inset-0">
        <StarfieldCanvas density={1.0} seed={1337} className="opacity-90" />
      </div>

      <div className="relative flex min-h-screen overflow-x-hidden">
        {/* Sidebar */}
        <Sidebar currentSlug="dont-stop-the-music-piano" tracks={tracks} />

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-12">
            {/* Header / Profile Section */}
            <header className="flex flex-col items-center text-center">
              {/* Avatar with float animation */}
              <div className="relative mb-6 animate-float">
                <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-purple-500/40 via-pink-500/30 to-blue-500/40 blur-xl" />
                <img
                  src="/avatar.png"
                  alt={artistName}
                  className="relative h-24 w-24 rounded-full border-2 border-purple-400/50 object-cover shadow-xl"
                />
              </div>

              {/* Name & Handle */}
              <h1 className="animate-text-float text-2xl font-bold tracking-wide text-white">
                {artistName}
              </h1>
              
              {/* Bio */}
              <p
                className="animate-text-float mt-2 max-w-md text-sm leading-relaxed text-white/60"
                style={{ animationDelay: "0.15s" }}
              >
                {bio}
              </p>

              {/* Social Links with bounce animations */}
              <div className="mt-5 flex items-center gap-5">
                <a
                  href="https://soundcloud.com/yvshh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-14 w-14 max-md:animate-none items-center justify-center rounded-2xl border border-purple-400/40 bg-purple-500/20 text-purple-200 transition hover:bg-purple-500/30 hover:scale-110"
                  style={{ animationDelay: '0s' }}
                >
                  <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.7 10.4a4.77 4.77 0 0 0-3.9-1.9 5.1 5.1 0 0 0-4.7-3.2A5.1 5.1 0 0 0 4 10.4a3.6 3.6 0 0 0-.1 7.2h13.8a3.2 3.2 0 0 0 0-6.4z" />
                  </svg>
                </a>
                <a
                  href="https://www.instagram.com/itsyvshhh/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-14 w-14 max-md:animate-none items-center justify-center rounded-2xl border border-pink-400/40 bg-pink-500/20 text-pink-200 transition hover:bg-pink-500/30 hover:scale-110"
                  style={{ animationDelay: '0.2s' }}
                >
                  <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5.5A3.5 3.5 0 1 0 15.5 12 3.5 3.5 0 0 0 12 8.5zm6.2-1.9a.9.9 0 1 0 .9.9.9.9 0 0 0-.9-.9z" />
                  </svg>
                </a>
                <a
                  href="https://www.tiktok.com/@yvsh.mp3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-14 w-14 max-md:animate-none items-center justify-center rounded-2xl border border-white/30 bg-white/10 text-white/80 transition hover:bg-white/20 hover:scale-110"
                  style={{ animationDelay: '0.4s' }}
                >
                  <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.5 4.8c.7.7 1.6 1.2 2.6 1.3v2.5a6 6 0 0 1-3.4-1.1v6.9a4.8 4.8 0 1 1-4.2-4.8v2.6a2.2 2.2 0 1 0 1.6 2.1V3h2.6c.1.7.4 1.3.8 1.8z" />
                  </svg>
                </a>
              </div>
            </header>

            {/* Featured Track */}
            <section className="mt-10">
              <h2
                className="animate-text-float mb-3 text-center text-2xl font-bold uppercase tracking-[0.2em] text-purple-300"
                style={{ animationDelay: "0.2s" }}
              >
                Now Playing
              </h2>
              <div className="overflow-hidden rounded-xl border border-purple-500/20 bg-purple-900/10 shadow-lg">
                <iframe
                  title="SoundCloud player"
                  src="https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/yvshh/chris-brown-yo-but-bounce-yvsh-flip&color=%238b5cf6&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false&volume=50"
                  allow="autoplay"
                  className="h-[166px] w-full border-0"
                />
              </div>
            </section>

            {/* Free Downloads Section */}
            <section className="mt-10">
              <h2
                className="animate-text-float mb-3 text-center text-2xl font-bold uppercase tracking-[0.2em] text-purple-300"
                style={{ animationDelay: "0.35s" }}
              >
                Free Downloads
              </h2>
              <div className="grid gap-2">
                {tracks.slice(0, isMobile ? 3 : tracks.length).map((track, i) => (
                  <Link
                    key={track.slug}
                    href={`/${track.slug}`}
                    className="group flex animate-slide-in items-center gap-3 rounded-lg border border-purple-400/25 bg-purple-900/20 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.25)] transition-all duration-200 hover:border-purple-300/40 hover:bg-purple-900/30 hover:scale-[1.02]"
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
                    <svg
                      className="h-4 w-4 shrink-0 text-purple-300/60 transition group-hover:translate-x-1 group-hover:text-purple-200"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
                {isMobile && tracks.length > 3 && (
                  <div className="flex items-center justify-center py-2">
                    <span className="text-xs text-purple-300/50">...</span>
                  </div>
                )}
              </div>
            </section>

            {/* Shop Section */}
            <section className="mt-10">
              <h2
                className="animate-text-float mb-3 text-center text-2xl font-bold uppercase tracking-[0.2em] text-purple-300"
                style={{ animationDelay: "0.4s" }}
              >
                Shop
              </h2>
              <div className="rounded-xl border border-purple-400/25 bg-purple-900/20 p-5 text-center shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
                <p className="text-sm font-extrabold tracking-[0.25em] text-white/90">
                  COMING SOON
                </p>
              </div>
            </section>

            {/* Footer */}
            <footer className="mt-12 text-center">
              <p
                className="animate-text-float text-[10px] text-white/20"
                style={{ animationDelay: "0.45s" }}
              >
                © 2026 {artistName}
              </p>
            </footer>
          </div>
        </div>
      </div>

      <style jsx>{`
        /* Starfield is canvas-based now (avoids the streak bug). */
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateZ(0); }
          50% { transform: translateY(-10px) translateZ(0); }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0px) translateZ(0); }
          50% { transform: translateY(-8px) translateZ(0); }
        }
        @keyframes text-float {
          0%, 100% { transform: translateY(0px) translateZ(0); }
          50% { transform: translateY(-4px) translateZ(0); }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(-20px) translateZ(0); }
          to { opacity: 1; transform: translateX(0) translateZ(0); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .animate-text-float {
          animation: text-float 2.8s ease-in-out infinite;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .animate-slide-in {
          animation: slide-in 0.5s ease-out forwards;
          will-change: transform, opacity;
        }
        
        /* Reduce animations on mobile */
        @media (max-width: 768px) {
          .animate-float,
          .animate-bounce-slow,
          .animate-text-float {
            animation: none !important;
          }
          .animate-slide-in {
            animation: slide-in 0.3s ease-out forwards;
          }
        }
      `}</style>
    </main>
  );
}
