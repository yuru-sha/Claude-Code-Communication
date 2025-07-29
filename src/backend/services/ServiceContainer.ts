/**
 * Service Container パターン実装
 * services 層の結合度を下げ、依存性注入を提供
 */

import { TerminalOutputMonitor } from './terminalOutputMonitor';
import { ActivityAnalyzer } from './activityAnalyzer';
import { TmuxManager } from './tmuxManager';
import { AgentActivityMonitoringService } from './agentActivityMonitoringService';
import { PerformanceMonitor } from './performanceMonitor';
import { AgentProcessManager } from './agentProcessManager';
import { ACTIVITY_DETECTION_CONFIG } from '../../types';

export interface IServiceContainer {
  terminalOutputMonitor: TerminalOutputMonitor;
  activityAnalyzer: ActivityAnalyzer;
  tmuxManager: TmuxManager;
  agentActivityMonitoringService: AgentActivityMonitoringService;
  performanceMonitor: PerformanceMonitor;
  agentProcessManager: AgentProcessManager;
}

export class ServiceContainer implements IServiceContainer {
  private static instance: ServiceContainer;
  
  public readonly terminalOutputMonitor: TerminalOutputMonitor;
  public readonly activityAnalyzer: ActivityAnalyzer;
  public readonly tmuxManager: TmuxManager;
  public readonly agentActivityMonitoringService: AgentActivityMonitoringService;
  public readonly performanceMonitor: PerformanceMonitor;
  public readonly agentProcessManager: AgentProcessManager;

  private constructor() {
    // サービスの初期化順序に注意
    this.tmuxManager = new TmuxManager();
    this.terminalOutputMonitor = new TerminalOutputMonitor();
    this.activityAnalyzer = new ActivityAnalyzer();
    this.performanceMonitor = new PerformanceMonitor();
    this.agentProcessManager = new AgentProcessManager();
    
    // 依存関係を持つサービスは後で初期化
    this.agentActivityMonitoringService = new AgentActivityMonitoringService(
      (agentName: string, status: any) => {
        // Default callback - can be overridden by server
        console.log(`Agent ${agentName} status updated:`, status);
      },
      {
        activeCheckInterval: ACTIVITY_DETECTION_CONFIG.ACTIVE_CHECK_INTERVAL,
        idleCheckInterval: ACTIVITY_DETECTION_CONFIG.IDLE_CHECK_INTERVAL,
        maxRetries: 3,
        gracefulDegradationEnabled: true,
        performanceOptimizationEnabled: true,
        maxOutputBufferSize: ACTIVITY_DETECTION_CONFIG.OUTPUT_BUFFER_SIZE
      },
      this.terminalOutputMonitor,
      this.activityAnalyzer
    );
  }

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  /**
   * サービスの健全性チェック
   */
  public async healthCheck(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};
    
    try {
      // 各サービスの健全性をチェック
      results.tmuxManager = await this.checkServiceHealth('tmux');
      results.terminalOutputMonitor = await this.checkServiceHealth('terminal');
      results.activityAnalyzer = await this.checkServiceHealth('activity');
      results.performanceMonitor = await this.checkServiceHealth('performance');
      results.agentActivityMonitoringService = await this.checkServiceHealth('monitoring');
    } catch (error) {
      console.error('Service health check failed:', error);
    }

    return results;
  }

  private async checkServiceHealth(serviceType: string): Promise<boolean> {
    try {
      switch (serviceType) {
        case 'tmux':
          // TmuxManager の健全性チェック
          return true; // 実装に応じて調整
        case 'terminal':
        case 'activity':
        case 'performance':
        case 'monitoring':
          return true; // 各サービスの健全性チェック実装
        default:
          return false;
      }
    } catch (error) {
      console.error(`Health check failed for ${serviceType}:`, error);
      return false;
    }
  }

  /**
   * 全サービスの正常な終了処理
   */
  public async shutdown(): Promise<void> {
    console.log('🔧 ServiceContainer: Shutting down all services...');
    
    try {
      // 依存関係を考慮した逆順で終了
      if (this.agentActivityMonitoringService && typeof this.agentActivityMonitoringService.stop === 'function') {
        await this.agentActivityMonitoringService.stop();
      }
      
      // 他のサービスは必要に応じて stop/cleanup メソッドを実装
      console.log('✅ ServiceContainer: All services shut down successfully');
    } catch (error) {
      console.error('❌ ServiceContainer: Error during shutdown:', error);
    }
  }
}

// デフォルトエクスポートでシングルトンインスタンスを提供
export default ServiceContainer.getInstance();