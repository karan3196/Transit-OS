import { PageHeader } from '@/components/PageHeader';
import { getActiveTenant } from '@/lib/data/queries';
import { demoBusiness, demoHours } from '@/lib/data/fixtures';
import { env, isDemoMode } from '@/lib/env';
import { summariseHours, type OpeningHours } from '@/lib/bookings/slots';

export const dynamic = 'force-dynamic';

const BRAND_TOKENS: [string, string][] = [
  ['Deep green (ink)', '#14442B'],
  ['Brand green', '#2E7D4F'],
  ['Sage background', '#EDF2E6'],
  ['Cream', '#FAF7EF'],
  ['Warm accent', '#D08C2E'],
  ['Body text on light', '#3C5344'],
];

export default async function SettingsPage() {
  const tenant = await getActiveTenant();

  const configured = {
    Supabase: Boolean(env('NEXT_PUBLIC_SUPABASE_URL') && env('NEXT_PUBLIC_SUPABASE_ANON_KEY')),
    'Service role': Boolean(env('SUPABASE_SERVICE_ROLE_KEY')),
    'Anthropic API': Boolean(env('ANTHROPIC_API_KEY')),
    'WhatsApp webhook': Boolean(env('WHATSAPP_APP_SECRET') && env('WHATSAPP_VERIFY_TOKEN')),
    'WhatsApp send': Boolean(env('WHATSAPP_ACCESS_TOKEN')),
    'Secret encryption key': Boolean(env('TENANT_SECRET_KEY')),
    'Cron secret': Boolean(env('CRON_SECRET')),
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={`${tenant?.name ?? 'Tenant'} · ${tenant?.slug ?? ''}`}
        actions={isDemoMode() ? <span className="pill amber">Demo mode</span> : <span className="pill green">Live</span>}
      />

      <div className="content">
        <div className="grid cols-2">
          <section className="card">
            <div className="card-head">
              <h2>Business</h2>
            </div>
            <table>
              <tbody>
                <tr>
                  <td className="faint small nowrap">Name</td>
                  <td className="strong">{demoBusiness.name}</td>
                </tr>
                <tr>
                  <td className="faint small nowrap">Clinician</td>
                  <td>{demoBusiness.leadClinician}</td>
                </tr>
                <tr>
                  <td className="faint small nowrap">Address</td>
                  <td>{demoBusiness.address}</td>
                </tr>
                <tr>
                  <td className="faint small nowrap">WhatsApp</td>
                  <td className="mono">{demoBusiness.whatsapp}</td>
                </tr>
                <tr>
                  <td className="faint small nowrap">Hours</td>
                  <td>{summariseHours(demoHours as OpeningHours)}</td>
                </tr>
                <tr>
                  <td className="faint small nowrap">Timezone</td>
                  <td className="mono">{tenant?.timezone ?? 'Asia/Kolkata'}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Configuration status</h2>
              <span className="hint">Presence only — values are never read into the UI</span>
            </div>
            <table>
              <tbody>
                {Object.entries(configured).map(([label, ok]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={ok ? 'pill green' : 'pill amber'}>
                        {ok ? 'configured' : 'not set'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Brand kit</h2>
            <span className="hint">Derived from Instagram — not yet confirmed by the clinic</span>
          </div>
          <div className="card-body">
            <div className="grid cols-3">
              {BRAND_TOKENS.map(([label, hex]) => (
                <div className="row" key={hex}>
                  <span
                    aria-hidden
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: hex,
                      border: '1px solid var(--border-strong)',
                      flex: 'none',
                    }}
                  />
                  <span className="stack">
                    <span className="small strong">{label}</span>
                    <span className="mono faint">{hex}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="small faint" style={{ marginTop: 16 }}>
              Typography: Plus Jakarta Sans 400/600/800 for headings and body, Caveat for short
              handwritten accents only. Replace these values with the clinic&apos;s official logo
              files and hex codes once received.
            </p>
          </div>
        </section>

        <div className="banner amber">
          <div>
            <div className="title">Open items that touch this page</div>
            The brand kit is unconfirmed, and moving the clinic&apos;s existing WhatsApp number to the
            Cloud API may affect its use in the WhatsApp Business app. Confirm Meta&apos;s current
            coexistence support, or use a new number for the pilot.
          </div>
        </div>
      </div>
    </>
  );
}
