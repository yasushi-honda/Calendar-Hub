# ADR-001: 技術スタック選定

## ステータス

Accepted (2026-03-21)

## コンテキスト

複数Googleカレンダー + TimeTreeを統合し、AI提案機能を持つスケジュール管理アプリを新規構築する。まずはSingle User向けに素早くMVPを構築し、将来的にマルチユーザーへ拡張可能な技術基盤が必要。

## 決定

### Frontend: Next.js 15 (App Router) + TypeScript

- **理由**: SSR/SSGによる高速な初期表示、App Routerによるサーバーコンポーネント活用、TypeScriptとの親和性
- **代替案**: React SPA + Vite（SSR不要ならシンプルだが、SEO・パフォーマンス面で劣る）、Flutter（モバイル対応が必要になった場合に再検討）

### Backend: Cloud Run + Cloud Functions (2nd gen)

- **理由**: Cloud RunはAPIサーバーとして柔軟、Cloud Functionsはイベント駆動処理（通知、同期）に最適。スケールto 0でコスト効率が良い
- **代替案**: Firebase Functions のみ（実行時間10分制限が同期処理のボトルネックになる可能性）

### Database: Firestore

- **理由**: Firebase Authとの統合が容易、リアルタイム同期、スキーマ柔軟性、無料枠が充実。スケジュールデータはドキュメント指向が自然
- **代替案**: Cloud SQL PostgreSQL（複雑なクエリが必要になった場合に追加検討）

### Language: TypeScript統一

- **理由**: FE/BE間の型共有（monorepo + shared package）、学習コスト最小化、一貫したコーディング体験
- **代替案**: BE Python（Vertex AI SDKが充実だが、Node.js SDKも十分成熟）

### Deploy: Cloud Run (FE + BE)

- **理由**: GCP完結でWorkload Identityとの親和性が高い。Dockerfileベースで環境の再現性が高い
- **代替案**: Vercel（Next.jsのデプロイは楽だが、BEとの分離でWorkload Identity設定が複雑化）

### Monorepo: Turborepo + pnpm

- **理由**: ビルドキャッシュによる高速化、タスク並列実行、pnpm workspacesとの相性
- **代替案**: Nx（機能は豊富だが設定が重い。今回の規模にはTurborepoで十分）

## 影響

- TypeScript統一により、`packages/shared` で型定義を一元管理
- Cloud Run前提でDockerfile管理が必要
- Firestoreの設計がデータモデルの制約になる（JOINなし、ネスト制限）
