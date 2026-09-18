import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

type EncryptedCredentials = { _encrypted: 'v1'; value: string };

function derive(source: string | undefined): Buffer | null {
  return source ? createHash('sha256').update(source).digest() : null;
}

function currentKey(): Buffer | null {
  return derive(process.env.INTEGRATION_ENCRYPTION_KEY);
}

export function isEncryptedCredentials(stored: unknown): stored is EncryptedCredentials {
  const value = stored as Partial<EncryptedCredentials> | null;
  return value?._encrypted === 'v1' && typeof value.value === 'string';
}

export function encryptCredentials(value: Record<string, unknown>): EncryptedCredentials | Record<string, unknown> {
  const encryptionKey = currentKey();
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

/** Acepta filas legacy y una clave anterior para rotación sin interrupción. */
export function decryptCredentials<T extends Record<string, unknown>>(stored: unknown): T {
  const value = (stored ?? {}) as Record<string, unknown>;
  if (!isEncryptedCredentials(value)) return value as T;
  const packed = Buffer.from(value.value, 'base64url');
  const candidates = [currentKey(), derive(process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS)].filter(Boolean) as Buffer[];
  for (const encryptionKey of candidates) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey, packed.subarray(0, 12));
      decipher.setAuthTag(packed.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8'),
      ) as T;
    } catch {
      // Prueba la siguiente clave; nunca registra ciphertext ni secretos.
    }
  }
  throw new Error('No se pueden descifrar credenciales con las claves configuradas.');
}
