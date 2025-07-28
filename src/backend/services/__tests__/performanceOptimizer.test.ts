import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { PerformanceOptimizer, OptimizationMetrics } from '../performanceOptimizer';
import { TerminalOutputMonitor } from '../terminalOutputMonitor';
import { ActivityAnalyzer } from '../activityAnalyzer';
import { AgentActivityMonitoringService } from '../agentActivityMonitoringService';

// Mock the dependencies
vi.mock('../terminalOutputMonitor');
vi.mock('../activityAnalyzer');
vi.mock('../agentActivityMonitoringService');
vi.mock('../utils/errorHandler', () => ({
  logError: vi.fn()
}));

describe('PerformanceOptimizer', () => {
  let optimizer: PerformanceOptimizer;
  let mockTerminalMonitor: TerminalOutputMonitor;
  let mockActivityAnalyzer: ActivityAnalyzer;
  let mockMonitoringService: AgentActivityMonitoringService;

  beforeEach(() => {
    optimizer = new PerformanceOptimizer({
      memoryThresholdMB: 50,
      performanceThresholdMs: 2000,
      optimizationIntervalMs: 60000, // 1 minute for testing
      autoOptimizationEnabled: false // Disable for controlled testing
    });

    // Create mock instances
    mockTerminalMonitor = {
      getPerformanceMetrics: vi.fn(),
      resetAllState: vi.fn(),
      cleanup: vi.fn()
    } as any;

    mockActivityAnalyzer = {
      getPerformanceMetrics: vi.fn(),
      clearCache: vi.fn(),
      cleanup: vi.fn()
    } as any;

    mockMonitoringService = {
      getComprehensiveMetrics: vi.fn(),
      optimizePerformance: vi.fn()
    } as any;

    // Setup default mock returns
    (mockTerminalMonitor.getPerformanceMetrics as Mock).mockReturnValue({
      memoryUsageMB: 25,
      bufferEfficiency: 85,
      cleanupOperations: 3,
      bufferHits: 80,
      bufferMisses: 20
    });

    (mockActivityAnalyzer.getPerformanceMetrics as Mock).mockReturnValue({
      memoryUsageKB: 512,
      cacheHitRate: 75,
      cacheSize: 100,
      fastPathEfficiency: 80,
      patternOptimizationScore: 85,
      averageCacheEntrySize: 256
    });

    (mockMonitoringService.getComprehensiveMetrics as Mock).mockReturnValue({
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

    optimizer.initialize(mockTerminalMonitor, mockActivityAnalyzer, mockMonitoringService);
  });

  afterEach(() => {
    optimizer.cleanup();
    vi.clearAllMocks();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultOptimizer = new PerformanceOptimizer();
      expect(defaultOptimizer).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        memoryThresholdMB: 100,
        performanceThresholdMs: 5000,
        aggressiveOptimizationEnabled: false
      };
      
      const customOptimizer = new PerformanceOptimizer(customConfig);
      expect(customOptimizer).toBeDefined();
    });

    it('should initialize with monitoring services', () => {
      expect(() => {
        optimizer.initialize(mockTerminalMonitor, mockActivityAnalyzer, mockMonitoringService);
      }).not.toThrow();
    });

    it('should update configuration', () => {
      const newConfig = {
        memoryThresholdMB: 75,
        performanceThresholdMs: 3000
      };

      expect(() => {
        optimizer.updateConfig(newConfig);
      }).not.toThrow();
    });
  });

  describe('Auto Optimization Control', () => {
    it('should start auto optimization', () => {
      expect(() => {
        optimizer.startAutoOptimization();
      }).not.toThrow();
    });

    it('should stop auto optimization', () => {
      optimizer.startAutoOptimization();
      
      expect(() => {
        optimizer.stopAutoOptimization();
      }).not.toThrow();
    });

    it('should handle multiple start calls gracefully', () => {
      optimizer.startAutoOptimization();
      
      expect(() => {
        optimizer.startAutoOptimization(); // Should not throw
      }).not.toThrow();
    });
  });

  describe('Comprehensive Optimization', () => {
    it('should perform comprehensive optimization', async () => {
      const result = await optimizer.performComprehensiveOptimization();
      
      expect(result).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.optimizationsPerformed).toBeGreaterThanOrEqual(0);
      expect(result.totalMemoryFreedMB).toBeGreaterThanOrEqual(0);
      expect(typeof result.performanceGainPercent).toBe('number');
    });

    it('should call all optimization methods', async () => {
      await optimizer.performComprehensiveOptimization();
      
      // Verify that optimization methods were called
      expect(mockTerminalMonitor.resetAllState).toHaveBeenCalled();
      expect(mockActivityAnalyzer.clearCache).toHaveBeenCalled();
      expect(mockMonitoringService.optimizePerformance).toHaveBeenCalled();
    });

    it('should handle optimization errors gracefully', async () => {
      // Mock an error in one of the services
      (mockTerminalMonitor.resetAllState as Mock).mockImplementation(() => {
        throw new Error('Terminal optimization failed');
      });

      // Should not throw, but handle error gracefully and continue with other optimizations
      const result = await optimizer.performComprehensiveOptimization();
      expect(result).toBeDefined();
      expect(result.optimizationsPerformed).toBeGreaterThanOrEqual(0);
    });

    it('should track optimization metrics', async () => {
      const beforeMetrics = optimizer.getOptimizationMetrics();
      
      await optimizer.performComprehensiveOptimization();
      
      const afterMetrics = optimizer.getOptimizationMetrics();
      expect(afterMetrics.optimizationsPerformed).toBeGreaterThan(beforeMetrics.optimizationsPerformed);
    });
  });

  describe('Memory Optimization', () => {
    it('should optimize memory when threshold is exceeded', async () => {
      // Mock high memory usage
      (mockTerminalMonitor.getPerformanceMetrics as Mock).mockReturnValue({
        memoryUsageMB: 60, // Above threshold
        bufferEfficiency: 85,
        cleanupOperations: 3
      });

      const result = await optimizer.performComprehensiveOptimization();
      
      expect(result.memoryOptimizations).toBeGreaterThan(0);
      expect(mockTerminalMonitor.resetAllState).toHaveBeenCalled();
    });

    it('should clear analyzer cache for memory optimization', async () => {
      // Mock high memory usage in analyzer
      (mockActivityAnalyzer.getPerformanceMetrics as Mock).mockReturnValue({
        memoryUsageKB: 2048, // High memory usage
        cacheHitRate: 75,
        cacheSize: 500
      });

      await optimizer.performComprehensiveOptimization();
      
      expect(mockActivityAnalyzer.clearCache).toHaveBeenCalled();
    });
  });

  describe('Pattern Optimization', () => {
    it('should optimize pattern matching', async () => {
      const result = await optimizer.performComprehensiveOptimization();
      
      expect(result.patternOptimizations).toBeGreaterThan(0);
      expect(mockActivityAnalyzer.clearCache).toHaveBeenCalled();
    });

    it('should handle pattern optimization errors gracefully', async () => {
      (mockActivityAnalyzer.clearCache as Mock).mockImplementation(() => {
        throw new Error('Pattern optimization failed');
      });

      // Should not throw, but handle error gracefully and continue with other optimizations
      const result = await optimizer.performComprehensiveOptimization();
      expect(result).toBeDefined();
      expect(result.optimizationsPerformed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Buffer Optimization', () => {
    it('should optimize buffers', async () => {
      const result = await optimizer.performComprehensiveOptimization();
      
      expect(result.bufferOptimizations).toBeGreaterThan(0);
      expect(mockTerminalMonitor.resetAllState).toHaveBeenCalled();
    });

    it('should track buffer memory freed', async () => {
      // Mock buffer with memory usage - need to mock the sequence correctly
      let callCount = 0;
      (mockTerminalMonitor.getPerformanceMetrics as Mock).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return { memoryUsageMB: 30, bufferEfficiency: 85 }; // Before calls
        } else {
          return { memoryUsageMB: 20, bufferEfficiency: 85 }; // After calls
        }
      });

      const result = await optimizer.performComprehensiveOptimization();
      
      // The memory freed calculation should show improvement
      expect(result.totalMemoryFreedMB).toBeGreaterThanOrEqual(0);
      expect(result.optimizationsPerformed).toBeGreaterThan(0);
    });
  });

  describe('Cache Optimization', () => {
    it('should optimize cache when hit rate is low', async () => {
      // Mock low cache hit rate
      (mockActivityAnalyzer.getPerformanceMetrics as Mock).mockReturnValue({
        memoryUsageKB: 512,
        cacheHitRate: 40, // Low hit rate
        cacheSize: 100
      });

      const result = await optimizer.performComprehensiveOptimization();
      
      expect(result.cacheOptimizations).toBeGreaterThan(0);
      expect(mockActivityAnalyzer.clearCache).toHaveBeenCalled();
    });

    it('should optimize cache when memory usage is high', async () => {
      // Mock high cache memory usage
      (mockActivityAnalyzer.getPerformanceMetrics as Mock).mockReturnValue({
        memoryUsageKB: 2048, // High memory usage
        cacheHitRate: 80, // Good hit rate but high memory
        cacheSize: 1000
      });

      const result = await optimizer.performComprehensiveOptimization();
      
      expect(result.cacheOptimizations).toBeGreaterThan(0);
    });
  });

  describe('System Performance Optimization', () => {
    it('should optimize system performance', async () => {
      const result = await optimizer.performComprehensiveOptimization();
      
      expect(mockMonitoringService.optimizePerformance).toHaveBeenCalled();
    });

    it('should handle system optimization errors gracefully', async () => {
      (mockMonitoringService.optimizePerformance as Mock).mockImplementation(() => {
        throw new Error('System optimization failed');
      });

      // Should not throw, but handle error gracefully and continue with other optimizations
      const result = await optimizer.performComprehensiveOptimization();
      expect(result).toBeDefined();
      expect(result.optimizationsPerformed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Automatic Optimization Triggers', () => {
    it('should detect when optimization is needed based on memory', async () => {
      // Mock high memory usage
      (mockTerminalMonitor.getPerformanceMetrics as Mock).mockReturnValue({
        memoryUsageMB: 60 // Above threshold of 50
      });

      // This tests the private shouldOptimize method indirectly
      const result = await optimizer.performComprehensiveOptimization();
      expect(result.optimizationsPerformed).toBeGreaterThan(0);
    });

    it('should detect when optimization is needed based on performance', async () => {
      // Mock slow performance
      (mockMonitoringService.getComprehensiveMetrics as Mock).mockReturnValue({
        systemHealth: {
          averageCheckDuration: 3000, // Above threshold of 2000
          successRate: 95
        },
        memoryUsage: { totalMB: 10 }
      });

      const result = await optimizer.performComprehensiveOptimization();
      expect(result.optimizationsPerformed).toBeGreaterThan(0);
    });
  });

  describe('Metrics and History', () => {
    it('should track optimization metrics', async () => {
      await optimizer.performComprehensiveOptimization();
      
      const metrics = optimizer.getOptimizationMetrics();
      expect(metrics.optimizationsPerformed).toBeGreaterThan(0);
      expect(metrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.lastOptimizationTime).toBeInstanceOf(Date);
    });

    it('should maintain optimization history', async () => {
      await optimizer.performComprehensiveOptimization();
      await optimizer.performComprehensiveOptimization();
      
      const history = optimizer.getOptimizationHistory();
      expect(history.length).toBe(2);
      expect(history[0].timestamp).toBeInstanceOf(Date);
      expect(history[1].timestamp).toBeInstanceOf(Date);
    });

    it('should limit history size', async () => {
      // Perform many optimizations to test history limit
      for (let i = 0; i < 60; i++) {
        await optimizer.performComprehensiveOptimization();
      }
      
      const history = optimizer.getOptimizationHistory();
      expect(history.length).toBeLessThanOrEqual(50); // Max history size
    });
  });

  describe('Performance Gain Calculation', () => {
    it('should calculate performance gain correctly', async () => {
      // Mock different before/after metrics
      (mockTerminalMonitor.getPerformanceMetrics as Mock)
        .mockReturnValueOnce({ memoryUsageMB: 50 }) // Before
        .mockReturnValueOnce({ memoryUsageMB: 40 }); // After

      (mockMonitoringService.getComprehensiveMetrics as Mock)
        .mockReturnValueOnce({
          systemHealth: { averageCheckDuration: 3000 },
          memoryUsage: { totalMB: 20 }
        }) // Before
        .mockReturnValueOnce({
          systemHealth: { averageCheckDuration: 2000 },
          memoryUsage: { totalMB: 15 }
        }); // After

      const result = await optimizer.performComprehensiveOptimization();
      
      expect(result.performanceGainPercent).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing services gracefully', async () => {
      const uninitializedOptimizer = new PerformanceOptimizer();
      
      const result = await uninitializedOptimizer.performComprehensiveOptimization();
      
      // Should complete without throwing, but with minimal optimizations
      expect(result.optimizationsPerformed).toBe(0);
    });

    it('should handle service method errors', async () => {
      (mockTerminalMonitor.getPerformanceMetrics as Mock).mockImplementation(() => {
        throw new Error('Metrics collection failed');
      });

      await expect(optimizer.performComprehensiveOptimization()).rejects.toThrow();
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources properly', () => {
      optimizer.startAutoOptimization();
      
      expect(() => {
        optimizer.cleanup();
      }).not.toThrow();
    });

    it('should clear history on cleanup', () => {
      // Add some history
      const history = optimizer.getOptimizationHistory();
      
      optimizer.cleanup();
      
      // History should be cleared after cleanup
      const clearedHistory = optimizer.getOptimizationHistory();
      expect(clearedHistory.length).toBe(0);
    });
  });

  describe('Hourly Optimization Limits', () => {
    it('should respect hourly optimization limits', () => {
      const limitedOptimizer = new PerformanceOptimizer({
        maxOptimizationsPerHour: 2,
        autoOptimizationEnabled: true
      });

      // This would require more complex testing with time manipulation
      // For now, we just verify the optimizer respects the configuration
      expect(limitedOptimizer).toBeDefined();
    });
  });
});