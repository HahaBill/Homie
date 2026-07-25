import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role client for route handlers. These routes are a trusted
 * backend — the same posture as worker/src/supabase.ts — so they bypass RLS
 * deliberately. The key must never be exposed with a NEXT_PUBLIC_ prefix.
 */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Insert-only audit trail (PRD §8). Failures are logged, never fatal. */
export async function audit(
  event: string,
  userId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("audit_log")
    .insert({ user_id: userId, event, payload });
  if (error) console.error(`audit(${event}): ${error.message}`);
}
