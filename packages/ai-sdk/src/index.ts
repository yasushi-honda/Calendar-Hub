// Calendar Hub - AI SDK
// Vertex AI Gemini 2.5 Flash integration via @google/genai

export {
  type AiSuggestion,
  type AiSuggestionType,
  type AiSuggestionStatus,
} from '@calendar-hub/shared';

export { getGenAIClient, MODEL_ID } from './client.js';
export {
  generateSuggestions,
  type AiSuggestionResult,
  type GenerateSuggestionsResponse,
} from './suggest.js';
export { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
