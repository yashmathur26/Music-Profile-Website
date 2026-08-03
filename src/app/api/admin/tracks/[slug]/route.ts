import { NextRequest, NextResponse } from "next/server";
import { deleteTrack, listDbTracks } from "@/lib/trackStore";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const secret = process.env.TRIGGER_SAVES_SECRET;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listDbTracks();
  if (!rows.some((row) => row.slug === params.slug)) {
    return NextResponse.json(
      { error: "Only tracks added from this page can be deleted." },
      { status: 404 }
    );
  }

  try {
    await deleteTrack(params.slug);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed." },
      { status: 500 }
    );
  }
  return NextResponse.json({ deleted: true });
}
