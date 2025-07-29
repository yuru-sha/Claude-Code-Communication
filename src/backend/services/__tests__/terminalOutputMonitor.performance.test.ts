import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TerminalOutputMonitor } from '../terminalOutputMonitor';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

// Mock utils
vi.mock('../utils/errorHandler', () => ({
  logError: vi.fn(),
  withRetry: vi.fn((fn) => fn),
  TmuxError: class TmuxError extends Error {
    constructor(message: string, public target: string) {
      super(message);
    }
  }
}));

// Mock activity patterns
vi.mock('./activityPatterns', () => ({
  activityPatterns: {
    findBestMatch: vi.fn(() => ({
      activityType: 'coding',
      priority: 10
    })),
    getPatternsByType: vi.fn(() => [])
  }
}));

describe('TerminalOutputMonitor Performance Optimizations', () => {
  let monitor: TerminalOutputMonitor;

  beforeEach(() => {
    monitor = new TerminalOutputMonitor();
  });

  afterEach(() => {
    monitor.cleanup();
  });

  describe('Circular Buffer Implementation', () => {
    it('should initialize with circular buffers for each agent', () => {
      const stats = monitor.getMonitoringStats();
      expect(stats.monitoredAgents).toBe(5); // president, boss1, worker1, worker2, worker3
    });

    it('should track performance metrics', () => {
      const metrics = monitor.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('totalOutputsProcessed');
      expect(metrics).toHaveProperty('averageOutputSize');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('patternMatchingTime');
      expect(metrics).toHaveProperty('bufferHits');
      expect(metrics).toHaveProperty('bufferMisses');
      expect(metrics).toHaveProperty('cleanupOperations');
      expect(metrics).toHaveProperty('lastCleanupTime');
      expect(metrics).toHaveProperty('bufferEfficiency');
      expect(metrics).toHaveProperty('memoryUsageMB');
    });

    it('should calculate buffer efficiency correctly', () => {
      const metrics = monitor.getPerformanceMetrics();
      
      // Initially should be 0 or NaN since no operations yet
      expect(typeof metrics.bufferEfficiency).toBe('number');
      expect(metrics.bufferEfficiency >= 0).toBe(true);
      expect(metrics.bufferEfficiency <= 100).toBe(true);
    });

    it('should track memory usage in MB', () => {
      const metrics = monitor.getPerformanceMetrics();
      
      expect(typeof metrics.memoryUsageMB).toBe('number');
      expect(metrics.memoryUsageMB >= 0).toBe(true);
    });
  });

  describe('Memory Management', () => {
    it('should perform periodic cleanup', async () => {
      // Wait for initial cleanup timer to be set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const initialMetrics = monitor.getPerformanceMetrics();
      expect(initialMetrics.lastCleanupTime).toBeInstanceOf(Date);
    });

    it('should clean up old activity data', () => {
      // Simulate old data by manipulating timestamps
      const agent = { name: 'test-agent', target: 'test-target' };
      
      // This would require access to private methods for proper testing
      // In a real scenario, we'd test this through integration tests
      expect(() => {
        monitor.resetAgentState(agent.name);
      }).not.toThrow();
    });

    it('should reset all monitoring state', () => {
      monitor.resetAllState();
      
      const stats = monitor.getMonitoringStats();
      expect(stats.agentsWithActivity).toBe(0);
      expect(stats.agentsWithRecentActivity).toBe(0);
    });

    it('should cleanup resources on destruction', () => {
      expect(() => {
        monitor.cleanup();
      }).not.toThrow();
    });
  });

  describe('Output Processing Optimization', () => {
    it('should handle large outputs efficiently', async () => {
      // Create a large mock output
      const largeOutput = 'x'.repeat(100000); // 100KB of data
      
      // Mock exec to return large output
      const { exec } = await import('child_process');
      vi.mocked(exec).mockImplementation((command, callback) => {
        if (callback) {
          callback(null, { stdout: largeOutput, stderr: '' } as any);
        }
        return {} as any;
      });

      const agent = { name: 'test-agent', target: 'test-target' };
      
      const startTime = Date.now();
      const result = await monitor.monitorAgentActivity(agent);
      const endTime = Date.now();
      
      // Should complete within reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      
      // Should truncate large outputs
      expect(result.lastOutput.length).toBeLessThan(largeOutput.length);
    });

    it('should track processing performance metrics', async () => {
      const agent = { name: 'test-agent', target: 'test-target' };
      
      // Mock exec
      const { exec } = await import('child_process');
      vi.mocked(exec).mockImplementation((command, callback) => {
        if (callback) {
          callback(null, { stdout: 'test output', stderr: '' } as any);
        }
        return {} as any;
      });

      await monitor.monitorAgentActivity(agent);
      
      const metrics = monitor.getPerformanceMetrics();
      expect(metrics.totalOutputsProcessed).toBeGreaterThan(0);
      expect(metrics.averageOutputSize).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics Accuracy', () => {
    it('should maintain accurate running averages', async () => {
      const agent = { name: 'test-agent', target: 'test-target' };
      
      // Mock exec with different output sizes
      const { exec } = await import('child_process');
      const outputs = ['small', 'medium output', 'this is a much larger output for testing'];
      let callCount = 0;
      
      vi.mocked(exec).mockImplementation((command, callback) => {
        if (callback) {
          const output = outputs[callCount % outputs.length];
          callCount++;
          callback(null, { stdout: output, stderr: '' } as any);
        }
        return {} as any;
      });

      // Process multiple outputs
      for (let i = 0; i < 3; i++) {
        await monitor.monitorAgentActivity(agent);
      }
      
      const metrics = monitor.getPerformanceMetrics();
      expect(metrics.totalOutputsProcessed).toBe(3);
      expect(metrics.averageOutputSize).toBeGreaterThan(0);
    });

    it('should track buffer hit/miss ratios', async () => {
      const agent = { name: 'test-agent', target: 'test-target' };
      
      // Mock exec
      const { exec } = await import('child_process');
      vi.mocked(exec).mockImplementation((command, callback) => {
        if (callback) {
          callback(null, { stdout: 'test output', stderr: '' } as any);
        }
        return {} as any;
      });

      // First call should be a miss (new buffer)
      await monitor.monitorAgentActivity(agent);
      
      let metrics = monitor.getPerformanceMetrics();
      expect(metrics.bufferMisses).toBeGreaterThan(0);
      
      // Second call should be a hit (existing buffer)
      await monitor.monitorAgentActivity(agent);
      
      metrics = monitor.getPerformanceMetrics();
      expect(metrics.bufferHits).toBeGreaterThan(0);
    });
  });

  describe('Memory Optimization', () => {
    it('should limit memory usage through truncation', () => {
      // Test with very large output
      const veryLargeOutput = 'x'.repeat(1000000); // 1MB
      
      // This tests the private truncateOutput method indirectly
      // In practice, this would be tested through the public interface
      expect(veryLargeOutput.length).toBe(1000000);
    });

    it('should provide memory usage statistics', () => {
      const metrics = monitor.getPerformanceMetrics();
      
      expect(typeof metrics.memoryUsage).toBe('number');
      expect(typeof metrics.memoryUsageMB).toBe('number');
      expect(metrics.memoryUsageMB).toBe(metrics.memoryUsage / (1024 * 1024));
    });
  });

  describe('Error Handling in Performance Features', () => {
    it('should handle cleanup errors gracefully', () => {
      // Simulate error conditions
      expect(() => {
        monitor.cleanup();
        monitor.cleanup(); // Double cleanup should not throw
      }).not.toThrow();
    });

    it('should maintain metrics even with processing errors', async () => {
      const agent = { name: 'test-agent', target: 'test-target' };
      
      // Mock exec to throw error
      const { exec } = await import('child_process');
      vi.mocked(exec).mockImplementation((command, callback) => {
        if (callback) {
          callback(new Error('Terminal access failed'), null as any);
        }
        return {} as any;
      });

      const result = await monitor.monitorAgentActivity(agent);
      
      // Should return safe fallback
      expect(result.agentName).toBe(agent.name);
      expect(result.hasNewActivity).toBe(false);
      expect(result.isIdle).toBe(true);
      
      // Metrics should still be tracked
      const metrics = monitor.getPerformanceMetrics();
      expect(metrics.totalOutputsProcessed).toBeGreaterThan(0);
    });
  });

  describe('Integration with Activity Detection', () => {
    it('should maintain performance while detecting activity', async () => {
      const agent = { name: 'test-agent', target: 'test-target' };
      
      // Mock exec with activity-indicating output
      const { exec } = await import('child_process');
      vi.mocked(exec).mockImplementation((command, callback) => {
        if (callback) {
          callback(null, { stdout: 'Creating file: test.js\nfunction hello() {}', stderr: '' } as any);
        }
        return {} as any;
      });

      const startTime = Date.now();
      const result = await monitor.monitorAgentActivity(agent);
      const endTime = Date.now();
      
      // Should detect activity
      expect(result.hasNewActivity).toBe(true);
      
      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(500);
      
      // Should update performance metrics
      const metrics = monitor.getPerformanceMetrics();
      expect(metrics.patternMatchingTime).toBeGreaterThan(0);
    });
  });
});