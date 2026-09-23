/**
 * Environment access.
 *
 * Nothing here throws at import time: the portal is meant to boot with an empty
 * .env so a new developer can look around before wiring Supabase and Meta.
 * Features that genuinely need a secret call `requireEnv` at the point of use
 * and fail loudly there instead.
 */

export type EnvKey =
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'WHATSAPP_APP_SECRET'
  | 'WHATSAPP_VERIFY_TOKEN'
  | 'WHATSAPP_ACCESS_TOKEN'
  | 'TENANT_SECRET_KEY'
  | 'CRON_SECRET';

export function env(key: EnvKey): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

export function requireEnv(key: EnvKey): string {
  const value = env(key);
  if (!value) {
    throw new Error(
      `Missing required environment variable ${key}. See .env.example.`,
    );
  }
  return value;
}

/**
 * Demo mode keeps the portal clickable without any infrastructure. It is on
 * whenever Supabase is not configured, and can be forced on for a walkthrough.
 * It is never on when a service-role key is present.
 */
export function isDemoMode(): boolean {
  if (env('SUPABASE_SERVICE_ROLE_KEY')) return false;
  if (process.env.KARYALAYA_DEMO === '1') return true;
  return !env('NEXT_PUBLIC_SUPABASE_URL') || !env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const DEMO_TENANT_ID = '11111111-1111-4111-8111-111111111111';
