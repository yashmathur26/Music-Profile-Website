"use client";

import Link from "next/link";
import { campaign } from "@/config/campaign";

const SPOTIFY_GREEN = "#1DB954";

const buttonBase =
  "flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold text-white transition hover:scale-105 min-w-0";

type PresaveButtonsProps = {
  /** When true, show "Listen on ..." and use track URLs instead of presave flows */
  released?: boolean;
};

export default function PresaveButtons({ released }: PresaveButtonsProps) {
  const spotifyUrl = released && campaign.spotify.trackUri
    ? campaign.spotify.trackUri.startsWith("http")
      ? campaign.spotify.trackUri
      : `https://open.spotify.com/track/${campaign.spotify.trackUri.replace("spotify:track:", "")}`
    : "/api/spotify/authorize";

  return (
    <>
      {released ? (
        <Link
          href={spotifyUrl}
          className={buttonBase}
          style={{
            backgroundColor: SPOTIFY_GREEN,
            boxShadow: `0 0 30px ${SPOTIFY_GREEN}60`,
          }}
        >
          <SpotifyIcon className="h-6 w-6 shrink-0" />
          Listen on Spotify
        </Link>
      ) : (
        <Link
          href="/api/spotify/authorize"
          className={buttonBase}
          style={{
            backgroundColor: SPOTIFY_GREEN,
            boxShadow: `0 0 30px ${SPOTIFY_GREEN}60`,
          }}
        >
          <LockIcon className="h-6 w-6 shrink-0" />
          Pre-save on Spotify
        </Link>
      )}
    </>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.621 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

export { SPOTIFY_GREEN };
