/**
 * The accounts a download gate follows on the fan's behalf. Each gate carries
 * its own list — a flip with a collaborator follows both of you, a solo track
 * just follows you — so these helpers are shared by the admin editor (client),
 * the track API (server) and the gate itself.
 */

/** Three keeps the gate's checklist honest and the one tap quick. */
export const MAX_FOLLOW_TARGETS = 3;

/** Matches a soundcloud.com profile URL and captures the permalink. */
const SOUNDCLOUD_PROFILE =
  /^https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/([^/?#\s]+)\/?$/i;

export const isSoundcloudProfileUrl = (value: string) =>
  SOUNDCLOUD_PROFILE.test(value.trim());

/**
 * Cleans a list the way both the admin save and the gate want it: trimmed,
 * tracking params dropped, deduped case-insensitively, and capped. Anything
 * that isn't a soundcloud.com profile URL is dropped.
 */
export const normalizeFollowTargets = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const url = value.trim().split(/[?#]/)[0].replace(/\/$/, "");
    if (!url || !isSoundcloudProfileUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(url);
    if (targets.length >= MAX_FOLLOW_TARGETS) break;
  }
  return targets;
};

/**
 * A label for a follow row before anyone has connected: the profile's
 * permalink, which is the best name available without an access token. The
 * gate swaps in the real display name once SoundCloud resolves the profile.
 */
export const followTargetName = (url: string) => {
  const match = url.trim().match(SOUNDCLOUD_PROFILE);
  return match ? `@${match[1]}` : url;
};
