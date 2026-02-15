import { NextResponse } from "next/server";

/**
 * Public presave count is hidden — always returns 0.
 * Real count is only available on the admin stats page (/admin/YOUR_SECRET).
 */
export async function GET() {
  return NextResponse.json({ count: 0 });
}
