/**
 * Health Controller
 * 
 * Manages system health checks, monitoring, and auto-recovery
 */

import { promisify } from 'util';
import { exec } from 'child_process';
import serviceContainer from '../services/ServiceContainer';
import { serverManager } from '../utils/ServerManager';
import { ACTIVITY_DETECTION_CONFIG } from '../../types';

const execAsync = promisify(exec);

// Health check state
let currentCheckInterval: number = ACTIVITY_DETECTION_CONFIG.IDLE_CHECK_INTERVAL;
let healthCheckIntervalId: NodeJS.Timeout | null = null;
let isRecoveryInProgress = false;

// System health interface
export interface SystemHealth {
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

/**
 * Check tmux sessions status
 */
export const checkTmuxSessions = async (): Promise<{ president: boolean; multiagent: boolean }> => {
  try {
    const { stdout } = await execAsync('tmux list-sessions');
    const sessions = stdout.split('\n');
    
    const hasPresident = sessions.some(session => session.includes('president'));
    const hasMultiagent = sessions.some(session => session.includes('multiagent'));
    
    return { president: hasPresident, multiagent: hasMultiagent };
  } catch (error) {
    console.warn('⚠️ No tmux sessions found or tmux not available');
    return { president: false, multiagent: false };
  }
};

/**
 * Check Claude agents status
 */
export const checkClaudeAgents = async (): Promise<SystemHealth['claudeAgents']> => {
  try {
    // プロセス一覧を取得
    const { stdout } = await execAsync('ps aux | grep claude | grep -v grep');
    const processes = stdout.split('\n').filter(line => line.trim());
    
    // 各エージェントの状態をチェック
    const agentStatus = {
      president: processes.some(proc => proc.includes('claude') && proc.includes('president')),
      boss1: processes.some(proc => proc.includes('claude') && proc.includes('multiagent:0.0')),
      worker1: processes.some(proc => proc.includes('claude') && proc.includes('multiagent:0.1')),
      worker2: processes.some(proc => proc.includes('claude') && proc.includes('multiagent:0.2')),
      worker3: processes.some(proc => proc.includes('claude') && proc.includes('multiagent:0.3'))
    };
    
    return agentStatus;
  } catch (error) {
    console.warn('⚠️ Could not check Claude agent processes');
    return {
      president: false,
      boss1: false,
      worker1: false,
      worker2: false,
      worker3: false
    };
  }
};

/**
 * Perform comprehensive health check
 */
export const performHealthCheck = async (): Promise<SystemHealth> => {
  try {
    console.log('🔍 Performing system health check...');
    
    const [tmuxStatus, claudeStatus] = await Promise.all([
      checkTmuxSessions(),
      checkClaudeAgents()
    ]);
    
    // Calculate overall health
    const tmuxHealthy = tmuxStatus.president && tmuxStatus.multiagent;
    const claudeHealthy = Object.values(claudeStatus).some(Boolean); // At least one agent running
    
    let overallHealth: SystemHealth['overallHealth'];
    if (tmuxHealthy && claudeHealthy) {
      overallHealth = 'healthy';
    } else if (tmuxHealthy || claudeHealthy) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'critical';
    }
    
    const health: SystemHealth = {
      tmuxSessions: tmuxStatus,
      claudeAgents: claudeStatus,
      overallHealth,
      timestamp: new Date()
    };
    
    console.log(`📊 System health: ${overallHealth} (tmux: ${tmuxHealthy}, claude: ${claudeHealthy})`);
    return health;
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
    return {
      tmuxSessions: { president: false, multiagent: false },
      claudeAgents: { president: false, boss1: false, worker1: false, worker2: false, worker3: false },
      overallHealth: 'critical',
      timestamp: new Date()
    };
  }
};

/**
 * Auto-recovery system
 */
export const performAutoRecovery = async (): Promise<boolean> => {
  if (isRecoveryInProgress) {
    console.log('⚠️ Auto recovery already in progress, skipping');
    return false;
  }
  
  isRecoveryInProgress = true;
  console.log('🚑 Starting auto recovery process...');
  
  try {
    const tmuxManager = serviceContainer.tmuxManager;
    
    // Step 1: Start tmux sessions if needed
    const tmuxStatus = await checkTmuxSessions();
    if (!tmuxStatus.president || !tmuxStatus.multiagent) {
      console.log('🔧 Creating missing tmux sessions...');
      await tmuxManager.createMissingSessions();
    }
    
    // Step 2: Start Claude agents if needed
    const claudeStatus = await checkClaudeAgents();
    const inactiveAgents = Object.entries(claudeStatus)
      .filter(([_, isActive]) => !isActive)
      .map(([agent, _]) => agent);
    
    if (inactiveAgents.length > 0) {
      console.log(`🤖 Restarting inactive agents: ${inactiveAgents.join(', ')}`);
      await tmuxManager.startAllClaudeAgents();
      
      // Wait for agents to start
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Step 3: Verify recovery
    const finalHealth = await performHealthCheck();
    const recoverySuccessful = finalHealth.overallHealth !== 'critical';
    
    if (recoverySuccessful) {
      console.log('✅ Auto recovery completed successfully');
    } else {
      console.log('❌ Auto recovery partially failed, manual intervention may be required');
    }
    
    return recoverySuccessful;
    
  } catch (error) {
    console.error('❌ Error during auto recovery:', error);
    return false;
  } finally {
    isRecoveryInProgress = false;
  }
};

/**
 * Update check interval based on agent activity
 */
export const updateCheckInterval = (hasActiveAgents: boolean): void => {
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

/**
 * Start health check interval
 */
export const startHealthCheckInterval = (): void => {
  if (healthCheckIntervalId) {
    serverManager.clearInterval(healthCheckIntervalId);
  }
  
  healthCheckIntervalId = serverManager.setInterval(async () => {
    const health = await performHealthCheck();

    // Auto recovery trigger (conservative approach)
    if (health.overallHealth === 'critical') {
      const activeAgents = Object.values(health.claudeAgents).filter(Boolean).length;
      
      // Only trigger recovery if no agents are running
      if (activeAgents === 0) {
        console.log('🚨 Critical system state detected, triggering auto recovery...');
        await performAutoRecovery();
      }
    }
    
    // Update check interval based on current activity
    const hasActiveAgents = Object.values(health.claudeAgents).some(Boolean);
    updateCheckInterval(hasActiveAgents);
    
  }, currentCheckInterval);
  
  console.log(`🔄 Health check interval started (${currentCheckInterval}ms)`);
};

/**
 * Stop health check interval
 */
export const stopHealthCheckInterval = (): void => {
  if (healthCheckIntervalId) {
    serverManager.clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
    console.log('⏹️ Health check interval stopped');
  }
};

/**
 * Initialize health monitoring
 */
export const initializeHealthMonitoring = (): void => {
  console.log('🏥 Initializing health monitoring...');
  startHealthCheckInterval();
  
  // Perform initial health check
  performHealthCheck().then(health => {
    console.log(`🏥 Initial system health: ${health.overallHealth}`);
  });
};

export default {
  performHealthCheck,
  performAutoRecovery,
  initializeHealthMonitoring,
  startHealthCheckInterval,
  stopHealthCheckInterval,
  updateCheckInterval
};