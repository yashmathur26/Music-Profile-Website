import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { campaign } from "@/config/campaign";

export default function ContactPage() {
  const accent = campaign.accentColor;

  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-14">
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Contact
            </h1>
            <p className="mt-2 text-sm text-white/60">
              Get in touch with {campaign.trackArtist}.
            </p>

            <div className="mt-10 space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white/90">
                  Business / Press
                </h2>
                <a
                  href="mailto:yvshmusic@gmail.com"
                  className="mt-2 inline-block text-white/80 underline-offset-2 hover:text-white hover:underline"
                  style={{ color: accent }}
                >
                  yvshmusic@gmail.com
                </a>
              </div>
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white/90">
                  Socials
                </h2>
                <div className="mt-3 flex flex-wrap gap-3">
                  <a
                    href="https://open.spotify.com/artist/2mBs3Kdfu7pvYu4w8Hac5y"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-[#1DB954]/40 bg-[#1DB954]/20 px-4 py-2.5 text-sm font-medium text-[#1DB954] transition hover:bg-[#1DB954]/30"
                  >
                    Spotify
                  </a>
                  <a
                    href="https://www.instagram.com/itsyvshhh/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-pink-400/40 bg-pink-500/20 px-4 py-2.5 text-sm font-medium text-pink-300 transition hover:bg-pink-500/30"
                  >
                    Instagram
                  </a>
                  <a
                    href="https://soundcloud.com/yvshh"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-orange-400/40 bg-orange-500/20 px-4 py-2.5 text-sm font-medium text-orange-300 transition hover:bg-orange-500/30"
                  >
                    SoundCloud
                  </a>
                  <a
                    href="https://www.tiktok.com/@yvsh.mp3"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/20"
                  >
                    TikTok
                  </a>
                </div>
              </div>
            </div>

            <p className="mt-10">
              <Link
                href="/presave"
                className="text-sm text-white/50 underline-offset-2 hover:text-white/70 hover:underline"
              >
                ← Back to presave
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
