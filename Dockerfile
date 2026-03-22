FROM nikolaik/python-nodejs:python3.11-nodejs20

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install -r requirements.txt --quiet

# Install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files
COPY dist/ ./dist/

# SQLite DB persisted in /app/data
RUN mkdir -p /app/data
ENV DATABASE_URL=file:/app/data/macro.db
ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
