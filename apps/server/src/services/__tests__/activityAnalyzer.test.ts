import { describe, it, expect, beforeEach } from 'vitest';
import { ActivityAnalyzer } from '../activityAnalyzer.js';
import { ActivityType } from '../../../types/index.js';

describe('ActivityAnalyzer', () => {
  let analyzer: ActivityAnalyzer;

  beforeEach(() => {
    analyzer = new ActivityAnalyzer();
  });

  describe('analyzeOutput', () => {
    it('should detect coding activity from file creation', () => {
      const output = 'Creating file: src/components/Button.tsx';
      const result = analyzer.analyzeOutput(output);

      expect(result.activityType).toBe('file_operation');
      expect(result.fileName).toBe('src/components/Button.tsx');
      expect(result.description).toContain('File operation: Working with');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should detect coding activity from code blocks', () => {
      const output = '```typescript\nfunction hello() {\n  console.log("Hello");\n}\n```';
      const result = analyzer.analyzeOutput(output);

      expect(result.activityType).toBe('coding');
      expect(result.description).toContain('Coding:');
    });

    it('should detect file operations', () => {
      const output = 'File created successfully: package.json';
      const result = analyzer.analyzeOutput(output);

      expect(result.activityType).toBe('file_operation');
      expect(result.fileName).toBe('package.json');
      expect(result.description).toContain('File operation:');
    });

    it('should detect command execution', () => {
      const output = '$ npm install react';
      const result = analyzer.analyzeOutput(output);

      expect(result.activityType).toBe('command_execution');
      expect(result.command).toBe('npm install react');
      expect(result.description).toContain('Executing:');
    });

    it('should detect thinking activity', () => {
      const output = 'Let me analyze the current code structure';
      const result = analyzer.analyzeOutput(output);

      expect(result.activityType).toBe('thinking');
      expect(result.description).toContain('Thinking:');
    });

    it('should detect idle state', () => {
      const output = 'Human:';
      const result = analyzer.analyzeOutput(output);

      expect(result.activityType).toBe('idle');
      expect(result.description).toContain('Idle:');
    });
  });

  describe('extractCurrentFile', () => {
    it('should extract file names from fsWrite operations', () => {
      const output = 'fsWrite("src/components/Header.tsx", content)';
      const fileName = analyzer.extractCurrentFile(output);

      expect(fileName).toBe('src/components/Header.tsx');
    });

    it('should extract file names from file creation messages', () => {
      const output = 'Creating file: utils/helpers.js';
      const fileName = analyzer.extractCurrentFile(output);

      expect(fileName).toBe('utils/helpers.js');
    });

    it('should extract file names from shell commands', () => {
      const output = '$ touch newfile.py';
      const fileName = analyzer.extractCurrentFile(output);

      expect(fileName).toBe('newfile.py');
    });

    it('should extract file names from quoted paths', () => {
      const output = 'Working with "src/styles/main.css" file';
      const fileName = analyzer.extractCurrentFile(output);

      expect(fileName).toBe('src/styles/main.css');
    });

    it('should return undefined for non-file content', () => {
      const output = 'Just some regular text without files';
      const fileName = analyzer.extractCurrentFile(output);

      expect(fileName).toBeUndefined();
    });

    it('should handle multiple file extensions', () => {
      const testCases = [
        { output: 'Editing main.go', expected: 'main.go' },
        { output: 'Creating test.java', expected: 'test.java' },
        { output: 'Working on style.css', expected: 'style.css' },
        { output: 'Reading config.json', expected: 'config.json' },
        { output: 'Updating README.md', expected: 'README.md' }
      ];

      testCases.forEach(({ output, expected }) => {
        const fileName = analyzer.extractCurrentFile(output);
        expect(fileName).toBe(expected);
      });
    });
  });

  describe('extractCurrentCommand', () => {
    it('should extract commands from shell prompts', () => {
      const output = '$ git commit -m "Initial commit"';
      const command = analyzer.extractCurrentCommand(output);

      expect(command).toBe('git commit -m "Initial commit"');
    });

    it('should extract commands from execution messages', () => {
      const output = 'Running: npm test';
      const command = analyzer.extractCurrentCommand(output);

      expect(command).toBe('npm test');
    });

    it('should extract package manager commands', () => {
      const testCases = [
        'npm install lodash',
        'yarn add react',
        'pip install requests',
        'go mod tidy',
        'cargo build'
      ];

      testCases.forEach(expectedCommand => {
        const output = `Executing ${expectedCommand}`;
        const command = analyzer.extractCurrentCommand(output);
        expect(command).toContain(expectedCommand.split(' ')[0]); // At least the command name
      });
    });

    it('should extract development tool commands', () => {
      const output = 'git push origin main';
      const command = analyzer.extractCurrentCommand(output);

      expect(command).toBe('git push origin main');
    });

    it('should return undefined for non-command content', () => {
      const output = 'Just analyzing the code structure';
      const command = analyzer.extractCurrentCommand(output);

      expect(command).toBeUndefined();
    });

    it('should handle executeBash tool calls', () => {
      const output = 'executeBash with command "ls -la"';
      const command = analyzer.extractCurrentCommand(output);

      expect(command).toBe('ls -la');
    });
  });

  describe('determineActivityType', () => {
    it('should prioritize high-priority patterns', () => {
      // Error patterns should have higher priority than coding patterns
      const output = 'Creating file: test.js\nError: File not found';
      const activityType = analyzer.determineActivityType(output);

      expect(activityType).toBe('idle'); // Error patterns mark as idle
    });

    it('should return idle for unknown patterns', () => {
      const output = 'Some random text that matches no patterns';
      const activityType = analyzer.determineActivityType(output);

      expect(activityType).toBe('idle');
    });

    it('should correctly identify all activity types', () => {
      const testCases: Array<{ output: string; expected: ActivityType }> = [
        { output: 'function test() {}', expected: 'coding' },
        { output: 'mkdir new-folder', expected: 'file_operation' },
        { output: '$ npm start', expected: 'command_execution' },
        { output: 'Let me check this', expected: 'thinking' },
        { output: 'Human:', expected: 'idle' }
      ];

      testCases.forEach(({ output, expected }) => {
        const activityType = analyzer.determineActivityType(output);
        expect(activityType).toBe(expected);
      });
    });
  });

  describe('isIdle', () => {
    it('should return true for idle patterns', () => {
      const idleOutputs = [
        'Human:',
        '? for shortcuts',
        'Waiting for input',
        'Error: Something went wrong'
      ];

      idleOutputs.forEach(output => {
        expect(analyzer.isIdle(output)).toBe(true);
      });
    });

    it('should return false for active patterns', () => {
      const activeOutputs = [
        'Creating file: test.js',
        '$ npm install',
        'Let me analyze this',
        'function hello() {}'
      ];

      activeOutputs.forEach(output => {
        expect(analyzer.isIdle(output)).toBe(false);
      });
    });
  });

  describe('hasError', () => {
    it('should detect various error patterns', () => {
      const errorOutputs = [
        'Error: File not found',
        'SyntaxError: Unexpected token',
        'TypeError: Cannot read property',
        'ENOENT: no such file or directory',
        '404 Not Found',
        'Fatal error occurred'
      ];

      errorOutputs.forEach(output => {
        expect(analyzer.hasError(output)).toBe(true);
      });
    });

    it('should return false for non-error content', () => {
      const normalOutputs = [
        'Creating file successfully',
        'function test() {}',
        '$ npm install',
        'Analyzing code structure'
      ];

      normalOutputs.forEach(output => {
        expect(analyzer.hasError(output)).toBe(false);
      });
    });
  });

  describe('getActivityConfidence', () => {
    it('should return higher confidence for specific patterns', () => {
      const specificOutput = 'Creating file: src/components/Button.tsx with function Button() {}';
      const genericOutput = 'Some activity happening';

      const specificConfidence = analyzer.getActivityConfidence(specificOutput);
      const genericConfidence = analyzer.getActivityConfidence(genericOutput);

      expect(specificConfidence).toBeGreaterThan(genericConfidence);
      expect(specificConfidence).toBeGreaterThan(0.5);
    });

    it('should return 0 for unmatched patterns', () => {
      const output = 'Random text with no patterns';
      const confidence = analyzer.getActivityConfidence(output);

      expect(confidence).toBe(0);
    });

    it('should boost confidence for file and command extraction', () => {
      const outputWithFile = 'Creating file: test.js';
      const outputWithCommand = '$ npm test';
      const outputWithBoth = 'Creating file: test.js\n$ npm test';

      const fileConfidence = analyzer.getActivityConfidence(outputWithFile);
      const commandConfidence = analyzer.getActivityConfidence(outputWithCommand);
      const bothConfidence = analyzer.getActivityConfidence(outputWithBoth);

      // Both should have higher confidence than individual ones
      expect(bothConfidence).toBeGreaterThanOrEqual(fileConfidence);
      expect(bothConfidence).toBeGreaterThanOrEqual(commandConfidence);
      
      // All should be greater than 0
      expect(fileConfidence).toBeGreaterThan(0);
      expect(commandConfidence).toBeGreaterThan(0);
      expect(bothConfidence).toBeGreaterThan(0);
    });
  });

  describe('getDetailedAnalysis', () => {
    it('should provide comprehensive analysis', () => {
      const output = 'Creating file: src/test.js\n```javascript\nfunction test() {}\n```';
      const analysis = analyzer.getDetailedAnalysis(output);

      expect(analysis).toHaveProperty('activityType');
      expect(analysis).toHaveProperty('description');
      expect(analysis).toHaveProperty('timestamp');
      expect(analysis).toHaveProperty('fileName');
      expect(analysis).toHaveProperty('confidence');
      expect(analysis).toHaveProperty('hasError');
      expect(analysis).toHaveProperty('matchedPattern');
      expect(analysis).toHaveProperty('outputLength');
      expect(analysis).toHaveProperty('cleanedOutput');

      expect(analysis.activityType).toBe('file_operation');
      expect(analysis.fileName).toBe('src/test.js');
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.hasError).toBe(false);
      expect(analysis.matchedPattern).toBeTruthy();
    });

    it('should handle error cases in detailed analysis', () => {
      const output = 'Error: Something went wrong';
      const analysis = analyzer.getDetailedAnalysis(output);

      expect(analysis.hasError).toBe(true);
      expect(analysis.activityType).toBe('idle');
    });
  });

  describe('edge cases', () => {
    it('should handle empty output', () => {
      const result = analyzer.analyzeOutput('');
      expect(result.activityType).toBe('idle');
      expect(result.description).toBeTruthy();
    });

    it('should handle very long output', () => {
      const longOutput = 'a'.repeat(10000) + 'Creating file: test.js';
      const result = analyzer.analyzeOutput(longOutput);
      expect(result.activityType).toBe('file_operation');
      expect(result.fileName).toBe('test.js');
    });

    it('should handle output with ANSI escape codes', () => {
      const output = '\x1b[32mCreating file: test.js\x1b[0m';
      const result = analyzer.analyzeOutput(output);
      expect(result.activityType).toBe('file_operation');
      expect(result.fileName).toBe('test.js');
    });

    it('should handle multiple file mentions', () => {
      const output = 'Creating file: first.js and editing second.js';
      const fileName = analyzer.extractCurrentFile(output);
      // Should extract the first valid file found
      expect(fileName).toBeTruthy();
      expect(['first.js', 'second.js']).toContain(fileName);
    });

    it('should handle multiple command mentions', () => {
      const output = '$ npm install && npm test';
      const command = analyzer.extractCurrentCommand(output);
      expect(command).toBe('npm install && npm test');
    });

    it('should handle null and undefined inputs gracefully', () => {
      expect(() => analyzer.analyzeOutput(null as any)).not.toThrow();
      expect(() => analyzer.analyzeOutput(undefined as any)).not.toThrow();
      
      // These methods should handle null/undefined gracefully by returning undefined
      expect(analyzer.extractCurrentFile(null as any)).toBeUndefined();
      expect(analyzer.extractCurrentCommand(null as any)).toBeUndefined();
      expect(analyzer.extractCurrentFile(undefined as any)).toBeUndefined();
      expect(analyzer.extractCurrentCommand(undefined as any)).toBeUndefined();
    });

    it('should handle non-string inputs', () => {
      expect(() => analyzer.analyzeOutput(123 as any)).not.toThrow();
      expect(() => analyzer.analyzeOutput({} as any)).not.toThrow();
      expect(() => analyzer.analyzeOutput([] as any)).not.toThrow();
    });

    it('should handle malformed regex patterns gracefully', () => {
      const outputWithSpecialChars = 'Creating file: test[].js with (special) chars';
      const result = analyzer.analyzeOutput(outputWithSpecialChars);
      expect(result.activityType).toBeTruthy();
      expect(result.description).toBeTruthy();
    });
  });

  describe('performance and caching', () => {
    it('should cache analysis results for identical inputs', () => {
      const output = 'Creating file: test.js';
      
      // First analysis
      const result1 = analyzer.analyzeOutput(output);
      
      // Second analysis with same input should use cache
      const result2 = analyzer.analyzeOutput(output);
      
      expect(result1.activityType).toBe(result2.activityType);
      expect(result1.description).toBe(result2.description);
      expect(result1.fileName).toBe(result2.fileName);
    });

    it('should provide performance metrics', () => {
      // Perform some analyses to generate metrics
      analyzer.analyzeOutput('Creating file: test1.js');
      analyzer.analyzeOutput('$ npm install');
      analyzer.analyzeOutput('function hello() {}');
      
      const metrics = analyzer.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('totalAnalyses');
      expect(metrics).toHaveProperty('cacheHits');
      expect(metrics).toHaveProperty('cacheMisses');
      expect(metrics).toHaveProperty('averageAnalysisTime');
      expect(metrics).toHaveProperty('cacheHitRate');
      expect(metrics).toHaveProperty('cacheSize');
      expect(metrics).toHaveProperty('memoryUsageKB');
      expect(metrics).toHaveProperty('fastPathEfficiency');
      expect(metrics).toHaveProperty('patternOptimizationScore');
      
      expect(metrics.totalAnalyses).toBeGreaterThan(0);
      expect(typeof metrics.cacheHitRate).toBe('number');
      expect(typeof metrics.memoryUsageKB).toBe('number');
    });

    it('should clear cache when requested', () => {
      // Generate some cache entries
      analyzer.analyzeOutput('Creating file: test1.js');
      analyzer.analyzeOutput('Creating file: test2.js');
      
      let metrics = analyzer.getPerformanceMetrics();
      expect(metrics.cacheSize).toBeGreaterThan(0);
      
      // Clear cache
      analyzer.clearCache();
      
      metrics = analyzer.getPerformanceMetrics();
      expect(metrics.cacheSize).toBe(0);
    });

    it('should handle cache eviction under memory pressure', () => {
      // Generate many cache entries to trigger eviction
      for (let i = 0; i < 1200; i++) {
        analyzer.analyzeOutput(`Creating file: test${i}.js`);
      }
      
      const metrics = analyzer.getPerformanceMetrics();
      expect(metrics.cacheSize).toBeLessThan(1200); // Should have evicted some entries
      expect(metrics.totalAnalyses).toBe(1200);
    });

    it('should optimize pattern matching performance', () => {
      const commonPatterns = [
        'Creating file: test.js',
        'function hello() {}',
        '$ npm install',
        'Human:',
        'Error: Something went wrong'
      ];
      
      // Analyze common patterns multiple times
      for (let i = 0; i < 10; i++) {
        commonPatterns.forEach(pattern => analyzer.analyzeOutput(pattern));
      }
      
      const metrics = analyzer.getPerformanceMetrics();
      expect(metrics.fastPathEfficiency).toBeGreaterThan(0);
      expect(metrics.patternOptimizationScore).toBeGreaterThan(0);
    });
  });

  describe('comprehensive pattern matching', () => {
    it('should detect all supported file extensions', () => {
      const fileExtensions = [
        'tsx', 'ts', 'jsx', 'js', 'py', 'go', 'java', 'cpp', 'c', 'rs', 
        'php', 'rb', 'swift', 'kt', 'html', 'css', 'json', 'yaml', 'xml', 'md', 'txt'
      ];
      
      fileExtensions.forEach(ext => {
        const output = `Creating file: test.${ext}`;
        const fileName = analyzer.extractCurrentFile(output);
        expect(fileName).toBe(`test.${ext}`);
      });
    });

    it('should detect complex file paths', () => {
      const filePaths = [
        'src/components/Button.tsx',
        'backend/services/auth.js',
        'tests/__tests__/unit.test.ts',
        'config/database.json',
        'docs/README.md',
        './relative/path/file.py',
        '../parent/directory/script.sh'
      ];
      
      filePaths.forEach(path => {
        const output = `Creating file: ${path}`;
        const fileName = analyzer.extractCurrentFile(output);
        expect(fileName).toBe(path);
      });
    });

    it('should detect various command patterns', () => {
      const commands = [
        '$ git commit -m "Initial commit"',
        'Running: npm test --coverage',
        'Executing: python script.py',
        'executeBash with command "ls -la"',
        '# sudo systemctl restart nginx',
        '> docker build -t myapp .',
        'Starting: yarn dev'
      ];
      
      commands.forEach(cmdOutput => {
        const command = analyzer.extractCurrentCommand(cmdOutput);
        expect(command).toBeTruthy();
        expect(command!.length).toBeGreaterThan(2);
      });
    });

    it('should handle complex error patterns', () => {
      const errorOutputs = [
        'TypeError: Cannot read property "length" of undefined',
        'SyntaxError: Unexpected token } in JSON at position 45',
        'ENOENT: no such file or directory, open "/path/to/file"',
        '404 Not Found: The requested resource was not found',
        'Fatal error: Maximum execution time exceeded',
        'Connection refused: Unable to connect to database',
        'Segmentation fault (core dumped)',
        'Build failed: Compilation error in main.cpp:42'
      ];
      
      errorOutputs.forEach(output => {
        expect(analyzer.hasError(output)).toBe(true);
      });
    });

    it('should not detect false positive errors', () => {
      const nonErrorOutputs = [
        'Successfully created error handling module',
        'Testing error scenarios in unit tests',
        'Error handling documentation updated',
        'function handleError() { return true; }',
        'const ERROR_CODES = { NOT_FOUND: 404 };',
        'Debugging error-prone code sections'
      ];
      
      nonErrorOutputs.forEach(output => {
        expect(analyzer.hasError(output)).toBe(false);
      });
    });
  });

  describe('activity confidence scoring', () => {
    it('should provide higher confidence for specific activities', () => {
      const specificOutput = 'Creating file: src/components/Button.tsx\nfunction Button() { return <div>Click me</div>; }';
      const genericOutput = 'Working on something';
      
      const specificConfidence = analyzer.getActivityConfidence(specificOutput);
      const genericConfidence = analyzer.getActivityConfidence(genericOutput);
      
      expect(specificConfidence).toBeGreaterThan(genericConfidence);
      expect(specificConfidence).toBeGreaterThan(0.5);
      expect(specificConfidence).toBeLessThanOrEqual(1);
    });

    it('should boost confidence for combined indicators', () => {
      const outputs = [
        'Creating file: test.js', // File only
        '$ npm test', // Command only
        'Creating file: test.js\n$ npm test', // Both file and command
        'Creating file: test.js\nfunction test() {}\n$ npm test' // File, code, and command
      ];
      
      const confidences = outputs.map(output => analyzer.getActivityConfidence(output));
      
      // All should have some confidence
      confidences.forEach(confidence => {
        expect(confidence).toBeGreaterThan(0);
        expect(confidence).toBeLessThanOrEqual(1);
      });
      
      // Combined indicators should generally have higher confidence
      expect(confidences[2]).toBeGreaterThan(0.5); // File + command
      expect(confidences[3]).toBeGreaterThan(0.5); // File + code + command
    });

    it('should return zero confidence for unmatched patterns', () => {
      const unmatchedOutputs = [
        '',
        'random text with no patterns',
        'just some words',
        '12345',
        '!@#$%^&*()'
      ];
      
      unmatchedOutputs.forEach(output => {
        const confidence = analyzer.getActivityConfidence(output);
        expect(confidence).toBe(0);
      });
    });
  });

  describe('detailed analysis', () => {
    it('should provide comprehensive analysis information', () => {
      const output = 'Creating file: src/test.js\n```javascript\nfunction test() { console.log("hello"); }\n```\n$ npm test';
      const analysis = analyzer.getDetailedAnalysis(output);
      
      expect(analysis).toHaveProperty('activityType');
      expect(analysis).toHaveProperty('description');
      expect(analysis).toHaveProperty('timestamp');
      expect(analysis).toHaveProperty('fileName');
      expect(analysis).toHaveProperty('command');
      expect(analysis).toHaveProperty('confidence');
      expect(analysis).toHaveProperty('hasError');
      expect(analysis).toHaveProperty('matchedPattern');
      expect(analysis).toHaveProperty('outputLength');
      expect(analysis).toHaveProperty('cleanedOutput');
      
      expect(analysis.activityType).toBe('file_operation');
      expect(analysis.fileName).toBe('src/test.js');
      expect(analysis.command).toBe('npm test');
      expect(analysis.confidence).toBeGreaterThan(0);
      expect(analysis.hasError).toBe(false);
      expect(analysis.outputLength).toBe(output.length);
      expect(analysis.cleanedOutput).toBeTruthy();
    });

    it('should handle error cases in detailed analysis', () => {
      const errorOutput = 'Error: File not found\nSomething went wrong';
      const analysis = analyzer.getDetailedAnalysis(errorOutput);
      
      expect(analysis.hasError).toBe(true);
      expect(analysis.activityType).toBe('idle');
      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should truncate cleaned output for debugging', () => {
      const longOutput = 'a'.repeat(500) + 'Creating file: test.js';
      const analysis = analyzer.getDetailedAnalysis(longOutput);
      
      expect(analysis.cleanedOutput.length).toBeLessThanOrEqual(200);
      expect(analysis.outputLength).toBe(longOutput.length);
    });
  });

  describe('resource cleanup', () => {
    it('should cleanup resources properly', () => {
      // Generate some activity to create resources
      analyzer.analyzeOutput('Creating file: test1.js');
      analyzer.analyzeOutput('Creating file: test2.js');
      
      expect(() => analyzer.cleanup()).not.toThrow();
      
      // After cleanup, cache should be empty
      const metrics = analyzer.getPerformanceMetrics();
      expect(metrics.cacheSize).toBe(0);
    });

    it('should handle multiple cleanup calls', () => {
      expect(() => {
        analyzer.cleanup();
        analyzer.cleanup(); // Should not throw on second call
      }).not.toThrow();
    });
  });
});