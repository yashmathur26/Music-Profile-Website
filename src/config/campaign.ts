/**
 * Campaign config — single source of truth for presave campaigns.
 * Edit this file per release; flip isActive to turn campaigns on/off.
 */

export type CampaignConfig = {
  isActive: boolean;
  trackTitle: string;
  trackArtist: string;
  trackDescription: string;
  coverArt: string;
  releaseDate: string; // ISO string e.g. "2026-03-01T00:00:00Z"
  showCountdown: boolean;
  spotify: {
    enabled: boolean;
    trackUri: string; // Set on release day e.g. "spotify:track:4iV5W9uYEdYUVa..."
    hyperFollowUrl: string; // DistroKid HyperFollow URL for presave (unlimited users)
  };
  additionalLinks: { platform: string; url: string }[];
  streamLinks: { platform: string; url: string; primary: boolean }[];
  accentColor: string;
  showPresaveCount: boolean;
  showEmailCapture: boolean;
  emailWebhook: string;
};

/** Slug used as campaign_id in DB (derived from track title). */
export function getCampaignId(config: CampaignConfig): string {
  return config.trackTitle
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export const campaign: CampaignConfig = {
  // Set to true to preview campaign UI (splash, presave page). Set back to false when not running a campaign.
  isActive: true,

  trackTitle: "10 outta 10",
  trackArtist: "YVSH",
  trackDescription: "dropping Feb 27, 2026",
  coverArt: "/covers/10outta10.jpg",

  releaseDate: "2026-02-27T05:00:00Z", // midnight EST (05:00 UTC)
  showCountdown: true,

  spotify: {
    enabled: true,
    // DistroKid HyperFollow for presave - this bypasses Spotify's 5-user dev mode limit
    hyperFollowUrl: "https://distrokid.com/hyperfollow/yvsh1/10-outta-10",
    // When the TRACK is live: set trackUri to the track URI (spotify:track:xxx)
    trackUri: "",
  },

  additionalLinks: [
    { platform: "SoundCloud", url: "https://soundcloud.com/yvshh" },
    { platform: "Spotify", url: "https://open.spotify.com/artist/2mBs3Kdfu7pvYu4w8Hac5y" },
    { platform: "Spotify (album)", url: "https://open.spotify.com/album/14Op5wPZiammre4YBJV6dn" },
  ],

  streamLinks: [
    { platform: "Spotify", url: "https://open.spotify.com/track/", primary: true },
    { platform: "SoundCloud", url: "https://soundcloud.com/yvshh", primary: false },
  ],

  accentColor: "#1DB954",
  showPresaveCount: true,
  showEmailCapture: true,
  emailWebhook: "",
};

/** True when release date has passed (for client-side stream link switch). */
export function isReleaseLive(config: CampaignConfig): boolean {
  return new Date(config.releaseDate).getTime() <= Date.now();
}
