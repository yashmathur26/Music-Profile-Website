import { NextRequest, NextResponse } from "next/server";
import { checkTicket } from "@/lib/downloadTicket";
import { readGate } from "@/lib/gateStore";
import { numericId } from "@/lib/soundcloud";
import { findTrack } from "@/lib/trackStore";

export const dynamic = "force-dynamic";

const refuse = (message: string, status = 403) =>
  new NextResponse(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
  });

/**
 * Google Drive answers big files with an HTML "can't scan this for viruses"
 * page instead of the file. Its form carries everything needed to ask again
 * for the real thing, so follow it once.
 */
const followDriveConfirm = async (html: string): Promise<Response | null> => {
  const action = html.match(/<form[^>]+action="([^"]+)"/i)?.[1];
  if (!action) return null;
  const url = new URL(action.replace(/&amp;/g, "&"));
  for (const match of html.matchAll(/<input[^>]+type="hidden"[^>]*>/gi)) {
    const name = match[0].match(/name="([^"]+)"/)?.[1];
    const value = match[0].match(/value="([^"]*)"/)?.[1];
    if (name && value !== undefined) url.searchParams.set(name, value);
  }
  return fetch(url, { redirect: "follow", cache: "no-store" });
};

/** "Song Title.wav" — what the file saves as when the source doesn't say. */
const fallbackName = (title: string, contentType: string | null) => {
  const ext = /wav/.test(contentType || "") ? "wav" : /mpeg|mp3/.test(contentType || "") ? "mp3" : "wav";
  return `${title.replace(/[\\/:*?"<>|]+/g, "").trim() || "download"}.${ext}`;
};

/**
 * Streams the track's file to a fan holding a valid ticket from
 * /api/download. The browser only ever sees this address; where the file
 * really lives stays on the server.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("t") || "";
  const gate = readGate();
  const slug = checkTicket(raw, numericId(gate.userId) || null);
  if (!slug) return refuse("Link expired. Press Download again.");

  const track = await findTrack(slug);
  if (!track?.downloadUrl) return refuse("That track doesn’t exist.", 404);

  const source = track.downloadUrl.startsWith("/")
    ? new URL(track.downloadUrl, request.nextUrl.origin)
    : new URL(track.downloadUrl);

  let upstream: Response | null = await fetch(source, { redirect: "follow", cache: "no-store" });
  if (upstream.ok && /text\/html/.test(upstream.headers.get("content-type") || "")) {
    upstream = await followDriveConfirm(await upstream.text());
  }
  if (!upstream?.ok || !upstream.body || /text\/html/.test(upstream.headers.get("content-type") || "")) {
    console.error(`[download] couldn't fetch the file for ${slug}: ${upstream?.status}`);
    return refuse("Couldn’t get the file. Try again.", 502);
  }

  const type = upstream.headers.get("content-type") || "application/octet-stream";
  const name =
    upstream.headers.get("content-disposition")?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] ||
    fallbackName(track.title, type);
  const decoded = (() => {
    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  })();
  const ascii = decoded.replace(/[^\x20-\x7e]/g, "").replace(/"/g, "'");

  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(decoded)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(upstream.body, { status: 200, headers });
}
