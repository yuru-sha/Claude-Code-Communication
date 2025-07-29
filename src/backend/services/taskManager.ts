import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as fsWatch from 'fs';
import path from 'path';
import { db, Task, UsageLimitState } from '../database';

const execAsync = promisify(exec);

// エージェント状態のメモリトラッキング
export let agentStatusCache: Record<string, { status: 'idle' | 'working' | 'offline', currentTask?: string, lastUpdate: Date }> = {};

// workspace ディレクトリのウォッチャー
let workspaceWatcher: fsWatch.FSWatcher | null = null;

// workspace 監視開始
export const startWorkspaceWatcher = async () => {
  const workspacePath = path.join(process.cwd(), 'workspace');
  
  try {
    // workspace ディレクトリが存在しない場合は作成
    await fs.mkdir(workspacePath, { recursive: true });
    
    if (workspaceWatcher) {
      workspaceWatcher.close();
    }
    
    workspaceWatcher = fsWatch.watch(workspacePath, { recursive: false }, async (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        // 新しいディレクトリが作成された可能性
        const newDirPath = path.join(workspacePath, filename);
        
        try {
          const stats = await fs.stat(newDirPath);
          if (stats.isDirectory() && !filename.startsWith('.')) {
            console.log(`📁 新しいプロジェクトディレクトリを検出: ${filename}`);
            
            // 進行中のタスクで projectName が未設定のものを探して更新
            await updateTaskProjectName(filename);
          }
        } catch (error) {
          // ディレクトリが削除された場合など、エラーは無視
        }
      }
    });
    
    console.log('🔍 workspace 監視を開始しました');
  } catch (error) {
    console.error('workspace 監視の開始に失敗:', error);
  }
};

// タスクの projectName を更新
const updateTaskProjectName = async (projectName: string) => {
  try {
    // 進行中のタスクで projectName が未設定のものを取得
    const tasksToUpdate = await db.task.findMany({
      where: {
        status: 'in_progress',
        projectName: null
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    if (tasksToUpdate.length > 0) {
      // 最新のタスクに projectName を設定
      const latestTask = tasksToUpdate[0];
      
      await db.task.update({
        where: { id: latestTask.id },
        data: { projectName }
      });
      
      console.log(`✅ タスク "${latestTask.title}" にプロジェクト名 "${projectName}" を自動設定しました`);
    }
  } catch (error) {
    console.error('projectName 更新エラー:', error);
  }
};

// workspace 監視停止
export const stopWorkspaceWatcher = () => {
  if (workspaceWatcher) {
    workspaceWatcher.close();
    workspaceWatcher = null;
    console.log('🔍 workspace 監視を停止しました');
  }
};

// Usage limit 検知関数
export const detectUsageLimit = (errorMessage: string): boolean => {
  // Claude Code の固定メッセージパターン（最優先）
  const claudeUsageLimitMessage = /Claude\s*usage\s*limit\s*reached\.\s*Your\s*limit\s*will\s*reset\s*at/i;
  
  if (claudeUsageLimitMessage.test(errorMessage)) {
    return true;
  }
  return false;
  // const usageLimitPatterns = [
  //   /usage.{0,10}limit/i,
  //   /rate.{0,10}limit/i,
  //   /quota.{0,10}exceeded/i,
  //   /too.{0,10}many.{0,10}requests/i,
  //   /API.{0,10}limit/i,
  //   /請求.{0,10}上限/,
  //   /使用.{0,10}制限/,
  //   /制限.{0,10}達成/,
  //   // Claude 固有のエラーパターンを追加
  //   /claude.*code.*limit/i,
  //   /billing.*limit/i,
  //   /subscription.*limit/i,
  //   /token.*limit/i,
  //   /request.*limit/i,
  //   // リセット時刻が含まれるパターン
  //   /reset\s*at\s*\d{1,2}(am|pm)/i
  // ];
  
  // return usageLimitPatterns.some(pattern => pattern.test(errorMessage));
};

// Usage limit 状態をデータベースに保存
export const saveUsageLimitToDatabase = async (errorMessage: string): Promise<void> => {
  try {
    // 既存の Usage limit 状態をチェックして重複を避ける
    const existingState = await db.getUsageLimitState();
    if (existingState && existingState.isLimited) {
      console.log('⏸️ Usage limit 状態は既に記録済み。重複登録をスキップ');
      return;
    }
    
    const now = new Date();
    let nextRetryAt: Date;
    
    // Claude Code メッセージから時刻を抽出（例: "reset at 7am (Asia/Tokyo)"）
    console.log(`🔍 メッセージパターン解析: "${errorMessage}"`);
    const timeMatch = errorMessage.match(/reset\s*at\s*(\d{1,2})(am|pm)\s*\(Asia\/Tokyo\)/i);
    
    if (timeMatch) {
      const hour = parseInt(timeMatch[1]);
      const period = timeMatch[2].toLowerCase();
      
      // 24 時間形式に変換
      let resetHour = hour;
      if (period === 'pm' && hour !== 12) {
        resetHour = hour + 12;
      } else if (period === 'am' && hour === 12) {
        resetHour = 0;
      }
      
      // JST での指定時刻を作成（今日の場合）
      const resetTimeToday = new Date();
      resetTimeToday.setHours(resetHour, 0, 0, 0);
      
      // JST から UTC に変換して設定
      const utcResetTime = new Date(resetTimeToday.getTime() - (9 * 60 * 60 * 1000));
      
      nextRetryAt = utcResetTime;
      console.log(`⏰ Usage limit 検出: ${timeMatch[1]}${timeMatch[2]} (Asia/Tokyo) にリセット予定`);
      console.log(`📅 設定されたリセット時刻: ${utcResetTime.toISOString()} (UTC) / ${utcResetTime.toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})} (JST)`);
      
    } else {
      // メッセージから待機時間を抽出（例: "Try again in 60 minutes"）
      const minutesMatch = errorMessage.match(/try\s*again\s*in\s*(\d+)\s*minutes?/i);
      const hoursMatch = errorMessage.match(/try\s*again\s*in\s*(\d+)\s*hours?/i);
      
      if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1]);
        nextRetryAt = new Date(now.getTime() + minutes * 60 * 1000);
        console.log(`⏰ Usage limit 検出: ${minutes}分後に再試行`);
      } else if (hoursMatch) {
        const hours = parseInt(hoursMatch[1]);
        nextRetryAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
        console.log(`⏰ Usage limit 検出: ${hours}時間後に再試行`);
      } else {
        // フォールバック: 1 時間後に再試行
        nextRetryAt = new Date(now.getTime() + (60 * 60 * 1000));
        console.log(`⏰ Usage limit 検出: 1 時間後に再試行 (フォールバック)`);
      }
    }
    
    const usageLimitState: UsageLimitState = {
      isLimited: true,
      pausedAt: now,
      nextRetryAt,
      retryCount: 1, // 再試行回数は 1 に固定
      lastErrorMessage: errorMessage
    };
    
    await db.saveUsageLimitState(usageLimitState);
    
    console.log(`💾 Usage limit 状態をデータベースに保存しました:`, {
      pausedAt: now.toLocaleString('ja-JP'),
      nextRetryAt: nextRetryAt.toLocaleString('ja-JP'),
      retryCount: 1,
      errorMessage: errorMessage.substring(0, 100) + '...'
    });
    
  } catch (error) {
    console.error('❌ Usage limit 状態の保存に失敗:', error);
  }
};

// Usage limit 解除チェック
export const checkUsageLimitResolution = async (
  onUsageLimitResolved: (data: any) => void
): Promise<boolean> => {
  try {
    // データベースから最新の状態を取得
    const usageLimitState = await db.getUsageLimitState();
    
    if (!usageLimitState || !usageLimitState.isLimited || !usageLimitState.nextRetryAt) {
      return true;
    }
    
    const now = new Date();
    if (now >= usageLimitState.nextRetryAt) {
      console.log(`🔄 Attempting to resume after usage limit (retry #${usageLimitState.retryCount})`);
      
      // 解除状態をデータベースに保存
      const resolvedState: UsageLimitState = {
        isLimited: false,
        pausedAt: undefined,
        nextRetryAt: undefined,
        retryCount: 0, // リセット
        lastErrorMessage: undefined
      };
      
      await db.saveUsageLimitState(resolvedState);
      
      onUsageLimitResolved({
        message: 'Claude Code usage limit resolved. Resuming task processing.',
        timestamp: now,
        previousRetryCount: usageLimitState.retryCount
      });
      
      console.log(`✅ Usage limit 解除をデータベースに保存しました`);
      return true;
    }
    
    const remainingTime = Math.round((usageLimitState.nextRetryAt.getTime() - now.getTime()) / 1000 / 60);
    console.log(`⏰ Usage limit 継続中。あと${remainingTime}分で再試行予定`);
    return false;
    
  } catch (error) {
    console.error('❌ Usage limit 解除チェック中にエラー:', error);
    return false;
  }
};

// agent-send.sh を使用してエージェントにメッセージを送信
// TmuxManager インスタンスをインポート
import { TmuxManager } from './tmuxManager';
const tmuxManager = new TmuxManager();

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
    // TmuxManager を使用してメッセージ送信
    const success = await tmuxManager.sendMessage(agentName, message);
    
    if (success) {
      console.log(`✅ Sent to ${agentName}:`, message);
    } else {
      console.error(`❌ Failed to send message to ${agentName}:`, message);
      return false;
    }
    
    // 以下のコードは残す（stderr チェックのため）
    const stderr = '';
    if (stderr) {
      console.warn('Warning:', stderr);
      
      // Usage limit 検知
      if (detectUsageLimit(stderr)) {
        console.log(`🚨 Usage limit detected in stderr: ${stderr}`);
        await saveUsageLimitToDatabase(stderr);
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
      console.log(`🚨 Usage limit detected in error: ${errorMessage}`);
      await saveUsageLimitToDatabase(errorMessage);
      onUsageLimit(errorMessage);
    }
    
    return false;
  }
};

// workspace ディレクトリを作成
export const createWorkspaceDir = async (projectName: string): Promise<void> => {
  try {
    const workspaceDir = `workspace/${projectName}`;
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
  
  // タスク専用 tmp ディレクトリを作成
  const taskTmpDir = `./tmp/${task.id}`;
  console.log(`🧹 タスク開始準備: ${taskTmpDir} ディレクトリ作成中...`);
  try {
    await execAsync(`mkdir -p ${taskTmpDir}`);
    console.log(`✅ タスク専用 tmp ディレクトリ作成完了: ${taskTmpDir}`);
  } catch (error) {
    console.error('❌ タスク専用 tmp ディレクトリ作成エラー:', error);
  }
  
  // President のみコンテキストをリセット（Workers は実行中タスクがある可能性）
  console.log('🧹 新タスク開始: President のコンテキストをリセット中...');
  
  try {
    await sendToAgentFn('president', '/clear');
    console.log(`✅ president のコンテキストリセット完了`);
    // President のリセット完了を待機
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error(`❌ president のコンテキストリセット失敗:`, error);
  }
  
  console.log('✅ President コンテキストリセット完了');
  
  const presidentMessage = `あなたは president です。

新しいタスクが来ました：

【タスク ID】${task.id}
【タイトル】${task.title}
【詳細】${task.description}
【受信時刻】${task.createdAt.toLocaleString('ja-JP')}
【推奨プロジェクト名】${projectName}

このタスクをチームに指示して、効率的に実行してください。
作業は workspace/${projectName} で行うよう指示してください。
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

// 一時停止されたタスクを再開
const resumePausedTask = async (
  task: Task,
  assignTaskFn: (task: Task) => Promise<Task | null>
): Promise<Task | null> => {
  console.log(`🔄 Resuming paused task: ${task.title}`);
  
  try {
    // workspace 内のファイルを確認して進捗を把握
    const workspaceDir = `workspace/${task.projectName}`;
    let progressInfo = '';
    
    try {
      await execAsync(`ls -la "${workspaceDir}"`);
      const { stdout: fileList } = await execAsync(`find "${workspaceDir}" -type f -name "*.js" -o -name "*.ts" -o -name "*.go" -o -name "*.py" -o -name "*.html" -o -name "*.css" 2>/dev/null | head -10`);
      
      if (fileList.trim()) {
        progressInfo = `\n\n【既存の作業内容】\nworkspace/${task.projectName} に以下のファイルが作成済みです：\n${fileList.trim()}\n\n これらの既存ファイルを確認して、中断された作業を継続してください。`;
      }
    } catch (error) {
      console.log('No existing workspace files found, treating as new task');
    }
    
    // 継続用のタスクオブジェクトを作成
    const resumeTaskData = {
      ...task,
      description: `${task.description}${progressInfo}\n\n【重要】このタスクは Usage Limit により一時中断されていました。既存の作業内容を確認して、適切に継続してください。`
    };
    
    return await assignTaskFn(resumeTaskData);
  } catch (error) {
    console.error('❌ Failed to resume paused task:', error);
    return null;
  }
};

// 全 worker 完了チェック（プロジェクト完了判定）
export const checkAllWorkersCompleted = async (taskId: string): Promise<boolean> => {
  try {
    const taskTmpDir = `./tmp/${taskId}`;
    const worker1Done = await execAsync(`test -f ${taskTmpDir}/worker1_done.txt`).then(() => true).catch(() => false);
    const worker2Done = await execAsync(`test -f ${taskTmpDir}/worker2_done.txt`).then(() => true).catch(() => false);
    const worker3Done = await execAsync(`test -f ${taskTmpDir}/worker3_done.txt`).then(() => true).catch(() => false);
    
    return worker1Done && worker2Done && worker3Done;
  } catch (error) {
    return false;
  }
};


// タスクキューの処理
export const processTaskQueue = async (
  taskQueue: Task[],
  checkUsageLimitResolution: (onUsageLimitResolved: (data: any) => void) => Promise<boolean>,
  assignTaskFn: (task: Task) => Promise<Task | null>,
  onTaskAssigned: (task: Task) => void,
  onUsageLimitResolved: (data: any) => void
) => {
  console.log(`🔄 ProcessTaskQueue called with ${taskQueue.length} tasks`);
  
  // プロジェクト完了チェック（各タスク ID ごと）
  const inProgressTasks = taskQueue.filter(t => t.status === 'in_progress');
  for (const task of inProgressTasks) {
    const allWorkersCompleted = await checkAllWorkersCompleted(task.id);
    if (allWorkersCompleted) {
      console.log(`🎉 タスク ${task.id} 全 worker 完了検知: プロジェクト完了処理開始`);
      
      // タスクを完了に更新
      await db.updateTask(task.id, { status: 'completed' });
      console.log(`✅ タスク完了: ${task.title}`);
      
      // タスク専用 tmp ディレクトリをクリーンアップ
      try {
        await execAsync(`rm -rf ./tmp/${task.id}`);
        console.log(`✅ タスク ${task.id} tmp ディレクトリクリーンアップ完了`);
      } catch (error) {
        console.error(`❌ タスク ${task.id} クリーンアップエラー:`, error);
      }
    }
  }
  
  // データベースから最新の Usage limit 状態をチェック
  console.log('🔍 Checking usage limit resolution...');
  const canResume = await checkUsageLimitResolution(onUsageLimitResolved);
  if (!canResume) {
    const usageLimitState = await db.getUsageLimitState();
    console.log(`⏸️ Task processing paused due to usage limit. Next retry: ${usageLimitState?.nextRetryAt?.toLocaleString('ja-JP')}`);
    return;
  }
  console.log('✅ Usage limit check passed');
  
  const pendingTasks = taskQueue.filter(t => t.status === 'pending');
  const pausedTasks = taskQueue.filter(t => t.status === 'paused');
  console.log(`📋 Found ${pendingTasks.length} pending tasks and ${pausedTasks.length} paused tasks`);
  
  // 優先順位: paused タスク（継続） > pending タスク（新規）
  if (pausedTasks.length > 0) {
    const resumeTask = pausedTasks[0];
    console.log(`🔄 Resuming paused task: ${resumeTask.title} (ID: ${resumeTask.id})`);
    
    try {
      const updatedTask = await resumePausedTask(resumeTask, assignTaskFn);
      console.log('📤 Resume result:', updatedTask ? 'Success' : 'Failed');
      
      if (updatedTask) {
        console.log('📢 Calling onTaskAssigned for resumed task...');
        onTaskAssigned(updatedTask);
      }
    } catch (error) {
      console.error('❌ Error in resuming task:', error);
    }
  } else if (pendingTasks.length > 0) {
    const nextTask = pendingTasks[0];
    console.log(`🚀 Processing new task: ${nextTask.title} (ID: ${nextTask.id})`);
    
    try {
      const updatedTask = await assignTaskFn(nextTask);
      console.log('📤 AssignTaskFn result:', updatedTask ? 'Success' : 'Failed');
      
      if (updatedTask) {
        console.log('📢 Calling onTaskAssigned...');
        onTaskAssigned(updatedTask);
      }
    } catch (error) {
      console.error('❌ Error in assignTaskFn:', error);
    }
  } else {
    console.log('ℹ️ No pending or paused tasks to process');
  }
};