import { PageHeader } from '@/components/PageHeader';
import { listBookings } from '@/lib/data/queries';
import { formatDay, formatTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_PILL: Record<string, string> = {
  confirmed: 'pill green',
  pending: 'pill amber',
  completed: 'pill',
  cancelled: 'pill red',
  no_show: 'pill red',
};

export default async function BookingsPage() {
  const bookings = await listBookings();

  const byDay = new Map<string, typeof bookings>();
  for (const booking of bookings) {
    const key = formatDay(booking.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), booking]);
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Agent-made and staff-made appointments. Overlaps are rejected by the database, not by the app."
        actions={<span className="pill">{bookings.length} scheduled</span>}
      />

      <div className="content">
        {byDay.size === 0 ? (
          <div className="card">
            <div className="card-body small muted">No appointments in the window.</div>
          </div>
        ) : (
          [...byDay.entries()].map(([day, items]) => (
            <section className="card" key={day}>
              <div className="card-head">
                <h2>{day}</h2>
                <span className="hint">{items.length} appointments</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Customer</th>
                    <th>Service</th>
                    <th>Chair</th>
                    <th>Booked by</th>
                    <th style={{ textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((booking) => (
                    <tr key={booking.id}>
                      <td className="nowrap strong">
                        {formatTime(booking.startsAt)}
                        <div className="small faint">{formatTime(booking.endsAt)}</div>
                      </td>
                      <td className="strong">{booking.customerName}</td>
                      <td className="muted">{booking.serviceName}</td>
                      <td className="muted small">{booking.resourceName}</td>
                      <td>
                        <span className="pill mono">{booking.source}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={STATUS_PILL[booking.status] ?? 'pill'}>
                          {booking.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}
      </div>
    </>
  );
}
