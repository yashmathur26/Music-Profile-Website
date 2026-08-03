import Link from "next/link";
import { DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { getAllTracks } from "@/lib/trackStore";
import Sidebar from "@/components/Sidebar";

// Tracks added from the admin page must show up without a redeploy.
export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
  const tracks = await getAllTracks();
  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
            <h1
              className="mb-6 text-center text-xl font-bold uppercase tracking-[0.2em] text-purple-300 md:text-2xl"
              style={{
                textShadow: "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.6)",
              }}
            >
              Free Downloads
            </h1>
            <div className="grid gap-2">
              {tracks.map((track, i) => (
                <Link
                  key={track.slug}
                  href={`/${track.slug}`}
                  className="group flex items-center gap-3 rounded-lg border border-purple-400/25 bg-purple-900/20 p-3 shadow-lg transition-all duration-200 hover:scale-[1.02] hover:border-purple-300/40 hover:bg-purple-900/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                    <svg className="h-5 w-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white/90">{track.title}</p>
                  </div>
                  <svg
                    className="h-4 w-4 shrink-0 text-purple-300/60 transition group-hover:translate-x-1 group-hover:text-purple-200"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
