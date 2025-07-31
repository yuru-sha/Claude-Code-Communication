import { AgentActivityPattern, ActivityType } from '@claude-communication/types';

/**
 * Comprehensive activity patterns for agent status detection
 * Organized by activity type with priority-based matching
 */
export class ActivityPatternService {
  private static instance: ActivityPatternService;
  private patterns: AgentActivityPattern[];

  private constructor() {
    this.patterns = this.initializePatterns();
  }

  public static getInstance(): ActivityPatternService {
    if (!ActivityPatternService.instance) {
      ActivityPatternService.instance = new ActivityPatternService();
    }
    return ActivityPatternService.instance;
  }

  /**
   * Get all activity patterns sorted by priority (highest first)
   */
  public getPatterns(): AgentActivityPattern[] {
    return [...this.patterns].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get patterns for a specific activity type
   */
  public getPatternsByType(activityType: ActivityType): AgentActivityPattern[] {
    return this.patterns
      .filter(pattern => pattern.activityType === activityType)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Find the best matching pattern for given text
   */
  public findBestMatch(text: string): AgentActivityPattern | null {
    const sortedPatterns = this.getPatterns();
    
    for (const pattern of sortedPatterns) {
      if (pattern.pattern.test(text)) {
        return pattern;
      }
    }
    
    return null;
  }

  /**
   * Initialize comprehensive activity patterns
   */
  private initializePatterns(): AgentActivityPattern[] {
    return [
      // === CODING ACTIVITIES (Priority 10-15) ===
      
      // File creation and editing (highest priority)
      { 
        pattern: /(?:Creating|Writing to|Editing|Modifying)\s+(?:file|script|component):\s*[\w\-\.\/]+/i, 
        activityType: 'coding', 
        priority: 15 
      },
      { 
        pattern: /(?:fsWrite|strReplace|fsAppend).*?(?:\.tsx?|\.jsx?|\.py|\.go|\.java|\.cpp|\.c|\.rs|\.php|\.rb|\.swift|\.kt)/i, 
        activityType: 'coding', 
        priority: 14 
      },
      
      // Code block detection
      { 
        pattern: /```(?:typescript|javascript|python|go|java|cpp|rust|php|ruby|swift|kotlin|html|css|sql|json|yaml|xml)/i, 
        activityType: 'coding', 
        priority: 13 
      },
      { 
        pattern: /```[\w]*\n(?:.*\n)*?```/s, 
        activityType: 'coding', 
        priority: 12 
      },
      
      // Programming language constructs
      { 
        pattern: /(?:function|def|class|interface|type|enum|struct|impl|trait)\s+\w+/i, 
        activityType: 'coding', 
        priority: 11 
      },
      { 
        pattern: /(?:import|from|require|include|using|package)\s+[\w\.\-\/]+/i, 
        activityType: 'coding', 
        priority: 10 
      },
      { 
        pattern: /(?:export|public|private|protected|static|async|await|const|let|var)\s+/i, 
        activityType: 'coding', 
        priority: 10 
      },

      // === FILE OPERATIONS (Priority 7-9) ===
      
      // File system operations
      { 
        pattern: /(?:mkdir|touch|cp|mv|rm|chmod|chown)\s+[\w\-\.\/]+/i, 
        activityType: 'file_operation', 
        priority: 9 
      },
      { 
        pattern: /(?:File|Directory)\s+(?:created|updated|deleted|moved|copied)/i, 
        activityType: 'file_operation', 
        priority: 8 
      },
      { 
        pattern: /(?:Creating|Deleting|Moving|Copying)\s+(?:file|directory|folder|temporary\s+files)/i, 
        activityType: 'file_operation', 
        priority: 8 
      },
      { 
        pattern: /File\s+(?:created|updated|deleted)\s*(?:successfully)?/i, 
        activityType: 'file_operation', 
        priority: 8 
      },
      { 
        pattern: /Directory\s+(?:created|updated|deleted)/i, 
        activityType: 'file_operation', 
        priority: 8 
      },
      { 
        pattern: /(?:listDirectory|readFile|deleteFile|fileSearch)/i, 
        activityType: 'file_operation', 
        priority: 7 
      },

      // === COMMAND EXECUTION (Priority 5-7) ===
      
      // Shell commands and execution
      { 
        pattern: /(?:\$|#|>)\s+[\w\-\.\/]+/i, 
        activityType: 'command_execution', 
        priority: 7 
      },
      { 
        pattern: /(?:Running|Executing|Starting):\s*[\w\-\.\/]+/i, 
        activityType: 'command_execution', 
        priority: 7 
      },
      { 
        pattern: /(?:npm|yarn|pip|go|python|node|java|mvn|gradle|cargo|composer)\s+[\w\-]+/i, 
        activityType: 'command_execution', 
        priority: 10 
      },
      { 
        pattern: /(?:git|docker|kubectl|terraform|ansible|ansible-playbook)\s+[\w\-\.]+/i, 
        activityType: 'command_execution', 
        priority: 10 
      },
      { 
        pattern: /executeBash.*?command/i, 
        activityType: 'command_execution', 
        priority: 5 
      },

      // === THINKING/ANALYSIS (Priority 3-5) ===
      
      // Analysis and planning
      { 
        pattern: /(?:Let me|I'll|I need to|I should|I will)\s+(?:analyze|check|review|examine|investigate)/i, 
        activityType: 'thinking', 
        priority: 12 
      },
      { 
        pattern: /^(?:Analyzing|Checking|Reviewing|Examining|Investigating|Looking at)/i, 
        activityType: 'thinking', 
        priority: 11 
      },
      { 
        pattern: /(?:First|Next|Then|Now|Finally),?\s+(?:I'll|let me|we need to)/i, 
        activityType: 'thinking', 
        priority: 10 
      },
      { 
        pattern: /(?:Understanding|Considering|Planning|Designing|Thinking about)/i, 
        activityType: 'thinking', 
        priority: 9 
      },

      // === ERROR DETECTION (Priority 8-10) ===
      
      // Error patterns (high priority for immediate detection)
      { 
        pattern: /(?:Error|Exception|Failed|Failure)(?::\s*[\w\s]+|\s+to\s+\w+)/i, 
        activityType: 'idle', // Mark as idle when errors occur
        priority: 16 
      },
      { 
        pattern: /(?:SyntaxError|TypeError|ReferenceError|RuntimeError|CompileError)/i, 
        activityType: 'idle', 
        priority: 15 
      },
      { 
        pattern: /(?:ENOENT|EACCES|EPERM|ECONNREFUSED|ETIMEDOUT)/i, 
        activityType: 'idle', 
        priority: 14 
      },

      // === IDLE DETECTION (Priority 1-2) ===
      
      // Human interaction prompts (lowest priority, but definitive idle state)
      { 
        pattern: /Human:\s*$/m, 
        activityType: 'idle', 
        priority: 2 
      },
      { 
        pattern: /\?\s+for\s+shortcuts/i, 
        activityType: 'idle', 
        priority: 1 
      },
      { 
        pattern: /Waiting for (?:input|response|user)/i, 
        activityType: 'idle', 
        priority: 2 
      },
      { 
        pattern: /Press\s+(?:Enter|any key|Ctrl\+C)/i, 
        activityType: 'idle', 
        priority: 1 
      }
    ];
  }

  /**
   * Add a custom pattern (for testing or dynamic patterns)
   */
  public addPattern(pattern: AgentActivityPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Remove patterns by activity type
   */
  public removePatternsByType(activityType: ActivityType): void {
    this.patterns = this.patterns.filter(p => p.activityType !== activityType);
  }

  /**
   * Get pattern statistics
   */
  public getPatternStats(): Record<ActivityType, number> {
    const stats: Record<ActivityType, number> = {
      coding: 0,
      file_operation: 0,
      command_execution: 0,
      thinking: 0,
      idle: 0
    };

    this.patterns.forEach(pattern => {
      stats[pattern.activityType]++;
    });

    return stats;
  }
}

// Export singleton instance
export const activityPatterns = ActivityPatternService.getInstance();

// Export pattern constants for backward compatibility
export const COMPREHENSIVE_ACTIVITY_PATTERNS = ActivityPatternService.getInstance().getPatterns();