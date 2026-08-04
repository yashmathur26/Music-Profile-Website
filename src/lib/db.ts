import { createServerSupabase } from "@/lib/supabaseServer";

/** Per-track record of what we actually did on the fan's SoundCloud account. */
export type TrackEngagement = {
  followed?: boolean;
  liked?: boolean;
  at?: string;
};

export type SessionEngagement = Record<string, TrackEngagement>;

type SessionRow = {
  id: string;
  sc_user_id: string | null;
  sc_username: string | null;
  sc_access_token: string | null;
  sc_refresh_token: string | null;
  sc_expires_at: string | null;
  sc_verified: boolean;
  sc_engagement: SessionEngagement | null;
  download_count: number;
  created_at: string;
  updated_at: string;
};

type SessionUpdate = Partial<
  Pick<
    SessionRow,
    | "sc_user_id"
    | "sc_username"
    | "sc_access_token"
    | "sc_refresh_token"
    | "sc_expires_at"
    | "sc_verified"
    | "sc_engagement"
    | "download_count"
  >
>;

/** Columns added for the auto follow + like gate. If the migration in
 * docs/SOUNDCLOUD_GATE_SETUP.md hasn't been run, we drop them and keep going
 * rather than failing the whole download flow. */
const EXTENDED_COLUMNS = [
  "sc_username",
  "sc_refresh_token",
  "sc_expires_at",
  "sc_engagement"
] as const;

const supabase = createServerSupabase();

let warnedAboutMigration = false;
let warnedAboutOutage = false;

/**
 * Supabase is a best-effort mirror for the gate — the encrypted gate cookie is
 * the source of truth — so an unreachable project must never break a download.
 */
const tolerate = (context: string, error: unknown) => {
  if (!warnedAboutOutage) {
    warnedAboutOutage = true;
    console.warn(
      `[gate] Supabase unavailable (${context}); continuing without it. ` +
        `Gate state is kept in the encrypted session cookie.`,
      error
    );
  }
  return null;
};

const isMissingColumnError = (error: { code?: string; message?: string }) =>
  error?.code === "42703" ||
  /column .* does not exist/i.test(error?.message || "");

const warnAboutMigration = () => {
  if (warnedAboutMigration) return;
  warnedAboutMigration = true;
  console.warn(
    "[gate] sessions table is missing the SoundCloud gate columns. " +
      "Run the migration in docs/SOUNDCLOUD_GATE_SETUP.md to persist " +
      "follow/like state across visits."
  );
};

export const getSession = async (
  sessionId: string
): Promise<SessionRow | null> => {
  if (!supabase) {
    return null;
  }
  try {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) {
      return tolerate("getSession", error);
    }
    return data as SessionRow | null;
  } catch (error) {
    return tolerate("getSession", error);
  }
};

export const ensureSession = async (sessionId: string) => {
  if (!supabase) return;
  const now = new Date().toISOString();
  try {
    const { error } = await supabase.from("sessions").upsert(
      {
        id: sessionId,
        created_at: now,
        updated_at: now
      },
      { onConflict: "id" }
    );
    if (error) {
      tolerate("ensureSession", error);
    }
  } catch (error) {
    tolerate("ensureSession", error);
  }
};

export const updateSession = async (
  sessionId: string,
  updates: SessionUpdate
) => {
  if (!supabase) return;
  const now = new Date().toISOString();
  const existing = await getSession(sessionId);
  if (!existing) {
    await ensureSession(sessionId);
  }

  const next: Record<string, unknown> = {
    sc_user_id: updates.sc_user_id ?? existing?.sc_user_id ?? null,
    sc_username: updates.sc_username ?? existing?.sc_username ?? null,
    sc_access_token:
      updates.sc_access_token ?? existing?.sc_access_token ?? null,
    sc_refresh_token:
      updates.sc_refresh_token ?? existing?.sc_refresh_token ?? null,
    sc_expires_at: updates.sc_expires_at ?? existing?.sc_expires_at ?? null,
    sc_verified: updates.sc_verified ?? existing?.sc_verified ?? false,
    sc_engagement: updates.sc_engagement ?? existing?.sc_engagement ?? {},
    download_count: updates.download_count ?? existing?.download_count ?? 0,
    updated_at: now
  };

  try {
    const { error } = await supabase
      .from("sessions")
      .update(next)
      .eq("id", sessionId);

    if (!error) return;

    if (!isMissingColumnError(error)) {
      tolerate("updateSession", error);
      return;
    }

    warnAboutMigration();
    for (const column of EXTENDED_COLUMNS) {
      delete next[column];
    }
    const { error: fallbackError } = await supabase
      .from("sessions")
      .update(next)
      .eq("id", sessionId);
    if (fallbackError) {
      tolerate("updateSession", fallbackError);
    }
  } catch (error) {
    tolerate("updateSession", error);
  }
};

/** Merges one track's follow/like result into the session without clobbering
 * what the fan already unlocked on other tracks. */
export const recordEngagement = async (
  sessionId: string,
  trackSlug: string,
  engagement: TrackEngagement
) => {
  if (!supabase) return;
  const existing = await getSession(sessionId);
  const current = (existing?.sc_engagement || {}) as SessionEngagement;
  await updateSession(sessionId, {
    sc_engagement: {
      ...current,
      [trackSlug]: {
        ...(current[trackSlug] || {}),
        ...engagement,
        at: new Date().toISOString()
      }
    }
  });
};
