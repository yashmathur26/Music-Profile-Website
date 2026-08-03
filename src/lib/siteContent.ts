/**
 * Client-safe half of the site config: the shape, the defaults, and the
 * embed builder. Server-side load/save lives in siteConfig.ts — keep
 * anything that touches Supabase out of here, this file ships to the
 * browser (home page + admin mockup).
 */

export type SiteConfig = {
  artistName: string;
  bio: string;
  /** soundcloud.com permalink of the "Now Playing" track. */
  nowPlayingUrl: string;
  socials: {
    soundcloud: string;
    spotify: string;
    instagram: string;
    tiktok: string;
  };
};

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  artistName: "YVSH",
  bio: "rest in peace my granny she got hit w a bazooka kabloom kablow",
  nowPlayingUrl: "https://soundcloud.com/yvshh/skrillex-nitepunk-soma-remix-2",
  socials: {
    soundcloud: "https://soundcloud.com/yvshh",
    spotify: "https://open.spotify.com/artist/2mBs3Kdfu7pvYu4w8Hac5y",
    instagram: "https://www.instagram.com/itsyvshhh/",
    tiktok: "https://www.tiktok.com/@yvsh.mp3"
  }
};

/** The home page plays this embed muted-then-faded, list styling off. */
export const nowPlayingEmbedUrl = (permalink: string) =>
  `https://w.soundcloud.com/player/?url=${encodeURIComponent(permalink)}` +
  "&color=%238b5cf6&auto_play=true&hide_related=true&show_comments=false" +
  "&show_user=true&show_reposts=false&show_teaser=false&visual=false";
