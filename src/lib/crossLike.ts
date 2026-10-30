import { createServerSupabase } from "@/lib/supabaseServer";

/**
 * Songs that get a like whenever a fan downloads any *other* song.
 *
 * The artist switches this on per song from the admin portal. A fan who
 * unlocks one download is connected to SoundCloud at that moment, so the
 * download also likes each switched-on song from their account — likes only,
 * never a repost, since a like is private and a repost lands in their
 * followers' feeds. The Terms cover it, under "Likes on other songs".
 *
 * Kept as one list in site_config rather than a gate_tracks column: it works
 * for the hard-coded gates too, and needs no migration.
 */

const TABLE = "site_config";
const ROW_KEY = "cross_like";

/** Never more than this many extra likes on one download. */
export const MAX_CROSS_LIKES = 10;

const supabase = createServerSupabase();

export const getCrossLikeSlugs = async (): Promise<string[]> => {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("value")
      .eq("key", ROW_KEY)
      .maybeSingle();
    if (error) return [];
    const slugs = (data?.value as { slugs?: unknown } | null)?.slugs;
    return Array.isArray(slugs) ? slugs.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
};

const save = async (slugs: string[]) => {
  if (!supabase) throw new Error("Supabase is not configured on the server.");
  const { error } = await supabase.from(TABLE).upsert(
    { key: ROW_KEY, value: { slugs }, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) {
    throw new Error(
      /relation .* does not exist/i.test(error.message)
        ? 'The "site_config" table doesn’t exist yet — run the SQL in docs/ADMIN_TRACKS_SETUP.md.'
        : error.message
    );
  }
};

export const setCrossLike = async (slug: string, on: boolean) => {
  const current = await getCrossLikeSlugs();
  if (on === current.includes(slug)) return;
  if (on && current.length >= MAX_CROSS_LIKES) {
    throw new Error(`Up to ${MAX_CROSS_LIKES} songs can be liked on every download.`);
  }
  await save(on ? [...current, slug] : current.filter((s) => s !== slug));
};

/** Keeps the list pointing at the right gate when one is renamed or deleted. */
export const renameCrossLike = async (from: string, to: string | null) => {
  const current = await getCrossLikeSlugs();
  if (!current.includes(from)) return;
  await save(
    to ? current.map((s) => (s === from ? to : s)) : current.filter((s) => s !== from)
  );
};
