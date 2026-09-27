import { createServerSupabase } from "@/lib/supabaseServer";
import {
  TrackConfig,
  buildEmbedUrl,
  getTrackBySlug,
  getTrackPermalink,
  tracks as staticTracks
} from "@/lib/tracks";
import {
  MAX_FOLLOW_TARGETS,
  normalizeFollowTargets
} from "@/lib/followTargets";
import { SoundcloudApiError, resolveProfile } from "@/lib/soundcloud";

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
  /** Profiles the gate follows for this song — see TrackConfig.followTargets. */
  follow_targets: string[] | null;
  created_at?: string;
};

const TABLE = "gate_tracks";

const supabase = createServerSupabase();

let warnedMissingTable = false;

/**
 * True when PostgREST rejected the write because the table has no
 * follow_targets column — the newest migration hasn't been run yet. The write
 * is retried without the follow list so gates keep working meanwhile.
 */
const isMissingFollowColumn = (error: { message?: string }) =>
  /follow_targets/.test(error?.message || "");

let warnedMissingFollowColumn = false;

const warnMissingFollowColumn = () => {
  if (warnedMissingFollowColumn) return;
  warnedMissingFollowColumn = true;
  console.warn(
    `[tracks] "${TABLE}.follow_targets" column missing — run the SQL in ` +
      "docs/ADMIN_TRACKS_SETUP.md. Gates save without their follow list until then."
  );
};

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
  soundcloudTrackId: row.soundcloud_track_id || undefined,
  followTargets: normalizeFollowTargets(row.follow_targets)
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

/**
 * What a write did. `followTargetsStored` is false when the database predates
 * the follow_targets column — the gate still saves, but the admin page has to
 * say the follow list didn't stick.
 */
export type TrackWrite = {
  track: TrackConfig;
  followTargetsStored: boolean;
};

/** Insert fails loudly here — the admin flow needs the real error. */
export const insertTrack = async (row: GateTrackRow): Promise<TrackWrite> => {
  if (!supabase) {
    throw new Error("Supabase is not configured on the server.");
  }
  let followTargetsStored = true;
  let { error } = await supabase.from(TABLE).insert(row);
  if (error && isMissingFollowColumn(error)) {
    warnMissingFollowColumn();
    followTargetsStored = false;
    const { follow_targets: _dropped, ...withoutFollows } = row;
    ({ error } = await supabase.from(TABLE).insert(withoutFollows));
  }
  if (error) {
    if (isMissingTable(error)) {
      throw new Error(
        `The "${TABLE}" table doesn't exist yet — run the SQL in docs/ADMIN_TRACKS_SETUP.md.`
      );
    }
    throw new Error(error.message);
  }
  return { track: rowToTrack(row), followTargetsStored };
};

/**
 * Validates a gate's follow list on its way in: shape first, then the profiles
 * themselves against SoundCloud so a typo'd handle is caught while the artist
 * is still looking at the field. Returns an error message, or null when the
 * list is good. A SoundCloud outage never blocks a save — only a definite 404
 * (no such account) or a link to something that isn't a profile rejects.
 */
export const checkFollowTargets = async (
  submitted: string[]
): Promise<string | null> => {
  if (submitted.length > MAX_FOLLOW_TARGETS) {
    return `A gate follows at most ${MAX_FOLLOW_TARGETS} accounts.`;
  }
  if (normalizeFollowTargets(submitted).length !== submitted.length) {
    return "Each account must be a soundcloud.com profile link, e.g. https://soundcloud.com/yvshh — and no duplicates.";
  }

  for (const url of normalizeFollowTargets(submitted)) {
    try {
      const { kind } = await resolveProfile(url);
      if (kind && kind !== "user") {
        return `${url} is a ${kind}, not a profile — link the account itself.`;
      }
    } catch (error) {
      if (error instanceof SoundcloudApiError && error.status === 404) {
        return `There's no SoundCloud account at ${url}.`;
      }
      console.warn(`[tracks] couldn't verify follow target ${url}`, error);
    }
  }
  return null;
};

/** The row a hard-coded track would have if it lived in the database. */
const staticRow = (slug: string): GateTrackRow | null => {
  const track = getTrackBySlug(slug);
  if (!track) return null;
  return {
    slug: track.slug,
    title: track.title,
    artwork_url: track.artworkUrl || null,
    download_url: track.downloadUrl,
    soundcloud_url: getTrackPermalink(track),
    soundcloud_track_id: track.soundcloudTrackId || null,
    follow_targets: track.followTargets?.length ? track.followTargets : null
  };
};

/**
 * Edits an existing gate — title, artwork, download link, SoundCloud link,
 * who it follows, even its slug. A hard-coded track has no row to update, so
 * editing one copies it into the database first: DB rows win over the static
 * array for the same slug, so the gate keeps working and stays editable.
 */
export const updateTrack = async (
  slug: string,
  patch: Partial<Omit<GateTrackRow, "created_at">>
): Promise<TrackWrite> => {
  if (!supabase) {
    throw new Error("Supabase is not configured on the server.");
  }

  const rows = await listDbTracks();
  const current = rows.find((row) => row.slug === slug) || staticRow(slug);
  if (!current) {
    throw new Error(`No gate at /${slug}.`);
  }

  const next: GateTrackRow = {
    slug: current.slug,
    title: current.title,
    artwork_url: current.artwork_url,
    download_url: current.download_url,
    soundcloud_url: current.soundcloud_url,
    soundcloud_track_id: current.soundcloud_track_id,
    follow_targets: current.follow_targets,
    ...patch
  };

  // Renaming mints a new row at the new slug: the public link changes, so the
  // old one has to be free and the old row has to go.
  const renamed = next.slug !== slug;
  if (renamed) {
    const taken =
      rows.some((row) => row.slug === next.slug) || Boolean(getTrackBySlug(next.slug));
    if (taken) {
      throw new Error(`/${next.slug} is already taken by another gate.`);
    }
  }

  let followTargetsStored = true;
  let { error } = await supabase.from(TABLE).upsert(next, { onConflict: "slug" });
  if (error && isMissingFollowColumn(error)) {
    warnMissingFollowColumn();
    followTargetsStored = false;
    const { follow_targets: _dropped, ...withoutFollows } = next;
    ({ error } = await supabase
      .from(TABLE)
      .upsert(withoutFollows, { onConflict: "slug" }));
  }
  if (error) {
    if (isMissingTable(error)) {
      throw new Error(
        `The "${TABLE}" table doesn't exist yet — run the SQL in docs/ADMIN_TRACKS_SETUP.md.`
      );
    }
    throw new Error(error.message);
  }

  if (renamed && rows.some((row) => row.slug === slug)) {
    await supabase.from(TABLE).delete().eq("slug", slug);
  }

  return { track: rowToTrack(next), followTargetsStored };
};

export const deleteTrack = async (slug: string) => {
  if (!supabase) {
    throw new Error("Supabase is not configured on the server.");
  }
  const { error } = await supabase.from(TABLE).delete().eq("slug", slug);
  if (error) throw new Error(error.message);
};
