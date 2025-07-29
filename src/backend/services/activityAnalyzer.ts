import { ActivityInfo, ActivityType, AgentActivityPattern } from '../../types/index';
import { activityPatterns } from './activityPatterns';
import { logError, withErrorHandling } from '../utils/errorHandler';

/**
 * Enhanced pattern matching cache with LRU eviction and compression
 * Requirement 5.3: Optimize pattern matching performance
 */
interface PatternCache {
  pattern: string;
  result: ActivityInfo;
  timestamp: number;
  hitCount: number;
  lastAccessed: number;
  size: number; // Estimated memory size
}

/**
 * Pattern matching optimization metrics
 */
interface PatternOptimizationMetrics {
  fastPathHits: number;
  slowPathHits: number;
  regexCompilations: number;
  patternReorderings: number;
  cacheEvictions: number;
}

/**
 * Enhanced performance metrics for activity analysis
 */
interface AnalysisMetrics {
  totalAnalyses: number;
  cacheHits: number;
  cacheMisses: number;
  averageAnalysisTime: number;
  patternMatchingTime: number;
  fileExtractionTime: number;
  commandExtractionTime: number;
  lastCleanupTime: Date;
  optimization: PatternOptimizationMetrics;
}

/**
 * ActivityAnalyzer class for analyzing terminal output and determining agent activity
 * Implements pattern matching engine with file name and command extraction
 * Enhanced with performance optimizations for requirement 5.1, 5.3
 */
export class ActivityAnalyzer {
  private patternService = activityPatterns;
  
  // Performance optimization: Pattern matching cache
  private patternCache: Map<string, PatternCache> = new Map();
  private readonly maxCacheSize: number = 1000;
  private readonly cacheExpiryTime: number = 300000; // 5 minutes
  
  // Performance metrics
  private metrics: AnalysisMetrics;
  private cleanupTimer: NodeJS.Timeout | null = null;

  // Pattern matching optimization
  private compiledPatterns: Map<string, RegExp> = new Map();
  private patternUsageStats: Map<string, { hits: number; avgTime: number }> = new Map();
  private fastPathPatterns: RegExp[] = []; // Most commonly used patterns
  
  constructor() {
    this.metrics = {
      totalAnalyses: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageAnalysisTime: 0,
      patternMatchingTime: 0,
      fileExtractionTime: 0,
      commandExtractionTime: 0,
      lastCleanupTime: new Date(),
      optimization: {
        fastPathHits: 0,
        slowPathHits: 0,
        regexCompilations: 0,
        patternReorderings: 0,
        cacheEvictions: 0
      }
    };

    // Start periodic cache cleanup and optimization
    this.startCacheCleanup();
    this.initializePatternOptimization();
  }

  /**
   * Initialize pattern matching optimizations
   * Requirement 5.3: Optimize pattern matching performance
   */
  private initializePatternOptimization(): void {
    // Pre-compile commonly used patterns for fast path
    const commonPatterns = [
      /(?:Creating|Writing to|Editing|Modifying)\s+(?:file|script|component):/i,
      /```[\w]*\n/,
      /(?:function|class|import|export)\s+/i,
      /(?:\$|#|>)\s+/,
      /Human:/,
      /(?:Error|Exception|Failed):/i
    ];

    this.fastPathPatterns = commonPatterns;
    
    // Pre-compile and cache patterns
    commonPatterns.forEach((pattern, index) => {
      const key = `fast_${index}`;
      this.compiledPatterns.set(key, pattern);
      this.patternUsageStats.set(key, { hits: 0, avgTime: 0 });
    });

    console.log(`⚡ [${new Date().toISOString()}] Pattern optimization initialized with ${commonPatterns.length} fast-path patterns`);
  }

  /**
   * Analyze terminal output and return activity information
   * @param newOutput - The new terminal output to analyze
   * @param previousOutput - Previous output for comparison (optional)
   * @returns ActivityInfo object with detected activity details
   * Enhanced with caching and performance optimizations
   */
  public analyzeOutput(newOutput: string, previousOutput?: string): ActivityInfo {
    const startTime = Date.now();
    this.metrics.totalAnalyses++;

    try {
      console.log(`🔍 [${new Date().toISOString()}] Analyzing output (${newOutput.length} chars)`);
      
      // Validate input
      if (typeof newOutput !== 'string') {
        throw new Error(`Invalid output type: expected string, got ${typeof newOutput}`);
      }
      
      // Clean and prepare the output for analysis
      const cleanOutput = this.cleanOutput(newOutput);
      
      if (cleanOutput.length === 0) {
        console.log(`⚠️ [${new Date().toISOString()}] Empty output after cleaning, returning idle state`);
        return {
          activityType: 'idle',
          description: 'No activity detected',
          timestamp: new Date()
        };
      }

      // Check cache first for performance optimization
      const cacheKey = this.generateCacheKey(cleanOutput);
      const cachedResult = this.getCachedResult(cacheKey);
      
      if (cachedResult) {
        this.metrics.cacheHits++;
        console.log(`⚡ [${new Date().toISOString()}] Cache hit for analysis`);
        
        // Update timestamp and return cached result
        return {
          ...cachedResult,
          timestamp: new Date()
        };
      }

      this.metrics.cacheMisses++;
      
      // Perform optimized pattern matching with timing
      const patternStartTime = Date.now();
      const matchedPattern = this.optimizedPatternMatching(cleanOutput);
      const patternTime = Date.now() - patternStartTime;
      this.metrics.patternMatchingTime = 
        (this.metrics.patternMatchingTime + patternTime) / 2;
      
      // Determine activity type
      const activityType = matchedPattern?.activityType || 'idle';
      
      // Extract additional information with timing
      const fileStartTime = Date.now();
      const fileName = this.extractCurrentFile(cleanOutput);
      this.metrics.fileExtractionTime = 
        (this.metrics.fileExtractionTime + (Date.now() - fileStartTime)) / 2;

      const commandStartTime = Date.now();
      const command = this.extractCurrentCommand(cleanOutput);
      this.metrics.commandExtractionTime = 
        (this.metrics.commandExtractionTime + (Date.now() - commandStartTime)) / 2;
      
      // Generate activity description
      const description = this.generateActivityDescription(activityType, cleanOutput, fileName, command);
      
      const result: ActivityInfo = {
        activityType,
        description,
        timestamp: new Date(),
        fileName,
        command
      };

      // Cache the result for future use
      this.cacheResult(cacheKey, result);
      
      // Update performance metrics
      const totalTime = Date.now() - startTime;
      this.metrics.averageAnalysisTime = 
        (this.metrics.averageAnalysisTime + totalTime) / 2;
      
      console.log(`✅ [${new Date().toISOString()}] Analysis complete in ${totalTime}ms:`, {
        activityType,
        hasFileName: !!fileName,
        hasCommand: !!command,
        patternMatched: !!matchedPattern,
        cached: false
      });
      
      return result;
      
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'ActivityAnalyzer.analyzeOutput');
      
      // Return safe fallback result
      return {
        activityType: 'idle',
        description: 'Analysis error - defaulting to idle',
        timestamp: new Date()
      };
    }
  }

  /**
   * Extract file name from terminal output
   * @param output - Terminal output to analyze
   * @returns Extracted file name or undefined
   */
  public extractCurrentFile(output: string): string | undefined {
    if (!output || typeof output !== 'string') {
      return undefined;
    }
    // File operation patterns
    const filePatterns = [
      // Tool-based file operations
      /(?:fsWrite|strReplace|fsAppend|readFile|deleteFile).*?["']([^"']+\.(?:tsx?|jsx?|py|go|java|cpp|c|rs|php|rb|swift|kt|html|css|json|yaml|xml|md|txt))["']/i,
      
      // Direct file mentions
      /(?:Creating|Writing to|Editing|Modifying|Reading|Deleting)\s+(?:file|script|component):\s*([^\s\n]+)/i,
      
      // File paths in quotes
      /["']([^"']*\/[^"']*\.(?:tsx?|jsx?|py|go|java|cpp|c|rs|php|rb|swift|kt|html|css|json|yaml|xml|md|txt))["']/i,
      
      // File paths without quotes
      /(?:^|\s)([a-zA-Z0-9_\-\.\/]+\.(?:tsx?|jsx?|py|go|java|cpp|c|rs|php|rb|swift|kt|html|css|json|yaml|xml|md|txt))(?:\s|$)/i,
      
      // Shell commands with file arguments
      /(?:touch|cat|vim|nano|code|edit)\s+([^\s\n]+)/i,
      
      // File system operations
      /(?:cp|mv|rm|chmod|chown)\s+(?:[^\s]+\s+)?([^\s\n]+)/i
    ];

    for (const pattern of filePatterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        // Clean up the file path
        const filePath = match[1].trim();
        
        // Skip if it's just a directory or doesn't look like a real file
        if (filePath.includes('/') || filePath.includes('.')) {
          return filePath;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract command from terminal output
   * @param output - Terminal output to analyze
   * @returns Extracted command or undefined
   */
  public extractCurrentCommand(output: string): string | undefined {
    if (!output || typeof output !== 'string') {
      return undefined;
    }
    // Command execution patterns
    const commandPatterns = [
      // Shell prompt patterns
      /(?:\$|#|>)\s+([^\n\r]+)/,
      
      // Explicit execution mentions
      /(?:Running|Executing|Starting):\s*([^\n\r]+)/i,
      
      // Tool execution
      /executeBash.*?command.*?["']([^"']+)["']/i,
      
      // Package manager commands
      /((?:npm|yarn|pip|go|python|node|java|mvn|gradle|cargo|composer)\s+[^\n\r]+)/i,
      
      // Development tools
      /((?:git|docker|kubectl|terraform|ansible|ansible-playbook)\s+[^\n\r]+)/i,
      
      // Build and test commands
      /((?:make|cmake|build|test|run|start|dev|serve)\s+[^\n\r]*)/i
    ];

    for (const pattern of commandPatterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        const command = match[1].trim();
        
        // Skip very short or empty commands
        if (command.length > 2) {
          return command;
        }
      }
    }

    return undefined;
  }

  /**
   * Determine activity type from output using pattern matching
   * @param output - Terminal output to analyze
   * @returns Detected ActivityType
   */
  public determineActivityType(output: string): ActivityType {
    const matchedPattern = this.patternService.findBestMatch(output);
    return matchedPattern?.activityType || 'idle';
  }

  /**
   * Check if the output indicates the agent is in an idle state
   * @param output - Terminal output to check
   * @returns True if agent appears to be idle
   */
  public isIdle(output: string): boolean {
    const activityType = this.determineActivityType(output);
    return activityType === 'idle';
  }

  /**
   * Check if the output indicates an error state
   * Requirement 2.3: Error state detection and reporting
   * @param output - Terminal output to check
   * @returns True if error patterns are detected
   */
  public hasError(output: string): boolean {
    try {
      if (!output || typeof output !== 'string') {
        return false;
      }
      
      const errorPatterns = [
        // General error patterns
        /(?:Error|Exception|Failed|Failure)(?::\s*[\w\s]+|\s+to\s+\w+)/i,
        
        // Programming language errors
        /(?:SyntaxError|TypeError|ReferenceError|RuntimeError|CompileError|ImportError|AttributeError)/i,
        
        // System errors
        /(?:ENOENT|EACCES|EPERM|ECONNREFUSED|ETIMEDOUT|EADDRINUSE|EMFILE)/i,
        
        // HTTP errors
        /(?:404|500|502|503|504)\s+(?:Error|Not Found|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)/i,
        
        // Critical system errors
        /(?:Fatal|Critical|Panic|Segmentation fault|Core dumped)(?:\s+error)?/i,
        
        // Build and compilation errors
        /(?:Build failed|Compilation error|Link error|Make error)/i,
        
        // Database errors
        /(?:Connection refused|Database error|SQL error|Query failed)/i,
        
        // Network errors
        /(?:Network error|Connection timeout|DNS resolution failed|SSL error)/i,
        
        // File system errors
        /(?:Permission denied|File not found|Directory not found|Disk full)/i,
        
        // Process errors
        /(?:Process exited|Command not found|Killed|Terminated unexpectedly)/i
      ];

      const hasErrorPattern = errorPatterns.some(pattern => pattern.test(output));
      
      if (hasErrorPattern) {
        console.log(`🚨 [${new Date().toISOString()}] Error pattern detected in output`);
        
        // Log the specific error for debugging
        const errorMatch = errorPatterns.find(pattern => pattern.test(output));
        if (errorMatch) {
          const match = output.match(errorMatch);
          console.log(`🔍 [${new Date().toISOString()}] Error details:`, {
            pattern: errorMatch.source,
            match: match?.[0],
            outputLength: output.length
          });
        }
      }
      
      return hasErrorPattern;
      
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), 'ActivityAnalyzer.hasError');
      return false; // Safe fallback
    }
  }

  /**
   * Get activity confidence score based on pattern matching
   * @param output - Terminal output to analyze
   * @returns Confidence score (0-1)
   */
  public getActivityConfidence(output: string): number {
    const matchedPattern = this.patternService.findBestMatch(output);
    
    if (!matchedPattern) {
      return 0;
    }

    // Base confidence on pattern priority and specificity
    const maxPriority = 16; // Based on current pattern priorities
    const baseConfidence = matchedPattern.priority / maxPriority;
    
    // Boost confidence for specific indicators
    let confidenceBoost = 0;
    
    // File operations boost confidence
    if (this.extractCurrentFile(output)) {
      confidenceBoost += 0.15;
    }
    
    // Command execution boost confidence
    if (this.extractCurrentCommand(output)) {
      confidenceBoost += 0.1;
    }
    
    // Code patterns boost confidence
    if (matchedPattern.activityType === 'coding' && /```[\w]*\n/.test(output)) {
      confidenceBoost += 0.05;
    }

    return Math.min(1, baseConfidence + confidenceBoost);
  }

  /**
   * Optimized pattern matching with fast path and caching
   * Requirement 5.3: Optimize pattern matching performance
   */
  private optimizedPatternMatching(output: string): any {
    const startTime = Date.now();
    
    // Try fast path first - check most common patterns
    for (let i = 0; i < this.fastPathPatterns.length; i++) {
      const pattern = this.fastPathPatterns[i];
      if (pattern.test(output)) {
        this.metrics.optimization.fastPathHits++;
        
        // Update usage stats
        const key = `fast_${i}`;
        const stats = this.patternUsageStats.get(key)!;
        stats.hits++;
        stats.avgTime = (stats.avgTime + (Date.now() - startTime)) / 2;
        
        // Return appropriate activity type based on pattern
        return this.getActivityTypeFromFastPattern(i);
      }
    }
    
    // Fall back to full pattern service if fast path fails
    this.metrics.optimization.slowPathHits++;
    const result = this.patternService.findBestMatch(output);
    
    // Update pattern usage statistics for optimization
    this.updatePatternUsageStats(result, Date.now() - startTime);
    
    return result;
  }

  /**
   * Get activity type from fast path pattern index
   */
  private getActivityTypeFromFastPattern(patternIndex: number): any {
    const activityTypes = [
      { activityType: 'file_operation', priority: 10 }, // File operations
      { activityType: 'coding', priority: 9 },          // Code blocks
      { activityType: 'coding', priority: 8 },          // Function/class definitions
      { activityType: 'command_execution', priority: 7 }, // Shell commands
      { activityType: 'idle', priority: 1 },            // Human prompt
      { activityType: 'idle', priority: 2 }             // Errors (treated as idle for now)
    ];
    
    return activityTypes[patternIndex] || { activityType: 'idle', priority: 1 };
  }

  /**
   * Update pattern usage statistics for optimization
   */
  private updatePatternUsageStats(result: any, executionTime: number): void {
    if (!result) return;
    
    const patternKey = result.pattern?.source || 'unknown';
    const stats = this.patternUsageStats.get(patternKey) || { hits: 0, avgTime: 0 };
    
    stats.hits++;
    stats.avgTime = (stats.avgTime + executionTime) / 2;
    this.patternUsageStats.set(patternKey, stats);
    
    // Periodically reorder patterns based on usage
    if (stats.hits % 100 === 0) {
      this.optimizePatternOrder();
    }
  }

  /**
   * Optimize pattern order based on usage statistics
   * Requirement 5.3: Optimize pattern matching performance
   */
  private optimizePatternOrder(): void {
    const sortedPatterns = Array.from(this.patternUsageStats.entries())
      .sort((a, b) => {
        // Sort by hit frequency and average execution time
        const scoreA = a[1].hits / (a[1].avgTime + 1);
        const scoreB = b[1].hits / (b[1].avgTime + 1);
        return scoreB - scoreA;
      });

    // Update fast path patterns with most efficient ones
    const topPatterns = sortedPatterns.slice(0, 6).map(([key]) => {
      return this.compiledPatterns.get(key);
    }).filter(Boolean) as RegExp[];

    if (topPatterns.length > 0) {
      this.fastPathPatterns = topPatterns;
      this.metrics.optimization.patternReorderings++;
      
      console.log(`⚡ [${new Date().toISOString()}] Pattern order optimized based on usage statistics`);
    }
  }

  /**
   * Enhanced clean and normalize terminal output for analysis
   * @param output - Raw terminal output
   * @returns Cleaned output string
   */
  private cleanOutput(output: string): string {
    // Use a more efficient cleaning approach
    if (!output || typeof output !== 'string') return '';
    
    // Single pass cleaning with combined regex
    return output
      // Remove ANSI escape codes and excessive whitespace in one pass
      .replace(/\x1b\[[0-9;]*m|\s+/g, (match) => {
        return match.startsWith('\x1b') ? '' : ' ';
      })
      // Trim whitespace
      .trim();
  }

  /**
   * Generate human-readable activity description
   * @param activityType - Detected activity type
   * @param output - Terminal output
   * @param fileName - Extracted file name
   * @param command - Extracted command
   * @returns Formatted activity description
   */
  private generateActivityDescription(
    activityType: ActivityType,
    output: string,
    fileName?: string,
    command?: string
  ): string {
    switch (activityType) {
      case 'coding':
        if (fileName) {
          return `Coding: Working on ${fileName}`;
        }
        return 'Coding: Writing or editing code';

      case 'file_operation':
        if (fileName) {
          return `File operation: Working with ${fileName}`;
        }
        return 'File operation: Managing files';

      case 'command_execution':
        if (command) {
          // Truncate long commands
          const truncatedCommand = command.length > 50 
            ? `${command.substring(0, 47)}...` 
            : command;
          return `Executing: ${truncatedCommand}`;
        }
        return 'Command execution: Running commands';

      case 'thinking':
        return 'Thinking: Analyzing and planning';

      case 'idle':
        if (this.hasError(output)) {
          return 'Idle: Error encountered';
        }
        return 'Idle: Waiting for input';

      default:
        return 'Unknown activity';
    }
  }

  /**
   * Get detailed analysis of terminal output
   * @param output - Terminal output to analyze
   * @returns Detailed analysis object
   */
  public getDetailedAnalysis(output: string) {
    const activityInfo = this.analyzeOutput(output);
    const confidence = this.getActivityConfidence(output);
    const hasError = this.hasError(output);
    const matchedPattern = this.patternService.findBestMatch(output);

    return {
      ...activityInfo,
      confidence,
      hasError,
      matchedPattern: matchedPattern ? {
        pattern: matchedPattern.pattern.source,
        priority: matchedPattern.priority
      } : null,
      outputLength: output.length,
      cleanedOutput: this.cleanOutput(output).substring(0, 200) // First 200 chars for debugging
    };
  }

  /**
   * Generate cache key for output
   * Requirement 5.3: Optimize pattern matching performance
   */
  private generateCacheKey(output: string): string {
    // Create a hash-like key from the output for caching
    // Use first and last parts of output to create a unique but efficient key
    const maxKeyLength = 100;
    if (output.length <= maxKeyLength) {
      return output;
    }
    
    const start = output.substring(0, maxKeyLength / 2);
    const end = output.substring(output.length - maxKeyLength / 2);
    return `${start}...${end}`;
  }

  /**
   * Enhanced cached result retrieval with LRU tracking
   * Requirement 5.3: Optimize pattern matching performance
   */
  private getCachedResult(cacheKey: string): ActivityInfo | null {
    const cached = this.patternCache.get(cacheKey);
    
    if (!cached) {
      return null;
    }

    // Check if cache entry is still valid
    const now = Date.now();
    if (now - cached.timestamp > this.cacheExpiryTime) {
      this.patternCache.delete(cacheKey);
      return null;
    }

    // Update LRU tracking
    cached.hitCount++;
    cached.lastAccessed = now;
    
    return cached.result;
  }

  /**
   * Enhanced cache result with size tracking
   * Requirement 5.3: Optimize pattern matching performance
   */
  private cacheResult(cacheKey: string, result: ActivityInfo): void {
    // Check cache size limit
    if (this.patternCache.size >= this.maxCacheSize) {
      this.evictOldestCacheEntries();
    }

    // Calculate estimated memory size
    const estimatedSize = cacheKey.length + 
                         (result.description?.length || 0) + 
                         (result.fileName?.length || 0) + 
                         (result.command?.length || 0) + 
                         100; // Object overhead

    const now = Date.now();
    this.patternCache.set(cacheKey, {
      pattern: cacheKey,
      result: { ...result }, // Clone to avoid reference issues
      timestamp: now,
      hitCount: 0,
      lastAccessed: now,
      size: estimatedSize
    });
  }

  /**
   * Enhanced LRU cache eviction with memory-aware strategy
   * Requirement 5.2: Add memory cleanup for old activity data
   */
  private evictOldestCacheEntries(): void {
    const entries = Array.from(this.patternCache.entries());
    const now = Date.now();
    
    // Calculate current memory usage
    const totalMemory = entries.reduce((sum, [, cached]) => sum + cached.size, 0);
    const memoryPressure = totalMemory > (1024 * 1024); // 1MB threshold
    
    // Sort by LRU algorithm with memory consideration
    entries.sort((a, b) => {
      const ageA = now - a[1].lastAccessed;
      const ageB = now - b[1].lastAccessed;
      const hitRatioA = a[1].hitCount / Math.max(1, ageA / 60000); // hits per minute
      const hitRatioB = b[1].hitCount / Math.max(1, ageB / 60000);
      
      // If memory pressure is high, prioritize by size
      if (memoryPressure) {
        const sizeScore = (b[1].size - a[1].size) * 0.3;
        return (ageA - ageB) + (hitRatioB - hitRatioA) * 1000 + sizeScore;
      }
      
      // Normal LRU with hit count consideration
      return (ageA - ageB) + (hitRatioB - hitRatioA) * 1000;
    });

    // Remove entries based on memory pressure
    const removalRatio = memoryPressure ? 0.4 : 0.25; // Remove more if memory pressure
    const toRemove = Math.floor(entries.length * removalRatio);
    let memoryFreed = 0;
    
    for (let i = 0; i < toRemove; i++) {
      const [key, cached] = entries[i];
      memoryFreed += cached.size;
      this.patternCache.delete(key);
    }

    this.metrics.optimization.cacheEvictions += toRemove;

    console.log(`🧹 [${new Date().toISOString()}] Enhanced cache eviction completed:`, {
      entriesRemoved: toRemove,
      memoryFreedKB: Math.round(memoryFreed / 1024),
      memoryPressure,
      remainingEntries: this.patternCache.size
    });
  }

  /**
   * Start periodic cache cleanup
   */
  private startCacheCleanup(): void {
    // Clear existing timer first
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.performCacheCleanup();
    }, this.cacheExpiryTime);
  }

  /**
   * Perform cache cleanup to remove expired entries
   * Requirement 5.2: Add memory cleanup for old activity data
   */
  private performCacheCleanup(): void {
    const startTime = Date.now();
    const now = Date.now();
    let cleanedEntries = 0;

    console.log(`🧹 [${new Date().toISOString()}] Starting cache cleanup`);

    for (const [key, cached] of this.patternCache.entries()) {
      if (now - cached.timestamp > this.cacheExpiryTime) {
        this.patternCache.delete(key);
        cleanedEntries++;
      }
    }

    const cleanupTime = Date.now() - startTime;
    this.metrics.lastCleanupTime = new Date();

    console.log(`✅ [${new Date().toISOString()}] Cache cleanup completed: ${cleanedEntries} entries removed in ${cleanupTime}ms`);
  }

  /**
   * Enhanced performance metrics with optimization details
   * Requirement 5.3: Create monitoring metrics for system performance
   */
  public getPerformanceMetrics(): AnalysisMetrics & {
    cacheHitRate: number;
    cacheSize: number;
    memoryUsageKB: number;
    fastPathEfficiency: number;
    patternOptimizationScore: number;
    averageCacheEntrySize: number;
  } {
    const cacheHitRate = this.metrics.totalAnalyses > 0
      ? (this.metrics.cacheHits / this.metrics.totalAnalyses) * 100
      : 0;

    // Calculate memory usage from cache with size tracking
    let memoryUsage = 0;
    for (const cached of this.patternCache.values()) {
      memoryUsage += cached.size;
    }

    // Calculate fast path efficiency
    const totalPatternMatches = this.metrics.optimization.fastPathHits + this.metrics.optimization.slowPathHits;
    const fastPathEfficiency = totalPatternMatches > 0
      ? (this.metrics.optimization.fastPathHits / totalPatternMatches) * 100
      : 0;

    // Calculate pattern optimization score
    const patternOptimizationScore = this.calculatePatternOptimizationScore();

    // Calculate average cache entry size
    const averageCacheEntrySize = this.patternCache.size > 0
      ? memoryUsage / this.patternCache.size
      : 0;

    return {
      ...this.metrics,
      cacheHitRate,
      cacheSize: this.patternCache.size,
      memoryUsageKB: memoryUsage / 1024,
      fastPathEfficiency,
      patternOptimizationScore,
      averageCacheEntrySize
    };
  }

  /**
   * Calculate pattern optimization effectiveness score
   */
  private calculatePatternOptimizationScore(): number {
    if (this.patternUsageStats.size === 0) return 0;
    
    let totalScore = 0;
    let totalPatterns = 0;
    
    for (const [, stats] of this.patternUsageStats.entries()) {
      // Score based on hit frequency and execution speed
      const frequencyScore = Math.min(stats.hits / 100, 1); // Normalize to 0-1
      const speedScore = Math.max(0, 1 - (stats.avgTime / 100)); // Faster = higher score
      const combinedScore = (frequencyScore + speedScore) / 2;
      
      totalScore += combinedScore;
      totalPatterns++;
    }
    
    return totalPatterns > 0 ? (totalScore / totalPatterns) * 100 : 0;
  }

  /**
   * Clear cache and reset metrics
   */
  public clearCache(): void {
    this.patternCache.clear();
    console.log(`🧹 [${new Date().toISOString()}] Pattern cache cleared`);
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.patternCache.clear();
    console.log(`🧹 [${new Date().toISOString()}] ActivityAnalyzer cleanup completed`);
  }
}

// Export singleton instance for convenience
export const activityAnalyzer = new ActivityAnalyzer();