import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client
 * Uses SUPABASE_SERVICE_ROLE_KEY (server-only, never expose to browser)
 */
export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "SUPABASE_URL is not defined. Configure it in Vercel environment variables.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not defined. Configure it in Vercel environment variables.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
