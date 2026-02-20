import { NextRequest, NextResponse } from "next/server";
import { deleteAllPresaves } from "@/lib/presaves";

/**
 * One-time reset: wipe all presaves and clear OAuth/presave cookies.
 * Call: GET /api/admin/reset-presaves?secret=YOUR_SECRET
 * Set PRESAVE_RESET_SECRET in .env.local (and Vercel) to a random string.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.PRESAVE_RESET_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let deleted = 0;
  try {
    deleted = await deleteAllPresaves();
  } catch (e) {
    console.error("reset-presaves:", e);
    return NextResponse.json({ error: "Failed to delete presaves" }, { status: 500 });
  }

  const home = new URL("/", req.nextUrl.origin);
  const res = NextResponse.redirect(home);
  const cookieOpts = {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  res.cookies.set("spotify_oauth_state", "", cookieOpts);
  res.cookies.set("spotify_return_to", "", cookieOpts);
  res.cookies.set("presave_id", "", cookieOpts);
  return res;
}
