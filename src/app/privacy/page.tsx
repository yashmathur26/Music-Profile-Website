import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { campaign } from "@/config/campaign";

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
  const accent = campaign.accentColor;

  const sections = [
    {
      title: "Overview",
      body: "This Privacy Policy describes how we collect, use, and protect your information when you use this website and the presave feature.",
    },
    {
      title: "Information we collect",
      body: "When you pre-save a track, we collect: your Spotify user ID, a refresh token (so we can add the track to your library on release day), and optionally your email if you choose to receive release notifications. We do not sell your data.",
    },
    {
      title: "How we use it",
      body: "We use your Spotify user ID and token solely to add the pre-saved track to your Spotify library on release day. If you provide an email, we use it to notify you when the track is released. We do not use your data for advertising or share it with third parties for marketing.",
    },
    {
      title: "Cookies",
      body: "We only use functional cookies, and none are set until you start a connect or presave flow. They are: a session cookie (gate_session) that identifies your visit; short-lived OAuth security cookies (sc_oauth_state, sc_oauth_verifier, sc_oauth_track, sc_oauth_prefs — and Spotify equivalents) that protect the sign-in handshake and expire within minutes; and an encrypted gate cookie (sc_gate) that remembers your SoundCloud connection and which tasks you completed, for up to 7 days. All are httpOnly and are strictly necessary to provide the download and presave features you request. We do not use tracking, analytics, or advertising cookies.",
    },
    {
      title: "Spotify",
      body: "Our presave feature uses the Spotify Web API. Your use of the presave feature is also subject to Spotify's Terms of Use and Privacy Policy. Spotify is a third-party beneficiary of our Terms.",
    },
    {
      title: "Data retention",
      body: "We retain your presave data (Spotify user ID, token) until the track is released and added to your library, or until you remove your presave. You can remove your presave at any time from the presave success page.",
    },
    {
      title: "Your rights",
      body: "You can remove your presave at any time using the 'Remove my presave' option on the presave success page. For a copy of your data or other deletion requests, contact us via the Contact page. We will respond to legitimate requests in a reasonable time.",
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
          <div className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-14">
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
