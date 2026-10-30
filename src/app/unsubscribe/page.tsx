import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { tracks, DEFAULT_TRACK_SLUG } from "@/lib/tracks";
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
  searchParams: { t?: string; signed?: string; u?: string };
}) {
  const accent = "#a78bfa";
  const token = (searchParams.t || "").trim();
  const artistName = process.env.NEXT_PUBLIC_ARTIST_NAME?.trim() || "YVSH";
  // Back from "Sign in with SoundCloud to turn it off" — see
  // /api/soundcloud/unsubscribe. The handle is only ever shown, never trusted.
  const signed = searchParams.signed || "";
  const signedAs = (searchParams.u || "").slice(0, 60);

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

  /** The way in for someone with no link and a different browser. */
  const SignInButton = ({ again = false }: { again?: boolean }) => (
    <a
      href="/api/soundcloud/unsubscribe"
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff5500] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#ff6a1f]"
    >
      {again ? "Try signing in again" : "Sign in with SoundCloud to turn it off"}
    </a>
  );

  const Body = () => {
    if (signed === "off" || signed === "already") {
      return (
        <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4">
          <p className="text-sm font-semibold text-emerald-200">
            {signed === "off" ? "Turned off." : "Already off."}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">
            {signed === "off"
              ? `Nothing will happen on${signedAs ? ` @${signedAs}` : " your account"} again, and the token we were keeping has been deleted. Anything already liked or reposted stays as it is — you can undo those on SoundCloud yourself.`
              : `Automatic likes and reposts were already off${signedAs ? ` for @${signedAs}` : ""}. We hold no token for you and nothing runs on your account.`}
          </p>
          <Link
            href="/home"
            className="mt-4 inline-block text-sm font-medium text-white/60 underline-offset-2 hover:text-white/90 hover:underline"
          >
            ← Back to site
          </Link>
        </div>
      );
    }

    if (signed === "none") {
      return (
        <>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            {signedAs ? `@${signedAs} was` : "That account was"} never signed
            up for automatic likes and reposts, so there&rsquo;s nothing
            running on it. We didn&rsquo;t keep anything from that sign-in.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            If you downloaded with a different SoundCloud account, sign out of
            SoundCloud and sign in with that one instead.
          </p>
          <SignInButton again />
        </>
      );
    }

    if (signed === "error" || signed === "denied") {
      return (
        <>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            {signed === "denied"
              ? "The SoundCloud sign-in was cancelled, so nothing changed."
              : "The SoundCloud sign-in didn’t go through, so nothing changed."}{" "}
            You can try again, or{" "}
            <Link href="/contact" className="underline underline-offset-2" style={{ color: accent }}>
              contact us
            </Link>{" "}
            and we&rsquo;ll switch it off by hand.
          </p>
          <SignInButton again />
        </>
      );
    }

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
          We can&rsquo;t tell who you are from this browser. Sign in with the
          SoundCloud account you downloaded with and we&rsquo;ll switch it off
          straight away — the sign-in is only used to find you, and nothing
          else happens on your account.
        </p>
        <SignInButton />
        <p className="mt-6 text-xs leading-relaxed text-white/45">
          You can also use the personal off-switch link we showed you after
          your download, revoke this site&rsquo;s access directly from
          SoundCloud (Settings &rarr; Connections), or{" "}
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
        <Sidebar currentSlug={DEFAULT_TRACK_SLUG} tracks={tracks.map(({ slug, title }) => ({ slug, title }))} />

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
