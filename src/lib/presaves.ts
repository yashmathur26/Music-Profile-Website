import { createClient } from "@supabase/supabase-js";

export type PresaveRow = {
  id: string;
  campaign_id: string;
  spotify_user_id: string;
  refresh_token: string;
  email: string | null;
  saved: boolean;
  created_at: string;
};

const configured =
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = configured
  ? createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
  : null;

export async function insertPresave(params: {
  campaign_id: string;
  spotify_user_id: string;
  refresh_token: string;
  email?: string | null;
}): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("presaves").insert({
    campaign_id: params.campaign_id,
    spotify_user_id: params.spotify_user_id,
    refresh_token: params.refresh_token,
    email: params.email ?? null,
    saved: false,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getPresaveCount(campaignId: string): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("presaves")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return count ?? 0;
}

export async function getPresavesForCampaign(campaignId: string): Promise<PresaveRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("presaves")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PresaveRow[];
}

export async function markPresaveSaved(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("presaves").update({ saved: true }).eq("id", id);
}
