"use client";

import { campaign, isReleaseLive } from "@/config/campaign";

type PlatformLinksProps = {
  released: boolean;
};

const APPLE_MUSIC_RED = "#FA243C";

export default function PlatformLinks({ released }: PlatformLinksProps) {
  const links = released ? campaign.streamLinks : campaign.additionalLinks;
  const primarySpotify = released && campaign.spotify.trackUri;
  const spotifyUrl = primarySpotify
    ? campaign.spotify.trackUri.startsWith("http")
      ? campaign.spotify.trackUri
      : `https://open.spotify.com/track/${campaign.spotify.trackUri.replace("spotify:track:", "")}`
    : "https://open.spotify.com/";
  const appleTrackUrl = (campaign.appleMusic?.trackUrl ?? "").trim();
  const showAppleMusicStream = released && appleTrackUrl;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
      <p className="mb-3 text-xs uppercase tracking-wider text-white/50">
        {released ? "Stream" : "More"}
      </p>
      <div className="flex flex-wrap gap-3">
        {released && (
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:opacity-90"
            style={{
              borderColor: campaign.accentColor,
              color: campaign.accentColor,
              backgroundColor: `${campaign.accentColor}20`,
            }}
          >
            <SpotifyIcon className="h-5 w-5" />
            Spotify
          </a>
        )}
        {showAppleMusicStream && (
          <a
            href={appleTrackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:opacity-90"
            style={{
              borderColor: APPLE_MUSIC_RED,
              color: APPLE_MUSIC_RED,
              backgroundColor: `${APPLE_MUSIC_RED}20`,
            }}
          >
            <AppleMusicIcon className="h-5 w-5" />
            Apple Music
          </a>
        )}
        {links.map((link) => (
          <a
            key={link.platform}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/20"
          >
            {link.platform}
          </a>
        ))}
      </div>
    </div>
  );
}

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02z" />
    </svg>
  );
}

function AppleMusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 3v10.5c0 1.38-1.12 2.5-2.5 2.5S7 16.88 7 15.5s1.12-2.5 2.5-2.5c.465 0 .905.128 1.28.35V8.2L7 9.4V7.4l5-1.4z" />
    </svg>
  );
}
