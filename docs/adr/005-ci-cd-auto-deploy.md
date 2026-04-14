# ADR-005: CI/CD自動デプロイ（GitHub Actions + Workload Identity Federation）

- Status: Accepted
- Date: 2026-04-14
- Issue: #66

## Context

2026-04-14 の調査で、PR #61（TimeTree繰り返しイベント対応）が約5日間本番未反映だったことが判明。原因は手動デプロイ（`bash infra/deploy-api.sh`）実行漏れ。ハンドオフ記録にも誤って「デプロイ済み」と書かれており、ユーザー報告（同期欠落）で初めて発覚。

本番運用として、マージ→本番反映のギャップをヒューマンエラーに依存させることは許容不可。

## Decision

GitHub Actions + Workload Identity Federation (WIF) によりキーレス自動デプロイを導入する。

- トリガ: `push` to `main`（および `workflow_dispatch` で手動）
- ゲート: 同ワークフロー内 `quality` ジョブ（build / lint / type-check / test）PASS必須
- 順序: **API → Web**（WebビルドはAPI URLをビルド引数として必要とする）
- 認証: Workload Identity Federation（SAキー不使用）

## Alternatives Considered

| 案                                  | 採否     | 理由                                                              |
| ----------------------------------- | -------- | ----------------------------------------------------------------- |
| Cloud Build trigger（GitHub App）   | 不採用   | CI（test/lint）との連携がGitHub Actions側と分離し、二重管理になる |
| Service Account Key（`GCP_SA_KEY`） | 不採用   | キー漏洩リスク。WIFと実装コストは同等                             |
| GitHub Actions + WIF                | **採用** | CI/CDが単一ワークフローで完結、キーレスでローテーション不要       |

## Consequences

### Positive

- マージ即本番反映で「デプロイ忘れ」が構造的に発生しない
- SAキーの管理・ローテーション不要（WIF はGitHub OIDCトークンを検証）
- CI失敗時は自動的にデプロイ停止（`needs: quality`）

### Negative

- GCP側のWIF設定が追加インフラとして必要（Pool / Provider / SA binding）
- main直pushでの事故に弱くなるため branch protection（PR必須）が前提
- デプロイ時間分、マージ→反映に数分のラグ（従来の即時手動と比べて許容範囲）

## Implementation

### GCP 側リソース（冪等作成済み）

- WIF Pool: `github-actions-pool`（location: `global`）
- WIF Provider: `github-provider`
  - 属性条件: `assertion.repository_owner == 'yasushi-honda'`
  - 属性マッピング: `repository`, `repository_owner`, `ref`, `actor` を propagate
- SA: `github-deployer@calendar-hub-prod.iam.gserviceaccount.com`
- SA Roles:
  - `roles/run.admin`（Cloud Runデプロイ）
  - `roles/iam.serviceAccountUser`（Cloud Run runtime SA の actAs）
  - `roles/artifactregistry.writer`（イメージpush）
  - `roles/cloudbuild.builds.editor`（Cloud Build submit）
  - `roles/storage.objectAdmin`（Cloud Build ソースバケット）
  - `roles/logging.logWriter`
  - `roles/secretmanager.secretAccessor`
- WIF ↔ SA binding: `attribute.repository/yasushi-honda/Calendar-Hub` のみ

### GitHub Secrets

- `GCP_WIF_PROVIDER`: `projects/390047956089/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider`
- `GCP_SA_EMAIL`: `github-deployer@calendar-hub-prod.iam.gserviceaccount.com`
- `GCP_PROJECT_ID`: `calendar-hub-prod`

### ワークフロー構成

- `.github/workflows/ci.yml` — PR時のQuality check（既存、push:mainトリガは削除）
- `.github/workflows/deploy.yml` — push:main / workflow_dispatch で `quality → deploy-api → deploy-web`

### フォールバック

`infra/deploy-api.sh` / `infra/deploy-web.sh` は緊急時の手動デプロイ用として保持。

## Failure Handling

- デプロイ失敗時: GitHub Actionsデフォルト通知（リポジトリadminへメール）
- ロールバック: Cloud Runコンソールから過去リビジョンにトラフィック切替、または `gcloud run services update-traffic`

## Related

- Issue #66: CI/CD自動デプロイ化（P0）
- Issue #65: 同期ヘルスチェック自動アラート（別PR、同じく production-readiness）
- PR #61 / #63 / #64: 本ADRの動機となったデプロイ漏れ事例
