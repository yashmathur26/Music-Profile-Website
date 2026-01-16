import DownloadGate from "@/components/DownloadGate";
import Sidebar from "@/components/Sidebar";
import StarfieldCanvas from "@/components/StarfieldCanvas";
import { getTrackBySlug, tracks } from "@/lib/tracks";

type PageProps = {
  params: { slug: string };
};

export default function TrackPage({ params }: PageProps) {
  const track = getTrackBySlug(params.slug);
  if (!track) {
    return <main className="p-8 text-sm text-muted">Track not found.</main>;
  }
  const artistName = process.env.NEXT_PUBLIC_ARTIST_NAME?.trim() || "YVSH";

  return (
    <main className="min-h-screen bg-[#1a0a2e]">
      <div className="pointer-events-none fixed inset-0">
        <StarfieldCanvas density={1.0} seed={1337} className="opacity-90" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.15),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(236,72,153,0.1),_transparent_50%)]" />
      <div className="relative flex min-h-screen w-full">
        <Sidebar currentSlug={track.slug} tracks={tracks} />

        <section className="flex min-h-screen flex-1 flex-col overflow-hidden bg-[#1a0a2e]">
          <div className="flex-1">
            {track.soundcloudEmbedUrl ? (
              <iframe
                title="SoundCloud player"
                src={track.soundcloudEmbedUrl}
                allow="autoplay"
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

export const generateStaticParams = () =>
  tracks.map((track) => ({ slug: track.slug }));
