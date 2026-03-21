# ADR-003: AI提案エンジン設計

## ステータス

Accepted (2026-03-21)

## コンテキスト

ユーザーの空き時間に対して、仕事・生活パターンを考慮した「無理のない」スケジュール提案をAIが行う機能が必要。提案はユーザーの承認/却下を経てカレンダーに反映される。

## 決定

### モデル: Vertex AI Gemini 2.5 Flash (GA)

- **選定理由**:
  - GA（一般提供）で本番利用可能
  - Flash系列で低レイテンシ・低コスト（スケジュール提案は複雑な推論より速度重視）
  - Vertex AI経由でWorkload Identity認証が使える
  - 2.0 Flashは2026年6月退役予定、3.0 Flashはまだプレビュー段階
- **モデルID**: `gemini-2.5-flash` （バージョン固定: `gemini-2.5-flash-001`）
- **代替案**: Gemini 2.5 Pro（高精度だが高コスト。提案精度が不足する場合にアップグレード検討）

### 認証: Workload Identity Federation

```
Cloud Run (API Server)
  → Workload Identity → Vertex AI API
  → サービスアカウントキー不使用
```

- Cloud Runのサービスアカウントに `roles/aiplatform.user` を付与
- ADC (Application Default Credentials) で自動認証
- ローカル開発: `gcloud auth application-default login` で対応

### プロンプト設計方針

#### System Prompt（固定）

```
あなたはスケジュール最適化アシスタントです。
ユーザーの仕事と生活のバランスを尊重し、無理のないスケジュールを提案します。

提案時の原則:
1. 連続会議の間には最低15分の休憩を確保する
2. ユーザー設定の集中時間帯には会議を入れない
3. 睡眠・食事時間を侵食する提案はしない
4. 移動が伴う予定の前後にはバッファ時間を設ける
5. 週の労働時間の上限を考慮する
```

#### User Prompt（動的生成）

```
以下の情報に基づいてスケジュールを提案してください。

## ユーザープロファイル
{userProfile JSON}

## 現在の予定（今週）
{calendarEvents JSON}

## 空き時間スロット
{freeSlots JSON}

## リクエスト
{userRequest or "空き時間の有効活用を提案してください"}
```

#### Response Format（構造化出力）

```json
{
  "suggestions": [
    {
      "type": "schedule | break | task",
      "title": "提案タイトル",
      "description": "提案の説明",
      "start": "ISO8601",
      "end": "ISO8601",
      "reasoning": "この提案の理由",
      "priority": "high | medium | low",
      "targetCalendar": "提案先カレンダーID"
    }
  ],
  "insights": "全体的なスケジュールに対するコメント"
}
```

### フィードバックループ

```
AI提案 → ユーザー確認 → 承認/却下
                         ↓
                  Firestoreに記録
                         ↓
                  次回提案時にコンテキストとして利用
```

- 承認された提案: 対象カレンダーにイベント作成
- 却下された提案: 却下理由を記録し、次回提案の改善に活用
- フィードバック蓄積により提案精度が向上

### コスト管理

- Gemini 2.5 Flash: Input $0.15/1M tokens, Output $0.60/1M tokens（Vertex AI）
- 1回の提案リクエスト: 約2,000-5,000 tokens（入力） + 500-1,000 tokens（出力）
- 想定月間コスト: 1日5回提案 × 30日 = 150回 → 約$0.15未満

## 影響

- `packages/ai-sdk/` にVertex AI呼び出しとプロンプト管理を集約
- プロンプトテンプレートはコード内管理（初期）→ 将来的にFirestoreで動的管理
- Gemini モデルのバージョンアップ時は `modelId` 設定変更のみで対応
- ユーザープロファイルの充実度が提案精度に直結するため、初回セットアップのUXが重要
