'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createUserClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/env';

export interface AuthState {
  error?: string;
  notice?: string;
}

const credentials = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Passwords are at least 8 characters.'),
});

const emailOnly = z.object({ email: z.string().email('Enter a valid email address.') });

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (isDemoMode()) {
    return { error: 'Demo mode has no accounts. Configure Supabase to sign in.' };
  }

  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  // Deliberately vague: distinguishing "no such account" from "wrong password"
  // tells an attacker which emails are registered.
  if (error) return { error: 'That email and password did not match.' };

  redirect('/dashboard');
}

export async function sendMagicLink(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (isDemoMode()) {
    return { error: 'Demo mode has no accounts. Configure Supabase to sign in.' };
  }

  const parsed = emailOnly.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid email address.' };
  }

  const origin = (await headers()).get('origin') ?? 'http://localhost:3000';
  const supabase = await createUserClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { error: 'Could not send the link. Try again in a moment.' };

  // Same message whether or not the address exists.
  return { notice: 'If that address has an account, a sign-in link is on its way.' };
}

export async function signOut(): Promise<void> {
  if (!isDemoMode()) {
    const supabase = await createUserClient();
    await supabase.auth.signOut();
  }
  redirect('/login');
}
