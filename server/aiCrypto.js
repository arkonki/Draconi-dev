import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Encrypts a person's API key before it is stored. AES-256-GCM, with the encryption key derived from a secret kept
// in the server's environment, so a copy of the database or of a backup alone does not reveal anyone's key.

const VERSION = 'v1';
export const MIN_SECRET_LENGTH = 32;

const deriveKey = (secret) => createHash('sha256').update(`draconi-ai-key:${secret}`).digest();

export function secretIsUsable(secret) {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH;
}

export function encryptSecret(plain, secret) {
  if (!secretIsUsable(secret)) throw new Error('The encryption secret is missing or too short');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
}

/** Returns the original text, or null when the value is malformed, tampered with, or made with another secret. */
export function decryptSecret(stored, secret) {
  if (!secretIsUsable(secret) || typeof stored !== 'string') return null;
  const [version, iv, tag, data] = stored.split(':');
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
