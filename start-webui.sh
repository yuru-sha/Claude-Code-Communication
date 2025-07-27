#!/bin/bash

echo "🚀 Starting Claude Code Communication Web UI..."

# Kill existing processes
echo "Stopping existing processes..."
pkill -f "npm run dev" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "ts-node-dev" 2>/dev/null

# Wait a moment
sleep 1

# Start backend
echo "Starting backend server..."
npm run dev:server &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting frontend..."
npm run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

sleep 3

echo ""
echo "✅ Web UI is running!"
echo "📋 Access the dashboard at: http://localhost:3000"
echo "🔌 Backend API running at: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all processes"

# Wait for Ctrl+C
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

# Keep script running
wait