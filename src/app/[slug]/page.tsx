import DownloadGate from "@/components/DownloadGate";
import Sidebar from "@/components/Sidebar";
import { findTrack, getAllTracks } from "@/lib/trackStore";

type PageProps = {
  params: { slug: string };
};

// Tracks added from the admin page must show up without a redeploy.
export const dynamic = "force-dynamic";

/**
 * SoundCloud's slim "classic" player rather than the full-bleed visual one:
 * the artwork already has its own card, so the player only needs to play.
 */
const compactPlayer = (embedUrl: string) =>
  embedUrl.replace("visual=true", "visual=false") +
  (embedUrl.includes("show_artwork=") ? "" : "&show_artwork=false");

export default async function TrackPage({ params }: PageProps) {
  const [track, tracks] = await Promise.all([
    findTrack(params.slug),
    getAllTracks()
  ]);
  if (!track) {
    return <main className="p-8 text-sm text-muted">Track not found.</main>;
  }
  const artistName = process.env.NEXT_PUBLIC_ARTIST_NAME?.trim() || "YVSH";

  return (
    <main className="relative z-10 min-h-screen overflow-hidden bg-[#0c0614]">
      {/* The artwork, blown up and blurred, sets the colour of the page. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={track.artworkUrl}
          alt=""
          className="h-full w-full scale-125 object-cover opacity-70 blur-[100px] saturate-150"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0614]/20 via-[#0c0614]/55 to-[#0c0614]/95" />
      </div>

      <div className="relative flex min-h-screen w-full">
        <Sidebar currentSlug={track.slug} tracks={tracks.map(({ slug, title }) => ({ slug, title }))} />

        <div className="flex min-w-0 flex-1 items-start justify-center px-4 pb-28 pt-8 sm:px-8 lg:items-center lg:py-12">
          <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
            {/* Artwork + player */}
            <div className="mx-auto w-full max-w-sm lg:max-w-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={track.artworkUrl}
                alt={`${track.title} artwork`}
                className="aspect-square w-full rounded-3xl object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
              />
              {track.soundcloudEmbedUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-white/10">
                  <iframe
                    title={`${track.title} on SoundCloud`}
                    src={compactPlayer(track.soundcloudEmbedUrl)}
                    allow="autoplay; encrypted-media"
                    className="block h-[120px] w-full border-0"
                  />
                </div>
              )}
            </div>

            {/* The gate */}
            <div className="flex flex-col">
              <h1
                className={
                  "font-bold leading-tight tracking-tight text-white " +
                  // Remix titles run long; keep them to two or three lines.
                  (track.title.length > 28 ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl")
                }
              >
                {track.title}
              </h1>
              <p className="mt-2 text-base text-white/50">{artistName}</p>

              <div className="mt-8">
                <DownloadGate trackSlug={track.slug} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
