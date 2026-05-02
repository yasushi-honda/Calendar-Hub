import pkg from 'rrule';
const { RRuleSet, rrulestr } = pkg;

/**
 * JST 固定 +9h オフセット。Asia/Tokyo は DST なしのため固定値で安全に変換できる。
 *
 * ADR-008: rrule ライブラリは tzid 未指定時、BYDAY 等を UTC 基準で判定するため、
 * 実 UTC instant のまま渡すと JST 0:00 境界の繰り返し予定が +1 日ずれる。
 * 「JST wall-clock を Z 表記した floating Date」に変換してから rrule に渡し、
 * 展開結果を逆変換することで JST の曜日として正しく扱う。
 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 実 UTC instant → JST wall-clock を Z 表記した floating Date */
function toFloatingJst(d: Date): Date {
  return new Date(d.getTime() + JST_OFFSET_MS);
}

/** floating Date (JST wall-clock を Z 表記) → 実 UTC instant */
function fromFloatingJst(d: Date): Date {
  return new Date(d.getTime() - JST_OFFSET_MS);
}

/**
 * TimeTreeの繰り返しイベント（RRULE形式）を指定期間内のインスタンスに展開する。
 *
 * @param recurrences RRULE/EXDATE文字列の配列（例: ["RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE:20220503T070000Z"]）
 * @param masterStart マスターイベントの開始日時（実 UTC instant）
 * @param masterEnd マスターイベントの終了日時（duration の算出に使用）
 * @param timeMin 展開範囲の開始（実 UTC instant）
 * @param timeMax 展開範囲の終了（実 UTC instant）
 * @returns 各インスタンスの開始/終了日時（実 UTC instant）
 */
export function expandRecurringEvent(
  recurrences: string[],
  masterStart: Date,
  masterEnd: Date,
  timeMin: Date,
  timeMax: Date,
): { start: Date; end: Date }[] {
  if (recurrences.length === 0) return [];

  const durationMs = masterEnd.getTime() - masterStart.getTime();

  // ADR-008: floating JST wall-clock 座標系で展開
  const floatingMasterStart = toFloatingJst(masterStart);
  const floatingTimeMin = toFloatingJst(timeMin);
  const floatingTimeMax = toFloatingJst(timeMax);

  const rruleSet = new RRuleSet();

  for (const line of recurrences) {
    if (line.startsWith('RRULE:')) {
      const rule = rrulestr(line, { dtstart: floatingMasterStart });
      rruleSet.rrule(rule as InstanceType<typeof pkg.RRule>);
    } else if (line.startsWith('EXDATE:')) {
      // TimeTreeは1行のEXDATEに複数日をカンマで並べる（RFC 5545準拠）
      const dateStr = line.replace('EXDATE:', '');
      for (const d of dateStr.split(',')) {
        const trimmed = d.trim();
        if (trimmed) rruleSet.exdate(parseExdateFloating(trimmed));
      }
    }
  }

  const occurrences = rruleSet.between(floatingTimeMin, floatingTimeMax, true);

  return occurrences.map((floating) => {
    const start = fromFloatingJst(floating);
    return { start, end: new Date(start.getTime() + durationMs) };
  });
}

/**
 * EXDATE 文字列を floating JST wall-clock Date に変換。
 *
 * 形式:
 * - "20220503T070000Z": UTC instant として解釈 → JST wall-clock の floating 表現に変換
 * - "20220503": JST 日付として扱い、JST 0:00 の floating 表現（同じ Z 表記）を返す
 */
function parseExdateFloating(dateStr: string): Date {
  if (dateStr.includes('T')) {
    const iso = dateStr.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/,
      '$1-$2-$3T$4:$5:$6Z',
    );
    return toFloatingJst(new Date(iso));
  }
  // date-only: JST 日付として扱う（floating 表現の JST 0:00 = Z 表記の 0:00）
  const iso = dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3T00:00:00Z');
  return new Date(iso);
}

const JST_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * 繰り返しインスタンスの日付サフィックスを生成（決定論的 ID 用）。
 * - 全日イベント: _RYYYYMMDD（JST 日付）
 * - 時間指定: _RYYYYMMDDTHHmmss（UTC ISO 表記）
 *
 * ADR-008: 全日 suffix は JST 日付基準にすることで、修正前の UTC 基準 suffix と
 * 偶然一致するため、既存タグ付き Google 予定との originalId 衝突を回避できる。
 */
export function instanceDateSuffix(date: Date, isAllDay: boolean): string {
  if (isAllDay) {
    const parts = JST_DATE_FMT.formatToParts(date);
    const y = parts.find((p) => p.type === 'year')!.value;
    const m = parts.find((p) => p.type === 'month')!.value;
    const d = parts.find((p) => p.type === 'day')!.value;
    return `_R${y}${m}${d}`;
  }
  const iso = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
  return `_R${iso}`;
}
