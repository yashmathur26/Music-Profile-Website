"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";

type Track = {
  slug: string;
  title: string;
};

type SidebarProps = {
  currentSlug: string;
  tracks: Track[];
};

export default function Sidebar({ currentSlug, tracks }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);

  return (
    <aside
      className={clsx(
        "flex min-h-screen flex-col border-r border-purple-500/20 bg-[#150820]/95 backdrop-blur-sm py-6 text-white/70 transition-all duration-300 ease-in-out relative z-10",
        expanded ? "w-72 px-5" : "w-16 px-2 sm:w-20 sm:px-3"
      )}
    >
      {/* Toggle Button */}
      <button
        onClick={() => {
          setExpanded((v) => !v);
          // If collapsing, also close the downloads panel so next expand is clean.
          setDownloadsOpen(false);
        }}
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
          href="/"
          className={clsx(
            "flex items-center gap-3 rounded-xl border border-purple-400/25 bg-purple-500/[0.12] text-purple-100 transition hover:bg-purple-500/20",
            expanded ? "w-full px-4 py-2.5" : "h-10 w-10 justify-center"
          )}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          {expanded && <span className="text-sm font-medium">Home</span>}
        </Link>

        {/* Shop Button */}
        <Link
          href="/shop"
          className={clsx(
            "flex items-center gap-3 rounded-xl border border-blue-400/20 bg-blue-500/[0.12] text-blue-100 transition hover:bg-blue-500/20",
            expanded ? "w-full px-4 py-2.5" : "h-10 w-10 justify-center"
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

        {/* Presave removed (placeholder for later if needed) */}
      </div>

      {/* Downloads */}
      <div className={clsx("flex flex-col gap-2", !expanded && "items-center")}>
        {expanded ? (
          <details
            open={downloadsOpen}
            onToggle={(e) =>
              setDownloadsOpen((e.target as HTMLDetailsElement).open)
            }
            className="group"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl border border-purple-400/25 bg-purple-500/[0.12] px-4 py-2.5 text-purple-100 transition hover:bg-purple-500/20">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="text-sm font-medium">Downloads</span>
              <svg
                className="ml-auto h-4 w-4 text-white/70 transition-transform duration-300 group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            </summary>

            {/* Animated dropdown */}
            <div className="mt-2 overflow-hidden transition-all duration-300 ease-out group-open:max-h-96 group-open:opacity-100 group-open:translate-y-0 max-h-0 opacity-0 -translate-y-2">
              <div className="space-y-2 text-[11px] font-normal normal-case tracking-normal">
                {tracks.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/${item.slug}`}
                    className="flex items-center justify-between rounded-lg border border-purple-400/20 bg-purple-500/[0.10] px-3 py-2 text-white/90 transition hover:border-purple-300/35 hover:bg-purple-500/[0.16]"
                  >
                    <span className="truncate text-xs">{item.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          </details>
        ) : (
          <button
            onClick={() => {
              setExpanded(true);
              setDownloadsOpen(true);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/[0.12] text-purple-100 transition hover:bg-purple-500/20"
            title="Downloads"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        )}
      </div>
    </aside>
  );
}
