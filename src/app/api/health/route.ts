import { NextResponse } from 'next/server';
import { env, isDemoMode } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Configuration readiness, without ever echoing a secret's value. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: isDemoMode() ? 'demo' : 'live',
    configured: {
      supabase: Boolean(env('NEXT_PUBLIC_SUPABASE_URL') && env('NEXT_PUBLIC_SUPABASE_ANON_KEY')),
      serviceRole: Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),
      anthropic: Boolean(env('ANTHROPIC_API_KEY')),
      whatsappWebhook: Boolean(env('WHATSAPP_APP_SECRET') && env('WHATSAPP_VERIFY_TOKEN')),
      whatsappSend: Boolean(env('WHATSAPP_ACCESS_TOKEN')),
      tenantSecretKey: Boolean(env('TENANT_SECRET_KEY')),
    },
  });
}
