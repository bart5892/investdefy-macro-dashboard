#!/bin/bash
# InvestDEFY Macro Signal Dashboard — startup script

echo "=== InvestDEFY Macro Signal Dashboard ==="
echo "Node: $(node --version)"
echo "Python: $(python3 --version 2>&1)"
echo "PORT: ${PORT:-5000}"
echo "DATABASE_URL: ${DATABASE_URL:-not set, using data.db}"

# Ensure data directory exists for SQLite
mkdir -p /app/data 2>/dev/null || mkdir -p ./data 2>/dev/null || true

# Install Python dependencies
echo "Installing Python dependencies..."
python3 -m pip install -r requirements.txt --quiet 2>&1 || echo "WARNING: pip install failed, yfinance may not be available"

echo "Verifying yfinance..."
python3 -c "import yfinance; print('yfinance OK:', yfinance.__version__)" 2>&1 || echo "WARNING: yfinance not available"

echo "Starting server..."
exec node dist/index.cjs
