import { SoundcloudApiError, appGet, appGetAll, numericId } from "@/lib/soundcloud";
import { ARTIST_SOUNDCLOUD_URL } from "@/lib/tracks";
import { env } from "@/utils/env";
import type { LeaveAloneReason } from "@/lib/fansTypes";

export type { LeaveAloneReason };

/**
 * Who a release may act on.
 *
 * The release fan-out is meant for ordinary listeners — DJs who use SoundCloud
 * to find and download music. A like or repost from someone with an audience
 * of their own, or from someone the artist personally follows, reads as a
 * personal endorsement, and that isn't ours to borrow. So those fans stay
 * saved but are left alone: the release skips them and says why.
 *
 * Checked at release time rather than at sign-up, because both change: a fan
 * grows an audience, the artist follows someone new. The admin "Saved fans"
 * page runs the same check, so what it promises is what the release does.
 */

export const LEAVE_ALONE = {
  /** At or above this many followers, they're an artist in their own right. */
  followers: 1000,
  /** At or above this many uploads, they're releasing music, not just listening. */
  uploads: 25
} as const;

export type ScProfile = {
  id: string;
  username: string;
  permalinkUrl: string;
  avatarUrl: string | null;
  followers: number;
  following: number;
  uploads: number;
  city: string | null;
  country: string | null;
};

export type Screen = { ok: true } | { ok: false; reason: LeaveAloneReason };

type ScUser = {
  id?: number | string;
  urn?: string;
  username?: string;
  permalink_url?: string;
  avatar_url?: string | null;
  followers_count?: number;
  followings_count?: number;
  track_count?: number;
  city?: string | null;
  country?: string | null;
};

const toProfile = (user: ScUser): ScProfile => ({
  id: numericId(user.id ?? user.urn),
  username: user.username || "",
  permalinkUrl: user.permalink_url || "",
  avatarUrl: user.avatar_url || null,
  followers: user.followers_count ?? 0,
  following: user.followings_count ?? 0,
  uploads: user.track_count ?? 0,
  city: user.city || null,
  country: user.country || null
});

export const artistId = async (): Promise<string> =>
  numericId(env.soundcloudArtistId) ||
  numericId(
    (await appGet<ScUser>(`/resolve?url=${encodeURIComponent(ARTIST_SOUNDCLOUD_URL)}`)).id
  );

/** Everyone the artist follows, as SoundCloud ids. One paged read. */
export const loadArtistFollowings = async (): Promise<Set<string>> => {
  const id = await artistId();
  return new Set(
    (await appGetAll<ScUser>(`/users/${id}/followings`)).map((u) => numericId(u.id ?? u.urn))
  );
};

/** A fan's public profile, or null when the account no longer exists. */
export const loadProfile = async (scUserId: string): Promise<ScProfile | null> => {
  try {
    return toProfile(await appGet<ScUser>(`/users/${scUserId}`));
  } catch (error) {
    if (error instanceof SoundcloudApiError && error.status === 404) return null;
    throw error;
  }
};

/** Same, from a soundcloud.com profile link. */
export const loadProfileByUrl = async (url: string): Promise<ScProfile | null> => {
  try {
    return toProfile(await appGet<ScUser>(`/resolve?url=${encodeURIComponent(url)}`));
  } catch (error) {
    if (error instanceof SoundcloudApiError && error.status === 404) return null;
    throw error;
  }
};

export const screenProfile = (
  profile: ScProfile | null,
  following: Set<string>
): Screen => {
  if (!profile) return { ok: false, reason: "gone" };
  if (following.has(profile.id)) return { ok: false, reason: "you_follow" };
  if (profile.followers >= LEAVE_ALONE.followers) return { ok: false, reason: "big_account" };
  if (profile.uploads >= LEAVE_ALONE.uploads) return { ok: false, reason: "many_uploads" };
  return { ok: true };
};

/** How a release records a fan it skipped on purpose — see releaseRun.ts. */
export const LEFT_ALONE_PREFIX = "left_alone:";
