/**
 * Exchanges a magic-link or OAuth code for a session cookie.
 */
import { NextResponse } from 'next/server';
import { createUserClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/dashboard';

  if (isDemoMode() || !code) {
    return NextResponse.redirect(new URL('/login?error=link', url.origin));
  }

  const supabase = await createUserClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?error=link', url.origin));
  }

  // Only ever redirect within this app.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  return NextResponse.redirect(new URL(target, url.origin));
}
