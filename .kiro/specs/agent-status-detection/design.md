# Agent Status Detection Enhancement Design

## Overview

現在のシステムは、エージェントの状態を主にタスク割り当てベースで管理していますが、実際のターミナル活動を反映していません。この設計では、ターミナル出力の分析に基づいてリアルタイムでエージェント状態を検知し、WebUIに正確な状態を表示するシステムを構築します。

## Architecture

### Current System Analysis

現在のシステムの問題点：
1. `broadcastAgentStatusUpdate()` は主にタスク割り当て時のみ呼び出される
2. `checkClaudeAgents()` はClaude Codeの起動状態のみをチェック（online/offline）
3. Worker1-3の実際の作業状況が反映されない
4. ターミナル出力の内容分析が不十分

### New Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Status Manager                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Terminal Output │  │ Activity        │  │ Status          │ │
│  │ Monitor         │  │ Analyzer        │  │ Broadcaster     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      WebUI Updates                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Agent Status    │  │ Activity        │  │ Terminal        │ │
│  │ Indicators      │  │ Details         │  │ Monitoring      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Enhanced Agent Status Types

```typescript
interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'working' | 'offline' | 'error';
  currentActivity?: string;
  lastActivity: Date;
  terminalOutput?: string;
  workingOnFile?: string;
  executingCommand?: string;
}

interface AgentActivityPattern {
  pattern: RegExp;
  activityType: 'coding' | 'file_operation' | 'command_execution' | 'thinking' | 'idle';
  priority: number;
}
```

### 2. Terminal Output Monitor

```typescript
class TerminalOutputMonitor {
  private lastOutputs: Map<string, string> = new Map();
  private activityTimestamps: Map<string, Date> = new Map();
  
  async monitorAgentActivity(): Promise<void>
  private async captureTerminalOutput(agent: AgentTarget): Promise<string>
  private detectActivityFromOutput(output: string, previousOutput: string): ActivityInfo
  private isAgentIdle(agentName: string): boolean
}
```

### 3. Activity Analyzer

```typescript
class ActivityAnalyzer {
  private activityPatterns: AgentActivityPattern[];
  
  analyzeOutput(newOutput: string): ActivityInfo
  private extractCurrentFile(output: string): string | undefined
  private extractCurrentCommand(output: string): string | undefined
  private determineActivityType(output: string): ActivityType
}
```

### 4. Enhanced Status Broadcaster

```typescript
class StatusBroadcaster {
  broadcastAgentStatusUpdate(agentName: string, status: AgentStatus): void
  private shouldUpdateStatus(current: AgentStatus, new: AgentStatus): boolean
  private formatActivityDescription(activity: ActivityInfo): string
}
```

## Data Models

### Agent Activity Patterns

作業状況を検知するためのパターン定義：

```typescript
const ACTIVITY_PATTERNS: AgentActivityPattern[] = [
  // コーディング活動
  { pattern: /Creating file:|Writing to file:|Editing file:/, activityType: 'coding', priority: 10 },
  { pattern: /```[\w]*\n/, activityType: 'coding', priority: 9 },
  { pattern: /def |function |class |import |from /, activityType: 'coding', priority: 8 },
  
  // ファイル操作
  { pattern: /mkdir|touch|cp|mv|rm/, activityType: 'file_operation', priority: 7 },
  { pattern: /File created|File updated|File deleted/, activityType: 'file_operation', priority: 7 },
  
  // コマンド実行
  { pattern: /\$ |Running:|Executing:/, activityType: 'command_execution', priority: 6 },
  { pattern: /npm |pip |go |python |node /, activityType: 'command_execution', priority: 6 },
  
  // 思考・分析
  { pattern: /Let me|I'll|I need to|Looking at/, activityType: 'thinking', priority: 5 },
  { pattern: /Analyzing|Checking|Reviewing/, activityType: 'thinking', priority: 5 },
  
  // アイドル状態
  { pattern: /Human:/, activityType: 'idle', priority: 1 },
  { pattern: /\? for shortcuts/, activityType: 'idle', priority: 1 }
];
```

### Status Update Frequency

```typescript
const MONITORING_CONFIG = {
  ACTIVE_CHECK_INTERVAL: 10000,    // 10秒（アクティブ時）
  IDLE_CHECK_INTERVAL: 30000,      // 30秒（アイドル時）
  IDLE_TIMEOUT: 300000,            // 5分（アイドル判定）
  OUTPUT_BUFFER_SIZE: 200,         // 最新200行を監視
  ACTIVITY_DEBOUNCE: 2000          // 2秒のデバウンス
};
```

## Error Handling

### Terminal Access Errors
- tmuxセッションが利用できない場合の処理
- タイムアウト時の適切なフォールバック
- 権限エラーの処理

### Performance Considerations
- 大量のターミナル出力に対する効率的な処理
- メモリ使用量の最適化
- CPU負荷の軽減

### State Consistency
- エージェント状態の整合性保証
- 競合状態の回避
- 状態更新の順序保証

## Testing Strategy

### Unit Tests
- ActivityAnalyzer のパターンマッチング
- TerminalOutputMonitor の出力解析
- StatusBroadcaster の状態更新ロジック

### Integration Tests
- 実際のターミナル出力を使用したエンドツーエンドテスト
- WebUI との連携テスト
- パフォーマンステスト

### Manual Testing
- 各エージェントの実際の作業シナリオ
- 状態遷移の確認
- WebUI表示の検証

## Implementation Phases

### Phase 1: Core Activity Detection
- TerminalOutputMonitor の実装
- 基本的なActivityAnalyzer の実装
- 既存のbroadcastAgentStatusUpdate の拡張

### Phase 2: Advanced Pattern Recognition
- 詳細なアクティビティパターンの実装
- ファイル名・コマンド抽出機能
- エラー状態の検知

### Phase 3: WebUI Integration
- リアルタイム状態表示の改善
- 詳細なアクティビティ情報の表示
- パフォーマンス最適化

### Phase 4: Monitoring and Optimization
- システムパフォーマンスの監視
- 検知精度の向上
- ユーザビリティの改善