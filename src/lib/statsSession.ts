import { createServerSupabase } from "@/lib/supabaseServer";

const supabase = createServerSupabase();

export type StatsSessionRow = {
  id: string;
  spotify_user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  created_at: string;
};

export async function createStatsSession(params: {
  id: string;
  spotify_user_id: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const expiresAt = new Date(Date.now() + params.expires_in * 1000).toISOString();
  const { error } = await supabase.from("stats_sessions").insert({
    id: params.id,
    spotify_user_id: params.spotify_user_id,
    access_token: params.access_token,
    refresh_token: params.refresh_token,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getStatsSession(sessionId: string): Promise<StatsSessionRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("stats_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data as StatsSessionRow | null;
}

export async function updateStatsSessionTokens(
  sessionId: string,
  access_token: string,
  expires_at: string
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("stats_sessions")
    .update({ access_token, expires_at })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function deleteStatsSession(sessionId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("stats_sessions").delete().eq("id", sessionId);
}
