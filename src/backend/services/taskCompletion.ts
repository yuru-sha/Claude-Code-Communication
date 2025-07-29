import { exec } from 'child_process';
import { promisify } from 'util';
import { db, Task } from '../database';

const execAsync = promisify(exec);

// タスク完了検知の状態
let isTaskCompletionCheckActive = false;
let taskCompletionPatterns = [
  // 日本語の完了パターン
  /(?:タスク|プロジェクト|作業)(?:が|を)?(?:完了|終了|完成)(?:しました|した|です)/i,
  /(?:すべて|全て)(?:の)?(?:作業|実装|開発)(?:が|を)?(?:完了|終了|完成)(?:しました|した|です)/i,
  /(?:納品|デリバリー|配信)(?:完了|終了)(?:しました|した|です)/i,
  /(?:プロジェクト|システム)(?:が|を)?(?:正常に|うまく)?(?:動作|稼働)(?:しています|している|します)/i,
  /(?:テスト|検証)(?:も)?(?:すべて|全て)?(?:完了|終了|成功)(?:しました|した|です)/i,
  /(?:成果物|deliverables?)(?:が|を)?(?:すべて|全て)?(?:完成|作成|生成)(?:しました|した|です)/i,
  
  // 英語の完了パターン
  /(?:task|project|work)(?:\s+is)?\s+(?:completed|finished|done|ready)/i,
  /(?:all|everything)(?:\s+is)?\s+(?:completed|finished|done|ready)/i,
  /(?:successfully|completely)\s+(?:completed|finished|implemented)/i,
  /(?:project|system|application)\s+is\s+(?:working|running|operational)/i,
  /(?:testing|verification)\s+(?:completed|passed|successful)/i,
  /(?:deliverables?|output|result)\s+(?:are\s+)?(?:completed|ready|generated)/i,
  
  // 記号や絵文字を含むパターン
  /✅.*(?:完了|完成|終了|done|completed)/i,
  /🎉.*(?:完了|完成|終了|done|completed)/i,
  /.*(?:完了|終了|完成|done|completed).*✅/i,
  /.*(?:完了|終了|完成|done|completed).*🎉/i
];

// 各エージェントの最後のターミナル出力を保存
let lastTerminalOutputs: Record<string, string> = {};

// タスク完了検知関数
export const checkTaskCompletion = async (
  taskQueue: Task[],
  onTaskCompleted: (task: Task, agentName: string, completionText: string) => Promise<void>
): Promise<void> => {
  if (!isTaskCompletionCheckActive) return;

  const inProgressTasks = taskQueue.filter(t => t.status === 'in_progress');
  if (inProgressTasks.length === 0) return;

  const agentTargets = [
    { name: 'president', target: 'president' },
    { name: 'boss1', target: 'multiagent:0.0' },
    { name: 'worker1', target: 'multiagent:0.1' },
    { name: 'worker2', target: 'multiagent:0.2' },
    { name: 'worker3', target: 'multiagent:0.3' }
  ];

  for (const agent of agentTargets) {
    try {
      // 最新のターミナル出力を取得
      const { stdout } = await execAsync(`tmux capture-pane -t "${agent.target}" -p | tail -50`);
      const currentOutput = stdout.trim();

      // 前回の出力と比較して新しい内容があるかチェック
      const lastOutput = lastTerminalOutputs[agent.name] || '';
      
      if (currentOutput !== lastOutput) {
        // 新しい出力から完了パターンを検索
        const completionMatch = taskCompletionPatterns.some(pattern => pattern.test(currentOutput));
        
        if (completionMatch) {
          // 該当エージェントが担当している進行中タスクを見つける
          const agentTask = inProgressTasks.find(task => task.assignedTo === agent.name);
          
          if (agentTask) {
            
            // 完了処理を呼び出し
            await onTaskCompleted(
              agentTask, 
              agent.name, 
              currentOutput.split('\n').slice(-5).join('\n') // 最後の 5 行
            );
          }
        }
        
        // 最後の出力を更新
        lastTerminalOutputs[agent.name] = currentOutput;
      }
    } catch (error) {
      // ターミナルが利用できない場合はサイレントに無視
      // console.warn(`Failed to check terminal ${agent.name}:`, error);
    }
  }
};

// タスク完了検知の開始/停止
export const startTaskCompletionMonitoring = (): NodeJS.Timeout => {
  if (isTaskCompletionCheckActive) {
    throw new Error('Task completion monitoring is already active');
  }
  
  isTaskCompletionCheckActive = true;
  
  // 30 秒ごとにチェック（メモリリーク修正版）
  // Task completion monitoring is managed by ServerManager in server.ts
  // This creates a placeholder interval that will be managed externally
  const completionCheckInterval = setInterval(() => {
    // Managed externally by ServerManager
  }, 30000);
  
  return completionCheckInterval;
};

export const stopTaskCompletionMonitoring = (): void => {
  isTaskCompletionCheckActive = false;
};

export const isTaskCompletionActive = (): boolean => {
  return isTaskCompletionCheckActive;
};