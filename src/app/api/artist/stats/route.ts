import { NextRequest, NextResponse } from "next/server";
import { getPresaveCount } from "@/lib/presaves";
import { getCampaignId, campaign } from "@/config/campaign";

/**
 * Artist-only stats. Requires key query param matching TRIGGER_SAVES_SECRET.
 * Use like: /api/artist/stats?key=YOUR_SECRET (or bookmark /artist?key=YOUR_SECRET)
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const secret = process.env.TRIGGER_SAVES_SECRET;
  if (!secret || key !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaignId = getCampaignId(campaign);
  const count = await getPresaveCount(campaignId);

  return NextResponse.json({
    count,
    campaignId,
    trackTitle: campaign.trackTitle,
    isActive: campaign.isActive,
  });
}
