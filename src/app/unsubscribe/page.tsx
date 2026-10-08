import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";
import { campaign } from "@/config/campaign";
import { readGate } from "@/lib/gateStore";
import { numericId } from "@/lib/soundcloud";
import {
  findBySoundcloudId,
  findByRevokeToken,
  type ReleaseSubscriber
} from "@/lib/releaseSubscribers";
import UnsubscribeForm from "./UnsubscribeForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Turn off automatic likes & reposts",
  // This page lives in people's inboxes and browser history; keep it out of
  // search results.
  robots: { index: false, follow: false }
};

/**
 * The off switch for automatic likes and reposts.
 *
 * Reached two ways, and both have to work:
 *
 *  - `?t=<revoke token>` — the permanent link handed to the fan the moment
 *    they opted in. No session, no login, works forever and from any device,
 *    because the subscription it ends lasts just as long.
 *  - no query at all — the link in the Terms. Nobody arriving that way has a
 *    token, so we identify them by their gate cookie instead; that only works
 *    in the browser they downloaded from, which the copy below says plainly.
 */
export default async function UnsubscribePage({
  searchParams
}: {
  searchParams: { t?: string };
}) {
  const accent = campaign.accentColor;
  const token = (searchParams.t || "").trim();
  const artistName = process.env.NEXT_PUBLIC_ARTIST_NAME?.trim() || "YVSH";

  let subscriber: ReleaseSubscriber | null = null;
  let lookupFailed = false;
  try {
    if (token) {
      subscriber = await findByRevokeToken(token);
    }
    // A bogus or already-cleared token still gets the cookie fallback, so a
    // fan who mangled their link isn't left with nowhere to go.
    if (!subscriber) {
      const scUserId = numericId(readGate().userId);
      if (scUserId) subscriber = await findBySoundcloudId(scUserId);
    }
  } catch {
    lookupFailed = true;
  }

  const active = Boolean(subscriber && !subscriber.revoked_at);
  // Only pass the token along if it actually resolved the subscriber we're
  // about to act on — otherwise the form must go through the cookie.
  const formToken =
    token && subscriber && subscriber.revoke_token === token ? token : null;

  const Body = () => {
    if (lookupFailed) {
      return (
        <p className="mt-4 text-sm leading-relaxed text-white/70">
          We couldn&rsquo;t reach the database just now, so we can&rsquo;t show
          you the right thing. Please reload in a minute — or{" "}
          <Link
            href="/contact"
            className="underline underline-offset-2"
            style={{ color: accent }}
          >
            contact us
          </Link>{" "}
          and we&rsquo;ll switch it off by hand.
        </p>
      );
    }

    if (active) {
      return (
        <>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            When you downloaded a track you ticked the box asking us to like and
            repost {artistName}&rsquo;s future releases from your SoundCloud
            account. That&rsquo;s what this switches off.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            We&rsquo;ll delete the SoundCloud token we kept for you, and nothing
            further will happen on your account.
          </p>
          <UnsubscribeForm
            token={formToken}
            username={subscriber?.sc_username ?? null}
            accent={accent}
          />
        </>
      );
    }

    if (subscriber) {
      return (
        <>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            This is already off
            {subscriber.sc_username ? ` for @${subscriber.sc_username}` : ""}.
            We hold no SoundCloud token for you and nothing runs on your
            account.
          </p>
          <Link
            href="/home"
            className="mt-6 inline-block text-sm font-medium text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
          >
            ← Back to site
          </Link>
        </>
      );
    }

    // Nothing found: either they never opted in, or they're in a different
    // browser from the one they downloaded in.
    return (
      <>
        <p className="mt-4 text-sm leading-relaxed text-white/70">
          There&rsquo;s nothing to switch off here. Either you never turned on
          automatic likes and reposts, or you&rsquo;re on a different browser or
          device from the one you downloaded with.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          If you did turn it on, open the personal off-switch link we showed you
          after your download — it works from anywhere. You can also revoke this
          site&rsquo;s access directly from SoundCloud (Settings &rarr;
          Connections), which stops everything immediately, or{" "}
          <Link
            href="/contact"
            className="underline underline-offset-2"
            style={{ color: accent }}
          >
            contact us
          </Link>{" "}
          and we&rsquo;ll remove it by hand.
        </p>
      </>
    );
  };

  return (
    <main className="relative z-10 min-h-screen bg-[#1a0a2e]/80">
      <div className="relative flex min-h-screen overflow-x-hidden">
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-10 pb-28 md:px-6 md:py-14 md:pb-28">
            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Automatic likes &amp; reposts
            </h1>

            <Body />

            <div className="mt-14 flex flex-wrap items-center gap-4 border-t border-white/10 pt-8">
              <Link
                href="/privacy"
                className="text-sm font-medium text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-sm font-medium text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
              >
                Terms &amp; Conditions
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
