import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";

export default function ShopPage() {
  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <div className="mt-24 text-center">
              <p className="text-lg font-extrabold tracking-[0.35em] text-white/90">
                COMING SOON
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

