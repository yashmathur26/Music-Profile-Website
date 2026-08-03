export type TrackConfig = {
  slug: string;
  title: string;
  artworkUrl: string;
  downloadUrl: string;
  soundcloudEmbedUrl: string;
  /** Only needed when the permalink can't be read off the embed URL. */
  soundcloudUrl?: string;
  /** Set this to skip the /resolve lookup for the like call. */
  soundcloudTrackId?: string;
};

export const DEFAULT_TRACK_SLUG = "dont-stop-the-music-piano";

export const ARTIST_SOUNDCLOUD_URL =
  process.env.NEXT_PUBLIC_SOUNDCLOUD_URL?.trim() ||
  "https://soundcloud.com/yvshh";

/** Same player styling every hard-coded entry uses, for tracks added at runtime. */
export const buildEmbedUrl = (permalink: string) =>
  `https://w.soundcloud.com/player/?url=${encodeURIComponent(permalink)}` +
  "&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false" +
  "&show_user=true&show_reposts=false&show_teaser=false&visual=true";

export const tracks: TrackConfig[] = [
  {
    slug: "dont-stop-the-music-piano",
    title: "RIHANNA - DON'T STOP THE MUSIC BUT PIANO HOUSE (YVSH FLIP)",
    artworkUrl: "/dont-stop-the-music.png",
    soundcloudEmbedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/yvshh/dont-stop-the-music-piano&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1MMDe6f_yjsxen9Aa4ZN27n2z6k6sQpAb"
  },
  {
    slug: "beauty-and-the-beat",
    title: "JUSTIN BIEBER - BEAUTY AND A BEAT (YVSH FLIP)",
    artworkUrl: "/dont-stop-the-music.png",
    soundcloudEmbedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/yvshh/beauty-and-a-beat-yvsh-flip&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1UuLCXeXuTCJr7Ib0-NYYge2OeFEn1FGG"
  },
  {
    slug: "down-but-dariacore",
    title: "DOWN BUT YVSHCORE",
    artworkUrl: "/dont-stop-the-music.png",
    soundcloudEmbedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/yvshh/down-but-yvshcore&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1wvnFhj5vq2i_LUSYb51HFJwPPkUtUUbZ"
  },
  {
    slug: "yo-but-bounce",
    title: "CHRIS BROWN - YO BUT BOUNCE (YVSH FLIP)",
    artworkUrl: "/dont-stop-the-music.png",
    soundcloudEmbedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/yvshh/chris-brown-yo-but-bounce-yvsh-flip&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1f9PvYeYC4SRUhGhkOXgmo0sq3UijaM5x"
  },
  {
    slug: "john-summit-lights-go-out-yvsh",
    title: "JOHN SUMMIT - LIGHTS GO OUT (YVSH FLIP)",
    artworkUrl: "/dont-stop-the-music.png",
    soundcloudEmbedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/yvshh/john-summit-lights-go-out-yvsh&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1bDmzCURDmGRUGHf0Q8b6f17ryy1ls_2A"
  },
  {
    slug: "california-gurls-yvsh-flip",
    title: "KATY PERRY - CALIFORNIA GURLS REMIX (YVSH FLIP)",
    artworkUrl: "/dont-stop-the-music.png",
    soundcloudEmbedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/yvshh/california-gurls-yvsh-flip&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1QcrSPyiNsRfwMbcHZTNq_ZM1r2GG3X6D"
  }
];

export const getTrackBySlug = (slug: string) =>
  tracks.find((track) => track.slug === slug);

/**
 * The gate needs the track's soundcloud.com permalink to resolve its API id.
 * The embed URL already carries it as the `url` param, so new tracks work
 * without any extra config.
 */
export const getTrackPermalink = (track: TrackConfig) => {
  if (track.soundcloudUrl) {
    return track.soundcloudUrl;
  }
  const match = track.soundcloudEmbedUrl.match(/[?&]url=([^&]+)/);
  if (!match) {
    return "";
  }
  const decoded = decodeURIComponent(match[1]);
  return decoded.startsWith("http") ? decoded : `https:${decoded}`;
};
