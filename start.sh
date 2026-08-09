#!/bin/bash

# Bulk Mail Application Startup Script

echo "=================================================="
echo "🚀 Starting Full Stack Bulk Mail Application"
echo "=================================================="

# Function to clean up background processes on Ctrl+C
cleanup() {
    echo ""
    echo "🛑 Shutting down backend and frontend services..."
    kill $(jobs -p)
    exit
}

# Trap SIGINT (Ctrl+C) and call cleanup
trap cleanup SIGINT

# 1. Start Backend API
echo "🔌 Starting Backend Express API on Port 5009..."
cd backend
npm run dev &
cd ..

# Wait a brief moment for backend to initialize
sleep 2

# 2. Start Frontend Vite Server
echo "💻 Starting Frontend React Client..."
cd frontend
npm run dev &
cd ..

echo "=================================================="
echo "💡 Both services are running!"
echo "👉 Backend API: http://localhost:5009"
echo "👉 Frontend Web App: http://localhost:5177 (or alternative port)"
echo "👋 Press Ctrl+C to terminate both servers."
echo "=================================================="

# Wait for background jobs to complete
wait
