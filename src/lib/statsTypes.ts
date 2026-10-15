/**
 * The shape of /api/admin/stats, shared by the route that builds it and the
 * Stats tab that draws it. No server imports here — the browser bundles this.
 *
 * Rows are sent as compact tuples with lookup tables rather than objects:
 * the tab filters and regroups them on the fly for every range and song
 * choice, so it needs the raw rows, and a year of gate events as objects
 * would be several times the size for no benefit. The browser also never
 * sees a visitor cookie — sessions arrive as plain indices.
 */

export type StatsTrack = {
  slug: string;
  title: string;
  artworkUrl: string;
  url: string;
};

export type StatsFan = {
  /** soundcloud.com profile, when the download recorded one. */
  url: string | null;
  username: string | null;
};

/** Latest known SoundCloud state for one fan, from the daily snapshot. */
export type StatsFanState = {
  username: string;
  avatarUrl: string | null;
  followers: number;
  followings: number;
  city: string | null;
  country: string | null;
  isArtist: boolean;
  followsArtist: boolean;
  notFollowingSince: string | null;
  likes: Record<string, boolean>;
  notLikingSince: Record<string, string>;
} | {
  unresolvedSince: string;
};

export type StatsHistoryDay = {
  day: string;
  followers: number;
  tracks: Record<
    string,
    { plays: number; likes: number; reposts: number; comments: number }
  >;
};

/** [epoch ms, track index, fan index or -1] */
export type StatsDownloadRow = [number, number, number];

/** [epoch ms, track index, kind index, session index or -1,
 *  country index or -1, source index or -1, gate-state index or -1] */
export type StatsEventRow = [number, number, number, number, number, number, number];

export type StatsPayload = {
  generatedAt: string;
  artist: { username: string; profileUrl: string; followers: number | null };
  snapshot: {
    day: string;
    takenAt: string;
    partial: boolean;
    errors: number;
  } | null;
  tracks: StatsTrack[];
  fans: StatsFan[];
  /** Aligned with `fans`; null when the snapshot hasn't seen that fan yet. */
  fanState: (StatsFanState | null)[];
  downloads: StatsDownloadRow[];
  history: StatsHistoryDay[];
  events: {
    /** First event ever logged — the funnel means nothing before this. */
    since: string | null;
    rows: StatsEventRow[];
    kinds: string[];
    countries: string[];
    sources: string[];
    gates: string[];
  };
  subscribers: {
    configured: boolean;
    rows: {
      createdAt: string;
      revokedAt: string | null;
      reason: string | null;
      source: string | null;
    }[];
    actions: {
      total: number;
      liked: number;
      reposted: number;
      failed: number;
      removalsPending: number;
      removalsScheduled: number;
      removed: number;
      removalFailed: number;
    };
    announcements: {
      track: string;
      status: string;
      processed: number;
      liked: number;
      reposted: number;
      failed: number;
      requestedAt: string;
      completedAt: string | null;
    }[];
  };
  /** What couldn't be loaded, so the tab can say so instead of showing zeros. */
  missing: string[];
};
