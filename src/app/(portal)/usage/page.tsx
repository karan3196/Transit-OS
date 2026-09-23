import { PageHeader } from '@/components/PageHeader';
import { Stat } from '@/components/Stat';
import { getUsageSeries } from '@/lib/data/queries';
import { formatPaise, MODEL_PRICING, USD_TO_INR } from '@/lib/agents/cost';

export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  const series = await getUsageSeries();
  const totalConversations = series.reduce((acc, day) => acc + day.conversations, 0);
  const totalCost = series.reduce((acc, day) => acc + day.costPaise, 0);
  const peak = Math.max(1, ...series.map((day) => day.costPaise));
  const perConversation = totalConversations > 0 ? Math.round(totalCost / totalConversations) : 0;

  // Growth is ₹6,999/month; the margin rule says variable cost stays under ~₹2,000.
  const projectedMonthly = Math.round((totalCost / Math.max(series.length, 1)) * 30);

  return (
    <>
      <PageHeader
        title="Usage & cost"
        subtitle="Every agent run logs tokens, model, latency and an estimated rupee cost against the tenant."
      />

      <div className="content">
        <div className="grid cols-4">
          <Stat label="Conversations" value={totalConversations} foot={`Last ${series.length} days`} />
          <Stat label="Estimated cost" value={formatPaise(totalCost)} foot="Model spend only" />
          <Stat label="Per conversation" value={formatPaise(perConversation)} foot="Blended average" />
          <Stat
            label="Projected / month"
            value={formatPaise(projectedMonthly)}
            foot="Ceiling ₹2,000 on Growth"
            alert={projectedMonthly > 200_000}
          />
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Daily model spend</h2>
            <span className="hint">Estimated, in rupees</span>
          </div>
          <div className="card-body">
            <div className="bars">
              {series.map((day) => (
                <div className="bar" key={day.date} title={`${day.date}: ${formatPaise(day.costPaise)}`}>
                  <div className="fill" style={{ height: `${(day.costPaise / peak) * 100}%` }} />
                  <div className="tick">{day.date.slice(8)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Model routing</h2>
            <span className="hint">Cheapest capable model by default; escalate on complexity</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Input / M tokens</th>
                <th>Output / M tokens</th>
                <th>Cache read / M</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(MODEL_PRICING).map(([model, pricing]) => (
                <tr key={model}>
                  <td className="mono">{model}</td>
                  <td>{formatPaise(pricing.inputPerMillion * USD_TO_INR * 100)}</td>
                  <td>{formatPaise(pricing.outputPerMillion * USD_TO_INR * 100)}</td>
                  <td>{formatPaise(pricing.cacheReadPerMillion * USD_TO_INR * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-body small faint">
            Tenant system prompts and knowledge chunks are cached, so repeat turns in a thread read
            most of their input at the cache rate. Estimates convert at ₹{USD_TO_INR}/USD and are
            for cost control, not invoicing.
          </div>
        </section>
      </div>
    </>
  );
}
