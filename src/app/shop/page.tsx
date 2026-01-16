import Sidebar from "@/components/Sidebar";
import StarfieldCanvas from "@/components/StarfieldCanvas";
import { tracks } from "@/lib/tracks";

export default function ShopPage() {
  return (
    <main className="relative min-h-screen bg-[#1a0a2e]">
      <div className="pointer-events-none fixed inset-0">
        <StarfieldCanvas density={1.0} seed={1337} className="opacity-90" />
      </div>

      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug="dont-stop-the-music-piano" tracks={tracks} />

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

