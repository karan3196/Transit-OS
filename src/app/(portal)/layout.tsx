import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { getActiveTenant, listConversations } from '@/lib/data/queries';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getActiveTenant();
  const conversations = tenant ? await listConversations() : [];
  const needsHuman = conversations.filter((c) => c.status === 'needs_human').length;

  if (!tenant) {
    return (
      <main className="landing">
        <div className="card">
          <div className="card-body stack" style={{ gap: 12 }}>
            <h1 style={{ fontSize: 20 }}>Sign in required</h1>
            <p className="muted small">
              Supabase is configured but there is no signed-in user, or the signed-in user is not a
              member of any tenant. Create a row in <code className="mono">public.users</code> linking
              an <code className="mono">auth.users</code> id to a tenant, then reload.
            </p>
            <div className="row">
              <Link className="btn" href="/">
                Back to overview
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="shell">
      <Nav needsHuman={needsHuman} />
      <div className="main">{children}</div>
    </div>
  );
}
