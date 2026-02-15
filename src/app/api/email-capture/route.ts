import { NextRequest, NextResponse } from "next/server";
import { campaign } from "@/config/campaign";

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  if (campaign.emailWebhook) {
    try {
      await fetch(campaign.emailWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          trackTitle: campaign.trackTitle,
          trackArtist: campaign.trackArtist,
          source: "yvsh_presave",
        }),
      });
    } catch (e) {
      console.error("Email webhook error:", e);
      return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
