'use client';

import { createBrowserClient } from '@supabase/ssr';
import { requireEnv } from '@/lib/env';

export function createClientComponentClient() {
  return createBrowserClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
}
