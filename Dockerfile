FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm install

# Copy all project files (tests, configs, source)
COPY . .

# Start in dev mode (tsx watch for hot-reload)
CMD ["npm", "run", "dev"]
