/**
 * Outbound WhatsApp Cloud API calls.
 *
 * Two send paths with very different economics: a free-form reply is free
 * inside the 24h customer service window, a template send is billed. The
 * runtime prefers the former and meters the latter (CLAUDE.md section 2).
 */
import { env } from '@/lib/env';

const GRAPH_VERSION = 'v21.0';

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** True when the message was not actually dispatched (no credentials configured). */
  simulated?: boolean;
}

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Meta's free service window is open for 24h after the customer's last message. */
export function isServiceWindowOpen(lastInboundAt: Date | null, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}

async function post(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<SendResult> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const json = (await response.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };

  if (!response.ok) {
    // Never echo the token or the full request back into logs.
    return { ok: false, error: json.error?.message ?? `HTTP ${response.status}` };
  }
  return { ok: true, providerMessageId: json.messages?.[0]?.id };
}

export async function sendText(
  phoneNumberId: string,
  toE164: string,
  text: string,
  accessToken = env('WHATSAPP_ACCESS_TOKEN'),
): Promise<SendResult> {
  if (!accessToken) {
    return { ok: true, simulated: true };
  }
  return post(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toE164,
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

export async function sendTemplate(
  phoneNumberId: string,
  toE164: string,
  templateName: string,
  language: string,
  variables: string[],
  accessToken = env('WHATSAPP_ACCESS_TOKEN'),
): Promise<SendResult> {
  if (!accessToken) {
    return { ok: true, simulated: true };
  }
  return post(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: toE164,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: variables.length
        ? [{ type: 'body', parameters: variables.map((text) => ({ type: 'text', text })) }]
        : [],
    },
  });
}
