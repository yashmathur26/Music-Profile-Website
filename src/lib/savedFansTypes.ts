/** What /api/admin/fans sends the "Saved fans" tab. No server imports here. */

export type SavedFanStatus =
  /** Connected, and your next release will like/repost from their account. */
  | "ready"
  /** Connected, but releases skip them — see `leaveAloneReason`. */
  | "left_alone"
  /** No longer saved. */
  | "ended";

export type SavedFanRelease = {
  slug: string;
  title: string;
  /** What the release did when it reached them. */
  liked: boolean;
  reposted: boolean;
  leftAlone: boolean;
  error: string | null;
  /** When it's due to come back off; null means it stays. */
  removeAfter: string | null;
  removedAt: string | null;
  /** Checked on SoundCloud just now. Null when it couldn't be checked. */
  likedNow: boolean | null;
  repostedNow: boolean | null;
};

export type SavedFan = {
  id: string;
  username: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  followers: number | null;
  uploads: number | null;
  savedAt: string;
  fromSong: string | null;
  status: SavedFanStatus;
  leaveAloneReason: "you_follow" | "big_account" | "many_uploads" | "gone" | null;
  /** Last time their connection was proven to work. */
  lastCheckedAt: string | null;
  endedAt: string | null;
  endedReason: "fan" | "token_invalid" | "admin" | string | null;
  followsYou: boolean | null;
  /** Still liking the song they downloaded? Null when unknown. */
  likesDownloadedSong: boolean | null;
  releases: SavedFanRelease[];
};

export type SavedFansPayload = {
  checkedAt: string;
  rules: { followers: number; uploads: number };
  /** Set when SoundCloud couldn't be reached, so live columns are blank. */
  liveError: string | null;
  fans: SavedFan[];
};
