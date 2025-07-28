import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActivityAnalyzer } from '../activityAnalyzer';
import { TerminalOutputMonitor } from '../terminalOutputMonitor';
import { AgentActivityMonitoringService } from '../agentActivityMonitoringService';

// Mock dependencies for performance testing
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

import { exec } from 'child_process';
const mockExec = vi.mocked(exec);

vi.mock('../activityPatterns', () => ({
  activityPatterns: {
    findBestMatch: vi.fn(),
    getPatternsByType: vi.fn()
  }
}));

vi.mock('../utils/errorHandler', () => ({
  logError: vi.fn(),
  withRetry: vi.fn((fn) => fn),
  TmuxError: class TmuxError extends Error {
    constructor(message: string, public target: string) {
      super(message);
    }
  }
}));

describe('Performance Benchmarks', () => {
  let analyzer: ActivityAnalyzer;
  let monitor: TerminalOutputMonitor;
  let monitoringService: AgentActivityMonitoringService;

  beforeEach(() => {
    analyzer = new ActivityAnalyzer();
    monitor = new TerminalOutputMonitor();
    monitoringService = new AgentActivityMonitoringService(vi.fn());
  });

  afterEach(() => {
    analyzer.cleanup();
    monitor.cleanup();
    monitoringService.stop();
  });

  describe('ActivityAnalyzer Performance', () => {
    it('should analyze small outputs within performance threshold', () => {
      const smallOutput = 'Creating file: test.js';
      const iterations = 1000;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        analyzer.analyzeOutput(smallOutput);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / iterations;
      
      // Should complete 1000 small analyses in under 100ms (0.1ms per analysis)
      expect(totalTime).toBeLessThan(100);
      expect(averageTime).toBeLessThan(0.1);
      
      console.log(`Small output analysis: ${averageTime.toFixed(3)}ms per analysis`);
    });

    it('should analyze medium outputs efficiently', () => {
      const mediumOutput = `
        Creating file: src/components/Button.tsx
        function Button({ onClick, children }: ButtonProps) {
          return <button onClick={onClick}>{children}</button>;
        }
        $ npm test
        ✓ Button component tests passed
      `;
      const iterations = 500;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        analyzer.analyzeOutput(mediumOutput);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / iterations;
      
      // Should complete 500 medium analyses in under 200ms (0.4ms per analysis)
      expect(totalTime).toBeLessThan(200);
      expect(averageTime).toBeLessThan(0.4);
      
      console.log(`Medium output analysis: ${averageTime.toFixed(3)}ms per analysis`);
    });

    it('should handle large outputs with acceptable performance', () => {
      const largeOutput = 'Line of code\n'.repeat(1000) + 'Creating file: large.js';
      const iterations = 100;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        analyzer.analyzeOutput(largeOutput);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / iterations;
      
      // Should complete 100 large analyses in under 500ms (5ms per analysis)
      expect(totalTime).toBeLessThan(500);
      expect(averageTime).toBeLessThan(5);
      
      console.log(`Large output analysis: ${averageTime.toFixed(3)}ms per analysis`);
    });

    it('should demonstrate cache performance benefits', () => {
      const testOutput = 'Creating file: cached-test.js';
      const iterations = 1000;
      
      // First run without cache
      analyzer.clearCache();
      const startTimeNoCache = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        analyzer.analyzeOutput(`${testOutput}_${i}`); // Different each time, no cache hits
      }
      
      const endTimeNoCache = performance.now();
      const noCacheTime = endTimeNoCache - startTimeNoCache;
      
      // Second run with cache hits
      analyzer.clearCache();
      const startTimeWithCache = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        analyzer.analyzeOutput(testOutput); // Same each time, cache hits after first
      }
      
      const endTimeWithCache = performance.now();
      const withCacheTime = endTimeWithCache - startTimeWithCache;
      
      // Cache should provide significant performance improvement
      const improvement = ((noCacheTime - withCacheTime) / noCacheTime) * 100;
      expect(improvement).toBeGreaterThan(50); // At least 50% improvement
      
      console.log(`Cache performance improvement: ${improvement.toFixed(1)}%`);
      
      const metrics = analyzer.getPerformanceMetrics();
      expect(metrics.cacheHitRate).toBeGreaterThan(90); // Should have high cache hit rate
    });

    it('should maintain performance under memory pressure', () => {
      const iterations = 2000;
      const outputs = Array.from({ length: iterations }, (_, i) => 
        `Creating file: test${i}.js\nfunction test${i}() { return ${i}; }`
      );
      
      const startTime = performance.now();
      
      outputs.forEach(output => analyzer.analyzeOutput(output));
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / iterations;
      
      // Should maintain reasonable performance even with many unique outputs
      expect(averageTime).toBeLessThan(2); // Less than 2ms per analysis
      
      const metrics = analyzer.getPerformanceMetrics();
      expect(metrics.memoryUsageKB).toBeLessThan(5000); // Less than 5MB memory usage
      
      console.log(`Memory pressure test: ${averageTime.toFixed(3)}ms per analysis, ${metrics.memoryUsageKB.toFixed(1)}KB memory`);
    });

    it('should optimize pattern matching over time', () => {
      const commonPatterns = [
        'Creating file: test.js',
        'function hello() {}',
        '$ npm install',
        'Human:',
        'Error: Something went wrong'
      ];
      
      // Initial performance measurement
      const initialStartTime = performance.now();
      for (let i = 0; i < 100; i++) {
        commonPatterns.forEach(pattern => analyzer.analyzeOutput(pattern));
      }
      const initialEndTime = performance.now();
      const initialTime = initialEndTime - initialStartTime;
      
      // Performance after optimization kicks in
      const optimizedStartTime = performance.now();
      for (let i = 0; i < 100; i++) {
        commonPatterns.forEach(pattern => analyzer.analyzeOutput(pattern));
      }
      const optimizedEndTime = performance.now();
      const optimizedTime = optimizedEndTime - optimizedStartTime;
      
      // Should show improvement or at least maintain performance
      expect(optimizedTime).toBeLessThanOrEqual(initialTime * 1.1); // Allow 10% variance
      
      const metrics = analyzer.getPerformanceMetrics();
      expect(metrics.fastPathEfficiency).toBeGreaterThan(0);
      expect(metrics.patternOptimizationScore).toBeGreaterThan(0);
      
      console.log(`Pattern optimization: Initial ${initialTime.toFixed(1)}ms, Optimized ${optimizedTime.toFixed(1)}ms`);
    });
  });

  describe('TerminalOutputMonitor Performance', () => {
    beforeEach(() => {
      // Mock exec directly
      mockExec.mockImplementation((command, callback) => {
        // Simulate realistic terminal output
        const output = 'Assistant: Working on task...\nCreating file: test.js\nfunction test() {}';
        setTimeout(() => callback(null, { stdout: output, stderr: '' }), 1);
      });
    });

    it('should monitor single agent within performance threshold', async () => {
      const agent = { name: 'worker1', target: 'multiagent:0.1' };
      const iterations = 100;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        await monitor.monitorAgentActivity(agent);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / iterations;
      
      // Should complete 100 monitoring operations in under 1000ms (10ms per operation)
      expect(totalTime).toBeLessThan(1000);
      expect(averageTime).toBeLessThan(10);
      
      console.log(`Single agent monitoring: ${averageTime.toFixed(3)}ms per operation`);
    });

    it('should monitor all agents efficiently', async () => {
      const iterations = 50;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        await monitor.monitorAllAgents();
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / iterations;
      
      // Should complete 50 full monitoring cycles in under 2500ms (50ms per cycle)
      expect(totalTime).toBeLessThan(2500);
      expect(averageTime).toBeLessThan(50);
      
      console.log(`All agents monitoring: ${averageTime.toFixed(3)}ms per cycle`);
    });

    it('should handle large terminal outputs efficiently', async () => {
      const { exec } = require('child_process');
      const largeOutput = 'Line\n'.repeat(5000); // 5000 lines
      
      mockExec.mockImplementation((command, callback) => {
        setTimeout(() => callback(null, { stdout: largeOutput, stderr: '' }), 1);
      });

      const agent = { name: 'worker1', target: 'multiagent:0.1' };
      const iterations = 20;
      
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        await monitor.monitorAgentActivity(agent);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / iterations;
      
      // Should handle large outputs in under 50ms per operation
      expect(averageTime).toBeLessThan(50);
      
      const metrics = monitor.getPerformanceMetrics();
      expect(metrics.memoryUsageMB).toBeLessThan(10); // Should not use excessive memory
      
      console.log(`Large output handling: ${averageTime.toFixed(3)}ms per operation, ${metrics.memoryUsageMB.toFixed(1)}MB memory`);
    });

    it('should demonstrate buffer efficiency', async () => {
      const agent = { name: 'worker1', target: 'multiagent:0.1' };
      const iterations = 200;
      
      // Generate monitoring activity to populate buffers
      for (let i = 0; i < iterations; i++) {
        await monitor.monitorAgentActivity(agent);
      }
      
      const metrics = monitor.getPerformanceMetrics();
      
      expect(metrics.bufferEfficiency).toBeGreaterThan(50); // At least 50% buffer efficiency
      expect(metrics.bufferHits).toBeGreaterThan(0);
      expect(metrics.totalOutputsProcessed).toBe(iterations);
      
      console.log(`Buffer efficiency: ${metrics.bufferEfficiency.toFixed(1)}%, ${metrics.bufferHits} hits, ${metrics.bufferMisses} misses`);
    });

    it('should maintain performance during concurrent operations', async () => {
      const agents = [
        { name: 'worker1', target: 'multiagent:0.1' },
        { name: 'worker2', target: 'multiagent:0.2' },
        { name: 'worker3', target: 'multiagent:0.3' }
      ];
      
      const startTime = performance.now();
      
      // Simulate concurrent monitoring
      const promises = [];
      for (let i = 0; i < 30; i++) {
        agents.forEach(agent => {
          promises.push(monitor.monitorAgentActivity(agent));
        });
      }
      
      await Promise.all(promises);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / promises.length;
      
      // Should handle concurrent operations efficiently
      expect(averageTime).toBeLessThan(20); // Less than 20ms per concurrent operation
      
      console.log(`Concurrent operations: ${averageTime.toFixed(3)}ms per operation (${promises.length} total)`);
    });
  });

  describe('Integration Performance', () => {
    it('should handle end-to-end monitoring workflow efficiently', async () => {
      const mockOnStatusUpdate = vi.fn();
      const service = new AgentActivityMonitoringService(mockOnStatusUpdate);
      
      // Mock terminal monitor to return realistic data
      mockExec.mockImplementation((command, callback) => {
        const outputs = [
          'Human: Create a new component',
          'Assistant: Creating file: Button.tsx\nfunction Button() {}',
          'Assistant: $ npm test\n✓ Tests passed',
          'Human: '
        ];
        const output = outputs[Math.floor(Math.random() * outputs.length)];
        setTimeout(() => callback(null, { stdout: output, stderr: '' }), Math.random() * 5);
      });

      service.start();
      
      const startTime = performance.now();
      
      // Let the service run for a short period
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      service.stop();
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      const stats = service.getStats();
      
      expect(stats.totalChecks).toBeGreaterThan(0);
      expect(stats.successfulChecks).toBeGreaterThan(0);
      expect(mockOnStatusUpdate).toHaveBeenCalled();
      
      const averageCheckTime = totalTime / stats.totalChecks;
      expect(averageCheckTime).toBeLessThan(100); // Less than 100ms per check cycle
      
      console.log(`End-to-end performance: ${stats.totalChecks} checks in ${totalTime.toFixed(1)}ms (${averageCheckTime.toFixed(1)}ms per check)`);
    });

    it('should scale performance with number of agents', async () => {
      const mockOnStatusUpdate = vi.fn();
      const service = new AgentActivityMonitoringService(mockOnStatusUpdate);
      
      // Mock different response times for different agents
      mockExec.mockImplementation((command, callback) => {
        const delay = command.includes('president') ? 1 : 
                     command.includes('boss') ? 2 : 
                     Math.random() * 3; // Workers have variable delay
        
        setTimeout(() => {
          callback(null, { stdout: 'Working...', stderr: '' });
        }, delay);
      });

      const startTime = performance.now();
      
      // Perform multiple monitoring cycles
      const cycles = 10;
      for (let i = 0; i < cycles; i++) {
        const serviceMonitor = (service as any).terminalMonitor;
        await serviceMonitor.monitorAllAgents();
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / cycles;
      
      // Should scale reasonably with 5 agents
      expect(averageTime).toBeLessThan(100); // Less than 100ms per full cycle
      
      console.log(`Multi-agent scaling: ${averageTime.toFixed(1)}ms per cycle (5 agents, ${cycles} cycles)`);
    });

    it('should maintain performance under error conditions', async () => {
      const mockOnStatusUpdate = vi.fn();
      const service = new AgentActivityMonitoringService(mockOnStatusUpdate);
      
      // Mock intermittent failures
      let callCount = 0;
      mockExec.mockImplementation((command, callback) => {
        callCount++;
        if (callCount % 3 === 0) {
          // Every third call fails
          setTimeout(() => callback(new Error('Terminal unavailable'), null), 1);
        } else {
          setTimeout(() => callback(null, { stdout: 'Working...', stderr: '' }), 2);
        }
      });

      const startTime = performance.now();
      
      // Run monitoring with errors
      const serviceMonitor = (service as any).terminalMonitor;
      const cycles = 20;
      
      for (let i = 0; i < cycles; i++) {
        await serviceMonitor.monitorAllAgents();
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / cycles;
      
      // Should handle errors gracefully without significant performance impact
      expect(averageTime).toBeLessThan(150); // Allow some overhead for error handling
      
      console.log(`Error resilience: ${averageTime.toFixed(1)}ms per cycle with ~33% error rate`);
    });
  });

  describe('Memory Usage Benchmarks', () => {
    it('should maintain reasonable memory usage during extended operation', async () => {
      const iterations = 1000;
      const outputs = Array.from({ length: iterations }, (_, i) => 
        `Iteration ${i}: Creating file: test${i % 100}.js\nfunction test() { return ${i}; }`
      );
      
      // Measure initial memory
      const initialMetrics = analyzer.getPerformanceMetrics();
      const initialMemory = initialMetrics.memoryUsageKB;
      
      // Process many outputs
      outputs.forEach(output => analyzer.analyzeOutput(output));
      
      // Measure final memory
      const finalMetrics = analyzer.getPerformanceMetrics();
      const finalMemory = finalMetrics.memoryUsageKB;
      
      const memoryGrowth = finalMemory - initialMemory;
      const memoryPerOperation = memoryGrowth / iterations;
      
      // Memory growth should be reasonable
      expect(memoryGrowth).toBeLessThan(2000); // Less than 2MB growth
      expect(memoryPerOperation).toBeLessThan(2); // Less than 2KB per operation
      
      console.log(`Memory usage: ${memoryGrowth.toFixed(1)}KB growth (${memoryPerOperation.toFixed(3)}KB per operation)`);
    });

    it('should demonstrate effective memory cleanup', async () => {
      // Generate significant memory usage
      for (let i = 0; i < 2000; i++) {
        analyzer.analyzeOutput(`Large output ${i}: ${'x'.repeat(100)}`);
      }
      
      const beforeCleanup = analyzer.getPerformanceMetrics();
      const memoryBefore = beforeCleanup.memoryUsageKB;
      
      // Force cleanup
      analyzer.clearCache();
      
      const afterCleanup = analyzer.getPerformanceMetrics();
      const memoryAfter = afterCleanup.memoryUsageKB;
      
      const memoryFreed = memoryBefore - memoryAfter;
      const cleanupEfficiency = (memoryFreed / memoryBefore) * 100;
      
      expect(cleanupEfficiency).toBeGreaterThan(80); // Should free at least 80% of memory
      expect(afterCleanup.cacheSize).toBe(0);
      
      console.log(`Memory cleanup: ${memoryFreed.toFixed(1)}KB freed (${cleanupEfficiency.toFixed(1)}% efficiency)`);
    });
  });

  describe('Stress Testing', () => {
    it('should handle high-frequency updates without degradation', async () => {
      const mockOnStatusUpdate = vi.fn();
      const service = new AgentActivityMonitoringService(mockOnStatusUpdate, {
        activeCheckInterval: 10, // Very frequent checks
        idleCheckInterval: 20
      });
      
      mockExec.mockImplementation((command, callback) => {
        // Immediate response
        callback(null, { stdout: `Fast response ${Date.now()}`, stderr: '' });
      });

      service.start();
      
      const startTime = performance.now();
      
      // Run for 500ms with very frequent updates
      await new Promise(resolve => setTimeout(resolve, 500));
      
      service.stop();
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      const stats = service.getStats();
      const checksPerSecond = (stats.totalChecks / totalTime) * 1000;
      
      expect(stats.totalChecks).toBeGreaterThan(10); // Should have performed many checks
      expect(stats.successRate).toBeGreaterThan(90); // Should maintain high success rate
      expect(checksPerSecond).toBeGreaterThan(20); // Should handle at least 20 checks per second
      
      console.log(`High-frequency stress test: ${checksPerSecond.toFixed(1)} checks/second, ${stats.successRate.toFixed(1)}% success rate`);
    });

    it('should handle large-scale concurrent analysis', () => {
      const outputs = Array.from({ length: 5000 }, (_, i) => 
        `Concurrent analysis ${i}: Creating file: test${i}.js\nfunction test${i}() { return ${i}; }`
      );
      
      const startTime = performance.now();
      
      // Process all outputs concurrently (simulated)
      const results = outputs.map(output => analyzer.analyzeOutput(output));
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / outputs.length;
      
      // Should handle large-scale analysis efficiently
      expect(totalTime).toBeLessThan(2000); // Complete in under 2 seconds
      expect(averageTime).toBeLessThan(0.5); // Less than 0.5ms per analysis
      expect(results.every(result => result.activityType)).toBe(true); // All should have valid results
      
      const metrics = analyzer.getPerformanceMetrics();
      expect(metrics.totalAnalyses).toBe(outputs.length);
      
      console.log(`Large-scale concurrent test: ${outputs.length} analyses in ${totalTime.toFixed(1)}ms (${averageTime.toFixed(3)}ms each)`);
    });
  });
});