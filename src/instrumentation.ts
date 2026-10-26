/**
 * Runs once when the server boots. On Railway production (or anywhere with
 * RUN_SCHEDULER=1) it starts the built-in cron — see lib/scheduler.ts.
 * Everywhere else it only records why it didn't, for /api/scheduler.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { markSchedulerOff, schedulerWanted, startScheduler } = await import(
    "@/lib/scheduler"
  );
  const wanted = schedulerWanted();
  if (wanted.on) startScheduler(wanted.why);
  else markSchedulerOff(wanted.why);
}
