import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentStatus, AgentStatusType, ACTIVITY_DETECTION_CONFIG } from '../../../types';

// Mock the enhanced broadcastAgentStatusUpdate function for testing
describe('Enhanced broadcastAgentStatusUpdate', () => {
  let agentStatusCache: Record<string, AgentStatus> = {};
  let debounceTimers: Record<string, NodeJS.Timeout> = {};
  let mockEmit: ReturnType<typeof vi.fn>;

  // Mock implementation of the enhanced function
  const broadcastAgentStatusUpdate = (agentName: string, newStatus: AgentStatus | 'idle' | 'working' | 'offline', currentTask?: string) => {
    // 後方互換性のため、古い形式の呼び出しを新しい形式に変換
    let agentStatus: AgentStatus;
    
    if (typeof newStatus === 'string') {
      // 古い形式の呼び出し（後方互換性）
      agentStatus = {
        id: agentName,
        name: agentName.charAt(0).toUpperCase() + agentName.slice(1),
        status: newStatus as AgentStatusType,
        currentActivity: currentTask,
        lastActivity: new Date()
      };
    } else {
      // 新しい形式の呼び出し
      agentStatus = newStatus;
    }

    // 状態変更の検証
    if (!shouldUpdateStatus(agentName, agentStatus)) {
      return; // 変更がない場合はブロードキャストしない
    }

    // デバウンス処理
    if (debounceTimers[agentName]) {
      clearTimeout(debounceTimers[agentName]);
    }

    debounceTimers[agentName] = setTimeout(() => {
      // キャッシュを更新
      agentStatusCache[agentName] = { ...agentStatus };

      // 活動説明をフォーマット
      const formattedStatus = {
        ...agentStatus,
        currentActivity: formatActivityDescription(agentStatus)
      };

      mockEmit('agent-status-updated', formattedStatus);

      // デバウンスタイマーをクリア
      delete debounceTimers[agentName];
    }, ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
  };

  // 状態変更の検証ロジック
  const shouldUpdateStatus = (agentName: string, newStatus: AgentStatus): boolean => {
    const cached = agentStatusCache[agentName];
    
    if (!cached) {
      return true; // 初回の状態設定
    }

    // 重要な変更をチェック
    const hasStatusChange = cached.status !== newStatus.status;
    const hasActivityChange = cached.currentActivity !== newStatus.currentActivity;
    const hasFileChange = cached.workingOnFile !== newStatus.workingOnFile;
    const hasCommandChange = cached.executingCommand !== newStatus.executingCommand;
    
    // 最後の更新から十分な時間が経過しているかチェック
    const timeSinceLastUpdate = newStatus.lastActivity.getTime() - cached.lastActivity.getTime();
    const hasSignificantTimeGap = timeSinceLastUpdate > ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE;

    return hasStatusChange || hasActivityChange || hasFileChange || hasCommandChange || hasSignificantTimeGap;
  };

  // 活動説明のフォーマット
  const formatActivityDescription = (agentStatus: AgentStatus): string => {
    if (!agentStatus.currentActivity && !agentStatus.workingOnFile && !agentStatus.executingCommand) {
      return '';
    }

    let description = '';

    // 実行中のコマンドがある場合
    if (agentStatus.executingCommand) {
      description = `Executing: ${agentStatus.executingCommand}`;
    }
    // 作業中のファイルがある場合
    else if (agentStatus.workingOnFile) {
      description = `Working on: ${agentStatus.workingOnFile}`;
    }
    // 一般的な活動説明がある場合
    else if (agentStatus.currentActivity) {
      description = agentStatus.currentActivity;
    }

    // 説明が長すぎる場合は切り詰める
    const MAX_DESCRIPTION_LENGTH = 100;
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.substring(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
    }

    return description;
  };

  beforeEach(() => {
    agentStatusCache = {};
    debounceTimers = {};
    mockEmit = vi.fn();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clear any remaining timers
    Object.values(debounceTimers).forEach(timer => clearTimeout(timer));
  });

  describe('Backward Compatibility', () => {
    it('should handle old-style string status calls', () => {
      broadcastAgentStatusUpdate('worker1', 'working', 'Test task');
      
      expect(Object.keys(debounceTimers)).toContain('worker1');
      
      // Fast-forward time to trigger debounced call
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      
      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        currentActivity: 'Test task'
      }));
    });
  });

  describe('New AgentStatus Interface', () => {
    it('should handle new AgentStatus object calls', () => {
      const agentStatus: AgentStatus = {
        id: 'worker2',
        name: 'Worker2',
        status: 'working',
        currentActivity: 'Coding feature',
        lastActivity: new Date(),
        workingOnFile: 'src/test.ts'
      };

      broadcastAgentStatusUpdate('worker2', agentStatus);
      
      expect(Object.keys(debounceTimers)).toContain('worker2');
      
      // Fast-forward time to trigger debounced call
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      
      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        id: 'worker2',
        name: 'Worker2',
        status: 'working',
        currentActivity: 'Working on: src/test.ts'
      }));
    });
  });

  describe('Activity Description Formatting', () => {
    it('should format executing command description', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        executingCommand: 'npm test'
      };

      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      
      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: 'Executing: npm test'
      }));
    });

    it('should format working on file description', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        workingOnFile: 'src/components/Dashboard.tsx'
      };

      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      
      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: 'Working on: src/components/Dashboard.tsx'
      }));
    });

    it('should truncate long descriptions', () => {
      const longDescription = 'A'.repeat(150);
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        currentActivity: longDescription
      };

      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      
      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: 'A'.repeat(97) + '...'
      }));
    });
  });

  describe('Status Change Validation', () => {
    it('should not broadcast if no significant changes', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        currentActivity: 'Test task',
        lastActivity: new Date()
      };

      // First call should broadcast
      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).toHaveBeenCalledTimes(1);

      // Second call with same data should not broadcast
      mockEmit.mockClear();
      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('should broadcast if status changes', () => {
      const agentStatus1: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date()
      };

      const agentStatus2: AgentStatus = {
        ...agentStatus1,
        status: 'idle'
      };

      broadcastAgentStatusUpdate('worker1', agentStatus1);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).toHaveBeenCalledTimes(1);

      mockEmit.mockClear();
      broadcastAgentStatusUpdate('worker1', agentStatus2);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Debouncing', () => {
    it('should debounce rapid successive calls', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date()
      };

      // Make multiple rapid calls
      broadcastAgentStatusUpdate('worker1', { ...agentStatus, currentActivity: 'Task 1' });
      broadcastAgentStatusUpdate('worker1', { ...agentStatus, currentActivity: 'Task 2' });
      broadcastAgentStatusUpdate('worker1', { ...agentStatus, currentActivity: 'Task 3' });

      // Should only have one timer active
      expect(Object.keys(debounceTimers)).toHaveLength(1);

      // Fast-forward time
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      // Should only emit once with the latest data
      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: 'Task 3'
      }));
    });

    it('should handle debouncing across different agents', () => {
      const agentStatus1: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date()
      };

      const agentStatus2: AgentStatus = {
        id: 'worker2',
        name: 'Worker2',
        status: 'idle',
        lastActivity: new Date()
      };

      // Make calls for different agents
      broadcastAgentStatusUpdate('worker1', agentStatus1);
      broadcastAgentStatusUpdate('worker2', agentStatus2);
      broadcastAgentStatusUpdate('worker1', { ...agentStatus1, currentActivity: 'Updated task' });

      // Should have timers for both agents
      expect(Object.keys(debounceTimers)).toHaveLength(2);

      // Fast-forward time
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      // Should emit for both agents
      expect(mockEmit).toHaveBeenCalledTimes(2);
    });

    it('should clear timers after debounce period', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date()
      };

      broadcastAgentStatusUpdate('worker1', agentStatus);
      expect(Object.keys(debounceTimers)).toHaveLength(1);

      // Fast-forward time
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      // Timer should be cleared
      expect(Object.keys(debounceTimers)).toHaveLength(0);
    });
  });

  describe('Advanced Status Change Detection', () => {
    it('should detect file changes as significant updates', () => {
      const agentStatus1: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        workingOnFile: 'file1.ts'
      };

      const agentStatus2: AgentStatus = {
        ...agentStatus1,
        workingOnFile: 'file2.ts'
      };

      broadcastAgentStatusUpdate('worker1', agentStatus1);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).toHaveBeenCalledTimes(1);

      mockEmit.mockClear();
      broadcastAgentStatusUpdate('worker1', agentStatus2);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it('should detect command changes as significant updates', () => {
      const agentStatus1: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        executingCommand: 'npm install'
      };

      const agentStatus2: AgentStatus = {
        ...agentStatus1,
        executingCommand: 'npm test'
      };

      broadcastAgentStatusUpdate('worker1', agentStatus1);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).toHaveBeenCalledTimes(1);

      mockEmit.mockClear();
      broadcastAgentStatusUpdate('worker1', agentStatus2);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it('should handle time-based significant updates', () => {
      const baseTime = new Date();
      const agentStatus1: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: baseTime,
        currentActivity: 'Same task'
      };

      // First update
      broadcastAgentStatusUpdate('worker1', agentStatus1);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).toHaveBeenCalledTimes(1);

      mockEmit.mockClear();

      // Same status but after significant time gap
      const agentStatus2: AgentStatus = {
        ...agentStatus1,
        lastActivity: new Date(baseTime.getTime() + ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE + 1000)
      };

      broadcastAgentStatusUpdate('worker1', agentStatus2);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Activity Description Priority', () => {
    it('should prioritize executing command over file work', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        workingOnFile: 'test.ts',
        executingCommand: 'npm test'
      };

      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: 'Executing: npm test'
      }));
    });

    it('should prioritize file work over general activity', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        currentActivity: 'General work',
        workingOnFile: 'component.tsx'
      };

      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: 'Working on: component.tsx'
      }));
    });

    it('should use general activity when no specific work is detected', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        currentActivity: 'Analyzing code structure'
      };

      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: 'Analyzing code structure'
      }));
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle undefined agent status gracefully', () => {
      expect(() => {
        broadcastAgentStatusUpdate('worker1', undefined as any);
      }).not.toThrow();
    });

    it('should handle null agent status gracefully', () => {
      expect(() => {
        broadcastAgentStatusUpdate('worker1', null as any);
      }).not.toThrow();
    });

    it('should handle empty agent name', () => {
      const agentStatus: AgentStatus = {
        id: '',
        name: '',
        status: 'working',
        lastActivity: new Date()
      };

      expect(() => {
        broadcastAgentStatusUpdate('', agentStatus);
      }).not.toThrow();
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(200);
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        currentActivity: longDescription
      };

      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: expect.stringMatching(/\.\.\.$/), // Should end with ...
      }));

      const emittedStatus = mockEmit.mock.calls[0][1];
      expect(emittedStatus.currentActivity.length).toBeLessThanOrEqual(100);
    });

    it('should handle special characters in descriptions', () => {
      const specialDescription = 'Working on file: test<>&"\'file.js';
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        currentActivity: specialDescription
      };

      expect(() => {
        broadcastAgentStatusUpdate('worker1', agentStatus);
        vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);
      }).not.toThrow();

      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: specialDescription
      }));
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle rapid updates without memory leaks', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date()
      };

      // Simulate rapid updates
      for (let i = 0; i < 100; i++) {
        broadcastAgentStatusUpdate('worker1', {
          ...agentStatus,
          currentActivity: `Task ${i}`
        });
      }

      // Should only have one timer per agent
      expect(Object.keys(debounceTimers)).toHaveLength(1);

      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      // Should only emit once with the latest data
      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        currentActivity: 'Task 99'
      }));
    });

    it('should clean up timers for multiple agents', () => {
      const agents = ['worker1', 'worker2', 'worker3', 'boss1', 'president'];
      
      agents.forEach(agentName => {
        const agentStatus: AgentStatus = {
          id: agentName,
          name: agentName.charAt(0).toUpperCase() + agentName.slice(1),
          status: 'working',
          lastActivity: new Date()
        };

        broadcastAgentStatusUpdate(agentName, agentStatus);
      });

      expect(Object.keys(debounceTimers)).toHaveLength(agents.length);

      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      // All timers should be cleared
      expect(Object.keys(debounceTimers)).toHaveLength(0);
      expect(mockEmit).toHaveBeenCalledTimes(agents.length);
    });

    it('should handle concurrent updates to different agents', () => {
      const agents = ['worker1', 'worker2'];
      
      // Simulate concurrent updates
      agents.forEach(agentName => {
        for (let i = 0; i < 5; i++) {
          const agentStatus: AgentStatus = {
            id: agentName,
            name: agentName.charAt(0).toUpperCase() + agentName.slice(1),
            status: 'working',
            lastActivity: new Date(),
            currentActivity: `${agentName} task ${i}`
          };

          broadcastAgentStatusUpdate(agentName, agentStatus);
        }
      });

      expect(Object.keys(debounceTimers)).toHaveLength(agents.length);

      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      // Should emit once per agent with latest data
      expect(mockEmit).toHaveBeenCalledTimes(agents.length);
      
      const calls = mockEmit.mock.calls;
      expect(calls.some(([, status]) => status.currentActivity === 'worker1 task 4')).toBe(true);
      expect(calls.some(([, status]) => status.currentActivity === 'worker2 task 4')).toBe(true);
    });
  });

  describe('Integration with WebUI Events', () => {
    it('should emit correct event structure for WebUI consumption', () => {
      const agentStatus: AgentStatus = {
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: new Date(),
        currentActivity: 'Coding feature',
        workingOnFile: 'component.tsx',
        executingCommand: 'npm test',
        terminalOutput: 'console.log("test");'
      };

      broadcastAgentStatusUpdate('worker1', agentStatus);
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        lastActivity: expect.any(Date),
        currentActivity: expect.any(String)
      }));

      // Verify the emitted object has all required properties
      const emittedStatus = mockEmit.mock.calls[0][1];
      expect(emittedStatus).toHaveProperty('id');
      expect(emittedStatus).toHaveProperty('name');
      expect(emittedStatus).toHaveProperty('status');
      expect(emittedStatus).toHaveProperty('lastActivity');
      expect(emittedStatus).toHaveProperty('currentActivity');
    });

    it('should maintain backward compatibility with old event format', () => {
      // Test old-style call
      broadcastAgentStatusUpdate('worker1', 'working', 'Legacy task');
      vi.advanceTimersByTime(ACTIVITY_DETECTION_CONFIG.ACTIVITY_DEBOUNCE);

      expect(mockEmit).toHaveBeenCalledWith('agent-status-updated', expect.objectContaining({
        id: 'worker1',
        name: 'Worker1',
        status: 'working',
        currentActivity: 'Legacy task'
      }));
    });
  });
});