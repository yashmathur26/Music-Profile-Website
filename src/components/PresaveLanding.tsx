"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { campaign, isReleaseLive } from "@/config/campaign";
import CountdownTimer from "@/components/CountdownTimer";
import PresaveButtons from "@/components/PresaveButtons";

export default function PresaveLanding() {
  const searchParams = useSearchParams();
  const oauthFailed = searchParams.get("error") === "oauth_failed";
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const width = mounted && typeof window !== "undefined" ? window.innerWidth : 1920;
  const height = mounted && typeof window !== "undefined" ? window.innerHeight : 1080;
  const hue = width > 0 ? (cursorPos.x / width) * 360 : 270;
  const saturation = height > 0 ? 60 + (cursorPos.y / height) * 20 : 70;
  const lightness = height > 0 ? 50 + (cursorPos.y / height) * 10 : 55;
  const accent = campaign.accentColor;
  const released = isReleaseLive(campaign);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#1a0a2e] px-4 py-12">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div
          className="absolute h-[600px] w-[600px] rounded-full overflow-hidden transition-all duration-700"
          style={{
            left: width > 0 ? `${(cursorPos.x / width) * 100}%` : "50%",
            top: height > 0 ? `${(cursorPos.y / height) * 100}%` : "50%",
            transform: "translate(-50%, -50%) translateZ(0)",
            WebkitBackfaceVisibility: "hidden",
            backfaceVisibility: "hidden",
            contain: "paint",
          }}
        >
          <div
            className="absolute inset-0 rounded-full blur-[120px] transition-all duration-700"
            style={{
              transform: "translateZ(0)",
              WebkitBackfaceVisibility: "hidden",
              backfaceVisibility: "hidden",
              background: `radial-gradient(circle at center, hsla(${hue}, ${saturation}%, ${lightness}%, 0.35) 0%, hsla(${hue}, ${saturation}%, ${lightness}%, 0.12) 45%, rgba(0,0,0,0) 70%)`,
            }}
          />
        </div>
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        {oauthFailed && (
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Sign-in didn&apos;t complete. Please try again. If it keeps failing, check that you&apos;re using the same browser and that cookies are enabled.
          </div>
        )}
        <span
          className="rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
          style={{
            borderColor: accent,
            color: accent,
            backgroundColor: `${accent}20`,
            boxShadow: `0 0 20px ${accent}40`,
          }}
        >
          <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          New Music
        </span>

        <div className="relative">
          <div
            className="absolute -inset-3 rounded-2xl blur-xl opacity-60"
            style={{
              background: accent,
              boxShadow: `0 0 50px ${accent}80`,
              transform: "translateZ(0)",
              WebkitBackfaceVisibility: "hidden",
              backfaceVisibility: "hidden",
            }}
          />
          <img
            src={campaign.coverArt}
            alt={campaign.trackTitle}
            className="relative h-36 w-36 rounded-2xl object-cover shadow-2xl md:h-44 md:w-44"
          />
        </div>

        <div>
          <h1
            className="text-3xl font-extrabold tracking-tight md:text-5xl"
            style={{
              background: `linear-gradient(135deg, ${accent}, #fff)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {campaign.trackTitle}
          </h1>
          <p className="mt-1 text-sm text-white/70">{campaign.trackArtist}</p>
          <p className="mt-2 text-xs text-white/50">{campaign.trackDescription}</p>
        </div>

        {campaign.showCountdown && !released && (
          <div className="w-full max-w-xs">
            <CountdownTimer releaseDate={campaign.releaseDate} accentColor={accent} />
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4 sm:justify-center">
          <PresaveButtons released={released} />
          <Link
            href="/home"
            className="flex items-center justify-center gap-2 rounded-2xl border-2 px-8 py-4 text-lg font-bold transition hover:scale-105"
            style={{
              borderColor: accent,
              color: accent,
              backgroundColor: `${accent}15`,
              boxShadow: `0 0 20px ${accent}30`,
            }}
          >
            See socials
          </Link>
        </div>
        <p className="mt-4 text-xs text-white/50">
          One-time sign-in · We&apos;ll add it to your library on release day
        </p>
        <p className="mt-1 text-xs text-white/40">
          Apple Music presave coming soon
        </p>
      </motion.div>
    </main>
  );
}
