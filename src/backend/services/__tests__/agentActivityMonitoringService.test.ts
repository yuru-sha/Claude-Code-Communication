import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { AgentActivityMonitoringService, MonitoringServiceConfig } from '../agentActivityMonitoringService';
import { TerminalOutputMonitor } from '../terminalOutputMonitor';
import { ActivityAnalyzer } from '../activityAnalyzer';
// Removed unused imports

// Mock the dependencies
vi.mock('../terminalOutputMonitor');
vi.mock('../activityAnalyzer');

describe('AgentActivityMonitoringService', () => {
  let monitoringService: AgentActivityMonitoringService;
  let mockOnStatusUpdate: Mock;
  let mockTerminalMonitor: TerminalOutputMonitor;
  let mockActivityAnalyzer: ActivityAnalyzer;

  const mockConfig: Partial<MonitoringServiceConfig> = {
    activeCheckInterval: 1000,
    idleCheckInterval: 2000,
    maxRetries: 2,
    gracefulDegradationEnabled: true,
    performanceOptimizationEnabled: true,
    maxOutputBufferSize: 50
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockOnStatusUpdate = vi.fn();
    
    // Setup terminal monitor mock
    mockTerminalMonitor = new TerminalOutputMonitor();
    mockTerminalMonitor.monitorAllAgents = vi.fn();
    
    // Setup activity analyzer mock
    mockActivityAnalyzer = new ActivityAnalyzer();
    mockActivityAnalyzer.hasError = vi.fn().mockReturnValue(false);
    
    monitoringService = new AgentActivityMonitoringService(
      mockOnStatusUpdate, 
      mockConfig, 
      mockTerminalMonitor, 
      mockActivityAnalyzer
    );
  });

  afterEach(() => {
    if (monitoringService) {
      monitoringService.stop();
    }
  });

  describe('Service Initialization', () => {
    it('should initialize with default configuration', () => {
      const service = new AgentActivityMonitoringService(
        mockOnStatusUpdate, 
        undefined, 
        mockTerminalMonitor, 
        mockActivityAnalyzer
      );
      const stats = service.getStats();
      
      expect(stats.totalChecks).toBe(0);
      expect(stats.successfulChecks).toBe(0);
      expect(stats.failedChecks).toBe(0);
      expect(stats.activeAgents).toBe(0);
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        activeCheckInterval: 5000,
        maxRetries: 5
      };
      
      const service = new AgentActivityMonitoringService(
        mockOnStatusUpdate, 
        customConfig, 
        mockTerminalMonitor, 
        mockActivityAnalyzer
      );
      expect(service).toBeDefined();
    });
  });

  describe('Service Lifecycle', () => {
    it('should start monitoring service', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      monitoringService.start();
      const healthStatus = monitoringService.getHealthStatus();
      
      expect(healthStatus.isRunning).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Starting real-time monitoring service'));
      
      consoleSpy.mockRestore();
    });

    it('should stop monitoring service', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      monitoringService.start();
      monitoringService.stop();
      
      const healthStatus = monitoringService.getHealthStatus();
      expect(healthStatus.isRunning).toBe(false);
      
      consoleSpy.mockRestore();
    });

    it('should not start if already running', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      monitoringService.start();
      monitoringService.start(); // Try to start again
      
      expect(consoleSpy).toHaveBeenCalledWith('⚠️ Monitoring service is already running');
      
      consoleSpy.mockRestore();
    });

    it('should not stop if not running', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      monitoringService.stop(); // Try to stop when not running
      
      expect(consoleSpy).toHaveBeenCalledWith('⚠️ Monitoring service is not running');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Monitoring Functionality', () => {
    beforeEach(() => {
      // Mock successful monitoring results
      (mockTerminalMonitor.monitorAllAgents as Mock).mockResolvedValue([
        {
          agentName: 'worker1',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: 'Writing code',
            timestamp: new Date(),
            fileName: 'test.ts'
          },
          isIdle: false,
          lastOutput: 'console.log("test");',
          timestamp: new Date()
        },
        {
          agentName: 'worker2',
          hasNewActivity: false,
          isIdle: true,
          lastOutput: 'Human:',
          timestamp: new Date()
        }
      ]);
    });

    it('should process monitoring results and update agent statuses', async () => {
      // Directly test the monitoring logic by calling the private method via reflection
      const service = monitoringService as any;
      
      // Call the monitoring check directly
      await service.performMonitoringCheck();
      
      const stats = monitoringService.getStats();
      expect(stats.totalChecks).toBeGreaterThan(0);
      expect(mockOnStatusUpdate).toHaveBeenCalled();
      
      // Check that status updates were called with correct parameters
      const statusUpdateCalls = mockOnStatusUpdate.mock.calls;
      expect(statusUpdateCalls.length).toBeGreaterThan(0);
      
      // Verify agent status structure
      const [agentName, agentStatus] = statusUpdateCalls[0];
      expect(typeof agentName).toBe('string');
      expect(agentStatus).toHaveProperty('id');
      expect(agentStatus).toHaveProperty('name');
      expect(agentStatus).toHaveProperty('status');
      expect(agentStatus).toHaveProperty('lastActivity');
    });

    it('should handle working agent status correctly', async () => {
      const service = monitoringService as any;
      await service.performMonitoringCheck();
      
      const statusUpdateCalls = mockOnStatusUpdate.mock.calls;
      const workingAgentCall = statusUpdateCalls.find(([name, status]) => 
        name === 'worker1' && status.status === 'working'
      );
      
      expect(workingAgentCall).toBeDefined();
      if (workingAgentCall) {
        const [, status] = workingAgentCall;
        expect(status.currentActivity).toBe('Writing code');
        expect(status.workingOnFile).toBe('test.ts');
      }
    });

    it('should handle idle agent status correctly', async () => {
      const service = monitoringService as any;
      await service.performMonitoringCheck();
      
      const statusUpdateCalls = mockOnStatusUpdate.mock.calls;
      const idleAgentCall = statusUpdateCalls.find(([name, status]) => 
        name === 'worker2' && status.status === 'idle'
      );
      
      expect(idleAgentCall).toBeDefined();
      if (idleAgentCall) {
        const [, status] = idleAgentCall;
        expect(status.currentActivity).toBe('Waiting for input');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle terminal monitoring failures gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock terminal monitor to throw error
      (mockTerminalMonitor.monitorAllAgents as Mock).mockRejectedValue(
        new Error('Terminal access failed')
      );
      
      const service = monitoringService as any;
      await service.performMonitoringCheck();
      
      const stats = monitoringService.getStats();
      expect(stats.failedChecks).toBeGreaterThan(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error during monitoring check'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should implement graceful degradation on consecutive failures', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock consecutive failures
      (mockTerminalMonitor.monitorAllAgents as Mock).mockRejectedValue(
        new Error('Terminal unavailable')
      );
      
      monitoringService.start();
      
      // Wait for multiple check cycles
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Implementing graceful degradation'),
        expect.any(String)
      );
      
      consoleSpy.mockRestore();
    });

    it('should detect and handle error states in terminal output', async () => {
      // Mock error detection
      (mockActivityAnalyzer.hasError as Mock).mockReturnValue(true);
      
      (mockTerminalMonitor.monitorAllAgents as Mock).mockResolvedValue([
        {
          agentName: 'worker1',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: 'Error occurred',
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: 'Error: Something went wrong',
          timestamp: new Date()
        }
      ]);
      
      const service = monitoringService as any;
      await service.performMonitoringCheck();
      
      const statusUpdateCalls = mockOnStatusUpdate.mock.calls;
      const errorAgentCall = statusUpdateCalls.find(([name, status]) => 
        name === 'worker1' && status.status === 'error'
      );
      
      expect(errorAgentCall).toBeDefined();
    });
  });

  describe('Performance Optimization', () => {
    it('should optimize large terminal outputs', async () => {
      const largeOutput = 'line\n'.repeat(100); // 100 lines
      
      (mockTerminalMonitor.monitorAllAgents as Mock).mockResolvedValue([
        {
          agentName: 'worker1',
          hasNewActivity: false,
          isIdle: true,
          lastOutput: largeOutput,
          timestamp: new Date()
        }
      ]);
      
      const service = monitoringService as any;
      await service.performMonitoringCheck();
      
      const statusUpdateCalls = mockOnStatusUpdate.mock.calls;
      if (statusUpdateCalls.length > 0) {
        const [, status] = statusUpdateCalls[0];
        const outputLines = status.terminalOutput?.split('\n') || [];
        expect(outputLines.length).toBeLessThanOrEqual(mockConfig.maxOutputBufferSize! + 2); // +2 for truncation message
      }
    });

    it('should use adaptive check intervals based on agent activity', async () => {
      // Mock active agent
      (mockTerminalMonitor.monitorAllAgents as Mock).mockResolvedValue([
        {
          agentName: 'worker1',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: 'Active coding',
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: 'console.log("active");',
          timestamp: new Date()
        }
      ]);
      
      const service = monitoringService as any;
      await service.performMonitoringCheck();
      
      const stats = monitoringService.getStats();
      expect(stats.activeAgents).toBeGreaterThan(0);
      expect(stats.totalChecks).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Health Monitoring', () => {
    it('should track monitoring statistics correctly', async () => {
      (mockTerminalMonitor.monitorAllAgents as Mock).mockResolvedValue([]);
      
      // Add a small delay to ensure uptime is greater than 0
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const service = monitoringService as any;
      await service.performMonitoringCheck();
      
      const stats = monitoringService.getStats();
      expect(stats.totalChecks).toBeGreaterThan(0);
      expect(stats.successfulChecks).toBeGreaterThan(0);
      expect(stats.lastCheckTimestamp).toBeInstanceOf(Date);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should provide health status information', () => {
      monitoringService.start();
      
      const healthStatus = monitoringService.getHealthStatus();
      expect(healthStatus).toHaveProperty('isRunning', true);
      expect(healthStatus).toHaveProperty('uptime');
      expect(healthStatus).toHaveProperty('successRate');
      expect(healthStatus).toHaveProperty('averageCheckDuration');
      expect(healthStatus).toHaveProperty('activeAgents');
      expect(healthStatus).toHaveProperty('lastCheckAge');
    });

    it('should reset statistics correctly', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      monitoringService.resetStats();
      
      const stats = monitoringService.getStats();
      expect(stats.totalChecks).toBe(0);
      expect(stats.successfulChecks).toBe(0);
      expect(stats.failedChecks).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('📊'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const newConfig = {
        activeCheckInterval: 3000,
        maxRetries: 5
      };
      
      monitoringService.updateConfig(newConfig);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '🔧 Monitoring service configuration updated:',
        expect.objectContaining(newConfig)
      );
      
      consoleSpy.mockRestore();
    });

    it('should get agent states correctly', () => {
      const agentStates = monitoringService.getAgentStates();
      expect(agentStates).toBeInstanceOf(Map);
    });
  });
});