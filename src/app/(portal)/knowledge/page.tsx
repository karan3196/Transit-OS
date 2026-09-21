import { PageHeader } from '@/components/PageHeader';
import { listKnowledge, listServices } from '@/lib/data/queries';
import { formatPaise } from '@/lib/agents/cost';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const [knowledge, services] = await Promise.all([listKnowledge(), listServices()]);

  return (
    <>
      <PageHeader
        title="Knowledge"
        subtitle="What the agents are allowed to say. Anything not here is escalated rather than guessed."
      />

      <div className="content">
        <section className="card">
          <div className="card-head">
            <h2>Services</h2>
            <span className="hint">Prices are indicative and confirmed on examination</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Duration</th>
                <th>Indicative price</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.slug}>
                  <td className="strong">{service.name}</td>
                  <td className="nowrap muted">{service.durationMinutes} min</td>
                  <td className="nowrap">
                    {service.pricePaise === null ? (
                      <span className="faint">on examination</span>
                    ) : (
                      <>
                        {service.priceIsEstimate ? 'from ' : ''}
                        {formatPaise(service.pricePaise)}
                      </>
                    )}
                  </td>
                  <td className="small muted">{service.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Approved facts</h2>
            <span className="hint">{knowledge.length} chunks</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Source</th>
                <th>Content</th>
              </tr>
            </thead>
            <tbody>
              {knowledge.map((chunk, index) => (
                <tr key={`${chunk.source}-${index}`}>
                  <td className="strong nowrap">{chunk.title ?? '—'}</td>
                  <td>
                    <span className="pill mono">{chunk.source}</span>
                  </td>
                  <td className="small muted">{chunk.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="banner">
          <div>
            <div className="title">Clinician sign-off</div>
            No clinical or medical claim is published on a client&apos;s channels without sign-off
            from their clinician. Content Studio drafts are held in{' '}
            <code className="mono">pending_clinician_approval</code> until then.
          </div>
        </div>
      </div>
    </>
  );
}
