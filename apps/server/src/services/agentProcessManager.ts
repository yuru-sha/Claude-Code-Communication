/**
 * エージェントプロセス管理サービス
 * 各エージェントのプロセス ID を追跡し、SIGINT 送信機能を提供
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AgentProcessInfo {
  agentId: string;
  tmuxSession: string;
  tmuxPane?: number;
  processId?: number;
  status: 'running' | 'idle' | 'stopped' | 'error';
  lastActivity?: Date;
}

export class AgentProcessManager {
  private agentProcesses: Map<string, AgentProcessInfo> = new Map();
  private readonly TMUX_SESSIONS = {
    president: 'president',
    multiagent: 'multiagent'
  };

  constructor() {
    this.initializeAgentInfo();
  }

  /**
   * エージェント情報を初期化
   */
  private initializeAgentInfo(): void {
    // President (別セッション)
    this.agentProcesses.set('president', {
      agentId: 'president',
      tmuxSession: this.TMUX_SESSIONS.president,
      status: 'idle'
    });

    // Boss1, Worker1-3 (multiagent セッション)
    const multiAgentIds = ['boss1', 'worker1', 'worker2', 'worker3'];
    multiAgentIds.forEach((agentId, index) => {
      this.agentProcesses.set(agentId, {
        agentId,
        tmuxSession: this.TMUX_SESSIONS.multiagent,
        tmuxPane: index, // pane 0-3
        status: 'idle'
      });
    });
  }

  /**
   * 指定されたエージェントのプロセス情報を取得
   */
  public getAgentProcess(agentId: string): AgentProcessInfo | undefined {
    return this.agentProcesses.get(agentId);
  }

  /**
   * 全エージェントのプロセス情報を取得
   */
  public getAllAgentProcesses(): AgentProcessInfo[] {
    return Array.from(this.agentProcesses.values());
  }

  /**
   * tmux セッション内のプロセス ID を取得
   */
  public async getProcessId(agentId: string): Promise<number | null> {
    const agentInfo = this.agentProcesses.get(agentId);
    if (!agentInfo) {
      console.error(`Agent ${agentId} not found`);
      return null;
    }

    try {
      let command: string;
      
      if (agentInfo.tmuxSession === 'president') {
        // President セッションの場合
        command = `tmux list-panes -t ${agentInfo.tmuxSession} -F '#{pane_pid}'`;
      } else {
        // multiagent セッションの場合、特定の pane の PID を取得
        command = `tmux display-message -t ${agentInfo.tmuxSession}:0.${agentInfo.tmuxPane} -p '#{pane_pid}'`;
      }

      const { stdout } = await execAsync(command);
      const pid = parseInt(stdout.trim());
      
      if (isNaN(pid)) {
        console.error(`Invalid PID for agent ${agentId}: ${stdout}`);
        return null;
      }

      // プロセス情報を更新
      agentInfo.processId = pid;
      agentInfo.lastActivity = new Date();
      
      return pid;
    } catch (error) {
      console.error(`Failed to get PID for agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * 指定されたエージェントに SIGINT を送信
   */
  public async sendSIGINT(agentId: string): Promise<boolean> {
    const agentInfo = this.agentProcesses.get(agentId);
    if (!agentInfo) {
      console.error(`Agent ${agentId} not found`);
      return false;
    }

    try {
      // 最新のプロセス ID を取得
      const pid = await this.getProcessId(agentId);
      if (!pid) {
        console.error(`Cannot get PID for agent ${agentId}`);
        return false;
      }

      // tmux 内のプロセスに SIGINT を送信
      const command = `tmux send-keys -t ${agentInfo.tmuxSession}${agentInfo.tmuxPane !== undefined ? `:0.${agentInfo.tmuxPane}` : ''} C-c`;
      
      await execAsync(command);
      
      console.log(`✅ Sent SIGINT to agent ${agentId} (PID: ${pid})`);
      
      // ステータスを更新
      agentInfo.status = 'stopped';
      agentInfo.lastActivity = new Date();
      
      return true;
    } catch (error) {
      console.error(`Failed to send SIGINT to agent ${agentId}:`, error);
      agentInfo.status = 'error';
      return false;
    }
  }

  /**
   * 全エージェントに SIGINT を送信
   */
  public async sendSIGINTToAll(): Promise<{ success: string[]; failed: string[] }> {
    const results = { success: [] as string[], failed: [] as string[] };
    
    const agentIds = Array.from(this.agentProcesses.keys());
    
    // 並列で SIGINT を送信
    await Promise.all(
      agentIds.map(async (agentId) => {
        const success = await this.sendSIGINT(agentId);
        if (success) {
          results.success.push(agentId);
        } else {
          results.failed.push(agentId);
        }
      })
    );

    console.log(`🚨 Emergency stop results: ${results.success.length} stopped, ${results.failed.length} failed`);
    
    return results;
  }

  /**
   * エージェントのステータスを更新
   */
  public updateAgentStatus(agentId: string, status: AgentProcessInfo['status']): void {
    const agentInfo = this.agentProcesses.get(agentId);
    if (agentInfo) {
      agentInfo.status = status;
      agentInfo.lastActivity = new Date();
    }
  }

  /**
   * tmux セッションが存在するか確認
   */
  public async checkTmuxSessions(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};
    
    try {
      for (const [sessionName, tmuxSession] of Object.entries(this.TMUX_SESSIONS)) {
        try {
          await execAsync(`tmux has-session -t ${tmuxSession}`);
          results[sessionName] = true;
        } catch {
          results[sessionName] = false;
        }
      }
    } catch (error) {
      console.error('Failed to check tmux sessions:', error);
    }
    
    return results;
  }

  /**
   * エージェントプロセスの健全性をチェック
   */
  public async healthCheck(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};
    
    for (const [agentId, agentInfo] of this.agentProcesses.entries()) {
      try {
        const pid = await this.getProcessId(agentId);
        results[agentId] = pid !== null && agentInfo.status !== 'error';
      } catch {
        results[agentId] = false;
      }
    }
    
    return results;
  }

  /**
   * 指定されたエージェントを再起動
   */
  public async restartAgent(agentId: string): Promise<boolean> {
    const agentInfo = this.agentProcesses.get(agentId);
    if (!agentInfo) {
      console.error(`Agent ${agentId} not found`);
      return false;
    }

    try {
      // まず SIGINT で停止
      await this.sendSIGINT(agentId);
      
      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Claude コマンドで再起動
      let command: string;
      if (agentInfo.tmuxSession === 'president') {
        command = `tmux send-keys -t ${agentInfo.tmuxSession} 'claude' Enter`;
      } else {
        command = `tmux send-keys -t ${agentInfo.tmuxSession}:0.${agentInfo.tmuxPane} 'claude' Enter`;
      }
      
      await execAsync(command);
      
      agentInfo.status = 'running';
      agentInfo.lastActivity = new Date();
      
      console.log(`✅ Restarted agent ${agentId}`);
      return true;
    } catch (error) {
      console.error(`Failed to restart agent ${agentId}:`, error);
      agentInfo.status = 'error';
      return false;
    }
  }
}