import { FieldValue } from 'firebase-admin/firestore';
import { encrypt, decrypt } from '@calendar-hub/shared';
import type { ConnectedAccountPublic } from '@calendar-hub/shared';
import { getDb } from './firebase-admin.js';

function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  // 32 bytes = 256 bits for AES-256
  return Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
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
  const key = getEncryptionKey();
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

  const key = getEncryptionKey();
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
