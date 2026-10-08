import Link from "next/link";

/**
 * The site's only persistent link to the legal pages, pinned bottom-right.
 *
 * Fixed rather than appended to each page because every page scrolls inside
 * its own `overflow-y-auto` column — there is no shared end-of-document to
 * hang a normal footer off. The pill backdrop is what keeps it readable when
 * it floats over artwork or a track list.
 */
export default function LegalFooter() {
  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Legal"
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] backdrop-blur-md"
      >
        <Link
          href="/terms"
          className="text-white/45 transition hover:text-white/80"
        >
          Terms
        </Link>
        <span aria-hidden className="text-white/20">
          ·
        </span>
        <Link
          href="/privacy"
          className="text-white/45 transition hover:text-white/80"
        >
          Privacy
        </Link>
      </nav>
    </div>
  );
}
