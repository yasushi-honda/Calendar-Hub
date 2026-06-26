#!/bin/bash
set -euo pipefail

# Calendar Hub Firestore composite indexes 作成
#
# 冪等: 既存 index は再作成しない (gcloud は AlreadyExists を warning として無視)。
# 前提: gcloud 認証済み + firestore.googleapis.com 有効化済み。
#
# 経緯:
# - `bookingMirrorLinks` collection は `listConnectedAccounts` 同等パターンの query
#     `where('ownerUid','==',uid).orderBy('createdAt','desc')`
#   を発行するが、初回本番稼働時に composite index 不在で 500 エラーが発生 (PR #162)。
# - 既存 collection 用 index は Firebase Console で個別作成済みのため、
#   本 script は新規 collection 用の追加分のみ管理する。
#
# 新環境構築 (e.g. staging / disaster recovery) 時は本 script を一度実行すれば
# 同等の query が機能する状態になる。

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"

command -v gcloud >/dev/null 2>&1 || {
  echo "::error::gcloud CLI not found"
  exit 127
}

echo "=== Firestore composite indexes setup (project: $PROJECT_ID) ==="

# bookingMirrorLinks: list query (owner の link 一覧、新しい順)
echo "[1/1] bookingMirrorLinks: ownerUid + createdAt DESC"
gcloud firestore indexes composite create \
  --collection-group=bookingMirrorLinks \
  --field-config=field-path=ownerUid,order=ASCENDING \
  --field-config=field-path=createdAt,order=DESCENDING \
  --project="$PROJECT_ID" \
  --async 2>&1 | grep -v "ALREADY_EXISTS" || true

echo ""
echo "=== Setup Complete ==="
echo "Index 作成は非同期で実行されます。状態確認:"
echo "  gcloud firestore indexes composite list --project=$PROJECT_ID | grep bookingMirrorLinks"
echo "READY になれば反映完了。通常 1-10 分です。"
