import { exec } from 'child_process';
import { promisify } from 'util';
import { SystemHealth } from '@claude-communication/types';

const execAsync = promisify(exec);

// tmux セッションの状態をチェック
export const checkTmuxSessions = async (): Promise<{ president: boolean; multiagent: boolean }> => {
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

// Enhanced Claude Code agent status check with activity monitoring integration
export const checkClaudeAgents = async (): Promise<SystemHealth['claudeAgents']> => {
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
      
      // より包括的なパターンマッチング（活動監視と統合）
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
      
      // Log only significant status changes to reduce noise
      
    } catch (error) {
      console.warn(`Failed to check ${agent.name}:`, error);
    }
  }

  return agents;
};

// Enhanced system health check with activity monitoring support
export const performHealthCheck = async (
  previousState: SystemHealth | null,
  onAgentStatusChange: (agentName: string, newStatus: 'idle' | 'working' | 'offline') => void
): Promise<SystemHealth> => {
  const tmuxSessions = await checkTmuxSessions();
  const claudeAgents = await checkClaudeAgents();
  
  // 前回の状態と比較してエージェント状態の変更を検知
  const previousClaudeAgents = previousState?.claudeAgents || {};
  
  // 各エージェントの状態変更を個別に通知（基本的なオンライン/オフライン状態）
  Object.keys(claudeAgents).forEach(agentName => {
    const currentStatus = claudeAgents[agentName as keyof typeof claudeAgents];
    const previousStatus = previousClaudeAgents[agentName as keyof typeof previousClaudeAgents];
    
    if (currentStatus !== previousStatus) {
      const status = currentStatus ? 'idle' : 'offline';
      onAgentStatusChange(agentName, status);
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

  // 健全性に問題があればログ出力
  if (overallHealth !== 'healthy') {
    console.warn(`⚠️ System health: ${overallHealth}`);
    console.warn('tmux sessions:', tmuxSessions);
    console.warn('Claude agents:', claudeAgents);
  }

  return health;
};