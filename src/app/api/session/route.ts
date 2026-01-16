import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";

export async function POST() {
  const sessionId = getOrCreateSessionId();
  return NextResponse.json({ sessionId });
}
