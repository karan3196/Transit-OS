import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('tenant secret encryption', () => {
  it('round-trips a channel token', () => {
    const token = 'EAAG_fake_whatsapp_token_value';
    expect(decryptSecret(encryptSecret(token, KEY), KEY)).toBe(token);
  });

  it('produces a different ciphertext each time for the same plaintext', () => {
    const a = encryptSecret('same', KEY);
    const b = encryptSecret('same', KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe(decryptSecret(b, KEY));
  });

  it('refuses to decrypt with the wrong key', () => {
    const encoded = encryptSecret('secret', KEY);
    expect(() => decryptSecret(encoded, Buffer.alloc(32, 9).toString('base64'))).toThrow();
  });

  it('refuses a tampered ciphertext (GCM tag check)', () => {
    const parts = encryptSecret('secret', KEY).split('.');
    const data = Buffer.from(parts[3]!, 'base64');
    data[0] = data[0]! ^ 0xff;
    parts[3] = data.toString('base64');
    expect(() => decryptSecret(parts.join('.'), KEY)).toThrow();
  });

  it('rejects an unrecognised envelope', () => {
    expect(() => decryptSecret('v2.a.b.c', KEY)).toThrow(/envelope/i);
    expect(() => decryptSecret('not-an-envelope', KEY)).toThrow();
  });

  it('accepts a passphrase as well as a 32-byte base64 key', () => {
    const token = 'token';
    expect(decryptSecret(encryptSecret(token, 'a long dev passphrase'), 'a long dev passphrase')).toBe(
      token,
    );
  });

  it('never reveals the full value when masking for logs', () => {
    const masked = maskSecret('EAAG_super_secret_token');
    expect(masked).not.toContain('super_secret');
    expect(maskSecret('short')).toBe('****');
  });
});
