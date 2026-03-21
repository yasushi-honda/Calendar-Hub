import type { CalendarEvent, UserProfile, FreeSlot, AiSuggestionType } from '@calendar-hub/shared';
import { getGenAIClient, MODEL_ID } from './client.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';

export interface AiSuggestionResult {
  type: AiSuggestionType;
  title: string;
  description: string;
  start: string;
  end: string;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
}

export interface GenerateSuggestionsResponse {
  suggestions: AiSuggestionResult[];
  insights: string;
}

export async function generateSuggestions(params: {
  profile: UserProfile | null;
  events: CalendarEvent[];
  freeSlots: FreeSlot[];
  userRequest?: string;
}): Promise<GenerateSuggestionsResponse> {
  const client = getGenAIClient();
  const userPrompt = buildUserPrompt(params);

  const response = await client.models.generateContent({
    model: MODEL_ID,
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });

  const text = response.text ?? '';

  // JSONブロックを抽出（```json ... ``` またはプレーンJSON、非貪欲マッチ）
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*?\})\s*$/);
  if (!jsonMatch) {
    throw new Error('AI response did not contain valid JSON');
  }

  let parsed: GenerateSuggestionsResponse;
  try {
    parsed = JSON.parse(jsonMatch[1]) as GenerateSuggestionsResponse;
  } catch {
    throw new Error(`AI response contained invalid JSON: ${jsonMatch[1].slice(0, 200)}`);
  }

  // バリデーション
  if (!Array.isArray(parsed.suggestions)) {
    throw new Error('AI response missing suggestions array');
  }

  return {
    suggestions: parsed.suggestions.map((s) => ({
      type: validateType(s.type),
      title: String(s.title ?? ''),
      description: String(s.description ?? ''),
      start: String(s.start ?? ''),
      end: String(s.end ?? ''),
      reasoning: String(s.reasoning ?? ''),
      priority: validatePriority(s.priority),
    })),
    insights: String(parsed.insights ?? ''),
  };
}

function validateType(type: string): AiSuggestionType {
  if (type === 'schedule' || type === 'break' || type === 'task') return type;
  return 'schedule';
}

function validatePriority(p: string): 'high' | 'medium' | 'low' {
  if (p === 'high' || p === 'medium' || p === 'low') return p;
  return 'medium';
}
