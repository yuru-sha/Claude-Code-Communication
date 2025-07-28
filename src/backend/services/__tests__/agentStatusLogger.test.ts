import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentStatusLogger } from '../agentStatusLogger';

describe('AgentStatusLogger', () => {
  let logger: AgentStatusLogger;
  let consoleSpy: any;

  beforeEach(() => {
    logger = new AgentStatusLogger({
      enableDebugLogging: true,
      enableFileLogging: false,
      maxLogEntries: 100
    });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Basic Logging', () => {
    it('should log debug messages when debug logging is enabled', () => {
      logger.debug('TestComponent', 'Debug message', { key: 'value' }, 'worker1');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔍'),
        expect.objectContaining({ key: 'value' })
      );
    });

    it('should log info messages', () => {
      logger.info('TestComponent', 'Info message', { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ℹ️'),
        expect.objectContaining({ data: 'test' })
      );
    });

    it('should log warning messages', () => {
      logger.warn('TestComponent', 'Warning message', { warning: true }, 'worker2');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️'),
        expect.objectContaining({ warning: true })
      );
    });

    it('should log error messages with error objects', () => {
      const testError = new Error('Test error');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      logger.error('TestComponent', 'Error occurred', testError, { context: 'test' }, 'worker3');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌'),
        expect.objectContaining({ context: 'test' })
      );
      
      expect(errorSpy).toHaveBeenCalledWith('Error details:', testError);
      errorSpy.mockRestore();
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log monitoring check details', () => {
      logger.logMonitoringCheck('worker1', true, 'coding', 150, 25);
      
      const recentLogs = logger.getRecentLogs(1);
      expect(recentLogs).toHaveLength(1);
      expect(recentLogs[0]).toMatchObject({
        level: 'debug',
        component: 'TerminalOutputMonitor',
        agentName: 'worker1',
        message: 'Monitoring check completed',
        data: {
          hasNewActivity: true,
          activityType: 'coding',
          outputLength: 150,
          processingTime: 25
        }
      });
    });

    it('should log status change events', () => {
      logger.logStatusChange('worker2', 'idle', 'working', 'New activity detected', {
        fileName: 'test.ts'
      });
      
      const recentLogs = logger.getRecentLogs(1);
      expect(recentLogs).toHaveLength(1);
      expect(recentLogs[0]).toMatchObject({
        level: 'info',
        component: 'StatusBroadcaster',
        agentName: 'worker2',
        message: 'Agent status changed',
        data: {
          previousStatus: 'idle',
          newStatus: 'working',
          reason: 'New activity detected',
          fileName: 'test.ts'
        }
      });
    });

    it('should log error detection events', () => {
      logger.logErrorDetection('worker3', 'SyntaxError', 'Unexpected token', 'Error: Unexpected token at line 5');
      
      const recentLogs = logger.getRecentLogs(1);
      expect(recentLogs).toHaveLength(1);
      expect(recentLogs[0]).toMatchObject({
        level: 'error',
        component: 'ActivityAnalyzer',
        agentName: 'worker3',
        message: 'Error state detected',
        data: {
          errorPattern: 'SyntaxError',
          errorMessage: 'Unexpected token',
          outputSample: 'Error: Unexpected token at line 5'
        }
      });
    });

    it('should log performance metrics', () => {
      logger.logPerformanceMetrics('TerminalMonitor', 'captureOutput', 150, true, {
        outputSize: 1024
      });
      
      const recentLogs = logger.getRecentLogs(1);
      expect(recentLogs).toHaveLength(1);
      expect(recentLogs[0]).toMatchObject({
        level: 'debug',
        component: 'Performance',
        message: 'TerminalMonitor.captureOutput',
        data: {
          duration: 150,
          success: true,
          outputSize: 1024
        }
      });
    });

    it('should log fallback activation', () => {
      logger.logFallbackActivation('Terminal access failed', ['worker1', 'worker2'], 'offline_status');
      
      const recentLogs = logger.getRecentLogs(1);
      expect(recentLogs).toHaveLength(1);
      expect(recentLogs[0]).toMatchObject({
        level: 'warn',
        component: 'FallbackSystem',
        message: 'Fallback monitoring activated',
        data: {
          reason: 'Terminal access failed',
          affectedAgents: ['worker1', 'worker2'],
          fallbackStrategy: 'offline_status'
        }
      });
    });
  });

  describe('Log Retrieval and Filtering', () => {
    beforeEach(() => {
      // Add various log entries
      logger.debug('Component1', 'Debug 1', {}, 'worker1');
      logger.info('Component2', 'Info 1', {}, 'worker2');
      logger.warn('Component1', 'Warning 1', {}, 'worker1');
      logger.error('Component3', 'Error 1', undefined, {}, 'worker3');
      logger.info('Component2', 'Info 2', {}, 'worker2');
    });

    it('should retrieve recent logs with count limit', () => {
      const recentLogs = logger.getRecentLogs(3);
      expect(recentLogs).toHaveLength(3);
      
      // Should be in chronological order (most recent last)
      expect(recentLogs[2].message).toBe('Info 2');
    });

    it('should filter logs by level', () => {
      const errorLogs = logger.getRecentLogs(10, 'error');
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe('error');
      expect(errorLogs[0].message).toBe('Error 1');
    });

    it('should filter logs by component', () => {
      const component1Logs = logger.getRecentLogs(10, undefined, 'Component1');
      expect(component1Logs).toHaveLength(2);
      expect(component1Logs.every(log => log.component === 'Component1')).toBe(true);
    });

    it('should filter logs by agent name', () => {
      const worker1Logs = logger.getRecentLogs(10, undefined, undefined, 'worker1');
      expect(worker1Logs).toHaveLength(2);
      expect(worker1Logs.every(log => log.agentName === 'worker1')).toBe(true);
    });

    it('should combine multiple filters', () => {
      const filteredLogs = logger.getRecentLogs(10, 'warn', 'Component1', 'worker1');
      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0]).toMatchObject({
        level: 'warn',
        component: 'Component1',
        agentName: 'worker1',
        message: 'Warning 1'
      });
    });
  });

  describe('Error Summary and Analytics', () => {
    beforeEach(() => {
      // Add various log entries including errors
      logger.error('Component1', 'Error 1', undefined, {}, 'worker1');
      logger.error('Component1', 'Error 2', undefined, {}, 'worker2');
      logger.error('Component2', 'Error 3', undefined, {}, 'worker1');
      logger.info('Component1', 'Info message');
      logger.warn('Component2', 'Warning message');
    });

    it('should provide error summary', () => {
      const errorSummary = logger.getErrorSummary();
      
      expect(errorSummary.totalErrors).toBe(3);
      expect(errorSummary.errorsByComponent).toEqual({
        'Component1': 2,
        'Component2': 1
      });
      expect(errorSummary.errorsByAgent).toEqual({
        'worker1': 2,
        'worker2': 1
      });
      expect(errorSummary.recentErrors).toHaveLength(3);
    });

    it('should provide health metrics', () => {
      const healthMetrics = logger.getHealthMetrics();
      
      expect(healthMetrics.totalLogs).toBe(6); // 5 test logs + 1 initialization log
      expect(healthMetrics.errorRate).toBe(50); // 3 errors out of 6 total logs
      expect(healthMetrics.warningRate).toBe(Math.round((1/6)*100)); // 1 warning out of 6 total logs
      expect(healthMetrics.lastActivity).toBeInstanceOf(Date);
    });
  });

  describe('Log Management', () => {
    it('should clear old logs when limit is exceeded', () => {
      const smallLogger = new AgentStatusLogger({ maxLogEntries: 3 });
      
      // Add more logs than the limit
      smallLogger.info('Test', 'Log 1');
      smallLogger.info('Test', 'Log 2');
      smallLogger.info('Test', 'Log 3');
      smallLogger.info('Test', 'Log 4'); // This should trigger cleanup
      
      const allLogs = smallLogger.getRecentLogs(10);
      expect(allLogs.length).toBeLessThanOrEqual(3);
    });

    it('should export logs in JSON format', () => {
      logger.info('TestComponent', 'Test message', { data: 'test' });
      
      const exportedJson = logger.exportLogs('json');
      const parsedLogs = JSON.parse(exportedJson);
      
      expect(Array.isArray(parsedLogs)).toBe(true);
      expect(parsedLogs.length).toBeGreaterThan(0);
      expect(parsedLogs[0]).toHaveProperty('timestamp');
      expect(parsedLogs[0]).toHaveProperty('level');
      expect(parsedLogs[0]).toHaveProperty('component');
      expect(parsedLogs[0]).toHaveProperty('message');
    });

    it('should export logs in CSV format', () => {
      logger.info('TestComponent', 'Test message', { data: 'test' });
      
      const exportedCsv = logger.exportLogs('csv');
      const lines = exportedCsv.split('\n');
      
      expect(lines[0]).toBe('timestamp,level,component,agentName,message,data');
      expect(lines.length).toBeGreaterThan(2);
      expect(lines[2]).toContain('info'); // Skip header and initialization log
      expect(lines[2]).toContain('TestComponent');
      expect(lines[2]).toContain('Test message');
    });
  });

  describe('Configuration', () => {
    it('should not log debug messages when debug logging is disabled', () => {
      const noDebugLogger = new AgentStatusLogger({ enableDebugLogging: false });
      const debugConsoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      noDebugLogger.debug('TestComponent', 'Debug message');
      
      expect(debugConsoleSpy).not.toHaveBeenCalled();
      
      debugConsoleSpy.mockRestore();
    });

    it('should still log info, warn, and error messages when debug logging is disabled', () => {
      const noDebugLogger = new AgentStatusLogger({ enableDebugLogging: false });
      const infoConsoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      noDebugLogger.info('TestComponent', 'Info message');
      
      expect(infoConsoleSpy).toHaveBeenCalled();
      
      infoConsoleSpy.mockRestore();
    });
  });
});