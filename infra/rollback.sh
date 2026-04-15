#!/bin/bash
set -euo pipefail

# Cloud Run サービスのロールバックユーティリティ（Issue #78）
#
# 使用例:
#   bash infra/rollback.sh api                    # API を直前のリビジョンへ
#   bash infra/rollback.sh web                    # Web を直前のリビジョンへ
#   bash infra/rollback.sh api 00047-qcm          # API を指定リビジョンへ
#   bash infra/rollback.sh api --list             # API の候補リビジョン表示
#
# サービス指定の suffix はオプション（`00047-qcm` または `calendar-hub-api-00047-qcm` どちらも可）。

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
REGION="${GCP_REGION:-asia-northeast1}"

TARGET_SVC="${1:-}"
case "$TARGET_SVC" in
  api) SERVICE="calendar-hub-api" ;;
  web) SERVICE="calendar-hub-web" ;;
  *)
    echo "Usage: $0 <api|web> [<revision-suffix>|--list]" >&2
    exit 2
    ;;
esac

shift
ARG="${1:-}"

if [ "$ARG" = "--list" ]; then
  gcloud run revisions list --service="$SERVICE" \
    --region="$REGION" --project="$PROJECT_ID" \
    --format="table(name,creationTimestamp.date('%Y-%m-%d %H:%M'),metadata.labels.'serving.knative.dev/routeCurrentlyAssignedRevisionLabel')" \
    --limit=10
  exit 0
fi

# 現行 active revision（traffic が 100% 流れている先を取る。`latestReadyRevisionName`
# はデプロイ最新を指すだけで、rollback 後も値は変わらないため使えない）。
CURRENT=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.traffic[0].revisionName)")

if [ -z "$CURRENT" ]; then
  echo "ERROR: could not resolve current traffic revision for $SERVICE" >&2
  exit 1
fi

# ターゲット revision を決定
if [ -n "$ARG" ]; then
  # ユーザー指定（suffix または完全名）。先頭に service prefix 付ける
  case "$ARG" in
    "$SERVICE"-*) TARGET="$ARG" ;;
    *) TARGET="${SERVICE}-${ARG}" ;;
  esac
else
  # 引数なし: 直前（2番目に新しい）リビジョン
  TARGET=$(gcloud run revisions list --service="$SERVICE" \
    --region="$REGION" --project="$PROJECT_ID" \
    --format="value(name)" --sort-by="~creationTimestamp" --limit=2 \
    | sed -n '2p')
  if [ -z "$TARGET" ]; then
    echo "ERROR: no previous revision found for $SERVICE" >&2
    exit 1
  fi
fi

if [ "$CURRENT" = "$TARGET" ]; then
  echo "No-op: $SERVICE is already on $TARGET"
  exit 0
fi

echo "Rolling back $SERVICE:"
echo "  current → $CURRENT"
echo "  target  → $TARGET"
echo ""

START=$(date +%s)
gcloud run services update-traffic "$SERVICE" \
  --project="$PROJECT_ID" --region="$REGION" \
  --to-revisions="${TARGET}=100" --quiet

ELAPSED=$(( $(date +%s) - START ))

NEW=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.traffic[0].revisionName)")

echo ""
echo "=== Rollback complete ==="
echo "  service       = $SERVICE"
echo "  active now    = $NEW (previous: $CURRENT)"
echo "  elapsed       = ${ELAPSED}s"

SERVICE_URL=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.url)")
echo "  verify health = curl -sSf ${SERVICE_URL}/health || echo 'FAILED'"
echo "  restore with  = bash $0 ${TARGET_SVC} ${CURRENT#${SERVICE}-}"
