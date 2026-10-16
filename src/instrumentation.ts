/**
 * Runs once when the server boots. On a long-lived host with
 * RUN_SCHEDULER=1 (Railway), it starts the built-in cron — see
 * lib/scheduler.ts. Everywhere else it does nothing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_SCHEDULER !== "1") return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
