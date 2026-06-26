import { describe, it, expect } from 'vitest';
import { pickOwnerDisplayName } from '../lib/owner-display-name.js';

describe('pickOwnerDisplayName', () => {
  it('displayName が非空文字列なら displayName を返す', () => {
    expect(pickOwnerDisplayName({ displayName: '本田泰', email: 'h@example.com' })).toBe('本田泰');
  });

  it('displayName が空文字なら email にフォールバックする (主因 bug の再現)', () => {
    expect(pickOwnerDisplayName({ displayName: '', email: 'h@example.com' })).toBe('h@example.com');
  });

  it('displayName が undefined なら email にフォールバックする', () => {
    expect(pickOwnerDisplayName({ email: 'h@example.com' })).toBe('h@example.com');
  });

  it('displayName が null なら email にフォールバックする', () => {
    expect(pickOwnerDisplayName({ displayName: null, email: 'h@example.com' })).toBe(
      'h@example.com',
    );
  });

  it('displayName と email が両方空文字なら "User" にフォールバックする', () => {
    expect(pickOwnerDisplayName({ displayName: '', email: '' })).toBe('User');
  });

  it('displayName と email が両方 undefined なら "User" にフォールバックする', () => {
    expect(pickOwnerDisplayName({})).toBe('User');
  });

  it('data 自体が undefined なら "User" にフォールバックする (Firestore doc 不在ケース)', () => {
    expect(pickOwnerDisplayName(undefined)).toBe('User');
  });

  it('displayName が空白のみの文字列ならそのまま返す (trim はしない、明示的な空白は意図的扱い)', () => {
    expect(pickOwnerDisplayName({ displayName: '   ', email: 'h@example.com' })).toBe('   ');
  });
});
