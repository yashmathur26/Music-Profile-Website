type TrackConfig = {
  slug: string;
  title: string;
  artworkUrl: string;
  downloadUrl: string;
  soundcloudEmbedUrl: string;
};

export const DEFAULT_TRACK_SLUG = "firestarter";

export const tracks: TrackConfig[] = [
  {
    slug: "firestarter",
    title: "FIRESTARTER",
    artworkUrl: "/dont-stop-the-music.png",
    soundcloudEmbedUrl:
      "https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/yvshh/firestarter&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true",
    downloadUrl: "https://drive.google.com/uc?export=download&id=1rUwxnFjD_ML1eboSyva1jGGFvd34RnPo"
  },
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
  }
];

export const getTrackBySlug = (slug: string) =>
  tracks.find((track) => track.slug === slug);
