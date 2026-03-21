import type { CalendarEvent, UserProfile, FreeSlot } from '@calendar-hub/shared';

export const SYSTEM_PROMPT = `あなたはスケジュール最適化アシスタントです。
ユーザーの仕事と生活のバランスを尊重し、無理のないスケジュールを提案します。

提案時の原則:
1. 連続会議の間には最低15分の休憩を確保する
2. ユーザー設定の集中時間帯には会議を入れない
3. 睡眠・食事時間を侵食する提案はしない
4. 移動が伴う予定の前後にはバッファ時間を設ける
5. 週の労働時間の上限を考慮する

必ず以下のJSON形式で回答してください。JSON以外のテキストは含めないでください。
{
  "suggestions": [
    {
      "type": "schedule" | "break" | "task",
      "title": "提案タイトル",
      "description": "提案の説明",
      "start": "ISO8601形式",
      "end": "ISO8601形式",
      "reasoning": "この提案の理由",
      "priority": "high" | "medium" | "low"
    }
  ],
  "insights": "全体的なスケジュールに対するコメント"
}`;

export function buildUserPrompt(params: {
  profile: UserProfile | null;
  events: CalendarEvent[];
  freeSlots: FreeSlot[];
  userRequest?: string;
}): string {
  const { profile, events, freeSlots, userRequest } = params;

  const eventsForPrompt = events.slice(0, 50).map((e) => ({
    title: e.title,
    start: e.start instanceof Date ? e.start.toISOString() : e.start,
    end: e.end instanceof Date ? e.end.toISOString() : e.end,
    isAllDay: e.isAllDay,
    source: e.source,
  }));

  const slotsForPrompt = freeSlots.slice(0, 30).map((s) => ({
    start: s.start instanceof Date ? s.start.toISOString() : s.start,
    end: s.end instanceof Date ? s.end.toISOString() : s.end,
    durationMinutes: s.durationMinutes,
  }));

  let prompt = '';

  if (profile) {
    prompt += `## ユーザープロファイル\n${JSON.stringify(profile, null, 2)}\n\n`;
  }

  prompt += `## 現在の予定\n${JSON.stringify(eventsForPrompt, null, 2)}\n\n`;
  prompt += `## 空き時間スロット\n${JSON.stringify(slotsForPrompt, null, 2)}\n\n`;
  prompt += `## リクエスト\n${userRequest ?? '空き時間の有効活用を提案してください'}\n`;

  return prompt;
}
