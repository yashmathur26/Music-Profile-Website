import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabaseServer";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * A step-by-step log of what happens on each gate, for the admin Stats tab.
 *
 * The downloads table can only say that a file went out. It can't say how
 * many people looked at a gate and left, how many connected but never
 * unlocked, or whether a download came from someone who did the gate at all.
 * Each of those is one row here:
 *
 *   view       the gate page rendered in a browser (sent by the page itself)
 *   manual     a fan took the "open SoundCloud yourself" fallback — honour
 *              system, so it is reported, never trusted
 *   connect    the fan pressed Connect and was sent to SoundCloud
 *   connected  SoundCloud sent them back with a working grant
 *   unlock     the follows (and like) went through and the gate opened
 *   download   the file link was handed out — `detail.gate` records what the
 *              server could see of how they got there, which is what makes
 *              bypasses countable from here on
 *
 * Only `view` and `manual` come from the browser, so only those two can be
 * faked; every kind that proves something is written by the server.
 */

export const GATE_EVENT_KINDS = [
  "view",
  "manual",
  "connect",
  "connected",
  "unlock",
  "download"
] as const;

export type GateEventKind = (typeof GATE_EVENT_KINDS)[number];

/** What the server could see when it handed out a download. */
export type DownloadGateState =
  /** Connected, and our record says every follow went through. */
  | "unlocked"
  /** Connected, but the follows never completed for this song. */
  | "connected_not_unlocked"
  /** No SoundCloud connection at all: the manual fallback, or a bypass. */
  | "no_connection";

const TABLE = "gate_events";
const supabase = createServerSupabase();

let warned = false;

/** The visitor's country, from the edge — free on Vercel, absent locally. */
export const countryFrom = (headers: Headers) => {
  const code = headers.get("x-vercel-ip-country");
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
};

/** The gate's own visitor cookie, if this browser already has one. Never
 * creates one: a server-side event shouldn't mint identity as a side effect. */
export const currentSessionId = () => {
  try {
    return cookies().get(SESSION_COOKIE)?.value || null;
  } catch {
    return null;
  }
};

/**
 * Writes one event. Callers must await it — Vercel freezes the function once
 * the response is sent, and an unawaited insert never lands — but it never
 * throws, so stats can't break the gate.
 */
export const logGateEvent = async (event: {
  kind: GateEventKind;
  trackSlug: string;
  sessionId?: string | null;
  scUsername?: string | null;
  country?: string | null;
  referrer?: string | null;
  detail?: Record<string, unknown> | null;
}) => {
  if (!supabase) return;
  try {
    const { error } = await supabase.from(TABLE).insert({
      kind: event.kind,
      track_slug: event.trackSlug,
      session_id: event.sessionId ?? currentSessionId(),
      sc_username: event.scUsername || null,
      country: event.country || null,
      referrer: event.referrer || null,
      detail: event.detail || null
    });
    if (error && !warned) {
      warned = true;
      console.warn(
        `[events] "${TABLE}" unavailable — run the SQL in docs/ADMIN_STATS_SETUP.md. ` +
          "The gate works without it; the Stats tab just has no funnel.",
        error
      );
    }
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn("[events] logging failed", error);
    }
  }
};

/**
 * Reduces a referrer to where the visitor came from, as a host.
 *
 * Instagram, TikTok and friends open links in their own in-app browsers and
 * often send no referrer at all, so a `utm_source` on the link wins when
 * there is one — tag the link you post and this column becomes exact.
 */
export const describeSource = (referrer: unknown, utmSource: unknown) => {
  if (typeof utmSource === "string" && utmSource.trim()) {
    return `utm:${utmSource.trim().toLowerCase().slice(0, 40)}`;
  }
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^(www|m|l|lm)\./, "");
    return host.slice(0, 80) || null;
  } catch {
    return null;
  }
};
