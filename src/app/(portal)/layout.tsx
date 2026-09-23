import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { getMemberships, getSessionUser } from '@/lib/auth';
import { listConversations } from '@/lib/data/queries';
import { isDemoMode } from '@/lib/env';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  // Live mode with no session: the portal has nothing it is allowed to read.
  if (!user) redirect('/login');

  const memberships = await getMemberships();

  // Signed in, but not a member of any business yet. This is what a brand-new
  // account sees before onboarding links it to a tenant.
  if (memberships.length === 0) {
    return (
      <main className="authpage">
        <div className="card authcard">
          <div className="stack" style={{ gap: 6 }}>
            <h1 style={{ fontSize: 20 }}>No business linked to this account</h1>
            <p className="small muted">
              You are signed in as <strong>{user.email}</strong>, but this account is not a member
              of any tenant yet.
            </p>
          </div>

          <div className="banner">
            <div>
              <div className="title">Link it from the command line</div>
              <p className="small" style={{ marginBottom: 8 }}>
                Provision the business and attach this account as its owner:
              </p>
              <code className="mono">npm run onboard -- alcadent --owner {user.email}</code>
            </div>
          </div>

          <Link className="btn" href="/login">
            Sign in as someone else
          </Link>
        </div>
      </main>
    );
  }

  const conversations = await listConversations();
  const needsHuman = conversations.filter((c) => c.status === 'needs_human').length;

  return (
    <div className="shell">
      <Nav
        needsHuman={needsHuman}
        email={user.email}
        tenantName={memberships[0]!.name}
        role={memberships[0]!.role}
        demo={isDemoMode()}
      />
      <div className="main">{children}</div>
    </div>
  );
}
