# タスク実行失敗フロー

## 概要

AI エージェント通信システムにおける、タスク実行時の失敗・エラー処理フローのシーケンス図です。

## 失敗フロー（異常処理）

### タスク実行失敗・完全中断のケース

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant WebUI as WebUI
    participant Server as サーバー
    participant President as President
    participant Boss1 as Boss1
    participant Workers as Worker1-3

    User->>WebUI: 複雑なタスク投入
    WebUI->>Server: POST /api/tasks
    Server->>President: タスク割り当て
    
    Note over President: 要件分析段階で失敗
    alt 要件が不明確・実現不可能
        President->>President: ❌ 要件分析失敗
        President->>Server: タスク失敗報告<br/>"要件が不明確で実行不可能"
        Server->>WebUI: socket.emit('task-failed')<br/>{reason: "要件不明確"}
        WebUI->>User: ❌ タスク失敗通知<br/>"要件を明確にして再投入してください"
        
    else President → Boss1 通信失敗
        President->>Boss1: agent-send.sh boss1 "タスク指示"
        Note over Boss1: Boss1 セッションが応答しない
        President->>President: ⏱️ タイムアウト待機（5 分）
        President->>Server: エスカレーション報告<br/>"Boss1 が応答しません"
        Server->>WebUI: socket.emit('system-error')<br/>{agent: "boss1", issue: "unresponsive"}
        WebUI->>User: ⚠️ システムエラー<br/>"エージェント boss1 が応答していません"
        
    else 技術的制約による実行不可
        President->>Boss1: タスク指示
        Boss1->>Workers: 各 Worker にサブタスク割り当て
        
        par 複数 Worker で同時失敗
            Workers->>Boss1: ❌ "依存関係が解決できません"
        and
            Workers->>Boss1: ❌ "必要なライブラリが利用不可"
        and  
            Workers->>Boss1: ❌ "権限不足でファイル作成不可"
        end
        
        Boss1->>President: ❌ "全 Worker で技術的問題が発生"
        President->>President: 代替案検討・失敗判定
        President->>Server: タスク失敗報告<br/>"技術的制約により実行不可能"
        Server->>WebUI: socket.emit('task-failed')<br/>{reason: "技術的制約"}
        WebUI->>User: ❌ 完全失敗通知<br/>"現在の環境では実行できません"
    end
```

### エージェント接続断・復旧失敗のケース

```mermaid
sequenceDiagram
    participant WebUI as WebUI
    participant Server as サーバー
    participant President as President
    participant AutoRecovery as 自動復旧システム
    participant TmuxManager as TmuxManager

    Note over Server: タスク実行中にエージェント停止
    Server->>President: 定期ヘルスチェック
    President-->>Server: ❌ 応答なし（プロセス終了）
    
    Server->>AutoRecovery: エージェント異常検出
    AutoRecovery->>TmuxManager: セッション状態確認
    TmuxManager-->>AutoRecovery: ❌ president セッション消失
    
    Note over AutoRecovery: 自動復旧試行
    AutoRecovery->>TmuxManager: tmux new-session -d -s president
    TmuxManager-->>AutoRecovery: ❌ セッション作成失敗
    AutoRecovery->>AutoRecovery: 3 回リトライ → 全て失敗
    
    AutoRecovery->>Server: 復旧失敗報告
    Server->>WebUI: socket.emit('system-critical-error')<br/>{message: "エージェント復旧不可"}
    WebUI->>User: 🚨 クリティカルエラー<br/>"システム復旧が必要です"
    
    Note over WebUI: 手動復旧 UI 表示
    WebUI->>User: "手動復旧" + "システム再起動" ボタン
    
    alt ユーザーがシステム再起動選択
        User->>WebUI: システム再起動ボタン
        WebUI->>Server: POST /api/system/restart
        Server->>Server: ❌ プロセス終了・ DB 保存・再起動
        Note over User: ユーザーは npm run dev で手動再起動が必要
        
    else ユーザーが手動復旧選択  
        User->>WebUI: 手動復旧ボタン
        WebUI->>Server: POST /api/system/manual-recovery
        Server->>TmuxManager: 強制セッション再作成
        TmuxManager->>TmuxManager: tmux kill-server && 再構築
        alt 復旧成功
            Server->>WebUI: 復旧完了通知
            WebUI->>User: ✅ "システム復旧しました"
        else 復旧失敗
            Server->>WebUI: 復旧失敗通知
            WebUI->>User: ❌ "手動対応が必要です"
        end
    end
```

## エラー処理フロー

### Worker レベルでのエラー処理

```mermaid
sequenceDiagram
    participant Boss1 as Boss1
    participant Worker1 as Worker1
    participant President as President
    participant Server as サーバー

    Boss1->>Worker1: "【タスク】React コンポーネント作成"
    Worker1->>Worker1: 実装試行
    Worker1->>Worker1: ❌ エラー発生（依存関係エラー）
    
    Worker1->>Boss1: "【ブロッカー報告】<br/>npm install でエラーが発生しました"
    
    alt Boss1 が解決可能
        Boss1->>Worker1: "【解決策】<br/>package.json を更新してリトライしてください"
        Worker1->>Worker1: 解決策を実施
        Worker1->>Boss1: "【完了報告】問題解決、タスク完了"
    else Boss1 で解決困難
        Boss1->>President: "【エスカレーション】<br/>Worker1 で技術的問題が発生"
        President->>President: 問題分析・解決策検討
        President->>Boss1: "【指示】<br/>別の技術スタックで進めてください"
        Boss1->>Worker1: "【変更指示】新しいアプローチで実装"
    else システムレベルエラー
        Boss1->>Server: システムエラー報告
        Server->>WebUI: エラー通知表示
        Note over WebUI: ユーザーに手動対応を促す
    end
```

### タスクキュー処理での失敗

```mermaid
sequenceDiagram
    participant WebUI as WebUI
    participant Server as サーバー
    participant TaskQueue as タスクキュー
    participant President as President

    Note over TaskQueue: 複数タスクの連続処理中
    TaskQueue->>President: タスク A を割り当て
    President->>President: タスク A 実行中
    President->>President: ❌ タスク A 失敗
    
    President->>Server: タスク A 失敗報告
    Server->>TaskQueue: タスク A を failed 状態に更新
    Server->>WebUI: socket.emit('task-failed', taskAData)
    
    Note over TaskQueue: 次のタスクの処理継続
    TaskQueue->>President: タスク B を割り当て
    President->>President: タスク B 実行（正常）
    President->>Server: タスク B 完了報告
    
    Note over Server: 失敗タスクの処理
    Server->>WebUI: 失敗したタスク A の詳細表示
    WebUI->>User: ❌ "タスク A が失敗しました<br/>詳細を確認して再投入してください"
```

## エラーの種類と対応

### エラー分類表

| エラー種類 | 発生場所 | 原因 | 自動復旧 | ユーザー対応 |
|------------|----------|------|----------|-------------|
| **要件不明確** | President | 仕様が曖昧・矛盾 | ❌ | 要件を明確化して再投入 |
| **通信失敗** | エージェント間 | セッション応答なし | ⚠️ 部分的 | 手動復旧 or システム再起動 |
| **技術的制約** | Worker | 依存関係・権限・環境 | ❌ | 環境設定修正・代替手段検討 |
| **システム障害** | tmux/プロセス | プロセス終了・セッション消失 | ✅ 3 回試行 | 手動復旧 or 完全再起動 |
| **リソース不足** | システム全体 | メモリ・ CPU ・ディスク | ❌ | システムリソース確保 |

### 復旧手順

#### 1. 軽微なエラー（自動復旧可能）
```bash
# システムが自動で実行
1. エラー検出
2. 3 回まで自動リトライ
3. 復旧成功 → 処理継続
4. 復旧失敗 → 手動復旧フローへ
```

#### 2. 中程度のエラー（手動復旧必要）
```bash
# WebUI の手動復旧ボタン
1. 手動復旧ボタンクリック
2. システムが自動診断
3. 復旧可能な問題を修正
4. エージェント再起動
5. 復旧完了 or エスカレーション
```

#### 3. 重大なエラー（システム再起動必要）
```bash
# 完全システム再起動
1. システム再起動ボタンクリック
2. 全プロセス終了・状態保存
3. ユーザーが npm run dev で再起動
4. システム正常性確認
5. 失敗タスクの再投入検討
```

## 予防策

### エラー予防のベストプラクティス

1. **要件明確化**
   - 具体的なタスク記述
   - 期待する成果物の明示
   - 技術的制約の事前確認

2. **システム監視**
   - エージェント状態の定期チェック
   - リソース使用量の監視
   - ログ出力の詳細化

3. **エラー早期発見**
   - 段階的な実装・テスト
   - 依存関係の事前確認
   - 権限・環境の検証

4. **復旧準備**
   - バックアップ・復元手順の整備
   - 手動復旧手順の文書化
   - 緊急連絡先の明確化

## ログ出力例

### 正常時とエラー時の出力比較

```bash
# 正常時
[INFO] Task assigned to President: task-abc123
[INFO] President → Boss1: Task breakdown completed
[INFO] Boss1 → Workers: Parallel execution started
[INFO] Worker1: UI implementation completed
[INFO] Worker2: API implementation completed  
[INFO] Worker3: Infrastructure setup completed
[INFO] Boss1 → President: All subtasks completed
[INFO] President: Task task-abc123 completed successfully

# エラー時
[ERROR] Task assignment failed: task-def456
[ERROR] President: Requirements analysis failed - "Unclear specifications"
[WARN] Boss1: No response from Worker2 (timeout: 300s)
[ERROR] Worker1: npm install failed - "Permission denied"
[CRITICAL] System: All agents unresponsive - initiating recovery
[INFO] AutoRecovery: Attempting tmux session restart (attempt 1/3)
[ERROR] AutoRecovery: Session restart failed - "tmux server not running"
[CRITICAL] System: Manual intervention required
```