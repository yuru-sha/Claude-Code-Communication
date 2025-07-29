# タスク実行通常フロー

## 概要

AI エージェント通信システムにおける、正常なタスク実行フローのシーケンス図です。

## 通常フロー（正常処理）

### タスク投入から完了までの流れ

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant WebUI as WebUI
    participant Server as サーバー
    participant TaskManager as TaskManager
    participant President as President
    participant Boss1 as Boss1
    participant Worker1 as Worker1
    participant Worker2 as Worker2
    participant Worker3 as Worker3

    User->>WebUI: タスク投入（タイトル・詳細入力）
    WebUI->>Server: POST /api/tasks<br/>{title, description}
    
    Note over Server: タスク登録・キュー追加
    Server->>TaskManager: addTaskToQueue(task)
    TaskManager->>TaskManager: タスクを FIFO キューに追加
    Server->>WebUI: タスク登録完了応答
    WebUI->>User: "タスクがキューに追加されました"
    
    Note over TaskManager: タスク割り当て処理
    TaskManager->>TaskManager: processTaskQueue() 実行
    TaskManager->>President: agent-send.sh president<br/>"新しいタスクが割り当てられました"
    
    Note over President: 要件分析・チーム編成
    President->>President: タスク分析・要件明確化
    President->>President: 成果物・期限・品質基準の設定
    President->>Boss1: agent-send.sh boss1<br/>"【タスク指示】[詳細な指示内容]"
    
    Note over Boss1: タスク分解・エージェント割り当て
    Boss1->>Boss1: タスクをサブタスクに分解
    Boss1->>Boss1: 各 Worker のスキルセットを考慮した割り当て
    
    par 並列タスク実行
        Boss1->>Worker1: agent-send.sh worker1<br/>"【フロントエンド担当】UI 実装をお願いします"
        Worker1->>Worker1: React/TypeScript で UI 実装
        Worker1->>Boss1: "【完了報告】UI コンポーネント完成"
    and
        Boss1->>Worker2: agent-send.sh worker2<br/>"【バックエンド担当】API 実装をお願いします"
        Worker2->>Worker2: Node.js/Express で API 実装
        Worker2->>Boss1: "【完了報告】API 実装完成"
    and
        Boss1->>Worker3: agent-send.sh worker3<br/>"【インフラ担当】環境構築をお願いします"
        Worker3->>Worker3: Docker/CI-CD 設定
        Worker3->>Boss1: "【完了報告】インフラ設定完成"
    end
    
    Note over Boss1: 進捗統合・品質確認
    Boss1->>Boss1: 各 Worker の成果を統合
    Boss1->>Boss1: 品質チェック・テスト実行
    Boss1->>President: "【プロジェクト完了報告】全タスク完了"
    
    Note over President: 最終確認・完了処理
    President->>President: 成果物の最終確認
    President->>Server: curl POST /api/complete-task<br/>{"taskId": "[cmdTaskId]"}
    
    Note over Server: タスク完了処理
    Server->>TaskManager: markTaskCompleted(taskId)
    TaskManager->>TaskManager: タスク状態を'completed'に更新
    Server->>WebUI: socket.emit('task-completed', taskData)
    WebUI->>User: 完了通知 + プロジェクトダウンロードリンク
```

## エージェント間通信の詳細

### agent-send.sh による通信メカニズム

```mermaid
sequenceDiagram
    participant Sender as 送信エージェント
    participant Script as agent-send.sh
    participant Tmux as tmux セッション
    participant Receiver as 受信エージェント

    Sender->>Script: ./agent-send.sh boss1 "メッセージ内容"
    Script->>Script: メッセージを一時ファイルに保存
    Script->>Tmux: tmux send-keys -t multiagent:0.0<br/>"メッセージ受信: [内容]" Enter
    Tmux->>Receiver: プロンプト表示でメッセージ配信
    Receiver->>Receiver: メッセージを読み取り・処理
    
    Note over Receiver: 返信が必要な場合
    Receiver->>Script: ./agent-send.sh [送信者] "返信内容"
    Script->>Tmux: tmux send-keys で返信配信
```

## タスクキュー管理フロー

### FIFO キューによるタスク処理

```mermaid
sequenceDiagram
    participant WebUI as WebUI
    participant Server as サーバー
    participant TaskQueue as タスクキュー
    participant President as President

    Note over TaskQueue: 複数タスクがキューに蓄積
    WebUI->>Server: タスク A 投入
    Server->>TaskQueue: enqueue(タスク A)
    WebUI->>Server: タスク B 投入
    Server->>TaskQueue: enqueue(タスク B)
    WebUI->>Server: タスク C 投入
    Server->>TaskQueue: enqueue(タスク C)
    
    Note over TaskQueue: FIFO 順でタスク処理
    loop タスク処理ループ
        TaskQueue->>TaskQueue: 先頭タスクを取得
        TaskQueue->>President: 次のタスクを割り当て
        President->>President: タスク実行
        President->>Server: タスク完了報告
        Server->>TaskQueue: dequeue() - 完了タスクを削除
    end
    
    Note over TaskQueue: 全タスク処理完了
    TaskQueue->>Server: キューが空になりました
    Server->>WebUI: 全タスク完了通知
```

## プロジェクト完了・ダウンロードフロー

### 成果物の生成とダウンロード

```mermaid
sequenceDiagram
    participant President as President
    participant Server as サーバー
    participant FileSystem as ファイルシステム
    participant WebUI as WebUI
    participant User as ユーザー

    Note over President: プロジェクト完了
    President->>Server: curl POST /api/complete-task
    
    Note over Server: ダウンロード準備
    Server->>FileSystem: workspace/[タスク ID] 配下を収集
    FileSystem-->>Server: プロジェクトファイル一覧
    Server->>Server: ZIP アーカイブ作成
    Server->>Server: ダウンロード URL 生成
    
    Server->>WebUI: socket.emit('task-completed')<br/>{downloadUrl, projectSummary}
    WebUI->>User: 完了通知 + ダウンロードボタン表示
    
    User->>WebUI: ダウンロードボタンクリック
    WebUI->>Server: GET /api/download/[cmdTaskId]
    Server->>User: ZIP ファイル送信
    
    Note over User: プロジェクトファイル取得完了
```

## エージェント役割分担

### 各エージェントの責務

| エージェント | 主要責務 | 通信相手 | 成果物 |
|-------------|----------|----------|--------|
| **President** | プロジェクト統括<br/>要件分析<br/>品質保証 | Boss1 ↔ Server | プロジェクト完了報告<br/>品質基準書 |
| **Boss1** | チーム管理<br/>タスク分解<br/>進捗統合 | President ↔ Workers | タスク分解書<br/>進捗レポート |
| **Worker1** | フロントエンド開発<br/>UI/UX 実装 | Boss1 | React コンポーネント<br/>CSS スタイル |
| **Worker2** | バックエンド開発<br/>API 実装 | Boss1 | API エンドポイント<br/>データベース設計 |
| **Worker3** | インフラ構築<br/>DevOps<br/>テスト | Boss1 | Docker 設定<br/>CI/CD パイプライン |

## 技術仕様

### agent-send.sh コマンド仕様
```bash
# 基本使用法
./agent-send.sh [受信者] "[メッセージ内容]"

# 例
./agent-send.sh boss1 "新しいタスクが追加されました"
./agent-send.sh worker1 "フロントエンド実装をお願いします"
```

### tmux セッション構成
```bash
# President (独立セッション)
tmux new-session -d -s president

# MultiAgent (4 ペイン構成)
tmux new-session -d -s multiagent \; \
  split-window -h \; \
  split-window -v \; \
  select-pane -t 0 \; \
  split-window -v

# ペイン割り当て
# multiagent:0.0 → Boss1
# multiagent:0.1 → Worker1  
# multiagent:0.2 → Worker2
# multiagent:0.3 → Worker3
```

### WebSocket イベント
```typescript
// タスク関連
socket.emit('task-queued', taskData)      // タスクキュー追加
socket.emit('task-assigned', taskData)    // タスク割り当て
socket.emit('task-completed', taskData)   // タスク完了

// エージェント状態
socket.emit('agent-status-update', agentStatus)  // エージェント状態更新
socket.emit('agent-activity-detected', activity) // エージェント活動検出
```