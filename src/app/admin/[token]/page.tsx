"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";

const POLL_INTERVAL_MS = 4000;

type Stats = {
  count: number;
  campaignId: string;
  trackTitle: string;
  isActive: boolean;
};

export default function AdminStatsPage() {
  const params = useParams();
  const token = params.token as string;

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{ total: number; saved: number; failed: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/artist/stats?key=${encodeURIComponent(token)}`);
      if (!res.ok) {
        setInvalid(true);
        return;
      }
      const data = await res.json();
      setStats(data);
      setLastUpdated(new Date());
      setInvalid(false);
    } catch {
      setInvalid(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (invalid || !token) return;
    const t = setInterval(fetchStats, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [invalid, token, fetchStats]);

  const handleTriggerSaves = async () => {
    if (!token) return;
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch("/api/trigger-saves", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "{}",
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTriggerResult({ total: data.total, saved: data.saved, failed: data.failed });
      fetchStats();
    } catch {
      setTriggerResult({ total: 0, saved: 0, failed: 0 });
    } finally {
      setTriggering(false);
    }
  };

  if (loading && !stats) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0612]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,80,200,0.25),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_50%,rgba(88,28,135,0.15),transparent)]" />
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative text-white/50"
        >
          Loading…
        </motion.p>
      </main>
    );
  }

  if (invalid) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0612] p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,80,200,0.2),transparent)]" />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl border border-white/10 bg-white/5 px-8 py-10 text-center backdrop-blur-xl"
        >
          <p className="text-lg font-medium text-white/90">Invalid or expired link</p>
          <p className="mt-2 text-sm text-white/50">Use the admin URL from your setup docs.</p>
        </motion.div>
      </main>
    );
  }

  const updatedAgo = lastUpdated
    ? Math.round((Date.now() - lastUpdated.getTime()) / 1000)
    : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0612]">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,80,200,0.28),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_50%,rgba(88,28,135,0.18),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_20%_80%,rgba(139,92,246,0.12),transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-2xl px-6 py-16 md:py-24">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-14 text-center"
        >
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-white/40">Admin</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white/90 md:text-3xl">
            {stats?.trackTitle ?? "Campaign"}
          </h1>
        </motion.header>

        {/* Main stat card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-xl"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />
          <div className="relative px-8 py-14 md:py-16">
            <p className="text-center text-sm font-medium uppercase tracking-widest text-white/50">
              Presaves
            </p>
            <motion.p
              key={stats?.count ?? 0}
              initial={{ scale: 1.1, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="mt-4 text-center text-6xl font-extrabold tabular-nums tracking-tight text-white md:text-7xl"
              style={{
                textShadow: "0 0 60px rgba(167, 139, 250, 0.4), 0 0 120px rgba(139, 92, 246, 0.2)",
              }}
            >
              {stats?.count ?? 0}
            </motion.p>
            <p className="mt-3 text-center text-sm text-white/40">fans locked in</p>

            {/* Live indicator — tick drives 1s re-renders so "Updated Xs ago" stays accurate */}
            <div data-tick={tick} className="mt-8 flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs text-white/50">
                {updatedAgo !== null ? `Updated ${updatedAgo}s ago` : "Live"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Trigger section */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
        >
          <p className="text-sm font-medium text-white/70">Release day</p>
          <p className="mt-1 text-xs text-white/45">
            Save the track to every fan’s Spotify library in one click.
          </p>
          <button
            type="button"
            onClick={handleTriggerSaves}
            disabled={triggering}
            className="mt-4 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {triggering ? "Running…" : "Trigger saves now"}
          </button>
          {triggerResult && (
            <p className="mt-4 text-sm text-white/60">
              {triggerResult.saved} saved, {triggerResult.failed} failed
              {triggerResult.total > 0 ? ` · ${triggerResult.total} total` : ""}
            </p>
          )}
        </motion.section>

        {/* Footer note */}
        <p className="mt-12 text-center text-[11px] uppercase tracking-widest text-white/30">
          Stats refresh every {POLL_INTERVAL_MS / 1000}s
        </p>
      </div>
    </main>
  );
}
