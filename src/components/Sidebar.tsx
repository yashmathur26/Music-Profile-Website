"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { features } from "@/config/features";

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
    <>
      {/* Backdrop on mobile when expanded — tap to close */}
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setExpanded(false)}
          aria-hidden
        />
      )}
      <aside
        className={clsx(
          "flex flex-col border-r border-purple-500/20 bg-[#150820]/95 backdrop-blur-sm py-6 text-white/70 transition-all duration-300 ease-in-out",
          "relative z-10 min-h-screen",
          expanded
            ? "fixed inset-0 z-50 h-screen w-full max-w-none px-5 md:relative md:inset-auto md:h-auto md:min-h-screen md:w-72 md:max-w-[18rem]"
            : "w-16 px-2 sm:w-20 sm:px-3"
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
          onClick={() => expanded && setExpanded(false)}
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

        {/* Downloads Button */}
        <Link
          href="/downloads"
          onClick={() => expanded && setExpanded(false)}
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

        {/* My Stats (only when stats feature on) */}
        {features.stats && (
          <Link
            href="/stats"
            onClick={() => expanded && setExpanded(false)}
            className={clsx(
              "flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-100 transition hover:bg-emerald-500/20",
              expanded ? "w-full px-4 py-2.5" : "h-10 w-10 justify-center",
              pathname === "/stats" && "border-emerald-400/50 bg-emerald-500/25"
            )}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {expanded && <span className="text-sm font-medium">My Stats</span>}
          </Link>
        )}
      </div>
    </aside>
    </>
  );
}
