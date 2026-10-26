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

export default function PrivacyPage() {
  const accent = "#a78bfa";

  const sections = [
    {
      title: "Overview",
      body: "This Privacy Policy describes how we collect, use, and protect your information when you use this website and its SoundCloud download gates.",
    },
    {
      title: "Information we collect",
      body: "When you connect SoundCloud to unlock a download, we collect your SoundCloud user ID, username and profile URL, and record which tracks you downloaded. We do not sell your data.",
    },
    {
      title: "Automatic likes and reposts (optional)",
      body: "On a download gate you may tick \u201cAutomatically like and repost future releases\u201d. This box is off unless you turn it on, and the download works without it. If you do turn it on, we keep your SoundCloud access and refresh tokens, your SoundCloud user ID, username and profile URL until you switch it off, and we refresh the connection about once a day to keep it working. When a new track is released we use it to like and repost that track from your account \u2014 nothing else. We never post comments, never follow accounts, and never read your private data on this basis. Every download page shows you a personal off switch link once the option is on, and that link works forever without logging in; switching it off deletes the stored tokens immediately.",
    },
    {
      title: "How we use it",
      body: "We use your SoundCloud connection to complete the follow and like a download gate asks for, and — only if automatic likes and reposts are on — to like and repost future releases. We do not use your data for advertising or share it with third parties for marketing.",
    },
    {
      title: "Cookies",
      body: "We only use functional cookies, and none are set until you start connecting SoundCloud. They are: a session cookie (gate_session) that identifies your visit; short-lived OAuth security cookies (sc_oauth_state, sc_oauth_verifier, sc_oauth_track, sc_oauth_prefs) that protect the sign-in handshake and expire within minutes; and an encrypted gate cookie (sc_gate) that remembers your SoundCloud connection and which tasks you completed, for up to 7 days. All are httpOnly and are strictly necessary to provide the downloads you request. We do not use tracking, analytics, or advertising cookies.",
    },
    {
      title: "Data retention",
      body: "We retain the SoundCloud tokens from a download until you switch automatic likes and reposts off \u2014 there is no fixed end date, which is why the off switch link never expires. We also delete them automatically as soon as SoundCloud tells us the connection is no longer valid.",
    },
    {
      title: "Your rights",
      body: "You can switch off automatic likes and reposts at any time using the off switch link shown after your download or the link in our Terms, which deletes the SoundCloud tokens we hold for you and stops a later download opting you back in; you can also revoke this site's access from your SoundCloud account settings. For a copy of your data or other deletion requests, contact us via the Contact page. We will respond to legitimate requests in a reasonable time.",
    },
    {
      title: "Contact",
      body: "For privacy questions or data requests, contact us at ymbeats26@gmail.com or through our Contact page.",
    },
  ];

  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-10 pb-28 md:px-6 md:py-14 md:pb-28">
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Privacy Policy
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
                href="/terms"
                className="text-sm font-medium text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
                style={{ color: accent }}
              >
                Terms & Conditions
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
