/**
 * WhatsApp Cloud API webhook.
 *
 * Order matters and is fixed by CLAUDE.md non-negotiable 3: the raw body is
 * read and its X-Hub-Signature-256 verified before anything is parsed. Only
 * then does the payload become JSON.
 *
 * Meta retries any non-2xx delivery, so once a payload is authenticated and
 * persisted we answer 200 even if downstream processing fails — the raw
 * envelope is in `webhook_events` with its error recorded, and replaying it is
 * cheap. Answering 500 would earn us the same message again every few minutes.
 */
import { NextResponse } from 'next/server';
import { env, requireEnv } from '@/lib/env';
import { verifySignature, verifySubscription, SIGNATURE_HEADER } from '@/lib/whatsapp/signature';
import { normaliseInbound, whatsappWebhookSchema } from '@/lib/whatsapp/schema';
import { resolveTenantByChannel } from '@/lib/tenancy';
import { handleInboundMessage } from '@/lib/ingress';
import { unsafeAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const verifyToken = env('WHATSAPP_VERIFY_TOKEN');
  if (!verifyToken) {
    return new NextResponse('Webhook not configured', { status: 503 });
  }

  const result = verifySubscription(new URL(request.url).searchParams, verifyToken);
  if (!result.ok) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return new NextResponse(result.challenge, { status: 200 });
}

export async function POST(request: Request) {
  const appSecret = env('WHATSAPP_APP_SECRET');
  if (!appSecret || !env('SUPABASE_SERVICE_ROLE_KEY')) {
    return new NextResponse('Webhook not configured', { status: 503 });
  }

  // Raw body first — the signature is over these exact bytes.
  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);

  if (!verifySignature(rawBody, signature, appSecret)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Malformed JSON', { status: 400 });
  }

  const parsed = whatsappWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    // Authenticated but not a shape we handle (a new field, another product).
    return NextResponse.json({ ok: true, ignored: 'unrecognised_payload' });
  }

  const inbound = normaliseInbound(parsed.data);
  if (inbound.length === 0) {
    return NextResponse.json({ ok: true, ignored: 'no_messages' });
  }

  const results: { id: string; status: string }[] = [];

  for (const message of inbound) {
    const tenantId = await resolveTenantByChannel('whatsapp', message.phoneNumberId);

    // Outer idempotency guard, ahead of message-level dedupe.
    const { error: eventError } = await unsafeAdminClient().from('webhook_events').insert({
      tenant_id: tenantId,
      provider: 'whatsapp',
      external_id: message.providerMessageId,
      payload: parsed.data,
    });

    if (eventError?.code === '23505') {
      results.push({ id: message.providerMessageId, status: 'duplicate' });
      continue;
    }

    if (!tenantId) {
      // A number we do not serve. Recorded above for diagnosis, then dropped.
      results.push({ id: message.providerMessageId, status: 'unknown_tenant' });
      continue;
    }

    try {
      const result = await handleInboundMessage(tenantId, {
        channel: 'whatsapp',
        provider: 'whatsapp',
        providerMessageId: message.providerMessageId,
        fromE164: message.fromE164,
        profileName: message.profileName,
        text: message.text,
        receivedAt: message.receivedAt,
        replyAddress: message.phoneNumberId,
      });

      await markProcessed(message.providerMessageId, null);
      results.push({ id: message.providerMessageId, status: result.status });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      await markProcessed(message.providerMessageId, reason);
      results.push({ id: message.providerMessageId, status: 'failed' });
    }
  }

  return NextResponse.json({ ok: true, results });
}

async function markProcessed(externalId: string, error: string | null) {
  await unsafeAdminClient()
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString(), error })
    .eq('provider', 'whatsapp')
    .eq('external_id', externalId);
}
