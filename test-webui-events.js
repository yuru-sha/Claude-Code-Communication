#!/usr/bin/env node

// Simple test script to verify WebUI event emission
const { Server } = require('socket.io');
const http = require('http');

// Create a simple test server
const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Mock AgentStatus for testing
const mockAgentStatus = {
  id: 'worker1',
  name: 'Worker1',
  status: 'working',
  currentActivity: 'Writing TypeScript code',
  lastActivity: new Date(),
  workingOnFile: 'src/components/Dashboard.tsx',
  executingCommand: 'npm run test'
};

// Mock ActivityInfo for testing
const mockActivityInfo = {
  agentId: 'worker1',
  activityType: 'coding',
  description: 'Implementing new WebUI features',
  timestamp: new Date(),
  fileName: 'src/components/Dashboard.tsx',
  command: 'npm run test'
};

// Mock detailed status
const mockDetailedStatus = {
  ...mockAgentStatus,
  activityHistory: [
    {
      activityType: 'coding',
      description: 'Writing code',
      timestamp: new Date(Date.now() - 60000),
      fileName: 'test.ts'
    },
    {
      activityType: 'file_operation',
      description: 'Creating file',
      timestamp: new Date(Date.now() - 120000),
      fileName: 'new-file.ts'
    }
  ]
};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Test the enhanced events
  setTimeout(() => {
    console.log('📡 Emitting agent-status-updated...');
    socket.emit('agent-status-updated', mockAgentStatus);
  }, 1000);
  
  setTimeout(() => {
    console.log('📊 Emitting agent-activity-detected...');
    socket.emit('agent-activity-detected', mockActivityInfo);
  }, 2000);
  
  setTimeout(() => {
    console.log('🔍 Emitting agent-detailed-status...');
    socket.emit('agent-detailed-status', mockDetailedStatus);
  }, 3000);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = 3002;
server.listen(PORT, () => {
  console.log(`🚀 Test WebUI events server running on port ${PORT}`);
  console.log('Connect a client to test the enhanced agent status events');
  console.log('Events will be emitted automatically after connection');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down test server...');
  server.close(() => {
    console.log('✅ Test server closed');
    process.exit(0);
  });
});