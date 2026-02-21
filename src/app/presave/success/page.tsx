"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { campaign } from "@/config/campaign";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";

const PRESAVED_KEY = "yvsh_presaved";

function PresaveSuccessContent() {
  const searchParams = useSearchParams();
  const alreadyPresaved = searchParams.get("already") === "1";
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSuccess, setRemoveSuccess] = useState(false);

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

  async function handleRemovePresave() {
    setRemoveError(null);
    setRemoveLoading(true);
    try {
      const res = await fetch("/api/presave/remove", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRemoveError(data.error ?? "Something went wrong");
        return;
      }
      setRemoveSuccess(true);
      try {
        localStorage.removeItem(PRESAVED_KEY);
      } catch {
        // ignore
      }
    } finally {
      setRemoveLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setEmailLoading(true);
    try {
      const res = await fetch("/api/presave/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEmailError(data.error ?? "Something went wrong");
        return;
      }
      setEmailSubmitted(true);
    } finally {
      setEmailLoading(false);
    }
  }

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
                {alreadyPresaved ? "✓" : "🔒"}
              </motion.div>
              <h1 className="text-2xl font-bold text-white md:text-3xl">
                {alreadyPresaved ? "You already presaved" : "You're locked in"}
              </h1>
              <p className="mt-2 text-lg font-semibold" style={{ color: campaign.accentColor }}>
                {campaign.trackTitle}
              </p>
              <p className="mt-4 text-sm text-white/70">
                {alreadyPresaved
                  ? "You're all set — we'll add it to your library on release day."
                  : <>This track will be saved to your Spotify library on <strong>{releaseDateStr}</strong>.</>}
              </p>

              {campaign.showEmailCapture && (
                <div className="mt-6 w-full max-w-sm">
                  {emailSubmitted ? (
                    <p className="text-sm font-medium text-white/80">
                      Thanks! We&apos;ll notify you when it drops.
                    </p>
                  ) : (
                    <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2 text-left">
                      <label htmlFor="presave-email" className="text-xs font-medium text-white/60">
                        Get notified when it drops (optional)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="presave-email"
                          type="email"
                          placeholder="your@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
                          disabled={emailLoading}
                        />
                        <button
                          type="submit"
                          disabled={emailLoading}
                          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: campaign.accentColor }}
                        >
                          {emailLoading ? "..." : "Notify me"}
                        </button>
                      </div>
                      {emailError && (
                        <p className="text-xs text-red-400">{emailError}</p>
                      )}
                    </form>
                  )}
                </div>
              )}

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

              {removeSuccess ? (
                <p className="mt-8 text-sm font-medium text-white/80">
                  Your presave has been removed. You can presave again anytime.
                </p>
              ) : (
                <div className="mt-8 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRemovePresave}
                    disabled={removeLoading}
                    className="rounded-xl border border-white/20 bg-transparent px-5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white/90 disabled:opacity-50"
                  >
                    {removeLoading ? "Removing…" : "Remove my presave"}
                  </button>
                  {removeError && (
                    <p className="max-w-xs text-center text-xs text-red-400">
                      {removeError}
                    </p>
                  )}
                </div>
              )}

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

export default function PresaveSuccessPage() {
  return (
    <Suspense fallback={
      <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-white/50">Loading...</p>
        </div>
      </main>
    }>
      <PresaveSuccessContent />
    </Suspense>
  );
}
