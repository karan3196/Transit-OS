import { describe, expect, it } from 'vitest';
import {
  signPayload,
  verifySignature,
  verifySubscription,
} from '@/lib/whatsapp/signature';

const SECRET = 'test-app-secret';
const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

describe('webhook signature verification', () => {
  it('accepts a signature produced from the exact raw body', () => {
    expect(verifySignature(BODY, signPayload(BODY, SECRET), SECRET)).toBe(true);
  });

  it('rejects a body that was altered after signing', () => {
    const signature = signPayload(BODY, SECRET);
    const tampered = BODY.replace('[]', '[{"id":"1","changes":[]}]');
    expect(verifySignature(tampered, signature, SECRET)).toBe(false);
  });

  it('rejects a signature made with a different app secret', () => {
    expect(verifySignature(BODY, signPayload(BODY, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing, malformed or wrong-length signature', () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false);
    expect(verifySignature(BODY, '', SECRET)).toBe(false);
    expect(verifySignature(BODY, 'sha1=abc', SECRET)).toBe(false);
    expect(verifySignature(BODY, 'sha256=short', SECRET)).toBe(false);
  });

  it('rejects everything when the app secret is not configured', () => {
    expect(verifySignature(BODY, signPayload(BODY, SECRET), '')).toBe(false);
  });

  it('is insensitive to JSON key order only through the raw bytes', () => {
    // Re-serialising the payload changes the bytes, so the signature must fail.
    // This is the bug the raw-body-first rule exists to prevent.
    const reserialised = JSON.stringify(JSON.parse(BODY), ['entry', 'object']);
    expect(verifySignature(reserialised, signPayload(BODY, SECRET), SECRET)).toBe(false);
  });
});

describe('webhook subscription handshake', () => {
  const params = (entries: Record<string, string>) => new URLSearchParams(entries);

  it('returns the challenge for a correct verify token', () => {
    const result = verifySubscription(
      params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' }),
      'tok',
    );
    expect(result).toEqual({ ok: true, challenge: '12345' });
  });

  it('refuses a wrong token, a wrong mode, or a missing challenge', () => {
    expect(
      verifySubscription(
        params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' }),
        'tok',
      ).ok,
    ).toBe(false);

    expect(
      verifySubscription(
        params({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'tok', 'hub.challenge': '1' }),
        'tok',
      ).ok,
    ).toBe(false);

    expect(
      verifySubscription(params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok' }), 'tok').ok,
    ).toBe(false);
  });
});
