import { logError } from '../utils/errorHandler';
import { ActivityAnalyzer } from './activityAnalyzer';
import { AgentActivityMonitoringService } from './agentActivityMonitoringService';
import { TerminalOutputMonitor } from './terminalOutputMonitor';

/**
 * System performance metrics
 */
export interface SystemPerformanceMetrics {
  timestamp: Date;
  uptime: number;
  memoryUsage: {
    totalMB: number;
    terminalMonitorMB: number;
    activityAnalyzerKB: number;
    monitoringServiceKB: number;
  };
  performance: {
    averageCheckDuration: number;
    cacheHitRate: number;
    bufferEfficiency: number;
    successRate: number;
  };
  activity: {
    totalChecks: number;
    activeAgents: number;
    errorStates: number;
    recoveredErrors: number;
  };
  optimization: {
    cleanupOperations: number;
    cacheEvictions: number;
    bufferOptimizations: number;
    lastOptimizationTime: Date;
  };
}

/**
 * Performance alert levels
 */
export type AlertLevel = 'info' | 'warning' | 'critical';

/**
 * Performance alert
 */
export interface PerformanceAlert {
  level: AlertLevel;
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
  suggestions: string[];
}

/**
 * Performance monitoring thresholds
 */
interface PerformanceThresholds {
  memoryUsageMB: { warning: number; critical: number };
  averageCheckDurationMs: { warning: number; critical: number };
  cacheHitRate: { warning: number; critical: number };
  successRate: { warning: number; critical: number };
  errorStates: { warning: number; critical: number };
}

/**
 * Performance Monitor Service
 * Requirement 5.3: Create monitoring metrics for system performance
 * Provides comprehensive performance monitoring and optimization for the agent status detection system
 */
export class PerformanceMonitor {
  private monitoringService: AgentActivityMonitoringService | null = null;
  private terminalMonitor: TerminalOutputMonitor | null = null;
  private activityAnalyzer: ActivityAnalyzer | null = null;
  
  private metricsHistory: SystemPerformanceMetrics[] = [];
  private readonly maxHistorySize: number = 100;
  private readonly monitoringInterval: number = 60000; // 1 minute
  private monitoringTimer: NodeJS.Timeout | null = null;
  
  private alerts: PerformanceAlert[] = [];
  private readonly maxAlerts: number = 50;
  
  private readonly thresholds: PerformanceThresholds = {
    memoryUsageMB: { warning: 50, critical: 100 },
    averageCheckDurationMs: { warning: 3000, critical: 5000 },
    cacheHitRate: { warning: 70, critical: 50 },
    successRate: { warning: 90, critical: 80 },
    errorStates: { warning: 2, critical: 5 }
  };

  private startTime: Date = new Date();
  private lastOptimizationTime: Date = new Date();

  /**
   * Initialize performance monitoring
   */
  public initialize(
    monitoringService: AgentActivityMonitoringService,
    terminalMonitor: TerminalOutputMonitor,
    activityAnalyzer: ActivityAnalyzer
  ): void {
    this.monitoringService = monitoringService;
    this.terminalMonitor = terminalMonitor;
    this.activityAnalyzer = activityAnalyzer;
    
  }

  /**
   * Start performance monitoring
   */
  public start(): void {
    if (this.monitoringTimer) {
      console.warn('Performance monitoring is already running');
      return;
    }

    this.startTime = new Date();
    // Clear existing timer first
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, this.monitoringInterval);

  }

  /**
   * Stop performance monitoring
   */
  public stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

  }

  /**
   * Collect comprehensive performance metrics
   */
  private collectMetrics(): void {
    try {
      if (!this.monitoringService || !this.terminalMonitor || !this.activityAnalyzer) {
        console.warn('Performance monitoring services not initialized');
        return;
      }

      const now = new Date();
      const uptime = now.getTime() - this.startTime.getTime();

      // Get metrics from all services
      const comprehensiveMetrics = this.monitoringService.getComprehensiveMetrics();
      const terminalMetrics = this.terminalMonitor.getPerformanceMetrics();
      const analyzerMetrics = this.activityAnalyzer.getPerformanceMetrics();

      // Compile system metrics
      const systemMetrics: SystemPerformanceMetrics = {
        timestamp: now,
        uptime,
        memoryUsage: {
          totalMB: terminalMetrics.memoryUsageMB + 
                   analyzerMetrics.memoryUsageKB / 1024 + 
                   comprehensiveMetrics.memoryUsage.totalMB,
          terminalMonitorMB: terminalMetrics.memoryUsageMB,
          activityAnalyzerKB: analyzerMetrics.memoryUsageKB,
          monitoringServiceKB: comprehensiveMetrics.memoryUsage.agentStatesKB + 
                               comprehensiveMetrics.memoryUsage.checkDurationsKB
        },
        performance: {
          averageCheckDuration: comprehensiveMetrics.systemHealth.averageCheckDuration,
          cacheHitRate: analyzerMetrics.cacheHitRate,
          bufferEfficiency: terminalMetrics.bufferEfficiency,
          successRate: comprehensiveMetrics.systemHealth.successRate
        },
        activity: {
          totalChecks: comprehensiveMetrics.monitoring.totalChecks,
          activeAgents: comprehensiveMetrics.monitoring.activeAgents,
          errorStates: comprehensiveMetrics.monitoring.errorStates,
          recoveredErrors: comprehensiveMetrics.monitoring.recoveredErrors
        },
        optimization: {
          cleanupOperations: terminalMetrics.cleanupOperations,
          cacheEvictions: 0, // Would need to track this in ActivityAnalyzer
          bufferOptimizations: terminalMetrics.bufferHits + terminalMetrics.bufferMisses,
          lastOptimizationTime: this.lastOptimizationTime
        }
      };

      // Add to history
      this.metricsHistory.push(systemMetrics);
      
      // Trim history if too large
      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
      }

      // Check for performance issues and generate alerts
      this.checkPerformanceThresholds(systemMetrics);


    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PerformanceMonitor.collectMetrics');
    }
  }

  /**
   * Check performance thresholds and generate alerts
   */
  private checkPerformanceThresholds(metrics: SystemPerformanceMetrics): void {
    const alerts: PerformanceAlert[] = [];

    // Memory usage alerts
    if (metrics.memoryUsage.totalMB > this.thresholds.memoryUsageMB.critical) {
      alerts.push({
        level: 'critical',
        message: 'Critical memory usage detected',
        metric: 'memoryUsage',
        value: metrics.memoryUsage.totalMB,
        threshold: this.thresholds.memoryUsageMB.critical,
        timestamp: new Date(),
        suggestions: [
          'Trigger immediate memory cleanup',
          'Reduce buffer sizes',
          'Clear pattern cache',
          'Consider restarting monitoring service'
        ]
      });
    } else if (metrics.memoryUsage.totalMB > this.thresholds.memoryUsageMB.warning) {
      alerts.push({
        level: 'warning',
        message: 'High memory usage detected',
        metric: 'memoryUsage',
        value: metrics.memoryUsage.totalMB,
        threshold: this.thresholds.memoryUsageMB.warning,
        timestamp: new Date(),
        suggestions: [
          'Schedule memory cleanup',
          'Monitor memory growth',
          'Consider reducing cache sizes'
        ]
      });
    }

    // Check duration alerts
    if (metrics.performance.averageCheckDuration > this.thresholds.averageCheckDurationMs.critical) {
      alerts.push({
        level: 'critical',
        message: 'Critical check duration detected',
        metric: 'averageCheckDuration',
        value: metrics.performance.averageCheckDuration,
        threshold: this.thresholds.averageCheckDurationMs.critical,
        timestamp: new Date(),
        suggestions: [
          'Increase check intervals',
          'Optimize pattern matching',
          'Reduce terminal output buffer size',
          'Enable performance optimizations'
        ]
      });
    } else if (metrics.performance.averageCheckDuration > this.thresholds.averageCheckDurationMs.warning) {
      alerts.push({
        level: 'warning',
        message: 'Slow check duration detected',
        metric: 'averageCheckDuration',
        value: metrics.performance.averageCheckDuration,
        threshold: this.thresholds.averageCheckDurationMs.warning,
        timestamp: new Date(),
        suggestions: [
          'Monitor check performance',
          'Consider optimizing patterns',
          'Review terminal output sizes'
        ]
      });
    }

    // Cache hit rate alerts
    if (metrics.performance.cacheHitRate < this.thresholds.cacheHitRate.critical) {
      alerts.push({
        level: 'critical',
        message: 'Critical cache hit rate',
        metric: 'cacheHitRate',
        value: metrics.performance.cacheHitRate,
        threshold: this.thresholds.cacheHitRate.critical,
        timestamp: new Date(),
        suggestions: [
          'Review cache key generation',
          'Increase cache size',
          'Adjust cache expiry time',
          'Analyze pattern diversity'
        ]
      });
    } else if (metrics.performance.cacheHitRate < this.thresholds.cacheHitRate.warning) {
      alerts.push({
        level: 'warning',
        message: 'Low cache hit rate',
        metric: 'cacheHitRate',
        value: metrics.performance.cacheHitRate,
        threshold: this.thresholds.cacheHitRate.warning,
        timestamp: new Date(),
        suggestions: [
          'Monitor cache performance',
          'Consider cache tuning'
        ]
      });
    }

    // Success rate alerts
    if (metrics.performance.successRate < this.thresholds.successRate.critical) {
      alerts.push({
        level: 'critical',
        message: 'Critical success rate',
        metric: 'successRate',
        value: metrics.performance.successRate,
        threshold: this.thresholds.successRate.critical,
        timestamp: new Date(),
        suggestions: [
          'Check terminal connectivity',
          'Review error logs',
          'Verify tmux sessions',
          'Consider fallback mechanisms'
        ]
      });
    } else if (metrics.performance.successRate < this.thresholds.successRate.warning) {
      alerts.push({
        level: 'warning',
        message: 'Low success rate',
        metric: 'successRate',
        value: metrics.performance.successRate,
        threshold: this.thresholds.successRate.warning,
        timestamp: new Date(),
        suggestions: [
          'Monitor error patterns',
          'Check system health'
        ]
      });
    }

    // Error states alerts
    if (metrics.activity.errorStates > this.thresholds.errorStates.critical) {
      alerts.push({
        level: 'critical',
        message: 'Critical number of error states',
        metric: 'errorStates',
        value: metrics.activity.errorStates,
        threshold: this.thresholds.errorStates.critical,
        timestamp: new Date(),
        suggestions: [
          'Investigate agent errors',
          'Reset error states',
          'Check agent connectivity',
          'Review error recovery mechanisms'
        ]
      });
    } else if (metrics.activity.errorStates > this.thresholds.errorStates.warning) {
      alerts.push({
        level: 'warning',
        message: 'Multiple error states detected',
        metric: 'errorStates',
        value: metrics.activity.errorStates,
        threshold: this.thresholds.errorStates.warning,
        timestamp: new Date(),
        suggestions: [
          'Monitor error trends',
          'Check agent health'
        ]
      });
    }

    // Add alerts and trigger actions
    for (const alert of alerts) {
      this.addAlert(alert);
      
      // Trigger automatic optimizations for critical alerts
      if (alert.level === 'critical') {
        this.triggerAutomaticOptimization(alert);
      }
    }
  }

  /**
   * Add performance alert
   */
  private addAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert);
    
    // Trim alerts if too many
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    // Log alert
    const logLevel = alert.level === 'critical' ? 'error' : 'warn';
    console[logLevel](`🚨 [${alert.timestamp.toISOString()}] ${alert.level.toUpperCase()}: ${alert.message}`, {
      metric: alert.metric,
      value: alert.value,
      threshold: alert.threshold,
      suggestions: alert.suggestions
    });
  }

  /**
   * Trigger automatic optimization based on alert
   */
  private triggerAutomaticOptimization(alert: PerformanceAlert): void {
    if (!this.monitoringService) return;


    try {
      switch (alert.metric) {
        case 'memoryUsage':
          // Trigger memory cleanup
          this.terminalMonitor?.cleanup();
          this.activityAnalyzer?.clearCache();
          break;

        case 'averageCheckDuration':
          // Optimize performance
          this.monitoringService.optimizePerformance();
          break;

        case 'cacheHitRate':
          // Clear and rebuild cache
          this.activityAnalyzer?.clearCache();
          break;

        case 'successRate':
          // Reset monitoring service
          this.monitoringService.resetStats();
          break;

        case 'errorStates':
          // This would require more complex error recovery
          break;
      }

      this.lastOptimizationTime = new Date();

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 
              `PerformanceMonitor.triggerAutomaticOptimization.${alert.metric}`);
    }
  }

  /**
   * Get current performance metrics
   */
  public getCurrentMetrics(): SystemPerformanceMetrics | null {
    return this.metricsHistory.length > 0 
      ? this.metricsHistory[this.metricsHistory.length - 1] 
      : null;
  }

  /**
   * Get metrics history
   */
  public getMetricsHistory(count?: number): SystemPerformanceMetrics[] {
    if (count) {
      return this.metricsHistory.slice(-count);
    }
    return [...this.metricsHistory];
  }

  /**
   * Get recent alerts
   */
  public getRecentAlerts(count: number = 10): PerformanceAlert[] {
    return this.alerts.slice(-count);
  }

  /**
   * Get performance summary
   */
  public getPerformanceSummary(): {
    uptime: number;
    totalAlerts: number;
    criticalAlerts: number;
    currentMemoryMB: number;
    averageCheckDuration: number;
    overallHealth: 'healthy' | 'warning' | 'critical';
  } {
    const currentMetrics = this.getCurrentMetrics();
    const recentAlerts = this.getRecentAlerts(20);
    const criticalAlerts = recentAlerts.filter(a => a.level === 'critical').length;
    const warningAlerts = recentAlerts.filter(a => a.level === 'warning').length;

    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalAlerts > 0) {
      overallHealth = 'critical';
    } else if (warningAlerts > 2) {
      overallHealth = 'warning';
    }

    return {
      uptime: currentMetrics?.uptime || 0,
      totalAlerts: this.alerts.length,
      criticalAlerts,
      currentMemoryMB: currentMetrics?.memoryUsage.totalMB || 0,
      averageCheckDuration: currentMetrics?.performance.averageCheckDuration || 0,
      overallHealth
    };
  }

  /**
   * Update performance thresholds
   */
  public updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    Object.assign(this.thresholds, newThresholds);
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stop();
    this.metricsHistory = [];
    this.alerts = [];
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();