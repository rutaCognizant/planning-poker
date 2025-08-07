#!/bin/bash

# RzzRzz Poker Production Deployment Script
echo "🦟 Deploying RzzRzz Poker to Production..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js version 16+ is required. Current version: $(node --version)"
    exit 1
fi

print_success "Node.js version check passed: $(node --version)"

# Install production dependencies
print_status "Installing production dependencies..."
npm ci --only=production

if [ $? -eq 0 ]; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Set production environment
export NODE_ENV=production

# Create production environment file if it doesn't exist
if [ ! -f ".env" ]; then
    print_warning "No .env file found. Creating from example..."
    cp production.env.example .env
    print_warning "⚠️  Please edit .env file with your production settings!"
fi

# Check if database directory exists
if [ ! -d "data" ]; then
    print_status "Creating data directory for SQLite database..."
    mkdir -p data
fi

# Generate a secure session secret if not set
if [ -z "$SESSION_SECRET" ]; then
    export SESSION_SECRET=$(openssl rand -base64 32)
    print_status "Generated secure session secret"
fi

# Start the application in production mode
print_status "Starting RzzRzz Poker in production mode..."
print_status "🌐 Application will be available at: http://localhost:${PORT:-3000}"
print_status "🔧 Admin dashboard: http://localhost:${PORT:-3000}/admin.html"
print_status "📚 Features page: http://localhost:${PORT:-3000}/features.html"
print_status ""
print_warning "Default admin credentials: admin / rzzrzz123"
print_warning "⚠️  CHANGE ADMIN PASSWORD IN PRODUCTION!"
print_status ""

# Start the server
npm start