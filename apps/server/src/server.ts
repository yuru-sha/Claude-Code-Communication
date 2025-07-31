import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import archiver from 'archiver';
import { db, Task, UsageLimitState } from './database';
import { AgentStatus, AgentStatusType, ACTIVITY_DETECTION_CONFIG, ActivityInfo, ActivityType, SystemHealth } from '../../../packages/types/src';
import serviceContainer from './services/ServiceContainer';
import { 
  sendToAgent, 
  checkUsageLimitResolution, 
  processTaskQueue,
  assignTaskToPresident as taskManagerAssignTaskToPresident,
  startWorkspaceWatcher,
  stopWorkspaceWatcher
} from './services/taskManager';
import { serverManager } from './utils/ServerManager';

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


// Service instances through ServiceContainer
const terminalMonitor = serviceContainer.terminalOutputMonitor;
const activityAnalyzer = serviceContainer.activityAnalyzer;
const tmuxManager = serviceContainer.tmuxManager;
const agentActivityMonitoringService = serviceContainer.agentActivityMonitoringService;
const agentProcessManager = serviceContainer.agentProcessManager;

// Adaptive check intervals based on agent activity
let currentCheckInterval: number = ACTIVITY_DETECTION_CONFIG.IDLE_CHECK_INTERVAL;
let healthCheckIntervalId: NodeJS.Timeout | null = null;

// Update check interval based on agent activity
const updateCheckInterval = (hasActiveAgents: boolean): void => {
  const newInterval = hasActiveAgents 
    ? ACTIVITY_DETECTION_CONFIG.ACTIVE_CHECK_INTERVAL 
    : ACTIVITY_DETECTION_CONFIG.IDLE_CHECK_INTERVAL;
  
  if (newInterval !== currentCheckInterval) {
    currentCheckInterval = newInterval;
    console.log(`🔄 Adjusted health check interval to ${newInterval}ms (${hasActiveAgents ? 'active' : 'idle'} mode)`);
    
    // Restart the health check interval with new timing
    if (healthCheckIntervalId) {
      serverManager.clearInterval(healthCheckIntervalId);
      startHealthCheckInterval();
    }
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

// 定期的なキャッシュ更新（メモリリーク修正版）
let refreshCacheInterval: NodeJS.Timeout | null = null;

const schedulePeriodicRefresh = () => {
  if (refreshCacheInterval) {
    serverManager.clearInterval(refreshCacheInterval);
  }
  
  refreshCacheInterval = serverManager.setInterval(async () => {
    await refreshTaskCache();
  }, 30000); // 30 秒ごと
  
  console.log('🔄 Scheduled periodic cache refresh (30s interval)');
};

const stopPeriodicRefresh = () => {
  if (refreshCacheInterval) {
    serverManager.clearInterval(refreshCacheInterval);
    refreshCacheInterval = null;
    console.log('⏹️  Stopped periodic cache refresh');
  }
};

// システムヘルスチェック

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

// タスク完了検知の状態（改善版）
let isTaskCompletionCheckActive = false;

// より厳密な完了パターン（誤検知を減らす）
let taskCompletionPatterns = [
  // President の正式完了宣言（最優先）
  /プロジェクト正式完了を宣言します[。！]/,
  /プロジェクト完全成功を正式に宣言[。！]/,
  /プロジェクトが正常に完了しました[。！]/,

  // フォールバック用の一般的なパターン
  /(?:タスク|プロジェクト|作業|開発)(?:が|を)?(?:完全に|すべて)?(?:完了|終了|完成)(?:いたし|し) ました[。！]/i,
  /(?:すべて|全て)(?:の)?(?:作業|実装|開発|機能)(?:が|を)?(?:完了|終了|完成)(?:いたし|し) ました[。！]/i,

  // 英語の完了パターン
  /(?:task|project|work|development)(?:\s+has\s+been|\s+is)?\s+(?:successfully\s+)?(?:completed|finished|done)[.!]/i,
  /(?:all|everything)(?:\s+has\s+been|\s+is)?\s+(?:successfully\s+)?(?:completed|finished|done)[.!]/i
];

// 誤検知を避けるための除外パターン
let taskCompletionExcludePatterns = [
  /(?:まだ|まだまだ|まだ未|未だ).*(?:完了|完成|終了)/i,
  /(?:完了|完成|終了).*(?:していません|できません|しません)/i,
  /(?:完了|完成|終了).*(?:予定|見込み|目標)/i,
  /(?:完了|完成|終了).*(?:したい|したく|する予定)/i,
  /(?:完了|完成|終了).*(?:でしょうか|ですか|？)/i,
  /(?:not\s+)?(?:completed|finished|done).*(?:yet|still|pending)/i,
  /(?:will\s+be|going\s+to\s+be|planning\s+to).*(?:completed|finished|done)/i
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

// Claude Code の起動状態をチェック（改善版）
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

  // 並列処理で高速化
  const checkPromises = agentTargets.map(async (agent) => {
    try {
      // 1. プロセス情報を優先的にチェック（より確実）
      let hasClaudeProcess = false;
      try {
        const { stdout: paneInfo } = await execAsync(`tmux list-panes -t "${agent.target}" -F "#{pane_current_command}"`);
        hasClaudeProcess = paneInfo.includes('claude') || paneInfo.includes('node');
      } catch (paneError) {
        // ペイン情報取得失敗時は無視
      }

      // 2. ターミナル出力をチェック（補助的）
      let isClaudeRunning = false;
      try {
        // タイムアウト付きでターミナル出力を取得
        const { stdout } = await execAsync(`timeout 3s tmux capture-pane -t "${agent.target}" -p -S -50 -E -1`);

        // より厳密なパターンマッチング
        const claudePatterns = [
          /Human:/,
          /Assistant:/,
          /claude.*code/i,
          /\? for shortcuts/,
          /Bypassing Permissions/,
          /tokens.*remaining/i,
          /esc to interrupt/,
          /Continue:/,
          /Provide/
        ];

        isClaudeRunning = claudePatterns.some(pattern => pattern.test(stdout));
      } catch (terminalError) {
        // ターミナル出力取得失敗時は無視
      }

      // 3. 最終判定（プロセス情報を優先）
      const finalDetection = hasClaudeProcess || isClaudeRunning;

      // 4. 状態変化のログ出力
      const previousState = systemHealthStatus.claudeAgents[agent.name as keyof typeof systemHealthStatus.claudeAgents];
      if (previousState !== finalDetection) {
        console.log(`🔄 ${agent.name}: ${previousState ? 'online' : 'offline'} -> ${finalDetection ? 'online' : 'offline'} (process=${hasClaudeProcess}, terminal=${isClaudeRunning})`);
      }

      return { name: agent.name, status: finalDetection };

    } catch (error) {
      console.warn(`Failed to check ${agent.name}:`, error instanceof Error ? error.message : 'Unknown error');
      return { name: agent.name, status: false };
    }
  });

  // 並列実行の結果を待機
  const results = await Promise.all(checkPromises);

  // 結果をマージ
  results.forEach(result => {
    agents[result.name as keyof typeof agents] = result.status;
  });

  return agents;
};

// エージェント状態のメモリトラッキング（拡張版）
let agentStatusCache: Record<string, AgentStatus> = {};

// デバウンス用のタイマー管理
let debounceTimers: Record<string, NodeJS.Timeout> = {};

// エージェント状態の変更検知とブロードキャスト（拡張版）
const broadcastAgentStatusUpdate = (agentName: string, newStatus: AgentStatus | 'idle' | 'working' | 'offline', currentTask?: string) => {
  // 後方互換性のため、古い形式の呼び出しを新しい形式に変換
  let agentStatus: AgentStatus;
  
  if (typeof newStatus === 'string') {
    // 古い形式の呼び出し（後方互換性）
    agentStatus = {
      id: agentName,
      name: agentName.charAt(0).toUpperCase() + agentName.slice(1),
      status: newStatus as AgentStatusType,
      currentActivity: currentTask,
      lastActivity: new Date()
    };
  } else {
    // 新しい形式の呼び出し
    agentStatus = newStatus;
  }

  // 状態変更の検証
  if (!shouldUpdateStatus(agentName, agentStatus)) {
    return; // 変更がない場合はブロードキャストしない
  }

  // デバウンス処理
  if (debounceTimers[agentName]) {
    clearTimeout(debounceTimers[agentName]);
  }

  debounceTimers[agentName] = setTimeout(() => {
    // キャッシュを更新
    agentStatusCache[agentName] = { ...agentStatus };

    // 活動説明をフォーマット
    const formattedStatus = {
      ...agentStatus,
      currentActivity: formatActivityDescription(agentStatus)
    };

    console.log(`📡 Broadcasting agent status update: ${agentName} -> ${agentStatus.status}${formattedStatus.currentActivity ? ` (${formattedStatus.currentActivity})` : ''}`);
    
    // Enhanced agent-status-updated event with activity details
    io.emit('agent-status-updated', formattedStatus);

    // Emit detailed activity information if available
    if (agentStatus.currentActivity || agentStatus.workingOnFile || agentStatus.executingCommand) {
      const activityInfo: ActivityInfo & { agentId: string } = {
        agentId: agentName,
        activityType: determineActivityTypeFromStatus(agentStatus),
        description: agentStatus.currentActivity || formatActivityDescription(agentStatus),
        timestamp: new Date(),
        fileName: agentStatus.workingOnFile,
        command: agentStatus.executingCommand
      };
      
      console.log(`📊 Broadcasting detailed activity: ${agentName} -> ${activityInfo.activityType}`);
      io.emit('agent-activity-detected', activityInfo);
    }

    // Emit comprehensive detailed status for advanced UI components
    const detailedStatus = {
      ...formattedStatus,
      activityHistory: getRecentActivityHistory(agentName)
    };
    
    io.emit('agent-detailed-status', detailedStatus);

    // デバウンスタイマーをクリア
    delete debounceTimers[agentName];
  }, ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
};

// 状態変更の検証ロジック
const shouldUpdateStatus = (agentName: string, newStatus: AgentStatus): boolean => {
  const cached = agentStatusCache[agentName];
  
  if (!cached) {
    return true; // 初回の状態設定
  }

  // 重要な変更をチェック
  const hasStatusChange = cached.status !== newStatus.status;
  const hasActivityChange = cached.currentActivity !== newStatus.currentActivity;
  const hasFileChange = cached.workingOnFile !== newStatus.workingOnFile;
  const hasCommandChange = cached.executingCommand !== newStatus.executingCommand;
  
  // 最後の更新から十分な時間が経過しているかチェック
  const timeSinceLastUpdate = Date.now() - cached.lastActivity.getTime();
  const hasSignificantTimeGap = timeSinceLastUpdate > ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE;

  return hasStatusChange || hasActivityChange || hasFileChange || hasCommandChange || hasSignificantTimeGap;
};

// 活動説明のフォーマット
const formatActivityDescription = (agentStatus: AgentStatus): string => {
  if (!agentStatus.currentActivity && !agentStatus.workingOnFile && !agentStatus.executingCommand) {
    return '';
  }

  let description = '';

  // 実行中のコマンドがある場合
  if (agentStatus.executingCommand) {
    description = `Executing: ${agentStatus.executingCommand}`;
  }
  // 作業中のファイルがある場合
  else if (agentStatus.workingOnFile) {
    description = `Working on: ${agentStatus.workingOnFile}`;
  }
  // 一般的な活動説明がある場合
  else if (agentStatus.currentActivity) {
    description = agentStatus.currentActivity;
  }

  // 説明が長すぎる場合は切り詰める
  const MAX_DESCRIPTION_LENGTH = 100;
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    description = description.substring(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
  }

  return description;
};

// エージェント状態から活動タイプを判定
const determineActivityTypeFromStatus = (agentStatus: AgentStatus): ActivityType => {
  if (agentStatus.executingCommand) {
    return 'command_execution';
  }
  if (agentStatus.workingOnFile) {
    return 'file_operation';
  }
  if (agentStatus.currentActivity) {
    // 活動内容から推測
    const activity = agentStatus.currentActivity.toLowerCase();
    if (activity.includes('code') || activity.includes('implement') || activity.includes('write')) {
      return 'coding';
    }
    if (activity.includes('file') || activity.includes('create') || activity.includes('edit')) {
      return 'file_operation';
    }
    if (activity.includes('command') || activity.includes('execute') || activity.includes('run')) {
      return 'command_execution';
    }
    if (activity.includes('think') || activity.includes('analyz') || activity.includes('review')) {
      return 'thinking';
    }
  }
  return agentStatus.status === 'working' ? 'thinking' : 'idle';
};

// エージェントの最近の活動履歴を取得（メモリ内キャッシュから）
const activityHistoryCache: Record<string, ActivityInfo[]> = {};
const MAX_ACTIVITY_HISTORY = 10;

const getRecentActivityHistory = (agentName: string): ActivityInfo[] => {
  return activityHistoryCache[agentName] || [];
};

// 活動履歴を更新
const updateActivityHistory = (agentName: string, activityInfo: ActivityInfo): void => {
  if (!activityHistoryCache[agentName]) {
    activityHistoryCache[agentName] = [];
  }
  
  // 新しい活動を先頭に追加
  activityHistoryCache[agentName].unshift(activityInfo);
  
  // 履歴の上限を維持
  if (activityHistoryCache[agentName].length > MAX_ACTIVITY_HISTORY) {
    activityHistoryCache[agentName] = activityHistoryCache[agentName].slice(0, MAX_ACTIVITY_HISTORY);
  }
};

// Enhanced system health check with activity monitoring
const performHealthCheck = async (): Promise<SystemHealth> => {
  const tmuxSessions = await checkTmuxSessions();
  const claudeAgents = await checkClaudeAgents();

  // Monitor agent activity using terminal output
  let activityResults: any[] = [];
  let hasActiveAgents = false;
  
  try {
    activityResults = await terminalMonitor.monitorAllAgents();
    
    // Process activity results and update agent statuses
    for (const result of activityResults) {
      const agentName = result.agentName;
      const isOnline = claudeAgents[agentName as keyof typeof claudeAgents];
      
      if (isOnline) {
        // Determine agent status based on activity
        let agentStatus: AgentStatusType = 'idle';
        let currentActivity = '';
        let workingOnFile: string | undefined;
        let executingCommand: string | undefined;
        
        if (result.hasNewActivity && result.activityInfo) {
          // Agent has new activity
          const activityType = result.activityInfo.activityType;
          
          if (activityType === 'coding' || activityType === 'file_operation' || 
              activityType === 'command_execution' || activityType === 'thinking') {
            agentStatus = 'working';
            hasActiveAgents = true;
          }
          
          currentActivity = result.activityInfo.description;
          workingOnFile = result.activityInfo.fileName;
          executingCommand = result.activityInfo.command;
        } else if (result.isIdle) {
          agentStatus = 'idle';
        } else {
          // Check if agent has recent activity
          const lastActivity = terminalMonitor.getLastActivityTimestamp(agentName);
          if (lastActivity) {
            const timeSinceActivity = Date.now() - lastActivity.getTime();
            if (timeSinceActivity < ACTIVITY_DETECTION_CONFIG.IDLE_TIMEOUT) {
              agentStatus = 'working';
              hasActiveAgents = true;
            }
          }
        }
        
        // Create enhanced agent status
        const enhancedStatus: AgentStatus = {
          id: agentName,
          name: agentName.charAt(0).toUpperCase() + agentName.slice(1),
          status: agentStatus,
          currentActivity,
          lastActivity: new Date(),
          terminalOutput: result.lastOutput ? result.lastOutput.slice(-200) : undefined,
          workingOnFile,
          executingCommand
        };
        
        // Update activity history if there's new activity
        if (result.hasNewActivity && result.activityInfo) {
          updateActivityHistory(agentName, result.activityInfo);
        }
        
        // Broadcast status update with activity details
        broadcastAgentStatusUpdate(agentName, enhancedStatus);
      } else {
        // Agent is offline
        const offlineStatus: AgentStatus = {
          id: agentName,
          name: agentName.charAt(0).toUpperCase() + agentName.slice(1),
          status: 'offline',
          lastActivity: new Date()
        };
        
        broadcastAgentStatusUpdate(agentName, offlineStatus);
      }
    }
  } catch (error) {
    console.error('❌ Error during activity monitoring:', error);
    // Fall back to basic status detection without activity monitoring
    const previousClaudeAgents = systemHealthStatus.claudeAgents || {};
    
    Object.keys(claudeAgents).forEach(agentName => {
      const currentStatus = claudeAgents[agentName as keyof typeof claudeAgents];
      const previousStatus = previousClaudeAgents[agentName as keyof typeof previousClaudeAgents];

      if (currentStatus !== previousStatus) {
        const status = currentStatus ? 'idle' : 'offline';
        broadcastAgentStatusUpdate(agentName, status);
      }
    });
  }

  // Adjust check interval based on agent activity
  updateCheckInterval(hasActiveAgents);

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

      try {
        if (!health.tmuxSessions.president) {
          await tmuxManager.createPresidentSession();
          console.log('✅ Started president tmux session');
          recoveryPerformed = true;
        }

        if (!health.tmuxSessions.multiagent) {
          await tmuxManager.createMultiagentSession();
          console.log('✅ Started multiagent tmux session with 4 panes');
          recoveryPerformed = true;
        }

        // tmux セッション起動後、少し待機
        if (recoveryPerformed) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error('❌ Failed to create tmux sessions during recovery:', error);
        throw error;
      }
    }

    // Claude Code エージェントが起動していない場合は起動
    const agentList = ['president', 'boss1', 'worker1', 'worker2', 'worker3'];

    for (const agentName of agentList) {
      if (!health.claudeAgents[agentName as keyof typeof health.claudeAgents]) {
        try {
          console.log(`🔧 Starting Claude Code for ${agentName}...`);
          const success = await tmuxManager.startClaudeAgent(agentName);
          if (success) {
            console.log(`✅ Started Claude Code for ${agentName}`);
            recoveryPerformed = true;
          } else {
            console.error(`❌ Failed to start Claude Code for ${agentName}`);
          }

          // エージェント間で少し間隔を空ける
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Failed to start Claude Code for ${agentName}:`, error);
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

// Start health check interval with current settings（メモリリーク修正版）
const startHealthCheckInterval = () => {
  if (healthCheckIntervalId) {
    serverManager.clearInterval(healthCheckIntervalId);
  }
  
  healthCheckIntervalId = serverManager.setInterval(async () => {
    const health = await performHealthCheck();

    // 自動復旧トリガー条件（より慎重に）
    if (health.overallHealth === 'critical') {
      const activeAgents = Object.values(health.claudeAgents).filter(Boolean).length;
      const tmuxHealthy = health.tmuxSessions.president && health.tmuxSessions.multiagent;

      // 復旧条件：tmux が落ちているか、Claude エージェントが 1 個以下の場合（より厳しく）
      if (!tmuxHealthy || activeAgents <= 1) {
        console.log(`⚠️ Auto recovery triggered - tmux: ${tmuxHealthy}, agents: ${activeAgents}/5`);
        await performAutoRecovery(health);
      }
    }
  }, currentCheckInterval);
};

// Enhanced health check scheduling with adaptive intervals
const scheduleHealthCheck = () => {
  console.log('🏥 Starting enhanced health check system with activity monitoring');
  
  // Initial health check
  performHealthCheck();
  
  // Start the adaptive interval-based health checking
  startHealthCheckInterval();
};

// 個別エージェントの完了チェック関数
const checkAgentCompletion = async (agent: { name: string; target: string }, inProgressTasks: Task[]): Promise<boolean> => {
  try {
    // 最新のターミナル出力を取得（最後の 100 行、タイムアウト付き）
    const { stdout } = await execAsync(`timeout 5s tmux capture-pane -t "${agent.target}" -p -S -100 -E -1`);
    const currentOutput = stdout.trim();

    // 前回の出力と比較して新しい内容があるかチェック
    const lastOutput = lastTerminalOutputs[agent.name] || '';

    if (currentOutput !== lastOutput) {
      // 新しい部分のみを抽出
      const newContent = currentOutput.replace(lastOutput, '').trim();

      if (newContent.length > 0) {
        // President の場合は正式完了宣言のみをチェック
        let completionMatch = false;
        if (agent.name === 'president') {
          const presidentCompletionPatterns = [
            /プロジェクト正式完了を宣言します[。！]/,
            /プロジェクト完全成功を正式に宣言[。！]/,
            /プロジェクトが正常に完了しました[。！]/
          ];
          completionMatch = presidentCompletionPatterns.some(pattern => pattern.test(newContent));
        } else {
          // 他のエージェントは除外パターンをチェック後、一般的なパターンをチェック
          const hasExcludePattern = taskCompletionExcludePatterns.some(pattern => pattern.test(newContent));
          if (!hasExcludePattern) {
            completionMatch = taskCompletionPatterns.slice(1).some(pattern => pattern.test(newContent)); // 正式完了宣言以外のパターン
          }
        }

        if (completionMatch) {
          console.log(`🎯 Task completion detected in ${agent.name} terminal`);
          console.log(`📝 Completion text: ${newContent.split('\n').slice(-3).join(' | ')}`);

          // 該当エージェントが担当している進行中タスクを見つける
          const agentTask = inProgressTasks.find(task => task.assignedTo === agent.name);

          if (agentTask) {
            // 追加の検証：タスクが実際に開始されてから一定時間経過しているか
            const taskStartTime = new Date(agentTask.updatedAt || agentTask.createdAt);
            const now = new Date();
            const elapsedMinutes = (now.getTime() - taskStartTime.getTime()) / (1000 * 60);

            if (elapsedMinutes >= 2) { // 最低 2 分は作業時間が必要
              console.log(`✅ Auto-completing task: ${agentTask.title} (elapsed: ${Math.round(elapsedMinutes)}min)`);

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

                // 完了検知のログを WebUI に送信
                io.emit('task-completion-detected', {
                  taskId: agentTask.id,
                  taskTitle: agentTask.title,
                  detectedBy: agent.name,
                  completionText: newContent.split('\n').slice(-3).join('\n'),
                  elapsedMinutes: Math.round(elapsedMinutes),
                  timestamp: new Date()
                });

                // President の正式完了宣言の場合は専用クリーンアップを実行
                if (agent.name === 'president' && (
                  /プロジェクト正式完了を宣言します[。！]/.test(newContent) ||
                  /プロジェクト完全成功を正式に宣言[。！]/.test(newContent) ||
                  /プロジェクトが正常に完了しました[。！]/.test(newContent)
                )) {
                  console.log('🎉 Project officially completed by President - performing project completion cleanup');
                  setTimeout(() => performProjectCompletionCleanup(), 2000);
                } else {
                  // 次のタスクを処理（少し遅延）
                  setTimeout(() => {
                    processTaskQueue(
                      taskQueue,
                      checkUsageLimitResolution,
                      assignTaskToPresident,
                      handleTaskAssigned,
                      handleUsageLimitResolved
                    );
                  }, 3000);
                }

                return true; // 完了処理が実行された
              }
            } else {
              console.log(`⏳ Task completion detected but too early (${Math.round(elapsedMinutes)}min < 2min required)`);
            }
          }
        }
      }

      // 最後の出力を更新
      lastTerminalOutputs[agent.name] = currentOutput;
    }
  } catch (error) {
    // ターミナルが利用できない場合はサイレントに無視
    if (error instanceof Error && !error.message.includes('timeout')) {
      console.warn(`Failed to check terminal ${agent.name}:`, error.message);
    }
  }

  return false; // 完了処理が実行されなかった
};

// タスク完了検知関数（改善版）
const checkTaskCompletion = async (): Promise<void> => {
  if (!isTaskCompletionCheckActive) return;

  const inProgressTasks = taskQueue.filter(t => t.status === 'in_progress');
  if (inProgressTasks.length === 0) return;

  // President を最優先でチェック（正式完了宣言）
  const presidentAgent = { name: 'president', target: 'president' };
  const otherAgents = [
    { name: 'boss1', target: 'multiagent:0.0' },
    { name: 'worker1', target: 'multiagent:0.1' },
    { name: 'worker2', target: 'multiagent:0.2' },
    { name: 'worker3', target: 'multiagent:0.3' }
  ];

  // まず President をチェック
  const presidentCompleted = await checkAgentCompletion(presidentAgent, inProgressTasks);
  if (presidentCompleted) {
    return; // President が完了宣言した場合は他のエージェントはチェックしない
  }

  // President が完了宣言していない場合のみ、他のエージェントをチェック
  const checkPromises = otherAgents.map(async (agent) => {
    try {
      // 最新のターミナル出力を取得（最後の 100 行、タイムアウト付き）
      const { stdout } = await execAsync(`timeout 5s tmux capture-pane -t "${agent.target}" -p -S -100 -E -1`);
      const currentOutput = stdout.trim();

      // 前回の出力と比較して新しい内容があるかチェック
      const lastOutput = lastTerminalOutputs[agent.name] || '';

      if (currentOutput !== lastOutput) {
        // 新しい部分のみを抽出
        const newContent = currentOutput.replace(lastOutput, '').trim();

        if (newContent.length > 0) {
          // 除外パターンをチェック（誤検知を防ぐ）
          const hasExcludePattern = taskCompletionExcludePatterns.some(pattern => pattern.test(newContent));

          if (!hasExcludePattern) {
            // 完了パターンをチェック
            const completionMatch = taskCompletionPatterns.some(pattern => pattern.test(newContent));

            if (completionMatch) {
              console.log(`🎯 Task completion detected in ${agent.name} terminal`);
              console.log(`📝 Completion text: ${newContent.split('\n').slice(-3).join(' | ')}`);

              // 該当エージェントが担当している進行中タスクを見つける
              const agentTask = inProgressTasks.find(task => task.assignedTo === agent.name);

              if (agentTask) {
                // 追加の検証：タスクが実際に開始されてから一定時間経過しているか
                const taskStartTime = new Date(agentTask.updatedAt || agentTask.createdAt);
                const now = new Date();
                const elapsedMinutes = (now.getTime() - taskStartTime.getTime()) / (1000 * 60);

                if (elapsedMinutes >= 2) { // 最低 2 分は作業時間が必要
                  console.log(`✅ Auto-completing task: ${agentTask.title} (elapsed: ${Math.round(elapsedMinutes)}min)`);

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

                    // 完了検知のログを WebUI に送信
                    io.emit('task-completion-detected', {
                      taskId: agentTask.id,
                      taskTitle: agentTask.title,
                      detectedBy: agent.name,
                      completionText: newContent.split('\n').slice(-3).join('\n'),
                      elapsedMinutes: Math.round(elapsedMinutes),
                      timestamp: new Date()
                    });

                    // 次のタスクを処理（少し遅延）
                    setTimeout(() => {
                      processTaskQueue(
                        taskQueue,
                        checkUsageLimitResolution,
                        assignTaskToPresident,
                        handleTaskAssigned,
                        handleUsageLimitResolved
                      );
                    }, 3000);
                  }
                } else {
                  console.log(`⏳ Task completion detected but too early (${Math.round(elapsedMinutes)}min < 2min required)`);
                }
              }
            }
          }
        }

        // 最後の出力を更新
        lastTerminalOutputs[agent.name] = currentOutput;
      }
    } catch (error) {
      // ターミナルが利用できない場合はサイレントに無視
      if (error instanceof Error && !error.message.includes('timeout')) {
        console.warn(`Failed to check terminal ${agent.name}:`, error.message);
      }
    }
  });

  // 並列実行
  await Promise.all(checkPromises);
};

// タスク完了検知の開始/停止（最適化版・メモリリーク修正版）
let taskCompletionInterval: NodeJS.Timeout | null = null;
let taskCompletionTimeout: NodeJS.Timeout | null = null;

const startTaskCompletionMonitoring = () => {
  if (isTaskCompletionCheckActive) return;

  isTaskCompletionCheckActive = true;
  console.log('🔍 Task completion monitoring started');

  // 既存のタイマーをクリア
  if (taskCompletionInterval) {
    serverManager.clearInterval(taskCompletionInterval);
  }
  if (taskCompletionTimeout) {
    serverManager.clearTimeout(taskCompletionTimeout);
  }

  // 45 秒ごとにチェック（頻度を下げて精度向上）
  taskCompletionInterval = serverManager.setInterval(async () => {
    await checkTaskCompletion();
  }, 45000);

  // 初回実行（10 秒後に開始）
  taskCompletionTimeout = serverManager.setTimeout(() => checkTaskCompletion(), 10000);

  return taskCompletionInterval;
};

const stopTaskCompletionMonitoring = () => {
  isTaskCompletionCheckActive = false;
  
  // タイマーをクリア
  if (taskCompletionInterval) {
    serverManager.clearInterval(taskCompletionInterval);
    taskCompletionInterval = null;
  }
  if (taskCompletionTimeout) {
    serverManager.clearTimeout(taskCompletionTimeout);
    taskCompletionTimeout = null;
  }
  
  console.log('⏹️ Task completion monitoring stopped');
};

// Initialize real-time agent activity monitoring service
const initializeAgentActivityMonitoring = () => {
  // Set usage limit callback for terminal monitor
  terminalMonitor.setUsageLimitCallback(handleUsageLimit);
  
  // AgentActivityMonitoringService is now managed by ServiceContainer
  
  // Start the monitoring service
  agentActivityMonitoringService.start();
  console.log('🔍 Real-time agent activity monitoring service started with usage limit detection');
};

// 初期化
const initializeSystem = async () => {
  await db.initialize();
  await refreshTaskCache();
  schedulePeriodicRefresh();
  scheduleHealthCheck();
  startTaskCompletionMonitoring();
  
  // Initialize real-time agent activity monitoring
  initializeAgentActivityMonitoring();

  console.log('🚀 Task queue system initialized with Prisma database, usage limit handling, task completion monitoring, and real-time agent activity monitoring');
};



// Usage limit 解除時の server 固有処理
const handleUsageLimitResolved = async (data: any) => {
  try {
    // データベースから paused 状態のタスクを取得
    const allTasks = await db.getAllTasks();
    const pausedTasks = allTasks.filter(t => t.status === 'paused');
    
    console.log(`🔄 Usage limit resolved. Resuming ${pausedTasks.length} paused tasks...`);
    
    // データベースでタスクを in_progress に戻す（assignedTo を保持）
    for (const task of pausedTasks) {
      await db.updateTask(task.id, { 
        status: 'in_progress',
        pausedReason: undefined 
        // assignedTo は保持（削除しない）
      });
      console.log(`▶️ Task resumed from pause: ${task.title} (ID: ${task.id}) - Agent: ${task.assignedTo}`);
    }
    
    // メモリキューも更新（assignedTo を保持）
    pausedTasks.forEach(task => {
      const index = taskQueue.findIndex(t => t.id === task.id);
      if (index !== -1) {
        taskQueue[index] = { 
          ...taskQueue[index], 
          status: 'in_progress', 
          pausedReason: undefined 
          // assignedTo は保持（元のタスクから継承）
        };
      }
    });

    // メモリキャッシュを更新
    await refreshTaskCache();

    console.log(`✅ Usage limit resolved. Resumed ${pausedTasks.length} paused tasks.`);

    // クライアントに通知
    io.emit('usage-limit-resolved', {
      message: data.message,
      resumedTasks: pausedTasks.length,
      timestamp: data.timestamp,
      previousRetryCount: data.previousRetryCount
    });
  } catch (error) {
    console.error('❌ Error handling usage limit resolution:', error);
  }
};

// Usage limit 検知時の server 固有処理
const handleUsageLimit = async (errorMessage: string) => {
  console.log('⏰ Usage limit detected. Pausing in-progress tasks...');
  
  try {
    // 進行中のタスクを一時停止状態に変更
    const allTasks = await db.getAllTasks();
    const inProgressTasks = allTasks.filter(t => t.status === 'in_progress');
    
    for (const task of inProgressTasks) {
      await db.updateTask(task.id, { 
        status: 'paused',
        pausedReason: `Usage limit reached: ${errorMessage}` 
      });
      console.log(`⏸️ Task paused due to usage limit: ${task.title} (ID: ${task.id})`);
      
      // タスクキューも更新
      const index = taskQueue.findIndex(t => t.id === task.id);
      if (index !== -1) {
        taskQueue[index] = { 
          ...taskQueue[index], 
          status: 'paused',
          pausedReason: `Usage limit reached: ${errorMessage}`
        };
      }
    }
    
    // メモリキャッシュを更新
    await refreshTaskCache();
    
    // クライアントに通知
    io.emit('usage-limit-reached', {
      message: `Claude Code usage limit reached: ${errorMessage}`,
      pausedTasks: inProgressTasks.length,
      timestamp: new Date()
    });
    
    console.log(`⏸️ Paused ${inProgressTasks.length} tasks due to usage limit`);
  } catch (error) {
    console.error('❌ Failed to pause tasks during usage limit:', error);
  }
};

// workspace ディレクトリを作成
const createWorkspaceDir = async (projectName: string): Promise<void> => {
  try {
    const workspaceDir = `workspace/${projectName}`;
    await execAsync(`mkdir -p "${workspaceDir}"`);
    console.log(`📁 Created workspace directory: ${workspaceDir}`);
  } catch (error) {
    console.error(`❌ Failed to create workspace directory:`, error);
  }
};

// プロジェクト開始時のクリア処理
const performProjectStartCleanup = async (): Promise<void> => {
  try {
    console.log('🚀 Performing project start cleanup...');

    // 各エージェントの Claude Code に /clear を送信（並列実行で高速化）
    const agents = [
      { name: 'president', target: 'president' },
      { name: 'boss1', target: 'multiagent:0.0' },
      { name: 'worker1', target: 'multiagent:0.1' },
      { name: 'worker2', target: 'multiagent:0.2' },
      { name: 'worker3', target: 'multiagent:0.3' }
    ];

    // 全エージェントに並列で /clear を送信
    const clearPromises = agents.map(async (agent) => {
      try {
        // tmux ペインが存在するかチェック
        await execAsync(`tmux has-session -t "${agent.target.split(':')[0]}" 2>/dev/null`);

        // 特定のペインを選択してからコマンドを送信
        await execAsync(`tmux select-pane -t "${agent.target}"`);

        // /clear コマンドを送信（Escape とコマンドと Enter を分けて送信）
        await execAsync(`tmux send-keys -t "${agent.target}" Escape`);
        await execAsync(`tmux send-keys -t "${agent.target}" '/clear'`);
        await execAsync(`tmux send-keys -t "${agent.target}" C-m`);
        
        console.log(`✅ Claude Code session cleared in ${agent.name} for new project`);
        return true;
      } catch (error) {
        console.warn(`Warning clearing Claude Code in ${agent.name}:`, error instanceof Error ? error.message : 'Unknown error');
        return false;
      }
    });

    // 全エージェントの /clear 完了を待機（最大 1 秒）
    await Promise.allSettled(clearPromises);
    await new Promise(resolve => setTimeout(resolve, 1000)); // /clear 実行完了を一括待機

    console.log('✅ Project start cleanup completed (parallel execution)');
  } catch (error) {
    console.error('❌ Error during project start cleanup:', error);
  }
};

// タスクを President に送信（taskManager.ts の関数を呼び出し）
const assignTaskToPresident = async (task: Task) => {
  console.log(`👑 AssignTaskToPresident called for task: ${task.title} (ID: ${task.id})`);
  
  // taskManager.ts の assignTaskToPresident を呼び出し（/clear を含む処理）
  const sendToAgentFn = async (agentName: string, message: string) => {
    const currentUsageLimitState = await db.getUsageLimitState() || { isLimited: false, retryCount: 0 };
    return await sendToAgent(agentName, message, currentUsageLimitState, handleUsageLimit);
  };

  const onAgentStatusChange = (agentName: string, status: 'idle' | 'working' | 'offline', currentTask?: string) => {
    broadcastAgentStatusUpdate(agentName, status, currentTask);
  };

  const updatedTask = await taskManagerAssignTaskToPresident(
    task,
    sendToAgentFn,
    onAgentStatusChange
  );

  return updatedTask;
};

// Server 固有のタスク割り当て成功ハンドラー
const handleTaskAssigned = (task: Task) => {
  // クライアントに更新を通知
  io.emit('task-assigned', task);

  // タスクカウントを更新して通知
  db.getTaskCounts().then(taskCounts => {
    io.emit('task-queue-updated', {
      pending: taskCounts.pending,
      inProgress: taskCounts.in_progress,
      completed: taskCounts.completed,
      paused: taskCounts.paused,
      tasks: taskQueue.slice(-10)
    });
  });
};

// プロジェクト完了時の専用クリーンアップ（/clear + tmp 削除）
const performProjectCompletionCleanup = async (): Promise<void> => {
  try {
    console.log('🎉 Performing project completion cleanup...');

    // 1. tmp ディレクトリをクリーンアップ（プロジェクト完了時のみ）
    console.log('🗑️ Cleaning tmp directory (project completed)...');
    await execAsync('rm -rf ./tmp/*').catch(error => {
      console.warn('Warning during tmp cleanup:', error.message);
    });

    // 2. Claude Code に /clear を送信してセッションをクリア（tmux 作法に従って）
    console.log('🧹 Clearing Claude Code sessions...');
    const agents = [
      { name: 'president', target: 'president' },
      { name: 'boss1', target: 'multiagent:0.0' },
      { name: 'worker1', target: 'multiagent:0.1' },
      { name: 'worker2', target: 'multiagent:0.2' },
      { name: 'worker3', target: 'multiagent:0.3' }
    ];

    for (const agent of agents) {
      try {
        // tmux ペインが存在するかチェック
        await execAsync(`tmux has-session -t "${agent.target.split(':')[0]}" 2>/dev/null`);

        // 特定のペインを選択してからコマンドを送信
        await execAsync(`tmux select-pane -t "${agent.target}"`);

        // /clear コマンドを送信（Escape とコマンドと Enter を分けて送信）
        await execAsync(`tmux send-keys -t "${agent.target}" Escape`);
        await execAsync(`tmux send-keys -t "${agent.target}" '/clear'`);
        await execAsync(`tmux send-keys -t "${agent.target}" C-m`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // クリア処理を待機

        console.log(`✅ Claude Code session cleared in ${agent.name} (${agent.target})`);
      } catch (error) {
        console.warn(`Warning clearing Claude Code in ${agent.name}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // tmp ディレクトリをクリーンアップ
    console.log('🗑️ Cleaning tmp directory...');
    await execAsync('rm -rf ./tmp/*').catch(error => {
      console.warn('Warning during tmp cleanup:', error.message);
    });

    console.log('✅ Project completion cleanup finished - Claude Code sessions cleared');

    // クライアントに通知
    io.emit('project-completion-cleanup', {
      message: 'Project completed successfully. Claude Code sessions cleared and ready for next project.',
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Error during project completion cleanup:', error);

    // エラーをクライアントに通知
    io.emit('system-error', {
      message: 'Failed to perform project completion cleanup',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
};

// タスク完了時の軽量クリーンアップ（他タスクに影響しない）
const performTaskCompletionCleanup = async (): Promise<void> => {
  try {
    console.log('🧹 Performing task completion cleanup (tmp only)...');

    // tmp ディレクトリのクリーンアップは無効化（エージェントが管理）
    // instructions/boss.md と instructions/worker.md でエージェントが管理：
    // - Worker: touch ./tmp/${TASK_ID}/worker${NUM}_done.txt
    // - Boss: rm -f ${TASK_TMP_DIR}/worker*_done.txt
    console.log('📝 Agents will manage tmp files according to instructions/');
    console.log('✅ Task completion - no backend cleanup needed');

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

// エージェント起動 API
app.post('/api/agents/:agentName/start', async (req, res) => {
  try {
    const { agentName } = req.params;
    console.log(`🚀 API request to start Claude Code for: ${agentName}`);
    
    const success = await tmuxManager.startClaudeAgent(agentName);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Claude Code started successfully for ${agentName}`,
        timestamp: new Date()
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: `Failed to start Claude Code for ${agentName}`,
        timestamp: new Date()
      });
    }
  } catch (error) {
    console.error('Error starting Claude Code:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
});

// 全エージェント起動 API
app.post('/api/agents/start-all', async (req, res) => {
  try {
    console.log('🚀 API request to start all Claude Code agents');
    
    await tmuxManager.startAllClaudeAgents();
    
    res.json({ 
      success: true, 
      message: 'All Claude Code agents started successfully',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error starting all Claude Code agents:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start all Claude Code agents',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
});

// エージェントメッセージ送信 API
app.post('/api/agents/:agentName/message', async (req, res) => {
  try {
    const { agentName } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Message is required',
        timestamp: new Date()
      });
    }
    
    console.log(`📤 API request to send message to ${agentName}: ${message}`);
    
    const success = await tmuxManager.sendMessage(agentName, message);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Message sent successfully to ${agentName}`,
        timestamp: new Date()
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: `Failed to send message to ${agentName}`,
        timestamp: new Date()
      });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
});

// 利用可能エージェント一覧 API
app.get('/api/agents', async (req, res) => {
  try {
    const agents = tmuxManager.getAvailableAgents();
    res.json({ 
      success: true, 
      agents,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error getting available agents:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
});

// tmux セットアップ API
app.post('/api/tmux/setup', async (req, res) => {
  try {
    console.log('🚀 API request to setup tmux environment');
    
    await tmuxManager.setupEnvironment();
    
    res.json({ 
      success: true, 
      message: 'tmux environment setup completed successfully',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error setting up tmux environment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to setup tmux environment',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
});

// プロジェクトファイル一覧取得 API
app.get('/api/projects/:projectName/files', async (req, res) => {
  try {
    const { projectName } = req.params;
    const projectPath = path.join(__dirname, '../../workspace', projectName);

    // プロジェクトディレクトリの存在確認
    try {
      await fs.access(projectPath);
    } catch {
      return res.status(404).json({ error: 'Project not found' });
    }

    const files = await getProjectFileList(projectPath, '');
    const stats = await fs.stat(projectPath);

    const projectStructure = {
      name: projectName,
      path: projectPath,
      files,
      totalSize: files.reduce((total, file) => total + file.size, 0),
      lastModified: stats.mtime
    };

    res.json(projectStructure);
  } catch (error) {
    console.error('Error getting project files:', error);
    res.status(500).json({ error: 'Failed to get project files' });
  }
});

// プロジェクト Zip ダウンロード API
app.get('/api/projects/:projectName/download/zip', async (req, res) => {
  try {
    const { projectName } = req.params;
    const projectPath = path.join(__dirname, '../../workspace', projectName);

    // プロジェクトディレクトリの存在確認
    try {
      await fs.access(projectPath);
    } catch {
      return res.status(404).json({ error: 'Project not found' });
    }

    // ZIP ファイル名とヘッダー設定
    const zipFilename = `${projectName}-${new Date().toISOString().split('T')[0]}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    // アーカイバーを作成
    const archive = archiver('zip', { zlib: { level: 9 } });

    // エラーハンドリング
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create zip archive' });
      }
    });

    // アーカイブをレスポンスにパイプ
    archive.pipe(res);

    // プロジェクトディレクトリを再帰的にアーカイブに追加
    archive.directory(projectPath, projectName);

    // アーカイブを完了
    await archive.finalize();

  } catch (error) {
    console.error('Error creating project zip:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create project zip' });
    }
  }
});

// プロジェクトファイル一覧取得のヘルパー関数
const getProjectFileList = async (dirPath: string, relativePath: string): Promise<any[]> => {
  const files: any[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);

      // 隠しファイルや node_modules などをスキップ
      if (entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === '__pycache__' ||
        entry.name === '.git') {
        continue;
      }

      const stats = await fs.stat(fullPath);

      if (entry.isDirectory()) {
        files.push({
          path: entryRelativePath,
          name: entry.name,
          size: 0,
          type: 'directory',
          modified: stats.mtime
        });

        // 再帰的にサブディレクトリを処理
        const subFiles = await getProjectFileList(fullPath, entryRelativePath);
        files.push(...subFiles);
      } else {
        files.push({
          path: entryRelativePath,
          name: entry.name,
          size: stats.size,
          type: 'file',
          modified: stats.mtime
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return files;
};

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

  // タスク削除
  socket.on('delete-task', async (taskId: string) => {
    try {
      // タスク情報を削除前に取得（プロジェクト名を確認するため）
      const task = taskQueue.find(t => t.id === taskId);
      
      if (!task) {
        socket.emit('task-error', {
          message: 'Task not found',
          error: `Task with ID ${taskId} does not exist`
        });
        return;
      }

      // 実行中または一時停止中のタスクは削除を拒否
      if (task.status === 'in_progress' || task.status === 'paused') {
        console.log(`🚫 Delete rejected: Task "${task.title}" is currently ${task.status}`);
        socket.emit('task-delete-rejected', {
          message: `実行中または一時停止中のタスクは削除できません`,
          taskTitle: task.title,
          currentStatus: task.status,
          taskId: taskId
        });
        return;
      }

      const success = await db.deleteTask(taskId);

      if (success) {
        // workspace/以下のプロジェクトディレクトリも削除
        if (task?.projectName) {
          try {
            const projectPath = path.join(__dirname, '../../workspace', task.projectName);

            // プロジェクトディレクトリが存在するか確認
            try {
              await fs.access(projectPath);
              // 存在する場合は削除
              await execAsync(`rm -rf "${projectPath}"`);
              console.log(`🗂️ Project directory deleted: workspace/${task.projectName}`);
            } catch (accessError) {
              // ディレクトリが存在しない場合はスキップ
              console.log(`ℹ️ Project directory not found (already deleted): workspace/${task.projectName}`);
            }
          } catch (error) {
            console.warn(`⚠️ Failed to delete project directory for ${task.projectName}:`, error instanceof Error ? error.message : 'Unknown error');
          }
        }

        await refreshTaskCache();

        // 全クライアントにタスク削除を通知
        io.emit('task-deleted', { taskId, projectName: task?.projectName });
        console.log(`🗑️ Task deleted: ${taskId}${task?.projectName ? ` (project: ${task.projectName})` : ''}`);
      }
    } catch (error) {
      console.error('❌ Failed to delete task:', error);
      socket.emit('task-error', {
        message: 'Failed to delete task',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
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
      setTimeout(() => {
        processTaskQueue(
          taskQueue,
          checkUsageLimitResolution,
          assignTaskToPresident,
          handleTaskAssigned,
          handleUsageLimitResolved
        );
      }, 1000);

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

        // タスク完了時のクリーンアップ実行
        console.log('🧹 Task completed - performing cleanup...');
        await performTaskCompletionCleanup();

        // 次のタスクを処理
        setTimeout(() => {
          processTaskQueue(
            taskQueue,
            checkUsageLimitResolution,
            assignTaskToPresident,
            handleTaskAssigned,
            handleUsageLimitResolved
          );
        }, 5000);
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
        setTimeout(() => {
          processTaskQueue(
            taskQueue,
            checkUsageLimitResolution,
            assignTaskToPresident,
            handleTaskAssigned,
            handleUsageLimitResolved
          );
        }, 5000);
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
        setTimeout(() => {
          processTaskQueue(
            taskQueue,
            checkUsageLimitResolution,
            assignTaskToPresident,
            handleTaskAssigned,
            handleUsageLimitResolved
          );
        }, 1000);
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
        setTimeout(() => {
          processTaskQueue(
            taskQueue,
            checkUsageLimitResolution,
            assignTaskToPresident,
            handleTaskAssigned,
            handleUsageLimitResolved
          );
        }, 1000);
      }
    } catch (error) {
      console.error('❌ Failed to restart task as new:', error);
      socket.emit('task-error', {
        message: 'Failed to restart task as new',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Paused タスクの手動解除機能
  socket.on('resume-paused-tasks', async () => {
    console.log('🔄 Manual resume paused tasks requested');

    try {
      // データベースから paused 状態のタスクを取得
      const allTasks = await db.getAllTasks();
      const pausedTasks = allTasks.filter(t => t.status === 'paused');
      
      if (pausedTasks.length === 0) {
        socket.emit('resume-paused-result', {
          success: true,
          message: 'No paused tasks found',
          resumedCount: 0
        });
        return;
      }

      console.log(`🔄 Manually resuming ${pausedTasks.length} paused tasks...`);
      
      // データベースでタスクを in_progress に戻す（assignedTo を保持）
      for (const task of pausedTasks) {
        await db.updateTask(task.id, { 
          status: 'in_progress',
          pausedReason: undefined 
          // assignedTo は保持（削除しない）
        });
        console.log(`▶️ Manually resumed: ${task.title} (ID: ${task.id}) - Agent: ${task.assignedTo}`);
      }
      
      // メモリキューも更新（assignedTo を保持）
      pausedTasks.forEach(task => {
        const index = taskQueue.findIndex(t => t.id === task.id);
        if (index !== -1) {
          taskQueue[index] = { 
            ...taskQueue[index], 
            status: 'in_progress', 
            pausedReason: undefined 
            // assignedTo は保持（元のタスクから継承）
          };
        }
      });

      // メモリキャッシュを更新
      await refreshTaskCache();
      
      // クライアントに結果通知
      socket.emit('resume-paused-result', {
        success: true,
        message: `Successfully resumed ${pausedTasks.length} paused tasks`,
        resumedCount: pausedTasks.length
      });

      // 全クライアントに再開通知
      io.emit('paused-tasks-resumed', {
        message: `${pausedTasks.length} paused tasks manually resumed`,
        timestamp: new Date(),
        resumedTasks: pausedTasks.map(t => ({ id: t.id, title: t.title, assignedTo: t.assignedTo }))
      });

      console.log(`✅ Manually resumed ${pausedTasks.length} paused tasks`);
      
    } catch (error) {
      console.error('❌ Failed to resume paused tasks:', error);
      socket.emit('resume-paused-result', {
        success: false,
        message: 'Failed to resume paused tasks',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 緊急停止機能
  socket.on('emergency-stop', async () => {
    console.log('🚨 Emergency stop requested');

    try {
      // 1. 全エージェントに SIGINT を送信
      console.log('🚨 Sending SIGINT to all agents...');
      const signalResults = await agentProcessManager.sendSIGINTToAll();
      console.log(`🚨 SIGINT results: ${signalResults.success.length} stopped, ${signalResults.failed.length} failed`);
      
      // 2. すべての進行中タスクを停止状態に
      const inProgressTasks = taskQueue.filter(t => t.status === 'in_progress');
      for (const task of inProgressTasks) {
        await db.updateTask(task.id, { status: 'pending' });

        // エージェント状態をリセット
        if (task.assignedTo) {
          broadcastAgentStatusUpdate(task.assignedTo, 'idle');
        }
      }

      // 3. 全エージェントの状態をクリア
      agentStatusCache = {};

      await refreshTaskCache();
      
      // 4. プロセス管理も停止状態に更新
      for (const agentId of signalResults.success) {
        agentProcessManager.updateAgentStatus(agentId, 'stopped');
      }
      for (const agentId of signalResults.failed) {
        agentProcessManager.updateAgentStatus(agentId, 'error');
      }
      
      // 緊急停止時もクリーンアップを無効化（ユーザーが手動で対処）
      console.log('🚨 Emergency stop - agent contexts preserved for manual recovery');

      io.emit('emergency-stop-completed', {
        message: `Emergency stop completed. SIGINT sent to ${signalResults.success.length} agents. All tasks reset.`,
        signalResults,
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

      // 実行中の Claude Code プロセスに Ctrl+C を送信
      if (task.assignedTo && task.status === 'in_progress') {
        try {
          const { spawn } = require('child_process');
          // tmux セッションの Claude Code プロセスに割り込み信号を送信
          const killProcess = spawn('tmux', ['send-keys', '-t', `multiagent:${task.assignedTo}`, 'C-c'], {
            stdio: 'ignore'
          });
          console.log(`📡 Sent Ctrl+C to ${task.assignedTo} Claude Code process`);
        } catch (error) {
          console.error(`❌ Failed to send Ctrl+C to ${task.assignedTo}:`, error);
        }
        broadcastAgentStatusUpdate(task.assignedTo, 'idle');
      }

      // データベースのステータスを cancelled に変更
      await db.updateTask(task.id, { status: 'cancelled', cancelledAt: new Date() });
      
      // メモリキャッシュでもステータス更新（projectName と assignedTo は履歴として保持）
      taskQueue[taskIndex] = {
        ...task,
        status: 'cancelled' as const,
        cancelledAt: new Date()
        // assignedTo は履歴として保持（エージェントステータスのみ idle に更新済み）
      };

      io.emit('task-cancelled', {
        task: taskQueue[taskIndex],
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
        cancelled: taskCounts.cancelled || 0,
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

  // セッションリセット機能
  socket.on('session-reset', async () => {
    console.log('🔄 Session reset requested by user');

    try {
      // 1. tmux サーバーを終了
      console.log('🔧 Killing tmux server...');
      try {
        await execAsync('tmux kill-server 2>/dev/null || true');
        console.log('✅ tmux server killed');
      } catch (error) {
        console.warn('⚠️ tmux server was not running or could not be killed');
      }

      // 2. tmp ディレクトリをクリア
      console.log('🗑️ Clearing tmp directory...');
      try {
        await execAsync('find ./tmp -mindepth 1 -delete 2>/dev/null || true');
        console.log('✅ tmp directory cleared');
      } catch (error) {
        console.warn('⚠️ Failed to clear tmp directory:', error);
      }

      // 3. TmuxManager を使用してセットアップ実行
      console.log('🚀 Setting up tmux environment...');
      try {
        await tmuxManager.setupEnvironment();
        console.log('✅ tmux environment setup completed');
      } catch (error) {
        console.error('❌ Failed to setup tmux environment:', error);
        throw new Error('tmux environment setup failed');
      }

      // 4. エージェント状態をリセット
      agentStatusCache = {};
      lastTerminalOutputs = {};
      
      // 5. 進行中のタスクをリセット
      const inProgressTasks = taskQueue.filter(t => t.status === 'in_progress');
      for (const task of inProgressTasks) {
        await db.updateTask(task.id, { status: 'pending', assignedTo: null });
      }
      
      // 6. キャッシュをリフレッシュ
      await refreshTaskCache();

      // 成功通知
      io.emit('session-reset-completed', {
        message: 'Project reset completed successfully. tmux sessions recreated.',
        timestamp: new Date()
      });

      console.log('✅ Project reset completed');
    } catch (error) {
      console.error('❌ Project reset failed:', error);
      socket.emit('session-reset-failed', {
        message: 'Project reset failed',
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

  // Real-time agent activity monitoring control
  socket.on('toggle-agent-activity-monitoring', (enabled: boolean) => {
    try {
      if (enabled && agentActivityMonitoringService && !agentActivityMonitoringService.getHealthStatus().isRunning) {
        agentActivityMonitoringService.start();
        socket.emit('agent-activity-monitoring-status', {
          enabled: true,
          message: 'Real-time agent activity monitoring started',
          timestamp: new Date()
        });
      } else if (!enabled && agentActivityMonitoringService && agentActivityMonitoringService.getHealthStatus().isRunning) {
        agentActivityMonitoringService.stop();
        socket.emit('agent-activity-monitoring-status', {
          enabled: false,
          message: 'Real-time agent activity monitoring stopped',
          timestamp: new Date()
        });
      }
    } catch (error) {
      socket.emit('agent-activity-monitoring-status', {
        enabled: false,
        message: `Error controlling monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      });
    }
  });

  // Get agent activity monitoring statistics
  socket.on('get-agent-monitoring-stats', () => {
    try {
      if (agentActivityMonitoringService) {
        const stats = agentActivityMonitoringService.getStats();
        const healthStatus = agentActivityMonitoringService.getHealthStatus();
        const agentStates = agentActivityMonitoringService.getAgentStates();
        
        socket.emit('agent-monitoring-stats', {
          stats,
          healthStatus,
          agentCount: agentStates.size,
          timestamp: new Date()
        });
      } else {
        socket.emit('agent-monitoring-stats', {
          error: 'Monitoring service not initialized',
          timestamp: new Date()
        });
      }
    } catch (error) {
      socket.emit('agent-monitoring-stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  // Update monitoring service configuration
  socket.on('update-monitoring-config', (config: any) => {
    try {
      if (agentActivityMonitoringService) {
        agentActivityMonitoringService.updateConfig(config);
        socket.emit('monitoring-config-updated', {
          success: true,
          message: 'Monitoring configuration updated successfully',
          timestamp: new Date()
        });
      } else {
        socket.emit('monitoring-config-updated', {
          success: false,
          message: 'Monitoring service not initialized',
          timestamp: new Date()
        });
      }
    } catch (error) {
      socket.emit('monitoring-config-updated', {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  // Reset monitoring statistics
  socket.on('reset-monitoring-stats', () => {
    try {
      if (agentActivityMonitoringService) {
        agentActivityMonitoringService.resetStats();
        socket.emit('monitoring-stats-reset', {
          success: true,
          message: 'Monitoring statistics reset successfully',
          timestamp: new Date()
        });
      } else {
        socket.emit('monitoring-stats-reset', {
          success: false,
          message: 'Monitoring service not initialized',
          timestamp: new Date()
        });
      }
    } catch (error) {
      socket.emit('monitoring-stats-reset', {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });
});

// 定期的にタスクキューをチェック（バックアップ処理・メモリリーク修正版）
let taskQueueProcessingInterval: NodeJS.Timeout | null = null;

const startTaskQueueProcessing = () => {
  taskQueueProcessingInterval = serverManager.setInterval(() => {
    processTaskQueue(
      taskQueue,
      checkUsageLimitResolution,
      assignTaskToPresident,
      handleTaskAssigned,
      handleUsageLimitResolved
    );
  }, 30000); // 30 秒ごと
  
  console.log('🔄 Started task queue processing (30s interval)');
};

const stopTaskQueueProcessing = () => {
  if (taskQueueProcessingInterval) {
    serverManager.clearInterval(taskQueueProcessingInterval);
    taskQueueProcessingInterval = null;
    console.log('⏹️  Stopped task queue processing');
  }
};

// タスクキュー処理を開始
startTaskQueueProcessing();

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

  try {
    // Stop all intervals and timeouts (メモリリーク防止)
    stopPeriodicRefresh();
    stopTaskCompletionMonitoring();
    stopTaskQueueProcessing();
    stopUsageLimitMonitoring();
    
    // ServerManager cleanup
    serverManager.cleanup();
    console.log('🧹 All timers cleaned up');

    // Stop real-time agent activity monitoring service
    if (agentActivityMonitoringService) {
      agentActivityMonitoringService.stop();
      console.log('🔍 Agent activity monitoring service stopped');
    }

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

// Usage Limit 監視タイマー
let usageLimitMonitorTimer: NodeJS.Timeout | null = null;

const startUsageLimitMonitoring = async () => {
  console.log('🔍 Starting usage limit monitoring...');
  
  const checkUsageLimitReset = async () => {
    try {
      const usageLimitState = await db.getUsageLimitState();
      
      if (usageLimitState && usageLimitState.isLimited && usageLimitState.nextRetryAt) {
        const now = new Date();
        const resetTime = new Date(usageLimitState.nextRetryAt);
        
        console.log(`⏰ Usage limit check: Current time: ${now.toISOString()}, Reset time: ${resetTime.toISOString()}`);
        console.log(`🕐 現在時刻 (JST): ${now.toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}, リセット時刻 (JST): ${resetTime.toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}`);
        
        if (now >= resetTime) {
          console.log('🎉 Usage limit has been automatically resolved!');
          
          // Usage limit 状態をクリア
          await db.clearUsageLimitState();
          
          // 全クライアントに通知
          io.emit('usage-limit-cleared', {
            message: 'Usage limit automatically resolved at scheduled time',
            timestamp: new Date()
          });
          
          // President に進捗確認メッセージを送信
          setTimeout(async () => {
            try {
              console.log('📤 Sending progress check message to president after automatic limit resolution');
              const { spawn } = require('child_process');
              const sendMessage = spawn('./agent-send.sh', ['president', 'プロジェクトの進捗を確認してください。'], {
                stdio: 'inherit',
                cwd: process.cwd()
              });
              
              sendMessage.on('close', (code) => {
                if (code === 0) {
                  console.log('✅ Progress check message sent to president successfully');
                } else {
                  console.error(`❌ Failed to send message to president, exit code: ${code}`);
                }
              });
            } catch (error) {
              console.error('❌ Error sending progress check message to president:', error);
            }
          }, 1000);
          
          // タスクキューを再処理
          setTimeout(() => {
            processTaskQueue(
              taskQueue,
              checkUsageLimitResolution,
              assignTaskToPresident,
              handleTaskAssigned,
              handleUsageLimitResolved
            );
          }, 2000);
        }
      }
    } catch (error) {
      console.error('❌ Error checking usage limit reset:', error);
    }
  };
  
  // 最初のチェックを実行
  await checkUsageLimitReset();
  
  // 1 分ごとにチェック（メモリリーク修正版）
  usageLimitMonitorTimer = serverManager.setInterval(checkUsageLimitReset, 60 * 1000);
};

const stopUsageLimitMonitoring = () => {
  if (usageLimitMonitorTimer) {
    serverManager.clearInterval(usageLimitMonitorTimer);
    usageLimitMonitorTimer = null;
    console.log('🛑 Usage limit monitoring stopped');
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

    // タスク完了 API（president 用）
    app.post('/api/complete-task', async (req, res) => {
      try {
        const { taskId } = req.body;
        
        if (!taskId) {
          return res.status(400).json({ error: 'taskId is required' });
        }
        
        const updatedTask = await db.updateTask(taskId, {
          status: 'completed'
        });
        
        if (updatedTask) {
          await refreshTaskCache();
          
          // エージェント状態の変更をブロードキャスト
          if (updatedTask.assignedTo) {
            broadcastAgentStatusUpdate(updatedTask.assignedTo, 'idle');
          }
          
          // 全クライアントにタスク完了を通知
          io.emit('task-completed', updatedTask);
          
          res.json({ success: true, task: updatedTask });
        } else {
          res.status(404).json({ error: 'Task not found' });
        }
      } catch (error) {
        console.error('Failed to complete task:', error);
        res.status(500).json({ error: 'Failed to complete task' });
      }
    });

    // Temporary API for updating task projectName
    app.patch('/api/tasks/:taskId/project-name', async (req, res) => {
      const { taskId } = req.params;
      const { projectName } = req.body;
      
      if (!projectName) {
        return res.status(400).json({ error: 'Project name is required' });
      }
      
      try {
        const updatedTask = await db.updateTask(taskId, { projectName });
        if (updatedTask) {
          await refreshTaskCache();
          res.json({ success: true, task: updatedTask });
        } else {
          res.status(404).json({ error: 'Task not found' });
        }
      } catch (error) {
        console.error('Error updating task project name:', error);
        res.status(500).json({ error: 'Failed to update task project name' });
      }
    });

    // Temporary API for updating task assignedTo
    app.patch('/api/tasks/:taskId/assigned-to', async (req, res) => {
      const { taskId } = req.params;
      const { assignedTo } = req.body;
      
      if (!assignedTo) {
        return res.status(400).json({ error: 'Assigned to is required' });
      }
      
      try {
        const updatedTask = await db.updateTask(taskId, { assignedTo });
        if (updatedTask) {
          await refreshTaskCache();
          res.json({ success: true, task: updatedTask });
        } else {
          res.status(404).json({ error: 'Task not found' });
        }
      } catch (error) {
        console.error('Error updating task assigned to:', error);
        res.status(500).json({ error: 'Failed to update task assigned to' });
      }
    });

    // Temporary API for updating task metadata (both projectName and assignedTo)
    app.patch('/api/tasks/:taskId/metadata', async (req, res) => {
      const { taskId } = req.params;
      const { projectName, assignedTo } = req.body;
      
      if (!projectName && !assignedTo) {
        return res.status(400).json({ error: 'At least one field (projectName or assignedTo) is required' });
      }
      
      try {
        const updateData: any = {};
        if (projectName) updateData.projectName = projectName;
        if (assignedTo) updateData.assignedTo = assignedTo;
        
        const updatedTask = await db.updateTask(taskId, updateData);
        if (updatedTask) {
          await refreshTaskCache();
          res.json({ success: true, task: updatedTask });
        } else {
          res.status(404).json({ error: 'Task not found' });
        }
      } catch (error) {
        console.error('Error updating task metadata:', error);
        res.status(500).json({ error: 'Failed to update task metadata' });
      }
    });

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
      
      // Usage Limit 監視タイマーを開始
      startUsageLimitMonitoring();
      
      // workspace 監視を開始
      startWorkspaceWatcher().catch(console.error);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// 起動
startServer();

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('🔧 SIGTERM received, starting graceful shutdown...');
  await serviceContainer.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔧 SIGINT received, starting graceful shutdown...');
  await serviceContainer.shutdown();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error);
  await serviceContainer.shutdown();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  await serviceContainer.shutdown();
  process.exit(1);
});
