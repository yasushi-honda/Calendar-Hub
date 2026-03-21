import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';
import { calendarRoutes } from './routes/calendars.js';
import type { AppEnv } from './types.js';

export const app = new Hono<AppEnv>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000'],
    credentials: true,
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/api/auth', authRoutes);
app.route('/api/calendars', calendarRoutes);
