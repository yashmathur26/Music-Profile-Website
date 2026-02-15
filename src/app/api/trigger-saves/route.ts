import { NextRequest, NextResponse } from "next/server";
import { getPresavesForCampaign, markPresaveSaved, type PresaveRow } from "@/lib/presaves";
import { getAccessTokenFromRefresh, saveTrackToLibrary } from "@/lib/spotify";
import { campaign, getCampaignId } from "@/config/campaign";

const BATCH_SIZE = 50;
const DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.TRIGGER_SAVES_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let bodyTrackUri: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    bodyTrackUri = body?.trackUri;
  } catch {
    // no body
  }
  const trackUri = (bodyTrackUri || campaign.spotify.trackUri || "").trim();
  if (!trackUri) {
    return NextResponse.json(
      { error: "No track URI. Set campaign.spotify.trackUri or pass { trackUri } in body." },
      { status: 400 }
    );
  }

  const campaignId = getCampaignId(campaign);
  const rows = await getPresavesForCampaign(campaignId);
  let saved = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as PresaveRow;
    if (row.saved) continue;
    try {
      const accessToken = await getAccessTokenFromRefresh(row.refresh_token);
      const ok = await saveTrackToLibrary(accessToken, trackUri);
      if (ok) {
        await markPresaveSaved(row.id);
        saved++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    if ((i + 1) % BATCH_SIZE === 0) await sleep(DELAY_MS);
  }

  return NextResponse.json({
    total: rows.length,
    saved,
    failed,
  });
}
