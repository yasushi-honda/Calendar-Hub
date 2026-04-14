# ADR-006: 同期ヘルスチェックの自動アラート化

- Status: Accepted
- Date: 2026-04-14
- Issue: #65

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

```bash
# sync API に手動で不整合を起こさず、ログのみで疎通確認する場合:
gcloud logging write calendar-hub-api "[SYNC-GAP] calendar=test tt=99 diff=1 skipped=0" \
  --severity=ERROR --project=calendar-hub-prod
# 5〜10分後に Monitoring > Alerts で incident が立ち上がるか確認
```

### 無効化（障害対応時）

```bash
for p in "RRULE-SKIP detected" "Sync job failure" "Sync gap"; do
  POLICY=$(gcloud alpha monitoring policies list --project=calendar-hub-prod \
    --format="value(name,displayName)" | awk -F'\t' -v n="[Calendar Hub] $p" '$2 ~ n {print $1; exit}')
  gcloud alpha monitoring policies update "$POLICY" --no-enabled --project=calendar-hub-prod
done
```

## Related

- Issue #65: 同期ヘルスチェックの自動アラート化（本ADR）
- PR #64: カンマ区切りEXDATE修正（本ADRの動機）
- PR #63: `[SYNC-STATS]` 観測ログ追加（本ADRの前段）
- ADR-005: CI/CD自動デプロイ（姉妹ADR、共通の production-readiness 文脈）
