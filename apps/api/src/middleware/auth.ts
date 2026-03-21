import { createMiddleware } from 'hono/factory';
import { getAdminAuth } from '../lib/firebase-admin.js';
import type { AppEnv } from '../types.js';

export interface AuthUser {
  uid: string;
  email: string;
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const idToken = authHeader.slice(7);
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    c.set('user', { uid: decoded.uid, email: decoded.email ?? '' });
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
});
