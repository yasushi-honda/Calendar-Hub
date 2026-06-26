export interface OwnerDisplayNameSource {
  displayName?: string | null;
  email?: string | null;
}

/**
 * Firestore users/{uid} document data から表示名を抽出する。
 *
 * 優先度: displayName > email > 'User'
 *
 * `||` を使うのは空文字 (`displayName: ''`) も fallback したいため。
 * `??` だと undefined/null のみ fallback され、空文字はそのまま返り
 * 確認メールで「主催者: 」が空欄になる bug が発生する。
 */
export function pickOwnerDisplayName(data: OwnerDisplayNameSource | undefined | null): string {
  return data?.displayName || data?.email || 'User';
}
