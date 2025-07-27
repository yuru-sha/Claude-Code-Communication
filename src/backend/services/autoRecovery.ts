import { exec } from 'child_process';
import { promisify } from 'util';
import { SystemHealth } from './healthCheck';

const execAsync = promisify(exec);

// 復旧処理の実行状態
let isRecoveryInProgress = false;
let lastRecoveryAttempt = 0;

// 自動復旧関数
export const performAutoRecovery = async (
  health: SystemHealth, 
  isManual: boolean = false,
  onRecoveryEvent: (event: string, data: any) => void
): Promise<boolean> => {
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
      onRecoveryEvent('auto-recovery-performed', {
        message: 'System auto-recovery performed. Services are starting up.',
        recoveredServices: {
          tmuxSessions: !health.tmuxSessions.president || !health.tmuxSessions.multiagent,
          claudeAgents: Object.values(health.claudeAgents).some(active => !active)
        },
        timestamp: new Date()
      });
      
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Error during auto recovery:', error);
    
    onRecoveryEvent('auto-recovery-failed', {
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

// タスク完了時の軽量クリーンアップ（tmux-continuum 対応）
export const performTaskCompletionCleanup = async (
  onSystemEvent: (event: string, data: any) => void
): Promise<void> => {
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
    onSystemEvent('system-reset', {
      message: 'Claude Code processes stopped. tmux sessions preserved. Ready for next task.',
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Error during task completion cleanup:', error);
    
    // エラーをクライアントに通知
    onSystemEvent('system-error', {
      message: 'Failed to reset environment',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
    });
  }
};