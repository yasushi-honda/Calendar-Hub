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
  // 終日予定 (休暇・出張等) も busy として扱う。除外すると、その日が丸ごと
  // 「空き」と判定され二重予約を招くため (Issue #194)。
  const sortedEvents = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());

  // 日ごとに計算
  let current = startOfDayUTC(rangeStart, timezoneOffsetMinutes);

  while (current < rangeEnd) {
    const dayStart = setDayHour(current, dayStartHour, timezoneOffsetMinutes);
    const dayEnd = setDayHour(current, dayEndHour, timezoneOffsetMinutes);

    // この日のイベントを抽出
    const dayEvents = sortedEvents.filter((e) => {
      return e.start < dayEnd && e.end > dayStart;
    });

    // イベント間の空きを計算。cursor は dayStart と rangeStart の遅い方から始める
    // (当日分は rangeStart 以前の、既に過ぎた時間帯を空き枠として出さないため。Issue #198)。
    // rangeStart は日をまたいでも不変なので、2日目以降は自然に dayStart が優先される。
    let cursor = dayStart < rangeStart ? rangeStart : dayStart;
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

export interface EarliestBookableStartOptions {
  /** 現在時刻から最低限空ける時間(分) */
  leadMinutes: number;
  /** 開始時刻を揃える刻み(分)。タイムゾーンのオフセットを加味した壁時計時刻で揃える */
  stepMinutes: number;
  /** タイムゾーンのUTCオフセット(分)。例: JST = 540。未指定は 0(UTC) */
  timezoneOffsetMinutes?: number;
}

/**
 * 公開予約ページで「当日の枠が始まりうる最も早い時刻」を返す。
 *
 * 現在時刻 + リードタイム を、次の刻みの境界へ切り上げる(境界ちょうどはそのまま)。
 * 例: 刻み 30 分・リード 30 分のとき、08:41 → 09:30、08:30:00 → 09:00。
 *
 * calculateFreeSlots の rangeStart に渡すと、当日の枠が揃った時刻から始まる。
 * (calculateFreeSlots 自体は「現在時刻から」を保つ。空き時間パネルや AI 提案が使うため)
 */
export function earliestBookableStart(now: Date, options: EarliestBookableStartOptions): Date {
  const { leadMinutes, stepMinutes, timezoneOffsetMinutes = 0 } = options;
  const stepMs = stepMinutes * 60_000;
  const offsetMs = timezoneOffsetMinutes * 60_000;
  const earliest = now.getTime() + leadMinutes * 60_000;
  // 壁時計(オフセット込み)で刻みに揃えてから、元の時刻系に戻す
  return new Date(Math.ceil((earliest + offsetMs) / stepMs) * stepMs - offsetMs);
}

export interface BookingSlotsInput {
  /** 空きの計算に使う、予定(外部カレンダー + 確定済みの予約) */
  events: CalendarEvent[];
  /** 現在時刻 */
  now: Date;
  /** 空きを探す範囲。当日を含むときは通常 now(過去にしない) */
  rangeStart: Date;
  rangeEnd: Date;
  dayStartHour: number;
  dayEndHour: number;
  durationMinutes: number;
  bufferMinutes: number;
  /** 予約を受ける曜日(JST 基準、0=日〜6=土) */
  availableDays: readonly number[];
  timezoneOffsetMinutes: number;
  /** 当日の最小リードタイム(分)。開始が「現在 + リード」より前の枠は出さない */
  leadMinutes: number;
  /** 当日の最初の枠を揃える刻み(分) */
  stepMinutes: number;
}

/**
 * 公開予約ページに出す枠を作る(Issue #226)。
 *
 * 空きの計算は rangeStart = 現在時刻 のまま行う(予定の終了や営業開始に由来する開始位置は動かさない)。
 *  1. 空きの先頭が「rangeStart そのもの」から始まるとき(=今から空いている、予定や営業開始に由来しない先頭)
 *     だけ、開始位置を「現在 + リードタイム」を刻みに切り上げた時刻へ揃える。
 *     (そのまま使うと 08:41 のように揃わず、先頭の枠は予約時点で過去になる)
 *  2. 営業日(JST の曜日)で絞る
 *  3. 所要時間 + バッファで枠に分割する
 *  4. 開始が「現在 + リードタイム」より前の枠を除く(日をまたいでも、除くのはこの条件に当たる枠だけ。
 *     翌日以降の枠の並びは動かさない)
 *
 * 当日の最初の枠だけを揃え、予定直後の枠や翌日以降の枠は変更しない。
 */
export function calculateBookingSlots(input: BookingSlotsInput): BookingSlotResult[] {
  const {
    events,
    now,
    rangeStart,
    rangeEnd,
    dayStartHour,
    dayEndHour,
    durationMinutes,
    bufferMinutes,
    availableDays,
    timezoneOffsetMinutes,
    leadMinutes,
    stepMinutes,
  } = input;

  const cutoffMs = now.getTime() + leadMinutes * 60_000;
  const earliest = earliestBookableStart(now, { leadMinutes, stepMinutes, timezoneOffsetMinutes });

  const free = calculateFreeSlots(events, rangeStart, rangeEnd, {
    dayStartHour,
    dayEndHour,
    minSlotMinutes: durationMinutes,
    timezoneOffsetMinutes,
  });

  const aligned: FreeSlot[] = [];
  for (const slot of free) {
    const startsFromRangeStart = slot.start.getTime() === rangeStart.getTime();
    if (startsFromRangeStart && rangeStart.getTime() < earliest.getTime()) {
      const remainingMinutes = (slot.end.getTime() - earliest.getTime()) / 60_000;
      if (remainingMinutes < durationMinutes) continue; // 揃えると枠が取れない
      aligned.push({ start: earliest, end: slot.end, durationMinutes: remainingMinutes });
    } else {
      aligned.push(slot);
    }
  }

  const offsetMs = timezoneOffsetMinutes * 60_000;
  const onAvailableDays = aligned.filter((slot) =>
    availableDays.includes(new Date(slot.start.getTime() + offsetMs).getUTCDay()),
  );

  return splitFreeIntoBookingSlots(onAvailableDays, durationMinutes, bufferMinutes).filter(
    (slot) => new Date(slot.start).getTime() >= cutoffMs,
  );
}
