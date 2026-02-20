import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { updatePresaveEmail } from "@/lib/presaves";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const presaveId = cookieStore.get("presave_id")?.value;
  if (!presaveId) {
    return NextResponse.json({ error: "Session expired or invalid" }, { status: 400 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
  }

  try {
    await updatePresaveEmail(presaveId, email);
  } catch (e) {
    console.error("Presave update email error:", e);
    return NextResponse.json({ error: "Failed to save email" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("presave_id", "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
}
