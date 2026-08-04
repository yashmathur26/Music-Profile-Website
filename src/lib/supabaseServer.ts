import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for this app. The custom fetch pins
 * cache:"no-store" because Next.js patches global fetch and serves
 * supabase-js READS (plain GETs) from its data cache — writes land in the
 * database while every subsequent render keeps showing the value from before
 * the first write. Verified in production: PUT saved, GET stayed stale.
 */
export const createServerSupabase = () =>
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: { persistSession: false },
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              fetch(input, { ...init, cache: "no-store" })
          }
        }
      )
    : null;
