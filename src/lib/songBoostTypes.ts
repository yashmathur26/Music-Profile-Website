/** What /api/admin/tracks/[slug]/boost sends the song panel. No server imports here. */

import type { SubscriberPlan } from "@/lib/subscriberPlan";

/**
 * Where one saved fan stands on this song:
 *  - waiting: the send hasn't reached them yet
 *  - live: their like/repost is up
 *  - came_off: it was up, and came back off on schedule
 *  - taken_out: you took them out by hand
 *  - skipped: left alone on purpose (big account, someone you follow…)
 *  - failed: SoundCloud refused, or their connection had died
 *  - not_sent: you haven't sent this song to your fans
 */
export type BoostState =
  | "waiting"
  | "live"
  | "came_off"
  | "taken_out"
  | "skipped"
  | "failed"
  | "not_sent";

export type BoostPerson = {
  /** Their saved-fan id — what the edit actions take. */
  id: string;
  username: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  followers: number | null;
  state: BoostState;
  /** What landed on their profile. */
  liked: boolean;
  reposted: boolean;
  /** Checked on SoundCloud just now; null when it couldn't be. */
  likedNow: boolean | null;
  repostedNow: boolean | null;
  reachedAt: string | null;
  /** When it comes back off; null means it stays. */
  removeAfter: string | null;
  removedAt: string | null;
  /** Why they were skipped or failed, in words. */
  note: string | null;
};

export type SongBoost = {
  checkedAt: string;
  song: {
    slug: string;
    title: string;
    artworkUrl: string;
    url: string;
  };
  /** SoundCloud's own counters for the track, all-time. Null if unreachable. */
  stats: {
    plays: number;
    likes: number;
    reposts: number;
    comments: number;
  } | null;
  /** Daily plays from the stats snapshots, oldest first, for the trend line. */
  history: { day: string; plays: number; likes: number; reposts: number }[];
  /** What the gate itself did, all-time. */
  gate: {
    views: number;
    downloads: number;
    fans: number;
    firstDownloadAt: string | null;
  };
  boost: {
    configured: boolean;
    plan: SubscriberPlan;
    announcement: {
      status: "pending" | "running" | "done" | "failed" | "stopped";
      startedAt: string | null;
      requestedAt: string;
      completedAt: string | null;
      lastError: string | null;
    } | null;
    /** When the rollout is due to have reached everyone, at its current pace. */
    finishesAt: string | null;
    people: BoostPerson[];
  };
};

export type BoostEdit =
  /** Take the like/repost back off now, and skip them from here on. */
  | { action: "take_out"; ids?: string[] }
  /** Undo take_out; anything already off goes back up on the next send. */
  | { action: "put_back"; ids?: string[] }
  /** Keep it up for this many days from the send; null keeps it for good. */
  | { action: "keep_for"; days: number | null; ids?: string[] }
  /** Leave about this many seconds between one fan and the next. */
  | { action: "pace"; seconds: number }
  /** Spread the take-off over this many minutes, re-spreading what's scheduled. */
  | { action: "removal_pace"; minutes: number };
