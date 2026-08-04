import { createServerSupabase } from "@/lib/supabaseServer";

/** One row per download click — the admin overview's history feed. */
export type DownloadRow = {
  id?: string;
  track_slug: string;
  sc_username: string | null;
  sc_profile_url?: string | null;
  created_at?: string;
};

const TABLE = "downloads";

const supabase = createServerSupabase();

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

/**
 * Callers must AWAIT this (a dangling promise dies when the serverless
 * function freezes after responding) — but it never throws, so a logging
 * failure can't block the download itself.
 */
export const recordDownload = async (
  trackSlug: string,
  scUsername?: string | null,
  scProfileUrl?: string | null
) => {
  if (!supabase) return;
  try {
    const { error } = await supabase.from(TABLE).insert({
      track_slug: trackSlug,
      sc_username: scUsername || null,
      sc_profile_url: scProfileUrl || null
    });
    if (!error) return;
    // Deploys can outrun the ALTER TABLE for sc_profile_url — keep the row.
    if (error.code === "PGRST204" || /sc_profile_url/.test(error.message || "")) {
      const { error: retryError } = await supabase
        .from(TABLE)
        .insert({ track_slug: trackSlug, sc_username: scUsername || null });
      if (retryError) tolerate(retryError);
      return;
    }
    tolerate(error);
  } catch (error) {
    tolerate(error);
  }
};

export const listDownloads = async (
  limit = 20,
  trackSlug?: string
): Promise<{ total: number; rows: DownloadRow[] }> => {
  if (!supabase) return { total: 0, rows: [] };
  try {
    let query = supabase
      .from(TABLE)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (trackSlug) {
      query = query.eq("track_slug", trackSlug);
    }
    const { data, error, count } = await query;
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
