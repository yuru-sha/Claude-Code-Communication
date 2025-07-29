/**
 * WebSocket Handler
 * 
 * Manages Socket.io connections and real-time communication
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { db } from '../database';
import serviceContainer from '../services/ServiceContainer';
import { 
  sendToAgent, 
  checkUsageLimitResolution, 
  processTaskQueue,
  assignTaskToPresident as taskManagerAssignTaskToPresident
} from '../services/taskManager';
import TerminalWebSocketManager from './TerminalWebSocket';

// Global task queue (imported from main server)
let taskQueue: any[] = [];

// Terminal WebSocket manager
let terminalManager: TerminalWebSocketManager;

/**
 * Set task queue reference
 */
export const setTaskQueue = (queue: any[]): void => {
  taskQueue = queue;
};

/**
 * Handle task deletion
 */
const handleDeleteTask = async (socket: Socket, taskId: string): Promise<void> => {
  try {
    console.log(`🗑️ Deleting task: ${taskId}`);
    
    await db.deleteTask(taskId);
    
    // Remove from memory cache
    const index = taskQueue.findIndex(task => task.id === taskId);
    if (index !== -1) {
      taskQueue.splice(index, 1);
      console.log(`📋 Task ${taskId} removed from cache`);
    }
    
    // Notify all clients
    socket.broadcast.emit('task-deleted', { taskId, timestamp: new Date() });
    socket.emit('task-delete-success', { taskId, timestamp: new Date() });
    
  } catch (error) {
    console.error('❌ Failed to delete task:', error);
    socket.emit('task-delete-error', { 
      taskId, 
      error: error instanceof Error ? error.message : 'Failed to delete task',
      timestamp: new Date()
    });
  }
};

/**
 * Handle task request
 */
const handleRequestTask = async (socket: Socket, taskData: any): Promise<void> => {
  try {
    console.log(`📝 Task request received:`, taskData);
    
    // Create task in database
    const task = await db.createTask({
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskData.title,
      description: taskData.description,
      priority: taskData.priority || 'medium',
      status: 'pending',
      assignedTo: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    // Add to memory cache
    taskQueue.push(task);
    console.log(`✅ Task created: ${task.id}`);
    
    // Try to assign task immediately
    const assignTaskToPresident = async (task: any) => {
      try {
        const message = `新しいタスクが割り当てられました:
タイトル: ${task.title}
説明: ${task.description}
優先度: ${task.priority}
タスク ID: ${task.id}

このタスクを受け取り、適切な作業を開始してください。`;
        
        await sendToAgent('president', message);
        await db.updateTaskStatus(task.id, 'assigned');
        
        return true;
      } catch (error) {
        console.error('❌ Failed to assign task to president:', error);
        return false;
      }
    };
    
    const handleTaskAssigned = (taskId: string) => {
      socket.broadcast.emit('task-assigned', { taskId, timestamp: new Date() });
      console.log(`📤 Task ${taskId} assigned`);
    };
    
    const handleUsageLimitResolved = () => {
      console.log('✅ Usage limit resolved');
    };
    
    // Process the task queue
    await processTaskQueue(
      taskQueue,
      checkUsageLimitResolution,
      assignTaskToPresident,
      handleTaskAssigned,
      handleUsageLimitResolved
    );
    
    // Notify all clients
    socket.broadcast.emit('task-created', { task, timestamp: new Date() });
    socket.emit('task-request-success', { task, timestamp: new Date() });
    
  } catch (error) {
    console.error('❌ Failed to process task request:', error);
    socket.emit('task-request-error', { 
      error: error instanceof Error ? error.message : 'Failed to create task',
      timestamp: new Date()
    });
  }
};

/**
 * Handle task completion
 */
const handleTaskCompleted = async (socket: Socket, taskId: string): Promise<void> => {
  try {
    console.log(`✅ Task completion received: ${taskId}`);
    
    await db.updateTaskStatus(taskId, 'completed');
    
    // Update memory cache
    const task = taskQueue.find(t => t.id === taskId);
    if (task) {
      task.status = 'completed';
      task.updatedAt = new Date();
    }
    
    // Notify all clients
    socket.broadcast.emit('task-completed', { taskId, timestamp: new Date() });
    socket.emit('task-completion-success', { taskId, timestamp: new Date() });
    
  } catch (error) {
    console.error('❌ Failed to mark task as completed:', error);
    socket.emit('task-completion-error', { 
      taskId, 
      error: error instanceof Error ? error.message : 'Failed to complete task',
      timestamp: new Date()
    });
  }
};

/**
 * Handle manual task completion
 */
const handleMarkTaskCompleted = async (socket: Socket, taskId: string): Promise<void> => {
  try {
    console.log(`✅ Manual task completion: ${taskId}`);
    
    const updatedTask = await db.updateTaskStatus(taskId, 'completed');
    
    // Update memory cache
    const taskIndex = taskQueue.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      taskQueue[taskIndex] = { ...taskQueue[taskIndex], ...updatedTask };
    }
    
    // Notify all clients
    socket.broadcast.emit('task-status-updated', { 
      taskId, 
      status: 'completed', 
      timestamp: new Date() 
    });
    socket.emit('task-mark-success', { taskId, timestamp: new Date() });
    
  } catch (error) {
    console.error('❌ Failed to mark task as completed:', error);
    socket.emit('task-mark-error', { 
      taskId, 
      error: error instanceof Error ? error.message : 'Failed to mark task as completed',
      timestamp: new Date()
    });
  }
};

/**
 * Handle task failure
 */
const handleMarkTaskFailed = async (socket: Socket, data: { taskId: string; reason: string }): Promise<void> => {
  try {
    const { taskId, reason } = data;
    console.log(`❌ Task failed: ${taskId}, reason: ${reason}`);
    
    await db.updateTaskStatus(taskId, 'failed');
    
    // Update memory cache
    const task = taskQueue.find(t => t.id === taskId);
    if (task) {
      task.status = 'failed';
      task.failureReason = reason;
      task.updatedAt = new Date();
    }
    
    // Notify all clients
    socket.broadcast.emit('task-status-updated', { 
      taskId, 
      status: 'failed', 
      reason,
      timestamp: new Date() 
    });
    socket.emit('task-mark-success', { taskId, timestamp: new Date() });
    
  } catch (error) {
    console.error('❌ Failed to mark task as failed:', error);
    socket.emit('task-mark-error', { 
      taskId, 
      error: error instanceof Error ? error.message : 'Failed to mark task as failed',
      timestamp: new Date()
    });
  }
};

/**
 * Handle task retry
 */
const handleRetryTask = async (socket: Socket, taskId: string): Promise<void> => {
  try {
    console.log(`🔄 Retrying task: ${taskId}`);
    
    await db.updateTaskStatus(taskId, 'pending');
    
    // Update memory cache
    const task = taskQueue.find(t => t.id === taskId);
    if (task) {
      task.status = 'pending';
      task.retryCount = (task.retryCount || 0) + 1;
      task.updatedAt = new Date();
    }
    
    // Notify all clients
    socket.broadcast.emit('task-status-updated', { 
      taskId, 
      status: 'pending', 
      timestamp: new Date() 
    });
    socket.emit('task-retry-success', { taskId, timestamp: new Date() });
    
  } catch (error) {
    console.error('❌ Failed to retry task:', error);
    socket.emit('task-retry-error', { 
      taskId, 
      error: error instanceof Error ? error.message : 'Failed to retry task',
      timestamp: new Date()
    });
  }
};

/**
 * Handle emergency stop
 */
const handleEmergencyStop = async (socket: Socket): Promise<void> => {
  try {
    console.log('🚨 Emergency stop requested');
    
    // Stop all services
    const services = [
      serviceContainer.terminalOutputMonitor,
      serviceContainer.activityAnalyzer,
      serviceContainer.agentActivityMonitoringService
    ];
    
    for (const service of services) {
      if (service && typeof service.stop === 'function') {
        try {
          service.stop();
        } catch (error) {
          console.error('Error stopping service:', error);
        }
      }
    }
    
    // Notify all clients
    socket.broadcast.emit('emergency-stop-activated', { timestamp: new Date() });
    socket.emit('emergency-stop-success', { timestamp: new Date() });
    
  } catch (error) {
    console.error('❌ Failed to execute emergency stop:', error);
    socket.emit('emergency-stop-error', { 
      error: error instanceof Error ? error.message : 'Failed to execute emergency stop',
      timestamp: new Date()
    });
  }
};

/**
 * Handle terminal subscription
 */
const handleSubscribeTerminal = (socket: Socket, data: { target: string }): void => {
  if (!terminalManager) {
    socket.emit('terminal-error', {
      target: data.target,
      error: 'Terminal manager not initialized'
    });
    return;
  }

  terminalManager.subscribe(socket, data.target);
};

/**
 * Handle terminal unsubscription
 */
const handleUnsubscribeTerminal = (socket: Socket, data: { target: string }): void => {
  if (terminalManager) {
    terminalManager.unsubscribe(socket, data.target);
  }
};

/**
 * Handle terminal stats request
 */
const handleTerminalStats = (socket: Socket): void => {
  if (terminalManager) {
    const stats = terminalManager.getStats();
    socket.emit('terminal-stats', { stats, timestamp: new Date() });
  } else {
    socket.emit('terminal-stats', { 
      error: 'Terminal manager not initialized',
      timestamp: new Date() 
    });
  }
};

/**
 * Setup socket connection handlers
 */
export const setupSocketHandlers = (io: SocketIOServer): void => {
  // Initialize terminal manager
  terminalManager = new TerminalWebSocketManager(io);
  
  io.on('connection', async (socket: Socket) => {
    const clientId = socket.id;
    console.log(`🔌 Client connected: ${clientId}`);
    
    // Send current task queue to new client
    try {
      const tasks = await db.getAllTasks();
      socket.emit('tasks-initial-load', { tasks, timestamp: new Date() });
    } catch (error) {
      console.error('❌ Failed to send initial tasks:', error);
    }
    
    // Register task management event handlers
    socket.on('delete-task', (taskId: string) => handleDeleteTask(socket, taskId));
    socket.on('request-task', (taskData: any) => handleRequestTask(socket, taskData));
    socket.on('task-completed', (taskId: string) => handleTaskCompleted(socket, taskId));
    socket.on('mark-task-completed', (taskId: string) => handleMarkTaskCompleted(socket, taskId));
    socket.on('mark-task-failed', (data: { taskId: string; reason: string }) => handleMarkTaskFailed(socket, data));
    socket.on('retry-task', (taskId: string) => handleRetryTask(socket, taskId));
    socket.on('emergency-stop', () => handleEmergencyStop(socket));
    
    // Register terminal WebSocket event handlers
    socket.on('subscribe-terminal', (data: { target: string }) => handleSubscribeTerminal(socket, data));
    socket.on('unsubscribe-terminal', (data: { target: string }) => handleUnsubscribeTerminal(socket, data));
    socket.on('get-terminal-stats', () => handleTerminalStats(socket));
    
    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${clientId}`);
      
      // Clean up terminal subscriptions
      if (terminalManager) {
        terminalManager.unsubscribe(socket);
      }
    });
  });
  
  console.log('🔌 Socket.io handlers configured');
  console.log('📺 Terminal WebSocket manager initialized');
};

/**
 * Get terminal manager instance
 */
export const getTerminalManager = (): TerminalWebSocketManager | null => {
  return terminalManager || null;
};

/**
 * Cleanup terminal manager
 */
export const cleanupTerminalManager = (): void => {
  if (terminalManager) {
    terminalManager.cleanup();
  }
};

export default setupSocketHandlers;