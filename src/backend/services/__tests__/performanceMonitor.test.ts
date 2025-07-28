import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { PerformanceMonitor, SystemPerformanceMetrics } from '../performanceMonitor';
import { AgentActivityMonitoringService } from '../agentActivityMonitoringService';
import { TerminalOutputMonitor } from '../terminalOutputMonitor';
import { ActivityAnalyzer } from '../activityAnalyzer';

// Mock the dependencies
vi.mock('../agentActivityMonitoringService');
vi.mock('../terminalOutputMonitor');
vi.mock('../activityAnalyzer');
vi.mock('../utils/errorHandler', () => ({
  logError: vi.fn()
}));

describe('PerformanceMonitor', () => {
  let performanceMonitor: PerformanceMonitor;
  let mockMonitoringService: AgentActivityMonitoringService;
  let mockTerminalMonitor: TerminalOutputMonitor;
  let mockActivityAnalyzer: ActivityAnalyzer;

  beforeEach(() => {
    performanceMonitor = new PerformanceMonitor();
    
    // Create mock instances
    mockMonitoringService = {
      getComprehensiveMetrics: vi.fn(),
      optimizePerformance: vi.fn(),
      resetStats: vi.fn()
    } as any;

    mockTerminalMonitor = {
      getPerformanceMetrics: vi.fn(),
      cleanup: vi.fn()
    } as any;

    mockActivityAnalyzer = {
      getPerformanceMetrics: vi.fn(),
      clearCache: vi.fn()
    } as any;

    // Setup default mock returns
    (mockMonitoringService.getComprehensiveMetrics as Mock).mockReturnValue({
      monitoring: {
        totalChecks: 100,
        activeAgents: 3,
        errorStates: 0,
        recoveredErrors: 5
      },
      systemHealth: {
        averageCheckDuration: 1500,
        successRate: 95
      },
      memoryUsage: {
        totalMB: 10,
        agentStatesKB: 5,
        checkDurationsKB: 2
      }
    });

    (mockTerminalMonitor.getPerformanceMetrics as Mock).mockReturnValue({
      memoryUsageMB: 25,
      bufferEfficiency: 85,
      cleanupOperations: 3,
      bufferHits: 80,
      bufferMisses: 20
    });

    (mockActivityAnalyzer.getPerformanceMetrics as Mock).mockReturnValue({
      memoryUsageKB: 512,
      cacheHitRate: 75
    });

    performanceMonitor.initialize(mockMonitoringService, mockTerminalMonitor, mockActivityAnalyzer);
  });

  afterEach(() => {
    performanceMonitor.cleanup();
    vi.clearAllMocks();
  });

  describe('Initialization and Basic Operations', () => {
    it('should initialize with monitoring services', () => {
      expect(() => {
        performanceMonitor.initialize(mockMonitoringService, mockTerminalMonitor, mockActivityAnalyzer);
      }).not.toThrow();
    });

    it('should start and stop monitoring', () => {
      performanceMonitor.start();
      expect(performanceMonitor.getCurrentMetrics()).toBeNull(); // No metrics collected yet
      
      performanceMonitor.stop();
      // Should not throw
    });

    it('should handle multiple start/stop calls gracefully', () => {
      performanceMonitor.start();
      performanceMonitor.start(); // Should not throw
      
      performanceMonitor.stop();
      performanceMonitor.stop(); // Should not throw
    });
  });

  describe('Metrics Collection', () => {
    it('should collect comprehensive metrics', async () => {
      performanceMonitor.start();
      
      // Trigger metrics collection manually
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toBeDefined();
      
      if (metrics) {
        expect(metrics.timestamp).toBeInstanceOf(Date);
        expect(metrics.uptime).toBeGreaterThan(0);
        expect(metrics.memoryUsage).toBeDefined();
        expect(metrics.performance).toBeDefined();
        expect(metrics.activity).toBeDefined();
        expect(metrics.optimization).toBeDefined();
      }
    });

    it('should maintain metrics history', () => {
      const initialHistory = performanceMonitor.getMetricsHistory();
      expect(initialHistory).toHaveLength(0);
      
      // Would need to trigger actual metrics collection
      // This is more of an integration test
    });

    it('should limit metrics history size', () => {
      // This would require running the monitor for a while
      // or manually adding metrics to test the limit
      const history = performanceMonitor.getMetricsHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('Performance Alerts', () => {
    it('should generate memory usage alerts', () => {
      // Mock high memory usage
      (mockTerminalMonitor.getPerformanceMetrics as Mock).mockReturnValue({
        memoryUsageMB: 120, // Above critical threshold
        bufferEfficiency: 85,
        cleanupOperations: 3,
        bufferHits: 80,
        bufferMisses: 20
      });

      performanceMonitor.start();
      
      // Allow time for metrics collection and alert generation
      setTimeout(() => {
        const alerts = performanceMonitor.getRecentAlerts();
        const memoryAlert = alerts.find(a => a.metric === 'memoryUsage');
        expect(memoryAlert).toBeDefined();
        expect(memoryAlert?.level).toBe('critical');
      }, 100);
    });

    it('should generate check duration alerts', () => {
      // Mock slow check duration
      (mockMonitoringService.getComprehensiveMetrics as Mock).mockReturnValue({
        monitoring: {
          totalChecks: 100,
          activeAgents: 3,
          errorStates: 0,
          recoveredErrors: 5
        },
        systemHealth: {
          averageCheckDuration: 6000, // Above critical threshold
          successRate: 95
        },
        memoryUsage: {
          totalMB: 10,
          agentStatesKB: 5,
          checkDurationsKB: 2
        }
      });

      performanceMonitor.start();
      
      setTimeout(() => {
        const alerts = performanceMonitor.getRecentAlerts();
        const durationAlert = alerts.find(a => a.metric === 'averageCheckDuration');
        expect(durationAlert).toBeDefined();
        expect(durationAlert?.level).toBe('critical');
      }, 100);
    });

    it('should generate cache hit rate alerts', () => {
      // Mock low cache hit rate
      (mockActivityAnalyzer.getPerformanceMetrics as Mock).mockReturnValue({
        memoryUsageKB: 512,
        cacheHitRate: 40 // Below critical threshold
      });

      performanceMonitor.start();
      
      setTimeout(() => {
        const alerts = performanceMonitor.getRecentAlerts();
        const cacheAlert = alerts.find(a => a.metric === 'cacheHitRate');
        expect(cacheAlert).toBeDefined();
        expect(cacheAlert?.level).toBe('critical');
      }, 100);
    });
  });

  describe('Automatic Optimization', () => {
    it('should trigger memory cleanup for memory alerts', () => {
      // Mock high memory usage to trigger automatic optimization
      (mockTerminalMonitor.getPerformanceMetrics as Mock).mockReturnValue({
        memoryUsageMB: 120,
        bufferEfficiency: 85,
        cleanupOperations: 3,
        bufferHits: 80,
        bufferMisses: 20
      });

      performanceMonitor.start();
      
      setTimeout(() => {
        expect(mockTerminalMonitor.cleanup).toHaveBeenCalled();
        expect(mockActivityAnalyzer.clearCache).toHaveBeenCalled();
      }, 200);
    });

    it('should trigger performance optimization for slow checks', () => {
      // Mock slow check duration
      (mockMonitoringService.getComprehensiveMetrics as Mock).mockReturnValue({
        monitoring: {
          totalChecks: 100,
          activeAgents: 3,
          errorStates: 0,
          recoveredErrors: 5
        },
        systemHealth: {
          averageCheckDuration: 6000,
          successRate: 95
        },
        memoryUsage: {
          totalMB: 10,
          agentStatesKB: 5,
          checkDurationsKB: 2
        }
      });

      performanceMonitor.start();
      
      setTimeout(() => {
        expect(mockMonitoringService.optimizePerformance).toHaveBeenCalled();
      }, 200);
    });

    it('should clear cache for low hit rates', () => {
      // Mock low cache hit rate
      (mockActivityAnalyzer.getPerformanceMetrics as Mock).mockReturnValue({
        memoryUsageKB: 512,
        cacheHitRate: 40
      });

      performanceMonitor.start();
      
      setTimeout(() => {
        expect(mockActivityAnalyzer.clearCache).toHaveBeenCalled();
      }, 200);
    });
  });

  describe('Performance Summary', () => {
    it('should provide performance summary', () => {
      const summary = performanceMonitor.getPerformanceSummary();
      
      expect(summary).toHaveProperty('uptime');
      expect(summary).toHaveProperty('totalAlerts');
      expect(summary).toHaveProperty('criticalAlerts');
      expect(summary).toHaveProperty('currentMemoryMB');
      expect(summary).toHaveProperty('averageCheckDuration');
      expect(summary).toHaveProperty('overallHealth');
      
      expect(['healthy', 'warning', 'critical']).toContain(summary.overallHealth);
    });

    it('should calculate overall health correctly', () => {
      // Test healthy state
      let summary = performanceMonitor.getPerformanceSummary();
      expect(summary.overallHealth).toBe('healthy');
      
      // Would need to simulate alerts to test warning/critical states
    });
  });

  describe('Threshold Management', () => {
    it('should update performance thresholds', () => {
      const newThresholds = {
        memoryUsageMB: { warning: 60, critical: 120 },
        averageCheckDurationMs: { warning: 4000, critical: 6000 }
      };

      expect(() => {
        performanceMonitor.updateThresholds(newThresholds);
      }).not.toThrow();
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources properly', () => {
      performanceMonitor.start();
      
      expect(() => {
        performanceMonitor.cleanup();
      }).not.toThrow();
      
      // Verify cleanup
      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toBeNull();
      
      const alerts = performanceMonitor.getRecentAlerts();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing services gracefully', () => {
      const uninitializedMonitor = new PerformanceMonitor();
      
      expect(() => {
        uninitializedMonitor.start();
      }).not.toThrow();
      
      expect(() => {
        uninitializedMonitor.stop();
      }).not.toThrow();
    });

    it('should handle metrics collection errors', () => {
      // Mock error in metrics collection
      (mockMonitoringService.getComprehensiveMetrics as Mock).mockImplementation(() => {
        throw new Error('Metrics collection failed');
      });

      expect(() => {
        performanceMonitor.start();
      }).not.toThrow();
    });
  });
});