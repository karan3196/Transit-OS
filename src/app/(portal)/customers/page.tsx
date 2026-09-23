import { PageHeader } from '@/components/PageHeader';
import { listCustomers } from '@/lib/data/queries';
import { relativeTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const customers = await listCustomers();

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Appointment metadata only. Clinical notes, diagnoses and treatment records are never stored here."
        actions={<span className="pill">{customers.length} records</span>}
      />

      <div className="content">
        <div className="banner">
          <div>
            <div className="title">Consent, not convenience</div>
            A marketing or recall message only goes out when a <code className="mono">granted</code>{' '}
            row exists in the consent ledger for that customer and channel. Opt-outs are honoured
            within one message.
          </div>
        </div>

        <section className="card">
          <div className="card-head">
            <h2>All customers</h2>
            <span className="hint">Most recently seen first</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Tags</th>
                <th>Marketing consent</th>
                <th style={{ textAlign: 'right' }}>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="strong">{customer.fullName}</td>
                  <td className="mono faint">{customer.phone}</td>
                  <td>
                    <div className="row">
                      {customer.tags.length === 0 ? (
                        <span className="small faint">—</span>
                      ) : (
                        customer.tags.map((tag) => (
                          <span className="pill" key={tag}>
                            {tag}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={customer.consentMarketing ? 'pill green' : 'pill'}>
                      {customer.consentMarketing ? 'granted' : 'not on file'}
                    </span>
                  </td>
                  <td className="small faint nowrap" style={{ textAlign: 'right' }}>
                    {relativeTime(customer.lastSeenAt)}
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
