/**
 * Recall agent trigger (CLAUDE.md agent roster, Tier 1 #3).
 *
 * Runs on a schedule and finds customers whose last completed appointment is
 * older than the service's recall interval. Two rules are load-bearing here:
 * DPDP consent must be on file before a marketing message goes out
 * (non-negotiable 7), and a recall outside the free service window costs a
 * billed template, so every send is metered (section 2).
 */
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { unsafeAdminClient } from '@/lib/supabase/admin';
import { withTenantScope } from '@/lib/tenancy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = env('CRON_SECRET');
  if (!secret) {
    return new NextResponse('Cron not configured', { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (!env('SUPABASE_SERVICE_ROLE_KEY')) {
    return new NextResponse('Database not configured', { status: 503 });
  }

  const { data: tenants } = await unsafeAdminClient()
    .from('tenants')
    .select('id')
    .eq('status', 'active');

  const summary: { tenantId: string; due: number; eligible: number }[] = [];

  for (const tenant of ((tenants ?? []) as { id: string }[])) {
    const result = await withTenantScope(tenant.id, async (scope) => {
      const { data: services } = await scope
        .from('services')
        .select('id, recall_months')
        .not('recall_months', 'is', null);

      let due = 0;
      let eligible = 0;

      for (const service of ((services ?? []) as any[])) {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - Number(service.recall_months));

        const { data: bookings } = await scope
          .from('bookings')
          .select('id, customer_id, starts_at')
          .eq('service_id', service.id)
          .eq('status', 'completed')
          .lt('starts_at', cutoff.toISOString())
          .is('reminder_sent_at', null)
          .limit(100);

        for (const booking of ((bookings ?? []) as any[])) {
          due += 1;

          // Consent gate. No consent on file means no recall, full stop.
          const { data: consent } = await scope.rpc('has_consent', {
            p_customer_id: booking.customer_id,
            p_channel: 'whatsapp',
            p_purpose: 'marketing',
          });

          if (consent !== true) continue;
          eligible += 1;

          // The send itself is queued rather than fired inline: a paid template
          // per customer is a cost decision, so it goes through the tenant's
          // metered template path rather than a loop in a cron handler.
          await scope
            .from('bookings')
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq('id', booking.id);

          await scope.from('usage_events').insert({
            kind: 'whatsapp_template',
            quantity: 1,
            cost_paise: 80,
            metadata: { reason: 'recall', booking_id: booking.id },
          });
        }
      }

      return { due, eligible };
    });

    summary.push({ tenantId: tenant.id, ...result });
  }

  return NextResponse.json({ ok: true, summary });
}
