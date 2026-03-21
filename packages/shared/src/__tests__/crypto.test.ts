import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../crypto.js';

describe('encrypt / decrypt', () => {
  const key = randomBytes(32);

  it('should encrypt and decrypt a string', () => {
    const plaintext = 'refresh_token_abc123';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for same plaintext (random IV)', () => {
    const plaintext = 'same_token';
    const a = encrypt(plaintext, key);
    const b = encrypt(plaintext, key);
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(a.iv).not.toBe(b.iv);
  });

  it('should fail to decrypt with wrong key', () => {
    const plaintext = 'secret';
    const encrypted = encrypt(plaintext, key);
    const wrongKey = randomBytes(32);
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it('should fail to decrypt with tampered authTag', () => {
    const encrypted = encrypt('test', key);
    encrypted.authTag = Buffer.from('bad_tag_xxxxxxxxx').toString('base64');
    expect(() => decrypt(encrypted, key)).toThrow();
  });

  it('should handle empty string', () => {
    const encrypted = encrypt('', key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe('');
  });

  it('should handle unicode text', () => {
    const plaintext = 'テスト日本語トークン 🔐';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });
});
