import pkg from 'rrule';
const { RRuleSet, rrulestr } = pkg;

/**
 * TimeTreeの繰り返しイベント（RRULE形式）を指定期間内のインスタンスに展開する。
 *
 * @param recurrences RRULE/EXDATE文字列の配列（例: ["RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE:20220503T070000Z"]）
 * @param masterStart マスターイベントの開始日時
 * @param masterEnd マスターイベントの終了日時（durationの算出に使用）
 * @param timeMin 展開範囲の開始
 * @param timeMax 展開範囲の終了
 * @returns 各インスタンスの開始/終了日時の配列
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

  const rruleSet = new RRuleSet();

  for (const line of recurrences) {
    if (line.startsWith('RRULE:')) {
      const rule = rrulestr(line, { dtstart: masterStart });
      rruleSet.rrule(rule as InstanceType<typeof pkg.RRule>);
    } else if (line.startsWith('EXDATE:')) {
      // TimeTreeは1行のEXDATEに複数日をカンマで並べる（RFC 5545準拠）
      const dateStr = line.replace('EXDATE:', '');
      for (const d of dateStr.split(',')) {
        const trimmed = d.trim();
        if (trimmed) rruleSet.exdate(parseExdate(trimmed));
      }
    }
  }

  const occurrences = rruleSet.between(timeMin, timeMax, true);

  return occurrences.map((start) => ({
    start,
    end: new Date(start.getTime() + durationMs),
  }));
}

/**
 * EXDATE文字列をDateに変換。
 * 形式: "20220503T070000Z" または "20220503"
 */
function parseExdate(dateStr: string): Date {
  if (dateStr.includes('T')) {
    // 20220503T070000Z → ISO形式に変換
    const iso = dateStr.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/,
      '$1-$2-$3T$4:$5:$6Z',
    );
    return new Date(iso);
  }
  // 20220503 → date-only
  const iso = dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3T00:00:00Z');
  return new Date(iso);
}

/**
 * 繰り返しインスタンスの日付サフィックスを生成（決定論的ID用）。
 * 全日イベント: _RYYYYMMDD
 * 時間指定: _RYYYYMMDDTHHmmss
 */
export function instanceDateSuffix(date: Date, isAllDay: boolean): string {
  if (isAllDay) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `_R${y}${m}${d}`;
  }
  const iso = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
  return `_R${iso}`;
}
