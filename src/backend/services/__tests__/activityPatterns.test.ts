import { describe, it, expect, beforeEach } from 'vitest';
import { ActivityPatternService, activityPatterns } from '../activityPatterns.js';
import { ActivityType } from '../../../types/index.js';

describe('ActivityPatternService', () => {
  let service: ActivityPatternService;

  beforeEach(() => {
    service = ActivityPatternService.getInstance();
  });

  describe('Pattern Initialization', () => {
    it('should initialize with comprehensive patterns', () => {
      const patterns = service.getPatterns();
      expect(patterns.length).toBeGreaterThan(20);
    });

    it('should have patterns for all activity types', () => {
      const stats = service.getPatternStats();
      expect(stats.coding).toBeGreaterThan(0);
      expect(stats.file_operation).toBeGreaterThan(0);
      expect(stats.command_execution).toBeGreaterThan(0);
      expect(stats.thinking).toBeGreaterThan(0);
      expect(stats.idle).toBeGreaterThan(0);
    });

    it('should sort patterns by priority', () => {
      const patterns = service.getPatterns();
      for (let i = 0; i < patterns.length - 1; i++) {
        expect(patterns[i].priority).toBeGreaterThanOrEqual(patterns[i + 1].priority);
      }
    });
  });

  describe('Coding Activity Detection', () => {
    it('should detect file creation activities', () => {
      const testCases = [
        'Creating file: src/components/Button.tsx',
        'Writing to file: utils/helper.js',
        'Editing file: config/database.ts',
        'Modifying component: Header.jsx'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('coding');
        expect(match?.priority).toBeGreaterThanOrEqual(10);
      });
    });

    it('should detect code blocks', () => {
      const testCases = [
        '```typescript\nfunction test() {}\n```',
        '```javascript\nconst x = 1;\n```',
        '```python\ndef hello():\n    pass\n```',
        '```go\nfunc main() {}\n```'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('coding');
      });
    });

    it('should detect programming constructs', () => {
      const testCases = [
        'function calculateTotal()',
        'class UserService',
        'interface ApiResponse',
        'type UserData',
        'enum Status',
        'import React from "react"',
        'from typing import List',
        'export const API_URL',
        'async function fetchData()'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('coding');
      });
    });
  });

  describe('File Operation Detection', () => {
    it('should detect file system commands', () => {
      const testCases = [
        'mkdir src/components',
        'touch README.md',
        'cp file1.txt file2.txt',
        'mv old.js new.js',
        'rm temp.log',
        'chmod 755 script.sh'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('file_operation');
      });
    });

    it('should detect file operation messages', () => {
      const testCases = [
        'File created successfully',
        'Directory updated',
        'File deleted: temp.txt',
        'Creating file structure',
        'Deleting temporary files'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('file_operation');
      });
    });
  });

  describe('Command Execution Detection', () => {
    it('should detect shell commands', () => {
      const testCases = [
        '$ npm install',
        '# python script.py',
        '> node server.js',
        'Running: npm test',
        'Executing: build script'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('command_execution');
      });
    });

    it('should detect package manager commands', () => {
      const testCases = [
        'npm install express',
        'yarn add react',
        'pip install requests',
        'go mod tidy',
        'python manage.py migrate',
        'node build.js',
        'java -jar app.jar'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('command_execution');
      });
    });

    it('should detect development tools', () => {
      const testCases = [
        'git commit -m "fix"',
        'docker build .',
        'kubectl apply -f config.yaml',
        'terraform plan',
        'ansible-playbook deploy.yml'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('command_execution');
      });
    });
  });

  describe('Thinking Activity Detection', () => {
    it('should detect analysis phrases', () => {
      const testCases = [
        'Let me analyze the code',
        "I'll check the configuration",
        'I need to review the requirements',
        'I should examine the logs',
        'I will investigate the issue'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('thinking');
      });
    });

    it('should detect planning phrases', () => {
      const testCases = [
        'Analyzing the problem',
        'Checking dependencies',
        'Reviewing code structure',
        'Examining test results',
        'First, I\'ll set up the project',
        'Next, we need to configure',
        'Understanding the requirements'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('thinking');
      });
    });
  });

  describe('Idle State Detection', () => {
    it('should detect human prompts', () => {
      const testCases = [
        'Human:',
        'Human: ',
        'Waiting for input',
        'Waiting for response',
        'Press Enter to continue',
        'Press any key',
        '? for shortcuts'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('idle');
      });
    });
  });

  describe('Error Detection', () => {
    it('should detect error messages', () => {
      const testCases = [
        'Error: File not found',
        'Exception: Invalid argument',
        'Failed to compile',
        'SyntaxError: Unexpected token',
        'TypeError: Cannot read property',
        'ENOENT: no such file or directory'
      ];

      testCases.forEach(text => {
        const match = service.findBestMatch(text);
        expect(match).toBeTruthy();
        expect(match?.activityType).toBe('idle'); // Errors should mark as idle
        expect(match?.priority).toBeGreaterThanOrEqual(8);
      });
    });
  });

  describe('Priority System', () => {
    it('should prioritize file creation over generic coding', () => {
      const fileCreation = service.findBestMatch('Creating file: test.ts');
      const genericCode = service.findBestMatch('function test() {}');
      
      expect(fileCreation?.priority).toBeGreaterThan(genericCode?.priority || 0);
    });

    it('should prioritize errors over normal activities', () => {
      const error = service.findBestMatch('Error: Something went wrong');
      const coding = service.findBestMatch('function test() {}');
      
      expect(error?.priority).toBeGreaterThan(coding?.priority || 0);
    });

    it('should prioritize specific commands over generic thinking', () => {
      const command = service.findBestMatch('npm install express');
      const thinking = service.findBestMatch('Understanding the requirements'); // Use a lower priority thinking pattern
      
      expect(command?.priority).toBeGreaterThan(thinking?.priority || 0);
    });
  });

  describe('Pattern Management', () => {
    it('should allow adding custom patterns', () => {
      const initialCount = service.getPatterns().length;
      service.addPattern({
        pattern: /custom-test-pattern/,
        activityType: 'coding',
        priority: 20
      });
      
      expect(service.getPatterns().length).toBe(initialCount + 1);
    });

    it('should allow filtering patterns by type', () => {
      const codingPatterns = service.getPatternsByType('coding');
      const filePatterns = service.getPatternsByType('file_operation');
      
      expect(codingPatterns.length).toBeGreaterThan(0);
      expect(filePatterns.length).toBeGreaterThan(0);
      
      codingPatterns.forEach(pattern => {
        expect(pattern.activityType).toBe('coding');
      });
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle complex terminal output', () => {
      const complexOutput = `
        I'll help you create a React component.
        
        Creating file: src/components/UserProfile.tsx
        
        \`\`\`typescript
        import React from 'react';
        
        interface UserProfileProps {
          name: string;
          email: string;
        }
        
        export const UserProfile: React.FC<UserProfileProps> = ({ name, email }) => {
          return (
            <div className="user-profile">
              <h2>{name}</h2>
              <p>{email}</p>
            </div>
          );
        };
        \`\`\`
        
        Now running: npm install @types/react
      `;

      const match = service.findBestMatch(complexOutput);
      expect(match).toBeTruthy();
      expect(match?.activityType).toBe('coding');
      expect(match?.priority).toBeGreaterThanOrEqual(10);
    });

    it('should handle error scenarios correctly', () => {
      const errorOutput = `
        Trying to install dependencies...
        npm install express
        
        Error: ENOENT: no such file or directory, open 'package.json'
        
        The installation failed.
      `;

      const match = service.findBestMatch(errorOutput);
      expect(match).toBeTruthy();
      expect(match?.activityType).toBe('idle'); // Should detect error and mark as idle
    });
  });
});