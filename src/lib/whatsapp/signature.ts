/**
 * Meta signs every webhook delivery with an HMAC of the *raw* request body.
 * CLAUDE.md non-negotiable 3: this runs before any parsing or processing.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-hub-signature-256';

export function signPayload(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
}

/**
 * Constant-time comparison of the delivered signature against one computed
 * locally. Returns false for anything malformed rather than throwing, so the
 * route can answer 401 uniformly and leak nothing about why.
 */
export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;
  if (!header.startsWith('sha256=')) return false;

  const expected = Buffer.from(signPayload(rawBody, appSecret), 'utf8');
  const received = Buffer.from(header, 'utf8');
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

/** Meta's GET handshake when a webhook URL is first registered. */
export function verifySubscription(
  params: URLSearchParams,
  verifyToken: string,
): { ok: true; challenge: string } | { ok: false } {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && token && challenge && verifyToken) {
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(verifyToken, 'utf8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { ok: true, challenge };
    }
  }
  return { ok: false };
}
