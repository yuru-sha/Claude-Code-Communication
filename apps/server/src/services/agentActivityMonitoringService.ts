import { AgentStatus, ACTIVITY_DETECTION_CONFIG } from '@claude-communication/types';
import { TerminalOutputMonitor, TerminalMonitorResult } from './terminalOutputMonitor';
import { ActivityAnalyzer } from './activityAnalyzer';
import { SystemError, TmuxError, logError, withErrorHandling, withRetry } from '../utils/errorHandler';
import { agentStatusLogger } from './agentStatusLogger';

/**
 * Configuration for the monitoring service
 */
export interface MonitoringServiceConfig {
  activeCheckInterval: number;
  idleCheckInterval: number;
  maxRetries: number;
  gracefulDegradationEnabled: boolean;
  performanceOptimizationEnabled: boolean;
  maxOutputBufferSize: number;
}

/**
 * Monitoring service statistics
 */
export interface MonitoringStats {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  averageCheckDuration: number;
  activeAgents: number;
  lastCheckTimestamp: Date;
  uptime: number;
  errorStates: number;
  recoveredErrors: number;
  terminalAccessFailures: number;
  fallbackActivations: number;
}

/**
 * Agent monitoring state
 */
interface AgentMonitoringState {
  lastCheckTime: Date;
  consecutiveFailures: number;
  isActive: boolean;
  checkInterval: number;
  lastKnownStatus: AgentStatus | null;
  errorState: {
    hasError: boolean;
    errorMessage?: string;
    errorTimestamp?: Date;
    recoveryAttempts: number;
  };
  fallbackMode: boolean;
  lastSuccessfulCheck?: Date;
}

/**
 * Real-time Agent Activity Monitoring Service
 * Implements requirements 1.1, 5.1, 5.2 for continuous monitoring with error handling and performance optimization
 */
export class AgentActivityMonitoringService {
  private terminalMonitor: TerminalOutputMonitor;
  private activityAnalyzer: ActivityAnalyzer;
  private config: MonitoringServiceConfig;
  private isRunning: boolean = false;
  private monitoringIntervalId: NodeJS.Timeout | null = null;
  private agentStates: Map<string, AgentMonitoringState> = new Map();
  private stats: MonitoringStats;
  private startTime: Date;
  private onStatusUpdate: (agentName: string, status: AgentStatus) => void;
  private checkDurations: number[] = [];

  constructor(
    onStatusUpdate: (agentName: string, status: AgentStatus) => void,
    config?: Partial<MonitoringServiceConfig>,
    terminalMonitor?: TerminalOutputMonitor,
    activityAnalyzer?: ActivityAnalyzer
  ) {
    this.terminalMonitor = terminalMonitor || new TerminalOutputMonitor();
    this.activityAnalyzer = activityAnalyzer || new ActivityAnalyzer();
    this.onStatusUpdate = onStatusUpdate;
    this.startTime = new Date();
    
    // Default configuration with performance optimizations
    this.config = {
      activeCheckInterval: config?.activeCheckInterval || ACTIVITY_DETECTION_CONFIG.ACTIVE_CHECK_INTERVAL,
      idleCheckInterval: config?.idleCheckInterval || ACTIVITY_DETECTION_CONFIG.IDLE_CHECK_INTERVAL,
      maxRetries: config?.maxRetries || 3,
      gracefulDegradationEnabled: config?.gracefulDegradationEnabled ?? true,
      performanceOptimizationEnabled: config?.performanceOptimizationEnabled ?? true,
      maxOutputBufferSize: config?.maxOutputBufferSize || ACTIVITY_DETECTION_CONFIG.OUTPUT_BUFFER_SIZE,
      ...config
    };

    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageCheckDuration: 0,
      activeAgents: 0,
      lastCheckTimestamp: new Date(),
      uptime: 0,
      errorStates: 0,
      recoveredErrors: 0,
      terminalAccessFailures: 0,
      fallbackActivations: 0
    };

    agentStatusLogger.info('AgentActivityMonitoringService', 'Service initialized', this.config);
  }

  /**
   * Start the continuous monitoring loop
   * Requirement 1.1: Implement continuous monitoring loop with configurable intervals
   */
  public start(): void {
    if (this.isRunning) {
      console.warn('⚠️ Monitoring service is already running');
      return;
    }

    this.isRunning = true;
    this.startTime = new Date();
    agentStatusLogger.info('AgentActivityMonitoringService', 'Starting real-time monitoring service');

    // Start the main monitoring loop
    this.scheduleNextCheck();
  }

  /**
   * Stop the monitoring service
   */
  public stop(): void {
    if (!this.isRunning) {
      console.warn('⚠️ Monitoring service is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.monitoringIntervalId) {
      clearTimeout(this.monitoringIntervalId);
      this.monitoringIntervalId = null;
    }

    agentStatusLogger.info('AgentActivityMonitoringService', 'Monitoring service stopped');
  }

  /**
   * Schedule the next monitoring check with adaptive intervals
   */
  private scheduleNextCheck(): void {
    if (!this.isRunning) return;

    // Determine check interval based on current agent activity
    const interval = this.determineCheckInterval();
    
    this.monitoringIntervalId = setTimeout(async () => {
      await this.performMonitoringCheck();
      this.scheduleNextCheck();
    }, interval);
  }

  /**
   * Determine the appropriate check interval based on agent activity
   * Requirement 5.3: Implement adaptive check intervals based on agent activity
   */
  private determineCheckInterval(): number {
    const activeAgentCount = Array.from(this.agentStates.values())
      .filter(state => state.isActive).length;

    // Use shorter intervals when agents are active
    if (activeAgentCount > 0) {
      return this.config.activeCheckInterval;
    } else {
      return this.config.idleCheckInterval;
    }
  }

  /**
   * Perform a single monitoring check for all agents
   * Requirement: Add error handling for terminal access failures
   */
  private async performMonitoringCheck(): Promise<void> {
    const checkStartTime = Date.now();
    this.stats.totalChecks++;
    this.stats.lastCheckTimestamp = new Date();

    try {
      console.log(`🔍 [${new Date().toISOString()}] Starting monitoring check #${this.stats.totalChecks}`);
      
      // Monitor all agents with comprehensive error handling
      const monitoringResults = await this.monitorAllAgentsWithErrorHandling();
      
      // Process results and update agent states
      await this.processMonitoringResults(monitoringResults);
      
      this.stats.successfulChecks++;
      
      // Update performance metrics
      const checkDuration = Date.now() - checkStartTime;
      this.updatePerformanceMetrics(checkDuration);
      
      console.log(`✅ [${new Date().toISOString()}] Monitoring check completed in ${checkDuration}ms`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(error instanceof Error ? error : new Error(errorMessage), 'AgentActivityMonitoringService.performMonitoringCheck');
      
      this.stats.failedChecks++;
      
      // Implement graceful degradation
      if (this.config.gracefulDegradationEnabled) {
        console.warn(`⚠️ [${new Date().toISOString()}] Implementing graceful degradation due to monitoring failure`);
        await this.handleMonitoringFailure(error);
      } else {
        console.error(`❌ [${new Date().toISOString()}] Monitoring check failed without graceful degradation`);
      }
    }

    // Update uptime
    this.stats.uptime = Date.now() - this.startTime.getTime();
  }

  /**
   * Monitor all agents with comprehensive error handling
   * Requirement: Add error handling for terminal access failures
   */
  private async monitorAllAgentsWithErrorHandling(): Promise<TerminalMonitorResult[]> {
    const monitoringWithRetry = withRetry(
      async () => await this.terminalMonitor.monitorAllAgents(),
      this.config.maxRetries,
      1000
    );

    try {
      console.log(`🔍 [${new Date().toISOString()}] Attempting to monitor all agents`);
      
      // Attempt to monitor all agents with retry logic
      const monitoringResults = await monitoringWithRetry();
      
      // Validate results
      if (!Array.isArray(monitoringResults)) {
        throw new SystemError('Invalid monitoring results: expected array', 'INVALID_RESULTS');
      }
      
      const results: TerminalMonitorResult[] = [];
      
      for (const result of monitoringResults) {
        try {
          const agentState = this.getOrCreateAgentState(result.agentName);
          
          // Reset failure count and error state on successful monitoring
          if (agentState.consecutiveFailures > 0) {
            console.log(`✅ [${new Date().toISOString()}] Agent ${result.agentName} recovered from ${agentState.consecutiveFailures} failures`);
            this.stats.recoveredErrors++;
          }
          
          agentState.consecutiveFailures = 0;
          agentState.lastCheckTime = new Date();
          agentState.lastSuccessfulCheck = new Date();
          agentState.fallbackMode = false;
          
          // Clear error state if it was previously set
          if (agentState.errorState.hasError) {
            agentState.errorState = {
              hasError: false,
              recoveryAttempts: agentState.errorState.recoveryAttempts + 1
            };
          }
          
          results.push(result);
          
        } catch (agentError) {
          logError(agentError instanceof Error ? agentError : new Error(String(agentError)), 
                  `AgentActivityMonitoringService.monitorAllAgentsWithErrorHandling.${result.agentName}`);
          
          // Create error result for this agent
          results.push({
            agentName: result.agentName,
            hasNewActivity: false,
            isIdle: true,
            lastOutput: '',
            timestamp: new Date()
          });
        }
      }
      
      console.log(`✅ [${new Date().toISOString()}] Successfully monitored ${results.length} agents`);
      return results;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(error instanceof Error ? error : new Error(errorMessage), 'AgentActivityMonitoringService.monitorAllAgentsWithErrorHandling');
      
      this.stats.terminalAccessFailures++;
      
      // Implement graceful degradation when terminals are unavailable
      if (this.config.gracefulDegradationEnabled) {
        console.warn(`⚠️ [${new Date().toISOString()}] Terminal access failed, implementing fallback monitoring`);
        return await this.handleTerminalUnavailability();
      }
      
      throw new TmuxError(`Failed to monitor agents after ${this.config.maxRetries} retries: ${errorMessage}`, 'all');
    }
  }

  /**
   * Process monitoring results and update agent statuses
   */
  private async processMonitoringResults(results: TerminalMonitorResult[]): Promise<void> {
    let activeAgentCount = 0;
    let errorStateCount = 0;
    
    console.log(`🔄 [${new Date().toISOString()}] Processing ${results.length} monitoring results`);
    
    for (const result of results) {
      try {
        const agentState = this.getOrCreateAgentState(result.agentName);
        const newStatus = await this.createAgentStatusFromResult(result);
        
        // Implement error state detection (Requirement 2.3)
        if (newStatus.status === 'error') {
          errorStateCount++;
          this.handleAgentErrorState(result.agentName, agentState, newStatus);
        }
        
        // Check if status has changed significantly
        if (this.shouldUpdateStatus(agentState.lastKnownStatus, newStatus)) {
          // Broadcast status update with error handling
          try {
            this.onStatusUpdate(result.agentName, newStatus);
            agentState.lastKnownStatus = newStatus;
            
            console.log(`📊 [${new Date().toISOString()}] Agent ${result.agentName} status updated:`, {
              status: newStatus.status,
              activity: newStatus.currentActivity,
              file: newStatus.workingOnFile,
              command: newStatus.executingCommand,
              hasError: agentState.errorState.hasError
            });
          } catch (broadcastError) {
            logError(broadcastError instanceof Error ? broadcastError : new Error(String(broadcastError)), 
                    `AgentActivityMonitoringService.processMonitoringResults.broadcast.${result.agentName}`);
          }
        }
        
        // Update agent activity state
        agentState.isActive = newStatus.status === 'working';
        if (agentState.isActive) {
          activeAgentCount++;
        }
        
      } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)), 
                `AgentActivityMonitoringService.processMonitoringResults.${result.agentName}`);
        await this.handleAgentProcessingError(result.agentName, error);
      }
    }
    
    this.stats.activeAgents = activeAgentCount;
    this.stats.errorStates = errorStateCount;
    
    console.log(`✅ [${new Date().toISOString()}] Processed results: ${activeAgentCount} active, ${errorStateCount} errors`);
  }

  /**
   * Create AgentStatus from monitoring result
   */
  private async createAgentStatusFromResult(result: TerminalMonitorResult): Promise<AgentStatus> {
    let status: 'idle' | 'working' | 'offline' | 'error' = 'offline';
    let currentActivity: string | undefined;
    let workingOnFile: string | undefined;
    let executingCommand: string | undefined;

    if (result.lastOutput) {
      // Agent is online, determine if working or idle
      if (result.hasNewActivity && result.activityInfo) {
        status = 'working';
        currentActivity = result.activityInfo.description;
        workingOnFile = result.activityInfo.fileName;
        executingCommand = result.activityInfo.command;
      } else if (result.isIdle) {
        status = 'idle';
        currentActivity = 'Waiting for input';
      } else {
        status = 'working';
        currentActivity = 'Processing...';
      }
      
      // Check for error patterns in output
      if (this.activityAnalyzer.hasError(result.lastOutput)) {
        status = 'error';
        currentActivity = 'Error detected in terminal output';
      }
    }

    return {
      id: result.agentName,
      name: result.agentName,
      status,
      currentActivity,
      lastActivity: result.timestamp,
      terminalOutput: this.optimizeTerminalOutput(result.lastOutput),
      workingOnFile,
      executingCommand
    };
  }

  /**
   * Optimize terminal output for performance
   * Requirement: Create performance optimization for large terminal outputs
   */
  private optimizeTerminalOutput(output: string): string {
    if (!this.config.performanceOptimizationEnabled) {
      return output;
    }

    // Truncate large outputs to prevent memory issues
    const lines = output.split('\n');
    if (lines.length > this.config.maxOutputBufferSize) {
      const truncatedLines = lines.slice(-this.config.maxOutputBufferSize);
      return truncatedLines.join('\n') + '\n[... output truncated for performance ...]';
    }

    return output;
  }

  /**
   * Determine if status should be updated
   */
  private shouldUpdateStatus(previous: AgentStatus | null, current: AgentStatus): boolean {
    if (!previous) return true;
    
    // Check for significant changes
    return (
      previous.status !== current.status ||
      previous.currentActivity !== current.currentActivity ||
      previous.workingOnFile !== current.workingOnFile ||
      previous.executingCommand !== current.executingCommand
    );
  }

  /**
   * Get or create agent monitoring state
   */
  private getOrCreateAgentState(agentName: string): AgentMonitoringState {
    if (!this.agentStates.has(agentName)) {
      console.log(`🆕 [${new Date().toISOString()}] Creating new monitoring state for agent: ${agentName}`);
      
      this.agentStates.set(agentName, {
        lastCheckTime: new Date(),
        consecutiveFailures: 0,
        isActive: false,
        checkInterval: this.config.activeCheckInterval,
        lastKnownStatus: null,
        errorState: {
          hasError: false,
          recoveryAttempts: 0
        },
        fallbackMode: false
      });
    }
    return this.agentStates.get(agentName)!;
  }

  /**
   * Handle monitoring failure with graceful degradation
   * Requirement: Implement graceful degradation when terminals are unavailable
   */
  private async handleMonitoringFailure(error: any): Promise<void> {
    console.warn('⚠️ Implementing graceful degradation due to monitoring failure:', error.message);
    
    // Increase check intervals to reduce load
    const degradedInterval = Math.min(this.config.idleCheckInterval * 2, 60000);
    
    // Mark all agents as potentially offline if we can't monitor them
    for (const [agentName, state] of this.agentStates.entries()) {
      state.consecutiveFailures++;
      
      if (state.consecutiveFailures >= this.config.maxRetries) {
        const offlineStatus: AgentStatus = {
          id: agentName,
          name: agentName,
          status: 'offline',
          currentActivity: 'Terminal monitoring unavailable',
          lastActivity: new Date(),
          terminalOutput: ''
        };
        
        this.onStatusUpdate(agentName, offlineStatus);
        state.lastKnownStatus = offlineStatus;
        state.isActive = false;
      }
    }
  }

  /**
   * Handle terminal unavailability with fallback mechanisms
   * Requirement: Create fallback mechanisms for monitoring failures
   */
  private async handleTerminalUnavailability(): Promise<TerminalMonitorResult[]> {
    console.warn(`⚠️ [${new Date().toISOString()}] Terminals are unavailable, implementing fallback monitoring`);
    this.stats.fallbackActivations++;
    
    const fallbackResults: TerminalMonitorResult[] = [];
    
    // Create fallback results for all known agents
    const knownAgents = ['president', 'boss1', 'worker1', 'worker2', 'worker3'];
    
    for (const agentName of knownAgents) {
      const agentState = this.getOrCreateAgentState(agentName);
      agentState.fallbackMode = true;
      agentState.consecutiveFailures++;
      
      // Create fallback status based on last known state
      let fallbackStatus: 'idle' | 'working' | 'offline' | 'error' = 'offline';
      let currentActivity = 'Terminal monitoring unavailable';
      
      // If we have recent successful checks, maintain last known status briefly
      if (agentState.lastSuccessfulCheck) {
        const timeSinceLastSuccess = Date.now() - agentState.lastSuccessfulCheck.getTime();
        if (timeSinceLastSuccess < 60000) { // 1 minute grace period
          fallbackStatus = agentState.lastKnownStatus?.status || 'offline';
          currentActivity = 'Status from fallback monitoring';
        }
      }
      
      fallbackResults.push({
        agentName,
        hasNewActivity: false,
        isIdle: fallbackStatus === 'idle',
        lastOutput: '',
        timestamp: new Date()
      });
      
      console.log(`🔄 [${new Date().toISOString()}] Created fallback result for ${agentName}: ${fallbackStatus}`);
    }
    
    return fallbackResults;
  }

  /**
   * Handle agent error state detection and reporting
   * Requirement 2.3: Error state detection and reporting
   */
  private handleAgentErrorState(agentName: string, agentState: AgentMonitoringState, status: AgentStatus): void {
    const errorMessage = status.currentActivity || 'Unknown error';
    
    console.error(`❌ [${new Date().toISOString()}] Agent ${agentName} entered error state: ${errorMessage}`);
    
    agentState.errorState = {
      hasError: true,
      errorMessage,
      errorTimestamp: new Date(),
      recoveryAttempts: agentState.errorState.recoveryAttempts || 0
    };
    
    // Log detailed error information for debugging
    console.error(`🔍 [${new Date().toISOString()}] Error details for ${agentName}:`, {
      errorMessage,
      consecutiveFailures: agentState.consecutiveFailures,
      lastSuccessfulCheck: agentState.lastSuccessfulCheck,
      fallbackMode: agentState.fallbackMode,
      recoveryAttempts: agentState.errorState.recoveryAttempts
    });
  }

  /**
   * Handle agent processing error with comprehensive logging
   */
  private async handleAgentProcessingError(agentName: string, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(error instanceof Error ? error : new Error(errorMessage), 
            `AgentActivityMonitoringService.handleAgentProcessingError.${agentName}`);
    
    const agentState = this.getOrCreateAgentState(agentName);
    agentState.consecutiveFailures++;
    
    console.error(`❌ [${new Date().toISOString()}] Processing error for agent ${agentName} (failure #${agentState.consecutiveFailures}): ${errorMessage}`);
    
    if (agentState.consecutiveFailures >= this.config.maxRetries) {
      console.error(`🚨 [${new Date().toISOString()}] Agent ${agentName} exceeded max retries (${this.config.maxRetries}), marking as error`);
      
      const errorStatus: AgentStatus = {
        id: agentName,
        name: agentName,
        status: 'error',
        currentActivity: `Processing error after ${agentState.consecutiveFailures} failures: ${errorMessage}`,
        lastActivity: new Date(),
        terminalOutput: ''
      };
      
      try {
        this.onStatusUpdate(agentName, errorStatus);
        agentState.lastKnownStatus = errorStatus;
        
        // Update error state
        agentState.errorState = {
          hasError: true,
          errorMessage,
          errorTimestamp: new Date(),
          recoveryAttempts: agentState.errorState.recoveryAttempts || 0
        };
        
      } catch (broadcastError) {
        logError(broadcastError instanceof Error ? broadcastError : new Error(String(broadcastError)), 
                `AgentActivityMonitoringService.handleAgentProcessingError.broadcast.${agentName}`);
      }
    } else {
      console.warn(`⚠️ [${new Date().toISOString()}] Agent ${agentName} processing error, will retry (${agentState.consecutiveFailures}/${this.config.maxRetries})`);
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(checkDuration: number): void {
    this.checkDurations.push(checkDuration);
    
    // Keep only recent durations for average calculation
    if (this.checkDurations.length > 100) {
      this.checkDurations = this.checkDurations.slice(-50);
    }
    
    this.stats.averageCheckDuration = 
      this.checkDurations.reduce((sum, duration) => sum + duration, 0) / this.checkDurations.length;
  }

  /**
   * Get current monitoring statistics
   */
  public getStats(): MonitoringStats {
    return { ...this.stats };
  }

  /**
   * Get agent monitoring states
   */
  public getAgentStates(): Map<string, AgentMonitoringState> {
    return new Map(this.agentStates);
  }

  /**
   * Update monitoring configuration
   */
  public updateConfig(newConfig: Partial<MonitoringServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Monitoring service configuration updated:', this.config);
  }

  /**
   * Reset monitoring statistics
   */
  public resetStats(): void {
    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageCheckDuration: 0,
      activeAgents: 0,
      lastCheckTimestamp: new Date(),
      uptime: 0,
      errorStates: 0,
      recoveredErrors: 0,
      terminalAccessFailures: 0,
      fallbackActivations: 0
    };
    this.checkDurations = [];
    this.startTime = new Date();
    console.log(`📊 [${new Date().toISOString()}] Monitoring statistics reset`);
  }

  /**
   * Get service health status
   */
  public getHealthStatus(): {
    isRunning: boolean;
    uptime: number;
    successRate: number;
    averageCheckDuration: number;
    activeAgents: number;
    lastCheckAge: number;
  } {
    const now = Date.now();
    const successRate = this.stats.totalChecks > 0 
      ? (this.stats.successfulChecks / this.stats.totalChecks) * 100 
      : 0;
    
    return {
      isRunning: this.isRunning,
      uptime: now - this.startTime.getTime(),
      successRate,
      averageCheckDuration: this.stats.averageCheckDuration,
      activeAgents: this.stats.activeAgents,
      lastCheckAge: now - this.stats.lastCheckTimestamp.getTime()
    };
  }

  /**
   * Get comprehensive performance metrics
   * Requirement 5.3: Create monitoring metrics for system performance
   */
  public getComprehensiveMetrics(): {
    monitoring: MonitoringStats;
    terminalMonitor: ReturnType<TerminalOutputMonitor['getPerformanceMetrics']>;
    activityAnalyzer: ReturnType<ActivityAnalyzer['getPerformanceMetrics']>;
    systemHealth: ReturnType<AgentActivityMonitoringService['getHealthStatus']>;
    memoryUsage: {
      totalMB: number;
      agentStatesKB: number;
      checkDurationsKB: number;
    };
  } {
    // Calculate memory usage
    const agentStatesMemory = Array.from(this.agentStates.entries())
      .reduce((total, [key, state]) => {
        return total + key.length + 
               (state.lastKnownStatus?.currentActivity?.length || 0) + 
               (state.errorState.errorMessage?.length || 0) + 
               200; // Overhead for object structure
      }, 0);

    const checkDurationsMemory = this.checkDurations.length * 8; // 8 bytes per number

    return {
      monitoring: this.getStats(),
      terminalMonitor: this.terminalMonitor.getPerformanceMetrics(),
      activityAnalyzer: this.activityAnalyzer.getPerformanceMetrics(),
      systemHealth: this.getHealthStatus(),
      memoryUsage: {
        totalMB: (agentStatesMemory + checkDurationsMemory) / (1024 * 1024),
        agentStatesKB: agentStatesMemory / 1024,
        checkDurationsKB: checkDurationsMemory / 1024
      }
    };
  }

  /**
   * Optimize monitoring performance based on current metrics
   * Requirement 5.1, 5.2: Performance optimization and memory cleanup
   */
  public optimizePerformance(): void {
    const metrics = this.getComprehensiveMetrics();
    
    console.log(`🔧 [${new Date().toISOString()}] Optimizing monitoring performance`);
    
    // Adjust check intervals based on performance
    if (metrics.systemHealth.averageCheckDuration > 5000) { // 5 seconds
      console.log(`⚠️ [${new Date().toISOString()}] Slow checks detected, increasing intervals`);
      this.config.activeCheckInterval = Math.min(this.config.activeCheckInterval * 1.2, 30000);
      this.config.idleCheckInterval = Math.min(this.config.idleCheckInterval * 1.2, 60000);
    } else if (metrics.systemHealth.averageCheckDuration < 1000) { // 1 second
      console.log(`⚡ [${new Date().toISOString()}] Fast checks detected, optimizing intervals`);
      this.config.activeCheckInterval = Math.max(this.config.activeCheckInterval * 0.9, 5000);
      this.config.idleCheckInterval = Math.max(this.config.idleCheckInterval * 0.9, 15000);
    }

    // Clean up old check durations if memory usage is high
    if (metrics.memoryUsage.checkDurationsKB > 10) { // 10KB
      this.checkDurations = this.checkDurations.slice(-25); // Keep only last 25
      console.log(`🧹 [${new Date().toISOString()}] Cleaned up old check durations`);
    }

    // Reset error states for agents that have been in error for too long
    const now = Date.now();
    const maxErrorAge = 600000; // 10 minutes
    
    for (const [agentName, state] of this.agentStates.entries()) {
      if (state.errorState.hasError && state.errorState.errorTimestamp) {
        const errorAge = now - state.errorState.errorTimestamp.getTime();
        if (errorAge > maxErrorAge) {
          console.log(`🔄 [${new Date().toISOString()}] Resetting long-standing error state for ${agentName}`);
          state.errorState = {
            hasError: false,
            recoveryAttempts: state.errorState.recoveryAttempts + 1
          };
          state.consecutiveFailures = 0;
        }
      }
    }

    console.log(`✅ [${new Date().toISOString()}] Performance optimization completed`);
  }

  /**
   * Cleanup resources and stop monitoring
   */
  public cleanup(): void {
    this.stop();
    
    // Clear all data structures
    this.agentStates.clear();
    this.checkDurations = [];
    
    // Cleanup dependent services
    this.terminalMonitor.cleanup();
    this.activityAnalyzer.cleanup();
    
    console.log(`🧹 [${new Date().toISOString()}] AgentActivityMonitoringService cleanup completed`);
  }
}