"use client";

import { campaign, isReleaseLive } from "@/config/campaign";

type PlatformLinksProps = {
  released: boolean;
};

export default function PlatformLinks({ released }: PlatformLinksProps) {
  const links = released ? campaign.streamLinks : campaign.additionalLinks;
  const primarySpotify = released && campaign.spotify.trackUri;
  const spotifyUrl = primarySpotify
    ? campaign.spotify.trackUri.startsWith("http")
      ? campaign.spotify.trackUri
      : `https://open.spotify.com/track/${campaign.spotify.trackUri.replace("spotify:track:", "")}`
    : "https://open.spotify.com/";

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
