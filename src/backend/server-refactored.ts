/**
 * Claude Code Communication Server - Refactored
 * 
 * Main server file with improved architecture:
 * - Separated routes into domain-specific modules
 * - Extracted health monitoring to dedicated controller
 * - Moved WebSocket handlers to separate module
 * - Centralized timer management for memory leak prevention
 */

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { db, Task } from './database';
import { AgentStatus, AgentStatusType } from '../types';
import serviceContainer from './services/ServiceContainer';
import { serverManager } from './utils/ServerManager';

// Import modular components
import { setupRoutes } from './routes';
import { setupSocketHandlers, setTaskQueue, cleanupTerminalManager } from './websocket/SocketHandler';
import { 
  initializeHealthMonitoring, 
  stopHealthCheckInterval,
  performHealthCheck 
} from './controllers/HealthController';

// Configuration
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Express app setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dist')));

// Global state
let taskQueue: Task[] = [];

// Service instances
const terminalMonitor = serviceContainer.terminalOutputMonitor;
const activityAnalyzer = serviceContainer.activityAnalyzer;
const tmuxManager = serviceContainer.tmuxManager;
const agentActivityMonitoringService = serviceContainer.agentActivityMonitoringService;

/**
 * Database cache management
 */
let refreshCacheInterval: NodeJS.Timeout | null = null;

const refreshTaskCache = async (): Promise<void> => {
  try {
    taskQueue = await db.getAllTasks();
    console.log(`📋 Loaded ${taskQueue.length} tasks from database`);
  } catch (error) {
    console.error('❌ Failed to load tasks from database:', error);
    taskQueue = [];
  }
};

const schedulePeriodicRefresh = (): void => {
  if (refreshCacheInterval) {
    serverManager.clearInterval(refreshCacheInterval);
  }
  
  refreshCacheInterval = serverManager.setInterval(async () => {
    await refreshTaskCache();
  }, 30000); // 30 seconds
  
  console.log('🔄 Scheduled periodic cache refresh (30s interval)');
};

const stopPeriodicRefresh = (): void => {
  if (refreshCacheInterval) {
    serverManager.clearInterval(refreshCacheInterval);
    refreshCacheInterval = null;
    console.log('⏹️ Stopped periodic cache refresh');
  }
};

/**
 * Agent status management
 */
const systemHealthStatus = {
  claudeAgents: {
    president: false,
    boss1: false,
    worker1: false,
    worker2: false,
    worker3: false
  }
};

const broadcastAgentStatusUpdate = (
  agentName: string, 
  newStatus: AgentStatus | 'idle' | 'working' | 'offline', 
  currentTask?: string
): void => {
  const statusData = {
    agent: agentName,
    status: newStatus,
    currentTask,
    timestamp: new Date()
  };
  
  io.emit('agent-status-update', statusData);
  console.log(`📡 Agent status broadcast: ${agentName} -> ${newStatus}`);
};

const shouldUpdateStatus = (agentName: string, newStatus: AgentStatus): boolean => {
  const currentStatus = systemHealthStatus.claudeAgents[agentName as keyof typeof systemHealthStatus.claudeAgents];
  return currentStatus !== (newStatus === 'active');
};

/**
 * Task completion monitoring
 */
let taskCompletionInterval: NodeJS.Timeout | null = null;
let taskCompletionTimeout: NodeJS.Timeout | null = null;
let isTaskCompletionCheckActive = false;

// Task completion patterns
const COMPLETION_PATTERNS = [
  // President formal completion declaration (highest priority)
  /May the Force be with you\.?$/m,
  /【プロジェクト完了報告】/,
  /タスクが完了しました/,
  
  // Fallback general patterns
  /完了報告.*完了/,
  /作業.*完了.*しました/,
  
  // English completion patterns
  /task.*completed?.*successfully/i,
  /project.*completed?/i,
  /work.*finished/i
];

// Patterns to avoid false positives
const EXCLUSION_PATTERNS = [
  /テスト.*完了/, // Test completion
  /一部.*完了/, // Partial completion
  /途中.*完了/, // Intermediate completion
  /次.*完了/,   // Next completion
];

const lastTerminalOutputs: Record<string, string> = {};

const checkTaskCompletion = async (): Promise<void> => {
  if (!isTaskCompletionCheckActive) return;
  
  const agents = [
    { name: 'president', target: 'president' },
    { name: 'boss1', target: 'multiagent:0.0' },
    { name: 'worker1', target: 'multiagent:0.1' },
    { name: 'worker2', target: 'multiagent:0.2' },
    { name: 'worker3', target: 'multiagent:0.3' }
  ];
  
  const checkPromises = agents.map(async (agent) => {
    try {
      const currentOutput = await terminalMonitor.getLatestOutput(agent.target);
      
      if (currentOutput && currentOutput !== lastTerminalOutputs[agent.name]) {
        // Check for completion patterns
        const hasCompletion = COMPLETION_PATTERNS.some(pattern => pattern.test(currentOutput));
        const hasExclusion = EXCLUSION_PATTERNS.some(pattern => pattern.test(currentOutput));
        
        if (hasCompletion && !hasExclusion) {
          console.log(`🎉 Task completion detected from ${agent.name}`);
          
          // Emit completion event
          io.emit('task-completion-detected', {
            agent: agent.name,
            output: currentOutput.slice(-500), // Last 500 chars
            timestamp: new Date()
          });
          
          broadcastAgentStatusUpdate(agent.name, 'idle');
        }
        
        lastTerminalOutputs[agent.name] = currentOutput;
      }
    } catch (error) {
      // Silently ignore terminal unavailability
      if (error instanceof Error && !error.message.includes('timeout')) {
        console.warn(`Failed to check terminal ${agent.name}:`, error.message);
      }
    }
  });
  
  await Promise.all(checkPromises);
};

const startTaskCompletionMonitoring = (): void => {
  if (isTaskCompletionCheckActive) return;
  
  isTaskCompletionCheckActive = true;
  console.log('🔍 Task completion monitoring started');
  
  // Clear existing timers
  if (taskCompletionInterval) {
    serverManager.clearInterval(taskCompletionInterval);
  }
  if (taskCompletionTimeout) {
    serverManager.clearTimeout(taskCompletionTimeout);
  }
  
  // 45 second intervals for better accuracy
  taskCompletionInterval = serverManager.setInterval(async () => {
    await checkTaskCompletion();
  }, 45000);
  
  // Initial execution after 10 seconds
  taskCompletionTimeout = serverManager.setTimeout(() => checkTaskCompletion(), 10000);
};

const stopTaskCompletionMonitoring = (): void => {
  isTaskCompletionCheckActive = false;
  
  if (taskCompletionInterval) {
    serverManager.clearInterval(taskCompletionInterval);
    taskCompletionInterval = null;
  }
  if (taskCompletionTimeout) {
    serverManager.clearTimeout(taskCompletionTimeout);
    taskCompletionTimeout = null;
  }
  
  console.log('⏹️ Task completion monitoring stopped');
};

/**
 * Task queue processing
 */
let taskQueueProcessingInterval: NodeJS.Timeout | null = null;

const startTaskQueueProcessing = (): void => {
  // This will be implemented when taskManager is fully refactored
  console.log('🔄 Task queue processing placeholder - to be implemented');
};

const stopTaskQueueProcessing = (): void => {
  if (taskQueueProcessingInterval) {
    serverManager.clearInterval(taskQueueProcessingInterval);
    taskQueueProcessingInterval = null;
    console.log('⏹️ Stopped task queue processing');
  }
};

/**
 * Usage limit monitoring
 */
let usageLimitMonitorTimer: NodeJS.Timeout | null = null;

const checkUsageLimitReset = async (): Promise<void> => {
  // Implementation placeholder
  console.log('💳 Usage limit check - to be implemented');
};

const startUsageLimitMonitoring = async (): Promise<void> => {
  await checkUsageLimitReset();
  
  usageLimitMonitorTimer = serverManager.setInterval(checkUsageLimitReset, 60 * 1000);
};

const stopUsageLimitMonitoring = (): void => {
  if (usageLimitMonitorTimer) {
    serverManager.clearInterval(usageLimitMonitorTimer);
    usageLimitMonitorTimer = null;
    console.log('🛑 Usage limit monitoring stopped');
  }
};

/**
 * Server initialization
 */
const initializeServer = async (): Promise<void> => {
  try {
    console.log('🚀 Initializing Claude Code Communication Server...');
    
    // Initialize database cache
    await refreshTaskCache();
    setTaskQueue(taskQueue); // Pass reference to WebSocket handler
    
    // Setup routes
    setupRoutes(app);
    
    // Setup WebSocket handlers
    setupSocketHandlers(io);
    
    // Setup static file serving
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../dist/index.html'));
    });
    
    // Start monitoring services
    schedulePeriodicRefresh();
    initializeHealthMonitoring();
    startTaskCompletionMonitoring();
    startTaskQueueProcessing();
    await startUsageLimitMonitoring();
    
    console.log('✅ Server initialization completed');
    
  } catch (error) {
    console.error('❌ Server initialization failed:', error);
    throw error;
  }
};

/**
 * Graceful shutdown
 */
const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Stop all timers and intervals
    stopPeriodicRefresh();
    stopTaskCompletionMonitoring();
    stopTaskQueueProcessing();
    stopUsageLimitMonitoring();
    stopHealthCheckInterval();
    
    // ServerManager cleanup
    serverManager.cleanup();
    console.log('🧹 All timers cleaned up');
    
    // Stop services
    if (agentActivityMonitoringService) {
      agentActivityMonitoringService.stop();
      console.log('🔍 Agent activity monitoring service stopped');
    }

    // Cleanup WebSocket connections
    cleanupTerminalManager();
    console.log('📺 Terminal WebSocket manager cleaned up');
    
    // Close database connection
    await db.disconnect();
    console.log('💾 Database disconnected');
    
    // Close server
    server.close(() => {
      console.log('🌐 HTTP server closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      console.log('⏰ Force exit after timeout');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

/**
 * Start server
 */
const startServer = async (): Promise<void> => {
  try {
    await initializeServer();
    
    server.listen(PORT, () => {
      console.log(`🌐 Server running on http://localhost:${PORT}`);
      console.log(`📊 Frontend URL: ${FRONTEND_URL}`);
      console.log(`📈 Timer stats:`, serverManager.getStats());
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
if (require.main === module) {
  startServer();
}

export { app, server, io };