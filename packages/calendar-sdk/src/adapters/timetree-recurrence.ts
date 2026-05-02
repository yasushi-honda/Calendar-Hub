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
 * 形式（RFC 5545 + TimeTree 実観測）:
 * - "20220503T070000Z": UTC instant として解釈 → JST wall-clock の floating 表現に +9h で変換
 * - "20220503T070000":  Z なし date-time。既に floating wall-clock として扱い、変換しない
 * - "20220503":         date-only。JST 日付として扱い、JST 0:00 の floating 表現を返す
 *   （toFloatingJst を経由しないのは、入力が既に JST 日付（wall-clock）で時刻成分がないため）
 */
function parseExdateFloating(dateStr: string): Date {
  const dateTimeMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (dateTimeMatch) {
    const [, y, m, d, hh, mm, ss, z] = dateTimeMatch;
    const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
    if (z === 'Z') {
      // UTC instant: floating JST に +9h で変換
      return toFloatingJst(new Date(iso));
    }
    // Z なし: 既に floating wall-clock 表現として扱う（二重補正を避ける）
    return new Date(iso);
  }
  const dateOnlyMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return new Date(`${y}-${m}-${d}T00:00:00Z`);
  }
  throw new Error(`Invalid EXDATE format: ${dateStr}`);
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
 * - 時間指定: _RYYYYMMDDTHHmmss（UTC ISO 表記、本 PR では非変更）
 *
 * ADR-008: **全日イベントについて**、修正前の UTC 日付ベース suffix と修正後の JST 日付
 * ベース suffix が、JST 0:00 開始ケースでも JST 9:00 以降ケースでも一致するため、
 * 既存タグ付き Google 予定との originalId 衝突を回避できる。
 * 時間指定イベントは UTC ISO のままなので、JST 0:00-8:59 帯の繰り返しでは旧 suffix と
 * 新 suffix が異なり、tagMap マッチが外れて create/delete 経路に寄る点に注意。
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
