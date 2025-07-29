/**
 * ServerManager - Timer lifecycle management for memory leak prevention
 * 
 * Centralizes all setInterval operations to ensure proper cleanup
 * and prevent memory leaks during server shutdown or restarts.
 */

export class ServerManager {
  private intervals: NodeJS.Timeout[] = [];
  private timeouts: NodeJS.Timeout[] = [];
  private isShuttingDown = false;

  /**
   * Wrapper for setInterval with automatic tracking
   */
  setInterval(callback: () => void | Promise<void>, ms: number): NodeJS.Timeout {
    if (this.isShuttingDown) {
      console.warn('⚠️  Attempted to create interval during shutdown');
      return setTimeout(() => {}, 0); // Return dummy timeout
    }

    const interval = setInterval(async () => {
      try {
        await callback();
      } catch (error) {
        console.error('❌ Error in interval callback:', error);
      }
    }, ms);

    this.intervals.push(interval);
    console.log(`⏰ Created interval (${ms}ms). Total active: ${this.intervals.length}`);
    
    return interval;
  }

  /**
   * Wrapper for setTimeout with automatic tracking
   */
  setTimeout(callback: () => void | Promise<void>, ms: number): NodeJS.Timeout {
    if (this.isShuttingDown) {
      console.warn('⚠️  Attempted to create timeout during shutdown');
      return setTimeout(() => {}, 0); // Return dummy timeout
    }

    const timeout = setTimeout(async () => {
      try {
        await callback();
      } catch (error) {
        console.error('❌ Error in timeout callback:', error);
      } finally {
        // Remove from tracking array when completed
        const index = this.timeouts.indexOf(timeout);
        if (index > -1) {
          this.timeouts.splice(index, 1);
        }
      }
    }, ms);

    this.timeouts.push(timeout);
    console.log(`⏱️  Created timeout (${ms}ms). Total active: ${this.timeouts.length}`);
    
    return timeout;
  }

  /**
   * Clear a specific interval
   */
  clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    const index = this.intervals.indexOf(interval);
    if (index > -1) {
      this.intervals.splice(index, 1);
      console.log(`🧹 Cleared interval. Remaining: ${this.intervals.length}`);
    }
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(timeout: NodeJS.Timeout): void {
    clearTimeout(timeout);
    const index = this.timeouts.indexOf(timeout);
    if (index > -1) {
      this.timeouts.splice(index, 1);
      console.log(`🧹 Cleared timeout. Remaining: ${this.timeouts.length}`);
    }
  }

  /**
   * Get current timer statistics
   */
  getStats() {
    return {
      activeIntervals: this.intervals.length,
      activeTimeouts: this.timeouts.length,
      isShuttingDown: this.isShuttingDown
    };
  }

  /**
   * Clean up all intervals and timeouts
   */
  cleanup(): void {
    console.log(`🧹 Starting cleanup: ${this.intervals.length} intervals, ${this.timeouts.length} timeouts`);
    
    this.isShuttingDown = true;

    // Clear all intervals
    this.intervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.intervals = [];

    // Clear all timeouts
    this.timeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.timeouts = [];

    console.log('✅ All timers cleaned up successfully');
  }

  /**
   * Force shutdown - for emergency cleanup
   */
  forceShutdown(): void {
    console.log('🚨 Force shutdown initiated');
    this.cleanup();
  }

  /**
   * Health check for timer leaks
   */
  healthCheck(): { status: 'healthy' | 'warning' | 'critical', message: string } {
    const totalTimers = this.intervals.length + this.timeouts.length;
    
    if (totalTimers === 0) {
      return { status: 'healthy', message: 'No active timers' };
    } else if (totalTimers < 10) {
      return { 
        status: 'healthy', 
        message: `${totalTimers} active timers (normal)` 
      };
    } else if (totalTimers < 50) {
      return { 
        status: 'warning', 
        message: `${totalTimers} active timers (monitor for leaks)` 
      };
    } else {
      return { 
        status: 'critical', 
        message: `${totalTimers} active timers (potential memory leak!)` 
      };
    }
  }
}

// Singleton instance
export const serverManager = new ServerManager();

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('📡 SIGTERM received, cleaning up timers...');
  serverManager.cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📡 SIGINT received, cleaning up timers...');
  serverManager.cleanup();
  process.exit(0);
});

process.on('exit', () => {
  console.log('📡 Process exit, final cleanup...');
  serverManager.forceShutdown();
});

export default serverManager;