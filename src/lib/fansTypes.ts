/** What /api/admin/fans sends the admin "Fans" tab. No server imports here. */

export type FanDownload = {
  slug: string;
  title: string;
  at: string;
  /** Do they still like this song? Checked live; null when unknown. */
  likesNow: boolean | null;
};

export type FanRelease = {
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

export type LeaveAloneReason = "you_follow" | "big_account" | "many_uploads" | "gone";

/** Their standing in "like + repost future releases". */
export type FanSaved = {
  /** ready: the next release reaches them. left_alone: saved, but skipped.
   * ended: no longer saved. */
  status: "ready" | "left_alone" | "ended";
  leaveAloneReason: LeaveAloneReason | null;
  savedAt: string;
  /** Last time their connection was proven to work. */
  lastCheckedAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
};

export type Fan = {
  key: string;
  username: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  followers: number | null;
  following: number | null;
  uploads: number | null;
  /** "City, Country" from their SoundCloud profile. */
  location: string | null;
  /** ISO country from where they downloaded, when the profile has none. */
  downloadCountry: string | null;
  /** This is your own account. */
  isYou: boolean;
  /** Their SoundCloud account no longer exists. */
  gone: boolean;
  followsYou: boolean | null;
  /** First day they were seen not following, while that's still true. */
  unfollowedSince: string | null;
  /** Newest first. */
  downloads: FanDownload[];
  firstSeen: string;
  lastSeen: string;
  saved: FanSaved | null;
  releases: FanRelease[];
};

export type FansPayload = {
  checkedAt: string;
  /** Profiles not looked up live come from the stats snapshot taken then. */
  snapshotAt: string | null;
  rules: { followers: number; uploads: number };
  /** Set when SoundCloud couldn't be reached, so live columns are blank. */
  liveError: string | null;
  /** Downloads with no SoundCloud account attached (manual route). */
  anonymousDownloads: number;
  fans: Fan[];
};
