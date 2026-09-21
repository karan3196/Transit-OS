import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { getSessionUser } from '@/lib/auth';
import { isDemoMode } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (!isDemoMode() && (await getSessionUser())) {
    redirect('/dashboard');
  }

  return (
    <main className="authpage">
      <div className="card authcard">
        <Link href="/" className="brandmark" style={{ padding: 0 }}>
          <span className="glyph" aria-hidden>
            क
          </span>
          <span className="stack">
            <span className="wordmark">Karyalaya</span>
            <span className="sub">Agent portal</span>
          </span>
        </Link>

        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 21 }}>Sign in</h1>
          <p className="small muted">
            For clinic owners and staff. Your account is linked to one or more businesses.
          </p>
        </div>

        {isDemoMode() ? (
          <div className="banner amber">
            <div>
              <div className="title">Demo mode — no sign-in needed</div>
              Supabase is not configured, so the portal is open on the seeded Alcadent fixtures.{' '}
              <Link href="/dashboard" style={{ textDecoration: 'underline' }}>
                Open the dashboard
              </Link>
              .
            </div>
          </div>
        ) : (
          <LoginForm linkExpired={error === 'link'} />
        )}
      </div>
    </main>
  );
}
