#!/bin/bash
# InvestDEFY Macro Signal Dashboard — startup script

echo "=== InvestDEFY Macro Signal Dashboard ==="

# Find the right python command
PYTHON=""
for cmd in python3 python python3.11 python3.10; do
  if command -v $cmd &>/dev/null; then
    PYTHON=$cmd
    echo "Python found: $cmd ($($cmd --version 2>&1))"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "ERROR: No python found — yfinance will not be available"
else
  echo "Installing Python dependencies..."
  $PYTHON -m pip install -r requirements.txt --quiet 2>&1 || echo "WARNING: pip install failed"
  $PYTHON -c "import yfinance; print('yfinance OK:', yfinance.__version__)" 2>&1 || echo "WARNING: yfinance not available"
fi

echo "Starting server on port ${PORT:-5000}..."
exec node dist/index.cjs
