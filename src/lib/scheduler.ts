import { createServerSupabase } from "@/lib/supabaseServer";

/**
 * The cron, for hosts that run one long-lived server (Railway) instead of
 * Vercel's scheduled functions.
 *
 * Started from instrumentation.ts, only when RUN_SCHEDULER=1 — on Vercel it
 * never starts, and vercel.json's crons do the job. Every five minutes it
 * calls the same /api/cron/* routes Vercel would, with the same CRON_SECRET,
 * so there is exactly one code path for the work itself.
 *
 *  - /api/cron/subscribers every tick: the release rollout, teardowns and
 *    keepalive. Five minutes is what makes a 30-minute rollout possible.
 *  - /api/cron/stats once a day, on the first tick after 06:00 UTC with no
 *    snapshot for today yet — opening the Stats tab may already have taken
 *    one, which counts.
 *
 * Two runs of the subscriber job at once would race on SoundCloud's
 * single-use refresh tokens and could unsubscribe a fan for good, so:
 * nothing overlaps inside this process, the first tick waits five minutes
 * after boot (by which time the previous deploy's server has been stopped),
 * and a stopping server schedules nothing new.
 */

const TICK_MS = 5 * 60_000;
const STATS_HOUR_UTC = 6;

let started = false;
let running = false;
let stopping = false;

const base = () => `http://127.0.0.1:${process.env.PORT || 3000}`;

const call = async (path: string) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn(`[scheduler] CRON_SECRET is not set — skipping ${path}`);
    return;
  }
  try {
    const res = await fetch(`${base()}${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store"
    });
    const body = await res.text();
    console.log(`[scheduler] ${path} -> ${res.status} ${body.slice(0, 200)}`);
  } catch (error) {
    console.error(`[scheduler] ${path} failed`, error);
  }
};

/** True when today's stats row is missing and it's past the daily hour. */
const statsDue = async () => {
  const now = new Date();
  if (now.getUTCHours() < STATS_HOUR_UTC) return false;
  const supabase = createServerSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("stats_snapshots")
    .select("day")
    .eq("day", now.toISOString().slice(0, 10))
    .maybeSingle();
  return !error && !data;
};

const tick = async () => {
  if (running || stopping) return;
  running = true;
  try {
    await call("/api/cron/subscribers");
    if (await statsDue()) await call("/api/cron/stats");
  } catch (error) {
    console.error("[scheduler] tick failed", error);
  } finally {
    running = false;
  }
};

export const startScheduler = () => {
  if (started) return;
  started = true;
  console.log("[scheduler] on — first run in 5 minutes, then every 5 minutes");
  let interval: ReturnType<typeof setInterval> | null = null;
  const first = setTimeout(() => {
    void tick();
    interval = setInterval(() => void tick(), TICK_MS);
  }, TICK_MS);

  const stop = () => {
    stopping = true;
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
};
