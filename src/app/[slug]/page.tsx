import DownloadGate from "@/components/DownloadGate";
import Sidebar from "@/components/Sidebar";
import { findTrack, getAllTracks } from "@/lib/trackStore";

type PageProps = {
  params: { slug: string };
};

// Tracks added from the admin page must show up without a redeploy.
export const dynamic = "force-dynamic";

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
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.15),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(236,72,153,0.1),_transparent_50%)]" />
      <div className="relative flex min-h-screen w-full">
        <Sidebar currentSlug={track.slug} tracks={tracks} />

        <section className="flex min-h-screen flex-1 flex-col overflow-hidden bg-[#1a0a2e]">
          <div className="flex-1">
            {track.soundcloudEmbedUrl ? (
              <iframe
                title="SoundCloud player"
                src={track.soundcloudEmbedUrl}
                allow="autoplay; encrypted-media"
                className="h-full w-full border-0"
              />
            ) : (
              <img
                src={track.artworkUrl}
                alt="Track artwork"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        </section>

        <aside className="flex min-h-screen w-full max-w-md flex-col border-l border-purple-500/20 bg-[#150820] p-7 md:w-[420px] md:p-9">
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.35em] text-muted">
              Free Download
            </p>
            <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
              {track.title}
            </h1>
            <p className="text-sm text-muted">{artistName}</p>
          </div>

          <div className="mt-8 flex-1">
            <DownloadGate trackSlug={track.slug} />
          </div>
        </aside>
      </div>
    </main>
  );
}
