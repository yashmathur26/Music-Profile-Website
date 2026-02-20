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
}): Promise<string | null> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("presaves")
    .insert({
      campaign_id: params.campaign_id,
      spotify_user_id: params.spotify_user_id,
      refresh_token: params.refresh_token,
      email: params.email ?? null,
      saved: false,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

export async function updatePresaveEmail(id: string, email: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("presaves").update({ email: email.trim() || null }).eq("id", id);
  if (error) throw error;
}

export async function getPresaveByCampaignAndUser(
  campaignId: string,
  spotifyUserId: string
): Promise<PresaveRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("presaves")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("spotify_user_id", spotifyUserId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PresaveRow) ?? null;
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

export async function updatePresaveRefreshToken(id: string, refresh_token: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("presaves").update({ refresh_token }).eq("id", id);
  if (error) throw error;
}

/** Delete all presaves (use for reset / from-scratch). */
export async function deleteAllPresaves(): Promise<number> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data: rows, error: selectError } = await supabase.from("presaves").select("id");
  if (selectError) throw selectError;
  if (!rows?.length) return 0;
  const ids = rows.map((r) => r.id);
  const { error: deleteError } = await supabase.from("presaves").delete().in("id", ids);
  if (deleteError) throw deleteError;
  return ids.length;
}
