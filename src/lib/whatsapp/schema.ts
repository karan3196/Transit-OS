/**
 * Zod schemas for the WhatsApp Cloud API webhook envelope. External input is
 * never trusted shape-first (CLAUDE.md section 7), and Meta adds fields
 * regularly, so unknown keys are tolerated while the fields we act on are not.
 */
import { z } from 'zod';

const textMessage = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string(),
  type: z.literal('text'),
  text: z.object({ body: z.string() }),
});

const unsupportedMessage = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string(),
  type: z.string(),
});

export const whatsappMessageSchema = z.union([textMessage, unsupportedMessage]);

export const whatsappValueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: z.object({
    display_phone_number: z.string().optional(),
    phone_number_id: z.string().min(1),
  }),
  contacts: z
    .array(
      z.object({
        wa_id: z.string(),
        profile: z.object({ name: z.string().optional() }).optional(),
      }),
    )
    .optional(),
  messages: z.array(whatsappMessageSchema).optional(),
  statuses: z
    .array(z.object({ id: z.string(), status: z.string(), recipient_id: z.string().optional() }))
    .optional(),
});

export const whatsappWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: whatsappValueSchema,
        }),
      ),
    }),
  ),
});

export type WhatsappWebhook = z.infer<typeof whatsappWebhookSchema>;
export type WhatsappValue = z.infer<typeof whatsappValueSchema>;

export interface NormalisedInbound {
  providerMessageId: string;
  phoneNumberId: string;
  fromE164: string;
  profileName?: string;
  text: string;
  unsupportedType?: string;
  receivedAt: Date;
}

/**
 * Flattens Meta's nested envelope into the shape the runtime actually uses.
 * Status callbacks (delivered/read) carry no message and are dropped here.
 */
export function normaliseInbound(payload: WhatsappWebhook): NormalisedInbound[] {
  const out: NormalisedInbound[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value;
      const nameByWaId = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]),
      );

      for (const message of value.messages ?? []) {
        const isText = message.type === 'text' && 'text' in message;
        out.push({
          providerMessageId: message.id,
          phoneNumberId: value.metadata.phone_number_id,
          fromE164: message.from.startsWith('+') ? message.from : `+${message.from}`,
          profileName: nameByWaId.get(message.from) ?? undefined,
          text: isText ? (message as { text: { body: string } }).text.body : '',
          unsupportedType: isText ? undefined : message.type,
          receivedAt: new Date(Number(message.timestamp) * 1000),
        });
      }
    }
  }

  return out;
}
