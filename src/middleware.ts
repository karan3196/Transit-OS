/**
 * Refreshes the Supabase session cookie on every request.
 *
 * Server Components cannot write cookies, so without this the access token
 * expires mid-session and the portal starts rendering as signed-out. The
 * middleware is the one place allowed to rotate it.
 *
 * In demo mode there is no Supabase project to talk to, so this is a no-op and
 * the portal keeps working on fixtures.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env, isDemoMode } from '@/lib/env';

export async function middleware(request: NextRequest) {
  if (isDemoMode()) return NextResponse.next();

  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touching the user is what triggers the refresh. Do not remove.
  // A transient Supabase outage must not take the whole portal down with a
  // 500 on every route, so a failed refresh just leaves the cookie alone and
  // the page below decides what an absent session means.
  try {
    await supabase.auth.getUser();
  } catch {
    return NextResponse.next({ request });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the webhook, which authenticates
     * itself with an HMAC and must not pay for a session round-trip.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)',
  ],
};
