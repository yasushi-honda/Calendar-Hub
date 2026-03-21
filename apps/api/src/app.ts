import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';
import { calendarRoutes } from './routes/calendars.js';
import { profileRoutes } from './routes/profile.js';
import { aiRoutes } from './routes/ai.js';
import { notificationRoutes } from './routes/notifications.js';
import type { AppEnv } from './types.js';

export const app = new Hono<AppEnv>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(','),
    credentials: true,
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/api/auth', authRoutes);
app.route('/api/calendars', calendarRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/notifications', notificationRoutes);
