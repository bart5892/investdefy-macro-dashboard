#!/bin/bash
# InvestDEFY Macro Signal Dashboard — startup script
set -e

echo "=== InvestDEFY Macro Signal Dashboard ==="

# Install Python dependencies if yfinance not present
if ! python3 -c "import yfinance" 2>/dev/null; then
  echo "Installing Python dependencies..."
  pip3 install -r requirements.txt --quiet
fi

echo "Starting server on port ${PORT:-5000}..."
exec node dist/index.cjs
