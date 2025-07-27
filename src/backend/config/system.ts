// システム設定
export const SYSTEM_CONFIG = {
  // ヘルスチェック設定
  healthCheck: {
    interval: 15000, // 15秒
    tmuxTimeout: 3000, // 3秒
    agentCheckTimeout: 5000, // 5秒
  },
  
  // タスク完了監視設定
  taskCompletion: {
    interval: 45000, // 45秒
    minTaskDuration: 2 * 60 * 1000, // 2分
    terminalHistoryLines: 100,
    checkTimeout: 5000, // 5秒
  },
  
  // ターミナル出力取得設定
  terminal: {
    fetchInterval: 8000, // 8秒
    fetchTimeout: 8000, // 8秒
    historyLines: 50,
  },
  
  // 自動復旧設定
  autoRecovery: {
    minInterval: 5 * 60 * 1000, // 5分
    maxRetries: 3,
    criticalAgentThreshold: 1, // 1個以下で復旧トリガー
  },
  
  // エージェント設定
  agents: [
    { name: 'president', target: 'president', role: 'manager' },
    { name: 'boss1', target: 'multiagent:0.0', role: 'team_lead' },
    { name: 'worker1', target: 'multiagent:0.1', role: 'developer' },
    { name: 'worker2', target: 'multiagent:0.2', role: 'developer' },
    { name: 'worker3', target: 'multiagent:0.3', role: 'developer' },
  ],
  
  // Claude Code検知パターン
  claudePatterns: [
    /Human:/,
    /Assistant:/,
    /claude.*code/i,
    /\? for shortcuts/,
    /Bypassing Permissions/,
    /tokens.*remaining/i,
    /esc to interrupt/,
    /Continue:/,
    /Provide/
  ],
} as const;

// 環境変数からの設定オーバーライド
export const getConfig = () => {
  return {
    ...SYSTEM_CONFIG,
    healthCheck: {
      ...SYSTEM_CONFIG.healthCheck,
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '15000'),
    },
    taskCompletion: {
      ...SYSTEM_CONFIG.taskCompletion,
      interval: parseInt(process.env.TASK_COMPLETION_INTERVAL || '45000'),
      minTaskDuration: parseInt(process.env.MIN_TASK_DURATION || '120000'),
    },
    terminal: {
      ...SYSTEM_CONFIG.terminal,
      fetchInterval: parseInt(process.env.TERMINAL_FETCH_INTERVAL || '8000'),
    },
  };
};