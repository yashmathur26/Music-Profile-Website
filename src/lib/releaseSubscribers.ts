import { randomBytes } from "crypto";
import { createServerSupabase } from "@/lib/supabaseServer";
import { SoundcloudApiError, refreshAccessToken } from "@/lib/soundcloud";

/**
 * Fans who ticked "like + repost my future releases" on a download gate.
 *
 * This is the only place in the app that holds a SoundCloud token beyond the
 * fan's own visit, so two rules apply everywhere below:
 *
 *  - a row exists only because someone checked an unchecked box, and
 *  - `revoke_token` must stay usable forever, because it is the one link that
 *    lets them undo that without logging in anywhere.
 *
 * Unlike the gate's session mirror in db.ts, Supabase is the source of truth
 * here — there is no cookie to fall back to weeks later — so these helpers
 * surface failures to their callers instead of swallowing them.
 */
export type ReleaseSubscriber = {
  id: string;
  sc_user_id: string;
  sc_username: string | null;
  sc_profile_url: string | null;
  access_token: string | null;
  refresh_token: string;
  expires_at: string | null;
  revoke_token: string;
  source_track_slug: string | null;
  created_at: string;
  updated_at: string;
  last_refreshed_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export type ReleaseAction = {
  id: string;
  subscriber_id: string;
  track_slug: string;
  liked: boolean;
  reposted: boolean;
  error: string | null;
  /** When the like/repost should come back off, per the gate's retention
   * setting. Null means the gate keeps them permanently. */
  remove_after: string | null;
  /** Set once the teardown has run, successfully or not — it is the flag that
   * stops the job retrying the same row every tick. */
  removed_at: string | null;
  /** Why a removal couldn't happen (the fan revoked us, SoundCloud refused).
   * Null on a clean removal. */
  remove_error: string | null;
  /** Failed teardown attempts so far. Bounded, so a row SoundCloud keeps
   * refusing is eventually given up on instead of retried every tick until
   * the end of time. */
  remove_attempts: number;
};

/** Attempts before a row is written off — see `remove_attempts`. */
export const MAX_REMOVAL_ATTEMPTS = 5;

/** A due removal with the fan's credentials attached, in one query. */
export type DueRemoval = ReleaseAction & {
  subscriber: ReleaseSubscriber | null;
};

const SUBSCRIBERS = "release_subscribers";
const ACTIONS = "release_actions";
const ANNOUNCEMENTS = "release_announcements";

const supabase = createServerSupabase();

export class SubscribersUnavailableError extends Error {
  constructor() {
    super(
      `Supabase is not configured, or the "${SUBSCRIBERS}" table is missing. ` +
        "Run the migration in docs/RELEASE_SUBSCRIBERS_SETUP.md."
    );
    this.name = "SubscribersUnavailableError";
  }
}

const client = () => {
  if (!supabase) throw new SubscribersUnavailableError();
  return supabase;
};

/** Whether the opt-in can be offered at all — the gate hides the box if not. */
export const subscriptionsConfigured = () => Boolean(supabase);

const newRevokeToken = () => randomBytes(24).toString("base64url");

/**
 * Records (or re-activates) an opt-in. Keyed on the SoundCloud user id so a fan
 * who downloads five songs is one subscriber, not five, and so re-ticking the
 * box after a revoke reuses the same row.
 *
 * The refresh token is always overwritten: SoundCloud rotates it on every use,
 * and the freshest one the fan just handed us is the only one still valid.
 */
export const subscribe = async (params: {
  scUserId: string;
  scUsername?: string | null;
  scProfileUrl?: string | null;
  accessToken?: string | null;
  refreshToken: string;
  expiresAt?: string | null;
  sourceTrackSlug?: string | null;
}): Promise<ReleaseSubscriber> => {
  const now = new Date().toISOString();
  const existing = await findBySoundcloudId(params.scUserId);

  const { data, error } = await client()
    .from(SUBSCRIBERS)
    .upsert(
      {
        sc_user_id: params.scUserId,
        sc_username: params.scUsername || null,
        sc_profile_url: params.scProfileUrl || null,
        access_token: params.accessToken || null,
        refresh_token: params.refreshToken,
        expires_at: params.expiresAt || null,
        // Keep the link already in the wild; only a brand-new row needs one.
        revoke_token: existing?.revoke_token || newRevokeToken(),
        source_track_slug: params.sourceTrackSlug || null,
        created_at: existing?.created_at || now,
        updated_at: now,
        last_refreshed_at: now,
        // Re-ticking the box is a fresh, deliberate opt-in: clear the revoke.
        revoked_at: null,
        revoked_reason: null
      },
      { onConflict: "sc_user_id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as ReleaseSubscriber;
};

export const findBySoundcloudId = async (
  scUserId: string
): Promise<ReleaseSubscriber | null> => {
  const { data, error } = await client()
    .from(SUBSCRIBERS)
    .select("*")
    .eq("sc_user_id", scUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as ReleaseSubscriber) ?? null;
};

export const findByRevokeToken = async (
  revokeToken: string
): Promise<ReleaseSubscriber | null> => {
  if (!revokeToken.trim()) return null;
  const { data, error } = await client()
    .from(SUBSCRIBERS)
    .select("*")
    .eq("revoke_token", revokeToken)
    .maybeSingle();
  if (error) throw error;
  return (data as ReleaseSubscriber) ?? null;
};

/** Everyone still opted in, oldest first. */
/** How many fans are opted in right now — the number the admin portal shows
 * next to the "tell my subscribers" checkbox, so the artist knows what the
 * box will actually do before ticking it. */
export const countActive = async (): Promise<number> => {
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from(SUBSCRIBERS)
      .select("*", { count: "exact", head: true })
      .is("revoked_at", null);
    if (error) throw error;
    return count ?? 0;
  } catch {
    // A missing table shouldn't take down the admin page.
    return 0;
  }
};

export const listActive = async (): Promise<ReleaseSubscriber[]> => {
  const { data, error } = await client()
    .from(SUBSCRIBERS)
    .select("*")
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReleaseSubscriber[];
};

/**
 * Ends a subscription. The row stays so the same fan's revoke link keeps
 * working and a later re-tick lands on the same id, but the tokens are wiped —
 * we have no business holding them once consent is withdrawn.
 *
 * `reason` is "fan" for a revoke-link click, or the failure that killed the
 * token (SoundCloud itself having forgotten the grant, say).
 */
export const revoke = async (
  id: string,
  reason: "fan" | "token_invalid" | "admin"
): Promise<void> => {
  const { error } = await client()
    .from(SUBSCRIBERS)
    .update({
      access_token: null,
      refresh_token: "",
      expires_at: null,
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);
  if (error) throw error;
};

const storeTokens = async (
  id: string,
  tokens: { accessToken: string; refreshToken: string | null; expiresAt: string | null }
): Promise<void> => {
  const now = new Date().toISOString();
  const { error } = await client()
    .from(SUBSCRIBERS)
    .update({
      access_token: tokens.accessToken,
      // A refresh response without a new refresh token means keep the old one.
      ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
      expires_at: tokens.expiresAt,
      last_refreshed_at: now,
      updated_at: now
    })
    .eq("id", id);
  if (error) throw error;
};

/** A refresh token SoundCloud no longer recognises — the grant is gone. */
const isDeadGrant = (error: unknown) =>
  error instanceof SoundcloudApiError &&
  (error.status === 400 || error.status === 401) &&
  /invalid_grant|invalid_token|unauthorized/i.test(error.body);

export type TokenResult =
  | { ok: true; accessToken: string; refreshed: boolean }
  /** The grant is dead and the row has been revoked — don't retry this fan. */
  | { ok: false; dead: true; reason: string }
  /** Transient (SoundCloud down, rate limited) — worth retrying later. */
  | { ok: false; dead: false; reason: string };

/**
 * Hands back a usable access token, refreshing first if the stored one is
 * within five minutes of expiry.
 *
 * SoundCloud's refresh tokens are single-use, so the replacement is written
 * back before the token is handed out — if that write fails we must treat the
 * whole thing as a failure rather than use a token whose successor is lost.
 * For the same reason only one job may refresh a given fan at a time: two
 * concurrent callers would leave the loser holding a retired token, which
 * comes back as `invalid_grant` and is indistinguishable from a fan who
 * revoked access — so it would unsubscribe them for good. Everything
 * background therefore runs through the single cron in
 * /api/cron/subscribers, which never does two jobs at once.
 */
export const getAccessToken = async (
  subscriber: ReleaseSubscriber
): Promise<TokenResult> => {
  const expiresAt = subscriber.expires_at
    ? Date.parse(subscriber.expires_at)
    : null;
  const stale =
    expiresAt === null || Number.isNaN(expiresAt)
      ? true
      : expiresAt - Date.now() < 5 * 60_000;

  if (!stale && subscriber.access_token) {
    return { ok: true, accessToken: subscriber.access_token, refreshed: false };
  }

  if (!subscriber.refresh_token) {
    await revoke(subscriber.id, "token_invalid");
    return { ok: false, dead: true, reason: "no_refresh_token" };
  }

  let tokens;
  try {
    tokens = await refreshAccessToken(subscriber.refresh_token);
  } catch (error) {
    if (isDeadGrant(error)) {
      await revoke(subscriber.id, "token_invalid");
      return { ok: false, dead: true, reason: "invalid_grant" };
    }
    return {
      ok: false,
      dead: false,
      reason:
        error instanceof SoundcloudApiError
          ? `soundcloud_${error.status}`
          : "refresh_failed"
    };
  }

  try {
    await storeTokens(subscriber.id, tokens);
  } catch (error) {
    console.error(
      `[subscribers] lost the rotated refresh token for ${subscriber.id}`,
      error
    );
    return { ok: false, dead: false, reason: "token_write_failed" };
  }

  return { ok: true, accessToken: tokens.accessToken, refreshed: true };
};

export const listActions = async (
  trackSlug: string
): Promise<ReleaseAction[]> => {
  const { data, error } = await client()
    .from(ACTIONS)
    .select("*")
    .eq("track_slug", trackSlug);
  if (error) throw error;
  return (data ?? []) as ReleaseAction[];
};

/** Upserted per (fan, release), so re-running a release is a no-op per fan. */
export const recordAction = async (params: {
  subscriberId: string;
  trackSlug: string;
  liked: boolean;
  reposted: boolean;
  error?: string | null;
  /** From the gate's retention setting, as an ISO timestamp. Null leaves the
   * like and repost in place for good. */
  removeAfter?: string | null;
}): Promise<void> => {
  const { error } = await client()
    .from(ACTIONS)
    .upsert(
      {
        subscriber_id: params.subscriberId,
        track_slug: params.trackSlug,
        liked: params.liked,
        reposted: params.reposted,
        error: params.error || null,
        remove_after: params.removeAfter || null,
        // Re-running a release puts the like/repost back, so any earlier
        // teardown of this pair is no longer the current state.
        removed_at: null,
        remove_error: null,
        remove_attempts: 0,
        updated_at: new Date().toISOString()
      },
      { onConflict: "subscriber_id,track_slug" }
    );
  if (error) throw error;
};

/**
 * Likes and reposts whose time is up, oldest deadline first, with the fan's
 * tokens embedded so the teardown doesn't make one query per row.
 *
 * Rows where nothing was ever placed are skipped — there is nothing to take
 * back — and so are rows already torn down, which is what keeps this from
 * re-running against the same fan on every tick.
 */
export const listDueRemovals = async (limit: number): Promise<DueRemoval[]> => {
  const { data, error } = await client()
    .from(ACTIONS)
    .select("*, subscriber:release_subscribers(*)")
    .not("remove_after", "is", null)
    .lte("remove_after", new Date().toISOString())
    .is("removed_at", null)
    .or("liked.eq.true,reposted.eq.true")
    .order("remove_after", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DueRemoval[];
};

/** How many removals are waiting — for the admin portal's gate row. */
export const countDueRemovals = async (): Promise<number> => {
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from(ACTIONS)
      .select("*", { count: "exact", head: true })
      .not("remove_after", "is", null)
      .lte("remove_after", new Date().toISOString())
      .is("removed_at", null)
      .or("liked.eq.true,reposted.eq.true");
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
};

/**
 * Closes out a teardown. `liked`/`reposted` are what is still on the account
 * afterwards, so a clean removal passes false for both; a partial one records
 * what it couldn't take off alongside the reason.
 *
 * `removed_at` is set either way. A removal that failed for a reason that
 * won't change — the fan revoked us, so we have no credentials — must not be
 * retried forever, and the reason stays on the row to say why the like is
 * still there.
 */
export const markRemoved = async (params: {
  actionId: string;
  liked: boolean;
  reposted: boolean;
  error?: string | null;
}): Promise<void> => {
  const now = new Date().toISOString();
  const { error } = await client()
    .from(ACTIONS)
    .update({
      liked: params.liked,
      reposted: params.reposted,
      removed_at: now,
      remove_error: params.error || null,
      updated_at: now
    })
    .eq("id", params.actionId);
  if (error) throw error;
};

/**
 * Records a teardown that didn't work but might next time, and gives up once
 * the row has had `MAX_REMOVAL_ATTEMPTS` goes.
 *
 * Returns whether the row was written off. Without the counter a row that
 * SoundCloud permanently refuses would be picked up by every single tick
 * forever, crowding out the removals that can still succeed.
 */
export const noteRemovalFailure = async (params: {
  action: ReleaseAction;
  reason: string;
  /** What is still on the account. A pass that got the like off but not the
   * repost must persist that, or the next pass re-reads stale flags and
   * reports a removal it never made. */
  liked?: boolean;
  reposted?: boolean;
}): Promise<boolean> => {
  const { action, reason } = params;
  const attempts = (action.remove_attempts || 0) + 1;
  const exhausted = attempts >= MAX_REMOVAL_ATTEMPTS;
  const now = new Date().toISOString();
  const { error } = await client()
    .from(ACTIONS)
    .update({
      liked: params.liked ?? action.liked,
      reposted: params.reposted ?? action.reposted,
      remove_attempts: attempts,
      remove_error: reason,
      ...(exhausted ? { removed_at: now } : {}),
      updated_at: now
    })
    .eq("id", action.id);
  if (error) throw error;
  return exhausted;
};

/**
 * The queue behind the admin portal's "tell my subscribers" checkbox.
 *
 * Creating a gate can't wait on the fan-out — hundreds of fans times two API
 * calls each outlives any request — so ticking the box only records the intent
 * here, and the cron in /api/cron/subscribers drains it in chunks.
 * That also spreads the writes out instead of firing every account at
 * SoundCloud in the same second.
 */
export type AnnouncementStatus = "pending" | "running" | "done" | "failed";

export type ReleaseAnnouncement = {
  id: string;
  track_slug: string;
  status: AnnouncementStatus;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  processed: number;
  liked: number;
  reposted: number;
  failed: number;
  last_error: string | null;
};

/** Queues a release, or re-opens one that already ran — re-running is safe,
 * since each fan's result is recorded per release and skipped next time. */
export const requestAnnouncement = async (
  trackSlug: string
): Promise<ReleaseAnnouncement> => {
  const now = new Date().toISOString();
  const { data, error } = await client()
    .from(ANNOUNCEMENTS)
    .upsert(
      {
        track_slug: trackSlug,
        status: "pending",
        requested_at: now,
        started_at: null,
        completed_at: null,
        last_error: null
      },
      { onConflict: "track_slug" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as ReleaseAnnouncement;
};

/** Oldest unfinished release first, so a queue of several drains in order. */
export const nextAnnouncement =
  async (): Promise<ReleaseAnnouncement | null> => {
    const { data, error } = await client()
      .from(ANNOUNCEMENTS)
      .select("*")
      .in("status", ["pending", "running"])
      .order("requested_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as ReleaseAnnouncement) ?? null;
  };

export const listAnnouncements = async (): Promise<ReleaseAnnouncement[]> => {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(ANNOUNCEMENTS)
      .select("*")
      .order("requested_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ReleaseAnnouncement[];
  } catch {
    // The admin list still renders without the queue column.
    return [];
  }
};

/** Counters accumulate across passes, because one release can take several. */
export const updateAnnouncement = async (
  id: string,
  patch: {
    status?: AnnouncementStatus;
    startedAt?: string | null;
    completedAt?: string | null;
    addProcessed?: number;
    addLiked?: number;
    addReposted?: number;
    addFailed?: number;
    lastError?: string | null;
    current?: ReleaseAnnouncement;
  }
): Promise<void> => {
  const base = patch.current;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) row.status = patch.status;
  if (patch.startedAt !== undefined) row.started_at = patch.startedAt;
  if (patch.completedAt !== undefined) row.completed_at = patch.completedAt;
  if (patch.lastError !== undefined) row.last_error = patch.lastError;
  if (base) {
    if (patch.addProcessed) row.processed = base.processed + patch.addProcessed;
    if (patch.addLiked) row.liked = base.liked + patch.addLiked;
    if (patch.addReposted) row.reposted = base.reposted + patch.addReposted;
    if (patch.addFailed) row.failed = base.failed + patch.addFailed;
  }

  const { error } = await client().from(ANNOUNCEMENTS).update(row).eq("id", id);
  if (error) throw error;
};
