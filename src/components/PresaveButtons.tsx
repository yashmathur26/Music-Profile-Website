"use client";

import Link from "next/link";
import { campaign } from "@/config/campaign";

const SPOTIFY_GREEN = "#1DB954";
const APPLE_MUSIC_RED = "#FA243C";

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

  const appleMusicEnabled = campaign.appleMusic?.enabled ?? false;
  const applePreAddUrl = (campaign.appleMusic?.preAddUrl ?? "").trim();
  const appleTrackUrl = (campaign.appleMusic?.trackUrl ?? "").trim();
  const showAppleListen = released && appleTrackUrl;
  const showApplePreAdd = !released && applePreAddUrl;
  const showAppleMusic = appleMusicEnabled && (showAppleListen || showApplePreAdd);

  const appleHref = showAppleListen ? appleTrackUrl : applePreAddUrl;

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
          <SpotifyIcon className="h-6 w-6 shrink-0" />
          Pre-save on Spotify
        </Link>
      )}

      {showAppleMusic ? (
        <a
          href={appleHref}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonBase}
          style={{
            backgroundColor: APPLE_MUSIC_RED,
            boxShadow: `0 0 30px ${APPLE_MUSIC_RED}60`,
          }}
        >
          <AppleMusicIcon className="h-6 w-6 shrink-0" />
          {showAppleListen ? "Listen on Apple Music" : "Pre-add on Apple Music"}
        </a>
      ) : appleMusicEnabled && !released ? (
        <span
          className={`${buttonBase} cursor-not-allowed opacity-60`}
          style={{
            backgroundColor: APPLE_MUSIC_RED,
            boxShadow: `0 0 20px ${APPLE_MUSIC_RED}40`,
          }}
          aria-hidden
        >
          <AppleMusicIcon className="h-6 w-6 shrink-0" />
          Pre-add on Apple Music (link soon)
        </span>
      ) : null}
    </>
  );
}

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.621 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function AppleMusicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 3v10.5c0 1.38-1.12 2.5-2.5 2.5S7 16.88 7 15.5s1.12-2.5 2.5-2.5c.465 0 .905.128 1.28.35V8.2L7 9.4V7.4l5-1.4z" />
    </svg>
  );
}

export { SPOTIFY_GREEN, APPLE_MUSIC_RED };
