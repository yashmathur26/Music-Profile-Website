import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";

function Check({
  className,
  style
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${className}`}
      style={style}
      aria-hidden
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

export default function TermsPage() {
  const accent = "#a78bfa";
  const artistName = process.env.NEXT_PUBLIC_ARTIST_NAME?.trim() || "YVSH";

  const sections = [
    {
      title: "Acceptance",
      body: "By using this site, you agree to these terms. If you don’t agree, please don’t use the service.",
    },
    {
      title: "Age requirement",
      body: "You must be at least 13 years old to use this site. In the European Economic Area and the UK you must be at least 16. We don’t knowingly collect data from anyone under those ages.",
    },
    {
      title: "Automatic likes and reposts",
      body: (
        <>
          <strong className="font-semibold text-white/90">
            Downloading a track opts you in to this.
          </strong>{" "}
          When you connect SoundCloud to unlock a download, we keep that
          connection and use it to like and repost future releases from your
          account. Reposts appear on your SoundCloud profile and in your
          followers&rsquo; feeds. We do this until you switch it off; we never
          follow accounts, post comments, or read your private data on this
          basis.{" "}
          <Link
            href="/unsubscribe"
            className="font-medium underline underline-offset-2"
            style={{ color: accent }}
          >
            Turn off automatic likes and reposts
          </Link>{" "}
          &mdash; that link works at any time and needs no login, it deletes
          the SoundCloud token we hold for you, and once you use it we will not
          opt you back in on later downloads. You can also revoke access in
          your SoundCloud settings (Settings &rarr; Connections).
        </>
      ),
    },
    {
      title: "Likes on other songs",
      body: (
        <>
          When you download a track with SoundCloud connected, we may also use
          that connection to like other {artistName} tracks from your account
          at the same time &mdash; likes only, never reposts, follows or
          comments. A like is visible on your profile&rsquo;s Likes and in the
          track&rsquo;s like count, and you can remove it on SoundCloud like
          any other. Revoking this site&rsquo;s access in your SoundCloud
          settings (Settings &rarr; Connections) stops it.
        </>
      ),
    },
    {
      title: "Your responsibility",
      body: "You use the site at your own risk. Don’t misuse the service, attempt to access systems you’re not allowed to, or use it for anything illegal.",
    },
    {
      title: "No warranty",
      body: "The site is provided “as is.” We don’t guarantee it will be error-free or always available.",
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
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks.map(({ slug, title }) => ({ slug, title }))} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-10 pb-28 md:px-6 md:py-14 md:pb-28">
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
              <Link
                href="/privacy"
                className="text-sm font-medium text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
                style={{ color: accent }}
              >
                Privacy Policy
              </Link>
              <Link
                href="/unsubscribe"
                className="text-sm font-medium text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
              >
                Turn off automatic likes
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
