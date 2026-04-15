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
  # 引数なし: "現行以外で最新" のリビジョン。単純に "2番目に新しい" を選ぶと、
  # 前回ロールバック後で traffic が既にその revision に乗っているケースで
  # No-op になってしまうため、現行を除外してから最新を取る。
  TARGET=$(gcloud run revisions list --service="$SERVICE" \
    --region="$REGION" --project="$PROJECT_ID" \
    --format="value(name)" --sort-by="~creationTimestamp" --limit=10 \
    | grep -v -x "$CURRENT" | head -n 1)
  if [ -z "$TARGET" ]; then
    echo "ERROR: no other revision found to roll back to for $SERVICE" >&2
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

# 切替が想定先に適用されたか検証（gcloud が部分的に失敗しても exit 0 することがあるため）。
NEW=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.traffic[0].revisionName)")

if [ "$NEW" != "$TARGET" ]; then
  echo "ERROR: traffic did not move to expected target" >&2
  echo "  expected = $TARGET" >&2
  echo "  observed = $NEW" >&2
  exit 1
fi

# 切替先への疎通確認。API は /health、Web は / を探る。失敗しても exit はしない
# （rollback 目的の時点で元も壊れている可能性があり、情報を出すに留める）。
SERVICE_URL=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.url)")
PROBE_PATH="/health"
[ "$TARGET_SVC" = "web" ] && PROBE_PATH="/"
if HEALTH_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${SERVICE_URL}${PROBE_PATH}"); then
  HEALTH_STATUS="HTTP ${HEALTH_CODE}"
else
  HEALTH_STATUS="probe failed"
fi

echo ""
echo "=== Rollback complete ==="
echo "  service       = $SERVICE"
echo "  active now    = $NEW (previous: $CURRENT)"
echo "  elapsed       = ${ELAPSED}s"
echo "  probe         = ${SERVICE_URL}${PROBE_PATH} → ${HEALTH_STATUS}"
echo "  restore with  = bash $0 ${TARGET_SVC} ${CURRENT#${SERVICE}-}"

if [ "$HEALTH_STATUS" != "HTTP 200" ]; then
  echo ""
  echo "⚠️  Health probe did not return 200. Target revision may be unhealthy." >&2
  echo "   Consider restoring immediately with the command above." >&2
  exit 2
fi
