"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { campaign } from "@/config/campaign";

type Track = {
  slug: string;
  title: string;
};

type SidebarProps = {
  currentSlug: string;
  tracks: Track[];
};

export default function Sidebar({ currentSlug, tracks }: SidebarProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className={clsx(
        "flex min-h-screen flex-col border-r border-purple-500/20 bg-[#150820]/95 backdrop-blur-sm py-6 text-white/70 transition-all duration-300 ease-in-out relative z-10",
        expanded ? "w-72 px-5" : "w-16 px-2 sm:w-20 sm:px-3"
      )}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mb-10 flex h-10 w-full items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10 text-purple-300 transition hover:bg-purple-500/20"
      >
        {expanded ? (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        ) : (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        )}
      </button>

      {/* Logo / Avatar */}
      <div className={clsx("mb-10 flex items-center gap-3", expanded ? "px-1" : "justify-center")}>
        <img
          src="/avatar.png"
          alt="YVSH"
          className={clsx(
            "rounded-full border-2 border-purple-400/40 object-cover shadow-[0_0_20px_rgba(139,92,246,0.25)] transition-all",
            expanded ? "h-12 w-12" : "h-11 w-11"
          )}
        />
        {expanded && (
          <div className="text-sm font-semibold uppercase tracking-[0.35em] text-white">
            YVSH
          </div>
        )}
      </div>

      {/* Nav Buttons */}
      <div className={clsx("mb-10 flex flex-col gap-10", !expanded && "items-center")}>
        {/* Home Button */}
        <Link
          href="/home"
          className={clsx(
            "flex items-center gap-3 rounded-xl border border-purple-400/25 bg-purple-500/[0.12] text-purple-100 transition hover:bg-purple-500/20",
            expanded ? "w-full px-4 py-2.5" : "h-10 w-10 justify-center",
            pathname === "/home" && "border-purple-400/50 bg-purple-500/25"
          )}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          {expanded && <span className="text-sm font-medium">Home</span>}
        </Link>

        {/* Pre-save (only when campaign active) */}
        {campaign.isActive && (
          <Link
            href="/api/spotify/authorize"
            className={clsx(
              "flex items-center gap-3 rounded-xl border transition",
              expanded ? "w-full px-4 py-2.5" : "h-10 w-10 justify-center",
              pathname?.startsWith("/presave")
                ? "border-current bg-white/15"
                : "border-white/30 bg-white/10 hover:bg-white/15"
            )}
            style={{ borderColor: campaign.accentColor, color: campaign.accentColor }}
          >
            <svg className="h-5 w-5 shrink-0" fill="#1DB954" viewBox="0 0 24 24" role="img" aria-label="Spotify">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.621 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            {expanded && <span className="text-sm font-medium">Pre-save</span>}
          </Link>
        )}

        {/* Shop Button */}
        <Link
          href="/shop"
          className={clsx(
            "flex items-center gap-3 rounded-xl border border-blue-400/20 bg-blue-500/[0.12] text-blue-100 transition hover:bg-blue-500/20",
            expanded ? "w-full px-4 py-2.5" : "h-10 w-10 justify-center",
            pathname === "/shop" && "border-blue-400/50 bg-blue-500/25"
          )}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 7h18l-1.5 13.5a2 2 0 0 1-2 1.8H6.5a2 2 0 0 1-2-1.8L3 7zm4 0a5 5 0 0 1 10 0"
            />
          </svg>
          {expanded && <span className="text-sm font-medium">Shop</span>}
        </Link>

        {/* Downloads Button */}
        <Link
          href="/downloads"
          className={clsx(
            "flex items-center gap-3 rounded-xl border border-purple-400/25 bg-purple-500/[0.12] text-purple-100 transition hover:bg-purple-500/20",
            expanded ? "w-full px-4 py-2.5" : "h-10 w-10 justify-center",
            pathname === "/downloads" && "border-purple-400/50 bg-purple-500/25"
          )}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {expanded && <span className="text-sm font-medium">Downloads</span>}
        </Link>
      </div>
    </aside>
  );
}
