import { createClient } from "@supabase/supabase-js";
import {
  TrackConfig,
  buildEmbedUrl,
  getTrackBySlug,
  tracks as staticTracks
} from "@/lib/tracks";

/**
 * Runtime-added tracks live in Supabase (the deploy's filesystem is
 * read-only); the hard-coded array in tracks.ts keeps working as-is. A DB row
 * with the same slug as a static track wins, so a static entry can be
 * superseded without an edit + redeploy.
 */

export type GateTrackRow = {
  slug: string;
  title: string;
  artwork_url: string | null;
  download_url: string;
  soundcloud_url: string;
  soundcloud_track_id: string | null;
  created_at?: string;
};

const TABLE = "gate_tracks";

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      )
    : null;

let warnedMissingTable = false;

/** True for "relation does not exist" — the migration hasn't been run yet. */
const isMissingTable = (error: { code?: string; message?: string }) =>
  error?.code === "42P01" || /relation .* does not exist/i.test(error?.message || "");

const tolerate = (context: string, error: unknown): null => {
  if (isMissingTable(error as { code?: string })) {
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      console.warn(
        `[tracks] "${TABLE}" table missing — run the SQL in docs/ADMIN_TRACKS_SETUP.md. ` +
          "Serving hard-coded tracks only."
      );
    }
  } else {
    console.warn(`[tracks] Supabase unavailable (${context}); serving hard-coded tracks.`, error);
  }
  return null;
};

const rowToTrack = (row: GateTrackRow): TrackConfig => ({
  slug: row.slug,
  title: row.title,
  artworkUrl: row.artwork_url || "/dont-stop-the-music.png",
  downloadUrl: row.download_url,
  soundcloudEmbedUrl: buildEmbedUrl(row.soundcloud_url),
  soundcloudUrl: row.soundcloud_url,
  soundcloudTrackId: row.soundcloud_track_id || undefined
});

export const listDbTracks = async (): Promise<GateTrackRow[]> => {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      tolerate("list", error);
      return [];
    }
    return (data || []) as GateTrackRow[];
  } catch (error) {
    tolerate("list", error);
    return [];
  }
};

/** DB tracks first (newest additions at the top), then the static ones. */
export const getAllTracks = async (): Promise<TrackConfig[]> => {
  const rows = await listDbTracks();
  const dbTracks = rows.map(rowToTrack);
  const dbSlugs = new Set(dbTracks.map((track) => track.slug));
  return [...dbTracks, ...staticTracks.filter((track) => !dbSlugs.has(track.slug))];
};

export const findTrack = async (slug: string): Promise<TrackConfig | undefined> => {
  if (!supabase) return getTrackBySlug(slug);
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      tolerate("find", error);
      return getTrackBySlug(slug);
    }
    if (data) return rowToTrack(data as GateTrackRow);
  } catch (error) {
    tolerate("find", error);
  }
  return getTrackBySlug(slug);
};

/** Insert fails loudly here — the admin flow needs the real error. */
export const insertTrack = async (row: GateTrackRow) => {
  if (!supabase) {
    throw new Error("Supabase is not configured on the server.");
  }
  const { error } = await supabase.from(TABLE).insert(row);
  if (error) {
    if (isMissingTable(error)) {
      throw new Error(
        `The "${TABLE}" table doesn't exist yet — run the SQL in docs/ADMIN_TRACKS_SETUP.md.`
      );
    }
    throw new Error(error.message);
  }
  return rowToTrack(row);
};

export const deleteTrack = async (slug: string) => {
  if (!supabase) {
    throw new Error("Supabase is not configured on the server.");
  }
  const { error } = await supabase.from(TABLE).delete().eq("slug", slug);
  if (error) throw new Error(error.message);
};
