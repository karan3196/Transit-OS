import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Stat } from '@/components/Stat';
import { formatDay, formatTime, relativeTime } from '@/lib/format';
import { formatPaise } from '@/lib/agents/cost';
import {
  getActiveTenant,
  getDashboardSummary,
  listBookings,
  listConversations,
} from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [tenant, summary, conversations, bookings] = await Promise.all([
    getActiveTenant(),
    getDashboardSummary(),
    listConversations(),
    listBookings(),
  ]);

  const needsHuman = conversations.filter((c) => c.status === 'needs_human');
  const upcoming = bookings
    .filter((b) => b.startsAt > new Date() && b.status !== 'cancelled')
    .slice(0, 5);

  const usedPct = Math.min(
    100,
    Math.round((summary.conversations30d / Math.max(summary.planLimit, 1)) * 100),
  );

  return (
    <>
      <PageHeader
        title={tenant?.name ?? 'Dashboard'}
        subtitle={`${tenant?.plan ?? 'starter'} plan · ${tenant?.timezone ?? 'Asia/Kolkata'}`}
        actions={
          tenant?.demo ? <span className="pill amber">Demo data</span> : <span className="pill green">Live</span>
        }
      />

      <div className="content">
        <div className="grid cols-4">
          <Stat
            label="Needs a human"
            value={summary.needsHuman}
            foot="Escalated conversations"
            alert={summary.needsHuman > 0}
          />
          <Stat label="Open conversations" value={summary.openConversations} foot="Across all channels" />
          <Stat label="Upcoming bookings" value={summary.upcomingBookings} foot="Next 7 days" />
          <Stat
            label="AI cost, 14 days"
            value={formatPaise(summary.cost30dPaise)}
            foot={`${summary.conversations30d} conversations`}
          />
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Plan usage</h2>
            <span className="hint">
              {summary.conversations30d} of {summary.planLimit} conversations
            </span>
          </div>
          <div className="card-body">
            <div
              style={{
                height: 10,
                borderRadius: 999,
                background: 'var(--surface-sunken)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${usedPct}%`,
                  height: '100%',
                  background: usedPct > 85 ? 'var(--warning)' : 'var(--brand)',
                }}
              />
            </div>
            <p className="small faint" style={{ marginTop: 10 }}>
              Conversations beyond the plan allowance are metered. Voice is Pro-only and capped per
              tenant.
            </p>
          </div>
        </section>

        <div className="grid cols-2">
          <section className="card">
            <div className="card-head">
              <h2>Waiting on your team</h2>
              <Link className="hint" href="/inbox">
                Open inbox →
              </Link>
            </div>
            {needsHuman.length === 0 ? (
              <div className="card-body small muted">
                Nothing escalated. Every conversation is being handled by an agent.
              </div>
            ) : (
              <table>
                <tbody>
                  {needsHuman.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/inbox/${item.id}`} className="stack">
                          <span className="strong">{item.customerName}</span>
                          <span className="small muted">{item.preview}</span>
                          <span className="small faint">{item.escalationReason}</span>
                        </Link>
                      </td>
                      <td className="nowrap small faint" style={{ textAlign: 'right' }}>
                        {relativeTime(item.lastMessageAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Next appointments</h2>
              <Link className="hint" href="/bookings">
                All bookings →
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="card-body small muted">No upcoming appointments.</div>
            ) : (
              <table>
                <tbody>
                  {upcoming.map((booking) => (
                    <tr key={booking.id}>
                      <td>
                        <div className="stack">
                          <span className="strong">{booking.customerName}</span>
                          <span className="small muted">
                            {booking.serviceName} · {booking.resourceName}
                          </span>
                        </div>
                      </td>
                      <td className="nowrap small" style={{ textAlign: 'right' }}>
                        <div className="stack">
                          <span>{formatDay(booking.startsAt)}</span>
                          <span className="faint">{formatTime(booking.startsAt)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
