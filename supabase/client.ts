import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** True when `.env.local` defines both Vite vars (restart `npm run dev` after editing env). */
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return typeof url === "string" && url.length > 0 && typeof key === "string" && key.length > 0;
}

/**
 * Shared browser client (anon key). Call only after checking `isSupabaseConfigured()` or be
 * prepared for this to throw if env is missing.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and restart Vite.",
    );
  }
  cached = createClient(url, anonKey);
  return cached;
}
