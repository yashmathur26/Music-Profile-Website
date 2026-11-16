"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import { useEffect, useRef } from "react";

type DownloadSuccessProps = {
  show: boolean;
  trackTitle?: string;
  /** Featured / newest track to play after a successful download. */
  featuredEmbedUrl?: string;
  featuredTitle?: string;
};

/** Longer than the check path so the stroke is fully hidden at rest. */
const CHECK_DASH = 24;

type ScWidget = {
  bind: (event: string, fn: () => void) => void;
  play: () => void;
  setVolume: (n: number) => void;
};

/**
 * Post-download confirmation.
 *
 * After the file lands, this doubles as a short thank-you with the artist's
 * featured track playing in the official SoundCloud Widget - visible and
 * audible, started from the download click. Reduced motion keeps the
 * confirmation but skips the bounce choreography.
 */
export default function DownloadSuccess({
  show,
  trackTitle,
  featuredEmbedUrl,
  featuredTitle
}: DownloadSuccessProps) {
  const reduce = useReducedMotion();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!show || !featuredEmbedUrl) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const start = () => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || cancelled) return;
      const SC = (
        window as unknown as {
          SC?: {
            Widget: ((el: HTMLIFrameElement) => ScWidget) & {
              Events: { READY: string };
            };
          };
        }
      ).SC;
      if (!SC?.Widget) return;
      try {
        const widget = SC.Widget(iframe);
        widget.bind(SC.Widget.Events.READY, () => {
          if (cancelled) return;
          try {
            // Keep it listenable - this is the thank-you play, not a mute farm.
            widget.setVolume(80);
            widget.play();
          } catch {
            /* widget torn down */
          }
        });
      } catch {
        /* iframe not ready */
      }
    };

    const existing = document.querySelector(
      'script[src="https://w.soundcloud.com/player/api.js"]'
    ) as HTMLScriptElement | null;

    if (existing && (window as unknown as { SC?: unknown }).SC) {
      timeoutId = setTimeout(start, 400);
    } else {
      const script =
        existing ||
        Object.assign(document.createElement("script"), {
          src: "https://w.soundcloud.com/player/api.js",
          async: true
        });
      if (!existing) document.body.appendChild(script);
      const onLoad = () => {
        if (!cancelled) timeoutId = setTimeout(start, 400);
      };
      if ((window as unknown as { SC?: unknown }).SC) onLoad();
      else script.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [show, featuredEmbedUrl]);

  const container: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.97 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: reduce
        ? { duration: 0.15 }
        : {
            type: "spring",
            stiffness: 380,
            damping: 28,
            staggerChildren: 0.07,
            delayChildren: 0.06
          }
    },
    exit: {
      opacity: 0,
      y: reduce ? 0 : -6,
      scale: reduce ? 1 : 0.98,
      transition: { duration: 0.15 }
    }
  };

  const badge: Variants = {
    hidden: { scale: reduce ? 1 : 0.4, opacity: reduce ? 0 : 1 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: reduce
        ? { duration: 0.15 }
        : { type: "spring", stiffness: 520, damping: 16 }
    }
  };

  /**
   * The check draws itself in by sweeping the dash offset to zero.
   * `pathLength` is the idiomatic way to do this, but framer-motion resolves it
   * to a static stroke-dashoffset="0" here, so the stroke is animated directly.
   * CHECK_DASH just needs to exceed the path's real length (~19.8 units).
   */
  const check: Variants = {
    hidden: { strokeDashoffset: reduce ? 0 : CHECK_DASH, opacity: reduce ? 1 : 0 },
    visible: {
      strokeDashoffset: 0,
      opacity: 1,
      transition: reduce
        ? { duration: 0 }
        : { duration: 0.35, ease: "easeOut", delay: 0.1 }
    }
  };

  const burst: Variants = {
    hidden: { scale: 0.7, opacity: 0 },
    visible: {
      scale: 1.9,
      opacity: [0.75, 0],
      transition: { duration: 0.8, ease: "easeOut" }
    }
  };

  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: reduce
        ? { duration: 0.15 }
        : { type: "spring", stiffness: 500, damping: 32 }
    }
  };

  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          key="download-success"
          variants={container}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="status"
          aria-live="polite"
          className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] px-4 py-4"
        >
          <div className="flex items-center gap-3.5">
            <motion.span
              variants={badge}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500"
            >
              {!reduce && (
                <motion.span
                  aria-hidden
                  variants={burst}
                  className="absolute inset-0 rounded-full border-2 border-emerald-400"
                />
              )}
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="white"
                strokeWidth={2.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <motion.path
                  d="M5 13l4 4L19 7"
                  style={{ strokeDasharray: CHECK_DASH }}
                  variants={check}
                />
              </svg>
            </motion.span>

            <div className="min-w-0 flex-1">
              <motion.p
                variants={item}
                className="text-sm font-semibold text-emerald-100"
              >
                Thank you
                {trackTitle ? ` - ${trackTitle}` : ""}
              </motion.p>
              <motion.p
                variants={item}
                className="mt-0.5 text-xs leading-snug text-emerald-200/60"
              >
                {featuredEmbedUrl
                  ? "Check your downloads folder. Here’s what’s playing next."
                  : "Check your downloads folder."}
              </motion.p>
            </div>
          </div>

          {featuredEmbedUrl && (
            <motion.div variants={item} className="mt-4 overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/10">
              {featuredTitle && (
                <p className="truncate px-3 pt-2.5 text-[11px] font-medium uppercase tracking-wider text-white/45">
                  Newest drop · {featuredTitle}
                </p>
              )}
              <iframe
                ref={iframeRef}
                key={featuredEmbedUrl}
                title={featuredTitle ? `${featuredTitle} on SoundCloud` : "Featured track on SoundCloud"}
                src={featuredEmbedUrl}
                allow="autoplay; encrypted-media"
                className="block h-[120px] w-full border-0"
              />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
