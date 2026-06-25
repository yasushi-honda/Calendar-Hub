#!/bin/bash
set -euo pipefail

# Cloud Monitoring alerts for Calendar Hub sync health (#65)
#
# 冪等: 既存リソースは作成せずスキップ、設定更新は `update`。
# 前提: gcloud 認証済み + 必要APIが有効化されている。

PROJECT_ID="${GCP_PROJECT_ID:-calendar-hub-prod}"
SERVICE_NAME="${SERVICE_NAME:-calendar-hub-api}"
NOTIFICATION_EMAIL="${NOTIFICATION_EMAIL:-hy.unimail.11@gmail.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Setting up Calendar Hub monitoring ==="
echo "Project: $PROJECT_ID | Service: $SERVICE_NAME | Email: $NOTIFICATION_EMAIL"

# 必要APIの有効化（冪等）
gcloud services enable \
  monitoring.googleapis.com \
  logging.googleapis.com \
  --project="$PROJECT_ID" --quiet

# --- 1. Log-based counter metrics ---

create_or_update_metric() {
  local name="$1"
  local description="$2"
  local filter="$3"
  # 第4引数: ユーザー定義ラベル YAML 断片 (任意)。
  # 指定時は --config-from-file 経由で labelExtractors + metricDescriptor.labels を反映。
  # 例: see calendar_hub_tt_session_expired below.
  local labels_yaml="${4:-}"

  if [ -z "$labels_yaml" ]; then
    # Simple counter mode (既存 4 metrics)
    if gcloud logging metrics describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
      echo "Updating log metric: $name"
      gcloud logging metrics update "$name" \
        --project="$PROJECT_ID" \
        --description="$description" \
        --log-filter="$filter" --quiet
    else
      echo "Creating log metric: $name"
      gcloud logging metrics create "$name" \
        --project="$PROJECT_ID" \
        --description="$description" \
        --log-filter="$filter"
    fi
    return
  fi

  # Advanced mode: labelExtractors + custom labels via config file.
  # description / filter は literal block scalar (|-) で記述し、YAML plain scalar の
  # コメント解釈 (`, #79` → comment) や flow indicator 誤解釈を回避。
  # GCP 仕様: 既存ラベルは削除/変更不可だが、追加は可能 (Issue #79 Future Work 実装時に確認済み)。
  local tmpfile rc
  tmpfile=$(mktemp)
  # trap RETURN は global 状態で他関数の return にも fire するため使わず、明示 cleanup する。
  cat > "$tmpfile" <<EOF
name: ${name}
description: |-
  ${description}
filter: |-
  ${filter}
${labels_yaml}
EOF

  if gcloud logging metrics describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Updating log metric (with labels): $name"
    gcloud logging metrics update "$name" \
      --project="$PROJECT_ID" \
      --config-from-file="$tmpfile" --quiet
    rc=$?
  else
    echo "Creating log metric (with labels): $name"
    gcloud logging metrics create "$name" \
      --project="$PROJECT_ID" \
      --config-from-file="$tmpfile"
    rc=$?
  fi
  rm -f "$tmpfile"
  return $rc
}

BASE_FILTER="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE_NAME}\""

create_or_update_metric \
  "calendar_hub_rrule_skip" \
  "Count of [RRULE-SKIP] occurrences (recurring event expansion failed)" \
  "${BASE_FILTER} AND textPayload:\"[RRULE-SKIP]\""

create_or_update_metric \
  "calendar_hub_sync_failed" \
  "Count of 'Sync failed for ...' occurrences (full sync cycle error)" \
  "${BASE_FILTER} AND textPayload:\"Sync failed for\""

create_or_update_metric \
  "calendar_hub_sync_gap" \
  "Count of [SYNC-GAP] occurrences (tt != tagged+created-deleted)" \
  "${BASE_FILTER} AND textPayload:\"[SYNC-GAP]\""

create_or_update_metric \
  "calendar_hub_mail_fail" \
  "Count of [MAIL-FAIL] occurrences (Gmail OAuth2 send failure, #74)" \
  "${BASE_FILTER} AND textPayload:\"[MAIL-FAIL]\""

create_or_update_metric \
  "calendar_hub_tt_session_expired" \
  "Count of [TT-SESSION-EXPIRED] occurrences (TimeTree cookie expired, #79). accountId label enables per-account alert grouping (ADR-009 Future Work)." \
  "${BASE_FILTER} AND textPayload:\"[TT-SESSION-EXPIRED]\"" \
  'labelExtractors:
  accountId: REGEXP_EXTRACT(textPayload, "accountId=([^ ]+)")
metricDescriptor:
  labels:
  - key: accountId
    valueType: STRING
    description: TimeTree connected account identifier (timetree_<id>)
  metricKind: DELTA
  valueType: INT64'

# --- 2. Notification channel (email) ---

# 既存のチャネルを検索。権限失敗を NOT_FOUND と取り違えて重複作成しないよう、
# gcloud list の終了コードを明示的に確認する。
# csv[no-heading] で区切りをカンマに固定（value(...) はgcloudバージョン依存でタブ/空白）。
if ! channels_out=$(gcloud alpha monitoring channels list \
  --project="$PROJECT_ID" \
  --format="csv[no-heading](name,labels.email_address)" 2>&1); then
  echo "ERROR: failed to list notification channels (auth or API access issue):" >&2
  echo "$channels_out" >&2
  exit 1
fi
EXISTING_CHANNEL=$(echo "$channels_out" \
  | awk -F, -v email="$NOTIFICATION_EMAIL" '$2 == email {print $1; exit}')

if [ -n "$EXISTING_CHANNEL" ]; then
  echo "Using existing notification channel: $EXISTING_CHANNEL"
  CHANNEL_NAME="$EXISTING_CHANNEL"
else
  echo "Creating notification channel for $NOTIFICATION_EMAIL"
  CHANNEL_NAME=$(gcloud alpha monitoring channels create \
    --project="$PROJECT_ID" \
    --display-name="Calendar Hub Admin Email" \
    --type=email \
    --channel-labels="email_address=${NOTIFICATION_EMAIL}" \
    --format="value(name)")
  echo "Created: $CHANNEL_NAME"
fi

# verify 状態チェック: 未 VERIFIED だと alert は発火しても通知が届かない
VERIFY_STATUS=$(gcloud alpha monitoring channels describe "$CHANNEL_NAME" \
  --project="$PROJECT_ID" --format="value(verificationStatus)" 2>/dev/null || echo "UNKNOWN")
if [ "$VERIFY_STATUS" != "VERIFIED" ]; then
  echo ""
  echo "⚠️  Notification channel is NOT verified (status='$VERIFY_STATUS')"
  echo "   Sending verification code to $NOTIFICATION_EMAIL ..."

  # sendVerificationCode API を明示的に呼ぶ（GCP は channel 作成時に自動送信しない）
  ACCESS_TOKEN=$(gcloud auth print-access-token 2>/dev/null)
  if [ -z "$ACCESS_TOKEN" ]; then
    echo "   ERROR: Failed to obtain access token; cannot trigger verification email." >&2
  else
    if curl -sSf -X POST \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      "https://monitoring.googleapis.com/v3/${CHANNEL_NAME}:sendVerificationCode" \
      -d '{}' >/dev/null; then
      echo "   ✓ Verification email sent."
    else
      echo "   ERROR: sendVerificationCode API call failed." >&2
    fi
  fi

  cat <<EOF

   Next steps:
   1. Check inbox of $NOTIFICATION_EMAIL for a mail from "Google Cloud Alerting"
      (subject: "Your alerting verification code").
   2. Extract the code (format: G-XXXXXX) and submit it:

      CODE=G-XXXXXX
      curl -X POST \\
        -H "Authorization: Bearer \$(gcloud auth print-access-token)" \\
        -H "Content-Type: application/json" \\
        "https://monitoring.googleapis.com/v3/${CHANNEL_NAME}:verify" \\
        -d "{\\"code\\": \\"\$CODE\\"}"

   3. Confirm verified:
        gcloud alpha monitoring channels describe ${CHANNEL_NAME} \\
          --project=${PROJECT_ID} --format='value(verificationStatus)'
      Expected output: VERIFIED

   Until VERIFIED, alert policies fire but emails are silently dropped.

EOF
fi

# --- 3. Alert policies ---

apply_policy() {
  local policy_file="$1"
  local display_name
  display_name=$(grep '^displayName:' "$policy_file" | head -1 | sed "s/displayName: *//; s/^['\"]//; s/['\"]$//")

  # 既存ポリシーを表示名で検索。権限失敗時は明示的にエラー終了（重複作成防止）。
  # csv[no-heading] で区切りをカンマに固定（displayName にカンマを含まない前提）。
  local policies_out
  if ! policies_out=$(gcloud alpha monitoring policies list \
    --project="$PROJECT_ID" \
    --format="csv[no-heading](name,displayName)" 2>&1); then
    echo "ERROR: failed to list alert policies:" >&2
    echo "$policies_out" >&2
    exit 1
  fi
  local existing
  existing=$(echo "$policies_out" \
    | awk -F, -v name="$display_name" '$2 == name {print $1; exit}')

  # ポリシーファイルに notificationChannels を動的に追加して適用。
  # trap で関数終了時に確実にクリーンアップ（update/create 失敗時も /tmp にゴミを残さない）。
  local tmpfile
  tmpfile=$(mktemp)
  trap "rm -f '$tmpfile'" RETURN
  {
    cat "$policy_file"
    echo "notificationChannels:"
    echo "  - \"${CHANNEL_NAME}\""
  } > "$tmpfile"

  if [ -n "$existing" ]; then
    echo "Updating policy: $display_name"
    gcloud alpha monitoring policies update "$existing" \
      --project="$PROJECT_ID" \
      --policy-from-file="$tmpfile" --quiet
  else
    echo "Creating policy: $display_name"
    gcloud alpha monitoring policies create \
      --project="$PROJECT_ID" \
      --policy-from-file="$tmpfile"
  fi
}

# 旧 displayName で残っているポリシーがあれば削除 (ADR-009 Future Work の rename 移行用、冪等)。
# 1 回目の実行で旧ポリシーを掃除、2 回目以降は no-op (旧 displayName 不在で skip)。
# list 失敗時は fail-hard: silent skip すると旧 policy + 新 policy が並存して
# session 切れ 1 件で「全体集計 alert (3+ 旧)」と「per-account alert (1+ 新)」が
# 二重発火するため。
cleanup_legacy_policy() {
  local legacy_name="$1"
  local policies_out
  if ! policies_out=$(gcloud alpha monitoring policies list \
    --project="$PROJECT_ID" \
    --format="csv[no-heading](name,displayName)" 2>&1); then
    echo "ERROR: failed to list policies for legacy cleanup ($legacy_name):" >&2
    echo "$policies_out" >&2
    exit 1
  fi
  local legacy_id
  legacy_id=$(echo "$policies_out" \
    | awk -F, -v name="$legacy_name" '$2 == name {print $1; exit}')
  if [ -n "$legacy_id" ]; then
    echo "Deleting legacy policy: $legacy_name"
    gcloud alpha monitoring policies delete "$legacy_id" \
      --project="$PROJECT_ID" --quiet
  fi
}

cleanup_legacy_policy "[Calendar Hub] TimeTree session expired (24h ≥ 3)"

apply_policy "${SCRIPT_DIR}/alert-policies/rrule-skip.yaml"
apply_policy "${SCRIPT_DIR}/alert-policies/sync-failed.yaml"
apply_policy "${SCRIPT_DIR}/alert-policies/sync-gap.yaml"
apply_policy "${SCRIPT_DIR}/alert-policies/mail-fail.yaml"
apply_policy "${SCRIPT_DIR}/alert-policies/api-5xx-rate.yaml"
apply_policy "${SCRIPT_DIR}/alert-policies/api-4xx-spike.yaml"
apply_policy "${SCRIPT_DIR}/alert-policies/api-latency-p99.yaml"
apply_policy "${SCRIPT_DIR}/alert-policies/tt-session-expired.yaml"

echo ""
echo "=== Monitoring setup complete ==="
echo ""
echo "Verify:"
echo "  gcloud logging metrics list --project=$PROJECT_ID --filter='name:calendar_hub'"
echo "  gcloud alpha monitoring policies list --project=$PROJECT_ID --filter='displayName:Calendar Hub'"
echo ""
echo "Channel verification (if not already VERIFIED above):"
echo "  Status check: gcloud alpha monitoring channels describe $CHANNEL_NAME \\"
echo "    --project=$PROJECT_ID --format='value(verificationStatus)'"
