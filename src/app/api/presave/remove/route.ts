import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deletePresaveById } from "@/lib/presaves";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const presaveId = cookieStore.get("presave_id")?.value;
  if (!presaveId) {
    return NextResponse.json(
      { error: "Session expired or invalid. Please sign in again and try from the presave success page." },
      { status: 400 }
    );
  }

  try {
    const deleted = await deletePresaveById(presaveId);
    if (!deleted) {
      return NextResponse.json(
        { error: "Presave not found or already removed" },
        { status: 404 }
      );
    }
  } catch (e) {
    console.error("Presave remove error:", e);
    return NextResponse.json(
      { error: "Failed to remove presave" },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true });
  // Clear the presave_id cookie
  res.cookies.set("presave_id", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}
