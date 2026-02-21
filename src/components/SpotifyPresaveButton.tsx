"use client";

import { useState, useEffect } from "react";
import { campaign } from "@/config/campaign";

const PRESAVED_KEY = "yvsh_presaved";

type SpotifyPresaveButtonProps = {
  released: boolean;
  accentColor: string;
  spotifyTrackUrl?: string;
};

function openPresaveInNewTab() {
  window.open(campaign.spotify.hyperFollowUrl, "_blank", "noopener,noreferrer");
}

export default function SpotifyPresaveButton({ released, accentColor, spotifyTrackUrl }: SpotifyPresaveButtonProps) {
  const [presaved, setPresaved] = useState(false);

  useEffect(() => {
    try {
      setPresaved(localStorage.getItem(PRESAVED_KEY) === "true");
    } catch {
      setPresaved(false);
    }
  }, []);

  const handlePresave = () => {
    if (released && spotifyTrackUrl) {
      window.open(spotifyTrackUrl, "_blank");
      return;
    }
    if (released) {
      window.open("https://open.spotify.com/", "_blank");
      return;
    }
    openPresaveInNewTab();
  };

  if (presaved && !released) {
    return (
      <div
        className="flex items-center justify-center gap-2 rounded-2xl px-6 py-4 font-bold text-white"
        style={{ backgroundColor: `${accentColor}40`, border: `2px solid ${accentColor}` }}
      >
        <span>Presaved ✓</span>
      </div>
    );
  }

  if (released) {
    const href = spotifyTrackUrl || "https://open.spotify.com/";
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold text-white transition hover:scale-[1.02]"
        style={{
          backgroundColor: accentColor,
          boxShadow: `0 0 30px ${accentColor}60`,
        }}
      >
        <SpotifyIcon className="h-6 w-6" />
        Listen on Spotify
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={handlePresave}
      className="flex w-full items-center justify-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold text-white transition hover:scale-[1.02]"
      style={{
        backgroundColor: accentColor,
        boxShadow: `0 0 30px ${accentColor}60`,
      }}
    >
      <SpotifyIcon className="h-6 w-6" />
      Pre-save on Spotify
    </button>
  );
}

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.621 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}
