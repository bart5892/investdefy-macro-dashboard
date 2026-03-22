#!/usr/bin/env python3
"""
fetch_yahoo.py — Uses yfinance to fetch Yahoo Finance data.
Called from Node.js via child_process.
Args:
  mode: "history" | "latest"
  tickers: comma-separated list e.g. "CL=F,^VIX,^MOVE,^SKEW"
  days: number of days back (for history mode)

Outputs JSON to stdout.
"""

import sys
import json
import yfinance as yf
from datetime import datetime, timedelta

def main():
    args = sys.argv[1:]
    if len(args) < 3:
        print(json.dumps({"error": "Usage: fetch_yahoo.py <mode> <tickers> <days>"}))
        sys.exit(1)

    mode = args[0]
    tickers = args[1].split(",")
    days = int(args[2])

    end_date = datetime.today()
    start_date = end_date - timedelta(days=days + 5)  # +5 buffer

    result = {}

    for ticker in tickers:
        ticker = ticker.strip()
        try:
            df = yf.download(
                ticker,
                start=start_date.strftime("%Y-%m-%d"),
                end=(end_date + timedelta(days=1)).strftime("%Y-%m-%d"),
                progress=False,
                auto_adjust=True,
            )
            if df.empty:
                result[ticker] = []
                continue

            # Flatten multi-level columns if present
            if hasattr(df.columns, 'levels'):
                df.columns = df.columns.get_level_values(0)

            rows = []
            for idx, row in df.iterrows():
                close_val = row.get("Close") if "Close" in row else None
                if close_val is None:
                    continue
                try:
                    close_float = float(close_val)
                except (TypeError, ValueError):
                    continue
                import math
                if math.isnan(close_float):
                    continue
                rows.append({
                    "date": idx.strftime("%Y-%m-%d"),
                    "close": round(close_float, 4)
                })
            result[ticker] = rows
        except Exception as e:
            result[ticker] = {"error": str(e)}

    print(json.dumps(result))

if __name__ == "__main__":
    main()
