import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { listConversations } from '@/lib/data/queries';
import { relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_PILL: Record<string, string> = {
  needs_human: 'pill red',
  open: 'pill green',
  snoozed: 'pill amber',
  closed: 'pill',
};

export default async function InboxPage() {
  const conversations = await listConversations();
  const escalated = conversations.filter((c) => c.status === 'needs_human');
  const rest = conversations.filter((c) => c.status !== 'needs_human');

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Every conversation the agents are handling, and everything they handed over."
        actions={<span className="pill">{conversations.length} threads</span>}
      />

      <div className="content">
        {escalated.length > 0 ? (
          <div className="banner amber">
            <div>
              <div className="title">
                {escalated.length} conversation{escalated.length === 1 ? '' : 's'} waiting on a human
              </div>
              Agents escalate anything clinical, urgent or unhappy. No customer is left with a bot.
            </div>
          </div>
        ) : null}

        <section className="card">
          <div className="card-head">
            <h2>Conversations</h2>
            <span className="hint">Newest first</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Last message</th>
                <th>Channel</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {[...escalated, ...rest].map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/inbox/${item.id}`} className="stack">
                      <span className="strong">{item.customerName}</span>
                      <span className="small faint mono">{item.phone}</span>
                    </Link>
                  </td>
                  <td className="small muted" style={{ maxWidth: 380 }}>
                    {item.preview}
                    {item.escalationReason ? (
                      <div className="small faint" style={{ marginTop: 4 }}>
                        {item.escalationReason}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className="pill mono">{item.channel}</span>
                  </td>
                  <td>
                    <span className={STATUS_PILL[item.status] ?? 'pill'}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="small faint nowrap" style={{ textAlign: 'right' }}>
                    {relativeTime(item.lastMessageAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
