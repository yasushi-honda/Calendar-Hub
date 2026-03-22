import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';
import { calendarRoutes } from './routes/calendars.js';
import { profileRoutes } from './routes/profile.js';
import { aiRoutes } from './routes/ai.js';
import { notificationRoutes } from './routes/notifications.js';
import { bookingLinkRoutes } from './routes/booking-links.js';
import { publicBookingRoutes } from './routes/public-booking.js';
import { rateLimit } from './middleware/rate-limit.js';
import type { AppEnv } from './types.js';

export const app = new Hono<AppEnv>();

app.use('*', logger());

// 公開APIには緩いCORS（認証不要のため。先に登録して優先させる）
app.use(
  '/api/public/*',
  cors({
    origin: '*',
    credentials: false,
  }),
);

app.use(
  '*',
  cors({
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(','),
    credentials: true,
  }),
);

// 公開APIのレート制限
app.use('/api/public/booking/*/slots', rateLimit({ windowMs: 60_000, max: 30 }));
app.use('/api/public/booking/*/book', rateLimit({ windowMs: 60_000, max: 5 }));

app.get('/health', (c) => c.json({ status: 'ok' }));

app.route('/api/auth', authRoutes);
app.route('/api/calendars', calendarRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/booking-links', bookingLinkRoutes);
app.route('/api/public/booking', publicBookingRoutes);
