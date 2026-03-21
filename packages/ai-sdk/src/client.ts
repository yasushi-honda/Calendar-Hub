import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

/**
 * Vertex AI 経由の Gemini クライアントを取得。
 * ADC (Application Default Credentials) で認証。
 * 環境変数:
 *   GOOGLE_GENAI_USE_VERTEXAI=true
 *   GOOGLE_CLOUD_PROJECT=calendar-hub-prod
 *   GOOGLE_CLOUD_LOCATION=us-central1
 */
export function getGenAIClient(): GoogleGenAI {
  if (client) return client;

  // Vertex AI モードの場合
  const useVertexAI = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';

  if (useVertexAI) {
    client = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT ?? 'calendar-hub-prod',
      location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    });
  } else {
    // API Key モード（ローカル開発用）
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Either set GOOGLE_GENAI_USE_VERTEXAI=true for ADC, or set GOOGLE_GENAI_API_KEY',
      );
    }
    client = new GoogleGenAI({ apiKey });
  }

  return client;
}

export const MODEL_ID = process.env.GEMINI_MODEL_ID ?? 'gemini-2.5-flash';
