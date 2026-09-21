import Link from 'next/link';
import { isDemoMode } from '@/lib/env';

const PLANS = [
  {
    name: 'Starter',
    price: '₹2,999',
    channels: 'WhatsApp · web chat widget',
    features: [
      'Front desk agent, 24/7',
      'Appointment booking',
      'Review requests and Google profile basics',
      '500 AI conversations / month',
    ],
  },
  {
    name: 'Growth',
    price: '₹6,999',
    channels: '+ Instagram DM',
    featured: true,
    features: [
      'Everything in Starter',
      'Recall agent for check-ups and pending sittings',
      'Catalogue and UPI checkout',
      'CRM and weekly insights',
      '2,000 AI conversations / month',
    ],
  },
  {
    name: 'Pro',
    price: '₹14,999',
    channels: '+ Voice',
    features: [
      'Everything in Growth',
      'Voice agent, 300 minutes',
      'Quotes, B2B reorders, inventory',
      'Multi-location',
    ],
  },
];

export default function LandingPage() {
  const demo = isDemoMode();

  return (
    <main className="landing">
      <section className="hero">
        <p className="eyebrow">Karyalaya</p>
        <h1>The front desk that never closes.</h1>
        <p className="lede">
          A suite of AI agents for small offline businesses — dental clinics, restaurants, workshops
          and manufacturers. They answer WhatsApp enquiries in Hindi and English, book appointments,
          chase recalls and hand anything clinical or unhappy straight to your team.
        </p>
        <div className="row" style={{ marginTop: 26 }}>
          <Link className="btn primary" href="/dashboard">
            Open the portal
          </Link>
          <Link className="btn" href="/playground">
            Try the front desk agent
          </Link>
        </div>
        {demo ? (
          <div className="banner amber" style={{ marginTop: 24 }}>
            <div>
              <div className="title">Demo mode</div>
              Supabase is not configured, so the portal is running on the seeded Alcadent fixtures.
              Everything is clickable; nothing is written anywhere. Add the keys in{' '}
              <code className="mono">.env.local</code> to switch to the live database.
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <h2 style={{ fontSize: 20, marginBottom: 14 }}>What ships in Tier 1</h2>
        <div className="grid cols-3">
          {[
            {
              title: 'WhatsApp Front Desk',
              body: 'Answers timings, prices, directions and availability around the clock, in whichever language the customer writes in. Books straight into the calendar.',
            },
            {
              title: 'Recall Agent',
              body: 'Finds six-month check-ups and pending treatment sittings that are due, checks consent, and sends one short, non-pushy reminder.',
            },
            {
              title: 'Content Studio',
              body: 'Drafts weekly carousels, reel scripts and story frames in the brand kit — held for the clinician to approve before anything is published.',
            },
          ].map((item) => (
            <article className="card" key={item.title}>
              <div className="card-body stack" style={{ gap: 8 }}>
                <h3 style={{ fontSize: 15 }}>{item.title}</h3>
                <p className="small muted">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 20, marginBottom: 14 }}>Pricing</h2>
        <div className="grid cols-3">
          {PLANS.map((plan) => (
            <article className={`card plan${plan.featured ? ' featured' : ''}`} key={plan.name}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: 15 }}>{plan.name}</h3>
                {plan.featured ? <span className="pill green">Most popular</span> : null}
              </div>
              <div className="price">
                {plan.price} <span>/ month</span>
              </div>
              <p className="small faint">{plan.channels}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="small faint" style={{ marginTop: 12 }}>
          Setup fee ₹4,999–14,999, waived on annual plans. Voice minutes and paid WhatsApp template
          messages are metered per tenant.
        </p>
      </section>
    </main>
  );
}
