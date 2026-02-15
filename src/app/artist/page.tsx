"use client";

/**
 * Legacy artist entry — redirects to docs. Use /admin/YOUR_TRIGGER_SAVES_SECRET instead.
 */
export default function ArtistPage() {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center bg-[#1a0a2e]/90 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur">
        <h1 className="mb-2 text-lg font-semibold text-white">Artist</h1>
        <p className="mb-4 text-sm text-white/60">
          Use your <strong>admin link</strong> to view presave stats.
        </p>
        <p className="mb-4 font-mono text-xs text-white/50 break-all">
          /admin/YOUR_TRIGGER_SAVES_SECRET
        </p>
        <p className="text-xs text-white/40">
          Bookmark that URL (see <code className="rounded bg-black/20 px-1">docs/PRESAVE_SETUP.md</code>).
        </p>
      </div>
    </main>
  );
}
