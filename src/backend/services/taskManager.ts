import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { db, Task } from '../database';

const execAsync = promisify(exec);

// エージェント状態のメモリトラッキング
export let agentStatusCache: Record<string, { status: 'idle' | 'working' | 'offline', currentTask?: string, lastUpdate: Date }> = {};

// Usage limit 検知関数
export const detectUsageLimit = (errorMessage: string): boolean => {
  const usageLimitPatterns = [
    /usage.{0,10}limit/i,
    /rate.{0,10}limit/i,
    /quota.{0,10}exceeded/i,
    /too.{0,10}many.{0,10}requests/i,
    /API.{0,10}limit/i,
    /請求.{0,10}上限/,
    /使用.{0,10}制限/,
    /制限.{0,10}達成/
  ];
  
  return usageLimitPatterns.some(pattern => pattern.test(errorMessage));
};

// Usage limit 解除チェック
export const checkUsageLimitResolution = async (
  usageLimitState: any,
  onUsageLimitResolved: (data: any) => void
): Promise<boolean> => {
  if (!usageLimitState.isLimited || !usageLimitState.nextRetryAt) {
    return true;
  }
  
  const now = new Date();
  if (now >= usageLimitState.nextRetryAt) {
    console.log(`🔄 Attempting to resume after usage limit (retry #${usageLimitState.retryCount})`);
    
    // リセット
    usageLimitState.isLimited = false;
    usageLimitState.pausedAt = undefined;
    usageLimitState.nextRetryAt = undefined;
    
    onUsageLimitResolved({
      message: 'Claude Code usage limit resolved. Resuming task processing.',
      timestamp: now
    });
    
    return true;
  }
  
  return false;
};

// agent-send.sh を使用してエージェントにメッセージを送信
export const sendToAgent = async (
  agentName: string, 
  message: string,
  usageLimitState: any,
  onUsageLimit: (error: string) => void
): Promise<boolean> => {
  // Usage limit チェック
  if (usageLimitState.isLimited) {
    console.log(`⏸️ Skipping agent send due to usage limit. Next retry: ${usageLimitState.nextRetryAt?.toLocaleString('ja-JP')}`);
    return false;
  }
  
  try {
    const scriptPath = path.resolve(__dirname, '../../../agent-send.sh');
    const command = `bash "${scriptPath}" "${agentName}" "${message}"`;
    
    const { stdout, stderr } = await execAsync(command);
    console.log(`✅ Sent to ${agentName}:`, message);
    console.log('Output:', stdout);
    
    if (stderr) {
      console.warn('Warning:', stderr);
      
      // Usage limit 検知
      if (detectUsageLimit(stderr)) {
        onUsageLimit(stderr);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to send to ${agentName}:`, errorMessage);
    
    // Usage limit 検知
    if (detectUsageLimit(errorMessage)) {
      onUsageLimit(errorMessage);
    }
    
    return false;
  }
};

// workspace ディレクトリを作成
export const createWorkspaceDir = async (projectName: string): Promise<void> => {
  try {
    const workspaceDir = `/workspace/projects/${projectName}`;
    await execAsync(`mkdir -p "${workspaceDir}"`);
    console.log(`📁 Created workspace directory: ${workspaceDir}`);
  } catch (error) {
    console.error(`❌ Failed to create workspace directory:`, error);
  }
};

// タスクを President に送信
export const assignTaskToPresident = async (
  task: Task,
  sendToAgentFn: (agentName: string, message: string) => Promise<boolean>,
  onAgentStatusChange: (agentName: string, status: 'idle' | 'working' | 'offline', currentTask?: string) => void
) => {
  // タイトルからプロジェクト名を生成（簡易版）
  const projectName = task.title.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 30);
  
  // workspace ディレクトリを作成
  await createWorkspaceDir(projectName);
  
  const presidentMessage = `あなたは president です。

新しいタスクが来ました：

【タスク ID】${task.id}
【タイトル】${task.title}
【詳細】${task.description}
【受信時刻】${task.createdAt.toLocaleString('ja-JP')}
【推奨プロジェクト名】${projectName}

このタスクをチームに指示して、効率的に実行してください。
作業は /workspace/projects/${projectName} で行うよう指示してください。
CLAUDE.md と instructions/president.md の内容に従って進めてください。`;

  const success = await sendToAgentFn('president', presidentMessage);
  
  if (success) {
    const updatedTask = await db.updateTask(task.id, {
      status: 'in_progress',
      assignedTo: 'president',
      projectName: projectName
    });
    
    if (updatedTask) {
      // エージェント状態の変更をブロードキャスト
      onAgentStatusChange('president', 'working', task.title);
    }
    
    console.log(`📋 Task ${task.id} assigned to president with project: ${projectName}`);
    return updatedTask;
  }
  
  return null;
};

// タスクキューの処理
export const processTaskQueue = async (
  taskQueue: Task[],
  usageLimitState: any,
  checkUsageLimitFn: () => Promise<boolean>,
  assignTaskFn: (task: Task) => Promise<Task | null>,
  onTaskAssigned: (task: Task) => void
) => {
  // Usage limit チェック
  if (usageLimitState.isLimited) {
    const canResume = await checkUsageLimitFn();
    if (!canResume) {
      console.log(`⏸️ Task processing paused due to usage limit. Next retry: ${usageLimitState.nextRetryAt?.toLocaleString('ja-JP')}`);
      return;
    }
  }
  
  const pendingTasks = taskQueue.filter(t => t.status === 'pending');
  
  if (pendingTasks.length > 0) {
    const nextTask = pendingTasks[0];
    console.log(`🚀 Processing task: ${nextTask.title}`);
    
    const updatedTask = await assignTaskFn(nextTask);
    
    if (updatedTask) {
      onTaskAssigned(updatedTask);
    }
  }
};