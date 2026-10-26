import { createServerSupabase } from "@/lib/supabaseServer";

/**
 * The site's cron. Railway runs one long-lived server, so the schedule lives
 * inside it rather than in a platform config.
 *
 * Started from instrumentation.ts — see `schedulerWanted` for when. Every
 * five minutes it calls the /api/cron/* routes with CRON_SECRET, so the work
 * itself has exactly one code path whether the scheduler or a person
 * triggers it.
 *
 *  - /api/cron/subscribers every tick: the release rollout, teardowns and
 *    keepalive. Five minutes is what makes a 30-minute rollout possible.
 *  - /api/cron/stats once a day, on the first tick after 06:00 UTC with no
 *    snapshot for today yet — opening the Stats tab or a download may already
 *    have taken one, which counts.
 *
 * Two runs of the subscriber job at once would race on SoundCloud's
 * single-use refresh tokens and could unsubscribe a fan for good, so:
 * nothing overlaps inside this process, the first tick waits five minutes
 * after boot (by which time the previous deploy's server has been stopped),
 * and a stopping server schedules nothing new.
 *
 * What it's doing is kept in `schedulerStatus()` and served at
 * /api/scheduler, because the first move to Railway shipped without
 * RUN_SCHEDULER and nothing said so: a week of fans went unrefreshed, and the
 * only way to notice was a timestamp in the database.
 */

const TICK_MS = 5 * 60_000;
const STATS_HOUR_UTC = 6;

export type TickResult = { at: string; status: number | null; body: string };

export type SchedulerStatus = {
  on: boolean;
  /** Why it isn't running, when it isn't. */
  off: string | null;
  startedAt: string | null;
  nextTickAt: string | null;
  /** CRON_SECRET wasn't set, so this process made up its own. */
  ephemeralSecret: boolean;
  ticks: number;
  lastSubscribers: TickResult | null;
  lastStats: TickResult | null;
};

/**
 * On globalThis rather than in module scope: instrumentation.ts and the API
 * routes are separate bundles, each with its own copy of this module, and
 * /api/scheduler has to see the copy the scheduler is actually running in.
 */
type SchedulerState = SchedulerStatus & { running: boolean; stopping: boolean };

const STATE_KEY = Symbol.for("yvsh.scheduler");
const globalState = globalThis as typeof globalThis & {
  [STATE_KEY]?: SchedulerState;
};

const state = (): SchedulerState =>
  (globalState[STATE_KEY] ??= {
    on: false,
    off: "not started",
    startedAt: null,
    nextTickAt: null,
    ephemeralSecret: false,
    ticks: 0,
    lastSubscribers: null,
    lastStats: null,
    running: false,
    stopping: false
  });

export const schedulerStatus = (): SchedulerStatus => {
  const { running: _running, stopping: _stopping, ...status } = state();
  return status;
};

/**
 * Whether this server should run the cron.
 *
 * RUN_SCHEDULER=1 turns it on anywhere and RUN_SCHEDULER=0 turns it off
 * anywhere. Unset, it runs only in Railway's production environment — the one
 * place there is exactly one long-lived copy of the site — so a forgotten
 * variable no longer means a silently dead cron, while a laptop or a Railway
 * PR environment still never runs it.
 */
export const schedulerWanted = (): { on: boolean; why: string } => {
  const flag = process.env.RUN_SCHEDULER?.trim();
  if (flag === "1") return { on: true, why: "RUN_SCHEDULER=1" };
  if (flag === "0") return { on: false, why: "RUN_SCHEDULER=0" };
  if (process.env.RAILWAY_ENVIRONMENT_NAME === "production") {
    return { on: true, why: "Railway production" };
  }
  return { on: false, why: "not Railway production and RUN_SCHEDULER is unset" };
};

export const markSchedulerOff = (why: string) => {
  state().off = why;
};

const base = () => `http://127.0.0.1:${process.env.PORT || 3000}`;

const call = async (path: string): Promise<TickResult> => {
  const at = new Date().toISOString();
  try {
    const res = await fetch(`${base()}${path}`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: "no-store"
    });
    const body = (await res.text()).slice(0, 300);
    console.log(`[scheduler] ${path} -> ${res.status} ${body.slice(0, 200)}`);
    return { at, status: res.status, body };
  } catch (error) {
    console.error(`[scheduler] ${path} failed`, error);
    return { at, status: null, body: String(error).slice(0, 300) };
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
  const s = state();
  if (s.running || s.stopping) return;
  s.running = true;
  s.nextTickAt = new Date(Date.now() + TICK_MS).toISOString();
  try {
    s.ticks++;
    s.lastSubscribers = await call("/api/cron/subscribers");
    if (await statsDue()) s.lastStats = await call("/api/cron/stats");
  } catch (error) {
    console.error("[scheduler] tick failed", error);
  } finally {
    s.running = false;
  }
};

export const startScheduler = (why: string) => {
  const s = state();
  if (s.on) return;

  // The cron routes only answer to CRON_SECRET. Without one the scheduler
  // used to skip every tick; a secret this process makes up works just as
  // well, since the only caller is this same process.
  if (!process.env.CRON_SECRET?.trim()) {
    // Web Crypto, not the "crypto" module: instrumentation is also bundled
    // for the edge runtime, which has no Node built-ins.
    process.env.CRON_SECRET = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    s.ephemeralSecret = true;
    console.warn(
      "[scheduler] CRON_SECRET is not set — using a per-process one. " +
        "Set it on Railway to trigger /api/cron/* by hand."
    );
  }

  s.on = true;
  s.off = null;
  s.startedAt = new Date().toISOString();
  s.nextTickAt = new Date(Date.now() + TICK_MS).toISOString();
  console.log(`[scheduler] on (${why}) — first run in 5 minutes, then every 5 minutes`);

  let interval: ReturnType<typeof setInterval> | null = null;
  const first = setTimeout(() => {
    void tick();
    interval = setInterval(() => void tick(), TICK_MS);
  }, TICK_MS);

  const stop = () => {
    s.stopping = true;
    s.nextTickAt = null;
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
};
