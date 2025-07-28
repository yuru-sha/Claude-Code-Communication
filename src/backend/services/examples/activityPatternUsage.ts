import { activityPatterns } from '../activityPatterns.js';

/**
 * Example usage of the ActivityPatternService
 * This demonstrates how to use the comprehensive activity patterns
 * for agent status detection
 */

// Example terminal outputs to analyze
const exampleOutputs = [
  // Coding activities
  'Creating file: src/components/UserProfile.tsx',
  '```typescript\nfunction calculateTotal() {\n  return 0;\n}\n```',
  'import React from "react"',
  
  // File operations
  'mkdir src/components',
  'File created successfully',
  'Deleting temporary files',
  
  // Command execution
  'npm install express',
  'git commit -m "Add new feature"',
  'docker build .',
  
  // Thinking/analysis
  'Let me analyze the code structure',
  'Analyzing the requirements',
  'First, I\'ll set up the project',
  
  // Error states
  'Error: File not found',
  'SyntaxError: Unexpected token',
  'Failed to compile',
  
  // Idle states
  'Human:',
  'Waiting for input',
  '? for shortcuts'
];

console.log('=== Activity Pattern Detection Examples ===\n');

exampleOutputs.forEach((output, index) => {
  const match = activityPatterns.findBestMatch(output);
  
  console.log(`${index + 1}. Input: "${output}"`);
  if (match) {
    console.log(`   → Activity: ${match.activityType} (Priority: ${match.priority})`);
    console.log(`   → Pattern: ${match.pattern.source}`);
  } else {
    console.log('   → No match found');
  }
  console.log('');
});

// Demonstrate pattern statistics
console.log('=== Pattern Statistics ===');
const stats = activityPatterns.getPatternStats();
Object.entries(stats).forEach(([type, count]) => {
  console.log(`${type}: ${count} patterns`);
});

console.log(`\nTotal patterns: ${activityPatterns.getPatterns().length}`);

// Demonstrate filtering by type
console.log('\n=== Coding Patterns (Top 5) ===');
const codingPatterns = activityPatterns.getPatternsByType('coding').slice(0, 5);
codingPatterns.forEach((pattern, index) => {
  console.log(`${index + 1}. Priority ${pattern.priority}: ${pattern.pattern.source}`);
});