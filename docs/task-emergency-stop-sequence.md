# 緊急停止処理シーケンス図

## 概要

ダッシュボードの緊急停止機能における、エージェントプロセスへの SIGINT 送信処理のシーケンス図です。

## 1. 通常フロー（正常処理）

### 全エージェント停止成功のケース

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Dashboard as ダッシュボード
    participant Server as サーバー
    participant APM as AgentProcessManager
    participant Tmux as tmux セッション
    participant President as President
    participant Boss1 as Boss1
    participant Workers as Worker1-3

    User->>Dashboard: Emergency Stop ボタンクリック
    Dashboard->>Server: socket.emit('emergency-stop')
    
    Note over Server: 緊急停止処理開始
    Server->>APM: sendSIGINTToAll()
    
    par 並列で SIGINT 送信
        APM->>Tmux: tmux send-keys -t president C-c
        Tmux->>President: SIGINT 送信
        President->>President: 処理中断・終了
        President-->>APM: 停止完了
    and
        APM->>Tmux: tmux send-keys -t multiagent:0.0 C-c
        Tmux->>Boss1: SIGINT 送信
        Boss1->>Boss1: 処理中断・終了
        Boss1-->>APM: 停止完了
    and
        APM->>Tmux: tmux send-keys -t multiagent:0.1-3 C-c
        Tmux->>Workers: SIGINT 送信（並列）
        Workers->>Workers: 処理中断・終了
        Workers-->>APM: 停止完了
    end
    
    APM-->>Server: 成功結果<br/>{success: ['president', 'boss1', 'worker1', 'worker2', 'worker3'], failed: []}
    
    Note over Server: 後処理
    Server->>Server: 進行中タスクを pending 状態に戻す
    Server->>Server: エージェント状態を idle にリセット
    Server->>Server: agentStatusCache をクリア
    Server->>Server: プロセス状態を'stopped'に更新
    
    Server->>Dashboard: socket.emit('emergency-stop-completed')<br/>{message: "5 agents stopped", signalResults}
    Dashboard->>User: 成功メッセージ表示<br/>"Emergency stop completed. SIGINT sent to 5 agents."
    
    Note over Dashboard: UI 更新
    Dashboard->>Dashboard: エージェント状態表示を idle に更新
    Dashboard->>Dashboard: アクティブタスクリストをクリア
```

## 2. キャンセルフロー（部分成功）

### 一部エージェントの停止に失敗したケース

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Dashboard as ダッシュボード
    participant Server as サーバー
    participant APM as AgentProcessManager
    participant Tmux as tmux セッション
    participant President as President
    participant Boss1 as Boss1
    participant Worker1 as Worker1
    participant Worker2 as Worker2
    participant Worker3 as Worker3

    User->>Dashboard: Emergency Stop ボタンクリック
    Dashboard->>Server: socket.emit('emergency-stop')
    
    Note over Server: 緊急停止処理開始
    Server->>APM: sendSIGINTToAll()
    
    par 並列で SIGINT 送信
        APM->>Tmux: tmux send-keys -t president C-c
        Tmux->>President: SIGINT 送信
        President-->>APM: ✅ 停止成功
    and
        APM->>Tmux: tmux send-keys -t multiagent:0.0 C-c
        Tmux->>Boss1: SIGINT 送信
        Boss1-->>APM: ✅ 停止成功
    and
        APM->>Tmux: tmux send-keys -t multiagent:0.1 C-c
        Tmux->>Worker1: SIGINT 送信
        Worker1-->>APM: ✅ 停止成功
    and
        APM->>Tmux: tmux send-keys -t multiagent:0.2 C-c
        Tmux-->>APM: ❌ セッション/pane が存在しない
    and
        APM->>Tmux: tmux send-keys -t multiagent:0.3 C-c
        Tmux->>Worker3: SIGINT 送信
        Worker3-->>APM: ✅ 停止成功
    end
    
    APM-->>Server: 部分成功結果<br/>{success: ['president', 'boss1', 'worker1', 'worker3'], failed: ['worker2']}
    
    Note over Server: 後処理（成功分のみ）
    Server->>Server: 成功エージェントの状態を'stopped'に更新
    Server->>Server: 失敗エージェントの状態を'error'に更新
    Server->>Server: 進行中タスクを pending 状態に戻す
    Server->>Server: agentStatusCache をクリア
    
    Server->>Dashboard: socket.emit('emergency-stop-completed')<br/>{message: "4/5 agents stopped", signalResults}
    Dashboard->>User: 部分成功メッセージ表示<br/>"Emergency stop partially completed.<br/>4 agents stopped, 1 failed."
    
    Note over Dashboard: UI 更新
    Dashboard->>Dashboard: 成功エージェント→idle 表示
    Dashboard->>Dashboard: 失敗エージェント→error 表示（赤色）
    Dashboard->>Dashboard: 手動対応が必要なエージェントをハイライト
```

## 3. 失敗フロー（異常処理）

### システムエラーや tmux 接続失敗のケース

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Dashboard as ダッシュボード
    participant Server as サーバー
    participant APM as AgentProcessManager
    participant Tmux as tmux セッション

    User->>Dashboard: Emergency Stop ボタンクリック
    Dashboard->>Server: socket.emit('emergency-stop')
    
    Note over Server: 緊急停止処理開始
    Server->>APM: sendSIGINTToAll()
    
    alt tmux サーバー接続失敗
        APM->>Tmux: tmux list-sessions（接続確認）
        Tmux-->>APM: ❌ 接続エラー（tmux server not running）
        APM-->>Server: 全体失敗結果<br/>{success: [], failed: ['president', 'boss1', 'worker1', 'worker2', 'worker3']}
        
    else 個別コマンド実行エラー
        APM->>Tmux: tmux send-keys -t president C-c
        Tmux-->>APM: ❌ コマンド実行エラー
        APM->>Tmux: tmux send-keys -t multiagent:0.0 C-c
        Tmux-->>APM: ❌ セッション不存在
        Note over APM: 全エージェントで同様のエラー
        APM-->>Server: 全体失敗結果<br/>{success: [], failed: ['president', 'boss1', 'worker1', 'worker2', 'worker3']}
        
    else JavaScript 例外エラー
        APM-->>APM: ❌ 予期しない例外発生
        APM-->>Server: throw Error("Unexpected error in SIGINT processing")
    end
    
    alt APM からエラー結果を受信
        Note over Server: エラー後処理
        Server->>Server: 全エージェントの状態を'error'に更新
        Server->>Server: 進行中タスクは変更せず（手動対応必要）
        
        Server->>Dashboard: socket.emit('emergency-stop-completed')<br/>{message: "Emergency stop failed", signalResults}
        Dashboard->>User: エラーメッセージ表示<br/>"❌ Emergency stop failed.<br/>0/5 agents stopped. Manual intervention required."
        
        Note over Dashboard: エラー状態 UI
        Dashboard->>Dashboard: 全エージェント→error 表示（赤色・点滅）
        Dashboard->>Dashboard: "Retry"ボタンを表示
        Dashboard->>Dashboard: "Manual Recovery"ガイドを表示
        
    else JavaScript 例外をキャッチ
        Server->>Server: catch (error)
        Server->>Dashboard: socket.emit('system-error')<br/>{message: "Emergency stop failed", error: error.message}
        Dashboard->>User: システムエラー表示<br/>"❌ System error during emergency stop.<br/>Please check server logs."
        
        Note over Dashboard: システムエラー UI
        Dashboard->>Dashboard: エラーバナー表示
        Dashboard->>Dashboard: "Reload Dashboard"ボタンを表示
        Dashboard->>Dashboard: サーバー再接続を試行
    end
```

## 4. リトライ・復旧フロー

### 失敗後の手動リトライケース

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Dashboard as ダッシュボード
    participant Server as サーバー
    participant APM as AgentProcessManager

    Note over Dashboard: 前回の緊急停止が失敗
    Dashboard->>User: "Retry Emergency Stop"ボタン表示
    
    User->>Dashboard: Retry ボタンクリック
    Dashboard->>Server: socket.emit('emergency-stop')
    
    Note over Server: リトライ処理
    Server->>APM: checkTmuxSessions()（事前確認）
    APM-->>Server: {president: true, multiagent: true}
    
    Server->>APM: sendSIGINTToAll()
    APM-->>Server: {success: ['president', 'boss1', 'worker1', 'worker2', 'worker3'], failed: []}
    
    Server->>Dashboard: socket.emit('emergency-stop-completed')<br/>{message: "Retry successful", signalResults}
    Dashboard->>User: 成功メッセージ表示<br/>"✅ Emergency stop retry successful.<br/>All 5 agents stopped."
```

## エラーハンドリング詳細

### エラーの種類と対応

| エラー種類 | 原因 | APM の対応 | サーバーの対応 | UI の表示 |
|------------|------|-----------|----------------|----------|
| tmux 接続失敗 | tmux サーバー未起動 | 全エージェント failed | 全エージェント→error | システムエラー + 復旧ガイド |
| セッション不存在 | 特定セッション/pane 消失 | 該当エージェント failed | 部分的 error 状態 | 部分失敗 + Retry 推奨 |
| コマンド実行エラー | 権限不足・システム負荷 | 該当エージェント failed | 部分的 error 状態 | 部分失敗 + Manual Recovery |
| JavaScript 例外 | 予期しないエラー | 例外 throw | システムエラー送信 | システムエラー + Reload 推奨 |

## 技術仕様

### AgentProcessManager 主要メソッド
- `sendSIGINT(agentId)`: 個別エージェント停止
- `sendSIGINTToAll()`: 全エージェント一括停止
- `getProcessId(agentId)`: プロセス ID 取得
- `checkTmuxSessions()`: tmux 接続確認
- `updateAgentStatus()`: 状態更新

### tmux コマンド仕様
```bash
# 事前確認
tmux has-session -t president
tmux has-session -t multiagent

# SIGINT 送信
tmux send-keys -t president C-c
tmux send-keys -t multiagent:0.0 C-c  # Boss1
tmux send-keys -t multiagent:0.1 C-c  # Worker1
tmux send-keys -t multiagent:0.2 C-c  # Worker2
tmux send-keys -t multiagent:0.3 C-c  # Worker3
```

### WebSocket イベント仕様
```typescript
// クライアント→サーバー
socket.emit('emergency-stop')

// サーバー→クライアント（成功）
socket.emit('emergency-stop-completed', {
  message: "Emergency stop completed. SIGINT sent to 5 agents.",
  signalResults: { success: [...], failed: [...] },
  timestamp: new Date()
})

// サーバー→クライアント（システムエラー）
socket.emit('system-error', {
  message: "Emergency stop failed",
  error: "tmux server not running",
  timestamp: new Date()
})
```