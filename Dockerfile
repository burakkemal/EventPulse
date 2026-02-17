FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Start in dev mode (tsx watch for hot-reload)
CMD ["npm", "run", "dev"]
