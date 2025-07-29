import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { db, Task } from '../database';

const execAsync = promisify(exec);

// タスク完了検知の状態
let isTaskCompletionCheckActive = false;

// プロジェクト名決定パターン（President 用 - 命名規則準拠）
let projectNamePatterns = [
  // 【フォーマット指定】パターン（最優先）
  /【プロジェクト名】\s*([a-zA-Z0-9\-_]+)/i,
  /【作業ディレクトリ】\s*workspace\/([a-zA-Z0-9\-_]+)/i,
  
  // 日本語パターン（命名規則準拠）
  /プロジェクト名[：:\s]*([a-zA-Z0-9\-_]+)/i,
  /作業ディレクトリ[：:\s]*workspace\/([a-zA-Z0-9\-_]+)/i,
  /プロジェクトディレクトリ[：:\s]*([a-zA-Z0-9\-_]+)/i,
  /プロジェクト[：:\s]*([a-zA-Z0-9\-_]+)\s*(?:を開始|で作業)/i,
  /workspace\/([a-zA-Z0-9\-_]+)\s*で作業/i,
  
  // 英語パターン（命名規則準拠）
  /project\s+name[：:\s]*([a-zA-Z0-9\-_]+)/i,
  /working\s+directory[：:\s]*workspace\/([a-zA-Z0-9\-_]+)/i,
  /project[：:\s]*([a-zA-Z0-9\-_]+)/i
];

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

// President からタスク情報更新を検出して設定（命名規則準拠版）
const detectAndUpdateTaskInfo = async (presidentOutput: string): Promise<void> => {
  try {
    // タスク ID の検出（複数パターン対応）
    const taskIdPatterns = [
      /【タスク ID】\s*([a-zA-Z0-9]+)/i,
      /タスク ID[：:\s]*([a-zA-Z0-9]+)/i,
      /task\s+id[：:\s]*([a-zA-Z0-9]+)/i
    ];
    
    let taskId = '';
    for (const pattern of taskIdPatterns) {
      const match = presidentOutput.match(pattern);
      if (match && match[1]) {
        taskId = match[1].trim();
        break;
      }
    }
    
    if (!taskId) return;
    
    const updateData: any = {};
    
    // プロジェクト名の検出（命名規則準拠）
    for (const pattern of projectNamePatterns) {
      const match = presidentOutput.match(pattern);
      if (match && match[1]) {
        const projectName = match[1].trim();
        // 命名規則チェック：英数字とハイフンのみ
        if (/^[a-zA-Z0-9\-_]+$/.test(projectName)) {
          updateData.projectName = projectName;
          break;
        }
      }
    }
    
    // 担当エージェントの検出（President が boss1 に送るパターンも追加）
    const assignedAgentPatterns = [
      /【担当エージェント】\s*([a-zA-Z0-9]+)/i,
      /担当エージェント[：:\s]*([a-zA-Z0-9]+)/i,
      /assigned\s+to[：:\s]*([a-zA-Z0-9]+)/i,
      // boss1 への送信を検出
      /^\.\/agent-send\.sh\s+(boss1|worker[1-3])\s+/m,
      /あなたは\s+(boss1|worker[1-3])\s+です/i
    ];
    
    for (const pattern of assignedAgentPatterns) {
      const match = presidentOutput.match(pattern);
      if (match && match[1]) {
        updateData.assignedTo = match[1].trim();
        break;
      }
    }
    
    // 更新するデータがある場合のみ DB 更新
    if (Object.keys(updateData).length > 0) {
      await db.task.update({
        where: { id: taskId },
        data: updateData
      });
      
      const updates = Object.entries(updateData)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      
      console.log(`✅ President 権限: タスク "${taskId}" を更新しました (${updates})`);
      
      // プロジェクト名更新時は workspace ディレクトリも作成
      if (updateData.projectName) {
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          
          await execAsync(`mkdir -p "workspace/${updateData.projectName}"`);
          console.log(`📁 workspace/${updateData.projectName} ディレクトリを作成しました`);
        } catch (error) {
          console.warn('workspace ディレクトリ作成警告:', error);
        }
      }
    }
  } catch (error) {
    console.error('タスク情報更新エラー:', error);
  }
};

// workspace から最新のプロジェクトを検出する関数
const detectLatestProject = async (): Promise<string | null> => {
  try {
    const workspacePath = path.join(process.cwd(), 'workspace');
    
    // workspace ディレクトリが存在するかチェック
    try {
      await fs.access(workspacePath);
    } catch {
      return null;
    }

    const entries = await fs.readdir(workspacePath, { withFileTypes: true });
    const directories = entries
      .filter(entry => entry.isDirectory())
      .filter(entry => !entry.name.startsWith('.')); // 隠しディレクトリを除外

    if (directories.length === 0) {
      return null;
    }

    // 各ディレクトリの最終更新時刻を取得
    const dirStats = await Promise.all(
      directories.map(async (dir) => {
        const dirPath = path.join(workspacePath, dir.name);
        const stats = await fs.stat(dirPath);
        return {
          name: dir.name,
          mtime: stats.mtime
        };
      })
    );

    // 最新のディレクトリを返す
    const latestDir = dirStats.reduce((latest, current) => 
      current.mtime > latest.mtime ? current : latest
    );

    return latestDir.name;
  } catch (error) {
    console.error('Error detecting latest project:', error);
    return null;
  }
};

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
        // President の場合はタスク情報更新も実行
        if (agent.name === 'president') {
          await detectAndUpdateTaskInfo(currentOutput);
        }
        
        // 新しい出力から完了パターンを検索
        const completionMatch = taskCompletionPatterns.some(pattern => pattern.test(currentOutput));
        
        if (completionMatch) {
          // 該当エージェントが担当している進行中タスクを見つける
          const agentTask = inProgressTasks.find(task => task.assignedTo === agent.name);
          
          if (agentTask) {
            // 最新のプロジェクト名を検出してタスクに設定
            const latestProject = await detectLatestProject();
            if (latestProject && !agentTask.projectName) {
              // DB で projectName を更新
              await db.task.update({
                where: { id: agentTask.id },
                data: { projectName: latestProject }
              });
              
              // メモリ上のタスクオブジェクトも更新
              agentTask.projectName = latestProject;
              
              console.log(`✅ タスク "${agentTask.title}" にプロジェクト名 "${latestProject}" を自動設定しました`);
            }
            
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