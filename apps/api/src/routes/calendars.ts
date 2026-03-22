import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { createAdapter } from '../lib/adapter-factory.js';
import { listConnectedAccounts } from '../lib/token-store.js';

export const calendarRoutes = new Hono<AppEnv>();

// 全連携アカウントのカレンダー一覧
calendarRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const accounts = await listConnectedAccounts(user.uid);
  const activeAccounts = accounts.filter((a) => a.isActive);

  const results = await Promise.allSettled(
    activeAccounts.map(async (account) => {
      const adapter = await createAdapter(user.uid, account.id);
      const calendars = await adapter.listCalendars();
      return calendars.map((cal) => ({ ...cal, accountId: account.id }));
    }),
  );

  const calendars = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);

  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r, i) => ({
      accountId: activeAccounts[i].id,
      error: String(r.reason),
    }));

  return c.json({ calendars, errors });
});

// 特定アカウントのイベント一覧
calendarRoutes.get('/:accountId/events', requireAuth, async (c) => {
  const user = c.get('user');
  const accountId = c.req.param('accountId');
  const calendarId = c.req.query('calendarId');
  const timeMin = c.req.query('timeMin');
  const timeMax = c.req.query('timeMax');

  if (!calendarId || !timeMin || !timeMax) {
    return c.json({ error: 'calendarId, timeMin, timeMax are required' }, 400);
  }

  const adapter = await createAdapter(user.uid, accountId);
  const events = await adapter.listEvents(calendarId, new Date(timeMin), new Date(timeMax));

  return c.json({ events });
});

// 全アカウント横断のイベント一覧
calendarRoutes.get('/events/merged', requireAuth, async (c) => {
  const user = c.get('user');
  const timeMin = c.req.query('timeMin');
  const timeMax = c.req.query('timeMax');

  if (!timeMin || !timeMax) {
    return c.json({ error: 'timeMin, timeMax are required' }, 400);
  }

  const accounts = await listConnectedAccounts(user.uid);
  const activeAccounts = accounts.filter((a) => a.isActive);

  const results = await Promise.allSettled(
    activeAccounts.map(async (account) => {
      const adapter = await createAdapter(user.uid, account.id);
      const calendars = await adapter.listCalendars();
      const allEvents = await Promise.all(
        calendars.map((cal) => adapter.listEvents(cal.id, new Date(timeMin), new Date(timeMax))),
      );
      return allEvents.flat();
    }),
  );

  // Log rejected results for debugging
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Calendar fetch failed for account ${activeAccounts[i]?.id}:`, r.reason);
    }
  });

  const events = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return c.json({ events });
});

// イベント作成
calendarRoutes.post('/:accountId/events', requireAuth, async (c) => {
  const user = c.get('user');
  const accountId = c.req.param('accountId');
  const body = await c.req.json();

  const { calendarId, title, description, start, end, isAllDay, location, timeZone } = body;
  if (!calendarId || !title || !start || !end) {
    return c.json({ error: 'calendarId, title, start, end are required' }, 400);
  }

  const adapter = await createAdapter(user.uid, accountId);
  const event = await adapter.createEvent(calendarId, {
    title,
    description,
    start: new Date(start),
    end: new Date(end),
    isAllDay,
    location,
    timeZone,
  });

  return c.json({ event }, 201);
});

// イベント更新
calendarRoutes.patch('/:accountId/events/:eventId', requireAuth, async (c) => {
  const user = c.get('user');
  const accountId = c.req.param('accountId');
  const eventId = c.req.param('eventId');
  const body = await c.req.json();

  const { calendarId, ...updateFields } = body;
  if (!calendarId) {
    return c.json({ error: 'calendarId is required' }, 400);
  }

  const update: Record<string, unknown> = {};
  if (updateFields.title !== undefined) update.title = updateFields.title;
  if (updateFields.description !== undefined) update.description = updateFields.description;
  if (updateFields.start !== undefined) update.start = new Date(updateFields.start);
  if (updateFields.end !== undefined) update.end = new Date(updateFields.end);
  if (updateFields.isAllDay !== undefined) update.isAllDay = updateFields.isAllDay;
  if (updateFields.location !== undefined) update.location = updateFields.location;

  const adapter = await createAdapter(user.uid, accountId);
  const event = await adapter.updateEvent(calendarId, eventId, update);

  return c.json({ event });
});

// イベント削除
calendarRoutes.delete('/:accountId/events/:eventId', requireAuth, async (c) => {
  const user = c.get('user');
  const accountId = c.req.param('accountId');
  const eventId = c.req.param('eventId');
  const calendarId = c.req.query('calendarId');

  if (!calendarId) {
    return c.json({ error: 'calendarId is required' }, 400);
  }

  const adapter = await createAdapter(user.uid, accountId);
  await adapter.deleteEvent(calendarId, eventId);

  return c.json({ success: true });
});
