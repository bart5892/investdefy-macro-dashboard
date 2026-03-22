#!/bin/bash
# InvestDEFY Macro Signal Dashboard — startup script
set -e

echo "=== InvestDEFY Macro Signal Dashboard ==="

# Install Python dependencies (try pip3, pip, python -m pip)
if ! python3 -c "import yfinance" 2>/dev/null; then
  echo "Installing Python dependencies..."
  if command -v pip3 &>/dev/null; then
    pip3 install -r requirements.txt --quiet
  elif command -v pip &>/dev/null; then
    pip install -r requirements.txt --quiet
  else
    python3 -m pip install -r requirements.txt --quiet
  fi
fi

echo "Starting server on port ${PORT:-5000}..."
exec node dist/index.cjs
