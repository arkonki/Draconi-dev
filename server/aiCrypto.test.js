// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, secretIsUsable } from './aiCrypto.js';

const SECRET = 'a-secret-that-is-long-enough-for-the-test-1234';

describe('API key encryption', () => {
  it('survives a round trip and is not stored in the clear', () => {
    const stored = encryptSecret('sk-or-v1-abcdef', SECRET);
    expect(stored).not.toContain('sk-or-v1-abcdef');
    expect(decryptSecret(stored, SECRET)).toBe('sk-or-v1-abcdef');
  });

  it('differs every time, and the wrong secret or a changed value yields nothing', () => {
    const first = encryptSecret('same', SECRET);
    expect(first).not.toBe(encryptSecret('same', SECRET));
    expect(decryptSecret(first, `${SECRET}x`)).toBeNull();
    const parts = first.split(':');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(decryptSecret(parts.join(':'), SECRET)).toBeNull();
    expect(decryptSecret('garbage', SECRET)).toBeNull();
    expect(decryptSecret(null, SECRET)).toBeNull();
  });

  it('refuses a short or missing secret', () => {
    expect(secretIsUsable(undefined)).toBe(false);
    expect(secretIsUsable('short')).toBe(false);
    expect(secretIsUsable(SECRET)).toBe(true);
    expect(() => encryptSecret('x', 'short')).toThrow();
  });
});
