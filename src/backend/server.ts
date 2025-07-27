import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db, Task, UsageLimitState } from './database';

const execAsync = promisify(exec);

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"]
  }
});

// Express middleware
app.use(express.json());

// メモリ内キャッシュ（パフォーマンス向上のため）
let taskQueue: Task[] = [];
let usageLimitState: UsageLimitState = {
  isLimited: false,
  retryCount: 0
};

// Usage limit 状態をデータベースから読み込み
const loadUsageLimitState = async (): Promise<void> => {
  try {
    const state = await db.getUsageLimitState();
    if (state) {
      usageLimitState = state;
      console.log(`⏳ Loaded usage limit state: ${usageLimitState.isLimited ? 'LIMITED' : 'NORMAL'}`);
    } else {
      console.log('⏳ No existing usage limit state found, starting normal');
    }
  } catch (error) {
    console.error('❌ Failed to load usage limit state:', error);
  }
};

// Usage limit 状態をデータベースに保存
const saveUsageLimitState = async (): Promise<void> => {
  try {
    await db.saveUsageLimitState(usageLimitState);
  } catch (error) {
    console.error('❌ Failed to save usage limit state:', error);
  }
};

// データベースからメモリキャッシュを更新
const refreshTaskCache = async (): Promise<void> => {
  try {
    taskQueue = await db.getAllTasks();
    console.log(`📋 Loaded ${taskQueue.length} tasks from database`);
  } catch (error) {
    console.error('❌ Failed to load tasks from database:', error);
    taskQueue = [];
  }
};

// 定期的なキャッシュ更新
const schedulePeriodicRefresh = () => {
  setInterval(async () => {
    await refreshTaskCache();
  }, 30000); // 30 秒ごと
};

// システムヘルスチェック
interface SystemHealth {
  tmuxSessions: {
    president: boolean;
    multiagent: boolean;
  };
  claudeAgents: {
    president: boolean;
    boss1: boolean;
    worker1: boolean;
    worker2: boolean;
    worker3: boolean;
  };
  overallHealth: 'healthy' | 'degraded' | 'critical';
  timestamp: Date;
}

let systemHealthStatus: SystemHealth = {
  tmuxSessions: { president: false, multiagent: false },
  claudeAgents: { 
    president: false, 
    boss1: false, 
    worker1: false, 
    worker2: false, 
    worker3: false 
  },
  overallHealth: 'critical',
  timestamp: new Date()
};

// 復旧処理の実行状態
let isRecoveryInProgress = false;
let lastRecoveryAttempt = 0;

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

// tmux セッションの状態をチェック
const checkTmuxSessions = async (): Promise<{ president: boolean; multiagent: boolean }> => {
  try {
    const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}"');
    const sessions = stdout.trim().split('\n');
    return {
      president: sessions.includes('president'),
      multiagent: sessions.includes('multiagent')
    };
  } catch (error) {
    console.error('❌ Failed to check tmux sessions:', error);
    return { president: false, multiagent: false };
  }
};

// Claude Code の起動状態をチェック
const checkClaudeAgents = async (): Promise<typeof systemHealthStatus.claudeAgents> => {
  const agents = {
    president: false,
    boss1: false,
    worker1: false,
    worker2: false,
    worker3: false
  };

  // 各エージェントのターミナル出力をチェック
  const agentTargets = [
    { name: 'president', target: 'president' },
    { name: 'boss1', target: 'multiagent:0.0' },
    { name: 'worker1', target: 'multiagent:0.1' },
    { name: 'worker2', target: 'multiagent:0.2' },
    { name: 'worker3', target: 'multiagent:0.3' }
  ];

  for (const agent of agentTargets) {
    try {
      // ターミナル出力をチェック（fullscreen 出力を取得）
      const { stdout } = await execAsync(`tmux capture-pane -t "${agent.target}" -p`);
      
      // より包括的なパターンマッチング
      const claudePatterns = [
        'Human:', 'Assistant:', 'claude', 'Claude Code',
        '? for shortcuts', 'IDE disconnected', 'Bypassing Permissions',
        'Brewing', 'tokens', 'esc to interrupt', 'claudecode',
        '⚒', '◯', '✻', '>', 'Usage:', 'Continue:', 'Provide'
      ];
      
      const isClaudeRunning = claudePatterns.some(pattern => stdout.includes(pattern));
      
      // tmux セッション内のプロセスもチェック
      let hasClaudeProcess = false;
      try {
        const { stdout: paneInfo } = await execAsync(`tmux list-panes -t "${agent.target}" -F "#{pane_current_command}"`);
        hasClaudeProcess = paneInfo.includes('claude') || paneInfo.includes('node') || paneInfo.includes('bash');
      } catch (paneError) {
        // ペイン情報取得失敗時は無視
      }
      
      // どちらかの方法で検知できれば OK
      const finalDetection = isClaudeRunning || hasClaudeProcess;
      agents[agent.name as keyof typeof agents] = finalDetection;
      
      // デバッグログ（全エージェントで詳細表示）
      console.log(`🔍 ${agent.name}: terminal=${isClaudeRunning}, process=${hasClaudeProcess}, final=${finalDetection}`);
      
    } catch (error) {
      console.warn(`Failed to check ${agent.name}:`, error);
    }
  }

  return agents;
};

// エージェント状態のメモリトラッキング
let agentStatusCache: Record<string, { status: 'idle' | 'working' | 'offline', currentTask?: string, lastUpdate: Date }> = {};

// エージェント状態の変更検知とブロードキャスト
const broadcastAgentStatusUpdate = (agentName: string, newStatus: 'idle' | 'working' | 'offline', currentTask?: string) => {
  // 既存の状態と比較
  const cached = agentStatusCache[agentName];
  const hasChanged = !cached || 
    cached.status !== newStatus || 
    cached.currentTask !== currentTask;
  
  if (!hasChanged) {
    return; // 変更がない場合はブロードキャストしない
  }
  
  // キャッシュを更新
  agentStatusCache[agentName] = {
    status: newStatus,
    currentTask: currentTask,
    lastUpdate: new Date()
  };
  
  const agentUpdate = {
    id: agentName,
    name: agentName.charAt(0).toUpperCase() + agentName.slice(1),
    status: newStatus,
    currentTask: currentTask,
    timestamp: new Date()
  };
  
  console.log(`📡 Broadcasting agent status update: ${agentName} -> ${newStatus}${currentTask ? ` (task: ${currentTask})` : ''}`);
  io.emit('agent-status-updated', agentUpdate);
};

// システムヘルスチェックを実行
const performHealthCheck = async (): Promise<SystemHealth> => {
  const tmuxSessions = await checkTmuxSessions();
  const claudeAgents = await checkClaudeAgents();
  
  // 前回の状態と比較してエージェント状態の変更を検知
  const previousClaudeAgents = systemHealthStatus.claudeAgents || {};
  
  // 各エージェントの状態変更を個別に通知
  Object.keys(claudeAgents).forEach(agentName => {
    const currentStatus = claudeAgents[agentName as keyof typeof claudeAgents];
    const previousStatus = previousClaudeAgents[agentName as keyof typeof previousClaudeAgents];
    
    if (currentStatus !== previousStatus) {
      const status = currentStatus ? 'idle' : 'offline';
      broadcastAgentStatusUpdate(agentName, status);
    }
  });
  
  // 全体的な健全性を判定
  const tmuxHealthy = tmuxSessions.president && tmuxSessions.multiagent;
  const agentCount = Object.values(claudeAgents).filter(Boolean).length;
  
  let overallHealth: 'healthy' | 'degraded' | 'critical' = 'critical';
  if (tmuxHealthy && agentCount === 5) {
    overallHealth = 'healthy';
  } else if (tmuxHealthy && agentCount >= 3) {
    overallHealth = 'degraded';
  }

  const health: SystemHealth = {
    tmuxSessions,
    claudeAgents,
    overallHealth,
    timestamp: new Date()
  };

  systemHealthStatus = health;
  
  // 健全性に問題があればログ出力
  if (overallHealth !== 'healthy') {
    console.warn(`⚠️ System health: ${overallHealth}`);
    console.warn('tmux sessions:', tmuxSessions);
    console.warn('Claude agents:', claudeAgents);
  }

  // WebUI に通知
  io.emit('system-health', health);

  return health;
};

// 自動復旧関数
const performAutoRecovery = async (health: SystemHealth, isManual: boolean = false): Promise<boolean> => {
  // 復旧処理中の重複実行を防ぐ
  if (isRecoveryInProgress) {
    console.log('⚠️ Recovery already in progress, skipping...');
    return false;
  }

  // 手動復旧でない場合、最後の復旧試行から 5 分未満の場合はスキップ
  const now = Date.now();
  if (!isManual && now - lastRecoveryAttempt < 5 * 60 * 1000) {
    console.log('⚠️ Recovery attempted recently, waiting before retry...');
    return false;
  }

  isRecoveryInProgress = true;
  lastRecoveryAttempt = now;
  
  console.log('🔧 Starting auto recovery process...');
  let recoveryPerformed = false;

  try {
    // tmux セッションが起動していない場合は起動
    if (!health.tmuxSessions.president || !health.tmuxSessions.multiagent) {
      console.log('🔧 Attempting to start tmux sessions...');
      
      if (!health.tmuxSessions.president) {
        await execAsync('tmux new-session -d -s president');
        console.log('✅ Started president tmux session');
        recoveryPerformed = true;
      }
      
      if (!health.tmuxSessions.multiagent) {
        await execAsync('tmux new-session -d -s multiagent \\; split-window -h \\; split-window -v \\; select-pane -t 0 \\; split-window -v');
        console.log('✅ Started multiagent tmux session with 4 panes');
        recoveryPerformed = true;
      }
      
      // tmux セッション起動後、少し待機
      if (recoveryPerformed) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Claude Code エージェントが起動していない場合は起動
    const agentTargets = [
      { name: 'president', target: 'president', active: health.claudeAgents.president },
      { name: 'boss1', target: 'multiagent:0.0', active: health.claudeAgents.boss1 },
      { name: 'worker1', target: 'multiagent:0.1', active: health.claudeAgents.worker1 },
      { name: 'worker2', target: 'multiagent:0.2', active: health.claudeAgents.worker2 },
      { name: 'worker3', target: 'multiagent:0.3', active: health.claudeAgents.worker3 }
    ];

    for (const agent of agentTargets) {
      if (!agent.active) {
        try {
          console.log(`🔧 Starting Claude Code for ${agent.name}...`);
          await execAsync(`tmux send-keys -t "${agent.target}" 'claude --dangerously-skip-permissions' C-m`);
          console.log(`✅ Started Claude Code for ${agent.name}`);
          recoveryPerformed = true;
          
          // エージェント間で少し間隔を空ける
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Failed to start Claude Code for ${agent.name}:`, error);
        }
      }
    }

    if (recoveryPerformed) {
      console.log('🔧 Auto recovery completed. Waiting for services to stabilize...');
      
      // 復旧後の通知
      io.emit('auto-recovery-performed', {
        message: 'System auto-recovery performed. Services are starting up.',
        recoveredServices: {
          tmuxSessions: !health.tmuxSessions.president || !health.tmuxSessions.multiagent,
          claudeAgents: Object.values(health.claudeAgents).some(active => !active)
        },
        timestamp: new Date()
      });
      
      // 復旧後、30 秒待ってから再チェック
      setTimeout(async () => {
        const newHealth = await performHealthCheck();
        const activeAgents = Object.values(newHealth.claudeAgents).filter(Boolean).length;
        
        io.emit('auto-recovery-status', {
          message: `Auto recovery status: ${activeAgents}/5 Claude agents online`,
          health: newHealth,
          timestamp: new Date()
        });
      }, 30000);
      
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Error during auto recovery:', error);
    
    io.emit('auto-recovery-failed', {
      message: 'Auto recovery failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
    
    return false;
  } finally {
    // 復旧処理完了フラグをリセット
    isRecoveryInProgress = false;
  }
};

// 定期的なヘルスチェック（自動復旧機能付き）
const scheduleHealthCheck = () => {
  // 初回実行
  performHealthCheck();
  
  // 10 秒ごとにチェック（より頻繁に）
  setInterval(async () => {
    const health = await performHealthCheck();
    
    // 自動復旧トリガー条件
    if (health.overallHealth === 'critical') {
      const activeAgents = Object.values(health.claudeAgents).filter(Boolean).length;
      const tmuxHealthy = health.tmuxSessions.president && health.tmuxSessions.multiagent;
      
      // 復旧条件：tmux が落ちているか、Claude エージェントが 2 個以下の場合
      if (!tmuxHealthy || activeAgents <= 2) {
        console.log(`⚠️ Auto recovery triggered - tmux: ${tmuxHealthy}, agents: ${activeAgents}/5`);
        await performAutoRecovery(health);
      }
    }
  }, 10000);
};

// タスク完了検知関数
const checkTaskCompletion = async (): Promise<void> => {
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
          console.log(`🎯 Task completion detected in ${agent.name} terminal`);
          
          // 該当エージェントが担当している進行中タスクを見つける
          const agentTask = inProgressTasks.find(task => task.assignedTo === agent.name);
          
          if (agentTask) {
            console.log(`✅ Auto-completing task: ${agentTask.title}`);
            
            // タスクを完了状態に更新
            const updatedTask = await db.updateTask(agentTask.id, { 
              status: 'completed'
            });
            
            if (updatedTask) {
              // メモリキャッシュを更新
              await refreshTaskCache();
              
              // エージェント状態の変更をブロードキャスト
              broadcastAgentStatusUpdate(agent.name, 'idle');
              
              // クライアントに通知
              io.emit('task-completed', updatedTask);
              console.log(`🎉 Task auto-completed: ${updatedTask.title}`);
              
              // 完了時のクリーンアップ実行
              console.log('🧹 Starting cleanup after auto-completion...');
              await performTaskCompletionCleanup();
              
              // 次のタスクを処理
              setTimeout(() => processTaskQueue(), 5000);
              
              // 完了検知のログを WebUI に送信
              io.emit('task-completion-detected', {
                taskId: agentTask.id,
                taskTitle: agentTask.title,
                detectedBy: agent.name,
                completionText: currentOutput.split('\n').slice(-5).join('\n'), // 最後の 5 行
                timestamp: new Date()
              });
            }
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
const startTaskCompletionMonitoring = () => {
  if (isTaskCompletionCheckActive) return;
  
  isTaskCompletionCheckActive = true;
  console.log('🔍 Task completion monitoring started');
  
  // 30 秒ごとにチェック
  const completionCheckInterval = setInterval(async () => {
    await checkTaskCompletion();
  }, 30000);
  
  // 初回実行
  setTimeout(() => checkTaskCompletion(), 5000);
  
  return completionCheckInterval;
};

const stopTaskCompletionMonitoring = () => {
  isTaskCompletionCheckActive = false;
  console.log('⏹️ Task completion monitoring stopped');
};

// 初期化
const initializeSystem = async () => {
  await db.initialize();
  await refreshTaskCache();
  await loadUsageLimitState();
  schedulePeriodicRefresh();
  scheduleHealthCheck();
  startTaskCompletionMonitoring();
  
  console.log('🚀 Task queue system initialized with Prisma database, usage limit handling, and task completion monitoring');
};

// Usage limit 検知関数
const detectUsageLimit = (errorMessage: string): boolean => {
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

// Usage limit 状態を設定
const setUsageLimit = async (errorMessage: string) => {
  const now = new Date();
  const retryDelayMinutes = Math.min(30 + (usageLimitState.retryCount * 10), 120); // 30 分から最大 2 時間
  
  usageLimitState = {
    isLimited: true,
    pausedAt: now,
    nextRetryAt: new Date(now.getTime() + retryDelayMinutes * 60 * 1000),
    retryCount: usageLimitState.retryCount + 1,
    lastErrorMessage: errorMessage
  };
  
  await saveUsageLimitState();
  
  console.log(`⏸️ Usage limit detected. Pausing for ${retryDelayMinutes} minutes (retry #${usageLimitState.retryCount})`);
  console.log(`🔄 Next retry at: ${usageLimitState.nextRetryAt?.toLocaleString('ja-JP')}`);
  
  // 進行中のタスクを paused 状態に変更
  taskQueue.forEach(task => {
    if (task.status === 'in_progress') {
      task.status = 'paused';
      task.pausedReason = 'Claude Code usage limit reached';
      task.lastAttemptAt = now;
    }
  });
  
  await saveTasks();
  
  // クライアントに通知
  io.emit('usage-limit-reached', {
    message: `Claude Code usage limit reached. Retrying in ${retryDelayMinutes} minutes.`,
    nextRetryAt: usageLimitState.nextRetryAt,
    retryCount: usageLimitState.retryCount,
    timestamp: now
  });
};

// Usage limit 解除チェック
const checkUsageLimitResolution = async (): Promise<boolean> => {
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
    // retryCount は保持して段階的に遅延時間を調整
    
    await saveUsageLimitState();
    
    // paused 状態のタスクを pending に戻す
    const pausedTasks = taskQueue.filter(t => t.status === 'paused');
    pausedTasks.forEach(task => {
      task.status = 'pending';
      task.pausedReason = undefined;
    });
    
    await saveTasks();
    
    console.log(`✅ Usage limit resolved. Resumed ${pausedTasks.length} paused tasks.`);
    
    // クライアントに通知
    io.emit('usage-limit-resolved', {
      message: 'Claude Code usage limit resolved. Resuming task processing.',
      resumedTasks: pausedTasks.length,
      timestamp: now
    });
    
    return true;
  }
  
  return false;
};

// agent-send.sh を使用してエージェントにメッセージを送信
const sendToAgent = async (agentName: string, message: string): Promise<boolean> => {
  // Usage limit チェック
  if (usageLimitState.isLimited) {
    const canResume = await checkUsageLimitResolution();
    if (!canResume) {
      console.log(`⏸️ Skipping agent send due to usage limit. Next retry: ${usageLimitState.nextRetryAt?.toLocaleString('ja-JP')}`);
      return false;
    }
  }
  
  try {
    const scriptPath = path.resolve(__dirname, '../../agent-send.sh');
    const command = `bash "${scriptPath}" "${agentName}" "${message}"`;
    
    const { stdout, stderr } = await execAsync(command);
    console.log(`✅ Sent to ${agentName}:`, message);
    console.log('Output:', stdout);
    
    if (stderr) {
      console.warn('Warning:', stderr);
      
      // Usage limit 検知
      if (detectUsageLimit(stderr)) {
        await setUsageLimit(stderr);
        return false;
      }
    }
    
    // 成功した場合、retryCount をリセット
    if (usageLimitState.retryCount > 0) {
      usageLimitState.retryCount = 0;
      await saveUsageLimitState();
    }
    
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to send to ${agentName}:`, errorMessage);
    
    // Usage limit 検知
    if (detectUsageLimit(errorMessage)) {
      await setUsageLimit(errorMessage);
    }
    
    return false;
  }
};

// workspace ディレクトリを作成
const createWorkspaceDir = async (projectName: string): Promise<void> => {
  try {
    const workspaceDir = `/workspace/projects/${projectName}`;
    await execAsync(`mkdir -p "${workspaceDir}"`);
    console.log(`📁 Created workspace directory: ${workspaceDir}`);
  } catch (error) {
    console.error(`❌ Failed to create workspace directory:`, error);
  }
};

// タスクを President に送信
const assignTaskToPresident = async (task: Task) => {
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

  const success = await sendToAgent('president', presidentMessage);
  
  if (success) {
    const updatedTask = await db.updateTask(task.id, {
      status: 'in_progress',
      assignedTo: 'president',
      projectName: projectName
    });
    
    if (updatedTask) {
      // メモリキャッシュも更新
      const index = taskQueue.findIndex(t => t.id === task.id);
      if (index !== -1) {
        taskQueue[index] = updatedTask;
      }
      
      // エージェント状態の変更をブロードキャスト
      broadcastAgentStatusUpdate('president', 'working', task.title);
    }
    
    console.log(`📋 Task ${task.id} assigned to president with project: ${projectName}`);
  }
  
  return success;
};

// タスクキューの処理
const processTaskQueue = async () => {
  // Usage limit チェック
  if (usageLimitState.isLimited) {
    const canResume = await checkUsageLimitResolution();
    if (!canResume) {
      console.log(`⏸️ Task processing paused due to usage limit. Next retry: ${usageLimitState.nextRetryAt?.toLocaleString('ja-JP')}`);
      return;
    }
  }
  
  const pendingTasks = taskQueue.filter(t => t.status === 'pending');
  
  if (pendingTasks.length > 0) {
    const nextTask = pendingTasks[0];
    console.log(`🚀 Processing task: ${nextTask.title}`);
    
    const success = await assignTaskToPresident(nextTask);
    
    if (success) {
      // クライアントに更新を通知
      io.emit('task-assigned', nextTask);
      
      const taskCounts = await db.getTaskCounts();
      io.emit('task-queue-updated', {
        pending: taskCounts.pending,
        inProgress: taskCounts.in_progress,
        completed: taskCounts.completed,
        paused: taskCounts.paused,
        tasks: taskQueue.slice(-10)
      });
    }
  }
};

// タスク完了時の軽量クリーンアップ（tmux-continuum 対応）
const performTaskCompletionCleanup = async (): Promise<void> => {
  try {
    console.log('🧹 Performing lightweight task completion cleanup...');
    
    // 1. Claude Code プロセスを各 tmux セッション/ペインで終了
    console.log('🔄 Stopping Claude Code processes...');
    const agents = [
      { name: 'president', target: 'president' },
      { name: 'boss1', target: 'multiagent:0.0' },
      { name: 'worker1', target: 'multiagent:0.1' },
      { name: 'worker2', target: 'multiagent:0.2' },
      { name: 'worker3', target: 'multiagent:0.3' }
    ];
    
    for (const agent of agents) {
      try {
        // Ctrl+C を送信して Claude Code プロセスを終了
        await execAsync(`tmux send-keys -t "${agent.target}" C-c`);
        await new Promise(resolve => setTimeout(resolve, 500)); // 少し待機
        
        console.log(`✅ Claude Code stopped in ${agent.name} (${agent.target})`);
      } catch (error) {
        console.warn(`Warning stopping Claude Code in ${agent.name}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // 2. tmp ディレクトリをクリーンアップ
    console.log('🗑️ Cleaning tmp directory...');
    await execAsync('rm -rf ./tmp/*').catch(error => {
      console.warn('Warning during tmp cleanup:', error.message);
    });
    
    // 3. 次回起動用のメッセージ（セットアップは不要）
    console.log('📝 Ready for next task. Use ./launch-agents.sh to restart Claude Code.');
    
    console.log('✅ Lightweight cleanup finished - tmux sessions preserved');
    
    // クライアントに通知
    io.emit('system-reset', {
      message: 'Claude Code processes stopped. tmux sessions preserved. Ready for next task.',
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Error during task completion cleanup:', error);
    
    // エラーをクライアントに通知
    io.emit('system-error', {
      message: 'Failed to reset environment',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
};

// ターミナル内容取得 API
app.get('/api/terminal/:target', async (req, res) => {
  try {
    // CORS ヘッダーを明示的に設定
    res.header('Access-Control-Allow-Origin', FRONTEND_URL);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const target = req.params.target;
    console.log(`📺 Fetching terminal output for: ${target}`);
    
    // tmux セッション・ペイン名をマッピング
    let tmuxTarget = target;
    switch (target) {
      case 'boss1':
        tmuxTarget = 'multiagent:0.0';
        break;
      case 'worker1':
        tmuxTarget = 'multiagent:0.1';
        break;
      case 'worker2':
        tmuxTarget = 'multiagent:0.2';
        break;
      case 'worker3':
        tmuxTarget = 'multiagent:0.3';
        break;
      case 'president':
        tmuxTarget = 'president';
        break;
      default:
        tmuxTarget = target;
    }
    
    console.log(`🎯 Mapped ${target} to tmux target: ${tmuxTarget}`);
    
    const { stdout } = await execAsync(`tmux capture-pane -t "${tmuxTarget}" -p`);
    console.log(`✅ Terminal output length: ${stdout.length} chars for ${target}`);
    
    res.type('text/plain').send(stdout);
  } catch (error) {
    console.error(`❌ Failed to capture terminal ${req.params.target}:`, error);
    res.status(500).send(`Terminal ${req.params.target} not available\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// KPI メトリクス API
app.get('/api/kpi-metrics', async (req, res) => {
  try {
    const metrics = await db.getKPIMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Failed to get KPI metrics:', error);
    res.status(500).json({ error: 'Failed to get KPI metrics' });
  }
});

// エージェントパフォーマンス API
app.get('/api/agent-performance', async (req, res) => {
  try {
    const performance = await db.getAgentPerformance();
    res.json(performance);
  } catch (error) {
    console.error('Failed to get agent performance:', error);
    res.status(500).json({ error: 'Failed to get agent performance' });
  }
});

// タスク完了トレンド API
app.get('/api/task-trend', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const trend = await db.getTaskCompletionTrend(days);
    res.json(trend);
  } catch (error) {
    console.error('Failed to get task trend:', error);
    res.status(500).json({ error: 'Failed to get task trend' });
  }
});

// 全タスク取得 API
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await db.getAllTasks();
    res.json(tasks);
  } catch (error) {
    console.error('Failed to get tasks:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

// システムヘルスチェック API
app.get('/api/system-health', async (req, res) => {
  try {
    const health = await performHealthCheck();
    res.json(health);
  } catch (error) {
    console.error('Failed to get system health:', error);
    res.status(500).json({ error: 'Failed to get system health' });
  }
});


io.on('connection', async (socket) => {
  console.log('🔌 User connected:', socket.id);

  // 現在のタスク状況を送信
  const initialTaskCounts = await db.getTaskCounts();
  socket.emit('task-queue-updated', {
    pending: initialTaskCounts.pending,
    inProgress: initialTaskCounts.in_progress,
    completed: initialTaskCounts.completed,
    paused: initialTaskCounts.paused,
    failed: initialTaskCounts.failed,
    tasks: taskQueue.slice(-10) // 最新 10 件のタスクを送信
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });

  // 新しいタスク要求の処理
  socket.on('request-task', async (taskData) => {
    console.log('📥 Received task request:', taskData);
    
    try {
      // データベースにタスクを作成
      const newTask = await db.createTask({
        title: taskData.title,
        description: taskData.description,
        status: 'pending'
      });
      
      // メモリキャッシュを更新
      await refreshTaskCache();
      
      // クライアントに通知
      io.emit('task-queued', newTask);
      
      console.log(`📋 Task queued: ${newTask.title} (ID: ${newTask.id})`);
      
      // タスクキューを処理
      setTimeout(() => processTaskQueue(), 1000);
      
    } catch (error) {
      console.error('❌ Failed to create task:', error);
      socket.emit('task-error', {
        message: 'Failed to create task',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // タスク完了通知の受信
  socket.on('task-completed', async (taskId: string) => {
    try {
      // データベースでタスクを更新
      const updatedTask = await db.updateTask(taskId, { 
        status: 'completed'
      });
      
      if (updatedTask) {
        // メモリキャッシュを更新
        await refreshTaskCache();
        
        // エージェント状態の変更をブロードキャスト
        if (updatedTask.assignedTo) {
          broadcastAgentStatusUpdate(updatedTask.assignedTo, 'idle');
        }
        
        io.emit('task-completed', updatedTask);
        console.log(`✅ Task completed: ${updatedTask.title}`);
        
        // タスク完了時のクリーンアップとセットアップ
        console.log('🧹 Starting cleanup and reset process...');
        await performTaskCompletionCleanup();
        
        // 次のタスクを処理
        setTimeout(() => processTaskQueue(), 5000);
      }
    } catch (error) {
      console.error('❌ Failed to complete task:', error);
      socket.emit('task-error', {
        message: 'Failed to complete task',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 手動タスク完了エンドポイント（デバッグ用）
  socket.on('mark-task-completed', async (taskId: string) => {
    try {
      const updatedTask = await db.updateTask(taskId, { 
        status: 'completed'
      });
      
      if (updatedTask) {
        await refreshTaskCache();
        
        // エージェント状態の変更をブロードキャスト
        if (updatedTask.assignedTo) {
          broadcastAgentStatusUpdate(updatedTask.assignedTo, 'idle');
        }
        
        io.emit('task-completed', updatedTask);
        console.log(`✅ Task manually marked completed: ${updatedTask.title}`);
        
        // クリーンアップ実行
        await performTaskCompletionCleanup();
        setTimeout(() => processTaskQueue(), 5000);
      }
    } catch (error) {
      console.error('❌ Failed to mark task completed:', error);
    }
  });

  // タスクを失敗状態にマーク
  socket.on('mark-task-failed', async (data: { taskId: string; reason: string }) => {
    try {
      const updatedTask = await db.markTaskAsFailed(data.taskId, data.reason);
      
      if (updatedTask) {
        await refreshTaskCache();
        
        // エージェント状態の変更をブロードキャスト
        if (updatedTask.assignedTo) {
          broadcastAgentStatusUpdate(updatedTask.assignedTo, 'idle');
        }
        
        io.emit('task-failed', updatedTask);
        console.log(`❌ Task marked as failed: ${updatedTask.title} - ${data.reason}`);
        
        // 失敗時のクリーンナップ
        await performTaskCompletionCleanup();
      }
    } catch (error) {
      console.error('❌ Failed to mark task as failed:', error);
      socket.emit('task-error', {
        message: 'Failed to mark task as failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // タスク再実行
  socket.on('retry-task', async (taskId: string) => {
    try {
      const updatedTask = await db.retryTask(taskId);
      
      if (updatedTask) {
        await refreshTaskCache();
        
        // エージェント状態をリセット（再実行準備）
        if (updatedTask.assignedTo) {
          broadcastAgentStatusUpdate(updatedTask.assignedTo, 'idle');
        }
        
        io.emit('task-retried', updatedTask);
        console.log(`🔄 Task retried: ${updatedTask.title} (attempt ${updatedTask.retryCount})`);
        
        // タスクキューを処理
        setTimeout(() => processTaskQueue(), 1000);
      }
    } catch (error) {
      console.error('❌ Failed to retry task:', error);
      socket.emit('task-error', {
        message: 'Failed to retry task',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // タスクを新規として再作成
  socket.on('restart-task-as-new', async (taskId: string) => {
    try {
      const newTask = await db.cloneTaskAsNew(taskId);
      
      if (newTask) {
        await refreshTaskCache();
        io.emit('task-queued', newTask);
        console.log(`🆕 Task restarted as new: ${newTask.title}`);
        
        // タスクキューを処理
        setTimeout(() => processTaskQueue(), 1000);
      }
    } catch (error) {
      console.error('❌ Failed to restart task as new:', error);
      socket.emit('task-error', {
        message: 'Failed to restart task as new',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 緊急停止機能
  socket.on('emergency-stop', async () => {
    console.log('🚨 Emergency stop requested');
    
    try {
      // すべての進行中タスクを停止状態に
      const inProgressTasks = taskQueue.filter(t => t.status === 'in_progress');
      for (const task of inProgressTasks) {
        await db.updateTask(task.id, { status: 'pending' });
        
        // エージェント状態をリセット
        if (task.assignedTo) {
          broadcastAgentStatusUpdate(task.assignedTo, 'idle');
        }
      }
      
      // 全エージェントの状態をクリア
      agentStatusCache = {};
      
      await refreshTaskCache();
      await performTaskCompletionCleanup();
      
      io.emit('emergency-stop-completed', {
        message: 'Emergency stop completed. All tasks reset.',
        timestamp: new Date()
      });
      
      console.log('✅ Emergency stop completed');
      
    } catch (error) {
      console.error('❌ Error during emergency stop:', error);
      io.emit('system-error', {
        message: 'Emergency stop failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  // タスクキャンセル機能
  socket.on('cancel-task', async (taskId: string) => {
    const taskIndex = taskQueue.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      const task = taskQueue[taskIndex];
      console.log(`❌ Canceling task: ${task.title}`);
      
      // エージェント状態をリセット
      if (task.assignedTo && task.status === 'in_progress') {
        broadcastAgentStatusUpdate(task.assignedTo, 'idle');
      }
      
      // データベースから削除
      await db.deleteTask(task.id);
      // メモリキャッシュからも削除
      taskQueue.splice(taskIndex, 1);
      
      io.emit('task-cancelled', {
        task,
        message: `Task "${task.title}" has been cancelled`,
        timestamp: new Date()
      });
      
      // 統計を更新
      const taskCounts = await db.getTaskCounts();
      io.emit('task-queue-updated', {
        pending: taskCounts.pending,
        inProgress: taskCounts.in_progress,
        completed: taskCounts.completed,
        paused: taskCounts.paused,
        tasks: taskQueue.slice(-10)
      });
    }
  });

  // 手動復旧リクエスト
  socket.on('manual-recovery-request', async () => {
    console.log('🔧 Manual recovery requested by user');
    
    try {
      const currentHealth = await performHealthCheck();
      const recoveryResult = await performAutoRecovery(currentHealth, true);
      
      if (recoveryResult) {
        console.log('✅ Manual recovery completed successfully');
      } else {
        console.log('ℹ️ Manual recovery: No recovery actions needed');
        socket.emit('auto-recovery-status', {
          message: 'Manual recovery checked - no actions needed',
          health: currentHealth,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('❌ Manual recovery failed:', error);
      socket.emit('auto-recovery-failed', {
        message: 'Manual recovery failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  // タスク完了監視の制御
  socket.on('toggle-task-completion-monitoring', (enabled: boolean) => {
    if (enabled && !isTaskCompletionCheckActive) {
      startTaskCompletionMonitoring();
      socket.emit('task-completion-monitoring-status', {
        enabled: true,
        message: 'Task completion monitoring started',
        timestamp: new Date()
      });
    } else if (!enabled && isTaskCompletionCheckActive) {
      stopTaskCompletionMonitoring();
      socket.emit('task-completion-monitoring-status', {
        enabled: false,
        message: 'Task completion monitoring stopped',
        timestamp: new Date()
      });
    }
  });
});

// 定期的にタスクキューをチェック（バックアップ処理）
setInterval(() => {
  processTaskQueue();
}, 30000); // 30 秒ごと

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // データベース接続を閉じる
    await db.disconnect();
    console.log('💾 Database disconnected');
    
    // サーバーを閉じる
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
    
    // 5 秒でタイムアウト
    setTimeout(() => {
      console.log('⚠️ Force shutdown');
      process.exit(1);
    }, 5000);
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// シグナルハンドラー
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// サーバー起動
const startServer = async () => {
  try {
    // システム初期化
    await initializeSystem();
    
    // 本番環境では静的ファイルを配信
    if (process.env.NODE_ENV === 'production') {
      const buildPath = path.resolve(__dirname, '../../dist');
      app.use(express.static(buildPath));
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api/') && !req.path.startsWith('/socket.io/')) {
          res.sendFile(path.join(buildPath, 'index.html'));
        }
      });
    }
    
    // サーバー起動
    server.listen(PORT, () => {
      console.log(`🚀 Server listening on *:${PORT}`);
      console.log(`📋 Task queue system ready with SQLite database`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// 起動
startServer();
