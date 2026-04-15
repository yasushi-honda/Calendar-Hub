# ADR-006: API 健全性アラート（同期 + 全 API ルート）

- Status: Accepted
- Date: 2026-04-14（#65 同期系）/ 2026-04-15（#77 API全般に拡張）
- Issue: #65 / #77

## Context

PR #64 の事象（`parseExdate` のカンマ区切り未対応で `【専門学校】専攻生` 等が静かに未同期）は、
ユーザーの目視報告で初めて発覚した。本番運用として、静かな同期欠落を人間の報告に依存して
検知する現状は許容できない。能動的アラートが必要（#65）。

## Decision

Cloud Logging ベースのメトリクス + Cloud Monitoring アラートポリシーで、以下3件を
自動検知してメール通知する。

| #   | 検知対象              | ログフィルタ                    | 発報閾値     |
| --- | --------------------- | ------------------------------- | ------------ |
| 1   | `[RRULE-SKIP]`        | `textPayload:"[RRULE-SKIP]"`    | 1時間内 ≥1件 |
| 2   | `Sync failed for ...` | `textPayload:"Sync failed for"` | 10分内 ≥1件  |
| 3   | `[SYNC-GAP]`          | `textPayload:"[SYNC-GAP]"`      | 15分以上継続 |

### SYNC-GAP の定義（実装）

同期サイクル実行後に以下の不変条件を検証し、破れたらログ出力:

```
postSyncTagged = taggedBefore + stats.created - stats.deleted
gap.diff = ttCount - postSyncTagged
gap.hasGap = (gap.diff !== 0)
```

- `diff > 0`: TT側にあるのにGoogle側に反映できていない（create失敗等）
- `diff < 0`: Google側に過剰タグ残存（delete漏れ or 外部要因）
- ロジックは `packages`... ではなく `apps/api/src/lib/timetree-google-sync.ts` の純粋関数
  `computeSyncGap` として切り出し、ユニットテスト済み（境界値 ±1、全ゼロ、混合シナリオ）

### 通知

- 種別: Email（Slack/PagerDuty は後続対応）
- 宛先: `hy.unimail.11@gmail.com`（GCPアカウントと同一）
- Auto-close: 24時間（障害復旧後に自動クローズ）

## Alternatives Considered

| 案                                                  | 採否   | 理由                                                                                                          |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| Terraform で IaC 化                                 | 不採用 | 本リポジトリは現状 gcloud スクリプト主体。単体追加のためだけに TF 導入するコストに見合わない                  |
| `tt != tagged` を `[SYNC-STATS]` の regex で detect | 不採用 | Cloud Logging の value extractor は単一値のみ、差分計算不可。事後チェック用のログを明示的に emit する方が堅牢 |
| status='partial' を Firestore 側で監視              | 不採用 | Cloud Logging に一元化した方がアラート基盤が単一、運用が単純                                                  |

## Consequences

### Positive

- 静かな同期欠落（PR #64 相当）が即時検知される
- `[SYNC-GAP]` は事後チェックなので「sync は実行されたが欠落」を直接表現
- `setup-monitoring.sh` は冪等、CI/CD から呼び出し可能な構造

### Negative

- ログベースメトリクスは Cloud Logging からの抽出に数分遅延
- メール通知は即時性が低い（Slack化は Issue として別途）
- `computeSyncGap` は `stats.updated`（タグのみ更新）を考慮しない。tagged前の数に含まれる前提のため現状は問題なし（JSDoc に明記）。更新で tag を付け替えるロジックが入る場合は要見直し

### アラート間の独立性

**SYNC-GAP は RRULE-SKIP を包含しない。** `computeSyncGap` に渡す `ttCount` は
`ttEvents.length`（展開後配列長）であり、RRULE展開で例外が発生して SKIP されたイベントは
`ttEvents` に含まれない。結果として「RRULE-SKIP が発生したが SYNC-GAP は diff=0」という
状態が起こり得る。

これは意図的な設計: RRULE-SKIP と SYNC-GAP は**独立したアラート**として両立させ、
どちらか一方の見逃しを相互に補完する。片方のアラートが「欠落全てを捕捉する」前提を
置かない。

### 閾値の根拠

| 項目                                  | 設計値                         | 根拠                                                                                   |
| ------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| RRULE-SKIP の `alignmentPeriod=3600s` | 1時間                          | 例外型のイベントは日次レベルで問題ないが、ライブラリバグ等の連続発火に備え短めに       |
| Sync failed の `alignmentPeriod=60s`  | ほぼ即時                       | Issue #65 AC「即時」要件。認証失敗等の一時障害で誤報する可能性は許容                   |
| SYNC-GAP の `duration=900s`           | 3サイクル（sync 5min間隔想定） | 1サイクル単発は実行タイミング / Cloud Logging 遅延の揺らぎで発生しうる。継続時のみ発報 |
| SYNC-GAP の `alignmentPeriod=300s`    | 1サイクル分                    | 集計窓と sync 周期を一致させる                                                         |

`syncIntervalMinutes` 変更時は 「3サイクル」の意味が変わるため、ユーザー設定が 5 分以外に
なる場合は `duration` の見直しが必要（現状は全 config デフォルト値を使用）。

## Implementation

### 作成リソース（GCP）

- **Log-based metrics (`calendar_hub_*`)**
  - `calendar_hub_rrule_skip`
  - `calendar_hub_sync_failed`
  - `calendar_hub_sync_gap`
- **Notification channel**
  - Email: `hy.unimail.11@gmail.com`
- **Alert policies**
  - `[Calendar Hub] RRULE-SKIP detected`
  - `[Calendar Hub] Sync job failure`
  - `[Calendar Hub] Sync gap (tt != tagged+created-deleted)`

### 作成ファイル（リポジトリ）

- `infra/setup-monitoring.sh` — 冪等セットアップスクリプト
- `infra/alert-policies/rrule-skip.yaml`
- `infra/alert-policies/sync-failed.yaml`
- `infra/alert-policies/sync-gap.yaml`
- `apps/api/src/lib/timetree-google-sync.ts` — `computeSyncGap` 追加
- `apps/api/src/routes/sync.ts` — `[SYNC-GAP]` ログ出力追加

### 再適用手順

```bash
bash infra/setup-monitoring.sh
# 環境変数で上書き可能: NOTIFICATION_EMAIL, GCP_PROJECT_ID, SERVICE_NAME
```

## Operations

### メトリクス確認

```bash
gcloud logging metrics list --project=calendar-hub-prod --filter="name:calendar_hub"
gcloud alpha monitoring policies list --project=calendar-hub-prod --filter='displayName:"Calendar Hub"'
```

### 手動トリガテスト

**⚠️ `gcloud logging write` は使えない**: デフォルトで `resource.type=global` で書き込むが、
log-based metric の filter は `resource.type="cloud_run_revision"` を要求するため、
メトリクスがカウントされず alert は発火しない（Issue #72 で判明）。

代わりに `infra/inject-test-alert-log.sh` を使う（Cloud Logging REST API で
`cloud_run_revision` リソースを明示指定する実装）:

```bash
# 3種すべて注入
bash infra/inject-test-alert-log.sh

# 個別注入
bash infra/inject-test-alert-log.sh sync-failed   # 1-5分で発火
bash infra/inject-test-alert-log.sh sync-gap      # 持続注入が必要（次項参照）
bash infra/inject-test-alert-log.sh rrule-skip    # 最大1時間で発火
```

**SYNC-GAP の持続注入**: `duration=900s` の設計により1回の注入では発火しない。
境界で逃さないために 3分間隔で6回注入（18分の sustained signal を生成）:

```bash
for i in 1 2 3 4 5 6; do
  bash infra/inject-test-alert-log.sh sync-gap
  [ $i -lt 6 ] && sleep 180
done
```

実測: 5分間隔で4回注入は発火しないケースあり（アラート評価の境界条件）。
3分間隔で6回注入は 2026-04-15 の E2E で確実に発火確認済み（下記の検証結果参照）。

メトリクス集計確認:

```bash
# 最新のmetric値を確認（value=1 が出ればログ検知成功）
ACCESS_TOKEN=$(gcloud auth print-access-token)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FROM=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
curl -sS -G -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://monitoring.googleapis.com/v3/projects/calendar-hub-prod/timeSeries" \
  --data-urlencode 'filter=metric.type="logging.googleapis.com/user/calendar_hub_sync_failed"' \
  --data-urlencode "interval.endTime=${NOW}" \
  --data-urlencode "interval.startTime=${FROM}" \
  --data-urlencode "aggregation.alignmentPeriod=60s" \
  --data-urlencode "aggregation.perSeriesAligner=ALIGN_SUM"
```

Incident/メール着弾は Cloud Console で確認:
https://console.cloud.google.com/monitoring/alerting?project=calendar-hub-prod

### E2E 発火検証結果（Issue #72, 2026-04-15）

通知メール受信結果（`hy.unimail.11@gmail.com`）:

| アラート    | 注入方法          | 発火 (UTC) | メール受信 (JST) | Recovery 通知         |
| ----------- | ----------------- | ---------- | ---------------- | --------------------- |
| RRULE-SKIP  | 1回注入           | 00:47      | 09:47            | ✅ 01:47 (59分54秒後) |
| Sync failed | 1回注入           | 00:48      | 09:48            | ✅ 00:48:41 (41秒後)  |
| SYNC-GAP    | 6回注入 (3分間隔) | 02:46      | 11:46            | auto-close 24h        |

**知見**:

1. **Issue #72 原文の `gcloud logging write` 例は動作しない**（resource.type=global で
   log-based metric フィルタ `cloud_run_revision` と不一致）。再発防止のため
   `infra/inject-test-alert-log.sh` を追加した（REST API で cloud_run_revision を明示指定）。
2. **SYNC-GAP は 1回注入では発火しない**（設計通り）。`duration=900s` の条件を満たすには
   3分間隔で6回（18分の sustained signal）の注入が必要。4回注入（5分間隔）は境界条件で
   発火を逃したケースがあり、実運用では連続3サイクル以上の持続欠落時のみ発火する設計意図
   と整合する。

### 無効化（障害対応時）

```bash
for p in "RRULE-SKIP detected" "Sync job failure" "Sync gap"; do
  POLICY=$(gcloud alpha monitoring policies list --project=calendar-hub-prod \
    --format="value(name,displayName)" | awk -F'\t' -v n="[Calendar Hub] $p" '$2 ~ n {print $1; exit}')
  gcloud alpha monitoring policies update "$POLICY" --no-enabled --project=calendar-hub-prod
done
```

## 2026-04-15 拡張: API 全般のエラー率・レイテンシ監視 (#77)

### 背景

sync 系アラート（上記 3 種）は同期ジョブに特化しており、auth / ai / notifications /
profile / public-booking / calendars CRUD 等、**その他の API ルートのエラーは検知できない**。
本番運用として、sync 以外の事故をユーザー報告に依存している状態は許容不可。

### 追加アラート

Cloud Run の built-in metrics (`run.googleapis.com/request_count`,
`run.googleapis.com/request_latencies`) を使用（アプリ側にコード追加不要）。

| #   | 検知対象           | メトリクス                                  | 閾値             |
| --- | ------------------ | ------------------------------------------- | ---------------- |
| 4   | API 5xx            | `request_count` `response_code_class="5xx"` | 5min で ≥3 件    |
| 5a  | API 4xx 総量       | `request_count` `response_code_class="4xx"` | 5min で ≥20 件   |
| 5b  | 認証系 4xx         | `request_count` `response_code="401"/"403"` | 5min で ≥5 件    |
| 6   | API p99 レイテンシ | `request_latencies` `ALIGN_PERCENTILE_99`   | 3 秒を 5min 継続 |

5b は単一ポリシー内の 2 nd condition として定義。400 (client input) の 20 件ノイズに
401/403 (OAuth 失効 / session 破綻) の致命 5 件が埋もれる silent-failure を避ける。

### spec 原文との deviation（意図的）

| 原文                      | 実装                               | 理由                                                                                                                                                    |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5xx "率 5%"               | 絶対件数 ≥3/5min                   | 単独開発の低トラフィック環境では idle window で 1 件の 500 が 100% 化する false-positive が多発する。絶対件数の方が「確かな異常パターン」として機能する |
| 4xx "前日同時刻比 +300%"  | 絶対件数 ≥20/5min                  | 時系列ベースライン（MQL 1d shift）は idle window が多い環境で不安定。絶対値の連続検出で運用目的に十分                                                   |
| 対象を "sync 以外" に限定 | **全 API 対象**（sync と重複許容） | Cloud Run built-in metrics には URL path 別ラベルがない。二重検知は defense-in-depth として許容（sync 特化アラートと補完関係）                          |

### 追加リソース

**Alert policies**:

- `[Calendar Hub] API 5xx errors`
- `[Calendar Hub] API 4xx spike`
- `[Calendar Hub] API p99 latency`

**ファイル**:

- `infra/alert-policies/api-5xx-rate.yaml`
- `infra/alert-policies/api-4xx-spike.yaml`
- `infra/alert-policies/api-latency-p99.yaml`
- `infra/setup-monitoring.sh` に apply 3 行追加

### log-based metric との相補関係

| シナリオ                         | 発火するアラート                                      |
| -------------------------------- | ----------------------------------------------------- |
| sync 内部で認証失敗 → 500 返却   | Sync failed (log-based) + API 5xx (built-in) の両方   |
| sync 外の 500（ai / booking 等） | API 5xx のみ（新規検知領域）                          |
| Gmail OAuth 失効                 | MAIL-FAIL (log-based) + 呼出側が 500 返すなら API 5xx |
| 静かな同期欠落                   | SYNC-GAP のみ（HTTP は 200 で返る）                   |

sync 系 log-based metric は「何が起きたか」、API 系 built-in metric は「どのくらい
深刻か」を別角度で捕捉する補完関係。

### 検知死角（本 ADR で扱わない / 別機構が必要）

Cloud Run built-in request metrics では捕捉できない事象。いずれも対応するなら
別の log-based metric もしくは uptime check が必要（本 Issue #77 のスコープ外）:

- (a) **try-catch で握り潰して 200 返す経路** — エラーを application 層が吸収すると
  HTTP ステータスは正常扱い。log-based alert が別途必要。
- (b) **public-booking の `{error: ...}` 200 返却** — 現状のクライアントは HTTP 200
  でも body にエラーが入る設計がある（意図的）。build-in 5xx alert では出ない。
- (c) **Cloud Run OOM / SIGKILL** — request が完了せず request_count に
  カウントされない。Cloud Run の `container/cpu/utilization` や
  `instance_count` 別系統の監視が必要。
- (d) **min-instances=0 の cold-start probe 失敗** — startup probe 失敗は
  `request_count` に計上されない。必要なら `serving.knative.dev/*` 系の
  revision status を監視。

### 注意

- min-instances=0 のため cold start で p99 が瞬間的に 3s 超過しうるが、
  `duration=300s` の sustained 条件で一過性発火を除外。
- `response_code_class` ラベルの値は Cloud Run で `"1xx" / "2xx" / "3xx" / "4xx" / "5xx"`
  の文字列リテラル。ポリシー apply 後は一度実測値が流れるか確認する:
  ```bash
  gcloud monitoring time-series list \
    --project=calendar-hub-prod \
    --filter='metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class="5xx"' \
    --interval-start-time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ) \
    --interval-end-time=$(date -u +%Y-%m-%dT%H:%M:%SZ) --format=json | jq '.[].points | length'
  ```
  0 件でも filter が typo ではなく「期間内に 5xx が発生していない」だけの
  可能性が高いが、ログ側で 5xx の存在を確認できるのにメトリクスが 0 件なら
  ラベル不一致を疑う。

## Related

- Issue #65 / #77: 本ADRの動機
- PR #64: カンマ区切りEXDATE修正（#65 の動機）
- PR #63: `[SYNC-STATS]` 観測ログ追加（#65 の前段）
- ADR-005: CI/CD自動デプロイ（姉妹ADR、共通の production-readiness 文脈）
