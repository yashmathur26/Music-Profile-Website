"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { campaign } from "@/config/campaign";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";

const PRESAVED_KEY = "yvsh_presaved";

export default function PresaveSuccessPage() {
  useEffect(() => {
    try {
      localStorage.setItem(PRESAVED_KEY, "true");
    } catch {
      // ignore
    }
  }, []);

  const releaseDateStr = new Date(campaign.releaseDate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-xl px-4 py-16 md:px-6 md:py-24">
            <motion.div
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <motion.div
                className="mb-6 text-6xl"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              >
                🔒
              </motion.div>
              <h1 className="text-2xl font-bold text-white md:text-3xl">
                You&apos;re locked in
              </h1>
              <p className="mt-2 text-lg font-semibold" style={{ color: campaign.accentColor }}>
                {campaign.trackTitle}
              </p>
              <p className="mt-4 text-sm text-white/70">
                This track will be saved to your Spotify library on <strong>{releaseDateStr}</strong>.
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just presaved ${campaign.trackTitle} by ${campaign.trackArtist} 🔒`)}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.origin + "/presave" : "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/20"
                >
                  Share on X
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.share) {
                      navigator.share({
                        title: `${campaign.trackTitle} - ${campaign.trackArtist}`,
                        text: `Presave ${campaign.trackTitle}`,
                        url: typeof window !== "undefined" ? `${window.location.origin}/presave` : "",
                      });
                    } else {
                      navigator.clipboard?.writeText(typeof window !== "undefined" ? `${window.location.origin}/presave` : "");
                    }
                  }}
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/20"
                >
                  Copy link
                </button>
              </div>

              <Link
                href="/home"
                className="mt-10 inline-block text-sm text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
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
