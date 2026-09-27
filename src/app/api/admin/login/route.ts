import { NextRequest, NextResponse } from "next/server";
import {
  adminPassword,
  clearAdminSession,
  hasAdminSession,
  matchesAdminPassword,
  startAdminSession
} from "@/lib/adminSession";

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

/**
 * A wrong password costs a second, so guessing a short one over the network
 * stays slow even though the check itself is instant.
 */
const WRONG_PASSWORD_DELAY_MS = 1000;

/** Is this browser already unlocked? */
export async function GET() {
  return NextResponse.json(
    { authed: hasAdminSession(), configured: Boolean(adminPassword()) },
    noStore
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    password?: unknown;
  };
  const password = typeof body.password === "string" ? body.password : "";

  if (!adminPassword()) {
    return NextResponse.json(
      { error: "No admin password is set on the server." },
      { status: 500, ...noStore }
    );
  }

  if (!matchesAdminPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return NextResponse.json(
      { error: "Wrong password." },
      { status: 401, ...noStore }
    );
  }

  startAdminSession();
  return NextResponse.json({ authed: true }, noStore);
}

/** Lock the dashboard again. */
export async function DELETE() {
  clearAdminSession();
  return NextResponse.json({ authed: false }, noStore);
}
