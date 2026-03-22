import type { CalendarEvent } from './index.js';

export interface FreeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface FreeTimeOptions {
  dayStartHour?: number; // デフォルト 8
  dayEndHour?: number; // デフォルト 22
  minSlotMinutes?: number; // 最小スロット長（デフォルト 30分）
  /** タイムゾーンのUTCオフセット（分）。例: JST = 540, EST = -300。未指定時はローカルTZ */
  timezoneOffsetMinutes?: number;
}

/**
 * 指定のタイムゾーンで「その日の指定時刻」をUTC Dateとして生成する。
 * timezoneOffsetMinutesが未指定の場合はローカルTZのsetHoursを使用（後方互換）。
 */
function setDayHour(date: Date, hour: number, timezoneOffsetMinutes: number | undefined): Date {
  if (timezoneOffsetMinutes !== undefined) {
    // UTCベースで計算: その日のUTC 00:00を求め、ローカル時刻のhourをUTCに変換
    const d = new Date(date);
    // dateのUTC日付を基準にする
    d.setUTCHours(0, 0, 0, 0);
    // ローカルのhour時をUTCに変換: UTC = local - offset
    return new Date(d.getTime() + (hour * 60 - timezoneOffsetMinutes) * 60000);
  }
  // 後方互換: ローカルTZ
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function startOfDayUTC(date: Date, timezoneOffsetMinutes: number | undefined): Date {
  if (timezoneOffsetMinutes !== undefined) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextDayUTC(date: Date, timezoneOffsetMinutes: number | undefined): Date {
  if (timezoneOffsetMinutes !== undefined) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * 指定期間内のイベントから空き時間スロットを算出する。
 * events は start 昇順でソート済みを想定。
 */
export function calculateFreeSlots(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
  options: FreeTimeOptions = {},
): FreeSlot[] {
  const { dayStartHour = 8, dayEndHour = 22, minSlotMinutes = 30, timezoneOffsetMinutes } = options;

  const slots: FreeSlot[] = [];
  const sortedEvents = [...events]
    .filter((e) => !e.isAllDay)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // 日ごとに計算
  let current = startOfDayUTC(rangeStart, timezoneOffsetMinutes);

  while (current < rangeEnd) {
    const dayStart = setDayHour(current, dayStartHour, timezoneOffsetMinutes);
    const dayEnd = setDayHour(current, dayEndHour, timezoneOffsetMinutes);

    // この日のイベントを抽出
    const dayEvents = sortedEvents.filter((e) => {
      return e.start < dayEnd && e.end > dayStart;
    });

    // イベント間の空きを計算
    let cursor = dayStart;
    for (const event of dayEvents) {
      const eventStart = event.start < dayStart ? dayStart : event.start;
      const eventEnd = event.end > dayEnd ? dayEnd : event.end;

      if (cursor < eventStart) {
        const durationMinutes = (eventStart.getTime() - cursor.getTime()) / 60000;
        if (durationMinutes >= minSlotMinutes) {
          slots.push({
            start: new Date(cursor),
            end: new Date(eventStart),
            durationMinutes,
          });
        }
      }
      if (eventEnd > cursor) {
        cursor = new Date(eventEnd);
      }
    }

    // 最後のイベント後 ～ dayEnd の空き
    if (cursor < dayEnd) {
      const durationMinutes = (dayEnd.getTime() - cursor.getTime()) / 60000;
      if (durationMinutes >= minSlotMinutes) {
        slots.push({
          start: new Date(cursor),
          end: new Date(dayEnd),
          durationMinutes,
        });
      }
    }

    // 翌日へ
    current = nextDayUTC(current, timezoneOffsetMinutes);
  }

  return slots;
}

export interface BookingSlotResult {
  start: string; // ISO 8601
  end: string;
}

/**
 * 空きスロットを指定duration + buffer単位で分割する。
 * 予約リンクの公開スロット生成に使用。
 */
export function splitFreeIntoBookingSlots(
  freeSlots: FreeSlot[],
  durationMinutes: number,
  bufferMinutes: number = 0,
): BookingSlotResult[] {
  const result: BookingSlotResult[] = [];
  const slotWithBuffer = durationMinutes + bufferMinutes;

  for (const slot of freeSlots) {
    let cursor = new Date(slot.start);
    while (true) {
      const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);
      const nextCursor = new Date(cursor.getTime() + slotWithBuffer * 60000);

      if (slotEnd > slot.end) break;

      result.push({
        start: cursor.toISOString(),
        end: slotEnd.toISOString(),
      });

      cursor = nextCursor;
    }
  }

  return result;
}
