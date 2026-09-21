/**
 * Per-tenant channel credentials are stored encrypted (CLAUDE.md
 * non-negotiable 2). AES-256-GCM with a random 12-byte IV, using a master key
 * held only in TENANT_SECRET_KEY.
 *
 * Wire format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64>
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;

function masterKey(rawKey?: string): Buffer {
  const raw = rawKey ?? process.env.TENANT_SECRET_KEY;
  if (!raw) {
    throw new Error('TENANT_SECRET_KEY is not set; refusing to handle tenant secrets.');
  }
  // Accept either 32 raw bytes base64-encoded or an arbitrary passphrase.
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptSecret(plaintext: string, rawKey?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', masterKey(rawKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(encoded: string, rawKey?: string): string {
  const parts = encoded.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unrecognised secret envelope.');
  }
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  const decipher = createDecipheriv('aes-256-gcm', masterKey(rawKey), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Masks a credential for logs. Never log the credential itself. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return `${value.slice(0, 3)}…${value.slice(-2)} (${value.length} chars)`;
}
