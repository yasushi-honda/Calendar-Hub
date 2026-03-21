## Summary

<!-- 変更内容を1-3行で -->

## Quality Gate Checklist

### 必須（全PR）

- [ ] `pnpm turbo build` 全パッケージ成功
- [ ] `pnpm test` 全PASS（件数: \_\_\_件）
- [ ] `pnpm lint` PASS
- [ ] `pnpm turbo type-check` PASS
- [ ] 変更コードパスを最低1回実行して動作確認済み

### 3ステップ以上の作業

- [ ] `/impl-plan` 実施済み（またはN/A）

### 3ファイル以上の変更

- [ ] `/simplify` 実施済み（またはN/A）
- [ ] `/safe-refactor` 実施済み（またはN/A）

### API境界の変更

- [ ] 対向側（FE↔BE）を確認・更新済み（またはN/A）
- [ ] 期待レスポンス例を記載（またはN/A）

### 型・共有ロジック・設定の変更

- [ ] `/impact-analysis` 実施済み（またはN/A）

## Test plan

- [ ] <!-- テスト内容を記載 -->
