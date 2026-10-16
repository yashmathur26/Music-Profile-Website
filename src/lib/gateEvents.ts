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
 *   enrol      the attempt to save the fan for future releases, and its
 *              outcome (`detail.ok`, `detail.reason`) — so a fan who should
 *              have been saved and wasn't leaves a reason behind
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
  "download",
  "enrol"
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

type GeoLookup = { lookup: (ip: string) => { country?: string } | null };
let geo: GeoLookup | null | undefined;

/**
 * The offline IP → country table, loaded on first use. It lives in this
 * process, so a visitor's IP is never sent anywhere to be looked up, and it
 * costs about 10 MB of memory — paid only on hosts that don't hand us a
 * country header.
 */
const loadGeo = (): GeoLookup | null => {
  if (geo !== undefined) return geo;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    geo = require("geoip-country") as GeoLookup;
  } catch {
    geo = null;
  }
  return geo;
};

/** Dotted IPv4 with no leading zeros — the only shape we hand the parser. */
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
/** Plain IPv6: hex groups and colons only, bounded length. */
const IPV6 = /^[0-9a-f:]{2,39}$/i;

/**
 * The client's IP, or null if it isn't a clean address.
 *
 * X-Real-IP is set by the host's own proxy (Railway) and can't be forged by
 * the visitor; the first X-Forwarded-For entry can, so it's only a fallback.
 * Anything that isn't a plain IPv4/IPv6 is dropped before it reaches the
 * lookup table's parser, which has known bugs with odd input (leading-zero
 * octets, very long strings) — a spoofed header gets a blank country, never
 * a slow or wrong parse.
 */
const clientIp = (headers: Headers) => {
  const raw =
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  if (raw.length > 39) return null;
  return IPV4.test(raw) || (raw.includes(":") && IPV6.test(raw)) ? raw : null;
};

/**
 * The visitor's country. Vercel and Cloudflare put it in a header for free;
 * anywhere else (Railway) it comes from the offline table. Only the
 * two-letter code is kept — the IP itself is never stored.
 */
export const countryFrom = (headers: Headers) => {
  const header =
    headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry");
  if (header && /^[A-Z]{2}$/.test(header)) return header;
  const ip = clientIp(headers);
  if (!ip) return null;
  const code = loadGeo()?.lookup(ip)?.country;
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
