"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { campaign } from "@/config/campaign";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";

const SPOTIFY_GREEN = "#1DB954";
const AUTHORIZE_URL = "/api/spotify/authorize?returnTo=/presave/success";

export default function PresaveConfirmPage() {
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const accent = campaign.accentColor;

  const canContinue = ageOk && termsOk;

  function handleContinue() {
    if (!canContinue) return;
    // Full navigation so the browser follows the 302 redirect to Spotify (router.push doesn't)
    window.location.href = AUTHORIZE_URL;
  }

  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-lg px-4 py-12 md:px-6 md:py-16">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 md:p-8"
            >
              <h1 className="text-xl font-bold text-white md:text-2xl">
                Pre-save on Spotify
              </h1>
              <p className="mt-2 text-sm text-white/70">
                We&apos;ll add <strong style={{ color: accent }}>{campaign.trackTitle}</strong> to your Spotify library on release day. You only sign in once.
              </p>

              <div className="mt-6 space-y-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={ageOk}
                    onChange={(e) => setAgeOk(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-green-500 focus:ring-green-500"
                  />
                  <span className="text-sm text-white/80">
                    I am at least 13 years old (16 in the EEA and UK).
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={termsOk}
                    onChange={(e) => setTermsOk(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-green-500 focus:ring-green-500"
                  />
                  <span className="text-sm text-white/80">
                    I agree to the{" "}
                    <Link href="/terms" className="underline underline-offset-2 hover:text-white" target="_blank" rel="noopener noreferrer">
                      Terms & Conditions
                    </Link>.
                  </span>
                </label>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className="flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-bold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: canContinue ? SPOTIFY_GREEN : "#333",
                    boxShadow: canContinue ? `0 0 24px ${SPOTIFY_GREEN}40` : "none",
                  }}
                >
                  Continue to Spotify
                </button>
                <Link
                  href="/presave"
                  className="rounded-2xl border border-white/20 bg-white/5 px-6 py-3.5 text-center text-sm font-medium text-white/80 transition hover:bg-white/10"
                >
                  Cancel
                </Link>
              </div>
            </motion.div>

            <p className="mt-6 text-center text-xs text-white/50">
              <Link href="/presave" className="underline-offset-2 hover:underline">← Back to presave</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
