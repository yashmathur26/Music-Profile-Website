import type { NextRequest } from "next/server";

/**
 * The site's public origin, for building absolute redirect URLs.
 *
 * Behind a self-hosting proxy (Railway), `req.nextUrl.origin` is the address
 * the Node server itself listens on — `https://localhost:8080` — not the one
 * the visitor used, so a redirect built from it sends people to a dead page.
 * (Vercel used to hide this by rewriting the request.) In order of preference:
 *
 *  1. NEXT_PUBLIC_APP_URL, when it's a real https address — the canonical
 *     domain, and the one the OAuth apps are registered against;
 *  2. the host and scheme the proxy forwarded;
 *  3. whatever Next.js thinks, for local development.
 */
export const siteOrigin = (req: NextRequest) => {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && /^https:\/\//i.test(configured)) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through to the request */
    }
  }

  const first = (value: string | null) => value?.split(",")[0]?.trim() || "";
  const host = first(req.headers.get("x-forwarded-host")) || first(req.headers.get("host"));
  if (host && !/^(localhost|127\.|0\.0\.0\.0|\[::)/i.test(host)) {
    const proto = first(req.headers.get("x-forwarded-proto")) || "https";
    return `${proto === "http" ? "http" : "https"}://${host}`;
  }
  return req.nextUrl.origin;
};
