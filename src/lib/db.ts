import { createClient } from "@supabase/supabase-js";

type SessionRow = {
  id: string;
  sc_user_id: string | null;
  sc_access_token: string | null;
  sc_verified: boolean;
  download_count: number;
  created_at: string;
  updated_at: string;
};

const supabaseConfigured =
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseConfigured
  ? createClient(
      process.env.SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      { auth: { persistSession: false } }
    )
  : null;

export const getSession = async (
  sessionId: string
): Promise<SessionRow | null> => {
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
};

export const ensureSession = async (sessionId: string) => {
  if (!supabase) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("sessions").upsert(
    {
      id: sessionId,
      created_at: now,
      updated_at: now
    },
    { onConflict: "id" }
  );
  if (error) {
    throw error;
  }
};

export const updateSession = async (
  sessionId: string,
  updates: Partial<
    Pick<
      SessionRow,
      "sc_user_id" | "sc_access_token" | "sc_verified" | "download_count"
    >
  >
) => {
  if (!supabase) return;
  const now = new Date().toISOString();
  const existing = await getSession(sessionId);
  if (!existing) {
    await ensureSession(sessionId);
  }
  const next = {
    sc_user_id: updates.sc_user_id ?? existing?.sc_user_id ?? null,
    sc_access_token: updates.sc_access_token ?? existing?.sc_access_token ?? null,
    sc_verified: updates.sc_verified ?? existing?.sc_verified ?? false,
    download_count: updates.download_count ?? existing?.download_count ?? 0,
    updated_at: now
  };
  const { error } = await supabase
    .from("sessions")
    .update(next)
    .eq("id", sessionId);
  if (error) {
    throw error;
  }
};
