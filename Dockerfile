FROM node:20-slim

# Install Python + pip for yfinance
RUN apt-get update && apt-get install -y python3 python3-pip --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Install Python dependencies
COPY requirements.txt ./
RUN pip3 install -r requirements.txt --break-system-packages --quiet

# Copy built files
COPY dist/ ./dist/

# SQLite DB will be stored in /app/data
RUN mkdir -p /app/data
ENV DATABASE_URL=file:/app/data/macro.db

EXPOSE 5000
ENV NODE_ENV=production

CMD ["node", "dist/index.cjs"]
