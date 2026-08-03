import { createClient } from "@supabase/supabase-js";

/** One row per download click — the admin overview's history feed. */
export type DownloadRow = {
  id?: string;
  track_slug: string;
  sc_username: string | null;
  created_at?: string;
};

const TABLE = "downloads";

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      )
    : null;

let warned = false;
const tolerate = (error: unknown) => {
  if (!warned) {
    warned = true;
    console.warn(
      `[downloads] logging unavailable (missing "${TABLE}" table or Supabase down) — ` +
        "downloads still work, history just isn't recorded.",
      error
    );
  }
};

/** Fire-and-forget: a logging failure must never block the download itself. */
export const recordDownload = async (
  trackSlug: string,
  scUsername?: string | null
) => {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from(TABLE)
      .insert({ track_slug: trackSlug, sc_username: scUsername || null });
    if (error) tolerate(error);
  } catch (error) {
    tolerate(error);
  }
};

export const listDownloads = async (
  limit = 20
): Promise<{ total: number; rows: DownloadRow[] }> => {
  if (!supabase) return { total: 0, rows: [] };
  try {
    const { data, error, count } = await supabase
      .from(TABLE)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      tolerate(error);
      return { total: 0, rows: [] };
    }
    return { total: count || 0, rows: (data || []) as DownloadRow[] };
  } catch (error) {
    tolerate(error);
    return { total: 0, rows: [] };
  }
};
