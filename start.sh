#!/bin/bash
# InvestDEFY Macro Signal Dashboard
set -e
echo "=== InvestDEFY Macro Signal Dashboard ==="
echo "Node: $(node --version)"
echo "PORT: ${PORT:-5000}"
exec node dist/index.cjs
