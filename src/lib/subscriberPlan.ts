/**
 * What a gate is allowed to do on the accounts it has saved, and for how long.
 *
 * Every gate carries one of these. It governs the *unattended* work only —
 * the release fan-out that likes and reposts a new song from fans who are not
 * on the site at the time. The follow/like/repost a fan performs themselves to
 * unlock a download is their own deliberate action and is never touched here.
 *
 * The three knobs exist because an unattended write is the part of this
 * feature with no human in the loop: the artist should be able to say exactly
 * which actions it may take, how long they stay on someone's profile, and how
 * slowly they arrive. `retainDays` in particular is what turns a permanent
 * mark on a stranger's account into a loan.
 */

/** Two weeks. Past this it isn't a temporary boost, it's just a repost. */
export const MAX_RETAIN_DAYS = 14;

/** A minute between fans unless the gate says otherwise. */
export const DEFAULT_GAP_SECONDS = 60;

/** An hour. Longer and a release to a few hundred fans takes weeks. */
export const MAX_GAP_SECONDS = 60 * 60;

/** A day — the longest a take-off may be spread over. */
export const MAX_REMOVAL_MINUTES = 24 * 60;

/** Take a release back off over two hours unless the gate says otherwise. */
export const DEFAULT_REMOVAL_MINUTES = 120;

export type SubscriberPlan = {
  /** Like the new song from each saved account. */
  like: boolean;
  /** Repost it — the public one, the one that shows up in their followers' feeds. */
  repost: boolean;
  /**
   * Days to leave the like and repost in place before taking them back off.
   * `null` means leave them permanently, which is what the feature did before
   * this setting existed.
   */
  retainDays: number | null;
  /**
   * Seconds between one fan's like/repost and the next. The actual gap is
   * randomised around this (see `jitteredGap`), so the writes never arrive
   * on a metronome.
   */
  gapSeconds: number;
  /**
   * Minutes to spread the take-off across once the retention runs out. Each
   * fan gets their own random moment inside the window, so a release doesn't
   * vanish from every profile in the same five minutes — the mirror image of
   * the rollout, for the same reason.
   */
  removalMinutes: number;
};

/**
 * Like and repost, kept forever, spread over half an hour — the behaviour
 * every gate had before these controls existed, so an un-migrated database
 * and an old row both keep working unchanged.
 */
export const DEFAULT_PLAN: SubscriberPlan = {
  like: true,
  repost: true,
  retainDays: null,
  gapSeconds: DEFAULT_GAP_SECONDS,
  removalMinutes: DEFAULT_REMOVAL_MINUTES
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Accepts whatever the admin form or a database row hands over. */
const toInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const toBool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

/**
 * Coerces anything into a plan that is safe to act on. Out-of-range numbers
 * are clamped rather than rejected: this runs on the fan-out path as well as
 * the form, and a bad number in the database must not stop a release going
 * out — a 400-day retention becoming 14 days is the failure we want.
 */
export const normalizePlan = (input: unknown): SubscriberPlan => {
  if (!input || typeof input !== "object") return { ...DEFAULT_PLAN };
  const raw = input as Record<string, unknown>;

  const retainDays = toInt(raw.retainDays);
  const gapSeconds = toInt(raw.gapSeconds);
  const removalMinutes = toInt(raw.removalMinutes);

  return {
    like: toBool(raw.like, DEFAULT_PLAN.like),
    repost: toBool(raw.repost, DEFAULT_PLAN.repost),
    // 0 or negative reads as "don't expire it" rather than "remove it
    // instantly", which is the safer way to misread an empty field.
    retainDays:
      retainDays === null || retainDays <= 0
        ? null
        : clamp(retainDays, 1, MAX_RETAIN_DAYS),
    gapSeconds:
      gapSeconds === null || gapSeconds <= 0
        ? DEFAULT_GAP_SECONDS
        : clamp(gapSeconds, 5, MAX_GAP_SECONDS),
    removalMinutes:
      removalMinutes === null || removalMinutes <= 0
        ? DEFAULT_REMOVAL_MINUTES
        : clamp(removalMinutes, 1, MAX_REMOVAL_MINUTES)
  };
};

/** Nothing to do — the artist turned both actions off. */
export const planIsNoop = (plan: SubscriberPlan) => !plan.like && !plan.repost;

/**
 * When a like/repost placed now should come back off, as an ISO timestamp,
 * or null when the gate keeps it permanently.
 */
export const removalDueAt = (
  plan: SubscriberPlan,
  from: Date = new Date()
): string | null =>
  plan.retainDays === null
    ? null
    : new Date(from.getTime() + plan.retainDays * 86_400_000).toISOString();

/** One gap, somewhere between 70% and 130% of the setting. */
export const jitteredGap = (plan: SubscriberPlan) =>
  Math.round(plan.gapSeconds * 1000 * (0.7 + Math.random() * 0.6));

/** "1 min", "30 sec", "2 hours" — for the admin portal. */
export const gapLabel = (seconds: number) =>
  seconds < 60
    ? `${seconds} sec`
    : seconds < 3600
      ? `${Math.round(seconds / 60)} min`
      : `${Math.round(seconds / 3600)} hour${seconds >= 7200 ? "s" : ""}`;

/**
 * One fan's take-off moment: the release's deadline plus a random point in
 * the removal window. Null stays null — nothing is coming off.
 */
export const spreadRemoval = (
  deadline: string | null,
  plan: SubscriberPlan
): string | null =>
  deadline === null
    ? null
    : new Date(
        Date.parse(deadline) + Math.floor(Math.random() * plan.removalMinutes * 60_000)
      ).toISOString();

/** One line for the admin portal and the confirm dialog. */
export const describePlan = (plan: SubscriberPlan) => {
  const actions = [plan.like && "like", plan.repost && "repost"].filter(
    Boolean
  ) as string[];
  if (!actions.length) return "Does nothing to your subscribers.";
  const verb = actions.join(" + ");
  const window = `one fan every ${gapLabel(plan.gapSeconds)}`;
  const kept =
    plan.retainDays === null
      ? "kept permanently"
      : `removed after ${plan.retainDays} day${plan.retainDays === 1 ? "" : "s"}`;
  return `${verb[0].toUpperCase()}${verb.slice(1)}, ${window}, ${kept}.`;
};
