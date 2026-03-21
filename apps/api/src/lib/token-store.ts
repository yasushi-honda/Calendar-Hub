import { FieldValue } from 'firebase-admin/firestore';
import { encrypt, decrypt } from '@calendar-hub/shared';
import type { ConnectedAccountPublic } from '@calendar-hub/shared';
import { getDb } from './firebase-admin.js';
import { getSecret } from './secrets.js';

let cachedKey: Buffer | null = null;

/**
 * AES-256暗号化キーを取得（32バイト）
 * 本番: Secret Manager "token-encryption-key" から取得
 * ローカル: TOKEN_ENCRYPTION_KEY 環境変数にフォールバック
 */
async function getEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const keyStr = await getSecret('token-encryption-key', 'TOKEN_ENCRYPTION_KEY');

  // Base64エンコードされたキーを想定（32バイト = 44文字base64）
  // 平文の場合はSHA-256でハッシュして正規32バイトに変換
  let keyBuf: Buffer;
  if (keyStr.length === 44 && /^[A-Za-z0-9+/]+=*$/.test(keyStr)) {
    keyBuf = Buffer.from(keyStr, 'base64');
  } else {
    const { createHash } = await import('node:crypto');
    keyBuf = createHash('sha256').update(keyStr, 'utf8').digest();
  }

  if (keyBuf.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes, got ${keyBuf.length}`);
  }

  cachedKey = keyBuf;
  return cachedKey;
}

const KEY_VERSION = 'v1';

export async function saveConnectedAccount(
  userId: string,
  provider: 'google' | 'timetree',
  email: string,
  refreshToken: string,
  scopes: string[],
) {
  const db = getDb();
  const key = await getEncryptionKey();
  const encrypted = encrypt(refreshToken, key);

  const accountRef = db
    .collection('users')
    .doc(userId)
    .collection('connectedAccounts')
    .doc(`${provider}_${email.replace(/[^a-zA-Z0-9]/g, '_')}`);

  await accountRef.set(
    {
      userId,
      provider,
      email,
      encryptedRefreshToken: encrypted.encrypted,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptionKeyVersion: KEY_VERSION,
      scopes,
      calendarIds: [],
      isActive: true,
      lastTokenRefreshAt: FieldValue.serverTimestamp(),
      connectedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return accountRef.id;
}

export async function getRefreshToken(userId: string, accountId: string): Promise<string | null> {
  const db = getDb();
  const doc = await db
    .collection('users')
    .doc(userId)
    .collection('connectedAccounts')
    .doc(accountId)
    .get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  if (!data.isActive) return null;

  const key = await getEncryptionKey();
  return decrypt(
    {
      encrypted: data.encryptedRefreshToken,
      iv: data.iv,
      authTag: data.authTag,
    },
    key,
  );
}

export async function listConnectedAccounts(userId: string): Promise<ConnectedAccountPublic[]> {
  const db = getDb();
  const snapshot = await db.collection('users').doc(userId).collection('connectedAccounts').get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      provider: data.provider,
      email: data.email,
      calendarIds: data.calendarIds ?? [],
      isActive: data.isActive ?? true,
      connectedAt: data.connectedAt?.toDate() ?? new Date(),
    };
  });
}

export async function deactivateAccount(userId: string, accountId: string): Promise<void> {
  const db = getDb();
  await db
    .collection('users')
    .doc(userId)
    .collection('connectedAccounts')
    .doc(accountId)
    .update({ isActive: false });
}
