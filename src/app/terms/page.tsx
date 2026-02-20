import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { campaign } from "@/config/campaign";

function Check({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${className}`}
      aria-hidden
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

export default function TermsPage() {
  const accent = campaign.accentColor;

  const sections = [
    {
      title: "Acceptance",
      body: "By using this site and the presave feature, you agree to these terms. If you don’t agree, please don’t use the service.",
    },
    {
      title: "Age requirement",
      body: "You must be at least 13 years old to use this site. In the European Economic Area and the UK you must be at least 16. We don’t knowingly collect data from anyone under those ages.",
    },
    {
      title: "What we do with presave",
      body: "When you pre-save, we store your Spotify user ID and a token so we can add the track to your Spotify library on release day. We may store an optional email if you give it. We don’t sell your data.",
    },
    {
      title: "Your responsibility",
      body: "You use the site at your own risk. Don’t misuse the service, attempt to access systems you’re not allowed to, or use it for anything illegal.",
    },
    {
      title: "No warranty",
      body: "The site and presave feature are provided “as is.” We don’t guarantee the site will be error-free or that the track will be added at an exact time.",
    },
    {
      title: "Changes",
      body: "We may update these terms. Continued use after changes means you accept the new terms. The current version is always on this page.",
    },
    {
      title: "Contact & data rights",
      body: "For a copy of your data or to request deletion, see our Contact page. We’ll respond to legitimate requests in a reasonable time.",
    },
  ];

  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-14">
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Terms & Conditions
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>

            <ul className="mt-10 space-y-6">
              {sections.map((section, i) => (
                <li key={i} className="flex gap-4">
                  <Check
                    className="mt-0.5 border-transparent text-white/90"
                    style={{ backgroundColor: `${accent}25`, borderColor: accent, color: accent }}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-white/90">
                      {section.title}
                    </h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                      {section.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-14 flex flex-wrap items-center gap-4 border-t border-white/10 pt-8">
              <Link
                href="/home"
                className="text-sm font-medium text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
              >
                ← Back to site
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
