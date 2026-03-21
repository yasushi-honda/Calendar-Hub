import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let client: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!client) {
    client = new SecretManagerServiceClient();
  }
  return client;
}

/**
 * GCP Secret Managerからシークレット値を取得
 * ローカル開発では環境変数にフォールバック
 */
export async function getSecret(secretName: string, envFallback?: string): Promise<string> {
  // 環境変数が設定されていればそちらを優先（ローカル開発用）
  if (envFallback) {
    const envValue = process.env[envFallback];
    if (envValue) return envValue;
  }

  const projectId = process.env.GCP_PROJECT_ID ?? 'calendar-hub-prod';

  try {
    const [version] = await getClient().accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
    });

    const payload = version.payload?.data;
    if (!payload) throw new Error(`Secret ${secretName} has no payload`);

    return typeof payload === 'string' ? payload : payload.toString('utf8');
  } catch (err) {
    throw new Error(`Failed to access secret "${secretName}": ${err}`);
  }
}
