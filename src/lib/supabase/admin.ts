/**
 * Service-role client. Bypasses RLS, so it is never exported directly —
 * `withTenantScope` in src/lib/tenancy.ts is the only sanctioned entry point.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

let cached: SupabaseClient | null = null;

/** @internal use `withTenantScope` instead. */
export function unsafeAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cached;
}
