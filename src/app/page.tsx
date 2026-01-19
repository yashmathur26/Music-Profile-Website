"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { tracks } from "@/lib/tracks";
import Sidebar from "@/components/Sidebar";
import StarfieldCanvas from "@/components/StarfieldCanvas";

export default function HomePage() {
  const [entered, setEntered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Track cursor position for color changes
  useEffect(() => {
    if (entered) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [entered]);

  // Handle enter with transition animation
  const handleEnter = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setEntered(true);
      setIsTransitioning(false);
    }, 800); // Transition duration
  };

  // Initialize SoundCloud Widget and fade in
  useEffect(() => {
    if (!entered) return;

    // Load SoundCloud Widget API
    const script = document.createElement('script');
    script.src = 'https://w.soundcloud.com/player/api.js';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      const iframe = document.querySelector('iframe[title="SoundCloud player"]') as HTMLIFrameElement;
      if (iframe) {
        const widget = (window as any).SC.Widget(iframe);
        widgetRef.current = widget;

        widget.bind((window as any).SC.Widget.Events.READY, () => {
          // Set initial volume to 0 (silent)
          widget.setVolume(0);
          
          // Fade in over 3 seconds
          let volume = 0;
          const targetVolume = 15; // 15% volume for background music
          const fadeDuration = 3000; // 3 seconds
          const steps = 30;
          const stepDuration = fadeDuration / steps;
          const volumeStep = targetVolume / steps;

          const fadeInterval = setInterval(() => {
            volume += volumeStep;
            if (volume >= targetVolume) {
              volume = targetVolume;
              clearInterval(fadeInterval);
            }
            widget.setVolume(Math.round(volume));
          }, stepDuration);
        });
      }
    };

    return () => {
      if (script.parentNode) {
        document.body.removeChild(script);
      }
    };
  }, [entered]);
  const artistName = "YVSH";
  const bio = "rest in peace my granny she got hit w a bazooka kabloom kablow";

  if (!entered) {
    // Calculate color based on cursor position
    const width = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const height = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const hue = width > 0 ? (cursorPos.x / width) * 360 : 270;
    const saturation = height > 0 ? 60 + (cursorPos.y / height) * 20 : 70;
    const lightness = height > 0 ? 50 + (cursorPos.y / height) * 10 : 55;

    return (
      <main className={`relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1a0a2e] transition-all duration-1000 ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        {/* Dynamic gradient orbs that follow cursor */}
        <div className="pointer-events-none absolute inset-0">
          <div 
            className="absolute h-[600px] w-[600px] rounded-full blur-[120px] transition-all duration-700 ease-out"
            style={{
              left: width > 0 ? `${cursorPos.x / width * 100}%` : '50%',
              top: height > 0 ? `${cursorPos.y / height * 100}%` : '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, hsla(${hue}, ${saturation}%, ${lightness}%, 0.3), transparent)`,
            }}
          />
          <div 
            className="absolute h-[500px] w-[500px] rounded-full blur-[100px] transition-all duration-900 ease-out"
            style={{
              left: width > 0 ? `${(1 - cursorPos.x / width) * 100}%` : '50%',
              top: height > 0 ? `${(1 - cursorPos.y / height) * 100}%` : '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, hsla(${(hue + 120) % 360}, ${saturation}%, ${lightness}%, 0.25), transparent)`,
            }}
          />
          <div 
            className="absolute h-[400px] w-[400px] rounded-full blur-[80px] transition-all duration-1100 ease-out"
            style={{
              left: width > 0 ? `${(cursorPos.x / width + 0.3) * 100}%` : '50%',
              top: height > 0 ? `${(cursorPos.y / height + 0.2) * 100}%` : '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, hsla(${(hue + 240) % 360}, ${saturation}%, ${lightness}%, 0.2), transparent)`,
            }}
          />
        </div>

        {/* Starfield */}
        <div className="pointer-events-none fixed inset-0 z-0">
          <StarfieldCanvas density={1.0} seed={1337} className="opacity-90" />
        </div>

        {/* Main content */}
        <div className="relative z-10">
          <button
            onClick={handleEnter}
            className="group flex flex-col items-center gap-8 md:gap-12"
          >
            {/* Avatar with glow and bounce */}
            <div className="relative animate-bounce-slow" style={{ animationDuration: '3s' }}>
              <div 
                className="absolute -inset-6 rounded-full blur-2xl transition-all duration-500 group-hover:scale-125"
                style={{
                  background: `radial-gradient(circle, hsla(${hue}, ${saturation}%, ${lightness}%, 0.4), transparent)`,
                }}
              />
              <div 
                className="absolute -inset-1 rounded-full opacity-50 blur-sm transition-all duration-300"
                style={{
                  background: `linear-gradient(135deg, hsla(${hue}, ${saturation}%, ${lightness}%, 0.6), hsla(${(hue + 60) % 360}, ${saturation}%, ${lightness}%, 0.4))`,
                }}
              />
              <img
                src="/avatar.png"
                alt={artistName}
                className="relative h-28 w-28 md:h-36 md:w-36 rounded-full border-2 border-white/20 object-cover shadow-2xl transition-transform duration-300 group-hover:scale-105"
              />
            </div>

            {/* Enter text */}
            <div className="flex flex-col items-center gap-3">
              <span 
                className="rounded-full border px-6 py-2 md:px-8 md:py-3 text-xs md:text-sm font-medium uppercase tracking-[0.3em] backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg"
                style={{
                  borderColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.4)`,
                  backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`,
                  color: `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`,
                  boxShadow: `0 0 20px hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`,
                }}
              >
                Click to Enter
              </span>
            </div>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={`relative min-h-screen bg-[#1a0a2e] transition-all duration-1000 ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`} style={{ minHeight: '100vh' }}>
      {/* Animated background orbs */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[10%] top-[10%] h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[100px] max-md:animate-none" />
        <div className="absolute bottom-[30%] right-[20%] h-[400px] w-[400px] rounded-full bg-pink-600/10 blur-[80px] max-md:animate-none" style={{ animationDelay: '1s' }} />
        <div className="absolute left-[60%] top-[50%] h-[300px] w-[300px] rounded-full bg-blue-600/10 blur-[60px] max-md:animate-none" style={{ animationDelay: '2s' }} />
      </div>

      {/* Starfield */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <StarfieldCanvas density={1.0} seed={1337} className="opacity-90" />
      </div>

      <div className="relative flex min-h-screen overflow-x-hidden z-10">
        {/* Sidebar */}
        <Sidebar currentSlug="firestarter" tracks={tracks} />

        {/* Main content */}
        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="mx-auto max-w-3xl px-4 md:px-6 py-8 md:py-12">
            {/* Header / Profile Section */}
            <header className="flex flex-col items-center text-center">
              {/* Avatar with float animation */}
              <div className="relative mb-4 md:mb-6 animate-float">
                <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-purple-500/40 via-pink-500/30 to-blue-500/40 blur-xl" />
                <img
                  src="/avatar.png"
                  alt={artistName}
                  className="relative h-20 w-20 md:h-24 md:w-24 rounded-full border-2 border-purple-400/50 object-cover shadow-xl"
                />
              </div>

              {/* Name & Handle */}
              <h1 className="animate-text-float text-xl md:text-2xl font-bold tracking-wide text-white">
                {artistName}
              </h1>
              
              {/* Bio */}
              <p
                className="animate-text-float mt-2 max-w-md text-xs md:text-sm leading-relaxed text-white/60 px-4"
                style={{ animationDelay: "0.15s" }}
              >
                {bio}
              </p>

              {/* Social Links with bounce animations */}
              <div className="mt-4 md:mt-5 flex items-center gap-3 md:gap-5">
                <a
                  href="https://soundcloud.com/yvshh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-12 md:h-14 md:w-14 max-md:animate-none items-center justify-center rounded-2xl border border-purple-400/40 bg-purple-500/20 text-purple-200 transition hover:bg-purple-500/30 hover:scale-110"
                  style={{ animationDelay: '0s' }}
                >
                  <svg className="h-6 w-6 md:h-7 md:w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.7 10.4a4.77 4.77 0 0 0-3.9-1.9 5.1 5.1 0 0 0-4.7-3.2A5.1 5.1 0 0 0 4 10.4a3.6 3.6 0 0 0-.1 7.2h13.8a3.2 3.2 0 0 0 0-6.4z" />
                  </svg>
                </a>
                <a
                  href="https://www.instagram.com/itsyvshhh/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-12 md:h-14 md:w-14 max-md:animate-none items-center justify-center rounded-2xl border border-pink-400/40 bg-pink-500/20 text-pink-200 transition hover:bg-pink-500/30 hover:scale-110"
                  style={{ animationDelay: '0.2s' }}
                >
                  <svg className="h-6 w-6 md:h-7 md:w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm5 5.5A3.5 3.5 0 1 0 15.5 12 3.5 3.5 0 0 0 12 8.5zm6.2-1.9a.9.9 0 1 0 .9.9.9.9 0 0 0-.9-.9z" />
                  </svg>
                </a>
                <a
                  href="https://www.tiktok.com/@yvsh.mp3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-12 md:h-14 md:w-14 max-md:animate-none items-center justify-center rounded-2xl border border-white/30 bg-white/10 text-white/80 transition hover:bg-white/20 hover:scale-110"
                  style={{ animationDelay: '0.4s' }}
                >
                  <svg className="h-6 w-6 md:h-7 md:w-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.5 4.8c.7.7 1.6 1.2 2.6 1.3v2.5a6 6 0 0 1-3.4-1.1v6.9a4.8 4.8 0 1 1-4.2-4.8v2.6a2.2 2.2 0 1 0 1.6 2.1V3h2.6c.1.7.4 1.3.8 1.8z" />
                  </svg>
                </a>
              </div>
            </header>

            {/* Featured Track */}
            <section className="mt-8 md:mt-10">
              <h2
                className="animate-text-float mb-3 text-center text-xl md:text-2xl font-bold uppercase tracking-[0.2em] text-purple-300"
                style={{ animationDelay: "0.2s" }}
              >
                Now Playing
              </h2>
              <div className="overflow-hidden rounded-xl border border-purple-500/20 bg-purple-900/10 shadow-lg">
                <iframe
                  title="SoundCloud player"
                  src="https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/yvshh/firestarter&color=%238b5cf6&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false&volume=15"
                  allow="autoplay"
                  className="h-[166px] w-full border-0"
                />
              </div>
              
              {/* Spotify Album Embed */}
              <div className="mt-4 overflow-hidden rounded-xl border border-purple-500/20 bg-purple-900/10 shadow-lg">
                <iframe
                  data-testid="embed-iframe"
                  style={{ borderRadius: '12px' }}
                  src="https://open.spotify.com/embed/album/2zZFreSSbJiBhJFb9fEFoG?utm_source=generator&theme=0"
                  width="100%"
                  height="352"
                  frameBorder="0"
                  allowFullScreen
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  className="w-full"
                />
              </div>
            </section>

            {/* Free Downloads Section - Hidden on mobile */}
            <section className="mt-8 md:mt-10 hidden md:block">
              <h2
                className="animate-text-float mb-3 text-center text-xl md:text-2xl font-bold uppercase tracking-[0.2em] text-purple-300"
                style={{ animationDelay: "0.35s" }}
              >
                Free Downloads
              </h2>
              <div className="grid gap-2">
                {tracks.map((track, i) => (
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
              </div>
            </section>

            {/* Shop Section */}
            <section className="mt-8 md:mt-10">
              <h2
                className="animate-text-float mb-3 text-center text-xl md:text-2xl font-bold uppercase tracking-[0.2em] text-purple-300"
                style={{ animationDelay: "0.4s" }}
              >
                Shop
              </h2>
              <div className="rounded-xl border border-purple-400/25 bg-purple-900/20 p-4 md:p-5 text-center shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
                <p className="text-xs md:text-sm font-extrabold tracking-[0.25em] text-white/90">
                  COMING SOON
                </p>
              </div>
            </section>

            {/* Footer */}
            <footer className="mt-8 md:mt-12 text-center">
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
