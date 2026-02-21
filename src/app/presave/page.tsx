"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { redirect } from "next/navigation";
import { motion } from "framer-motion";
import { campaign, isReleaseLive } from "@/config/campaign";
import { features } from "@/config/features";
import CountdownTimer from "@/components/CountdownTimer";
import PresaveButtons from "@/components/PresaveButtons";

function PresaveContent() {
  const searchParams = useSearchParams();
  const oauthFailed = searchParams.get("error") === "oauth_failed";
  const accent = campaign.accentColor;
  const released = isReleaseLive(campaign);

  if (!campaign.isActive || !features.presave) {
    redirect("/home");
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#1a0a2e] px-4 py-12">
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
        <Link
          href="/contact"
          className="mt-6 text-sm font-medium underline-offset-2 hover:underline"
          style={{ color: accent }}
        >
          Contact →
        </Link>
      </motion.div>
    </main>
  );
}

export default function PresavePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#1a0a2e]" />}>
      <PresaveContent />
    </Suspense>
  );
}
