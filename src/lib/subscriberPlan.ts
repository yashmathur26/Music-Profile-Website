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

/** Spread a release over half an hour unless the gate says otherwise. */
export const DEFAULT_ROLLOUT_MINUTES = 30;

/** A day. Longer than this and a release is still trickling out next week. */
export const MAX_ROLLOUT_MINUTES = 24 * 60;

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
  /** Minutes to spread one release's writes across. */
  rolloutMinutes: number;
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
  rolloutMinutes: DEFAULT_ROLLOUT_MINUTES
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
  const rolloutMinutes = toInt(raw.rolloutMinutes);

  return {
    like: toBool(raw.like, DEFAULT_PLAN.like),
    repost: toBool(raw.repost, DEFAULT_PLAN.repost),
    // 0 or negative reads as "don't expire it" rather than "remove it
    // instantly", which is the safer way to misread an empty field.
    retainDays:
      retainDays === null || retainDays <= 0
        ? null
        : clamp(retainDays, 1, MAX_RETAIN_DAYS),
    rolloutMinutes:
      rolloutMinutes === null || rolloutMinutes <= 0
        ? DEFAULT_ROLLOUT_MINUTES
        : clamp(rolloutMinutes, 1, MAX_ROLLOUT_MINUTES)
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

/** One line for the admin portal and the confirm dialog. */
export const describePlan = (plan: SubscriberPlan) => {
  const actions = [plan.like && "like", plan.repost && "repost"].filter(
    Boolean
  ) as string[];
  if (!actions.length) return "Does nothing to your subscribers.";
  const verb = actions.join(" + ");
  const window =
    plan.rolloutMinutes >= 120
      ? `${Math.round(plan.rolloutMinutes / 60)}h`
      : `${plan.rolloutMinutes} min`;
  const kept =
    plan.retainDays === null
      ? "kept permanently"
      : `removed after ${plan.retainDays} day${plan.retainDays === 1 ? "" : "s"}`;
  return `${verb[0].toUpperCase()}${verb.slice(1)} over ${window}, ${kept}.`;
};
