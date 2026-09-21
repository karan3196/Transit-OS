import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { getConversation } from '@/lib/data/queries';
import { formatDateTime } from '@/lib/format';
import { isServiceWindowOpen } from '@/lib/whatsapp/client';

export const dynamic = 'force-dynamic';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const thread = await getConversation(id);
  if (!thread) notFound();

  const windowOpen = isServiceWindowOpen(thread.lastInboundAt);

  return (
    <>
      <PageHeader
        title={thread.customerName}
        subtitle={`${thread.phone} · ${thread.channel}`}
        actions={
          <>
            <span className={windowOpen ? 'pill green' : 'pill amber'}>
              {windowOpen ? 'Service window open' : 'Service window closed'}
            </span>
            <Link className="btn" href="/inbox">
              Back to inbox
            </Link>
          </>
        }
      />

      <div className="content">
        {thread.escalationReason ? (
          <div className="banner amber">
            <div>
              <div className="title">Handed to your team</div>
              {thread.escalationReason}. The agent stopped replying on this thread.
            </div>
          </div>
        ) : null}

        {!windowOpen ? (
          <div className="banner">
            <div>
              <div className="title">Free replies have expired on this thread</div>
              More than 24 hours have passed since the customer&apos;s last message. A reply now needs
              an approved template and is billed by Meta, so the agent will not send one on its own.
            </div>
          </div>
        ) : null}

        <section className="card">
          <div className="card-head">
            <h2>Transcript</h2>
            <span className="hint">{thread.messages.length} messages</span>
          </div>
          <div className="thread">
            {thread.messages.map((message) => (
              <div
                key={message.id}
                className={`bubble ${message.direction === 'outbound' ? 'outbound' : ''} ${
                  message.sender === 'system' ? 'system' : ''
                }`}
              >
                {message.body}
                <div className="meta">
                  {message.sender} · {formatDateTime(message.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
