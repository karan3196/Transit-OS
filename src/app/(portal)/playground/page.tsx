import { PageHeader } from '@/components/PageHeader';
import { Playground } from '@/components/Playground';
import { env, isDemoMode } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default function PlaygroundPage() {
  const hasModel = Boolean(env('ANTHROPIC_API_KEY'));

  return (
    <>
      <PageHeader
        title="Playground"
        subtitle="Talk to the front desk agent the way a customer would."
        actions={
          hasModel ? (
            <span className="pill green">Model connected</span>
          ) : (
            <span className="pill amber">Offline fallback</span>
          )
        }
      />

      <div className="content">
        {!hasModel ? (
          <div className="banner amber">
            <div>
              <div className="title">No ANTHROPIC_API_KEY set</div>
              The runtime is answering from the knowledge base with a deterministic fallback, so the
              ingress path, guardrails, escalation and metering are all exercised without any spend.
              Add the key to <code className="mono">.env.local</code> for real model replies.
            </div>
          </div>
        ) : null}

        <Playground />

        <div className="banner">
          <div>
            <div className="title">What you are seeing</div>
            Inbound text is screened before the model runs — anything clinical, urgent or unhappy
            goes straight to the staff inbox. The reply is screened again on the way out: a draft
            that quotes a firm price, promises an outcome, or gives advice is blocked and handed
            over instead of sent.
            {isDemoMode() ? ' In demo mode nothing is written to a database.' : ''}
          </div>
        </div>
      </div>
    </>
  );
}
