import { exec } from 'child_process';
import { promisify } from 'util';

import { ActivityInfo, ActivityType, ACTIVITY_DETECTION_CONFIG } from '../../types/index';
import { TmuxError, logError, withErrorHandling, withRetry } from '../utils/errorHandler';
import { activityPatterns } from './activityPatterns';
import { detectUsageLimit, saveUsageLimitToDatabase } from './taskManager';

const execAsync = promisify(exec);

/**
 * Agent target configuration for tmux session monitoring
 */
export interface AgentTarget {
  name: string;
  target: string;
}

/**
 * Terminal output monitoring result
 */
export interface TerminalMonitorResult {
  agentName: string;
  hasNewActivity: boolean;
  activityInfo?: ActivityInfo;
  isIdle: boolean;
  lastOutput: string;
  timestamp: Date;
}

/**
 * Performance metrics for monitoring optimization
 */
interface PerformanceMetrics {
  totalOutputsProcessed: number;
  averageOutputSize: number;
  memoryUsage: number;
  patternMatchingTime: number;
  bufferHits: number;
  bufferMisses: number;
  cleanupOperations: number;
  lastCleanupTime: Date;
}

/**
 * Enhanced circular buffer for efficient terminal output storage with compression
 * Requirement 5.1: Implement efficient terminal output buffering
 */
class CircularBuffer {
  private buffer: string[];
  private size: number;
  private index: number = 0;
  private full: boolean = false;
  private compressionEnabled: boolean;
  private compressionThreshold: number;
  private totalWrites: number = 0;
  private totalReads: number = 0;
  private compressionRatio: number = 0;

  constructor(size: number, compressionEnabled: boolean = true, compressionThreshold: number = 1000) {
    this.size = size;
    this.buffer = new Array(size);
    this.compressionEnabled = compressionEnabled;
    this.compressionThreshold = compressionThreshold;
  }

  add(item: string): void {
    this.totalWrites++;

    // Apply compression for large items if enabled
    const processedItem = this.compressionEnabled && item.length > this.compressionThreshold
      ? this.compressOutput(item)
      : item;

    this.buffer[this.index] = processedItem;
    this.index = (this.index + 1) % this.size;
    if (this.index === 0) {
      this.full = true;
    }
  }

  getRecent(count: number = this.size): string[] {
    this.totalReads++;

    if (!this.full && this.index === 0) return [];

    const result: string[] = [];
    const actualCount = Math.min(count, this.full ? this.size : this.index);

    for (let i = 0; i < actualCount; i++) {
      const bufferIndex = this.full
        ? (this.index - actualCount + i + this.size) % this.size
        : i;
      const item = this.buffer[bufferIndex];
      result.push(item || '');
    }

    return result;
  }

  clear(): void {
    this.buffer.fill('');
    this.index = 0;
    this.full = false;
    this.totalWrites = 0;
    this.totalReads = 0;
    this.compressionRatio = 0;
  }

  getMemoryUsage(): number {
    return this.buffer.reduce((total, item) => total + (item?.length || 0), 0);
  }

  /**
   * Compress terminal output by removing redundant information
   * Requirement 5.1: Implement efficient terminal output buffering
   */
  private compressOutput(output: string): string {
    const originalLength = output.length;

    // Remove excessive whitespace and empty lines
    let compressed = output
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Reduce multiple empty lines to double
      .replace(/[ \t]+/g, ' ') // Reduce multiple spaces/tabs to single space
      .replace(/^\s+|\s+$/gm, '') // Trim lines
      .split('\n')
      .filter((line, index, array) => {
        // Remove duplicate consecutive lines (common in terminal output)
        return index === 0 || line !== array[index - 1];
      })
      .join('\n');

    // If still too large, keep only the most recent and important parts
    if (compressed.length > this.compressionThreshold * 0.8) {
      const lines = compressed.split('\n');
      const importantLines = lines.filter(line => {
        // Keep lines that contain important information
        return /(?:error|warning|success|completed|failed|creating|writing|executing|function|class|import|export)/i.test(line);
      });

      // If we have important lines, use them; otherwise, use recent lines
      if (importantLines.length > 0 && importantLines.length < lines.length * 0.7) {
        compressed = importantLines.join('\n');
      } else {
        // Keep recent lines
        const recentLines = lines.slice(-Math.floor(this.compressionThreshold / 50));
        compressed = recentLines.join('\n');
      }
    }

    // Update compression ratio
    this.compressionRatio = originalLength > 0 ? (originalLength - compressed.length) / originalLength : 0;

    return compressed;
  }

  /**
   * Get buffer statistics for performance monitoring
   */
  getStats(): {
    size: number;
    used: number;
    totalWrites: number;
    totalReads: number;
    compressionRatio: number;
    memoryUsage: number;
    efficiency: number;
  } {
    const used = this.full ? this.size : this.index;
    const efficiency = this.totalReads > 0 ? (this.totalReads / (this.totalWrites + this.totalReads)) : 0;

    return {
      size: this.size,
      used,
      totalWrites: this.totalWrites,
      totalReads: this.totalReads,
      compressionRatio: this.compressionRatio,
      memoryUsage: this.getMemoryUsage(),
      efficiency
    };
  }
}

/**
 * TerminalOutputMonitor class for detecting agent activity from terminal output
 * Implements requirements 1.1, 1.2, 1.3 for real-time agent activity detection
 * Enhanced with performance optimizations for requirement 5.1, 5.2, 5.3
 */
export class TerminalOutputMonitor {
  private lastOutputs: Map<string, string> = new Map();
  private activityTimestamps: Map<string, Date> = new Map();
  private lastActivityDetected: Map<string, Date> = new Map();
  private onUsageLimit?: (errorMessage: string) => Promise<void>;

  // Performance optimization: Circular buffers for efficient memory usage
  private outputBuffers: Map<string, CircularBuffer> = new Map();
  private performanceMetrics: PerformanceMetrics;
  private readonly maxBufferSize: number;
  private readonly cleanupInterval: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  // Agent target configurations
  private readonly agentTargets: AgentTarget[] = [
    { name: 'president', target: 'president' },
    { name: 'boss1', target: 'multiagent:0.0' },
    { name: 'worker1', target: 'multiagent:0.1' },
    { name: 'worker2', target: 'multiagent:0.2' },
    { name: 'worker3', target: 'multiagent:0.3' }
  ];

  constructor(onUsageLimit?: (errorMessage: string) => Promise<void>) {
    this.maxBufferSize = ACTIVITY_DETECTION_CONFIG.OUTPUT_BUFFER_SIZE;
    this.cleanupInterval = 300000; // 5 minutes
    this.onUsageLimit = onUsageLimit;

    // Initialize performance metrics
    this.performanceMetrics = {
      totalOutputsProcessed: 0,
      averageOutputSize: 0,
      memoryUsage: 0,
      patternMatchingTime: 0,
      bufferHits: 0,
      bufferMisses: 0,
      cleanupOperations: 0,
      lastCleanupTime: new Date()
    };

    // Initialize circular buffers for each agent
    for (const agent of this.agentTargets) {
      this.outputBuffers.set(agent.name, new CircularBuffer(this.maxBufferSize));
    }

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Monitor all agents for activity changes
   * Requirement 1.1: Real-time agent activity detection
   */
  public async monitorAllAgents(): Promise<TerminalMonitorResult[]> {
    const results: TerminalMonitorResult[] = [];


    for (const agent of this.agentTargets) {
      try {

        const result = await this.monitorAgentActivity(agent);
        results.push(result);


      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(error instanceof Error ? error : new Error(errorMessage),
          `TerminalOutputMonitor.monitorAllAgents.${agent.name}`);

        console.error(`Failed to monitor ${agent.name}: ${errorMessage}`);

        // Return error state for failed monitoring
        results.push({
          agentName: agent.name,
          hasNewActivity: false,
          isIdle: true,
          lastOutput: '',
          timestamp: new Date()
        });
      }
    }

    return results;
  }

  /**
   * Monitor a specific agent for activity
   * Requirement 1.1: Detect when agent terminal has new output
   * Enhanced with performance optimizations
   */
  public async monitorAgentActivity(agent: AgentTarget): Promise<TerminalMonitorResult> {
    const currentOutput = await this.captureTerminalOutput(agent);
    const previousOutput = this.lastOutputs.get(agent.name) || '';
    const timestamp = new Date();

    // Optimize output processing with buffering
    const optimizedOutput = this.optimizeOutputProcessing(agent.name, currentOutput);

    // Usage limit 検知をターミナル出力から実行
    if (currentOutput && detectUsageLimit(currentOutput)) {
      await saveUsageLimitToDatabase(currentOutput);
      
      // Usage limit 処理を実行 (import が必要)
      if (this.onUsageLimit) {
        await this.onUsageLimit(currentOutput);
      }
    }

    // Store current output for next comparison
    this.lastOutputs.set(agent.name, optimizedOutput);

    // Detect activity from output comparison
    const activityInfo = this.detectActivityFromOutput(optimizedOutput, previousOutput, agent.name);
    const hasNewActivity = activityInfo !== null;

    // Update activity timestamps if new activity detected
    if (hasNewActivity && activityInfo) {
      this.activityTimestamps.set(agent.name, timestamp);
      this.lastActivityDetected.set(agent.name, timestamp);
    }

    // Check if agent is idle based on timeout
    const isIdle = this.isAgentIdle(agent.name, optimizedOutput);

    return {
      agentName: agent.name,
      hasNewActivity,
      activityInfo: activityInfo || undefined,
      isIdle,
      lastOutput: optimizedOutput,
      timestamp
    };
  }

  /**
   * Capture terminal output with timeout handling and retry logic
   * Requirement: Implement terminal output capture with timeout handling
   */
  private async captureTerminalOutput(agent: AgentTarget): Promise<string> {
    const captureWithRetry = withRetry(
      async () => {
        const timeoutMs = 3000; // 3 second timeout for tests
        const command = `tmux capture-pane -t "${agent.target}" -p`;


        try {
          const { stdout, stderr } = await Promise.race([
            execAsync(command),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new TmuxError('Terminal capture timeout', agent.target)), timeoutMs)
            )
          ]);

          if (stderr) {
            console.warn(`Terminal capture warning for ${agent.name}: ${stderr}`);
          }

          const output = stdout || '';

          return output;
        } catch (timeoutError) {
          if (timeoutError instanceof TmuxError && timeoutError.message.includes('timeout')) {
            console.warn(`Terminal capture timeout for ${agent.name}`);
            return ''; // Return empty string on timeout
          }
          throw timeoutError;
        }
      },
      2, // Max 2 retries for terminal capture
      1000 // 1 second delay between retries
    );

    try {
      return await captureWithRetry();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(error instanceof Error ? error : new TmuxError(errorMessage, agent.target),
        `TerminalOutputMonitor.captureTerminalOutput.${agent.name}`);

      console.warn(`Failed to capture terminal output for ${agent.name} after retries: ${errorMessage}`);
      return '';
    }
  }

  /**
   * Detect activity from output comparison
   * Requirement 1.2: Add output comparison logic to detect new activity
   */
  private detectActivityFromOutput(
    currentOutput: string,
    previousOutput: string,
    agentName: string
  ): ActivityInfo | null {
    try {

      // If outputs are identical, no new activity
      if (currentOutput === previousOutput) {
        return null;
      }

      // Get the new content (difference between current and previous)
      const newContent = this.extractNewContent(currentOutput, previousOutput);

      if (!newContent.trim()) {
        return null;
      }


      // Use activity patterns to analyze the new content
      const matchedPattern = activityPatterns.findBestMatch(newContent);

      if (!matchedPattern) {
        // Default to thinking if we detect new content but no specific pattern
        return {
          activityType: 'thinking',
          description: 'Processing...',
          timestamp: new Date()
        };
      }


      // Extract additional context based on activity type
      const fileName = this.extractFileName(newContent);
      const command = this.extractCommand(newContent);

      const activityInfo: ActivityInfo = {
        activityType: matchedPattern.activityType,
        description: this.generateActivityDescription(matchedPattern.activityType, newContent),
        timestamp: new Date(),
        fileName,
        command
      };


      return activityInfo;

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)),
        `TerminalOutputMonitor.detectActivityFromOutput.${agentName}`);

      // Return safe fallback
      return {
        activityType: 'idle',
        description: 'Activity detection error',
        timestamp: new Date()
      };
    }
  }

  /**
   * Extract new content from terminal output
   */
  private extractNewContent(currentOutput: string, previousOutput: string): string {
    // Simple approach: if current is longer, take the difference
    if (currentOutput.length > previousOutput.length) {
      return currentOutput.slice(previousOutput.length);
    }

    // If outputs are completely different, analyze the last portion
    const lines = currentOutput.split('\n');
    const recentLines = lines.slice(-ACTIVITY_DETECTION_CONFIG.OUTPUT_BUFFER_SIZE);
    return recentLines.join('\n');
  }

  /**
   * Check if agent is idle based on timeout and output patterns
   * Requirement 1.3: Implement idle timeout detection
   */
  private isAgentIdle(agentName: string, currentOutput: string): boolean {
    const now = new Date();
    const lastActivity = this.lastActivityDetected.get(agentName);

    // If output is empty (terminal capture failed), consider idle
    if (!currentOutput || currentOutput.trim() === '') {
      return true;
    }

    // Check for explicit idle patterns in current output
    const idlePatterns = activityPatterns.getPatternsByType('idle');
    const hasIdlePattern = idlePatterns.some(pattern => pattern.pattern.test(currentOutput));

    if (hasIdlePattern) {
      return true;
    }

    // Check for common idle indicators
    const commonIdlePatterns = [
      /Human:\s*$/m,
      /\?\s*for\s*shortcuts/i,
      /Waiting\s+for\s+input/i,
      /Task\s+completed.*Human:/i
    ];

    const hasCommonIdlePattern = commonIdlePatterns.some(pattern => pattern.test(currentOutput));
    if (hasCommonIdlePattern) {
      return true;
    }

    // Check timeout-based idle detection
    if (lastActivity) {
      const timeSinceLastActivity = now.getTime() - lastActivity.getTime();
      return timeSinceLastActivity > ACTIVITY_DETECTION_CONFIG.IDLE_TIMEOUT;
    }

    // If no previous activity recorded, consider idle
    return true;
  }

  /**
   * Extract file name from terminal output
   */
  private extractFileName(output: string): string | undefined {
    // Look for common file patterns (ordered by specificity)
    const filePatterns = [
      /Working with\s*["']([^"']+)["']/i,
      /(?:fsWrite|strReplace|fsAppend).*?["']([^"']+\.(?:tsx?|jsx?|py|go|java|cpp|c|rs|php|rb|swift|kt|html|css|json|yaml|xml))["']/i,
      /(?:Creating|Writing to|Editing|Reading|Modifying)\s+(?:file|script|component):\s*([\w\-\.\/]+)/i,
      /touch\s+([\w\-\.\/]+\.(?:tsx?|jsx?|py|go|java|cpp|c|rs|php|rb|swift|kt|html|css|json|yaml|xml))/i,
      /\b([\w\-\.\/]+\.(?:tsx?|jsx?|py|go|java|cpp|c|rs|php|rb|swift|kt|html|css|json|yaml|xml))\b/i
    ];

    for (const pattern of filePatterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extract command from terminal output
   */
  private extractCommand(output: string): string | undefined {
    // Look for command execution patterns
    const commandPatterns = [
      /(?:\$|#|>)\s+([\w\-\.\/\s\-\-]+)/i,
      /(?:Running|Executing|Starting):\s*([^\n\r]+)/i,
      /executeBash.*?command\s*["']([^"']+)["']/i
    ];

    for (const pattern of commandPatterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Generate human-readable activity description
   */
  private generateActivityDescription(activityType: ActivityType, output: string): string {
    const truncatedOutput = output.slice(0, 100).replace(/\n/g, ' ').trim();

    switch (activityType) {
      case 'coding':
        return `Writing code: ${truncatedOutput}`;
      case 'file_operation':
        return `File operation: ${truncatedOutput}`;
      case 'command_execution':
        return `Executing command: ${truncatedOutput}`;
      case 'thinking':
        return `Analyzing: ${truncatedOutput}`;
      case 'idle':
        return 'Waiting for input';
      default:
        return `Activity: ${truncatedOutput}`;
    }
  }



  /**
   * Get the last activity timestamp for an agent
   * Requirement 1.3: Create activity timestamp tracking system
   */
  public getLastActivityTimestamp(agentName: string): Date | undefined {
    return this.lastActivityDetected.get(agentName);
  }

  /**
   * Get the last output for an agent
   */
  public getLastOutput(agentName: string): string | undefined {
    return this.lastOutputs.get(agentName);
  }

  /**
   * Reset monitoring state for an agent
   */
  public resetAgentState(agentName: string): void {
    this.lastOutputs.delete(agentName);
    this.activityTimestamps.delete(agentName);
    this.lastActivityDetected.delete(agentName);
  }

  /**
   * Reset all monitoring state
   */
  public resetAllState(): void {
    this.lastOutputs.clear();
    this.activityTimestamps.clear();
    this.lastActivityDetected.clear();
  }

  /**
   * Get monitoring statistics
   */
  public getMonitoringStats(): {
    monitoredAgents: number;
    agentsWithActivity: number;
    agentsWithRecentActivity: number;
  } {
    const now = new Date();
    const recentThreshold = 60000; // 1 minute

    return {
      monitoredAgents: this.agentTargets.length,
      agentsWithActivity: this.lastActivityDetected.size,
      agentsWithRecentActivity: Array.from(this.lastActivityDetected.values())
        .filter(timestamp => now.getTime() - timestamp.getTime() < recentThreshold)
        .length
    };
  }

  /**
   * Start periodic cleanup to manage memory usage
   * Requirement 5.2: Add memory cleanup for old activity data
   */
  private startPeriodicCleanup(): void {
    // Clear existing timer first
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.performMemoryCleanup();
    }, this.cleanupInterval);
  }

  /**
   * Enhanced memory cleanup operations with adaptive thresholds
   * Requirement 5.2: Add memory cleanup for old activity data
   */
  private performMemoryCleanup(): void {
    const startTime = Date.now();
    const now = new Date();
    let cleanedItems = 0;
    let memoryFreed = 0;


    // Adaptive cleanup based on current memory usage
    const currentMemoryMB = this.performanceMetrics.memoryUsage / (1024 * 1024);
    const isHighMemory = currentMemoryMB > 50; // 50MB threshold
    const isCriticalMemory = currentMemoryMB > 100; // 100MB threshold

    // Determine cleanup aggressiveness based on memory pressure
    const maxAge = isCriticalMemory ? 1800000 : // 30 minutes for critical
      isHighMemory ? 3600000 : // 1 hour for high
        7200000; // 2 hours for normal

    // Clean old activity timestamps with size tracking
    for (const [agentName, timestamp] of this.activityTimestamps.entries()) {
      if (now.getTime() - timestamp.getTime() > maxAge) {
        const itemSize = agentName.length + 24; // Approximate size
        this.activityTimestamps.delete(agentName);
        cleanedItems++;
        memoryFreed += itemSize;
      }
    }

    // Clean old last activity timestamps
    for (const [agentName, timestamp] of this.lastActivityDetected.entries()) {
      if (now.getTime() - timestamp.getTime() > maxAge) {
        const itemSize = agentName.length + 24; // Approximate size
        this.lastActivityDetected.delete(agentName);
        cleanedItems++;
        memoryFreed += itemSize;
      }
    }

    // Clean old terminal outputs if memory pressure is high
    if (isHighMemory) {
      for (const [agentName, output] of this.lastOutputs.entries()) {
        const outputAge = now.getTime() - (this.lastActivityDetected.get(agentName)?.getTime() || now.getTime());
        if (outputAge > maxAge / 2) { // More aggressive for outputs
          const outputSize = output.length;
          this.lastOutputs.set(agentName, this.truncateOutput(output, 0.5)); // Truncate to 50%
          memoryFreed += outputSize - this.lastOutputs.get(agentName)!.length;
          cleanedItems++;
        }
      }
    }

    // Compress circular buffers if critical memory
    if (isCriticalMemory) {
      for (const [agentName, buffer] of this.outputBuffers.entries()) {
        const beforeSize = buffer.getMemoryUsage();
        buffer.clear();
        // Reinitialize with smaller size temporarily
        this.outputBuffers.set(agentName, new CircularBuffer(Math.floor(this.maxBufferSize * 0.5)));
        const afterSize = this.outputBuffers.get(agentName)!.getMemoryUsage();
        memoryFreed += beforeSize - afterSize;
        cleanedItems++;
      }
    }

    // Force garbage collection hint (if available)
    if (isCriticalMemory && global.gc) {
      try {
        global.gc();
      } catch (error) {
        // Ignore if gc is not available
      }
    }

    // Update memory usage metrics
    this.updateMemoryMetrics();

    const cleanupDuration = Date.now() - startTime;
    this.performanceMetrics.cleanupOperations++;
    this.performanceMetrics.lastCleanupTime = now;

  }

  /**
   * Truncate output with optional ratio or default intelligent truncation
   * Requirement 5.1: Implement efficient terminal output buffering
   */
  private truncateOutput(output: string, ratio?: number): string {
    // If ratio is provided, use ratio-based truncation
    if (ratio !== undefined) {
      if (output.length <= 1000) return output; // Don't truncate small outputs

      const targetLength = Math.floor(output.length * ratio);
      const lines = output.split('\n');

      // Keep important lines and recent lines
      const importantLines = lines.filter(line =>
        /(?:error|warning|success|completed|failed|creating|writing|executing)/i.test(line)
      );

      const recentLines = lines.slice(-Math.floor(lines.length * 0.3));
      const combinedLines = [...new Set([...importantLines, ...recentLines])];

      let result = combinedLines.join('\n');

      // If still too long, truncate more aggressively
      if (result.length > targetLength) {
        result = result.substring(0, targetLength) + '\n... [truncated for memory optimization]';
      }

      return result;
    }

    // Default intelligent truncation - always truncate if over buffer size
    const lines = output.split('\n');

    // If too many lines, truncate by lines
    if (lines.length > this.maxBufferSize) {
      const recentLines = lines.slice(-this.maxBufferSize);
      return recentLines.join('\n');
    }

    // If single line is too long, truncate by characters
    if (output.length > this.maxBufferSize * 100) { // 100 chars per line average
      return output.substring(0, this.maxBufferSize * 100) + '\n... [truncated for performance]';
    }

    return output;
  }

  /**
   * Update memory usage metrics
   */
  private updateMemoryMetrics(): void {
    let totalMemory = 0;

    // Calculate memory usage from output buffers
    for (const buffer of this.outputBuffers.values()) {
      totalMemory += buffer.getMemoryUsage();
    }

    // Add memory from stored outputs
    for (const output of this.lastOutputs.values()) {
      totalMemory += output.length;
    }

    this.performanceMetrics.memoryUsage = totalMemory;
  }

  /**
   * Get performance metrics
   * Requirement 5.3: Create monitoring metrics for system performance
   */
  public getPerformanceMetrics(): PerformanceMetrics & {
    bufferEfficiency: number;
    averageCleanupTime: number;
    memoryUsageMB: number;
  } {
    const bufferEfficiency = this.performanceMetrics.bufferHits + this.performanceMetrics.bufferMisses > 0
      ? (this.performanceMetrics.bufferHits / (this.performanceMetrics.bufferHits + this.performanceMetrics.bufferMisses)) * 100
      : 0;

    return {
      ...this.performanceMetrics,
      bufferEfficiency,
      averageCleanupTime: this.cleanupInterval,
      memoryUsageMB: this.performanceMetrics.memoryUsage / (1024 * 1024)
    };
  }

  /**
   * Optimize terminal output processing with buffering
   * Requirement 5.1: Implement efficient terminal output buffering
   */
  private optimizeOutputProcessing(agentName: string, output: string): string {
    const startTime = Date.now();

    // Get or create buffer for agent
    let buffer = this.outputBuffers.get(agentName);
    if (!buffer) {
      buffer = new CircularBuffer(this.maxBufferSize);
      this.outputBuffers.set(agentName, buffer);
      this.performanceMetrics.bufferMisses++;
    } else {
      this.performanceMetrics.bufferHits++;
    }

    // Add current output to buffer
    buffer.add(output);

    // Update performance metrics
    this.performanceMetrics.totalOutputsProcessed++;

    // Calculate running average of output size
    const currentAvg = this.performanceMetrics.averageOutputSize;
    const count = this.performanceMetrics.totalOutputsProcessed;
    this.performanceMetrics.averageOutputSize =
      (currentAvg * (count - 1) + output.length) / count;

    // Track processing time
    const processingTime = Date.now() - startTime;
    this.performanceMetrics.patternMatchingTime =
      (this.performanceMetrics.patternMatchingTime + processingTime) / 2;

    // Return optimized output (truncated if necessary)
    const truncatedOutput = this.truncateOutput(output);

    // Update memory usage
    this.updateMemoryMetrics();

    return truncatedOutput;
  }



  /**
   * Cleanup resources and stop timers
   */
  public cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear all buffers
    for (const buffer of this.outputBuffers.values()) {
      buffer.clear();
    }

    // Clear maps
    this.lastOutputs.clear();
    this.activityTimestamps.clear();
    this.lastActivityDetected.clear();
    this.outputBuffers.clear();

  }

  /**
   * Set usage limit callback after initialization
   */
  setUsageLimitCallback(callback: (errorMessage: string) => Promise<void>): void {
    this.onUsageLimit = callback;
  }
}