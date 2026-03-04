#!/bin/bash
# =============================================================================
# DAL Server Deployment Script
# =============================================================================
# Purpose: Compile and restart the DAL (Data Access Layer) server
# Usage: ./deploy_dal.sh [--rebuild] [--logs]
# =============================================================================

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env exists
check_env() {
    if [ ! -f ".env" ]; then
        log_error ".env file not found in scripts-ts/"
        log_info "Creating from .env.example..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_warning "Please update .env with your database credentials"
            exit 1
        else
            log_error ".env.example not found"
            exit 1
        fi
    fi
    log_success ".env file found"
}

# Install dependencies
install_deps() {
    log_info "Checking dependencies..."
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm install
        log_success "Dependencies installed"
    else
        log_success "Dependencies already installed"
    fi
}

# Compile TypeScript
compile_ts() {
    log_info "Compiling TypeScript..."
    npx tsc --noEmit
    
    if [ $? -eq 0 ]; then
        log_success "TypeScript compilation successful"
    else
        log_error "TypeScript compilation failed"
        exit 1
    fi
}

# Check database connection
check_db() {
    log_info "Testing database connection..."
    npx tsx -e "
        import { Pool } from 'pg';
        import * as dotenv from 'dotenv';
        import * as path from 'path';
        dotenv.config({ path: path.resolve('.env') });
        
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        
        pool.query('SELECT NOW()')
            .then(() => {
                console.log('✅ Database connection successful');
                pool.end();
                process.exit(0);
            })
            .catch((err) => {
                console.error('❌ Database connection failed:', err.message);
                pool.end();
                process.exit(1);
            });
    "
    
    if [ $? -eq 0 ]; then
        log_success "Database connection OK"
    else
        log_error "Cannot connect to database"
        exit 1
    fi
}

# Restart DAL server (Docker)
restart_docker() {
    log_info "Looking for DAL container..."
    
    CONTAINER_ID=$(docker ps -q --filter "name=dal")
    
    if [ -n "$CONTAINER_ID" ]; then
        log_info "Restarting DAL container..."
        docker restart $CONTAINER_ID
        log_success "DAL container restarted: $CONTAINER_ID"
        
        if [ "$1" == "--logs" ]; then
            log_info "Showing logs (Ctrl+C to exit)..."
            docker logs -f $CONTAINER_ID
        fi
    else
        log_warning "No DAL container found"
        log_info "Starting DAL server directly..."
        start_direct
    fi
}

# Start DAL server directly (for development)
start_direct() {
    log_info "Starting DAL server directly..."
    log_info "Listening on port 3000..."
    
    # Kill any existing process on port 3000
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    
    # Start new process
    npx tsx dal_server.ts &
    DAL_PID=$!
    
    log_success "DAL server started with PID: $DAL_PID"
    echo "$DAL_PID" > .dal.pid
    
    if [ "$1" == "--logs" ]; then
        log_info "Attaching to logs..."
        wait $DAL_PID
    fi
}

# Main execution
main() {
    echo "=============================================="
    echo "  DAL Server Deployment"
    echo "  $(date)"
    echo "=============================================="
    echo ""
    
    check_env
    install_deps
    compile_ts
    check_db
    
    echo ""
    log_info "Deployment options:"
    echo "  1) Restart Docker container"
    echo "  2) Start directly (development)"
    echo ""
    
    # Auto-detect deployment mode
    if docker ps &>/dev/null && docker ps -q --filter "name=dal" | grep -q .; then
        log_info "Docker deployment detected"
        restart_docker "$1"
    else
        log_info "Direct deployment mode"
        start_direct "$1"
    fi
    
    echo ""
    log_success "DAL deployment complete!"
    echo ""
    echo "=============================================="
    echo "  Endpoints:"
    echo "  - POST /create-booking"
    echo "  - POST /cancel-booking"
    echo "  - POST /reschedule-booking"
    echo "  - POST /availability"
    echo "  - POST /find-next-available"
    echo "=============================================="
}

# Parse arguments
case "${1:-}" in
    --rebuild)
        log_info "Rebuild mode: cleaning up..."
        rm -rf node_modules package-lock.json
        npm install
        main "$2"
        ;;
    --logs)
        main --logs
        ;;
    *)
        main
        ;;
esac
