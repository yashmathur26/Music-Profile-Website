/**
 * Safe to import from browser code. Kept apart from lib/tracks.ts, which
 * holds every track's download link: a client component importing anything
 * from there risks bundling those links into the site's JavaScript, which
 * would hand out the files without the gate.
 */
export const DEFAULT_TRACK_SLUG = "dont-stop-the-music-piano";
