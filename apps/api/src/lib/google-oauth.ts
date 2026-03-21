import { google } from 'googleapis';

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:8080/api/auth/callback/google',
  );
}

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function generateAuthUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

export interface OAuthTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
}

export async function exchangeCode(code: string): Promise<OAuthTokens> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens as OAuthTokens;
}

export async function getGoogleUserInfo(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get user info: ${res.status}`);
  return (await res.json()) as { id: string; email: string; name: string };
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return credentials as OAuthTokens;
}
