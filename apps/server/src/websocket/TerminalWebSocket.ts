/**
 * Terminal WebSocket Handler
 * 
 * Provides real-time terminal output streaming via WebSocket
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { promisify } from 'util';
import { exec } from 'child_process';
import { serverManager } from '../utils/ServerManager';

const execAsync = promisify(exec);

interface TerminalSubscription {
  target: string;
  socketId: string;
  lastContent: string;
  lastUpdate: Date;
}

class TerminalWebSocketManager {
  private io: SocketIOServer;
  private subscriptions: Map<string, TerminalSubscription[]> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  /**
   * Map agent names to tmux targets
   */
  private mapAgentToTmuxTarget(target: string): string {
    const targetMap: Record<string, string> = {
      'president': 'president',
      'boss1': 'multiagent:0.0',
      'worker1': 'multiagent:0.1',
      'worker2': 'multiagent:0.2',
      'worker3': 'multiagent:0.3'
    };
    
    return targetMap[target] || target;
  }

  /**
   * Get current terminal content
   */
  private async getTerminalContent(target: string): Promise<string> {
    try {
      const tmuxTarget = this.mapAgentToTmuxTarget(target);
      const { stdout } = await execAsync(`tmux capture-pane -t "${tmuxTarget}" -p`);
      return stdout;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to capture terminal ${target}: ${errorMsg}`);
    }
  }

  /**
   * Subscribe to terminal updates
   */
  public subscribe(socket: Socket, target: string): void {
    console.log(`📺 WebSocket subscription: ${socket.id} -> ${target}`);

    if (!this.subscriptions.has(target)) {
      this.subscriptions.set(target, []);
    }

    const subscriptions = this.subscriptions.get(target)!;
    
    // Remove existing subscription for this socket
    const existingIndex = subscriptions.findIndex(sub => sub.socketId === socket.id);
    if (existingIndex >= 0) {
      subscriptions.splice(existingIndex, 1);
    }

    // Add new subscription
    subscriptions.push({
      target,
      socketId: socket.id,
      lastContent: '',
      lastUpdate: new Date()
    });

    // Send initial content
    this.sendInitialContent(socket, target);

    // Start monitoring if not already started
    if (!this.isMonitoring) {
      this.startMonitoring();
    }
  }

  /**
   * Unsubscribe from terminal updates
   */
  public unsubscribe(socket: Socket, target?: string): void {
    if (target) {
      console.log(`📺 WebSocket unsubscription: ${socket.id} -> ${target}`);
      
      const subscriptions = this.subscriptions.get(target);
      if (subscriptions) {
        const index = subscriptions.findIndex(sub => sub.socketId === socket.id);
        if (index >= 0) {
          subscriptions.splice(index, 1);
          
          // Clean up empty subscription arrays
          if (subscriptions.length === 0) {
            this.subscriptions.delete(target);
          }
        }
      }
    } else {
      // Unsubscribe from all targets for this socket
      console.log(`📺 WebSocket unsubscribe all: ${socket.id}`);
      
      for (const [targetKey, subscriptions] of this.subscriptions.entries()) {
        const index = subscriptions.findIndex(sub => sub.socketId === socket.id);
        if (index >= 0) {
          subscriptions.splice(index, 1);
          if (subscriptions.length === 0) {
            this.subscriptions.delete(targetKey);
          }
        }
      }
    }

    // Stop monitoring if no subscriptions
    if (this.subscriptions.size === 0 && this.isMonitoring) {
      this.stopMonitoring();
    }
  }

  /**
   * Send initial terminal content
   */
  private async sendInitialContent(socket: Socket, target: string): Promise<void> {
    try {
      const content = await this.getTerminalContent(target);
      
      socket.emit('terminal-update', {
        target,
        content,
        timestamp: new Date()
      });

      // Update subscription with initial content
      const subscriptions = this.subscriptions.get(target);
      if (subscriptions) {
        const subscription = subscriptions.find(sub => sub.socketId === socket.id);
        if (subscription) {
          subscription.lastContent = content;
          subscription.lastUpdate = new Date();
        }
      }

      console.log(`📺 Initial content sent to ${socket.id} for ${target} (${content.length} chars)`);
      
    } catch (error) {
      console.error(`❌ Failed to send initial content for ${target}:`, error);
      
      socket.emit('terminal-error', {
        target,
        error: error instanceof Error ? error.message : 'Failed to get terminal content'
      });

      socket.emit('terminal-status', {
        target,
        status: 'error',
        message: 'Terminal not available. Agent may be starting...'
      });
    }
  }

  /**
   * Start monitoring terminal changes
   */
  private startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    console.log('🔍 Starting terminal monitoring...');

    this.monitoringInterval = serverManager.setInterval(async () => {
      await this.checkAllTerminals();
    }, 2000); // Check every 2 seconds (more frequent than polling)
  }

  /**
   * Stop monitoring terminal changes
   */
  private stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      serverManager.clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('⏹️ Terminal monitoring stopped');
  }

  /**
   * Check all subscribed terminals for updates
   */
  private async checkAllTerminals(): Promise<void> {
    const checkPromises: Promise<void>[] = [];

    for (const [target, subscriptions] of this.subscriptions.entries()) {
      if (subscriptions.length > 0) {
        checkPromises.push(this.checkTerminalUpdates(target, subscriptions));
      }
    }

    await Promise.allSettled(checkPromises);
  }

  /**
   * Check specific terminal for updates
   */
  private async checkTerminalUpdates(target: string, subscriptions: TerminalSubscription[]): Promise<void> {
    try {
      const currentContent = await this.getTerminalContent(target);
      
      // Check if content has changed
      const hasChanges = subscriptions.some(sub => sub.lastContent !== currentContent);
      
      if (hasChanges) {
        console.log(`📺 Terminal content changed for ${target} (${currentContent.length} chars)`);
        
        // Update all subscribers
        const updatePromises = subscriptions.map(async (subscription) => {
          try {
            const socket = this.io.sockets.sockets.get(subscription.socketId);
            if (socket) {
              socket.emit('terminal-update', {
                target,
                content: currentContent,
                timestamp: new Date()
              });

              subscription.lastContent = currentContent;
              subscription.lastUpdate = new Date();
            } else {
              // Socket disconnected, remove subscription
              console.log(`🔌 Socket ${subscription.socketId} disconnected, removing subscription`);
              return subscription.socketId; // Mark for removal
            }
          } catch (error) {
            console.error(`❌ Failed to send update to ${subscription.socketId}:`, error);
            return subscription.socketId; // Mark for removal
          }
          return null;
        });

        const results = await Promise.allSettled(updatePromises);
        
        // Remove failed subscriptions
        const toRemove = results
          .filter((result): result is PromiseFulfilledResult<string> => 
            result.status === 'fulfilled' && result.value !== null
          )
          .map(result => result.value);

        if (toRemove.length > 0) {
          const remainingSubscriptions = subscriptions.filter(
            sub => !toRemove.includes(sub.socketId)
          );
          
          if (remainingSubscriptions.length === 0) {
            this.subscriptions.delete(target);
          } else {
            this.subscriptions.set(target, remainingSubscriptions);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to check terminal ${target}:`, error);
      
      // Notify subscribers of error
      subscriptions.forEach(subscription => {
        const socket = this.io.sockets.sockets.get(subscription.socketId);
        if (socket) {
          socket.emit('terminal-status', {
            target,
            status: 'error',
            message: `Terminal ${target} temporarily unavailable`
          });
        }
      });
    }
  }

  /**
   * Get monitoring statistics
   */
  public getStats() {
    const totalSubscriptions = Array.from(this.subscriptions.values())
      .reduce((sum, subs) => sum + subs.length, 0);

    return {
      isMonitoring: this.isMonitoring,
      targetsMonitored: this.subscriptions.size,
      totalSubscriptions,
      subscriptionsByTarget: Object.fromEntries(
        Array.from(this.subscriptions.entries()).map(([target, subs]) => [
          target, 
          subs.length
        ])
      )
    };
  }

  /**
   * Force update all terminals
   */
  public async forceUpdateAll(): Promise<void> {
    console.log('🔄 Force updating all terminals...');
    await this.checkAllTerminals();
  }

  /**
   * Cleanup on shutdown
   */
  public cleanup(): void {
    console.log('🧹 Cleaning up terminal WebSocket manager...');
    this.stopMonitoring();
    this.subscriptions.clear();
  }
}

export default TerminalWebSocketManager;