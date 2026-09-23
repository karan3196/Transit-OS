import { PageHeader } from '@/components/PageHeader';
import { listAgents } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const agents = await listAgents();

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="An agent is a database row: a prompt, a tool allowlist, a trigger and an escalation rule."
        actions={<span className="pill">{agents.filter((a) => a.enabled).length} enabled</span>}
      />

      <div className="content">
        <div className="banner">
          <div>
            <div className="title">Adding an agent needs no code</div>
            The runtime reads <code className="mono">system_prompt_template</code>,{' '}
            <code className="mono">tool_allowlist</code>, <code className="mono">trigger</code> and{' '}
            <code className="mono">escalation_rule</code> from the <code className="mono">agents</code>{' '}
            table. Onboarding a second clinic is configuration and credentials, never a deploy.
          </div>
        </div>

        <div className="grid cols-2">
          {agents.map((agent) => (
            <section className="card" key={agent.id}>
              <div className="card-head">
                <div className="stack">
                  <h2>{agent.name}</h2>
                  <span className="small faint mono">{agent.slug}</span>
                </div>
                <span className={agent.enabled ? 'pill green' : 'pill'}>
                  {agent.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
              <div className="card-body stack" style={{ gap: 14 }}>
                <p className="small muted">{agent.description}</p>

                <div className="stack" style={{ gap: 6 }}>
                  <span className="small faint strong">Trigger</span>
                  <div className="row">
                    <span className="pill mono">{agent.trigger}</span>
                    <span className="pill mono">{agent.modelHint}</span>
                  </div>
                </div>

                <div className="stack" style={{ gap: 6 }}>
                  <span className="small faint strong">Tools</span>
                  <div className="row">
                    {agent.toolAllowlist.map((tool) => (
                      <span className="pill mono" key={tool}>
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small faint">{agent.runs7d} runs · 7 days</span>
                  <span className="small faint">{agent.escalations7d} escalations</span>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
