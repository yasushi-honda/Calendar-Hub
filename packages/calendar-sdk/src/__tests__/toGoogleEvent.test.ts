import { describe, it, expect } from 'vitest';
import { toGoogleEvent } from '../adapters/google.js';

describe('toGoogleEvent transparency mapping', () => {
  it('transparency: opaque を指定すると Google event body に反映される (booking-mirror C1: Busy 明示)', () => {
    const body = toGoogleEvent({
      title: '予定あり',
      start: new Date('2026-07-27T01:00:00Z'),
      end: new Date('2026-07-27T02:00:00Z'),
      isAllDay: false,
      transparency: 'opaque',
    });

    expect(body.transparency).toBe('opaque');
  });

  it('transparency: transparent を指定すると Google event body に反映される', () => {
    const body = toGoogleEvent({
      title: 'Free block',
      start: new Date('2026-07-27T01:00:00Z'),
      end: new Date('2026-07-27T02:00:00Z'),
      isAllDay: false,
      transparency: 'transparent',
    });

    expect(body.transparency).toBe('transparent');
  });

  it('transparency 未指定なら body に含まれない (Google 側のデフォルト opaque に委ねる)', () => {
    const body = toGoogleEvent({
      title: 'イベント',
      start: new Date('2026-07-27T01:00:00Z'),
      end: new Date('2026-07-27T02:00:00Z'),
      isAllDay: false,
    });

    expect(body.transparency).toBeUndefined();
  });
});
