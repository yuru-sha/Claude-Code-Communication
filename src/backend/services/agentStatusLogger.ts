/**
 * Comprehensive logging utility for Agent Status Detection system
 * Provides detailed logging for debugging activity detection
 */

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  agentName?: string;
  message: string;
  data?: any;
  error?: Error;
}

export interface LoggingConfig {
  enableDebugLogging: boolean;
  enableFileLogging: boolean;
  maxLogEntries: number;
  logFilePath?: string;
}

/**
 * Agent Status Logger for comprehensive debugging and monitoring
 */
export class AgentStatusLogger {
  private logs: LogEntry[] = [];
  private config: LoggingConfig;

  constructor(config?: Partial<LoggingConfig>) {
    this.config = {
      enableDebugLogging: config?.enableDebugLogging ?? true,
      enableFileLogging: config?.enableFileLogging ?? false,
      maxLogEntries: config?.maxLogEntries ?? 1000,
      logFilePath: config?.logFilePath ?? 'logs/agent-status.log'
    };

    this.info('AgentStatusLogger', 'Logger initialized', { config: this.config });
  }

  /**
   * Log debug information
   */
  public debug(component: string, message: string, data?: any, agentName?: string): void {
    if (this.config.enableDebugLogging) {
      this.addLog('debug', component, message, data, agentName);
    }
  }

  /**
   * Log informational messages
   */
  public info(component: string, message: string, data?: any, agentName?: string): void {
    this.addLog('info', component, message, data, agentName);
  }

  /**
   * Log warning messages
   */
  public warn(component: string, message: string, data?: any, agentName?: string): void {
    this.addLog('warn', component, message, data, agentName);
  }

  /**
   * Log error messages
   */
  public error(component: string, message: string, error?: Error, data?: any, agentName?: string): void {
    this.addLog('error', component, message, data, agentName, error);
  }

  /**
   * Log monitoring check details
   */
  public logMonitoringCheck(
    agentName: string,
    hasNewActivity: boolean,
    activityType?: string,
    outputLength?: number,
    processingTime?: number
  ): void {
    this.debug('TerminalOutputMonitor', 'Monitoring check completed', {
      hasNewActivity,
      activityType,
      outputLength,
      processingTime
    }, agentName);
  }

  /**
   * Log status change events
   */
  public logStatusChange(
    agentName: string,
    previousStatus: string,
    newStatus: string,
    reason: string,
    additionalData?: any
  ): void {
    this.info('StatusBroadcaster', 'Agent status changed', {
      previousStatus,
      newStatus,
      reason,
      ...additionalData
    }, agentName);
  }

  /**
   * Log error state detection
   */
  public logErrorDetection(
    agentName: string,
    errorPattern: string,
    errorMessage: string,
    outputSample: string
  ): void {
    this.error('ActivityAnalyzer', 'Error state detected', undefined, {
      errorPattern,
      errorMessage,
      outputSample: outputSample.substring(0, 200)
    }, agentName);
  }

  /**
   * Log performance metrics
   */
  public logPerformanceMetrics(
    component: string,
    operation: string,
    duration: number,
    success: boolean,
    additionalMetrics?: any
  ): void {
    this.debug('Performance', `${component}.${operation}`, {
      duration,
      success,
      ...additionalMetrics
    });
  }

  /**
   * Log fallback activation
   */
  public logFallbackActivation(
    reason: string,
    affectedAgents: string[],
    fallbackStrategy: string
  ): void {
    this.warn('FallbackSystem', 'Fallback monitoring activated', {
      reason,
      affectedAgents,
      fallbackStrategy
    });
  }

  /**
   * Get recent logs for debugging
   */
  public getRecentLogs(count: number = 50, level?: LogEntry['level'], component?: string, agentName?: string): LogEntry[] {
    let filteredLogs = this.logs;

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    if (component) {
      filteredLogs = filteredLogs.filter(log => log.component === component);
    }

    if (agentName) {
      filteredLogs = filteredLogs.filter(log => log.agentName === agentName);
    }

    return filteredLogs.slice(-count);
  }

  /**
   * Get error summary for troubleshooting
   */
  public getErrorSummary(): {
    totalErrors: number;
    errorsByComponent: Record<string, number>;
    errorsByAgent: Record<string, number>;
    recentErrors: LogEntry[];
  } {
    const errorLogs = this.logs.filter(log => log.level === 'error');
    
    const errorsByComponent: Record<string, number> = {};
    const errorsByAgent: Record<string, number> = {};

    errorLogs.forEach(log => {
      errorsByComponent[log.component] = (errorsByComponent[log.component] || 0) + 1;
      if (log.agentName) {
        errorsByAgent[log.agentName] = (errorsByAgent[log.agentName] || 0) + 1;
      }
    });

    return {
      totalErrors: errorLogs.length,
      errorsByComponent,
      errorsByAgent,
      recentErrors: errorLogs.slice(-10)
    };
  }

  /**
   * Get system health metrics from logs
   */
  public getHealthMetrics(): {
    totalLogs: number;
    errorRate: number;
    warningRate: number;
    activeAgents: string[];
    lastActivity: Date | null;
  } {
    const totalLogs = this.logs.length;
    const errorLogs = this.logs.filter(log => log.level === 'error').length;
    const warningLogs = this.logs.filter(log => log.level === 'warn').length;
    
    const activeAgents = [...new Set(
      this.logs
        .filter(log => log.agentName && log.timestamp > new Date(Date.now() - 300000)) // Last 5 minutes
        .map(log => log.agentName!)
    )];

    const lastActivity = this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : null;

    return {
      totalLogs,
      errorRate: totalLogs > 0 ? (errorLogs / totalLogs) * 100 : 0,
      warningRate: totalLogs > 0 ? (warningLogs / totalLogs) * 100 : 0,
      activeAgents,
      lastActivity
    };
  }

  /**
   * Clear old logs to prevent memory issues
   */
  public clearOldLogs(): void {
    if (this.logs.length > this.config.maxLogEntries) {
      const logsToRemove = this.logs.length - this.config.maxLogEntries;
      this.logs.splice(0, logsToRemove);
      // Don't log the clearing to avoid infinite recursion during tests
    }
  }

  /**
   * Export logs for external analysis
   */
  public exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.logs, null, 2);
    } else {
      // CSV format
      const headers = ['timestamp', 'level', 'component', 'agentName', 'message', 'data'];
      const csvRows = [headers.join(',')];
      
      this.logs.forEach(log => {
        const row = [
          log.timestamp.toISOString(),
          log.level,
          log.component,
          log.agentName || '',
          `"${log.message.replace(/"/g, '""')}"`,
          log.data ? `"${JSON.stringify(log.data).replace(/"/g, '""')}"` : ''
        ];
        csvRows.push(row.join(','));
      });
      
      return csvRows.join('\n');
    }
  }

  /**
   * Add log entry
   */
  private addLog(
    level: LogEntry['level'],
    component: string,
    message: string,
    data?: any,
    agentName?: string,
    error?: Error
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      agentName,
      message,
      data,
      error
    };

    this.logs.push(logEntry);

    // Console output with formatting
    const timestamp = logEntry.timestamp.toISOString();
    const agentPrefix = agentName ? `[${agentName}] ` : '';
    const levelEmoji = this.getLevelEmoji(level);
    
    // Format message for console output to match test expectations
    const formattedMessage = `${levelEmoji} [${timestamp}] ${agentPrefix}${component}: ${message}`;
    
    if (data) {
      console.log(formattedMessage, data);
    } else {
      console.log(formattedMessage);
    }

    if (error) {
      console.error('Error details:', error);
    }

    // Clean up old logs periodically
    this.clearOldLogs();
  }

  /**
   * Get emoji for log level
   */
  private getLevelEmoji(level: LogEntry['level']): string {
    switch (level) {
      case 'debug': return '🔍';
      case 'info': return 'ℹ️';
      case 'warn': return '⚠️';
      case 'error': return '❌';
      default: return '📝';
    }
  }
}

// Export singleton instance
export const agentStatusLogger = new AgentStatusLogger();