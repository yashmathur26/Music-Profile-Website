import { takeSnapshot } from "@/lib/statsSnapshot";

/**
 * Re-takes the SoundCloud snapshot after each download, so the Stats tab
 * shows a new fan (do they follow, do they like it, the song's counters)
 * within minutes instead of the next morning.
 *
 * A snapshot walks every downloader on SoundCloud, so downloads don't each
 * get their own:
 *
 *  - it starts a minute after the download, which gives SoundCloud time to
 *    show the follow and like the gate just placed, and lets a burst of
 *    downloads share one run;
 *  - runs start at least five minutes apart;
 *  - a download during a run queues exactly one more run after it.
 *
 * Only the app's own token is used — never a fan's — so this can't collide
 * with the subscriber cron's single-use refresh tokens. It runs in the
 * background of the download request, which is fine on Railway's long-lived
 * server; on a serverless host it would die with the request.
 */

const DELAY_MS = 60_000;
const MIN_GAP_MS = 5 * 60_000;

type RefreshState = {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  /** A download arrived mid-run; its fan isn't in the run's fan list. */
  again: boolean;
  lastStartedAt: number;
};

/** On globalThis so every route bundle shares one queue. */
const STATE_KEY = Symbol.for("yvsh.statsRefresh");
const globalState = globalThis as typeof globalThis & {
  [STATE_KEY]?: RefreshState;
};
const state = (): RefreshState =>
  (globalState[STATE_KEY] ??= {
    timer: null,
    running: false,
    again: false,
    lastStartedAt: 0
  });

const run = async () => {
  const s = state();
  s.timer = null;
  s.running = true;
  s.lastStartedAt = Date.now();
  try {
    const snapshot = await takeSnapshot();
    console.log(
      `[stats] refreshed after download — ${Object.keys(snapshot.fans).length} fans` +
        (snapshot.partial ? " (partial)" : "")
    );
  } catch (error) {
    console.error("[stats] refresh after download failed", error);
  } finally {
    s.running = false;
    if (s.again) {
      s.again = false;
      queueStatsRefresh();
    }
  }
};

/** Call after a download is recorded. Never throws, never waits. */
export const queueStatsRefresh = () => {
  const s = state();
  if (s.running) {
    s.again = true;
    return;
  }
  if (s.timer) return;
  const at = Math.max(Date.now() + DELAY_MS, s.lastStartedAt + MIN_GAP_MS);
  s.timer = setTimeout(() => void run(), at - Date.now());
};
