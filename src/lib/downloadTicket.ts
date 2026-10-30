import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Short-lived permission to fetch one track's file, handed out by
 * /api/download only after the server has checked the gate was unlocked.
 *
 * The file itself is streamed by /api/download/file, so the Drive link never
 * reaches the browser — there is nothing to copy out of the network tab and
 * share. A ticket is signed with a server-only secret (unforgeable), names the
 * track (no swapping in another song), expires in a few minutes, and is bound
 * to the SoundCloud account in the fan's encrypted gate cookie, so the link is
 * useless to anyone it's passed to.
 */

const TTL_MS = 5 * 60_000;

const secret = () => {
  const raw =
    process.env.GATE_SECRET ||
    process.env.SOUNDCLOUD_CLIENT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) throw new Error("No secret configured to sign download tickets.");
  // Derived rather than reused as-is, so a ticket signature can never double
  // as anything the gate cookie's key protects.
  return createHash("sha256").update(`download-ticket:${raw}`).digest();
};

type Ticket = { slug: string; uid: string; exp: number; n: string };

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export const issueTicket = (slug: string, uid: string): string => {
  const ticket: Ticket = {
    slug,
    uid,
    exp: Date.now() + TTL_MS,
    n: randomBytes(9).toString("base64url")
  };
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${body}.${sign(body)}`;
};

/** The ticket's track, or null if it's forged, expired, or someone else's. */
export const checkTicket = (raw: string, uid: string | null | undefined): string | null => {
  const [body, mac] = raw.split(".");
  if (!body || !mac || !uid) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Ticket;
    if (typeof ticket.slug !== "string" || ticket.exp < Date.now()) return null;
    if (ticket.uid !== uid) return null;
    return ticket.slug;
  } catch {
    return null;
  }
};
