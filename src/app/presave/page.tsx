"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { campaign, isReleaseLive } from "@/config/campaign";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import CountdownTimer from "@/components/CountdownTimer";
import SpotifyPresaveButton from "@/components/SpotifyPresaveButton";
import PlatformLinks from "@/components/PlatformLinks";
import EmailCapture from "@/components/EmailCapture";

function PresaveContent() {
  const [mounted, setMounted] = useState(false);
  const [previewBannerDismissed, setPreviewBannerDismissed] = useState(false);
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";

  useEffect(() => setMounted(true), []);

  const released = mounted && isReleaseLive(campaign);
  const accent = campaign.accentColor;

  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-14">
            {isPreview && !previewBannerDismissed && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
              >
                <span>
                  Preview mode — Spotify app isn’t connected yet. Connect your app in{" "}
                  <code className="rounded bg-black/20 px-1.5 py-0.5 text-xs">.env.local</code> to enable presaves.
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewBannerDismissed(true)}
                  className="shrink-0 rounded p-1 text-amber-200/80 hover:bg-amber-500/20 hover:text-amber-100"
                  aria-label="Dismiss"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </motion.div>
            )}

            <motion.div
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="relative mb-6">
                <div
                  className="absolute -inset-4 rounded-2xl blur-xl opacity-50"
                  style={{ background: accent, boxShadow: `0 0 60px ${accent}80` }}
                />
                <img
                  src={campaign.coverArt}
                  alt={campaign.trackTitle}
                  className="relative h-52 w-52 rounded-2xl object-cover shadow-2xl md:h-64 md:w-64"
                />
              </div>

              <h1
                className="text-3xl font-extrabold tracking-tight md:text-4xl"
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

              {campaign.showCountdown && (
                <div className="mt-6">
                  <CountdownTimer releaseDate={campaign.releaseDate} accentColor={accent} />
                </div>
              )}

              <div className="mt-8 w-full max-w-sm">
                <SpotifyPresaveButton
                  released={released}
                  accentColor={accent}
                  spotifyTrackUrl={
                    campaign.spotify.trackUri
                      ? campaign.spotify.trackUri.startsWith("http")
                        ? campaign.spotify.trackUri
                        : `https://open.spotify.com/track/${campaign.spotify.trackUri.replace("spotify:track:", "")}`
                      : undefined
                  }
                />
              </div>

              <div className="mt-8 w-full">
                <PlatformLinks released={released} />
              </div>

              {campaign.showEmailCapture && (
                <div className="mt-6 w-full max-w-md">
                  <EmailCapture accentColor={accent} />
                </div>
              )}

              <Link
                href="/home"
                className="mt-10 text-sm text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
              >
                ← Back to site
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function PresavePage() {
  return (
    <Suspense fallback={
      <main className="relative z-10 flex min-h-screen items-center justify-center bg-[#1a0a2e]/80">
        <p className="text-white/50">Loading…</p>
      </main>
    }>
      <PresaveContent />
    </Suspense>
  );
}
