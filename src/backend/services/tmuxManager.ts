import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface AgentMapping {
  president: string;
  boss1: string;
  worker1: string;
  worker2: string;
  worker3: string;
}

export class TmuxManager {
  private agentTargets: AgentMapping = {
    president: 'president',
    boss1: 'multiagent:0.0',
    worker1: 'multiagent:0.1',
    worker2: 'multiagent:0.2',
    worker3: 'multiagent:0.3'
  };

  /**
   * 既存の tmux セッションをクリーンアップ
   */
  async cleanupExistingSessions(): Promise<void> {
    console.log('🧹 既存セッションクリーンアップ開始...');

    try {
      // multiagent セッション削除
      try {
        await execAsync('tmux kill-session -t multiagent 2>/dev/null');
        console.log('multiagent セッション削除完了');
      } catch {
        console.log('multiagent セッションは存在しませんでした');
      }

      // president セッション削除
      try {
        await execAsync('tmux kill-session -t president 2>/dev/null');
        console.log('president セッション削除完了');
      } catch {
        console.log('president セッションは存在しませんでした');
      }

      // tmp ディレクトリクリアと再作成
      try {
        await execAsync('rm -rf ./tmp/*');
        console.log('tmp ディレクトリをクリア');
      } catch {
        console.log('tmp ディレクトリは空でした');
      }
      await execAsync('mkdir -p ./tmp');

      // workspace ディレクトリ作成（既存プロジェクトは保持）
      await execAsync('mkdir -p ./workspace');
      console.log('workspace ディレクトリを準備（既存プロジェクトは保持）');

      console.log('✅ クリーンアップ完了');
    } catch (error) {
      console.error('❌ クリーンアップ中にエラー:', error);
      throw error;
    }
  }

  /**
   * multiagent セッション作成（4 ペイン：boss1 + worker1,2,3）
   */
  async createMultiagentSession(): Promise<void> {
    console.log('📺 multiagent セッション作成開始 (4 ペイン)...');

    try {
      // 最初のペイン作成
      await execAsync('tmux new-session -d -s multiagent -n "agents"');

      // 2x2 グリッド作成（合計 4 ペイン）
      await execAsync('tmux split-window -h -t "multiagent:0"'); // 水平分割（左右）
      await execAsync('tmux select-pane -t "multiagent:0.0"');
      await execAsync('tmux split-window -v'); // 左側を垂直分割
      await execAsync('tmux select-pane -t "multiagent:0.2"');
      await execAsync('tmux split-window -v'); // 右側を垂直分割

      // ペインタイトル設定
      console.log('ペインタイトル設定中...');
      const paneConfig = [
        { index: 0, title: 'boss1', color: '1;31' },    // 赤色
        { index: 1, title: 'worker1', color: '1;34' },  // 青色
        { index: 2, title: 'worker2', color: '1;34' },  // 青色
        { index: 3, title: 'worker3', color: '1;34' }   // 青色
      ];

      const currentDir = process.cwd();

      for (const pane of paneConfig) {
        // ペインタイトル設定
        await execAsync(`tmux select-pane -t "multiagent:0.${pane.index}" -T "${pane.title}"`);
        
        // 作業ディレクトリ設定
        await execAsync(`tmux send-keys -t "multiagent:0.${pane.index}" "cd ${currentDir}" C-m`);
        
        // カラープロンプト設定
        const promptCommand = `export PS1='(\\[\\033[${pane.color}m\\]${pane.title}\\[\\033[0m\\]) \\[\\033[1;32m\\]\\w\\[\\033[0m\\]\\$ '`;
        await execAsync(`tmux send-keys -t "multiagent:0.${pane.index}" "${promptCommand}" C-m`);
        
        // ウェルカムメッセージ
        await execAsync(`tmux send-keys -t "multiagent:0.${pane.index}" "echo '=== ${pane.title} エージェント ==='" C-m`);
        
        // 少し待機
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.log('✅ multiagent セッション作成完了');
    } catch (error) {
      console.error('❌ multiagent セッション作成中にエラー:', error);
      throw error;
    }
  }

  /**
   * president セッション作成（1 ペイン）
   */
  async createPresidentSession(): Promise<void> {
    console.log('👑 president セッション作成開始...');

    try {
      const currentDir = process.cwd();

      await execAsync('tmux new-session -d -s president');
      await execAsync(`tmux send-keys -t president "cd ${currentDir}" C-m`);
      
      // カラープロンプト設定（紫色）
      const promptCommand = `export PS1='(\\[\\033[1;35m\\]PRESIDENT\\[\\033[0m\\]) \\[\\033[1;32m\\]\\w\\[\\033[0m\\]\\$ '`;
      await execAsync(`tmux send-keys -t president "${promptCommand}" C-m`);
      
      // ウェルカムメッセージ
      await execAsync(`tmux send-keys -t president "echo '=== PRESIDENT セッション ==='" C-m`);
      await execAsync(`tmux send-keys -t president "echo 'プロジェクト統括責任者'" C-m`);
      await execAsync(`tmux send-keys -t president "echo '========================'" C-m`);

      console.log('✅ president セッション作成完了');
    } catch (error) {
      console.error('❌ president セッション作成中にエラー:', error);
      throw error;
    }
  }

  /**
   * 完全なセットアップ実行
   */
  async setupEnvironment(): Promise<void> {
    console.log('🤖 Multi-Agent Communication Demo 環境構築');
    console.log('===========================================');

    try {
      // ステップ 1: クリーンアップ
      await this.cleanupExistingSessions();

      // ステップ 2: multiagent セッション作成
      await this.createMultiagentSession();

      // ステップ 3: president セッション作成
      await this.createPresidentSession();

      // ステップ 4: 環境確認
      await this.displayEnvironmentStatus();

      // ステップ 5: 全エージェントの Claude Code 起動
      await this.startAllClaudeAgents();

      console.log('🎉 Demo 環境セットアップ完了！');
    } catch (error) {
      console.error('❌ セットアップ中にエラー:', error);
      throw error;
    }
  }

  /**
   * 環境確認・表示
   */
  async displayEnvironmentStatus(): Promise<void> {
    console.log('🔍 環境確認中...');

    try {
      // tmux セッション確認
      const { stdout: sessions } = await execAsync('tmux list-sessions');
      console.log('📺 Tmux Sessions:');
      console.log(sessions);

      // ペイン構成表示
      console.log('📋 ペイン構成:');
      console.log('  multiagent セッション（4 ペイン）:');
      console.log('    Pane 0: boss1     (チームリーダー)');
      console.log('    Pane 1: worker1   (実行担当者 A)');
      console.log('    Pane 2: worker2   (実行担当者 B)');
      console.log('    Pane 3: worker3   (実行担当者 C)');
      console.log('');
      console.log('  president セッション（1 ペイン）:');
      console.log('    Pane 0: PRESIDENT (プロジェクト統括)');
    } catch (error) {
      console.warn('⚠️ 環境確認中にエラー:', error);
    }
  }

  /**
   * エージェント名から tmux ターゲットを取得
   */
  getAgentTarget(agentName: string): string | null {
    return this.agentTargets[agentName as keyof AgentMapping] || null;
  }

  /**
   * ターゲット存在確認
   */
  async checkTarget(target: string): Promise<boolean> {
    try {
      const sessionName = target.split(':')[0];
      await execAsync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * メッセージ送信
   */
  async sendMessage(agentName: string, message: string): Promise<boolean> {
    const target = this.getAgentTarget(agentName);
    
    if (!target) {
      console.error(`❌ エラー: 不明なエージェント '${agentName}'`);
      return false;
    }

    // ターゲット確認
    if (!(await this.checkTarget(target))) {
      console.error(`❌ セッション '${target.split(':')[0]}' が見つかりません`);
      return false;
    }

    try {
      console.log(`📤 送信中: ${target} ← '${message}'`);
      
      // Claude Code のプロンプトを一度クリア
      await execAsync(`tmux send-keys -t "${target}" C-c`);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // メッセージ送信
      await execAsync(`tmux send-keys -t "${target}" "${message}"`);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // エンター押下
      await execAsync(`tmux send-keys -t "${target}" C-m`);
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log(`✅ 送信完了: ${agentName} に '${message}'`);
      return true;
    } catch (error) {
      console.error(`❌ メッセージ送信エラー (${agentName}):`, error);
      return false;
    }
  }

  /**
   * Claude Code エージェントを起動
   */
  async startClaudeAgent(agentName: string): Promise<boolean> {
    const target = this.getAgentTarget(agentName);
    
    if (!target) {
      console.error(`❌ エラー: 不明なエージェント '${agentName}'`);
      return false;
    }

    // ターゲット確認
    if (!(await this.checkTarget(target))) {
      console.error(`❌ セッション '${target.split(':')[0]}' が見つかりません`);
      return false;
    }

    try {
      console.log(`🚀 Claude Code 起動中: ${agentName} (${target})`);
      
      await execAsync(`tmux send-keys -t "${target}" 'ENABLE_BACKGROUND_TASKS=1 claude --dangerously-skip-permissions' C-m`);
      
      console.log(`✅ Claude Code 起動完了: ${agentName}`);
      return true;
    } catch (error) {
      console.error(`❌ Claude Code 起動エラー (${agentName}):`, error);
      return false;
    }
  }

  /**
   * 全エージェントの Claude Code を起動
   */
  async startAllClaudeAgents(): Promise<void> {
    console.log('🤖 全エージェントの Claude Code 起動開始...');

    const agents = ['president', 'boss1', 'worker1', 'worker2', 'worker3'];
    
    for (const agent of agents) {
      try {
        await this.startClaudeAgent(agent);
        // エージェント間で少し間隔を空ける
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to start Claude Code for ${agent}:`, error);
      }
    }

    console.log('🎉 全エージェントの Claude Code 起動完了');
  }

  /**
   * 利用可能なエージェント一覧を取得
   */
  getAvailableAgents(): Array<{name: string, target: string, description: string}> {
    return [
      { name: 'president', target: this.agentTargets.president, description: 'プロジェクト統括責任者' },
      { name: 'boss1', target: this.agentTargets.boss1, description: 'チームリーダー' },
      { name: 'worker1', target: this.agentTargets.worker1, description: '実行担当者 A' },
      { name: 'worker2', target: this.agentTargets.worker2, description: '実行担当者 B' },
      { name: 'worker3', target: this.agentTargets.worker3, description: '実行担当者 C' }
    ];
  }
}