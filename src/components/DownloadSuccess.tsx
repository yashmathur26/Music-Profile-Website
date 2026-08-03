"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";

type DownloadSuccessProps = {
  show: boolean;
  trackTitle?: string;
};

/** Longer than the check path so the stroke is fully hidden at rest. */
const CHECK_DASH = 24;

/**
 * Post-download confirmation.
 *
 * Everything here is driven by one variant tree ("hidden" → "visible") so the
 * parent's stagger reaches the badge and the check path. Mixing explicit
 * initial/animate objects into children breaks that propagation, which silently
 * leaves the check fully drawn instead of drawing itself in.
 *
 * Only transform/opacity (and the path's dash offset) animate, the ring burst
 * plays once rather than looping, and reduced motion collapses it to a fade so
 * the confirmation still appears.
 */
export default function DownloadSuccess({
  show,
  trackTitle
}: DownloadSuccessProps) {
  const reduce = useReducedMotion();

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
                {/* Draws itself in, left to right. */}
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
                Successfully downloaded
              </motion.p>
              {/* Titles run long, so this wraps instead of truncating. */}
              <motion.p
                variants={item}
                className="mt-0.5 text-xs leading-snug text-emerald-200/60"
              >
                {trackTitle ? `${trackTitle} — ` : ""}check your downloads folder
              </motion.p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
