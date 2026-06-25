# Calendar Hub ハンドオフ (2026-06-25)

## 2026-06-25 セッション総括 (続編): Dependabot CI failure 対応 + registry 明示

本田様の指示 (`/catchup` → 即着手) により、main の Dependabot Updates が 6 件 failure していた状況に対応。真因 (Dependabot proxy が `npm.pkg.github.com` を自動 credential 注入し pnpm が `@types/react@^19` を解決できない) を特定し、セキュリティ修正含む 2 件の Dependabot PR をローカル rebase でマージ + `.npmrc` 追加で再発予防。

| PR   | 内容                                                                       | 規模              | 結果                                             |
| ---- | -------------------------------------------------------------------------- | ----------------- | ------------------------------------------------ |
| #137 | bump hono 4.12.18 → 4.12.25 (セキュリティ修正 5 件、実解決 4.12.27)        | 2 files / +35/-18 | ✅ merge + deploy success                        |
| #134 | bump turbo 2.8.20 → 2.9.14 (セキュリティ修正 3 件、実解決 2.10.0)          | 2 files / +41/-31 | ✅ merge + deploy success                        |
| #146 | `.npmrc` で `registry=https://registry.npmjs.org/` 明示 (proxy ノイズ回避) | 1 file / +1/-0    | ✅ merge + deploy in_progress (handoff 起動時点) |

**副次効果**:

- GitHub 脆弱性アラート: 32 → 21 件 (11 件解消、hono 系 9 件 + turbo 系 2 件想定)
- Open Dependabot PR: 0 件
- main 側の `nodemailer` 削除 (PR #139 Gmail API 移行) を Dependabot ブランチに統合済み

### Dependabot CI failure 真因

```
ERR_PNPM_NO_MATCHING_VERSION  No matching version found for @types/react@^19.0.0
while fetching it from https://npm.pkg.github.com/
The latest release of @types/react is "17.0.39".
```

Dependabot job が `automatic-github-packages-auth: true` experiment で `npm.pkg.github.com` を npm registry credential として自動追加 → pnpm がそこから React 19 系 type を取り (Internal GitHub Packages mirror は React 17 までしか公開していない) → recreate / rebase に失敗。

### 公式仕様の制約 (要記録)

- Dependabot `npm-registry` type は public registry (`registry.npmjs.org`) でも **token 必須**。empty token も NG ([dependabot/dependabot-core#10258](https://github.com/dependabot/dependabot-core/issues/10258) が open のまま)
- → `.github/dependabot.yml` の `registries:` block で npm registry を明示する案 (オプション 2) は実装不可
- pnpm 特有の問題として、Dependabot proxy が `.npmrc` の tarball URL を respect しない事案あり ([dependabot/dependabot-core#8242](https://github.com/dependabot/dependabot-core/issues/8242)、PR #8330 で fix 試行)
- → `.npmrc` で `registry` のみ明示する最小アプローチを採用 (PR #146)

### Conflict 解消方針 (#137 / #134 共通)

- `apps/api/package.json` / `package.json`: package.json は手動 / auto-merge、Dependabot 側の bump バージョン + main 側の nodemailer 削除を統合
- `pnpm-lock.yaml`: `git checkout --theirs` で main 側採用後、`pnpm install` で lockfile 再生成 (semver `^` 解決で実バージョンが PR title より上がる)

### 同根再発スキャン (§ 4.6)

- 本セッションの 3 PR はすべて同根 (`npm.pkg.github.com` 自動 credential 問題)。これは「同根の再発」ではなく「同一 root cause を 2 段階で対処」(2 PR マージ → 1 PR で予防策)
- 過去 7 日 handoff archive (`docs/handoff/archive/`) に dependabot/npm registry 関連の同根候補なし
- **同根再発なし** ✅

### 対症療法判定 (§ 4.7)

- PR #137/#134: 通常の依存 bump (セキュリティ patch 適用)。retry/fallback ではない。対症療法ではない ✅
- PR #146: registry override で proxy ノイズ回避 = 真因 (`automatic-github-packages-auth` の挙動) に直接効く構造的修正 ✅
- WebSearch 実施済み (Issue #10258 / #8242 で公式仕様の限界を確認)
- ただし PR #146 の Dependabot proxy への効果は**次回 Dependabot run (来月の月次起動) まで実機検証不能** → 検証保留項目として明記 (条件待ち #1)

---

## 2026-06-25 セッション総括: Google 予約スケジュール read-only ミラー化

`https://calendar.app.google/qyKq3kU2sX9e2vid7` (本田様の Google Appointment Schedule) を Calendar Hub の **read-only ミラー** として本田様用に提供する機能を、PR #138 / #139 / #140 の 3 連続 PR で実装・本番化。

| PR   | 内容                                                                                 | 規模               | 結果              |
| ---- | ------------------------------------------------------------------------------------ | ------------------ | ----------------- |
| #138 | Read-only ミラー機能 (`autoCreateCalendarEvent` / `calendarIdsForAvailability` 追加) | 7 files / +852/-59 | ✅ merge + deploy |
| #139 | nodemailer SMTP → Gmail API 移行 (535 認証エラー解消)                                | 7 files / +296/-57 | ✅ merge + deploy |
| #140 | 予約通知メール日時表記 12:00:00 → 12:00                                              | 2 files / +135/-13 | ✅ merge + deploy |

**副次効果**: PR #139 の nodemailer 依存削除により、Dependabot CI failure 1 件 (nodemailer) が自動解消。

### 本田様用予約リンク (本セッション内で本番に作成)

| 項目     | 値                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 公開 URL | https://calendar-hub-web-cu7tz7flqq-an.a.run.app/book/24Q1g69sDJi2                                                                |
| linkId   | `24Q1g69sDJi2`                                                                                                                    |
| 主な設定 | 60 分 / `autoCreateCalendarEvent=false` / `calendarIdsForAvailability=["yasushi.honda@aozora-cg.com"]` / 8-23 時 / 全曜日 / 30 日 |

### 実機検証結果

| AC                                                  | 状態             | 確認方法                                                                                        |
| --------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| AC-6 (空き時間表示)                                 | ✅ PASS          | Playwright で複数日付の枠表示確認                                                               |
| AC-7 (オーナー通知メール `hy.unimail.11@gmail.com`) | ✅ PASS          | 本田様 Gmail スクショで 3 件届いた                                                              |
| 日時表記 fix (12:00:00 → 12:00)                     | ✅ PASS          | 本田様 Gmail スクショで「2026/6/29 14:00 〜 15:00」確認                                         |
| AC-8 (Google Calendar に event 追加なし)            | ⏸ 本田様目視待ち | `yasushi.honda@aozora-cg.com` の Google Calendar で 6/27 10:00 / 6/28 12:00 / 6/29 14:00 を目視 |

テスト予約 3 件 (`VOpHhLeg-XI7` 6/27 10:00 / 6/28 12:00 / 6/29 14:00) が本番 Firestore に残存。予約管理 UI が無いためキャンセル不能 (要別 PR)。

### 同根再発スキャン (§ 4.6)

- PR #139 と PR #140 は同じファイル `apps/api/src/lib/email.ts` を触ったが root cause は別:
  - #139: OAuth scope (`gmail.send`) と nodemailer SMTP (`mail.google.com/` 必要) の不一致
  - #140: `toLocaleString` のオプション未指定で秒まで展開
- 過去 7 日 handoff archive に email/smtp 関連の同根候補なし
- **同根再発なし** ✅

### 対症療法判定 (§ 4.7)

- PR #139: 構造的修正 (nodemailer SMTP → Gmail API への実装方式切替)。retry/fallback ではない。対症療法ではない ✅
- PR #140: cosmetic fix だが root cause (`toLocaleString` のオプション未指定) を直接修正。対症療法ではない ✅

## 最近の完了作業（直近 1 週間）

| PR   | Issue | 内容                                                              |
| ---- | ----- | ----------------------------------------------------------------- |
| #146 | -     | `.npmrc` で registry 明示 (Dependabot proxy ノイズ回避)           |
| #134 | -     | turbo 2.8.20 → 2.9.14 (セキュリティ修正 3 件)                     |
| #137 | -     | hono 4.12.18 → 4.12.25 (セキュリティ修正 5 件)                    |
| #144 | #75   | 公開予約フロー E2E 基盤 (Playwright + Firebase Emulator)          |
| #142 | -     | 公開予約ページに空き枠ポーリング (60s)                            |
| #141 | -     | docs(handoff): 2026-06-25 セッション (PR #138/#139/#140 + 残課題) |
| #140 | -     | 予約通知メール日時表記 12:00:00 → 12:00                           |
| #139 | -     | nodemailer SMTP → Gmail API 移行 (535 認証エラー解消)             |
| #138 | -     | Read-only ミラー機能                                              |

それ以前は前 LATEST.md (2026-05-18 セッション) の「最近の完了作業」テーブル参照。

## 品質状態

- テスト: **305 件 PASS** (Google 予約ミラー前段で +35 件追加。続編セッションは config / deps のみで test 追加なし)
- ビルド: 全 5 パッケージ成功
- CI: GitHub Actions グリーン (続編内 quality / e2e 全 PASS、PR #137/#134/#146 各 run)
- main HEAD: `02957bc chore: registry を registry.npmjs.org に明示 (Dependabot proxy ノイズ回避) (#146)`

## 本番環境

| サービス | URL                                              |
| -------- | ------------------------------------------------ |
| Web      | https://calendar-hub-web-cu7tz7flqq-an.a.run.app |
| API      | https://calendar-hub-api-cu7tz7flqq-an.a.run.app |

- GCP: `calendar-hub-prod` / asia-northeast1
- 前段セッション内 Deploy run: 3 回成功 (PR #138 / #139 / #140 マージ各タイミング)
- 続編セッション内 Deploy run: PR #137 / #134 success、PR #146 は handoff 起動時点で in_progress (数分以内に完了予定)
- メール送信: Gmail API (`gmail.users.messages.send`) 経由。OAuth scope は既存の `gmail.send` のまま動作 (PR #139 以降)

## オープン Issue

### Active

- [#145](https://github.com/yasushi-honda/Calendar-Hub/issues/145) [P2, bug] CI 上で booking-polling/booking-success spec が flaky (ローカルでは PASS) ※ PR #144 由来、続編セッションでは未着手
- [#79](https://github.com/yasushi-honda/Calendar-Hub/issues/79) [P2] TimeTree session 切れの自動検知と再ログイン手順整備 (Phase A 完了)
- [#81](https://github.com/yasushi-honda/Calendar-Hub/issues/81) [P2] ログ保持期間・SLO 定義 (設計フェーズ完了)

### Postponed

- (なし) ※ #75 は PR #144 で実装完了し close 済み

**前段 + 続編セッションで Issue 起票・close なし** (Issue Net: 0)。

## 本セッション中に判明した残課題

### 前段 (Google 予約ミラー) 由来

| 課題                                               | A/B/C      | 着手条件                                         |
| -------------------------------------------------- | ---------- | ------------------------------------------------ |
| AC-8 verify (Google Calendar に event 追加なし)    | A 確認     | 本田様の目視確認のみ                             |
| **予約管理 UI 追加** (テスト予約 3 件のキャンセル) | C 起点待ち | decision-maker の明示指示                        |
| `ownerDisplayName` 空文字 bug                      | C 起点待ち | decision-maker の明示指示 (実害低)               |
| vitest が `dist/` を拾う問題                       | C 起点待ち | decision-maker の明示指示 (`dist/` 削除で回避可) |

### 続編 (Dependabot CI failure) 由来

| 課題                                                                                | A/B/C      | 着手条件                                                                             |
| ----------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| PR #146 (`.npmrc` 追加) の Dependabot proxy への効果検証                            | B 検出     | 次回 Dependabot 月次 run (来月起動時) で 6 件 failure 再発の有無を観察               |
| 他 4 件 Dependabot security_updates (form-data / tar / js-yaml / ws) の PR 自動作成 | B 検出     | 上記と同じ run で PR が実際に作成されるかを観察 (今回は registry 問題で PR 化されず) |
| Issue #145 (CI 上 booking-polling/booking-success flaky) の調査                     | C 起点待ち | decision-maker の「#145 直して」明示指示                                             |

## 次セッションのアクション (§ 2.5 3 分割構造)

### 即着手タスク

**なし** — 本セッション内で executor 領分の作業はすべて完了。

### 条件待ち (明示 trigger 付き)

| #   | 項目                                                            | trigger                                                                                                                          | 充足時のタスク                                                                                                     |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | AC-8 verify                                                     | 本田様の `yasushi.honda@aozora-cg.com` Google Calendar で 6/27 10:00 / 6/28 12:00 / 6/29 14:00 に event が**ない**ことを目視確認 | 結果報告 → セッション完全終了宣言                                                                                  |
| 2   | テスト予約 3 件のキャンセル                                     | 予約管理 UI 実装後 (#6 によって解消されてから)                                                                                   | 管理画面から手動キャンセル                                                                                         |
| 3   | Issue #79 Phase B 着手指示                                      | decision-maker からの「Phase B 進めて」明示指示                                                                                  | log-based metric `calendar_hub_timetree_session_expired` + alert policy 追加。ADR-009 Future Work 参照             |
| 4   | Issue #81 実装フェーズ着手指示                                  | decision-maker からの「#81 実装」明示指示                                                                                        | 5 サブタスク (バケット作成 / SLI/SLO 設定 / ダッシュボード / Budget アラート / PII 検知)。ADR-010 実装フェーズ参照 |
| 5   | PR #146 (`.npmrc`) の Dependabot proxy 効果検証                 | 次回 Dependabot 月次 run (来月起動時) — Dependabot tab で "Last checked" 確認、または GH UI で manual `@dependabot recreate`     | 6 件 failure (form-data / tar / js-yaml / ws / hono / turbo) が再発しないこと、PR が実際に作成されることを観察     |
| 6   | Issue #145 (CI 上 booking-polling/booking-success flaky) の調査 | decision-maker からの「#145 直して」明示指示                                                                                     | flaky 原因調査 → 修正 PR (再現条件 + 修正策含む)                                                                   |

### 却下候補 (記録のみ)

| 項目                                         | 理由                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 予約管理 UI 追加                             | C カテゴリ (起点アイデア decision-maker 領分)。明示指示なき限り着手不可                    |
| `ownerDisplayName` 空文字 bug 修正           | C カテゴリ。実害低 (表示空のまま動作継続、UX 影響軽微)                                     |
| vitest が `dist/` を拾う問題                 | C カテゴリ。`dist/` 削除で回避可能、CI 環境では dist 生成しないため影響なし                |
| Dependabot ws (security_update_not_possible) | C カテゴリ + pnpm overrides の手動設計が必要、影響は dev-only                              |
| Node.js 20 → 24 移行 (2026-09-16 まで)       | 前 LATEST.md 持ち越し、decision-maker 領分                                                 |
| `[MAIL-FAIL] kind=AUTH` 発生時の UI 通知昇格 | 前 LATEST.md 持ち越し、Issue #74 関連 (現状: PR #139 で AUTH エラー自体が発生しなくなった) |

## Issue Net 変化

- Close 数: 0 件 (前段 0 / 続編 0、ただし #75 は前段 PR #144 で実装完了 + auto-close 済み、起票自体は本セッション開始前)
- 起票数: 0 件 (前段 0 / 続編 0、ただし #145 は前段 PR #144 マージ後の別タイミング起票)
- **Net: 0 件**

triage 基準 (CLAUDE.md GitHub Issues §) に照らし、起票見送り判断:

- 予約管理 UI / `ownerDisplayName` / vitest dist はいずれも rating 5-6 相当の改善提案。実害基準 (#1) / 再現バグ基準 (#2) / CI 破壊基準 (#3) / rating ≥7 confidence ≥80 基準 (#4) / ユーザー明示指示基準 (#5) のいずれも満たさない
- AC-8 verify は本田様目視タスクで Issue 化不要
- PR #146 効果検証 / 他 4 件 Dependabot security_updates の PR 自動作成は、月次 Dependabot run まで再現条件が訪れないため Issue 化保留 (条件待ち #5 として記録)

## 最終結論

✅ **セッション終了可**

- OPEN PR: 0 件 (#137/#134/#146 全 merge 完了、deploy は #137/#134 success / #146 in_progress → 数分以内に完了予定、通常運用で確認)
- main clean (HEAD = `02957bc chore: registry を registry.npmjs.org に明示 (Dependabot proxy ノイズ回避) (#146)`)
- 残留プロセスなし
- 即着手タスク: 0 件
- 条件待ち: 6 件 (前段 4 + 続編 2、すべて trigger 未充足、decision-maker 判断 / 本田様目視 / 月次 Dependabot run 待ち)
- 実機 verify: 前段 AC-6 / AC-7 / 日時表記 fix ✅ (AC-8 のみ本田様目視待ち、executor 領分外) / 続編は PR #146 の Dependabot proxy への効果が次回 run まで実機検証不能 → 条件待ち #5 として明示
- § 4.6 同根再発スキャン: 該当なし (続編 3 PR は同一 root cause を 2 段階で対処、過去 7 日 archive に同根候補なし)
- § 4.7 対症療法判定: 該当なし (PR #137/#134 は通常依存 bump、PR #146 は真因に直接効く構造的修正、WebSearch で公式仕様限界を確認済み)

---

# 以下、過去セッション (2026-05-18 まで) の参照情報

## MVP 実装状況

| 機能                                 | 状態              |
| ------------------------------------ | ----------------- |
| Firebase Auth + Google OAuth         | ✅ 完了           |
| Google Calendar / TimeTree 統合      | ✅ 完了           |
| 統合カレンダー UI                    | ✅ 完了           |
| Vertex AI 提案 (Gemini 2.5 Flash)    | ✅ 完了           |
| メール通知 (Gmail API 経由、PR #139) | ✅ 完了           |
| 公開予約リンク (Calendly ライク)     | ✅ 完了           |
| Google 予約 read-only ミラー化       | ✅ 完了 (PR #138) |
| カレンダー同期 (extendedProps)       | ✅ 完了           |
| 全日イベント同期 (TZ 対応)           | ✅ 完了 (#58/#59) |
| syncIntervalMinutes スケジューラ     | ✅ 完了 (#53)     |
| timeMax 月末バグ                     | ✅ 完了 (dd241df) |
| 繰り返しイベント同期 (RRULE 展開)    | ✅ 完了 (#61/#64) |

## 過去セッションの技術メモ参照先

過去セッションの技術メモ (gcloud JMESPath 風 filter pitfall / TimeTree 2 日間終日 / Dependabot 運用 / rrule 座標系 / Cloud Run built-in metrics / Gmail 送信失敗可視化 / Firestore Backup / アラート E2E / RRULE 展開実装) は本ファイルの過去版 (`git log -- docs/handoff/LATEST.md`) で参照可能。

主要 ADR:

- ADR-005: CI/CD 自動デプロイ + `promote-traffic.sh` (PR #126 で trafficSplit 昇格保証)
- ADR-006: Monitoring (7 alert policies)
- ADR-007: Firestore PITR + バックアップ
- ADR-008: RRULE JST wall-clock 座標系
- ADR-009: TimeTree session management
- ADR-010: SLO + ログ保持 (設計フェーズ)
- ADR-011: TimeTree 2 日間終日「判別不能」確定

## アカウント情報

- GCP: `hy.unimail.11@gmail.com` / プロジェクト: `calendar-hub-prod`
- GitHub: `yasushi-honda` / https://github.com/yasushi-honda/Calendar-Hub
- TimeTree: `hon.family.da@gmail.com`
- Firebase Auth: Google Sign-In 有効化済み
- gcloud named config: `calendar-hub`

## 運用メモ

- **GCP アカウント**: gcloud 操作時は `hy.unimail.11@gmail.com` に切り替え必要 (本プロジェクトは `.envrc` で `calendar-hub` named config が自動 active)
- **デプロイ**: main push → `.github/workflows/deploy.yml` (quality → deploy-api → deploy-web) → `infra/promote-traffic.sh` で LATEST 昇格 + jq 検証
