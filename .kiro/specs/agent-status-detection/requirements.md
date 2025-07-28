# Agent Status Detection Enhancement Requirements

## Introduction

現在のエージェント状態検知システムは、タスクが明示的に割り当てられた場合のみエージェントの状態を「working」に変更しています。しかし、実際にはWorker1-3エージェントがPresidentからの指示で作業を行っている場合でも、システム上では「idle」状態のままになっています。これにより、WebUIのActive Agents、Agent Status、Agent Terminalsでエージェントのランプが緑色にならず、実際の作業状況が正確に反映されていません。

## Requirements

### Requirement 1: リアルタイムエージェント活動検知

**User Story:** システム管理者として、各エージェントが実際に作業を行っているかどうかをリアルタイムで把握したい。

#### Acceptance Criteria

1. WHEN エージェントのターミナルで新しい出力が検出された THEN システムはそのエージェントを「working」状態に変更する
2. WHEN エージェントが一定時間（例：5分）非活動状態が続いた THEN システムはそのエージェントを「idle」状態に変更する
3. WHEN エージェントがClaude Codeプロンプトで待機状態になった THEN システムはそのエージェントを「idle」状態に変更する

### Requirement 2: ターミナル出力ベースの状態判定

**User Story:** システム管理者として、ターミナルの出力内容に基づいてエージェントの作業状態を正確に判定したい。

#### Acceptance Criteria

1. WHEN ターミナル出力にコード生成、ファイル操作、コマンド実行などの活動が検出された THEN エージェントを「working」状態にする
2. WHEN ターミナル出力が「Human:」プロンプトで停止している THEN エージェントを「idle」状態にする
3. WHEN ターミナル出力にエラーや例外が検出された THEN エージェントの状態に「error」フラグを追加する

### Requirement 3: WebUI状態表示の改善

**User Story:** ユーザーとして、WebUIでエージェントの実際の作業状況を視覚的に確認したい。

#### Acceptance Criteria

1. WHEN エージェントが「working」状態の THEN WebUIのランプが緑色で表示される
2. WHEN エージェントが「idle」状態の THEN WebUIのランプが灰色で表示される
3. WHEN エージェントが「error」状態の THEN WebUIのランプが赤色で表示される
4. WHEN エージェントの状態が変更された THEN WebUIがリアルタイムで更新される

### Requirement 4: 作業内容の詳細表示

**User Story:** システム管理者として、各エージェントが現在何の作業を行っているかを詳細に把握したい。

#### Acceptance Criteria

1. WHEN エージェントが作業中の THEN 現在の作業内容（最新のターミナル出力の要約）が表示される
2. WHEN エージェントがファイルを編集している THEN 編集中のファイル名が表示される
3. WHEN エージェントがコマンドを実行している THEN 実行中のコマンドが表示される

### Requirement 5: パフォーマンス最適化

**User Story:** システム管理者として、エージェント状態検知がシステムパフォーマンスに悪影響を与えないようにしたい。

#### Acceptance Criteria

1. WHEN ターミナル出力をチェックする THEN 適切な間隔（例：10-15秒）で実行される
2. WHEN 大量のターミナル出力がある THEN 最新の部分のみを効率的に処理する
3. WHEN エージェントが非アクティブの THEN チェック頻度を下げる