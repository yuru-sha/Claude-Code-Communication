import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TerminalOutputMonitor, AgentTarget } from '../terminalOutputMonitor.js';
import { ActivityType } from '../../../types/index.js';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

// Mock the activity patterns service
vi.mock('../activityPatterns.js', () => ({
  activityPatterns: {
    findBestMatch: vi.fn(),
    getPatternsByType: vi.fn()
  }
}));

import { exec } from 'child_process';
import { activityPatterns } from '../activityPatterns.js';

const mockExec = vi.mocked(exec);
const mockActivityPatterns = vi.mocked(activityPatterns);

describe('TerminalOutputMonitor', () => {
  let monitor: TerminalOutputMonitor;
  let testAgent: AgentTarget;

  beforeEach(() => {
    monitor = new TerminalOutputMonitor();
    testAgent = { name: 'worker1', target: 'multiagent:0.1' };
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup default mock responses
    mockActivityPatterns.findBestMatch.mockReturnValue(null);
    mockActivityPatterns.getPatternsByType.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Terminal Output Capture', () => {
    it('should capture terminal output successfully', async () => {
      const mockOutput = 'Human: Hello\nAssistant: Working on task...';
      
      // Mock successful exec call
      mockExec.mockImplementation((command, callback) => {
        expect(command).toBe('tmux capture-pane -t "multiagent:0.1" -p');
        callback!(null, { stdout: mockOutput, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.agentName).toBe('worker1');
      expect(result.lastOutput).toBe(mockOutput);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should handle terminal capture timeout', async () => {
      // Mock exec to never call callback (simulating timeout)
      mockExec.mockImplementation(() => {
        // Don't call callback to simulate hanging
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.agentName).toBe('worker1');
      expect(result.lastOutput).toBe('');
      expect(result.hasNewActivity).toBe(false);
    }, 10000); // Increase timeout for this test

    it('should handle terminal capture errors gracefully', async () => {
      // Mock exec to return error
      mockExec.mockImplementation((command, callback) => {
        callback!(new Error('tmux session not found'), null as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.agentName).toBe('worker1');
      expect(result.lastOutput).toBe('');
      expect(result.hasNewActivity).toBe(false);
    });
  });

  describe('Activity Detection', () => {
    it('should detect new activity when output changes', async () => {
      const initialOutput = 'Human: Hello';
      const newOutput = 'Human: Hello\nAssistant: Creating file: test.ts';
      
      // Mock pattern matching for coding activity
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /Creating file:/,
        activityType: 'coding',
        priority: 10
      });

      // First call - establish baseline
      mockExec.mockImplementationOnce((command, callback) => {
        callback!(null, { stdout: initialOutput, stderr: '' } as any);
      });
      
      await monitor.monitorAgentActivity(testAgent);

      // Second call - detect new activity
      mockExec.mockImplementationOnce((command, callback) => {
        callback!(null, { stdout: newOutput, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.hasNewActivity).toBe(true);
      expect(result.activityInfo).toBeDefined();
      expect(result.activityInfo!.activityType).toBe('coding');
      expect(result.activityInfo!.description).toContain('Writing code');
    });

    it('should not detect activity when output is unchanged', async () => {
      const sameOutput = 'Human: Hello\nAssistant: Waiting...';
      
      // Mock exec to return same output both times
      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: sameOutput, stderr: '' } as any);
      });

      // First call
      await monitor.monitorAgentActivity(testAgent);
      
      // Second call with same output
      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.hasNewActivity).toBe(false);
      expect(result.activityInfo).toBeUndefined();
    });

    it('should extract file names from coding activity', async () => {
      const outputWithFile = 'Human: Hello\nAssistant: Creating file: src/components/Button.tsx';
      
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /Creating file:/,
        activityType: 'coding',
        priority: 10
      });

      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: outputWithFile, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.activityInfo?.fileName).toBe('src/components/Button.tsx');
    });

    it('should extract commands from command execution activity', async () => {
      const outputWithCommand = 'Human: Hello\nAssistant: $ npm install react';
      
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /\$ /,
        activityType: 'command_execution',
        priority: 8
      });

      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: outputWithCommand, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.activityInfo?.command).toBe('npm install react');
    });
  });

  describe('Idle Detection', () => {
    it('should detect idle state from Human: prompt', async () => {
      const idleOutput = 'Assistant: Task completed.\nHuman: ';
      
      // Mock idle pattern detection
      mockActivityPatterns.getPatternsByType.mockReturnValue([
        {
          pattern: /Human:\s*$/m,
          activityType: 'idle',
          priority: 2
        }
      ]);

      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: idleOutput, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.isIdle).toBe(true);
    });

    it('should detect idle state from timeout', async () => {
      const workingOutput = 'Assistant: Working on task...';
      
      // Mock no idle patterns found
      mockActivityPatterns.getPatternsByType.mockReturnValue([]);
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /Working on task/,
        activityType: 'thinking',
        priority: 5
      });

      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: workingOutput, stderr: '' } as any);
      });

      // First call to establish activity
      await monitor.monitorAgentActivity(testAgent);
      
      // Manually set an old timestamp to simulate timeout
      const oldTimestamp = new Date(Date.now() - 400000); // 6+ minutes ago
      (monitor as any).lastActivityDetected.set('worker1', oldTimestamp);

      // Mock no new activity for second call
      mockActivityPatterns.findBestMatch.mockReturnValue(null);
      
      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.isIdle).toBe(true);
    });

    it('should not be idle when recent activity detected', async () => {
      const activeOutput = 'Assistant: Creating file: test.ts';
      
      mockActivityPatterns.getPatternsByType.mockReturnValue([]);
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /Creating file:/,
        activityType: 'coding',
        priority: 10
      });

      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: activeOutput, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.isIdle).toBe(false);
      expect(result.hasNewActivity).toBe(true);
    });
  });

  describe('Multiple Agent Monitoring', () => {
    it('should monitor all agents successfully', async () => {
      mockExec.mockImplementation((command, callback) => {
        const agentName = command.includes('president') ? 'president' : 
                         command.includes('0.0') ? 'boss1' :
                         command.includes('0.1') ? 'worker1' :
                         command.includes('0.2') ? 'worker2' : 'worker3';
        
        callback!(null, { stdout: `${agentName} output`, stderr: '' } as any);
      });

      const results = await monitor.monitorAllAgents();
      
      expect(results).toHaveLength(5);
      expect(results.map(r => r.agentName)).toEqual([
        'president', 'boss1', 'worker1', 'worker2', 'worker3'
      ]);
    });

    it('should handle individual agent failures gracefully', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('multiagent:0.1')) { // worker1 target
          callback!(new Error('Session not found'), null as any);
        } else {
          callback!(null, { stdout: 'Working...', stderr: '' } as any);
        }
      });

      const results = await monitor.monitorAllAgents();
      
      expect(results).toHaveLength(5);
      
      // Failed agent should have error state - empty output but still considered activity change
      const worker1Result = results.find(r => r.agentName === 'worker1');
      expect(worker1Result?.lastOutput).toBe('');
      expect(worker1Result?.isIdle).toBe(true);
      
      // Other agents should work normally
      const otherResults = results.filter(r => r.agentName !== 'worker1');
      expect(otherResults.every(r => r.lastOutput === 'Working...')).toBe(true);
    });
  });

  describe('State Management', () => {
    it('should track activity timestamps correctly', async () => {
      const activeOutput = 'Assistant: Creating file: test.ts';
      
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /Creating file:/,
        activityType: 'coding',
        priority: 10
      });

      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: activeOutput, stderr: '' } as any);
      });

      await monitor.monitorAgentActivity(testAgent);
      
      const timestamp = monitor.getLastActivityTimestamp('worker1');
      expect(timestamp).toBeInstanceOf(Date);
      expect(Date.now() - timestamp!.getTime()).toBeLessThan(1000); // Within 1 second
    });

    it('should reset agent state correctly', async () => {
      const output = 'Some output';
      
      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: output, stderr: '' } as any);
      });

      await monitor.monitorAgentActivity(testAgent);
      
      expect(monitor.getLastOutput('worker1')).toBe(output);
      
      monitor.resetAgentState('worker1');
      
      expect(monitor.getLastOutput('worker1')).toBeUndefined();
      expect(monitor.getLastActivityTimestamp('worker1')).toBeUndefined();
    });

    it('should provide monitoring statistics', async () => {
      const stats = monitor.getMonitoringStats();
      
      expect(stats.monitoredAgents).toBe(5);
      expect(stats.agentsWithActivity).toBeGreaterThanOrEqual(0);
      expect(stats.agentsWithRecentActivity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Output Processing', () => {
    it('should truncate large outputs appropriately', async () => {
      // Create a very large output
      const largeOutput = 'Line\n'.repeat(300);
      
      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: largeOutput, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      // Should be truncated to buffer size (200 lines)
      const lines = result.lastOutput.split('\n');
      expect(lines.length).toBeLessThanOrEqual(200);
    });

    it('should generate appropriate activity descriptions', async () => {
      const codingOutput = 'Assistant: function test() { return true; }';
      
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /function/,
        activityType: 'coding',
        priority: 10
      });

      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: codingOutput, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.activityInfo?.description).toContain('Writing code');
      expect(result.activityInfo?.activityType).toBe('coding');
    });

    it('should handle output with special characters and encoding', async () => {
      const specialOutput = 'Creating file: test.js\n\x1b[32m✓\x1b[0m Success\n🎉 Done!';
      
      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: specialOutput, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.lastOutput).toBeTruthy();
      expect(result.lastOutput.length).toBeGreaterThan(0);
    });

    it('should extract file names from various patterns', async () => {
      const testCases = [
        { output: 'fsWrite("src/test.tsx", content)', expected: 'src/test.tsx' },
        { output: 'Creating file: utils/helper.js', expected: 'utils/helper.js' },
        { output: 'touch newfile.py', expected: 'newfile.py' },
        { output: 'Working with "styles/main.css"', expected: 'styles/main.css' }
      ];

      for (const testCase of testCases) {
        mockActivityPatterns.findBestMatch.mockReturnValue({
          pattern: /Creating|fsWrite|touch/,
          activityType: 'file_operation',
          priority: 10
        });

        mockExec.mockImplementation((command, callback) => {
          callback!(null, { stdout: testCase.output, stderr: '' } as any);
        });

        const result = await monitor.monitorAgentActivity(testAgent);
        expect(result.activityInfo?.fileName).toBe(testCase.expected);
      }
    });

    it('should extract commands from various patterns', async () => {
      const testCases = [
        { output: '$ git status', expected: 'git status' },
        { output: 'Running: npm test --coverage', expected: 'npm test --coverage' },
        { output: 'executeBash with command "ls -la"', expected: 'ls -la' }
      ];

      for (const testCase of testCases) {
        mockActivityPatterns.findBestMatch.mockReturnValue({
          pattern: /\$|Running|executeBash/,
          activityType: 'command_execution',
          priority: 8
        });

        mockExec.mockImplementation((command, callback) => {
          callback!(null, { stdout: testCase.output, stderr: '' } as any);
        });

        const result = await monitor.monitorAgentActivity(testAgent);
        expect(result.activityInfo?.command).toBe(testCase.expected);
      }
    });

    it('should handle mixed content with multiple patterns', async () => {
      const mixedOutput = `
        Creating file: src/components/Button.tsx
        function Button() { return <div>Click</div>; }
        $ npm test
        ✓ All tests passed
      `;
      
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /Creating file/,
        activityType: 'coding',
        priority: 10
      });

      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: mixedOutput, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.activityInfo?.activityType).toBe('coding');
      expect(result.activityInfo?.fileName).toBe('src/components/Button.tsx');
      expect(result.activityInfo?.command).toBe('npm test');
    });
  });

  describe('Performance Optimization', () => {
    it('should use circular buffers efficiently', async () => {
      const outputs = Array.from({ length: 10 }, (_, i) => `Output ${i}\n`);
      
      for (const output of outputs) {
        mockExec.mockImplementation((command, callback) => {
          callback!(null, { stdout: output, stderr: '' } as any);
        });

        await monitor.monitorAgentActivity(testAgent);
      }

      const metrics = monitor.getPerformanceMetrics();
      expect(metrics.totalOutputsProcessed).toBe(outputs.length);
      expect(metrics.bufferHits).toBeGreaterThan(0);
    });

    it('should track performance metrics accurately', async () => {
      const testOutputs = [
        'Small output',
        'Medium length output with more content',
        'Very long output with lots of content that should be processed efficiently by the monitoring system'
      ];

      for (const output of testOutputs) {
        mockExec.mockImplementation((command, callback) => {
          callback!(null, { stdout: output, stderr: '' } as any);
        });

        await monitor.monitorAgentActivity(testAgent);
      }

      const metrics = monitor.getPerformanceMetrics();
      expect(metrics.totalOutputsProcessed).toBe(testOutputs.length);
      expect(metrics.averageOutputSize).toBeGreaterThan(0);
      expect(metrics.memoryUsageMB).toBeGreaterThanOrEqual(0);
      expect(metrics.bufferEfficiency).toBeGreaterThanOrEqual(0);
      expect(metrics.bufferEfficiency).toBeLessThanOrEqual(100);
    });

    it('should handle memory cleanup operations', async () => {
      // Generate some data first
      for (let i = 0; i < 5; i++) {
        mockExec.mockImplementation((command, callback) => {
          callback!(null, { stdout: `Test output ${i}`, stderr: '' } as any);
        });

        await monitor.monitorAgentActivity(testAgent);
      }

      const initialMetrics = monitor.getPerformanceMetrics();
      expect(initialMetrics.totalOutputsProcessed).toBe(5);

      // Cleanup should not throw
      expect(() => monitor.cleanup()).not.toThrow();
    });

    it('should optimize output processing for large data', async () => {
      const largeOutput = 'x'.repeat(50000); // 50KB of data
      
      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: largeOutput, stderr: '' } as any);
      });

      const startTime = Date.now();
      const result = await monitor.monitorAgentActivity(testAgent);
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000);
      
      // Should truncate large outputs
      expect(result.lastOutput.length).toBeLessThan(largeOutput.length);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary terminal access failures', async () => {
      let callCount = 0;
      mockExec.mockImplementation((command, callback) => {
        callCount++;
        if (callCount === 1) {
          callback!(new Error('Temporary failure'), null as any);
        } else {
          callback!(null, { stdout: 'Recovery successful', stderr: '' } as any);
        }
      });

      // First call should succeed after retry
      const result1 = await monitor.monitorAgentActivity(testAgent);
      expect(result1.lastOutput).toBe('Recovery successful');
      expect(result1.isIdle).toBe(false);

      // Second call should succeed immediately
      const result2 = await monitor.monitorAgentActivity(testAgent);
      expect(result2.lastOutput).toBe('Recovery successful');
    });

    it('should handle concurrent monitoring requests', async () => {
      mockExec.mockImplementation((command, callback) => {
        // Simulate async delay
        setTimeout(() => {
          callback!(null, { stdout: 'Concurrent test', stderr: '' } as any);
        }, 10);
      });

      // Start multiple concurrent monitoring operations
      const promises = Array.from({ length: 5 }, () => 
        monitor.monitorAgentActivity(testAgent)
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.agentName).toBe(testAgent.name);
        expect(result.timestamp).toBeInstanceOf(Date);
      });
    });

    it('should maintain state consistency during errors', async () => {
      // First successful call
      mockExec.mockImplementationOnce((command, callback) => {
        callback!(null, { stdout: 'Initial success', stderr: '' } as any);
      });

      const result1 = await monitor.monitorAgentActivity(testAgent);
      expect(result1.lastOutput).toBe('Initial success');

      // Second call fails consistently (all retries fail)
      mockExec.mockImplementation((command, callback) => {
        callback!(new Error('Network error'), null as any);
      });

      const result2 = await monitor.monitorAgentActivity(testAgent);
      expect(result2.lastOutput).toBe('');
      expect(result2.isIdle).toBe(true);

      // State should still be accessible
      expect(monitor.getLastOutput(testAgent.name)).toBe('');
    });
  });

  describe('Advanced Activity Detection', () => {
    it('should detect activity changes with context', async () => {
      const initialOutput = 'Human: Please create a new component';
      const updatedOutput = 'Human: Please create a new component\nAssistant: Creating file: Button.tsx';

      // First call - establish baseline
      mockExec.mockImplementationOnce((command, callback) => {
        callback!(null, { stdout: initialOutput, stderr: '' } as any);
      });

      await monitor.monitorAgentActivity(testAgent);

      // Second call - detect new activity
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /Creating file/,
        activityType: 'coding',
        priority: 10
      });

      mockExec.mockImplementationOnce((command, callback) => {
        callback!(null, { stdout: updatedOutput, stderr: '' } as any);
      });

      const result = await monitor.monitorAgentActivity(testAgent);
      
      expect(result.hasNewActivity).toBe(true);
      expect(result.activityInfo?.activityType).toBe('coding');
      expect(result.activityInfo?.fileName).toBe('Button.tsx');
    });

    it('should handle incremental output changes', async () => {
      const outputs = [
        'Starting task...',
        'Starting task...\nAnalyzing requirements...',
        'Starting task...\nAnalyzing requirements...\nCreating file: component.tsx',
        'Starting task...\nAnalyzing requirements...\nCreating file: component.tsx\nfunction Component() { return <div>Hello</div>; }'
      ];

      for (let i = 0; i < outputs.length; i++) {
        mockActivityPatterns.findBestMatch.mockReturnValue(
          i >= 2 ? { pattern: /Creating file/, activityType: 'coding', priority: 10 } : null
        );

        mockExec.mockImplementation((command, callback) => {
          callback!(null, { stdout: outputs[i], stderr: '' } as any);
        });

        const result = await monitor.monitorAgentActivity(testAgent);
        
        if (i >= 2) {
          expect(result.hasNewActivity).toBe(true);
          expect(result.activityInfo?.activityType).toBe('coding');
        }
      }
    });

    it('should detect idle patterns correctly', async () => {
      const idlePatterns = [
        'Human: ',
        'Human:\n',
        '? for shortcuts',
        'Waiting for input...',
        'Task completed.\nHuman: '
      ];

      for (const pattern of idlePatterns) {
        mockActivityPatterns.getPatternsByType.mockReturnValue([
          { pattern: /Human:\s*$|shortcuts|\? for shortcuts/m, activityType: 'idle', priority: 1 }
        ]);

        mockExec.mockImplementation((command, callback) => {
          callback!(null, { stdout: pattern, stderr: '' } as any);
        });

        const result = await monitor.monitorAgentActivity(testAgent);
        expect(result.isIdle).toBe(true);
      }
    });

    it('should handle timeout-based idle detection', async () => {
      const workingOutput = 'Assistant: Working on complex task...';
      
      mockActivityPatterns.findBestMatch.mockReturnValue({
        pattern: /Working on/,
        activityType: 'thinking',
        priority: 5
      });

      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: workingOutput, stderr: '' } as any);
      });

      // First call establishes activity
      await monitor.monitorAgentActivity(testAgent);
      
      // Manually set old timestamp to simulate timeout
      const oldTimestamp = new Date(Date.now() - 400000); // 6+ minutes ago
      (monitor as any).lastActivityDetected.set(testAgent.name, oldTimestamp);

      // Mock no new activity for second call
      mockActivityPatterns.findBestMatch.mockReturnValue(null);
      
      const result = await monitor.monitorAgentActivity(testAgent);
      expect(result.isIdle).toBe(true);
    });
  });

  describe('Resource Management', () => {
    it('should cleanup resources properly', () => {
      // Generate some monitoring data
      monitor.resetAgentState(testAgent.name);
      
      expect(() => monitor.cleanup()).not.toThrow();
      
      // After cleanup, stats should reflect clean state
      const stats = monitor.getMonitoringStats();
      expect(stats.agentsWithActivity).toBe(0);
    });

    it('should reset individual agent state', async () => {
      // Establish some state
      mockExec.mockImplementation((command, callback) => {
        callback!(null, { stdout: 'Some output', stderr: '' } as any);
      });

      await monitor.monitorAgentActivity(testAgent);
      expect(monitor.getLastOutput(testAgent.name)).toBeTruthy();

      // Reset state
      monitor.resetAgentState(testAgent.name);
      expect(monitor.getLastOutput(testAgent.name)).toBeUndefined();
      expect(monitor.getLastActivityTimestamp(testAgent.name)).toBeUndefined();
    });

    it('should reset all monitoring state', async () => {
      // Establish state for multiple agents
      const agents = [
        { name: 'worker1', target: 'multiagent:0.1' },
        { name: 'worker2', target: 'multiagent:0.2' }
      ];

      for (const agent of agents) {
        mockExec.mockImplementation((command, callback) => {
          callback!(null, { stdout: `Output for ${agent.name}`, stderr: '' } as any);
        });

        await monitor.monitorAgentActivity(agent);
      }

      // Verify state exists
      expect(monitor.getLastOutput('worker1')).toBeTruthy();
      expect(monitor.getLastOutput('worker2')).toBeTruthy();

      // Reset all state
      monitor.resetAllState();

      // Verify state is cleared
      expect(monitor.getLastOutput('worker1')).toBeUndefined();
      expect(monitor.getLastOutput('worker2')).toBeUndefined();
    });
  });
});