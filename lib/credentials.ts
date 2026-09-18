import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

type EncryptedCredentials = { _encrypted: 'v1'; value: string };

function key(): Buffer | null {
  const source = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!source) return null;
  return createHash('sha256').update(source).digest();
}

export function encryptCredentials(value: Record<string, unknown>): EncryptedCredentials | Record<string, unknown> {
  const encryptionKey = key();
  if (!encryptionKey) {
    if (process.env.NODE_ENV === 'production') throw new Error('Falta INTEGRATION_ENCRYPTION_KEY.');
    return value;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { _encrypted: 'v1', value: Buffer.concat([iv, tag, ciphertext]).toString('base64url') };
}

/** Compatible con filas históricas en claro para permitir una migración gradual. */
export function decryptCredentials<T extends Record<string, unknown>>(stored: unknown): T {
  const value = (stored ?? {}) as Record<string, unknown>;
  if (value._encrypted !== 'v1' || typeof value.value !== 'string') return value as T;
  const encryptionKey = key();
  if (!encryptionKey) throw new Error('No se pueden descifrar credenciales: falta INTEGRATION_ENCRYPTION_KEY.');
  const packed = Buffer.from(value.value, 'base64url');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as T;
}
