#!/bin/bash
# =============================================================================
# DAL Server Quick Restart Script
# =============================================================================
# Purpose: Quickly restart the DAL server after code changes
# Usage: ./restart_dal.sh [--logs] [--force]
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "=============================================="
echo "  DAL Server Restart"
echo "  $(date)"
echo "=============================================="
echo ""

# Check for .dal.pid file
if [ -f ".dal.pid" ]; then
    OLD_PID=$(cat .dal.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        log "Stopping existing DAL server (PID: $OLD_PID)..."
        kill $OLD_PID 2>/dev/null || true
        sleep 2
        success "Stopped old process"
    else
        warning "Stale PID file found (process not running)"
        rm -f .dal.pid
    fi
fi

# Kill any process on port 3000
log "Checking port 3000..."
PORT_PID=$(lsof -ti:3000 2>/dev/null || echo "")
if [ -n "$PORT_PID" ]; then
    log "Killing process on port 3000 (PID: $PORT_PID)..."
    kill -9 $PORT_PID 2>/dev/null || true
    success "Port 3000 freed"
else
    success "Port 3000 is free"
fi

# Check for Docker container
if docker ps &>/dev/null; then
    CONTAINER_ID=$(docker ps -q --filter "name=dal" 2>/dev/null || echo "")
    if [ -n "$CONTAINER_ID" ]; then
        log "Found DAL container: $CONTAINER_ID"
        
        if [ "$1" == "--force" ]; then
            log "Force restarting container..."
            docker restart $CONTAINER_ID
            success "Container restarted"
        else
            log "Container is running. Use --force to restart."
        fi
        
        if [ "$1" == "--logs" ]; then
            echo ""
            log "Showing logs (Ctrl+C to exit):"
            docker logs -f $CONTAINER_ID
        fi
        
        exit 0
    fi
fi

# Start DAL server directly
log "Starting DAL server..."
log "Compiling TypeScript..."

npx tsc --noEmit
if [ $? -ne 0 ]; then
    error "TypeScript compilation failed"
    exit 1
fi
success "TypeScript OK"

# Start server
log "Starting server on port 3000..."
npx tsx dal_server.ts &
DAL_PID=$!

echo "$DAL_PID" > .dal.pid
success "DAL server started (PID: $DAL_PID)"

echo ""
echo "=============================================="
echo "  DAL Server Running"
echo "  PID: $DAL_PID"
echo "  Port: 3000"
echo "=============================================="
echo ""
echo "Endpoints:"
echo "  POST /create-booking"
echo "  POST /cancel-booking"
echo "  POST /reschedule-booking"
echo "  POST /availability"
echo "  POST /find-next-available"
echo ""

if [ "$1" == "--logs" ]; then
    log "Attaching to logs (Ctrl+C to detach)..."
    wait $DAL_PID
fi

# Health check
sleep 2
log "Running health check..."
curl -s -X POST http://localhost:3000/availability \
    -H "Content-Type: application/json" \
    -d '{"provider_id":1,"service_id":1,"date":"2026-03-02"}' \
    | head -c 100

if [ $? -eq 0 ]; then
    echo ""
    success "Health check passed"
else
    echo ""
    warning "Health check inconclusive (server may still be starting)"
fi

echo ""
log "To stop: kill $DAL_PID"
log "To view logs: ./restart_dal.sh --logs"
