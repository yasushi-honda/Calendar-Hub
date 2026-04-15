#!/bin/bash
set -euo pipefail

# GCP 予算アラート セットアップ（Issue #76）
#
# 冪等: 既存 budget (displayName 一致) は update、無ければ create。
# 前提: gcloud 認証済み（hy.unimail.11@gmail.com）+ billing API 有効化済み。
#
# 通貨は billing account の currencyCode に従う（calendar-hub-prod は JPY）。
# 金額・閾値は環境変数で上書き可能。

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-01817F-AFD15C-E57676}"
DISPLAY_NAME="${BUDGET_DISPLAY_NAME:-Calendar Hub Monthly}"
BUDGET_UNITS="${BUDGET_UNITS:-10}"         # 10 単位（JPY の場合 ¥10）
THRESHOLDS="${THRESHOLDS:-0.5,0.9,1.0}"   # 50% / 90% / 100%
NOTIFICATION_CHANNEL="${NOTIFICATION_CHANNEL:-projects/calendar-hub-prod/notificationChannels/11987628746704320713}"

echo "=== Setting up GCP budget alert ==="
echo "Project:  $PROJECT_ID"
echo "Billing:  $BILLING_ACCOUNT"
echo "Amount:   ${BUDGET_UNITS} (billing account currency)"
echo "Channel:  $NOTIFICATION_CHANNEL"
echo "Thresholds: $THRESHOLDS"
echo ""

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required" >&2
  exit 1
fi

gcloud services enable billingbudgets.googleapis.com --project="$PROJECT_ID" --quiet

# `gcloud billing budgets` は alpha/beta で挙動・フラグが揺れるため、REST API を直接叩く。
# この方が冪等制御も書きやすい。
ACCESS_TOKEN=$(gcloud auth print-access-token)
API_BASE="https://billingbudgets.googleapis.com/v1/billingAccounts/${BILLING_ACCOUNT}/budgets"

# 1. 既存 budget を displayName で検索（ページング対応）
# billing account 全体の budget 数が 1 ページに収まらなくなる可能性があるため、
# nextPageToken を追いかけて全件走査する。
EXISTING=""
PAGE_TOKEN=""
while :; do
  URL="${API_BASE}?pageSize=100"
  if [ -n "$PAGE_TOKEN" ]; then
    URL="${URL}&pageToken=${PAGE_TOKEN}"
  fi
  BUDGETS_JSON=$(curl -sSf -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "x-goog-user-project: ${PROJECT_ID}" "$URL")
  MATCH=$(printf '%s' "$BUDGETS_JSON" \
    | jq -r --arg name "$DISPLAY_NAME" '.budgets[]? | select(.displayName == $name) | .name' \
    | head -n 1)
  if [ -n "$MATCH" ]; then
    EXISTING="$MATCH"
    break
  fi
  PAGE_TOKEN=$(printf '%s' "$BUDGETS_JSON" | jq -r '.nextPageToken // empty')
  [ -z "$PAGE_TOKEN" ] && break
done

# 2. body を jq で構築（閾値展開・資源名・フィルタの quote を安全に）
IFS=',' read -r -a THR_ARR <<< "$THRESHOLDS"
THRESHOLD_JSON=$(printf '%s\n' "${THR_ARR[@]}" \
  | jq -R -c 'tonumber | {spendBasis: "CURRENT_SPEND", thresholdPercent: .}' \
  | jq -s '.')

BODY=$(jq -nc \
  --arg display "$DISPLAY_NAME" \
  --arg units "$BUDGET_UNITS" \
  --arg project "projects/${PROJECT_ID}" \
  --arg channel "$NOTIFICATION_CHANNEL" \
  --argjson thresholds "$THRESHOLD_JSON" \
  '{
    displayName: $display,
    budgetFilter: {
      projects: [$project],
      calendarPeriod: "MONTH"
    },
    amount: {
      specifiedAmount: {
        units: $units
      }
    },
    thresholdRules: $thresholds,
    notificationsRule: {
      monitoringNotificationChannels: [$channel],
      disableDefaultIamRecipients: true
    }
  }')

# API 呼び出しを body + HTTP ステータスに分離し、非 2xx なら body をログして exit する。
# `curl -sSf | jq '.name // "updated"'` だと -f + pipefail で失敗自体は検知するが、
# API エラー body が消えて原因追跡が難しい。明示的に status を確認する。
call_api() {
  local method="$1"
  local url="$2"
  local payload="$3"
  local http_code response_file
  response_file=$(mktemp)
  http_code=$(curl -sS -o "$response_file" -w '%{http_code}' -X "$method" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "x-goog-user-project: ${PROJECT_ID}" \
    -H "Content-Type: application/json" \
    "$url" -d "$payload")
  if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
    echo "ERROR: $method $url failed (HTTP $http_code)" >&2
    cat "$response_file" >&2
    rm -f "$response_file"
    exit 1
  fi
  jq -r '.name // "ok"' < "$response_file"
  rm -f "$response_file"
}

if [ -n "$EXISTING" ]; then
  echo "Updating budget: $(basename "$EXISTING")"
  call_api PATCH \
    "https://billingbudgets.googleapis.com/v1/${EXISTING}?updateMask=displayName,budgetFilter,amount,thresholdRules,notificationsRule" \
    "$BODY"
else
  echo "Creating budget"
  call_api POST "$API_BASE" "$BODY"
fi

echo ""
echo "=== Setup complete ==="
echo "Verify:"
echo "  gcloud billing budgets list --billing-account=${BILLING_ACCOUNT}"
echo "  または: https://console.cloud.google.com/billing/${BILLING_ACCOUNT}/budgets"
