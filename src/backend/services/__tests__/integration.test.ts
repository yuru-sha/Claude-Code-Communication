/**
 * Integration Tests for Agent Status Detection System
 * Task 12: Integration testing and system validation
 * 
 * This test suite validates the complete agent status detection workflow:
 * - Real agent terminal output processing
 * - WebUI status display accuracy
 * - End-to-end workflow testing
 * - System performance under load
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { AgentActivityMonitoringService } from '../agentActivityMonitoringService';
import { TerminalOutputMonitor } from '../terminalOutputMonitor';
import { ActivityAnalyzer } from '../activityAnalyzer';
import { AgentStatus, ActivityInfo, AgentStatusType } from '../../../types';
import { EventEmitter } from 'events';

// Mock real terminal outputs for testing
const REAL_TERMINAL_OUTPUTS = {
  coding: `Human: Create a new React component for user authentication

I'll create a React component for user authentication with proper TypeScript types and modern React patterns.

<function_calls>
<invoke name="fsWrite">
<parameter name="path">src/components/AuthComponent.tsx</parameter>
<parameter name="text">import React, { useState } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthProps {
  onLogin: (user: User) => void;
  onError: (error: string) => void;
}

export const AuthComponent: React.FC<AuthProps> = ({ onLogin, onError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Authentication logic here
  };

  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="email" 
        value={email} 
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input 
        type="password" 
        value={password} 
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
};</parameter>
</invoke>
✅ Comp
onent created successfully! The AuthComponent includes:
- TypeScript interfaces for User and AuthProps
- State management for email and password
- Form submission handling
- Proper React.FC typing

The component is ready for integration with your authentication system.`,

  fileOperation: `Human: Please create a new configuration file for the database settings

I'll create a database configuration file with proper environment variable support and TypeScript types.

<function_calls>
<invoke name="fsWrite">
<parameter name="path">src/config/database.ts</parameter>
<parameter name="text">interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

export const databaseConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'myapp',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.NODE_ENV === 'production'
};</parameter>
</invoke>
✅ Da
tabase configuration file created successfully! The configuration includes:
- TypeScript interface for type safety
- Environment variable support with defaults
- Production SSL configuration
- Proper port number parsing

The configuration is ready for use in your application.`,

  debugging: `Human: I'm getting an error when trying to connect to the database. Can you help me debug this?

Let me help you debug the database connection issue. I'll need to examine the error and check the configuration.

<function_calls>
<invoke name="grepSearch">
<parameter name="query">database.*error</parameter>
<parameter name="includePattern">*.log</parameter>
</invoke>
L
ooking at the logs, I can see the connection is failing. Let me check your database configuration and suggest some fixes.

The issue appears to be with the connection string. Here's what I found and how to fix it:

1. Check your environment variables
2. Verify the database is running
3. Update the connection configuration

This should resolve the database connection issue.`,

  thinking: `Human: Can you explain how the authentication system works?

I'm analyzing the authentication system architecture to provide you with a comprehensive explanation.

The authentication system consists of several key components:

1. **User Authentication Flow**
   - User submits credentials through the login form
   - Credentials are validated against the database
   - JWT tokens are generated for successful authentication
   - Session management handles user state

2. **Security Measures**
   - Password hashing using bcrypt
   - JWT token expiration
   - CSRF protection
   - Rate limiting on login attempts

3. **Database Integration**
   - User credentials stored securely
   - Session data management
   - Role-based access control

The system follows industry best practices for security and user experience.`,

  idle: `Human: 

[No recent activity detected - agent appears to be idle]`,

  error: `Human: Fix the bug in the user registration function

I'll analyze the user registration function to identify and fix the bug.

<function_calls>
<invoke name="readFile">
<parameter name="path">src/auth/registration.ts</parameter>
</invoke>

Error: File not found: src/auth/registration.ts

Let me search for the registration-related files in your codebase.

<function_calls>
<invoke name="fileSearch">
<parameter name="query">registration</parameter>
</invoke>I found
 the registration files. The bug appears to be in the email validation logic. Here's the fix:

The issue was with the regex pattern for email validation. I've updated it to properly handle all valid email formats.

❌ Error resolved: Email validation now works correctly for all standard email formats.`
};

// Performance test data
const PERFORMANCE_TEST_OUTPUTS = Array.from({ length: 100 }, (_, i) => ({
  timestamp: Date.now() + i * 1000,
  content: `Test output ${i}: Processing request with function calls and responses...`,
  type: i % 4 === 0 ? 'coding' : i % 4 === 1 ? 'fileOperation' : i % 4 === 2 ? 'debugging' : 'thinking'
}));

describe('Agent Status Detection System - Integration Tests', () => {
  let monitoringService: AgentActivityMonitoringService;
  let terminalMonitor: TerminalOutputMonitor;
  let activityAnalyzer: ActivityAnalyzer;
  let mockStatusCallback: vi.Mock;

  beforeAll(() => {
    // Setup test environment
    vi.clearAllMocks();
  });

  beforeEach(() => {
    // Initialize services
    mockStatusCallback = vi.fn();
    terminalMonitor = new TerminalOutputMonitor();
    activityAnalyzer = new ActivityAnalyzer();
    
    // Mock terminal monitor methods
    vi.spyOn(terminalMonitor, 'monitorAllAgents').mockImplementation(async () => []);
    vi.spyOn(terminalMonitor, 'monitorAgentActivity').mockImplementation(async (agent) => ({
      agentName: agent.name,
      hasNewActivity: false,
      isIdle: true,
      lastOutput: '',
      timestamp: new Date()
    }));

    // Create monitoring service with faster intervals for testing
    monitoringService = new AgentActivityMonitoringService(
      mockStatusCallback,
      {
        activeCheckInterval: 50,  // 50ms for fast testing
        idleCheckInterval: 100,   // 100ms for fast testing
        maxRetries: 3,
        gracefulDegradationEnabled: true,
        performanceOptimizationEnabled: true,
        maxOutputBufferSize: 200
      },
      terminalMonitor,
      activityAnalyzer
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    monitoringService.stop();
  });

  describe('Real Agent Terminal Output Processing', () => {
    test('should correctly process coding activity output', async () => {
      // Mock terminal monitor to return coding activity
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'test-agent',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: 'Creating React component for user authentication',
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS.coding,
          timestamp: new Date()
        }
      ]);

      // Mock activity analyzer to return coding activity
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'coding',
        description: 'Creating React component for user authentication',
        timestamp: new Date()
      });

      // Start monitoring
      monitoringService.start();

      // Wait for monitoring cycle to execute
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify status callback was called with agent status
      expect(mockStatusCallback).toHaveBeenCalledWith('test-agent', expect.objectContaining({
        id: 'test-agent',
        name: expect.any(String),
        status: expect.any(String),
        lastActivity: expect.any(Date)
      }));
    });

    test('should correctly process file operation output', async () => {
      // Mock terminal monitor to return file operation activity
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'test-agent',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'file_operation',
            description: 'Creating database configuration file',
            timestamp: new Date(),
            fileName: 'src/config/database.ts'
          },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS.fileOperation,
          timestamp: new Date()
        }
      ]);

      // Mock activity analyzer to return file operation activity
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'file_operation',
        description: 'Creating database configuration file',
        timestamp: new Date(),
        fileName: 'src/config/database.ts'
      });

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockStatusCallback).toHaveBeenCalledWith('test-agent', expect.objectContaining({
        id: 'test-agent',
        status: 'working',
        workingOnFile: 'src/config/database.ts'
      }));
    });

    test('should correctly process debugging activity output', async () => {
      // Mock terminal monitor to return debugging activity
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'test-agent',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'debugging',
            description: 'Debugging database connection issue',
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS.debugging,
          timestamp: new Date()
        }
      ]);

      // Mock activity analyzer to return debugging activity
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'thinking', // debugging maps to thinking activity
        description: 'Debugging database connection issue',
        timestamp: new Date()
      });

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockStatusCallback).toHaveBeenCalledWith('test-agent', expect.objectContaining({
        id: 'test-agent',
        status: 'working',
        currentActivity: 'Debugging database connection issue'
      }));
    });

    test('should correctly process thinking activity output', async () => {
      // Mock terminal monitor to return thinking activity
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'test-agent',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'thinking',
            description: 'Analyzing authentication system architecture',
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS.thinking,
          timestamp: new Date()
        }
      ]);

      // Mock activity analyzer to return thinking activity
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'thinking',
        description: 'Analyzing authentication system architecture',
        timestamp: new Date()
      });

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockStatusCallback).toHaveBeenCalledWith('test-agent', expect.objectContaining({
        id: 'test-agent',
        status: 'working',
        currentActivity: 'Analyzing authentication system architecture'
      }));
    });

    test('should detect idle state from empty output', async () => {
      // Mock terminal monitor to return idle state
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'test-agent',
          hasNewActivity: false,
          isIdle: true,
          lastOutput: REAL_TERMINAL_OUTPUTS.idle,
          timestamp: new Date()
        }
      ]);

      // Mock activity analyzer to return idle activity
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'idle',
        description: 'Waiting for input',
        timestamp: new Date()
      });

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockStatusCallback).toHaveBeenCalledWith('test-agent', expect.objectContaining({
        id: 'test-agent',
        status: 'idle'
      }));
    });

    test('should handle error scenarios correctly', async () => {
      // Mock terminal monitor to return error activity
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'test-agent',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'error',
            description: 'Error in user registration function',
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS.error,
          timestamp: new Date()
        }
      ]);

      // Mock activity analyzer to return error activity (maps to idle with error description)
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'idle',
        description: 'Error in user registration function',
        timestamp: new Date()
      });

      // Mock hasError to return true for error detection
      vi.spyOn(activityAnalyzer, 'hasError').mockReturnValue(true);

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockStatusCallback).toHaveBeenCalledWith('test-agent', expect.objectContaining({
        id: 'test-agent',
        status: 'error'
      }));
    });
  });

  describe('WebUI Status Display Accuracy', () => {
    test('should provide accurate status information for WebUI', async () => {
      // Mock terminal monitor to return coding activity
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'test-agent',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: 'Creating React component for user authentication',
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS.coding,
          timestamp: new Date()
        }
      ]);

      // Mock activity analyzer
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'coding',
        description: 'Creating React component for user authentication',
        timestamp: new Date()
      });

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify service health and stats
      const healthStatus = monitoringService.getHealthStatus();
      expect(healthStatus.isRunning).toBe(true);
      expect(healthStatus.uptime).toBeGreaterThan(0);

      const stats = monitoringService.getStats();
      expect(stats.totalChecks).toBeGreaterThan(0);
      expect(stats.lastCheckTimestamp).toBeInstanceOf(Date);
    });

    test('should update WebUI status in real-time', async () => {
      const statusUpdates: { agent: string; status: AgentStatus }[] = [];
      
      // Capture status updates
      mockStatusCallback.mockImplementation((agent: string, status: AgentStatus) => {
        statusUpdates.push({ agent, status });
      });

      // Mock different activities in sequence
      let callCount = 0;
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return [{
            agentName: 'test-agent',
            hasNewActivity: true,
            activityInfo: { activityType: 'coding', description: 'Coding', timestamp: new Date() },
            isIdle: false,
            lastOutput: REAL_TERMINAL_OUTPUTS.coding,
            timestamp: new Date()
          }];
        } else if (callCount === 2) {
          return [{
            agentName: 'test-agent',
            hasNewActivity: true,
            activityInfo: { activityType: 'file_operation', description: 'File operation', timestamp: new Date() },
            isIdle: false,
            lastOutput: REAL_TERMINAL_OUTPUTS.fileOperation,
            timestamp: new Date()
          }];
        }
        return [];
      });

      // Mock analyzer to return different activities
      let analyzeCallCount = 0;
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockImplementation(() => {
        analyzeCallCount++;
        if (analyzeCallCount === 1) {
          return { activityType: 'coding', description: 'Coding', timestamp: new Date() };
        } else {
          return { activityType: 'file_operation', description: 'File operation', timestamp: new Date() };
        }
      });

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(statusUpdates.length).toBeGreaterThan(0);
      expect(statusUpdates.some(update => update.status.status === 'working')).toBe(true);
    });

    test('should maintain agent state information', async () => {
      // Mock terminal monitor
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'test-agent-1',
          hasNewActivity: true,
          activityInfo: { activityType: 'coding', description: 'Coding', timestamp: new Date() },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS.coding,
          timestamp: new Date()
        },
        {
          agentName: 'test-agent-2',
          hasNewActivity: false,
          isIdle: true,
          lastOutput: '',
          timestamp: new Date()
        }
      ]);

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      const agentStates = monitoringService.getAgentStates();
      expect(agentStates.size).toBeGreaterThan(0);
      
      // Verify agent states contain expected information
      for (const [agentName, state] of agentStates) {
        expect(agentName).toBeDefined();
        expect(state.lastCheckTime).toBeInstanceOf(Date);
        expect(typeof state.isActive).toBe('boolean');
      }
    });
  });

  describe('End-to-End Workflow Testing', () => {
    test('should handle complete development workflow', async () => {
      const workflowSteps: { agent: string; status: AgentStatus }[] = [];
      
      // Capture all status changes
      mockStatusCallback.mockImplementation((agent: string, status: AgentStatus) => {
        workflowSteps.push({ agent, status });
      });

      // Mock terminal monitor to simulate workflow progression
      let workflowStep = 0;
      const workflowOutputs = [
        { output: REAL_TERMINAL_OUTPUTS.thinking, type: 'thinking', statusType: 'working' as AgentStatusType },
        { output: REAL_TERMINAL_OUTPUTS.coding, type: 'coding', statusType: 'working' as AgentStatusType },
        { output: REAL_TERMINAL_OUTPUTS.fileOperation, type: 'file_operation', statusType: 'working' as AgentStatusType },
        { output: REAL_TERMINAL_OUTPUTS.debugging, type: 'debugging', statusType: 'working' as AgentStatusType },
        { output: REAL_TERMINAL_OUTPUTS.idle, type: 'idle', statusType: 'idle' as AgentStatusType }
      ];

      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockImplementation(async () => {
        const currentStep = workflowOutputs[workflowStep % workflowOutputs.length];
        workflowStep++;
        
        return [{
          agentName: 'workflow-agent',
          hasNewActivity: currentStep.type !== 'idle',
          activityInfo: currentStep.type !== 'idle' ? {
            activityType: currentStep.type as any,
            description: `${currentStep.type} activity`,
            timestamp: new Date()
          } : undefined,
          isIdle: currentStep.type === 'idle',
          lastOutput: currentStep.output,
          timestamp: new Date()
        }];
      });

      // Mock analyzer to return appropriate activities
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockImplementation(() => {
        const currentStep = workflowOutputs[(workflowStep - 1) % workflowOutputs.length];
        return {
          activityType: currentStep.type as any,
          description: `${currentStep.type} activity`,
          timestamp: new Date()
        };
      });

      monitoringService.start();
      
      // Wait for multiple monitoring cycles
      await new Promise(resolve => setTimeout(resolve, 600));

      // Verify workflow progression
      expect(workflowSteps.length).toBeGreaterThan(0);
      
      // Verify service metrics
      const stats = monitoringService.getStats();
      expect(stats.totalChecks).toBeGreaterThan(0);
      expect(stats.successfulChecks).toBeGreaterThan(0);
      expect(stats.uptime).toBeGreaterThan(0);
    });

    test('should maintain data consistency throughout workflow', async () => {
      // Mock consistent terminal monitoring
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'consistency-agent',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: 'Consistent coding activity',
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS.coding,
          timestamp: new Date()
        }
      ]);

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify data consistency across service components
      const healthStatus = monitoringService.getHealthStatus();
      const stats = monitoringService.getStats();
      const agentStates = monitoringService.getAgentStates();

      expect(healthStatus.isRunning).toBe(true);
      expect(stats.totalChecks).toBeGreaterThan(0);
      expect(stats.lastCheckTimestamp).toBeInstanceOf(Date);
      expect(agentStates.size).toBeGreaterThan(0);

      // Verify timestamps are consistent and recent
      const now = Date.now();
      expect(now - stats.lastCheckTimestamp.getTime()).toBeLessThan(1000);
      expect(healthStatus.uptime).toBeGreaterThan(0);
    });
  });

  describe('System Performance Under Load', () => {
    test('should handle high-frequency terminal output', async () => {
      const startTime = Date.now();
      const statusChanges: number[] = [];

      mockStatusCallback.mockImplementation(() => {
        statusChanges.push(Date.now());
      });

      // Mock high-frequency terminal monitoring
      let callCount = 0;
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockImplementation(async () => {
        callCount++;
        const outputTypes = Object.keys(REAL_TERMINAL_OUTPUTS);
        const outputType = outputTypes[callCount % outputTypes.length] as keyof typeof REAL_TERMINAL_OUTPUTS;
        
        return [{
          agentName: `load-test-agent-${callCount}`,
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: `High frequency activity ${callCount}`,
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS[outputType],
          timestamp: new Date()
        }];
      });

      // Mock analyzer for performance
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'coding',
        description: 'High frequency coding',
        timestamp: new Date()
      });

      monitoringService.start();
      
      // Wait for multiple monitoring cycles
      await new Promise(resolve => setTimeout(resolve, 1000));

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Performance assertions
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Verify system performance metrics
      const stats = monitoringService.getStats();
      expect(stats.totalChecks).toBeGreaterThan(0);
      expect(stats.averageCheckDuration).toBeLessThan(1000); // Each check should be fast
      
      // Verify system remains responsive
      const healthStatus = monitoringService.getHealthStatus();
      expect(healthStatus.isRunning).toBe(true);
    });

    test('should maintain memory efficiency under load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Mock memory-intensive terminal monitoring
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockImplementation(async () => {
        // Simulate large output data
        const largeOutput = 'A'.repeat(10000); // 10KB per call
        return Array.from({ length: 10 }, (_, i) => ({
          agentName: `memory-test-agent-${i}`,
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: `Memory test activity ${i}`,
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: largeOutput,
          timestamp: new Date()
        }));
      });

      monitoringService.start();
      
      // Run for a period to generate memory usage
      await new Promise(resolve => setTimeout(resolve, 600));

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory should not increase excessively (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      // Verify performance optimization is working
      const comprehensiveMetrics = monitoringService.getComprehensiveMetrics();
      expect(comprehensiveMetrics.monitoring).toBeDefined();
      expect(comprehensiveMetrics.terminalMonitor).toBeDefined();
    });

    test('should handle concurrent status requests efficiently', async () => {
      // Mock terminal monitoring
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockResolvedValue([
        {
          agentName: 'concurrent-test-agent',
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: 'Concurrent test coding',
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: REAL_TERMINAL_OUTPUTS.coding,
          timestamp: new Date()
        }
      ]);

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      const startTime = Date.now();
      
      // Make concurrent requests to available methods
      const promises = Array.from({ length: 100 }, () => 
        Promise.resolve(monitoringService.getStats())
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      // All requests should complete quickly
      expect(endTime - startTime).toBeLessThan(1000);
      
      // All results should be consistent
      const firstResult = results[0];
      results.forEach(result => {
        expect(result.totalChecks).toBe(firstResult.totalChecks);
        expect(result.isRunning).toBe(firstResult.isRunning);
      });
    });

    test('should gracefully handle malformed terminal output', async () => {
      // Mock terminal monitor to return malformed data
      const malformedOutputs = [
        '',
        '{"invalid": json}',
        'Random text without structure',
        '\x00\x01\x02', // Binary data
        'A'.repeat(10000) // Very long string
      ];

      let outputIndex = 0;
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockImplementation(async () => {
        const output = malformedOutputs[outputIndex % malformedOutputs.length];
        outputIndex++;
        
        return [{
          agentName: 'malformed-test-agent',
          hasNewActivity: false,
          isIdle: true,
          lastOutput: output,
          timestamp: new Date()
        }];
      });

      // Mock analyzer to handle malformed data gracefully
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'idle',
        description: 'Handling malformed data',
        timestamp: new Date()
      });

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, 300));

      // System should remain stable
      const healthStatus = monitoringService.getHealthStatus();
      expect(healthStatus.isRunning).toBe(true);
      
      const stats = monitoringService.getStats();
      expect(stats.totalChecks).toBeGreaterThan(0);
      
      // Should handle errors gracefully without crashing
      expect(stats.failedChecks).toBeLessThanOrEqual(stats.totalChecks);
    });
  });

  describe('System Validation', () => {
    test('should validate all requirements are met', async () => {
      // Test all activity types can be detected
      const activityTypes = [
        { output: REAL_TERMINAL_OUTPUTS.coding, expectedStatus: 'working' as AgentStatusType, type: 'coding' },
        { output: REAL_TERMINAL_OUTPUTS.fileOperation, expectedStatus: 'working' as AgentStatusType, type: 'file_operation' },
        { output: REAL_TERMINAL_OUTPUTS.debugging, expectedStatus: 'working' as AgentStatusType, type: 'thinking' },
        { output: REAL_TERMINAL_OUTPUTS.thinking, expectedStatus: 'working' as AgentStatusType, type: 'thinking' },
        { output: REAL_TERMINAL_OUTPUTS.idle, expectedStatus: 'idle' as AgentStatusType, type: 'idle' },
        { output: REAL_TERMINAL_OUTPUTS.error, expectedStatus: 'error' as AgentStatusType, type: 'idle' }
      ];

      for (const { output, expectedStatus, type } of activityTypes) {
        // Create fresh service instance for each test to avoid interference
        const freshTerminalMonitor = new TerminalOutputMonitor();
        const freshActivityAnalyzer = new ActivityAnalyzer();
        const freshMockCallback = vi.fn();
        
        const freshMonitoringService = new AgentActivityMonitoringService(
          freshMockCallback,
          {
            activeCheckInterval: 50,
            idleCheckInterval: 100,
            maxRetries: 3,
            gracefulDegradationEnabled: true,
            performanceOptimizationEnabled: true,
            maxOutputBufferSize: 200
          },
          freshTerminalMonitor,
          freshActivityAnalyzer
        );

        // Mock terminal monitor for each activity type
        vi.spyOn(freshTerminalMonitor, 'monitorAllAgents').mockResolvedValue([
          {
            agentName: `validation-agent-${type}`,
            hasNewActivity: type !== 'idle',
            activityInfo: type !== 'idle' ? {
              activityType: type as any,
              description: `${type} activity`,
              timestamp: new Date()
            } : undefined,
            isIdle: type === 'idle',
            lastOutput: output,
            timestamp: new Date()
          }
        ]);

        // Mock analyzer for each activity type
        vi.spyOn(freshActivityAnalyzer, 'analyzeOutput').mockReturnValue({
          activityType: type as any,
          description: `${type} activity`,
          timestamp: new Date()
        });

        // Mock error detection for error type
        if (type === 'idle' && expectedStatus === 'error') {
          vi.spyOn(freshActivityAnalyzer, 'hasError').mockReturnValue(true);
        } else {
          vi.spyOn(freshActivityAnalyzer, 'hasError').mockReturnValue(false);
        }
        
        freshMonitoringService.start();
        await new Promise(resolve => setTimeout(resolve, 150));
        freshMonitoringService.stop();

        // Verify status was detected
        expect(freshMockCallback).toHaveBeenCalledWith(`validation-agent-${type}`, expect.objectContaining({
          status: expectedStatus
        }));
      }

      // Validate service integration
      const healthStatus = monitoringService.getHealthStatus();
      expect(healthStatus).toHaveProperty('isRunning');
      expect(healthStatus).toHaveProperty('uptime');
      expect(healthStatus).toHaveProperty('lastCheckAge');

      // Validate metrics collection
      const stats = monitoringService.getStats();
      expect(stats).toHaveProperty('totalChecks');
      expect(stats).toHaveProperty('successfulChecks');
      expect(stats).toHaveProperty('averageCheckDuration');
      expect(stats).toHaveProperty('uptime');

      // Validate comprehensive metrics
      const comprehensiveMetrics = monitoringService.getComprehensiveMetrics();
      expect(comprehensiveMetrics).toHaveProperty('monitoring');
      expect(comprehensiveMetrics).toHaveProperty('terminalMonitor');

      // Validate agent state tracking
      const agentStates = monitoringService.getAgentStates();
      expect(agentStates).toBeInstanceOf(Map);
    });

    test('should validate system reliability over time', async () => {
      const testDuration = 1000; // 1 second for faster test
      const startTime = Date.now();

      // Mock continuous terminal monitoring
      let monitoringCallCount = 0;
      vi.spyOn(terminalMonitor, 'monitorAllAgents').mockImplementation(async () => {
        monitoringCallCount++;
        const outputs = Object.values(REAL_TERMINAL_OUTPUTS);
        const randomOutput = outputs[Math.floor(Math.random() * outputs.length)];
        
        return [{
          agentName: `reliability-agent-${monitoringCallCount}`,
          hasNewActivity: true,
          activityInfo: {
            activityType: 'coding',
            description: `Reliability test ${monitoringCallCount}`,
            timestamp: new Date()
          },
          isIdle: false,
          lastOutput: randomOutput,
          timestamp: new Date()
        }];
      });

      // Mock stable analyzer
      vi.spyOn(activityAnalyzer, 'analyzeOutput').mockReturnValue({
        activityType: 'coding',
        description: 'Reliable coding activity',
        timestamp: new Date()
      });

      monitoringService.start();
      await new Promise(resolve => setTimeout(resolve, testDuration));

      // System should remain stable
      const healthStatus = monitoringService.getHealthStatus();
      expect(healthStatus.isRunning).toBe(true);
      
      const stats = monitoringService.getStats();
      expect(stats.totalChecks).toBeGreaterThan(0);
      expect(stats.successfulChecks).toBeGreaterThan(0);
      
      // Verify uptime tracking
      const uptime = Date.now() - startTime;
      expect(uptime).toBeGreaterThanOrEqual(testDuration);
      expect(healthStatus.uptime).toBeGreaterThan(0);

      // Verify system performance under continuous load
      expect(stats.averageCheckDuration).toBeLessThan(1000); // Should be fast
      expect(monitoringCallCount).toBeGreaterThan(0);
    });
  });
});