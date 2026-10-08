"use client";

import { useState } from "react";
import Link from "next/link";

type State = "idle" | "working" | "done" | "error";

/**
 * The confirm button behind the off switch.
 *
 * Two ways in, because the page is reached two ways: a fan's permanent revoke
 * link carries a `token` and needs no session, while someone arriving from the
 * Terms link in their own browser is identified by the gate cookie instead.
 */
export default function UnsubscribeForm({
  token,
  username,
  accent
}: {
  /** The revoke token from the link, or null to act on the gate cookie. */
  token: string | null;
  username: string | null;
  accent: string;
}) {
  const [state, setState] = useState<State>("idle");

  const submit = async () => {
    setState("working");
    try {
      const response = token
        ? await fetch("/api/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
          })
        : await fetch("/api/soundcloud/subscribe", { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean }
        | null;
      setState(response.ok && data?.ok !== false ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4">
        <p className="text-sm font-semibold text-emerald-200">Turned off.</p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/70">
          We won&rsquo;t touch your SoundCloud account again, and the token we
          were keeping has been deleted. Anything already liked or reposted
          stays as it is — you can undo those on SoundCloud yourself.
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

  return (
    <div className="mt-8">
      <button
        onClick={submit}
        disabled={state === "working"}
        className="w-full rounded-2xl px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition disabled:opacity-60"
        style={{ backgroundColor: accent }}
      >
        {state === "working" ? "Turning off…" : "Turn it off"}
      </button>

      {state === "error" && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          That didn&rsquo;t go through. Try again, or{" "}
          <Link href="/contact" className="underline underline-offset-2">
            contact us
          </Link>{" "}
          and we&rsquo;ll remove it by hand.
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-white/40">
        {username
          ? `This affects the SoundCloud account @${username} only.`
          : "This affects one SoundCloud account only."}{" "}
        You can download tracks from the site again afterwards — this
        doesn&rsquo;t block anything.
      </p>
    </div>
  );
}
