import { TerminalOutputMonitor } from './terminalOutputMonitor';
import { ActivityAnalyzer } from './activityAnalyzer';
import { AgentActivityMonitoringService } from './agentActivityMonitoringService';
import { logError } from '../utils/errorHandler';

/**
 * System performance optimization metrics
 */
export interface OptimizationMetrics {
  timestamp: Date;
  optimizationsPerformed: number;
  memoryOptimizations: number;
  patternOptimizations: number;
  bufferOptimizations: number;
  cacheOptimizations: number;
  totalMemoryFreedMB: number;
  performanceGainPercent: number;
  lastOptimizationTime: Date;
}

/**
 * Optimization strategy configuration
 */
export interface OptimizationConfig {
  memoryThresholdMB: number;
  performanceThresholdMs: number;
  optimizationIntervalMs: number;
  aggressiveOptimizationEnabled: boolean;
  autoOptimizationEnabled: boolean;
  maxOptimizationsPerHour: number;
}

/**
 * Performance Optimizer Service
 * Requirement 5.1, 5.2, 5.3: Comprehensive performance and memory optimization
 * Coordinates optimization across all monitoring services
 */
export class PerformanceOptimizer {
  private terminalMonitor: TerminalOutputMonitor | null = null;
  private activityAnalyzer: ActivityAnalyzer | null = null;
  private monitoringService: AgentActivityMonitoringService | null = null;
  
  private config: OptimizationConfig;
  private metrics: OptimizationMetrics;
  private optimizationTimer: NodeJS.Timeout | null = null;
  private optimizationHistory: OptimizationMetrics[] = [];
  private readonly maxHistorySize: number = 50;
  
  // Optimization tracking
  private hourlyOptimizationCount: number = 0;
  private lastHourReset: Date = new Date();

  constructor(config?: Partial<OptimizationConfig>) {
    this.config = {
      memoryThresholdMB: 75,
      performanceThresholdMs: 3000,
      optimizationIntervalMs: 300000, // 5 minutes
      aggressiveOptimizationEnabled: true,
      autoOptimizationEnabled: true,
      maxOptimizationsPerHour: 12,
      ...config
    };

    this.metrics = {
      timestamp: new Date(),
      optimizationsPerformed: 0,
      memoryOptimizations: 0,
      patternOptimizations: 0,
      bufferOptimizations: 0,
      cacheOptimizations: 0,
      totalMemoryFreedMB: 0,
      performanceGainPercent: 0,
      lastOptimizationTime: new Date()
    };

    console.log(`🔧 [${new Date().toISOString()}] Performance optimizer initialized with config:`, this.config);
  }

  /**
   * Initialize with monitoring services
   */
  public initialize(
    terminalMonitor: TerminalOutputMonitor,
    activityAnalyzer: ActivityAnalyzer,
    monitoringService: AgentActivityMonitoringService
  ): void {
    this.terminalMonitor = terminalMonitor;
    this.activityAnalyzer = activityAnalyzer;
    this.monitoringService = monitoringService;

    if (this.config.autoOptimizationEnabled) {
      this.startAutoOptimization();
    }

    console.log(`🔧 [${new Date().toISOString()}] Performance optimizer initialized with monitoring services`);
  }

  /**
   * Start automatic optimization
   */
  public startAutoOptimization(): void {
    if (this.optimizationTimer) {
      console.warn('⚠️ Auto optimization is already running');
      return;
    }

    this.optimizationTimer = setInterval(() => {
      this.performAutomaticOptimization();
    }, this.config.optimizationIntervalMs);

    console.log(`🔧 [${new Date().toISOString()}] Auto optimization started with ${this.config.optimizationIntervalMs}ms interval`);
  }

  /**
   * Stop automatic optimization
   */
  public stopAutoOptimization(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = null;
    }

    console.log(`🔧 [${new Date().toISOString()}] Auto optimization stopped`);
  }

  /**
   * Perform comprehensive system optimization
   * Requirement 5.1, 5.2, 5.3: Optimize performance and memory usage
   */
  public async performComprehensiveOptimization(): Promise<OptimizationMetrics> {
    const startTime = Date.now();
    const beforeMetrics = await this.collectCurrentMetrics();
    
    console.log(`🔧 [${new Date().toISOString()}] Starting comprehensive performance optimization`);

    let optimizationsPerformed = 0;
    let memoryFreedMB = 0;

    try {
      // 1. Memory optimization
      const memoryResult = await this.optimizeMemoryUsage();
      optimizationsPerformed += memoryResult.optimizations;
      memoryFreedMB += memoryResult.memoryFreedMB;

      // 2. Pattern matching optimization
      const patternResult = await this.optimizePatternMatching();
      optimizationsPerformed += patternResult.optimizations;

      // 3. Buffer optimization
      const bufferResult = await this.optimizeBuffers();
      optimizationsPerformed += bufferResult.optimizations;
      memoryFreedMB += bufferResult.memoryFreedMB;

      // 4. Cache optimization
      const cacheResult = await this.optimizeCaches();
      optimizationsPerformed += cacheResult.optimizations;
      memoryFreedMB += cacheResult.memoryFreedMB;

      // 5. System-level optimization
      const systemResult = await this.optimizeSystemPerformance();
      optimizationsPerformed += systemResult.optimizations;

      // Calculate performance gain
      const afterMetrics = await this.collectCurrentMetrics();
      const performanceGain = this.calculatePerformanceGain(beforeMetrics, afterMetrics);

      // Update metrics
      const optimizationMetrics: OptimizationMetrics = {
        timestamp: new Date(),
        optimizationsPerformed,
        memoryOptimizations: memoryResult.optimizations,
        patternOptimizations: patternResult.optimizations,
        bufferOptimizations: bufferResult.optimizations,
        cacheOptimizations: cacheResult.optimizations,
        totalMemoryFreedMB: memoryFreedMB,
        performanceGainPercent: performanceGain,
        lastOptimizationTime: new Date()
      };

      this.updateMetrics(optimizationMetrics);

      const duration = Date.now() - startTime;
      console.log(`✅ [${new Date().toISOString()}] Comprehensive optimization completed in ${duration}ms:`, {
        optimizations: optimizationsPerformed,
        memoryFreedMB: Math.round(memoryFreedMB * 100) / 100,
        performanceGain: Math.round(performanceGain * 100) / 100 + '%'
      });

      return optimizationMetrics;

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PerformanceOptimizer.performComprehensiveOptimization');
      throw error;
    }
  }

  /**
   * Optimize memory usage across all services
   * Requirement 5.2: Add memory cleanup for old activity data
   */
  private async optimizeMemoryUsage(): Promise<{ optimizations: number; memoryFreedMB: number }> {
    let optimizations = 0;
    let memoryFreedMB = 0;

    console.log(`🧹 [${new Date().toISOString()}] Starting memory optimization`);

    try {
      // Get current memory usage
      const beforeMemory = await this.getCurrentMemoryUsage();

      // Force garbage collection if available
      if (global.gc && beforeMemory > this.config.memoryThresholdMB) {
        global.gc();
        optimizations++;
        console.log(`🗑️ [${new Date().toISOString()}] Forced garbage collection`);
      }

      // Optimize terminal monitor memory
      if (this.terminalMonitor) {
        const terminalBefore = this.terminalMonitor.getPerformanceMetrics().memoryUsageMB;
        // Trigger cleanup through private method access (would need to be made public)
        // For now, we'll use the public cleanup method
        this.terminalMonitor.resetAllState();
        const terminalAfter = this.terminalMonitor.getPerformanceMetrics().memoryUsageMB;
        memoryFreedMB += Math.max(0, terminalBefore - terminalAfter);
        optimizations++;
      }

      // Optimize activity analyzer memory
      if (this.activityAnalyzer) {
        const analyzerBefore = this.activityAnalyzer.getPerformanceMetrics().memoryUsageKB;
        this.activityAnalyzer.clearCache();
        const analyzerAfter = this.activityAnalyzer.getPerformanceMetrics().memoryUsageKB;
        memoryFreedMB += Math.max(0, (analyzerBefore - analyzerAfter) / 1024);
        optimizations++;
      }

      const afterMemory = await this.getCurrentMemoryUsage();
      const actualMemoryFreed = Math.max(0, beforeMemory - afterMemory);
      
      console.log(`✅ [${new Date().toISOString()}] Memory optimization completed:`, {
        optimizations,
        memoryFreedMB: Math.round(actualMemoryFreed * 100) / 100,
        beforeMB: Math.round(beforeMemory * 100) / 100,
        afterMB: Math.round(afterMemory * 100) / 100
      });

      return { optimizations, memoryFreedMB: actualMemoryFreed };

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PerformanceOptimizer.optimizeMemoryUsage');
      return { optimizations, memoryFreedMB };
    }
  }

  /**
   * Optimize pattern matching performance
   * Requirement 5.3: Optimize pattern matching performance
   */
  private async optimizePatternMatching(): Promise<{ optimizations: number }> {
    let optimizations = 0;

    console.log(`⚡ [${new Date().toISOString()}] Starting pattern matching optimization`);

    try {
      if (this.activityAnalyzer) {
        const beforeMetrics = this.activityAnalyzer.getPerformanceMetrics();
        
        // Clear and rebuild cache to remove stale entries
        this.activityAnalyzer.clearCache();
        optimizations++;

        // The pattern reordering happens automatically in the analyzer
        // based on usage statistics, so we just need to trigger it
        
        const afterMetrics = this.activityAnalyzer.getPerformanceMetrics();
        
        console.log(`✅ [${new Date().toISOString()}] Pattern matching optimization completed:`, {
          optimizations,
          cacheCleared: true,
          beforeCacheSize: beforeMetrics.cacheSize,
          afterCacheSize: afterMetrics.cacheSize
        });
      }

      return { optimizations };

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PerformanceOptimizer.optimizePatternMatching');
      return { optimizations };
    }
  }

  /**
   * Optimize buffer usage
   * Requirement 5.1: Implement efficient terminal output buffering
   */
  private async optimizeBuffers(): Promise<{ optimizations: number; memoryFreedMB: number }> {
    let optimizations = 0;
    let memoryFreedMB = 0;

    console.log(`📊 [${new Date().toISOString()}] Starting buffer optimization`);

    try {
      if (this.terminalMonitor) {
        const beforeMetrics = this.terminalMonitor.getPerformanceMetrics();
        
        // Reset buffers to clear old data
        this.terminalMonitor.resetAllState();
        optimizations++;

        const afterMetrics = this.terminalMonitor.getPerformanceMetrics();
        memoryFreedMB = Math.max(0, beforeMetrics.memoryUsageMB - afterMetrics.memoryUsageMB);

        console.log(`✅ [${new Date().toISOString()}] Buffer optimization completed:`, {
          optimizations,
          memoryFreedMB: Math.round(memoryFreedMB * 100) / 100,
          bufferEfficiencyBefore: Math.round(beforeMetrics.bufferEfficiency * 100) / 100,
          bufferEfficiencyAfter: Math.round(afterMetrics.bufferEfficiency * 100) / 100
        });
      }

      return { optimizations, memoryFreedMB };

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PerformanceOptimizer.optimizeBuffers');
      return { optimizations, memoryFreedMB };
    }
  }

  /**
   * Optimize cache usage
   * Requirement 5.2: Add memory cleanup for old activity data
   */
  private async optimizeCaches(): Promise<{ optimizations: number; memoryFreedMB: number }> {
    let optimizations = 0;
    let memoryFreedMB = 0;

    console.log(`💾 [${new Date().toISOString()}] Starting cache optimization`);

    try {
      if (this.activityAnalyzer) {
        const beforeMetrics = this.activityAnalyzer.getPerformanceMetrics();
        
        // Clear cache if hit rate is low or memory usage is high
        if (beforeMetrics.cacheHitRate < 50 || beforeMetrics.memoryUsageKB > 1024) {
          this.activityAnalyzer.clearCache();
          optimizations++;
          
          const afterMetrics = this.activityAnalyzer.getPerformanceMetrics();
          memoryFreedMB = Math.max(0, (beforeMetrics.memoryUsageKB - afterMetrics.memoryUsageKB) / 1024);
        }

        console.log(`✅ [${new Date().toISOString()}] Cache optimization completed:`, {
          optimizations,
          memoryFreedMB: Math.round(memoryFreedMB * 100) / 100,
          cacheHitRateBefore: Math.round(beforeMetrics.cacheHitRate * 100) / 100,
          memoryUsageKB: Math.round(beforeMetrics.memoryUsageKB * 100) / 100
        });
      }

      return { optimizations, memoryFreedMB };

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PerformanceOptimizer.optimizeCaches');
      return { optimizations, memoryFreedMB };
    }
  }

  /**
   * Optimize system-level performance
   */
  private async optimizeSystemPerformance(): Promise<{ optimizations: number }> {
    let optimizations = 0;

    console.log(`⚙️ [${new Date().toISOString()}] Starting system performance optimization`);

    try {
      if (this.monitoringService) {
        // Trigger monitoring service optimization
        this.monitoringService.optimizePerformance();
        optimizations++;

        console.log(`✅ [${new Date().toISOString()}] System performance optimization completed:`, {
          optimizations
        });
      }

      return { optimizations };

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PerformanceOptimizer.optimizeSystemPerformance');
      return { optimizations };
    }
  }

  /**
   * Perform automatic optimization based on thresholds
   */
  private async performAutomaticOptimization(): Promise<void> {
    try {
      // Check hourly limit
      this.checkHourlyLimit();
      if (this.hourlyOptimizationCount >= this.config.maxOptimizationsPerHour) {
        console.log(`⏰ [${new Date().toISOString()}] Hourly optimization limit reached (${this.config.maxOptimizationsPerHour})`);
        return;
      }

      // Check if optimization is needed
      const needsOptimization = await this.shouldOptimize();
      if (!needsOptimization) {
        return;
      }

      console.log(`🔧 [${new Date().toISOString()}] Automatic optimization triggered`);
      
      // Perform optimization
      await this.performComprehensiveOptimization();
      this.hourlyOptimizationCount++;

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PerformanceOptimizer.performAutomaticOptimization');
    }
  }

  /**
   * Check if optimization is needed based on thresholds
   */
  private async shouldOptimize(): Promise<boolean> {
    try {
      const currentMetrics = await this.collectCurrentMetrics();
      
      // Check memory threshold
      if (currentMetrics.memoryUsageMB > this.config.memoryThresholdMB) {
        console.log(`📊 [${new Date().toISOString()}] Memory threshold exceeded: ${currentMetrics.memoryUsageMB}MB > ${this.config.memoryThresholdMB}MB`);
        return true;
      }

      // Check performance threshold
      if (currentMetrics.averageCheckDuration > this.config.performanceThresholdMs) {
        console.log(`📊 [${new Date().toISOString()}] Performance threshold exceeded: ${currentMetrics.averageCheckDuration}ms > ${this.config.performanceThresholdMs}ms`);
        return true;
      }

      // Check cache efficiency
      if (currentMetrics.cacheHitRate < 60) {
        console.log(`📊 [${new Date().toISOString()}] Cache efficiency low: ${currentMetrics.cacheHitRate}% < 60%`);
        return true;
      }

      return false;

    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'PerformanceOptimizer.shouldOptimize');
      return false;
    }
  }

  /**
   * Collect current system metrics
   */
  private async collectCurrentMetrics(): Promise<{
    memoryUsageMB: number;
    averageCheckDuration: number;
    cacheHitRate: number;
    bufferEfficiency: number;
  }> {
    let memoryUsageMB = 0;
    let averageCheckDuration = 0;
    let cacheHitRate = 0;
    let bufferEfficiency = 0;

    if (this.terminalMonitor) {
      const terminalMetrics = this.terminalMonitor.getPerformanceMetrics();
      memoryUsageMB += terminalMetrics.memoryUsageMB;
      bufferEfficiency = terminalMetrics.bufferEfficiency;
    }

    if (this.activityAnalyzer) {
      const analyzerMetrics = this.activityAnalyzer.getPerformanceMetrics();
      memoryUsageMB += analyzerMetrics.memoryUsageKB / 1024;
      cacheHitRate = analyzerMetrics.cacheHitRate;
    }

    if (this.monitoringService) {
      const serviceMetrics = this.monitoringService.getComprehensiveMetrics();
      averageCheckDuration = serviceMetrics.systemHealth.averageCheckDuration;
      memoryUsageMB += serviceMetrics.memoryUsage.totalMB;
    }

    return {
      memoryUsageMB,
      averageCheckDuration,
      cacheHitRate,
      bufferEfficiency
    };
  }

  /**
   * Get current memory usage
   */
  private async getCurrentMemoryUsage(): Promise<number> {
    const metrics = await this.collectCurrentMetrics();
    return metrics.memoryUsageMB;
  }

  /**
   * Calculate performance gain between metrics
   */
  private calculatePerformanceGain(before: any, after: any): number {
    const memoryGain = before.memoryUsageMB > 0 
      ? ((before.memoryUsageMB - after.memoryUsageMB) / before.memoryUsageMB) * 100 
      : 0;
    
    const speedGain = before.averageCheckDuration > 0 
      ? ((before.averageCheckDuration - after.averageCheckDuration) / before.averageCheckDuration) * 100 
      : 0;

    return (memoryGain + speedGain) / 2;
  }

  /**
   * Update optimization metrics
   */
  private updateMetrics(newMetrics: OptimizationMetrics): void {
    this.metrics = {
      ...this.metrics,
      ...newMetrics,
      optimizationsPerformed: this.metrics.optimizationsPerformed + newMetrics.optimizationsPerformed,
      memoryOptimizations: this.metrics.memoryOptimizations + newMetrics.memoryOptimizations,
      patternOptimizations: this.metrics.patternOptimizations + newMetrics.patternOptimizations,
      bufferOptimizations: this.metrics.bufferOptimizations + newMetrics.bufferOptimizations,
      cacheOptimizations: this.metrics.cacheOptimizations + newMetrics.cacheOptimizations,
      totalMemoryFreedMB: this.metrics.totalMemoryFreedMB + newMetrics.totalMemoryFreedMB
    };

    // Add to history
    this.optimizationHistory.push({ ...newMetrics });
    if (this.optimizationHistory.length > this.maxHistorySize) {
      this.optimizationHistory = this.optimizationHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Check and reset hourly optimization limit
   */
  private checkHourlyLimit(): void {
    const now = new Date();
    const hoursSinceReset = (now.getTime() - this.lastHourReset.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceReset >= 1) {
      this.hourlyOptimizationCount = 0;
      this.lastHourReset = now;
    }
  }

  /**
   * Get optimization metrics
   */
  public getOptimizationMetrics(): OptimizationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get optimization history
   */
  public getOptimizationHistory(): OptimizationMetrics[] {
    return [...this.optimizationHistory];
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`🔧 [${new Date().toISOString()}] Performance optimizer configuration updated:`, newConfig);
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopAutoOptimization();
    this.optimizationHistory = [];
    console.log(`🧹 [${new Date().toISOString()}] Performance optimizer cleanup completed`);
  }
}

// Export singleton instance
export const performanceOptimizer = new PerformanceOptimizer();