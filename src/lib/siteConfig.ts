import { createServerSupabase } from "@/lib/supabaseServer";
import { DEFAULT_SITE_CONFIG, SiteConfig } from "@/lib/siteContent";

/**
 * Server-side load/save for the home page content the artist edits from the
 * admin mockup. Stored as one jsonb row in site_config; the defaults in
 * siteContent.ts are both the fallback (missing table, DB outage) and the
 * pre-edit content.
 */
export type { SiteConfig } from "@/lib/siteContent";
export { DEFAULT_SITE_CONFIG, nowPlayingEmbedUrl } from "@/lib/siteContent";

const TABLE = "site_config";
const ROW_KEY = "home";

const supabase = createServerSupabase();

let warnedMissingTable = false;

const warnOnce = (error: unknown) => {
  const missing =
    (error as { code?: string })?.code === "42P01" ||
    /relation .* does not exist/i.test((error as Error)?.message || "");
  if (missing && !warnedMissingTable) {
    warnedMissingTable = true;
    console.warn(
      `[site] "${TABLE}" table missing — run the SQL in docs/ADMIN_TRACKS_SETUP.md. ` +
        "Serving the hard-coded home page content."
    );
  }
};

/** Deep-merge the stored partial over the defaults so new fields added in
 * code never come back undefined for configs saved before they existed. */
const withDefaults = (stored: Partial<SiteConfig> | null): SiteConfig => ({
  ...DEFAULT_SITE_CONFIG,
  ...(stored || {}),
  socials: {
    ...DEFAULT_SITE_CONFIG.socials,
    ...(stored?.socials || {})
  }
});

export const getSiteConfig = async (): Promise<SiteConfig> => {
  if (!supabase) return DEFAULT_SITE_CONFIG;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("value")
      .eq("key", ROW_KEY)
      .maybeSingle();
    if (error) {
      warnOnce(error);
      return DEFAULT_SITE_CONFIG;
    }
    return withDefaults((data?.value as Partial<SiteConfig>) || null);
  } catch (error) {
    warnOnce(error);
    return DEFAULT_SITE_CONFIG;
  }
};

export const saveSiteConfig = async (patch: Partial<SiteConfig>) => {
  if (!supabase) {
    throw new Error("Supabase is not configured on the server.");
  }
  const current = await getSiteConfig();
  const next = withDefaults({
    ...current,
    ...patch,
    socials: { ...current.socials, ...(patch.socials || {}) }
  });
  const { error } = await supabase.from(TABLE).upsert(
    { key: ROW_KEY, value: next, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) {
    warnOnce(error);
    throw new Error(
      /relation .* does not exist/i.test(error.message)
        ? 'The "site_config" table doesn’t exist yet — run the SQL in docs/ADMIN_TRACKS_SETUP.md.'
        : error.message
    );
  }
  return next;
};
